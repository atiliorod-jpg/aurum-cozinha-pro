// Auditoria do Supabase REAL contra o que o código espera.
//
// Roda em duas frentes:
//  1) ESTRUTURA (chave service_role): confere se todas as tabelas e todas as
//     RPCs que o código chama existem mesmo no banco.
//  2) ISOLAMENTO (chave anon, sem login): tenta ler/escrever tudo como um
//     visitante anônimo. Nada pode vazar. É o teste que importa de verdade —
//     ler o texto das policies não prova que elas estão ativas.
//
// Uso: node scripts/auditar-supabase.mjs
// Nada aqui escreve dado de produção (só um INSERT de teste que precisa FALHAR).

import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const URL_BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !ANON) { console.error('Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY em .env.local'); process.exit(1); }

// `feedback` estava de fora: não passava pelo teste de isolamento anônimo (o
// que importa — é texto que o cliente escreveu) e ainda aparecia na lista de
// "tabelas expostas que o código não usa", como se fosse resíduo.
const TABELAS = ['admin_notas', 'convites', 'documentos', 'feedback', 'perfis', 'registros', 'restaurantes', 'sessoes'];
const RPCS = [
  'aceitar_convite', 'alterar_cargo', 'ativar_assinatura', 'avisar_pagamento',
  'convite_valido', 'criar_restaurante', 'definir_bloqueio', 'definir_max_usuarios',
  'desativar_usuario', 'enviar_feedback', 'feedback_todos', 'limpar_aviso_pagamento',
  'marcar_feedback', 'notas_admin_todas', 'reativar_usuario', 'salvar_documento',
  'salvar_notas_admin', 'usuarios_do_restaurante',
];

const req = (caminho, chave, opts = {}) =>
  fetch(`${URL_BASE}${caminho}`, {
    ...opts,
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });

const problemas = [];
const ok = [];
const linha = (s) => console.log(s);

// ── 0) O banco está REALMENTE no ar? ────────────────────────────
// Sem isto a auditoria mente: com o servidor fora, TODA leitura falha e um
// teste ingênuo lê isso como "RLS bloqueou, tudo seguro". Servidor morto não
// é servidor seguro — 5xx tem que ser INCONCLUSIVO, nunca aprovação.
{
  const r = await req('/rest/v1/', ANON).catch(e => ({ status: 0, erro: e.message }));
  if (r.status === 0 || r.status >= 500) {
    console.error(`\n⛔ A API REST do Supabase não está respondendo (HTTP ${r.status || 'sem conexão'}).`);
    console.error('   521/522 = projeto ainda subindo depois do restore, ou fora do ar.');
    console.error('   Aguarde alguns minutos e rode de novo — auditar agora daria falso "tudo ok".\n');
    process.exit(2);
  }
}

// ── 1) ESTRUTURA ────────────────────────────────────────────────
linha('\n═══ 1. ESTRUTURA (o banco tem tudo que o código usa?) ═══\n');

const spec = await req('/rest/v1/', SERVICE || ANON).then(r => r.json()).catch(() => null);
const expostas = spec?.paths ? Object.keys(spec.paths).filter(p => p.startsWith('/') && p !== '/').map(p => p.slice(1)) : [];
const tabelasExpostas = new Set(expostas.filter(p => !p.startsWith('rpc/')));
const rpcsExpostas = new Set(expostas.filter(p => p.startsWith('rpc/')).map(p => p.slice(4)));

for (const t of TABELAS) {
  if (tabelasExpostas.has(t)) { ok.push(`tabela ${t}`); linha(`  ✅ tabela  ${t}`); }
  else { problemas.push(`TABELA AUSENTE: ${t}`); linha(`  ❌ tabela  ${t} — NÃO EXISTE no banco`); }
}
linha('');
for (const f of RPCS) {
  if (rpcsExpostas.has(f)) { ok.push(`rpc ${f}`); linha(`  ✅ rpc     ${f}`); }
  else { problemas.push(`RPC AUSENTE: ${f}`); linha(`  ❌ rpc     ${f} — NÃO EXISTE (migração não rodou?)`); }
}

const orfas = [...tabelasExpostas].filter(t => !TABELAS.includes(t));
if (orfas.length) linha(`\n  ℹ️  tabelas expostas que o código não usa: ${orfas.join(', ')}`);

// ── 2) ISOLAMENTO (anônimo não pode ver nada) ───────────────────
linha('\n═══ 2. ISOLAMENTO — visitante anônimo (sem login) ═══\n');

for (const t of TABELAS) {
  const r = await req(`/rest/v1/${t}?select=*&limit=5`, ANON);
  let corpo = null;
  try { corpo = await r.json(); } catch { /* sem corpo */ }
  const vazou = Array.isArray(corpo) && corpo.length > 0;
  if (vazou) {
    problemas.push(`VAZAMENTO: anônimo leu ${corpo.length} linha(s) de ${t}`);
    linha(`  🚨 ${t.padEnd(13)} VAZOU ${corpo.length} linha(s) — RLS aberto!`);
  } else if (r.status === 200) {
    linha(`  ✅ ${t.padEnd(13)} 200 mas 0 linhas (RLS filtrou)`);
  } else if (r.status === 401 || r.status === 403) {
    linha(`  ✅ ${t.padEnd(13)} ${r.status} negado (${corpo?.code || 'sem permissão'})`);
  } else if (r.status >= 500) {
    // servidor fora ≠ seguro: não pode contar como aprovação
    problemas.push(`INCONCLUSIVO: ${t} devolveu ${r.status} (servidor fora) — isolamento não foi testado`);
    linha(`  ⛔ ${t.padEnd(13)} ${r.status} servidor fora — NÃO TESTADO`);
  } else {
    linha(`  ✅ ${t.padEnd(13)} ${r.status} ${corpo?.code || corpo?.message?.slice(0, 40) || 'bloqueado'}`);
  }
}

