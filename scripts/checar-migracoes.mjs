// Diz se as migrações 17 e 18 estão REALMENTE no banco — perguntando ao banco,
// não lendo os arquivos .sql. A lição da sessão de 05/08 foi essa: uma migração
// pode "rodar" sem fechar nada, e auditoria que só lê .sql não é confiável.
//
// Uso: node scripts/checar-migracoes.mjs
// Não grava nada: as duas sondas de INSERT precisam FALHAR, e é o CÓDIGO do
// erro que responde a pergunta (23514 = o constraint recusou o tipo;
// 23503 = o tipo passou e quem recusou foi a chave estrangeira falsa).

import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const URL_BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !ANON || !SERVICE) {
  console.error('Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY em .env.local');
  process.exit(1);
}

const req = (caminho, chave, opts = {}) =>
  fetch(`${URL_BASE}${caminho}`, {
    ...opts,
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });

// UUID que não existe: garante que a FK recuse DEPOIS do check de tipo.
const RID_INEXISTENTE = '00000000-0000-0000-0000-0000000000ff';

async function tipoAceito(tipo) {
  const r = await req('/rest/v1/registros', SERVICE, {
    method: 'POST',
    body: JSON.stringify({
      id: `sonda-${tipo.replace(/\W/g, '')}`, restaurante_id: RID_INEXISTENTE,
      tipo, ts: 1, dados: {}, deleted: false,
    }),
  });
  let j = {}; try { j = JSON.parse(await r.text()); } catch { /* corpo vazio */ }
  if (j.code === '23503') return { ok: true };                       // FK barrou = tipo passou
  if (j.code === '23514') return { ok: false, motivo: 'constraint recusou o tipo' };
  return { ok: null, motivo: `${r.status} ${j.code || ''} ${(j.message || '').slice(0, 90)}` };
}

let falhou = false;
const linha = (rotulo, ok, extra = '') => {
  if (ok === false) falhou = true;
  console.log(`  ${ok === true ? '✅' : ok === false ? '❌' : '⚠️ '} ${rotulo}${extra ? ' — ' + extra : ''}`);
};

console.log('\n═══ MIGRAÇÃO 17 — registros.tipo aceita o prefixo do módulo ═══\n');
for (const tipo of ['entrada', 'seco:entrada', 'seco:ajuste', 'finalizacao:perda']) {
  const r = await tipoAceito(tipo);
  linha(tipo, r.ok, r.motivo);
}

console.log('\n\u2550\u2550\u2550 MIGRA\u00c7\u00c3O 22 \u2014 v\u00e1rios estoques do mesmo tipo (inst\u00e2ncias) \u2550\u2550\u2550\n');
for (const tipo of ['seco#zzzz:entrada', 'finalizacao#ab12:perda', 'producao#qq99:saida']) {
  const r = await tipoAceito(tipo);
  linha(tipo, r.ok, r.motivo);
}
// Sonda NEGATIVA: duas grafias para o mesmo estoque \u00e9 como saldo duplicado
// nasce \u2014 metade dos lan\u00e7amentos numa, metade na outra, e nenhuma tela somando
// as duas. O CHECK tem que RECUSAR.
{
  const r = await tipoAceito('producao:entrada');
  const deveRecusar = r.ok === false;
  linha('producao:entrada e RECUSADO (grafia duplicada)', deveRecusar,
        deveRecusar ? '' : 'ACEITOU \u2014 duplicaria saldo');
}

console.log('\n═══ MIGRAÇÃO 18 — a trilha de auditoria é gravada pelo banco ═══\n');
const rpc = await req('/rest/v1/rpc/registrar_auditoria', ANON, { method: 'POST', body: JSON.stringify({ p_acao: 'sonda' }) });
let jr = {}; try { jr = JSON.parse(await rpc.text()); } catch { /* void devolve corpo vazio */ }
const existe = !(rpc.status === 404 || jr.code === 'PGRST202');
linha('registrar_auditoria existe', existe, existe ? '' : 'a migração 18 não rodou');

console.log('\n═══ VEREDITO ═══\n');
if (falhou) {
  console.log('  ❌ Falta rodar migração no SQL Editor do Supabase (a 17 ANTES da 18).');
  console.log('     src/lib/migration17_modulos.sql  →  src/lib/migration18_autorizacao.sql');
  console.log('\n  Sem a 17, Estoque Seco e Finalização gravam no tablet e NADA sobe:');
  console.log('  o app mostra sucesso e o item fica preso na fila offline.');
  console.log('  Sem a 18, funcionário desativado continua entrando, cozinheiro se');
  console.log('  promove sozinho e a trilha de auditoria é forjável.\n');
  process.exit(1);
}
console.log('  ✅ As duas migrações estão no banco.');
console.log('     Valide de verdade agora: node scripts/e2e-restaurante-real.mjs');
console.log('     e SEMPRE depois:         node scripts/pentest-limpar.mjs\n');
