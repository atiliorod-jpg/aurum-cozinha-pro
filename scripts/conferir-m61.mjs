// Confere a M61 SEM aplicá-la: o corpo da migração (sem begin/commit) e os
// testes rodam NUMA transação só, que termina em RAISE — tudo volta, inclusive
// a DDL. Etiquetas e lançamentos de teste têm ids 'tm61...'.
// Uso: node scripts/conferir-m61.mjs           (testa sem aplicar)
//      node scripts/conferir-m61.mjs --depois  (testa com a M61 já aplicada)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const env = Object.fromEntries(
  fs.readFileSync(`${RAIZ}/.env.local`, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const REF = env.VITE_SUPABASE_URL.replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, '');
const q = async (query) => (await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})).json());

const depois = process.argv.includes('--depois');
const corpo = depois ? '' : fs.readFileSync(`${RAIZ}/src/lib/migration61_embalagem_na_finalizacao.sql`, 'utf8')
  .replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');

const teste = `
do $$
declare
  u uuid; rid uuid; r jsonb; res text := ''; n int; t text; x text; v date := current_date + 4;
  agora bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  dsaida jsonb := jsonb_build_object('data', current_date::text, 'hora', '10:00', 'responsavel', 'Teste', 'destino', 'finalizacao',
                                     'itens', jsonb_build_array(jsonb_build_object('produtoId', 'OUTRO', 'quantidade', 1, 'validade', '2099-01-01')),
                                     'conferida', '{"falso":1}'::jsonb, 'vinculos', '[1]'::jsonb);
begin
  select p.id, p.restaurante_id into u, rid from perfis p join restaurantes rr on rr.id = p.restaurante_id
   where coalesce(restaurante_pode_escrever(rr.id), false) and not coalesce(rr.bloqueado, false)
     and p.id <> '318071c2-49c0-41d0-89aa-235f0672e1ad' limit 1;
  if u is null then raise exception 'sem conta liberada para o teste'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  insert into etiquetas (restaurante_id, id, cozinha, produto_id, nome, impresso_em, validade, status, dados) values
    (rid, 'tm61a', 'producao', 'prod_teste', 'Teste A', current_date, v, 'valida', '{"copias":3,"medida":"1 kg"}'),
    (rid, 'tm61b', 'producao', 'prod_teste', 'Teste B', current_date, v, 'valida', '{"copias":2,"medida":"1 kg"}'),
    (rid, 'tm61c', 'producao', 'prod_teste', 'Teste C', current_date, v, 'valida', '{"copias":1}'),
    (rid, 'tm61s', 'seco', 'prod_teste', 'Teste Seco', current_date, v, 'valida', '{"copias":1}');
  -- liga a conferência da Finalização raiz (só dentro deste teste)
  insert into documentos (restaurante_id, chave, dados)
  values (rid, 'estoques', jsonb_build_object('receberPeloQR', jsonb_build_object('finalizacao', jsonb_build_object('desde', agora))))
  on conflict (restaurante_id, chave) do update
    set dados = coalesce(documentos.dados, '{}'::jsonb) || jsonb_build_object('receberPeloQR', jsonb_build_object('finalizacao', jsonb_build_object('desde', agora)));

  -- 1) a Produção dá saída de 1 pelo QR para a Finalização: o livro guarda o destino; o lançamento leva potes e nome
  r := baixar_etiqueta('bx_tm61_01', 'tm61a', 'saida', 1, 'tm61reg01', dsaida, agora - 1000);
  select dados->>'potes' || '|' || (dados->'etiqueta'->>'nome') || '|' || coalesce(dados->>'conferida', 'sem') || '|' || coalesce(dados->>'vinculos', 'sem')
    into x from registros where id = 'tm61reg01';
  res := res || E'\\n 1 saida=' || (r->>'ok') || ' dados=' || x
             || ' posse=' || _posse_no_destino(rid, 'tm61a', 'finalizacao');

  -- 2) a Finalização lê: confere a remessa
  r := receber_etiqueta('bx_tm61_02', 'tm61a', 'finalizacao', 1, null, jsonb_build_object('responsavel', 'Fin'), null);
  select coalesce(dados->'conferida'->'prod_teste'->>'por', 'NAO') into x from registros where id = 'tm61reg01';
  res := res || E'\\n 2 caso=' || (r->>'caso') || ' marca_por=' || x
             || ' conferida_em=' || (select count(*) from etiqueta_baixas where id = 'bx_tm61_01' and conferida_em is not null);

  -- 3) lê de novo outra embalagem do mesmo código: a Produção não lançou → dá entrada (chave ligada)
  r := receber_etiqueta('bx_tm61_03', 'tm61a', 'finalizacao', 1, 'tm61reg03', jsonb_build_object('quantidade', 1, 'responsavel', 'Fin'), null);
  select tipo || '|' || (dados->>'destino') || '|' || (dados->>'recebidaPelaFinalizacao') into t from registros where id = 'tm61reg03';
  select baixadas into n from etiquetas where restaurante_id = rid and id = 'tm61a';
  res := res || E'\\n 3 caso=' || (r->>'caso') || ' reg=' || coalesce(t, 'NENHUM') || ' baixadas=' || n
             || ' posse=' || _posse_no_destino(rid, 'tm61a', 'finalizacao');

  -- 4) perda NA Finalização: lançamento da Finalização; o contador da Produção não mexe
  r := baixar_no_destino('bx_tm61_04', 'tm61a', 'finalizacao', 'perda', 1, 'tm61reg04',
        jsonb_build_object('data', current_date::text, 'quantidade', 1, 'motivo', 'V', 'produtoId', 'OUTRO'), null);
  select tipo || '|' || (dados->>'produtoId') || '|' || (dados->>'validade') into t from registros where id = 'tm61reg04';
  select baixadas into n from etiquetas where restaurante_id = rid and id = 'tm61a';
  res := res || E'\\n 4 perda=' || (r->>'ok') || ' reg=' || t || ' baixadas_prod=' || n || ' posse=' || _posse_no_destino(rid, 'tm61a', 'finalizacao');

  -- 5) mais do que está aqui
  r := baixar_no_destino('bx_tm61_05', 'tm61a', 'finalizacao', 'usada', 2, null, null, null);
  res := res || E'\\n 5 usada2=' || coalesce(r->>'motivo', 'ACEITOU');

  -- 6) desfazer a perda da Finalização: a embalagem volta a estar LÁ (a Produção não ganha nada)
  r := desfazer_baixa('bx_tm61_04');
  select baixadas into n from etiquetas where restaurante_id = rid and id = 'tm61a';
  res := res || E'\\n 6 desfez=' || (r->>'ok') || ' reg_apagado=' || (select deleted from registros where id = 'tm61reg04')
             || ' baixadas_prod=' || n || ' posse=' || _posse_no_destino(rid, 'tm61a', 'finalizacao');

  -- 7) a saída da Produção feita SEM INTERNET antes da entrada sobe agora: absorvida
  r := baixar_etiqueta('bx_tm61_07', 'tm61a', 'saida', 1, 'tm61reg07', dsaida, agora - 3600000);
  select baixadas into n from etiquetas where restaurante_id = rid and id = 'tm61a';
  res := res || E'\\n 7 absorvidas=' || (r->>'absorvidas') || ' lancou=' || (r->>'lancou') || ' baixadas=' || n
             || ' reg=' || (select count(*) from registros where id = 'tm61reg07')
             || ' posse=' || _posse_no_destino(rid, 'tm61a', 'finalizacao');

  -- 8) usa as 2 na Finalização; a Produção não consegue mais desfazer a saída
  r := baixar_no_destino('bx_tm61_08', 'tm61a', 'finalizacao', 'usada', 2, null, null, null);
  select coalesce(dados->'usadas'->>'tm61a', 'NAO') into x from registros where id = 'tm61reg03';
  res := res || E'\\n 8 usada=' || (r->>'ok') || ' anotada_na_remessa=' || x;
  r := desfazer_baixa('bx_tm61_01');
  res := res || ' desfazer_saida=' || coalesce(r->>'motivo', 'DESFEZ');

  -- 9) saída lançada À MÃO (2 kg): as embalagens lidas se ligam a ela
  insert into registros (id, restaurante_id, tipo, ts, dados, deleted)
  values ('tm61man', rid, 'saida', agora, jsonb_build_object('data', current_date::text, 'destino', 'finalizacao',
          'itens', jsonb_build_array(jsonb_build_object('produtoId', 'prod_teste', 'quantidade', 2))), false);
  r := receber_etiqueta('bx_tm61_09', 'tm61b', 'finalizacao', 1, 'tm61reg09', jsonb_build_object('quantidade', 1), null);
  res := res || E'\\n 9 caso=' || (r->>'caso') || ' registro=' || coalesce(r->>'registro', '-');
  r := receber_etiqueta('bx_tm61_10', 'tm61b', 'finalizacao', 1, 'tm61reg10', jsonb_build_object('quantidade', 1), null);
  select jsonb_array_length(dados->'vinculos') into n from registros where id = 'tm61man';
  res := res || ' caso2=' || (r->>'caso') || ' vinculos=' || n || ' novos_regs=' || (select count(*) from registros where id in ('tm61reg09', 'tm61reg10'))
             || ' baixadas_b=' || (select baixadas from etiquetas where restaurante_id = rid and id = 'tm61b');
  r := receber_etiqueta('bx_tm61_11', 'tm61b', 'finalizacao', 1, 'tm61reg11', jsonb_build_object('quantidade', 1), null);
  res := res || ' terceira=' || coalesce(r->>'motivo', r->>'caso');

  -- 10) apagar a saída à mão devolve as embalagens ligadas à Produção; restaurar NÃO religa
  update registros set deleted = true where id = 'tm61man';
  res := res || E'\\n 10 apagou baixadas_b=' || (select baixadas from etiquetas where restaurante_id = rid and id = 'tm61b');
  update registros set deleted = false where id = 'tm61man';
  res := res || ' restaurou baixadas_b=' || (select baixadas from etiquetas where restaurante_id = rid and id = 'tm61b')
             || ' vinculos=' || coalesce((select dados->>'vinculos' from registros where id = 'tm61man'), 'sumiram');

  -- 11) "não chegou" anotado na remessa
  r := conferir_remessa('tm61man', 'prod_teste', 'nao_chegou', 'Fin');
  res := res || E'\\n 11 nao_chegou=' || coalesce((select dados->'conferida'->'prod_teste'->>'nao' from registros where id = 'tm61man'), 'NAO');

  -- 12) chave desligada: a Finalização não dá entrada
  update documentos set dados = dados - 'receberPeloQR' where restaurante_id = rid and chave = 'estoques';
  r := receber_etiqueta('bx_tm61_12', 'tm61c', 'finalizacao', 1, 'tm61reg12', jsonb_build_object('quantidade', 1), null);
  res := res || E'\\n 12 desligada=' || coalesce(r->>'motivo', 'ACEITOU');
  -- etiqueta do Seco não vai para a Finalização
  r := receber_etiqueta('bx_tm61_13', 'tm61s', 'finalizacao', 1, null, null, null);
  res := res || ' seco=' || coalesce(r->>'motivo', 'ACEITOU');

  -- 13) desfazer a conferência da remessa 1: volta para "a conferir"
  r := desfazer_baixa('bx_tm61_02');
  res := res || E'\\n 13 desfez_conf=' || (r->>'ok')
             || ' marca=' || coalesce((select dados->'conferida'->>'prod_teste' from registros where id = 'tm61reg01'), 'apagada')
             || ' conferida_em=' || (select count(*) from etiqueta_baixas where id = 'bx_tm61_01' and conferida_em is not null);

  -- 14) desfazer o que ainda não chegou ao banco: fica a marca; a baixa atrasada vira "repetida"
  r := desfazer_baixa('bx_tm61_14');
  r := baixar_etiqueta('bx_tm61_14', 'tm61c', 'usada', 1, null, null, null);
  res := res || E'\\n 14 atrasada=' || coalesce(r->>'repetida', 'APLICOU')
             || ' baixadas_c=' || (select baixadas from etiquetas where restaurante_id = rid and id = 'tm61c');

  -- 15) o cliente não consegue forjar conferência/vínculo pelo p_dados da saída
  select coalesce((dados->'conferida') ? 'falso', false)::text || '|' || (dados ? 'vinculos')::text into x from registros where id = 'tm61reg01';
  res := res || E'\n 15 forjado(conferida|vinculos)=' || x;

  -- 16) cozinha fora do padrão é recusada
  begin
    perform receber_etiqueta('bx_tm61_16', 'tm61a', 'seco', 1, null, null, null);
    res := res || ' cozinha_ruim=ACEITOU';
  exception when others then res := res || E'\\n 16 cozinha_ruim=recusada'; end;

  raise exception 'DESFEITO:%', res;
end $$;`;

const r = await q(corpo + '\n' + teste);
console.log(r.message || JSON.stringify(r));
console.log('sobrou alguma tm61?', JSON.stringify(await q("select (select count(*) from etiquetas where id like 'tm61%') as etq, (select count(*) from registros where id like 'tm61%') as regs, (select count(*) from etiqueta_baixas where id like 'bx_tm61%') as baixas")));