// escrita anônima também precisa falhar
linha('');
const rIns = await req('/rest/v1/restaurantes', ANON, {
  method: 'POST', body: JSON.stringify({ nome: `__auditoria_${Date.now()}` }),
});
if (rIns.status < 300) {
  problemas.push('GRAVE: anônimo conseguiu INSERIR em restaurantes');
  linha(`  🚨 INSERT anônimo em restaurantes PASSOU (${rIns.status}) — precisa ser bloqueado`);
} else if (rIns.status >= 500) {
  problemas.push(`INCONCLUSIVO: INSERT anônimo devolveu ${rIns.status} (servidor fora)`);
  linha(`  ⛔ INSERT anônimo — servidor fora (${rIns.status}), NÃO TESTADO`);
} else {
  linha(`  ✅ INSERT anônimo em restaurantes bloqueado (${rIns.status})`);
}

// ── 2b) RPCs sensíveis: anônimo não pode executar nenhuma ───────
// A pergunta que importa: alguém sem login consegue se dar assinatura de
// graça, desbloquear conta, mudar cargo ou ler o feedback de todo mundo?
// Os IDs são UUID aleatório de propósito: se por azar alguma passar, ela não
// atinge nenhum restaurante real.
linha('\n═══ 2b. RPCs SENSÍVEIS — chamadas sem login ═══\n');

const uuidFake = '00000000-0000-4000-8000-0000000000ff';
const SENSIVEIS = [
  ['ativar_assinatura',     { p_restaurante: uuidFake, p_dias: 3650 }, 'dar assinatura grátis'],
  ['definir_bloqueio',      { p_restaurante: uuidFake, p_bloqueado: false }, 'desbloquear conta'],
  ['definir_max_usuarios',  { p_restaurante: uuidFake, p_max: 999 }, 'furar limite de usuários'],
  ['alterar_cargo',         { p_usuario: uuidFake, p_cargo: 'diretoria' }, 'autopromoção'],
  ['desativar_usuario',     { p_usuario: uuidFake }, 'derrubar usuário'],
  ['feedback_todos',        {}, 'ler feedback de todos os clientes'],
  ['notas_admin_todas',     {}, 'ler notas internas do admin'],
  ['usuarios_do_restaurante', { p_restaurante: uuidFake }, 'listar equipe alheia'],
  ['enviar_feedback',       { p_tipo: 'bug', p_dados: {} }, 'poluir a caixa de feedback'],
];

for (const [fn, args, oQueFaria] of SENSIVEIS) {
  const r = await req(`/rest/v1/rpc/${fn}`, ANON, { method: 'POST', body: JSON.stringify(args) });
  let corpo = null; try { corpo = await r.json(); } catch { /* sem corpo */ }
  // O que importa NÃO é o status: várias destas são SECURITY DEFINER que
  // filtram por dentro e devolvem 200 com lista VAZIA em vez de dar erro.
  // 200 + [] é seguro; o que reprova é voltar DADO.
  const devolveuDado = Array.isArray(corpo) ? corpo.length > 0 : (corpo != null && corpo !== false && typeof corpo !== 'string');
  if (r.status >= 500) {
    problemas.push(`INCONCLUSIVO: rpc ${fn} devolveu ${r.status} (servidor fora)`);
    linha(`  ⛔ ${fn.padEnd(24)} ${r.status} servidor fora — NÃO TESTADO`);
  } else if (r.status < 300 && devolveuDado) {
    problemas.push(`GRAVE: rpc ${fn} VAZOU dado sem login (permitiria: ${oQueFaria})`);
    linha(`  🚨 ${fn.padEnd(24)} VAZOU DADO SEM LOGIN — ${oQueFaria}`);
  } else if (r.status < 300) {
    linha(`  ✅ ${fn.padEnd(24)} 200 mas vazio (filtrou por dentro)`);
  } else {
    linha(`  ✅ ${fn.padEnd(24)} ${r.status} negado (${(corpo?.message || corpo?.hint || '').slice(0, 45)})`);
  }
}

// ── 3) Cadastro anônimo no Auth (pendência da auditoria de 25/06) ──
linha('\n═══ 3. AUTH — cadastro anônimo ═══\n');
const rAnon = await req('/auth/v1/signup', ANON, { method: 'POST', body: JSON.stringify({}) });
const corpoAnon = await rAnon.json().catch(() => ({}));
const msg = (corpoAnon.msg || corpoAnon.message || corpoAnon.error_description || '').toLowerCase();
if (rAnon.status < 300 && corpoAnon.access_token) {
  problemas.push('Signup ANÔNIMO está LIGADO (cria sessão sem e-mail)');
  linha('  ⚠️  signup anônimo LIGADO — desligue em Auth → Providers → Anonymous');
} else if (/anonymous.*disabled|disabled.*anonymous/.test(msg)) {
  linha('  ✅ signup anônimo desligado');
} else {
  linha(`  ✅ signup sem e-mail rejeitado (${rAnon.status}: ${(corpoAnon.msg || corpoAnon.message || '').slice(0, 60)})`);
}

// ── veredito ────────────────────────────────────────────────────
linha('\n═══ VEREDITO ═══\n');
if (!problemas.length) {
  linha(`  ✅ ${ok.length} itens conferidos, nenhum problema encontrado.\n`);
} else {
  linha(`  ❌ ${problemas.length} problema(s):`);
  problemas.forEach(p => linha(`     • ${p}`));
  linha('');
  process.exitCode = 1;
}
