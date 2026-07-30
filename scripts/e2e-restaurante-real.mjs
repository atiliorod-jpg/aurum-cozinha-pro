/**
 * E2E "restaurante de verdade": cria uma conta nova e OPERA a cozinha por
 * completo contra o Supabase de produção — cadastro, produtos, entrada,
 * produção, saída, perda, contagem — e confere se os números que o app calcula
 * batem com o que realmente deveria dar.
 *
 * Também testa o que um cliente NÃO pode fazer (ver outro restaurante, se
 * autopromover, se dar assinatura grátis).
 *
 * Tudo com e-mail pentest.*@example.invalid e restaurante "Pentest ..." para o
 * scripts/pentest-limpar.mjs conseguir apagar depois.
 *
 *   node scripts/e2e-restaurante-real.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { calcEstoquePuro } from '../src/utils/estoque.js';
import { calcLotes } from '../src/utils/lotes.js';
import { statusAssinatura } from '../src/utils/assinatura.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue;
  const i = line.indexOf('='); if (i < 0) continue;
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
}

const URL_SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY;
const cliente = () => createClient(URL_SB, ANON, { auth: { persistSession: false } });

const ts = Date.now().toString(36);
const SENHA = `Pt!${ts}aZ9`;
let passou = 0; const falhas = [];

const ok = (nome, cond, detalhe = '') => {
  if (cond) { passou++; console.log(`  ✅ ${nome}${detalhe ? ` — ${detalhe}` : ''}`); }
  else { falhas.push(nome); console.log(`  ❌ ${nome}${detalhe ? ` — ${detalhe}` : ''}`); }
};
const titulo = (s) => console.log(`\n═══ ${s} ═══\n`);

// cria conta + restaurante pela MESMA rota que o app usa (signUp + RPC)
async function novoRestaurante(sufixo, nomeRest) {
  const sb = cliente();
  const email = `pentest.${sufixo}.${ts}@example.invalid`;
  const { data, error } = await sb.auth.signUp({ email, password: SENHA });
  if (error) throw new Error(`signUp ${sufixo}: ${error.message}`);
  const { error: eRpc } = await sb.rpc('criar_restaurante', {
    p_nome_restaurante: nomeRest, p_nome_admin: `Chefe ${sufixo.toUpperCase()}`,
  });
  if (eRpc) throw new Error(`criar_restaurante ${sufixo}: ${eRpc.message}`);
  const { data: perfil } = await sb.from('perfis').select('*').eq('id', data.user.id).maybeSingle();
  return { sb, email, userId: data.user.id, rid: perfil?.restaurante_id, perfil };
}

const gravarRegistro = (sb, rid, tipo, dados) =>
  sb.from('registros').insert({ id: `${tipo}_${Math.random().toString(36).slice(2, 10)}`, restaurante_id: rid, tipo, ts: Date.now(), dados });

// ════════════════════════════════════════════════════════════════
titulo('1. CADASTRO — abrir a conta do restaurante');

const A = await novoRestaurante('a', `Pentest Cozinha A ${ts}`);
ok('signUp + criar_restaurante criou o restaurante', !!A.rid, `rid ${A.rid?.slice(0, 8)}…`);
ok('primeiro usuário vira diretoria', A.perfil?.cargo === 'diretoria', `cargo: ${A.perfil?.cargo}`);
ok('usuário nasce ativo', A.perfil?.ativo !== false);

const { data: restA } = await A.sb.from('restaurantes').select('*').eq('id', A.rid).maybeSingle();
ok('restaurante criado sem assinatura (entra no teste grátis)', !restA?.assinatura_ate);
ok('restaurante nasce desbloqueado', !restA?.bloqueado);
ok('limite padrão de 3 usuários', (restA?.max_usuarios ?? 3) === 3, `max_usuarios: ${restA?.max_usuarios}`);

const plano = statusAssinatura({
  restauranteId: A.rid, restauranteCriadoEm: restA?.created_at, assinaturaAte: restA?.assinatura_ate, bloqueado: restA?.bloqueado,
});
ok('conta nova cai em "teste" com 7 dias', plano.tipo === 'teste' && plano.diasRestantes === 7, `${plano.tipo}, ${plano.diasRestantes}d`);

// ════════════════════════════════════════════════════════════════
titulo('2. CADASTRO DE PRODUTOS (catálogo em documentos)');

const PRODUTOS = [
  { id: 'picanha',  nome: 'Picanha (porção)', unidade: 'unid', categoria: 'PROTEÍNAS', ativo: true, estoqueInicial: 0, min: 20, max: 60, valCongelado: 90, valResfriado: 3 },
  { id: 'frango',   nome: 'Filé de Frango',   unidade: 'unid', categoria: 'PROTEÍNAS', ativo: true, estoqueInicial: 0, min: 20, max: 50, valCongelado: 90, valResfriado: 3 },
  { id: 'molho',    nome: 'Molho da Casa',    unidade: 'L',    categoria: 'PRODUZIDOS', ativo: true, estoqueInicial: 0, min: 5,  max: 15, valCongelado: 30, valResfriado: 5 },
];
const { error: eDoc } = await A.sb.rpc('salvar_documento', {
  p_restaurante: A.rid, p_chave: 'produtos', p_dados: PRODUTOS, p_versao: 0,
});
ok('salvar_documento gravou o catálogo', !eDoc, eDoc?.message || `${PRODUTOS.length} produtos`);

const { data: docLido } = await A.sb.from('documentos').select('dados, versao').eq('restaurante_id', A.rid).eq('chave', 'produtos').maybeSingle();
ok('catálogo volta igual ao que foi gravado', docLido?.dados?.length === 3);
ok('controle de versão começou em 1', docLido?.versao === 1, `versao: ${docLido?.versao}`);

// conflito de versão: gravar com versão velha tem que ser rejeitado
const { error: eConf } = await A.sb.rpc('salvar_documento', { p_restaurante: A.rid, p_chave: 'produtos', p_dados: [], p_versao: 0 });
const { data: aposConf } = await A.sb.from('documentos').select('dados, versao').eq('restaurante_id', A.rid).eq('chave', 'produtos').maybeSingle();
ok('gravação com versão desatualizada não apaga o catálogo', aposConf?.dados?.length === 3, eConf ? `rejeitou: ${eConf.message.slice(0, 40)}` : `versao agora ${aposConf?.versao}`);

// ════════════════════════════════════════════════════════════════
titulo('3. OPERAÇÃO DO TURNO — entrada, produção, saída, perda');

const hoje = new Date().toISOString().slice(0, 10);
const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// entrada: 40 picanhas (val 20 dias) + 30 frangos
await gravarRegistro(A.sb, A.rid, 'entrada', {
  data: hoje, hora: '08:00', responsavel: 'Chefe A', armazenamento: 'congelado',
  itens: [
    { produtoId: 'picanha', quantidade: 40, validade: d(20) },
    { produtoId: 'frango', quantidade: 30, validade: d(20) },
  ],
});
// segunda entrada de picanha, validade mais CURTA (tem que sair primeiro no FEFO)
await gravarRegistro(A.sb, A.rid, 'entrada', {
  data: hoje, hora: '09:00', responsavel: 'Chefe A', armazenamento: 'congelado',
  itens: [{ produtoId: 'picanha', quantidade: 10, validade: d(5) }],
});
// produção: 12 L de molho
await gravarRegistro(A.sb, A.rid, 'entrada', {
  data: hoje, hora: '10:00', responsavel: 'Chefe A', producaoId: `prod_${ts}`,
  itens: [{ produtoId: 'molho', quantidade: 12, validade: d(30) }],
});
// saída: 15 picanhas para o salão
await gravarRegistro(A.sb, A.rid, 'saida', {
  data: hoje, hora: '12:00', responsavel: 'Chefe A', destino: 'Salão',
  itens: [{ produtoId: 'picanha', quantidade: 15 }],
});
// perda: 2 frangos estragados (origem estoque → abate)
await gravarRegistro(A.sb, A.rid, 'perda', {
  data: hoje, hora: '13:00', origem: 'estoque', produtoId: 'frango', quantidade: 2, motivo: 'V', item: 'Filé de Frango',
});
// apara: 1.5 de frango (NÃO pode abater estoque)
await gravarRegistro(A.sb, A.rid, 'apara', {
  data: hoje, hora: '13:10', origem: 'recebimento', produtoId: 'frango', quantidade: 1.5, destino: 'Escondidinho', item: 'Filé de Frango',
});

// relê do banco (fonte da verdade) e recalcula com a MESMA função do app
const { data: regs } = await A.sb.from('registros').select('*').eq('restaurante_id', A.rid).eq('deleted', false);
const por = (t) => (regs || []).filter(r => r.tipo === t).map(r => ({ ...r.dados, id: r.id, ts: r.ts }));

const estoque = calcEstoquePuro({
  produtos: PRODUTOS, entradas: por('entrada'), saidas: por('saida'),
  ajustes: por('ajuste'), desperdicio: por('perda'),
});
ok('todos os 6 registros do turno subiram', (regs || []).length === 6, `${(regs || []).length} registros`);
ok('picanha: 40 + 10 − 15 = 35', estoque.picanha === 35, `deu ${estoque.picanha}`);
ok('frango: 30 − 2 (perda) = 28, apara NÃO abate', estoque.frango === 28, `deu ${estoque.frango}`);
ok('molho produzido entrou: 12 L', estoque.molho === 12, `deu ${estoque.molho}`);

const lotes = calcLotes(por('entrada'), por('saida'), por('perda'), PRODUTOS);
const lotesPicanha = lotes.picanha || [];
ok('FEFO consumiu primeiro o lote que vence antes',
  lotesPicanha.length === 1 && lotesPicanha[0].validade === d(20),
  lotesPicanha.map(l => `${l.validade}:${l.restante}`).join(' | '));
ok('sobra da picanha confere com o estoque', (lotesPicanha[0]?.restante ?? 0) === 35, `lote tem ${lotesPicanha[0]?.restante}`);

// contagem física vira a nova base
await gravarRegistro(A.sb, A.rid, 'ajuste', { data: hoje, produtoId: 'picanha', quantidade: 31, responsavel: 'Chefe A' });
const { data: regs2 } = await A.sb.from('registros').select('*').eq('restaurante_id', A.rid).eq('deleted', false);
const por2 = (t) => (regs2 || []).filter(r => r.tipo === t).map(r => ({ ...r.dados, id: r.id, ts: r.ts }));
const estoque2 = calcEstoquePuro({ produtos: PRODUTOS, entradas: por2('entrada'), saidas: por2('saida'), ajustes: por2('ajuste'), desperdicio: por2('perda') });
ok('contagem física sobrepõe o calculado (35 → 31)', estoque2.picanha === 31, `deu ${estoque2.picanha}`);
ok('contagem de um produto não afeta os outros', estoque2.frango === 28 && estoque2.molho === 12);

// exclusão lógica
const alvo = (regs2 || []).find(r => r.tipo === 'saida');
await A.sb.from('registros').update({ deleted: true }).eq('id', alvo.id);
const { data: regs3 } = await A.sb.from('registros').select('id').eq('restaurante_id', A.rid).eq('deleted', false);
ok('remover registro é exclusão lógica (soft delete)', (regs3 || []).length === (regs2 || []).length - 1);

// ════════════════════════════════════════════════════════════════
titulo('4. EQUIPE — convite, cargo e limite de vagas');

const { data: convite, error: eConv } = await A.sb.from('convites').insert({ restaurante_id: A.rid, cargo: 'cozinha' }).select().single();
ok('diretoria consegue gerar convite', !eConv && !!convite?.token, eConv?.message);

const { data: valido } = await A.sb.rpc('convite_valido', { p_token: convite?.token });
ok('convite recém-criado é válido', valido === true);

// funcionário aceita o convite
const sbFunc = cliente();
const emailFunc = `pentest.func.${ts}@example.invalid`;
const { data: uFunc, error: eFunc } = await sbFunc.auth.signUp({ email: emailFunc, password: SENHA });
ok('funcionário criou login', !eFunc, eFunc?.message);
const { data: aceito, error: eAceite } = await sbFunc.rpc('aceitar_convite', { p_token: convite?.token, p_nome: 'Cozinheiro Teste' });
ok('aceitar_convite entrou no restaurante', aceito !== false && !eAceite, eAceite?.message);

const { data: perfilFunc } = await sbFunc.from('perfis').select('*').eq('id', uFunc?.user?.id).maybeSingle();
ok('funcionário caiu no restaurante certo', perfilFunc?.restaurante_id === A.rid);
ok('funcionário entrou com o cargo do convite (cozinha)', perfilFunc?.cargo === 'cozinha', `cargo: ${perfilFunc?.cargo}`);

const { data: reuso } = await sbFunc.rpc('convite_valido', { p_token: convite?.token });
ok('convite já usado não vale de novo', reuso === false);

// autopromoção precisa falhar
const { error: ePromo } = await sbFunc.rpc('alterar_cargo', { p_usuario: uFunc?.user?.id, p_cargo: 'diretoria' });
const { data: perfilPos } = await sbFunc.from('perfis').select('cargo').eq('id', uFunc?.user?.id).maybeSingle();
ok('cozinha NÃO consegue se autopromover a diretoria', perfilPos?.cargo === 'cozinha',
  ePromo ? `negado: ${ePromo.message.slice(0, 45)}` : `cargo ficou ${perfilPos?.cargo}`);

// cozinha não pode gerar convite
const { error: eConvFunc } = await sbFunc.from('convites').insert({ restaurante_id: A.rid, cargo: 'diretoria' });
ok('cozinha NÃO consegue gerar convite', !!eConvFunc, eConvFunc?.message?.slice(0, 45));

// ════════════════════════════════════════════════════════════════
titulo('5. ISOLAMENTO ENTRE RESTAURANTES (o teste que mais importa)');

const B = await novoRestaurante('b', `Pentest Cozinha B ${ts}`);
ok('segundo restaurante criado', !!B.rid && B.rid !== A.rid);

const { data: espiaReg } = await B.sb.from('registros').select('*').eq('restaurante_id', A.rid);
ok('B não lê os REGISTROS de A', (espiaReg || []).length === 0, `viu ${(espiaReg || []).length}`);

const { data: espiaDoc } = await B.sb.from('documentos').select('*').eq('restaurante_id', A.rid);
ok('B não lê o CATÁLOGO de A', (espiaDoc || []).length === 0, `viu ${(espiaDoc || []).length}`);

const { data: espiaPerf } = await B.sb.from('perfis').select('*').eq('restaurante_id', A.rid);
ok('B não lê a EQUIPE de A', (espiaPerf || []).length === 0, `viu ${(espiaPerf || []).length}`);

const { data: espiaConv } = await B.sb.from('convites').select('*').eq('restaurante_id', A.rid);
ok('B não lê os CONVITES de A', (espiaConv || []).length === 0, `viu ${(espiaConv || []).length}`);

const { data: espiaRest } = await B.sb.from('restaurantes').select('*').eq('id', A.rid);
ok('B não lê o cadastro do restaurante A', (espiaRest || []).length === 0, `viu ${(espiaRest || []).length}`);

// escrever no restaurante alheio
const { error: eEscrita } = await gravarRegistro(B.sb, A.rid, 'entrada', { data: hoje, itens: [{ produtoId: 'picanha', quantidade: 9999 }] });
ok('B não consegue GRAVAR registro no restaurante A', !!eEscrita, eEscrita?.message?.slice(0, 45));

const { error: eDocB } = await B.sb.rpc('salvar_documento', { p_restaurante: A.rid, p_chave: 'produtos', p_dados: [], p_versao: -1 });
const { data: docDepois } = await A.sb.from('documentos').select('dados').eq('restaurante_id', A.rid).eq('chave', 'produtos').maybeSingle();
ok('B não consegue APAGAR o catálogo de A via RPC', (docDepois?.dados || []).length === 3,
  eDocB ? `negado: ${eDocB.message.slice(0, 40)}` : 'catálogo intacto');

const { error: eDel } = await B.sb.from('registros').update({ deleted: true }).eq('restaurante_id', A.rid);
const { data: vivosA } = await A.sb.from('registros').select('id').eq('restaurante_id', A.rid).eq('deleted', false);
ok('B não consegue APAGAR registros de A', (vivosA || []).length > 0, eDel ? `negado` : `A ainda tem ${(vivosA || []).length}`);

const { data: usuariosAlheios } = await B.sb.rpc('usuarios_do_restaurante', { p_restaurante: A.rid });
ok('B não lista a equipe de A pela RPC', (usuariosAlheios || []).length === 0);

// ════════════════════════════════════════════════════════════════
titulo('6. COBRANÇA — cliente não pode se dar assinatura');

const { error: eAtiv } = await B.sb.rpc('ativar_assinatura', { p_restaurante: B.rid, p_dias: 365 });
const { data: restB } = await B.sb.from('restaurantes').select('assinatura_ate').eq('id', B.rid).maybeSingle();
ok('cliente NÃO consegue ativar a própria assinatura', !restB?.assinatura_ate,
  eAtiv ? `negado: ${eAtiv.message.slice(0, 45)}` : `assinatura_ate: ${restB?.assinatura_ate}`);

const { error: eBloq } = await B.sb.rpc('definir_bloqueio', { p_restaurante: B.rid, p_bloqueado: false });
ok('cliente NÃO consegue mexer no próprio bloqueio', !!eBloq, eBloq?.message?.slice(0, 45));

const { error: eMax } = await B.sb.rpc('definir_max_usuarios', { p_restaurante: B.rid, p_max: 5 });
const { data: restB2 } = await B.sb.from('restaurantes').select('max_usuarios').eq('id', B.rid).maybeSingle();
ok('cliente NÃO consegue aumentar o próprio limite de usuários', (restB2?.max_usuarios ?? 3) === 3,
  eMax ? `negado: ${eMax.message.slice(0, 40)}` : `max: ${restB2?.max_usuarios}`);

const { error: eAviso1 } = await B.sb.rpc('avisar_pagamento', { p_plano: 'mensal', p_nome: 'Fulano Teste' });
ok('cliente consegue AVISAR que pagou', !eAviso1, eAviso1?.message?.slice(0, 45));
const { error: eAviso2 } = await B.sb.rpc('avisar_pagamento', { p_plano: 'mensal', p_nome: 'Fulano Teste' });
ok('segundo aviso seguido é barrado (rate limit da m16)', !!eAviso2, eAviso2?.message?.slice(0, 55));

const { error: eFb } = await B.sb.rpc('enviar_feedback', { p_tipo: 'bug', p_dados: { texto: 'teste automatizado de auditoria' }, p_contexto: 'e2e' });
ok('cliente consegue enviar feedback', !eFb, eFb?.message?.slice(0, 45));

const { data: fbTodos } = await B.sb.rpc('feedback_todos');
ok('cliente comum NÃO lê o feedback dos outros', (fbTodos || []).length === 0, `viu ${(fbTodos || []).length}`);

// ════════════════════════════════════════════════════════════════
titulo('7. SESSÃO ÚNICA');

const { error: eSess } = await A.sb.from('sessoes').upsert({ user_id: A.userId, token: `tok_${ts}`, updated_at: new Date().toISOString() });
ok('consegue registrar a própria sessão', !eSess, eSess?.message?.slice(0, 45));
const { error: eSessAlheia } = await B.sb.from('sessoes').upsert({ user_id: A.userId, token: 'invasor', updated_at: new Date().toISOString() });
const { data: sessA } = await A.sb.from('sessoes').select('token').eq('user_id', A.userId).maybeSingle();
ok('B não consegue derrubar a sessão de A', sessA?.token === `tok_${ts}`,
  eSessAlheia ? `negado: ${eSessAlheia.message.slice(0, 40)}` : `token: ${sessA?.token}`);

// ════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`RESULTADO: ${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) { console.log('\nFALHAS:'); falhas.forEach(f => console.log(`  • ${f}`)); process.exitCode = 1; }
console.log(`\nContas criadas (apagar com: node scripts/pentest-limpar.mjs):`);
console.log(`  ${A.email}\n  ${emailFunc}\n  ${B.email}`);
