-- =====================================================================
--  M61 — A EMBALAGEM NA FINALIZAÇÃO (2ª etapa da baixa pela etiqueta,
--  01/10/2026, decisões do dono)
--
--  • POSSE: a embalagem que a Produção mandou para uma Finalização passa a
--    ser DELA. Perda e Usado lidos lá descontam do estoque da Finalização,
--    com a validade da embalagem. Antes a leitura mandava "abrir a
--    Produção" — e a perda caía no estoque errado.
--  • RECEBER (só onde o dono ligou a conferência daquela Finalização): a
--    Finalização lê a embalagem e o BANCO decide, com a etiqueta travada:
--      1) veio pelo QR e não foi conferida → confere;
--      2) a Produção lançou à mão → liga a embalagem a essa saída;
--      3) a Produção não lançou → dá entrada (a saída Produção → aqui).
--    O aparelho nunca decide sozinho "crie uma saída": com a lista velha ou
--    sem internet ele escolheria errado e a mesma embalagem sairia duas vezes.
--  • CONFERÊNCIA DA REMESSA: "chegou" / "não chegou" fica anotado na própria
--    saída (dados.conferida), que já viaja para os aparelhos.
--  • SAÍDA ATRASADA ABSORVIDA: a saída pelo QR feita SEM INTERNET na Produção,
--    que só sobe depois de a Finalização ter dado entrada da mesma embalagem,
--    não conta de novo.
--
--  ⚠️ `baixar_etiqueta` e `desfazer_baixa` MANTÊM A ASSINATURA: create or
--  replace com parâmetro novo cria OUTRA função, e o PostgREST passaria a
--  responder "função ambígua" aos aparelhos — inclusive aos que ainda estão
--  com a versão antiga do app. O lado da Finalização ganhou funções próprias.
--
--  ⚠️ O GATILHO DE `registros` acha a baixa pelo LIVRO (`registro_id`), não
--  mais por `dados.baixaId`, que o aparelho consegue escrever.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) O livro das baixas ganha o lado da Finalização
-- ---------------------------------------------------------------------
alter table etiqueta_baixas add column if not exists cozinha         text;    -- onde aconteceu (null = na cozinha dona da etiqueta)
alter table etiqueta_baixas add column if not exists destino         text;    -- saída/entrada/vínculo: a Finalização que recebeu
alter table etiqueta_baixas add column if not exists saida_vinculada text;    -- vínculo: a saída lançada à mão
alter table etiqueta_baixas add column if not exists remessa_id      text;    -- usada na Finalização: a remessa onde ficou anotado
alter table etiqueta_baixas add column if not exists quantidade      numeric;
alter table etiqueta_baixas add column if not exists conferida_em    timestamptz;
alter table etiqueta_baixas add column if not exists absorvida       boolean not null default false;
alter table etiqueta_baixas add column if not exists absorvidas      integer not null default 0;
alter table etiqueta_baixas add column if not exists detalhe         jsonb;

alter table etiqueta_baixas drop constraint if exists etiqueta_baixas_acao_check;
alter table etiqueta_baixas add constraint etiqueta_baixas_acao_check
  check (acao in ('saida', 'perda', 'usada', 'entrada', 'vinculo', 'conferida'));
alter table etiqueta_baixas drop constraint if exists etiqueta_baixas_absorvidas_check;
alter table etiqueta_baixas add constraint etiqueta_baixas_absorvidas_check check (absorvidas between 0 and potes);

create index if not exists etiqueta_baixas_destino on etiqueta_baixas (restaurante_id, etiqueta_id, destino) where desfeita_em is null;
create index if not exists etiqueta_baixas_vinculada on etiqueta_baixas (saida_vinculada) where saida_vinculada is not null;
create index if not exists etiqueta_baixas_remessa on etiqueta_baixas (remessa_id) where remessa_id is not null;

-- ---------------------------------------------------------------------
-- 2) Ajudantes
-- ---------------------------------------------------------------------
-- Quantas embalagens desta etiqueta estão NA Finalização agora.
create or replace function _posse_no_destino(p_rid uuid, p_etiqueta text, p_cozinha text)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0,
      coalesce((select sum(potes) from etiqueta_baixas
                 where restaurante_id = p_rid and etiqueta_id = p_etiqueta and destino = p_cozinha
                   and desfeita_em is null and not absorvida and acao in ('saida', 'entrada', 'vinculo')), 0)
    - coalesce((select sum(potes) from etiqueta_baixas
                 where restaurante_id = p_rid and etiqueta_id = p_etiqueta and cozinha = p_cozinha
                   and desfeita_em is null and acao in ('perda', 'usada')), 0))::integer;
$$;
revoke all on function _posse_no_destino(uuid, text, text) from public, anon, authenticated;

-- O tipo do lançamento numa cozinha ('producao' é a única sem prefixo).
create or replace function _tipo_da_cozinha(p_cozinha text, p_base text)
returns text language sql immutable set search_path = public as $$
  select case when p_cozinha = 'producao' then p_base else p_cozinha || ':' || p_base end;
$$;
revoke all on function _tipo_da_cozinha(text, text) from public, anon, authenticated;

-- "Chegou" / "não chegou" anotado na remessa, por item. Marca nula = apaga.
create or replace function _marcar_conferida(p_rid uuid, p_registro text, p_produto text, p_marca jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_registro is null or coalesce(p_produto, '') = '' then return; end if;
  if p_marca is null then
    update registros set dados = jsonb_set(dados, '{conferida}', coalesce(dados->'conferida', '{}'::jsonb) - p_produto)
     where id = p_registro and restaurante_id = p_rid;
  else
    update registros set dados = jsonb_set(dados, '{conferida}',
                                           coalesce(dados->'conferida', '{}'::jsonb) || jsonb_build_object(p_produto, p_marca))
     where id = p_registro and restaurante_id = p_rid;
  end if;
end $$;
revoke all on function _marcar_conferida(uuid, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) A BAIXA da cozinha dona (mesma assinatura da M59)
--    Novidades: a saída para uma Finalização guarda o DESTINO no livro (é a
--    posse de lá), leva `potes` e o nome/medida da etiqueta no lançamento, e
--    absorve a entrada que a Finalização já tinha dado da mesma embalagem.
-- ---------------------------------------------------------------------
create or replace function baixar_etiqueta(p_baixa text, p_etiqueta text, p_acao text, p_potes integer,
                                           p_registro_id text default null, p_dados jsonb default null,
                                           p_ts bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rid      uuid := meu_restaurante_id();
  e        etiquetas%rowtype;
  b        etiqueta_baixas%rowtype;
  r        record;
  copias   integer;
  base     text;
  tipo_reg text;
  qtd      numeric;
  qtd_txt  text;
  dados    jsonb;
  agora_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  ts_reg   bigint;
  novo_st  text;
  v_dest   text;
  para_fin boolean := false;
  n_abs    integer := 0;
  potes_ef integer;
  falta    integer;
  n        integer;
  abs_det  jsonb := '[]'::jsonb;
  repetida jsonb;
begin
  if rid is null then raise exception 'Sem restaurante.'; end if;
  if p_acao is null or p_acao not in ('saida', 'perda', 'usada') then raise exception 'Ação inválida.'; end if;
  if p_potes is null or p_potes < 1 or p_potes > 200 then raise exception 'Quantidade de potes inválida.'; end if;
  if p_baixa is null or p_baixa !~ '^bx_[a-z0-9_]{6,40}$' then raise exception 'Baixa inválida.'; end if;
  if not _pode_gravar_etiqueta(rid, current_date - 3) then
    raise exception 'A conta não está liberada para alterações.';
  end if;

  -- ⚠️ REENVIO DA FILA: a mesma baixa não conta duas vezes
  select * into b from etiqueta_baixas where id = p_baixa;
  if found then
    if b.restaurante_id <> rid then raise exception 'Baixa inválida.'; end if;
    select * into e from etiquetas where restaurante_id = rid and id = b.etiqueta_id;
    return jsonb_build_object('ok', true, 'repetida', true, 'baixadas', coalesce(e.baixadas, 0),
                              'copias', _copias_da_etiqueta(e.dados), 'status', e.status);
  end if;

  select * into e from etiquetas
   where restaurante_id = rid and id = p_etiqueta and apagada_em is null
   for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;

  -- ⚠️ a mesma baixa chegando DUAS VEZES AO MESMO TEMPO: a segunda esperou a
  -- trava acima — confere de novo, senão ela daria "Lançamento repetido"
  -- (exceção) e o aparelho desfaria uma baixa que existe
  select * into b from etiqueta_baixas where id = p_baixa;
  if found then
    return jsonb_build_object('ok', true, 'repetida', true, 'baixadas', e.baixadas,
                              'copias', _copias_da_etiqueta(e.dados), 'status', e.status);
  end if;

  copias := _copias_da_etiqueta(e.dados);
  -- linha marcada à mão ANTES da M59 (sem contador): vale como toda baixada
  if e.status in ('consumida', 'descartada') and e.baixadas = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'ja_baixada', 'status', e.status, 'copias', copias, 'baixadas', copias);
  end if;

  if p_acao = 'saida' then
    v_dest := p_dados->>'destino';
    para_fin := e.cozinha ~ '^producao(#[a-z0-9]{4})?$' and coalesce(v_dest, '') ~ '^finalizacao(#[a-z0-9]{4})?$';
  end if;

  -- ⚠️ SAÍDA ATRASADA: feita sem internet ANTES de a Finalização dar entrada
  -- desta embalagem (a entrada é mais nova que a hora da saída). É a mesma
  -- embalagem: o que a entrada já contou não conta de novo.
  if para_fin then
    select coalesce(sum(potes - absorvidas), 0) into n_abs from etiqueta_baixas
     where restaurante_id = rid and etiqueta_id = e.id and destino = v_dest and acao = 'entrada'
       and desfeita_em is null and potes > absorvidas
       and criada_em > to_timestamp(coalesce(p_ts, agora_ms) / 1000.0);
    n_abs := least(p_potes, n_abs);
  end if;
  potes_ef := p_potes - n_abs;

  if potes_ef > 0 then
    if e.baixadas >= copias then
      return jsonb_build_object('ok', false, 'motivo', 'ja_baixada', 'status', e.status, 'copias', copias, 'baixadas', e.baixadas);
    end if;
    if potes_ef > copias - e.baixadas then
      return jsonb_build_object('ok', false, 'motivo', 'poucos_potes', 'restantes', copias - e.baixadas,
                                'copias', copias, 'baixadas', e.baixadas);
    end if;
  end if;

  if p_acao in ('saida', 'perda') and potes_ef > 0 then
    -- etiqueta avulsa (fora do estoque) não tem o que abater
    if e.produto_id is null or e.produto_id = '' then
      return jsonb_build_object('ok', false, 'motivo', 'avulsa');
    end if;
    if not coalesce(restaurante_pode_escrever(rid), false) then
      raise exception 'A conta não está liberada para alterações.';
    end if;
    if p_registro_id is null or p_registro_id !~ '^[a-z0-9_]{6,40}$' then raise exception 'Lançamento inválido.'; end if;
    if p_dados is null or jsonb_typeof(p_dados) <> 'object' or pg_column_size(p_dados) > 4096 then
      raise exception 'Lançamento inválido.';
    end if;
    qtd_txt := case when p_acao = 'saida' then p_dados->'itens'->0->>'quantidade' else p_dados->>'quantidade' end;
    if qtd_txt is null or qtd_txt !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' then raise exception 'Quantidade inválida.'; end if;
    qtd := qtd_txt::numeric;
    if qtd <= 0 then raise exception 'Quantidade inválida.'; end if;
    -- parte já absorvida: sai só o resto, na proporção
    if n_abs > 0 then qtd := round(qtd * potes_ef / p_potes, 3); end if;

    -- ⚠️ A COZINHA DO LANÇAMENTO É A DA ETIQUETA, não a aberta no aparelho
    base := case when p_acao = 'saida' then 'saida' else 'perda' end;
    tipo_reg := _tipo_da_cozinha(e.cozinha, base);

    if p_acao = 'saida' then
      if coalesce(length(v_dest), 0) not between 1 and 80 then raise exception 'Escolha o destino da saída.'; end if;
      dados := (p_dados - 'itens' - 'id' - 'ts' - 'potes' - 'etiqueta' - 'vinculos' - 'usadas' - 'conferida') || jsonb_build_object(
        'itens', jsonb_build_array(jsonb_build_object(
          'produtoId', e.produto_id, 'quantidade', qtd, 'validade', e.validade, 'etiquetaId', e.id, 'potes', potes_ef)),
        'etiquetaId', e.id, 'baixaId', p_baixa, 'potes', potes_ef,
        -- o nome e a medida viajam junto: a Finalização mostra a embalagem sem ler a etiqueta da Produção
        'etiqueta', jsonb_build_object('nome', e.nome, 'medida', e.dados->>'medida'));
    else
      dados := (p_dados - 'id' - 'ts') || jsonb_build_object(
        'origem', 'estoque', 'produtoId', e.produto_id, 'quantidade', qtd,
        'validade', e.validade, 'etiquetaId', e.id, 'baixaId', p_baixa, 'potes', potes_ef);
    end if;

    ts_reg := case when p_ts between agora_ms - 3 * 86400000 and agora_ms + 600000 then p_ts else agora_ms end;
    insert into registros (id, restaurante_id, tipo, ts, dados, deleted)
    values (p_registro_id, rid, tipo_reg, ts_reg, dados, false)
    on conflict (id) do nothing;
    if not found then raise exception 'Lançamento repetido.'; end if;
  end if;

  -- absorve, da entrada mais antiga para a mais nova
  if n_abs > 0 then
    falta := n_abs;
    for r in select id, potes, absorvidas from etiqueta_baixas
              where restaurante_id = rid and etiqueta_id = e.id and destino = v_dest and acao = 'entrada'
                and desfeita_em is null and potes > absorvidas
                and criada_em > to_timestamp(coalesce(p_ts, agora_ms) / 1000.0)
              order by criada_em, id
              for update
    loop
      exit when falta <= 0;
      n := least(falta, r.potes - r.absorvidas);
      update etiqueta_baixas set absorvidas = absorvidas + n where id = r.id;
      abs_det := abs_det || jsonb_build_array(jsonb_build_object('id', r.id, 'n', n));
      falta := falta - n;
    end loop;
  end if;

  insert into etiqueta_baixas (id, restaurante_id, etiqueta_id, acao, potes, registro_id, usuario_id, destino, absorvida, detalhe)
  values (p_baixa, rid, e.id, p_acao,
          case when potes_ef > 0 then potes_ef else p_potes end,
          case when p_acao = 'usada' or potes_ef = 0 then null else p_registro_id end,
          auth.uid(),
          case when para_fin then v_dest end,
          potes_ef = 0,
          case when n_abs > 0 then jsonb_build_object('absorveu', abs_det, 'absorvidas', n_abs) end);

  if potes_ef > 0 then
    novo_st := _status_pelas_baixas(e.baixadas + potes_ef, copias, p_acao, e.status);
    update etiquetas set baixadas = e.baixadas + potes_ef, status = novo_st
     where restaurante_id = rid and id = e.id;
  else
    novo_st := e.status;
  end if;

  return jsonb_build_object('ok', true, 'baixadas', e.baixadas + potes_ef, 'copias', copias, 'status', novo_st,
                            'absorvidas', n_abs, 'lancou', potes_ef > 0 and p_acao <> 'usada');
end $$;
revoke all on function baixar_etiqueta(text, text, text, integer, text, jsonb, bigint) from public, anon;
grant execute on function baixar_etiqueta(text, text, text, integer, text, jsonb, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Devolver uma baixa (desfazer, e o gatilho de `registros`)
--    ⚠️ Cada lado devolve para o SEU contador: o que foi baixado NA
--    Finalização nunca devolve embalagem para a Produção.
-- ---------------------------------------------------------------------
create or replace function _devolver_baixa(p_rid uuid, p_baixa text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  b    etiqueta_baixas%rowtype;
  e    etiquetas%rowtype;
  x    jsonb;
  n    integer;
  ndev integer;
  tem_etiqueta boolean;
begin
  select * into b from etiqueta_baixas where id = p_baixa and restaurante_id = p_rid for update;
  if not found or b.desfeita_em is not null then return false; end if;

  -- a conferência desfeita: a remessa volta para "a conferir"
  if b.acao = 'conferida' then
    update etiqueta_baixas set conferida_em = null
     where restaurante_id = p_rid and id in (select jsonb_array_elements_text(coalesce(b.detalhe->'linhas', '[]'::jsonb)));
    select * into e from etiquetas where restaurante_id = p_rid and id = b.etiqueta_id;
    for x in select * from jsonb_array_elements(coalesce(b.detalhe->'registros', '[]'::jsonb)) loop
      perform _marcar_conferida(p_rid, x #>> '{}', e.produto_id, null);
    end loop;
    update etiqueta_baixas set desfeita_em = now() where id = b.id;
    return true;
  end if;

  -- baixa FEITA NA FINALIZAÇÃO: a embalagem volta a estar lá
  if b.cozinha is not null then
    update etiqueta_baixas set desfeita_em = now() where id = b.id;
    if b.acao = 'usada' and b.remessa_id is not null then
      update registros
         set dados = jsonb_set(dados, '{usadas}', coalesce(dados->'usadas', '{}'::jsonb)
                     || jsonb_build_object(b.etiqueta_id, greatest(0, coalesce((dados->'usadas'->>b.etiqueta_id)::integer, 0) - b.potes)))
       where id = b.remessa_id and restaurante_id = p_rid;
    end if;
    return true;
  end if;

  -- baixa da cozinha DONA
  select * into e from etiquetas where restaurante_id = p_rid and id = b.etiqueta_id for update;
  tem_etiqueta := found;
  ndev := case when b.absorvida then 0 else b.potes end;
  -- ⚠️ o que já foi usado ou perdido na Finalização não volta para a Produção
  if b.destino is not null and not b.absorvida then
    ndev := least(b.potes, _posse_no_destino(p_rid, b.etiqueta_id, b.destino));
  end if;
  -- desfaz o que esta saída tinha absorvido das entradas da Finalização
  for x in select * from jsonb_array_elements(coalesce(b.detalhe->'absorveu', '[]'::jsonb)) loop
    update etiqueta_baixas set absorvidas = greatest(0, absorvidas - coalesce((x->>'n')::integer, 0))
     where id = x->>'id' and restaurante_id = p_rid;
  end loop;
  -- o vínculo some da saída lançada à mão
  if b.acao = 'vinculo' and b.saida_vinculada is not null then
    update registros
       set dados = jsonb_set(dados, '{vinculos}', coalesce((
             select jsonb_agg(v) from jsonb_array_elements(coalesce(dados->'vinculos', '[]'::jsonb)) v
              where v->>'baixaId' is distinct from b.id), '[]'::jsonb))
     where id = b.saida_vinculada and restaurante_id = p_rid;
  end if;
  update etiqueta_baixas set desfeita_em = now() where id = b.id;
  if tem_etiqueta and ndev > 0 then
    n := greatest(0, coalesce(e.baixadas, 0) - ndev);
    update etiquetas set baixadas = n,
           status = _status_pelas_baixas(n, _copias_da_etiqueta(e.dados), b.acao, e.status)
     where restaurante_id = p_rid and id = e.id;
  end if;
  return true;
end $$;
revoke all on function _devolver_baixa(uuid, text) from public, anon, authenticated;

create or replace function desfazer_baixa(p_baixa text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rid uuid := meu_restaurante_id();
  b   etiqueta_baixas%rowtype;
begin
  if rid is null then raise exception 'Sem restaurante.'; end if;
  if p_baixa is null or p_baixa !~ '^bx_[a-z0-9_]{6,40}$' then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;
  select * into b from etiqueta_baixas where id = p_baixa and restaurante_id = rid;
  if not found then
    if exists (select 1 from etiqueta_baixas where id = p_baixa) then
      return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
    end if;
    -- ⚠️ AINDA NÃO CHEGOU (subiu pela fila depois, ou a internet caiu depois
    -- de gravar): fica a marca de DESFEITA com este id. Quando a baixa chegar,
    -- cai em "repetida" e não aplica nada.
    insert into etiqueta_baixas (id, restaurante_id, etiqueta_id, acao, potes, usuario_id, desfeita_em)
    values (p_baixa, rid, '', 'usada', 1, auth.uid(), now())
    on conflict (id) do nothing;
    return jsonb_build_object('ok', true, 'marcada', true);
  end if;
  if b.desfeita_em is not null then return jsonb_build_object('ok', true, 'repetida', true); end if;
  -- desfazer é para o engano da hora; depois disso, corrige-se pelo Histórico
  if b.criada_em < now() - interval '1 day' then
    return jsonb_build_object('ok', false, 'motivo', 'antiga');
  end if;
  -- ⚠️ a Produção não desfaz a saída de uma embalagem que a Finalização já usou
  if b.acao in ('saida', 'entrada', 'vinculo') and b.destino is not null and not b.absorvida
     and _posse_no_destino(rid, b.etiqueta_id, b.destino) < b.potes then
    return jsonb_build_object('ok', false, 'motivo', 'usada_no_destino');
  end if;
  if b.registro_id is not null and b.acao in ('saida', 'perda', 'entrada') then
    -- o gatilho de `registros` devolve
    update registros set deleted = true where id = b.registro_id and restaurante_id = rid and not deleted;
    if not found then perform _devolver_baixa(rid, b.id); end if;
  else
    perform _devolver_baixa(rid, b.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function desfazer_baixa(text) from public, anon;
grant execute on function desfazer_baixa(text) to authenticated;

-- ---------------------------------------------------------------------
-- 5) O lançamento apagado (ou restaurado) por fora
-- ---------------------------------------------------------------------
create or replace function _registro_da_baixa_mudou()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b etiqueta_baixas%rowtype;
  e etiquetas%rowtype;
  n integer;
  copias integer;
begin
  if new.deleted and not coalesce(old.deleted, false) then
    for b in select * from etiqueta_baixas
              where restaurante_id = new.restaurante_id and desfeita_em is null
                and (registro_id = new.id or saida_vinculada = new.id or remessa_id = new.id)
    loop
      perform _devolver_baixa(new.restaurante_id, b.id);
    end loop;
  elsif not new.deleted and coalesce(old.deleted, false) then
    -- restaurado: volta a baixa que gerou ESTE lançamento — só se ainda couber.
    -- Vínculo e "usado" não voltam (a embalagem pode ter seguido outro caminho).
    for b in select * from etiqueta_baixas
              where restaurante_id = new.restaurante_id and registro_id = new.id
                and desfeita_em is not null and acao in ('saida', 'perda', 'entrada')
              for update
    loop
      if b.cozinha is not null then
        if _posse_no_destino(new.restaurante_id, b.etiqueta_id, b.cozinha) >= b.potes then
          update etiqueta_baixas set desfeita_em = null where id = b.id;
        end if;
      else
        select * into e from etiquetas where restaurante_id = new.restaurante_id and id = b.etiqueta_id for update;
        if found then
          copias := _copias_da_etiqueta(e.dados);
          if copias - coalesce(e.baixadas, 0) >= b.potes then
            n := coalesce(e.baixadas, 0) + b.potes;
            update etiqueta_baixas set desfeita_em = null where id = b.id;
            update etiquetas set baixadas = n, status = _status_pelas_baixas(n, copias, b.acao, e.status)
             where restaurante_id = new.restaurante_id and id = e.id;
          end if;
        end if;
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function _registro_da_baixa_mudou() from public, anon, authenticated;
drop trigger if exists trg_registro_da_baixa on registros;
create trigger trg_registro_da_baixa after update of deleted on registros
  for each row when (new.deleted is distinct from old.deleted)
  execute function _registro_da_baixa_mudou();

-- A remessa restaurada volta sem os vínculos e o "usado" (esses não voltam).
create or replace function _remessa_restaurada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dados ? 'vinculos' or new.dados ? 'usadas' then
    new.dados := new.dados - 'vinculos' - 'usadas';
  end if;
  return new;
end $$;
revoke all on function _remessa_restaurada() from public, anon, authenticated;
drop trigger if exists trg_remessa_restaurada on registros;
create trigger trg_remessa_restaurada before update of deleted on registros
  for each row when (old.deleted and not new.deleted)
  execute function _remessa_restaurada();

-- ---------------------------------------------------------------------
-- 6) RECEBER na Finalização — o banco decide o caminho
-- ---------------------------------------------------------------------
create or replace function receber_etiqueta(p_baixa text, p_etiqueta text, p_cozinha text, p_potes integer,
                                            p_registro_id text default null, p_dados jsonb default null,
                                            p_ts bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rid        uuid := meu_restaurante_id();
  e0         etiquetas%rowtype;
  e          etiquetas%rowtype;
  b          etiqueta_baixas%rowtype;
  v_reg      registros%rowtype;
  copias     integer;
  agora_ms   bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  quem       text := left(coalesce(p_dados->>'responsavel', ''), 80);
  marca      jsonb;
  regs       text[];
  linhas     text[];
  n_conf     integer;
  cand_id    text;
  cand       record;
  item_q     numeric;
  vinc       numeric;
  qtd        numeric;
  qtd_txt    text;
  tipo_saida text;
  ligada     boolean;
  dados      jsonb;
  ts_reg     bigint;
  novo_st    text;
  codigo     text;
begin
  if rid is null then raise exception 'Sem restaurante.'; end if;
  if p_baixa is null or p_baixa !~ '^bx_[a-z0-9_]{6,40}$' then raise exception 'Baixa inválida.'; end if;
  if p_cozinha is null or p_cozinha !~ '^finalizacao(#[a-z0-9]{4})?$' then raise exception 'Cozinha inválida.'; end if;
  if p_potes is null or p_potes < 1 or p_potes > 200 then raise exception 'Quantidade de embalagens inválida.'; end if;
  if p_dados is not null and (jsonb_typeof(p_dados) <> 'object' or pg_column_size(p_dados) > 2048) then
    raise exception 'Lançamento inválido.';
  end if;
  if not _pode_gravar_etiqueta(rid, current_date - 3) then
    raise exception 'A conta não está liberada para alterações.';
  end if;
  qtd_txt := p_dados->>'quantidade';
  if qtd_txt is not null and qtd_txt !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' then raise exception 'Quantidade inválida.'; end if;
  qtd := nullif(qtd_txt, '')::numeric;
  if qtd is not null and qtd <= 0 then qtd := null; end if;

  select * into b from etiqueta_baixas where id = p_baixa;
  if found then
    if b.restaurante_id <> rid then raise exception 'Baixa inválida.'; end if;
    return jsonb_build_object('ok', true, 'repetida', true, 'caso', b.acao, 'registro', coalesce(b.registro_id, b.saida_vinculada));
  end if;

  -- 1ª leitura, SEM trava: qual caminho, e quais lançamentos travar ANTES da
  -- etiqueta (a mesma ordem do gatilho de `registros`, para não travar em cruz)
  select * into e0 from etiquetas where restaurante_id = rid and id = p_etiqueta and apagada_em is null;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  if e0.cozinha !~ '^producao(#[a-z0-9]{4})?$' then return jsonb_build_object('ok', false, 'motivo', 'outra_cozinha'); end if;
  tipo_saida := _tipo_da_cozinha(e0.cozinha, 'saida');

  select array_agg(distinct registro_id) into regs from etiqueta_baixas
   where restaurante_id = rid and etiqueta_id = e0.id and destino = p_cozinha and desfeita_em is null
     and acao in ('saida', 'entrada') and not absorvida and conferida_em is null and registro_id is not null;

  if regs is null and coalesce(e0.produto_id, '') <> '' then
    -- a saída lançada À MÃO para esta Finalização (3 dias), com espaço para esta embalagem
    for cand in
      select r.id, r.dados from registros r
       where r.restaurante_id = rid and not r.deleted and r.tipo = tipo_saida
         and r.dados->>'destino' = p_cozinha and coalesce(r.dados->>'baixaId', '') = ''
         and r.ts >= agora_ms - 3 * 86400000
         -- etiqueta impressa DEPOIS do dia da saída não pode ter ido nela
         and (coalesce(r.dados->>'data', '') !~ '^\d{4}-\d{2}-\d{2}$' or e0.impresso_em <= (r.dados->>'data')::date)
         and exists (select 1 from jsonb_array_elements(coalesce(r.dados->'itens', '[]'::jsonb)) i
                      where i->>'produtoId' = e0.produto_id)
       order by r.ts desc
       limit 10
    loop
      select coalesce(sum((i->>'quantidade')::numeric), 0) into item_q
        from jsonb_array_elements(cand.dados->'itens') i
       where i->>'produtoId' = e0.produto_id and coalesce(i->>'quantidade', '') ~ '^[0-9]+(\.[0-9]+)?$';
      select coalesce(sum(eb.quantidade), 0) into vinc from etiqueta_baixas eb
        join etiquetas l on l.restaurante_id = eb.restaurante_id and l.id = eb.etiqueta_id
       where eb.restaurante_id = rid and eb.saida_vinculada = cand.id and eb.acao = 'vinculo'
         and eb.desfeita_em is null and l.produto_id = e0.produto_id;
      if vinc + coalesce(qtd, 0.001) <= item_q + 0.001 then cand_id := cand.id; exit; end if;
    end loop;
  end if;

  if regs is not null then
    perform 1 from registros where restaurante_id = rid and id = any(regs) order by id for update;
  elsif cand_id is not null then
    perform 1 from registros where restaurante_id = rid and id = cand_id for update;
  end if;

  select * into e from etiquetas where restaurante_id = rid and id = p_etiqueta and apagada_em is null for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  select * into b from etiqueta_baixas where id = p_baixa;
  if found then
    return jsonb_build_object('ok', true, 'repetida', true, 'caso', b.acao, 'registro', coalesce(b.registro_id, b.saida_vinculada));
  end if;
  copias := _copias_da_etiqueta(e.dados);
  marca := jsonb_build_object('em', agora_ms, 'por', quem);
  codigo := upper(left(e.id, 4)) || case when length(e.id) > 4 then '-' || upper(substr(e.id, 5)) else '' end;

  -- 1) VEIO PELO QR: confere a(s) remessa(s) desta embalagem
  if regs is not null then
    select array_agg(id), coalesce(sum(potes), 0)::integer into linhas, n_conf from etiqueta_baixas
     where restaurante_id = rid and etiqueta_id = e.id and destino = p_cozinha and desfeita_em is null
       and acao in ('saida', 'entrada') and not absorvida and conferida_em is null and registro_id is not null;
    if linhas is null then return jsonb_build_object('ok', false, 'motivo', 'mudou'); end if;
    update etiqueta_baixas set conferida_em = now() where id = any(linhas);
    select array_agg(distinct registro_id) into regs from etiqueta_baixas where id = any(linhas);
    perform _marcar_conferida(rid, x, e.produto_id, marca) from unnest(regs) x;
    insert into etiqueta_baixas (id, restaurante_id, etiqueta_id, acao, potes, usuario_id, cozinha, destino, detalhe)
    values (p_baixa, rid, e.id, 'conferida', greatest(1, least(200, n_conf)), auth.uid(), p_cozinha, p_cozinha,
            jsonb_build_object('linhas', to_jsonb(linhas), 'registros', to_jsonb(regs)));
    return jsonb_build_object('ok', true, 'caso', 'conferida', 'potes', n_conf, 'registros', to_jsonb(regs));
  end if;

  -- daqui para baixo a embalagem ainda está na Produção
  if (e.status in ('consumida', 'descartada') and e.baixadas = 0) or copias - e.baixadas < p_potes then
    if _posse_no_destino(rid, e.id, p_cozinha) > 0 then
      return jsonb_build_object('ok', false, 'motivo', 'ja_recebida');
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'ja_saiu', 'restantes', greatest(0, copias - e.baixadas));
  end if;
  if coalesce(e.produto_id, '') = '' then return jsonb_build_object('ok', false, 'motivo', 'avulsa'); end if;

  -- 2) A PRODUÇÃO LANÇOU À MÃO: a embalagem fica ligada a essa saída (o
  --    estoque já andou — não lança nada de novo)
  if cand_id is not null then
    select * into v_reg from registros where id = cand_id and restaurante_id = rid;
    if found and not v_reg.deleted then
      insert into etiqueta_baixas (id, restaurante_id, etiqueta_id, acao, potes, usuario_id, destino,
                                   saida_vinculada, quantidade, conferida_em)
      values (p_baixa, rid, e.id, 'vinculo', p_potes, auth.uid(), p_cozinha, cand_id, qtd, now());
      novo_st := _status_pelas_baixas(e.baixadas + p_potes, copias, 'saida', e.status);
      update etiquetas set baixadas = e.baixadas + p_potes, status = novo_st where restaurante_id = rid and id = e.id;
      update registros
         set dados = jsonb_set(dados, '{vinculos}', coalesce(dados->'vinculos', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
               'etiquetaId', e.id, 'potes', p_potes, 'quantidade', qtd, 'validade', e.validade,
               'nome', e.nome, 'medida', e.dados->>'medida', 'produtoId', e.produto_id, 'baixaId', p_baixa)))
       where id = cand_id and restaurante_id = rid;
      perform _marcar_conferida(rid, cand_id, e.produto_id, marca);
      return jsonb_build_object('ok', true, 'caso', 'vinculo', 'registro', cand_id,
                                'baixadas', e.baixadas + p_potes, 'copias', copias, 'status', novo_st);
    end if;
  end if;

  -- 3) A PRODUÇÃO NÃO LANÇOU: dá entrada — só onde o dono ligou
  select coalesce(jsonb_typeof(d.dados->'receberPeloQR'->p_cozinha) = 'object', false) into ligada
    from documentos d where d.restaurante_id = rid and d.chave = 'estoques';
  if not coalesce(ligada, false) then
    return jsonb_build_object('ok', false, 'motivo', 'nao_saiu', 'restantes', copias - e.baixadas);
  end if;
  if not coalesce(restaurante_pode_escrever(rid), false) then
    raise exception 'A conta não está liberada para alterações.';
  end if;
  if p_registro_id is null or p_registro_id !~ '^[a-z0-9_]{6,40}$' then raise exception 'Lançamento inválido.'; end if;
  if qtd is null then raise exception 'Quantidade inválida.'; end if;
  ts_reg := case when p_ts between agora_ms - 3 * 86400000 and agora_ms + 600000 then p_ts else agora_ms end;
  dados := jsonb_build_object(
    'data', left(coalesce(nullif(p_dados->>'data', ''), to_char(current_date, 'YYYY-MM-DD')), 10),
    'hora', left(coalesce(p_dados->>'hora', ''), 5),
    'responsavel', quem,
    'destino', p_cozinha,
    'obs', 'Recebida pela Finalização (etiqueta ' || codigo || ')',
    'itens', jsonb_build_array(jsonb_build_object(
      'produtoId', e.produto_id, 'quantidade', qtd, 'validade', e.validade, 'etiquetaId', e.id, 'potes', p_potes)),
    'etiquetaId', e.id, 'baixaId', p_baixa, 'potes', p_potes,
    'etiqueta', jsonb_build_object('nome', e.nome, 'medida', e.dados->>'medida'),
    'recebidaPelaFinalizacao', true,
    'conferida', jsonb_build_object(e.produto_id, marca));
  insert into registros (id, restaurante_id, tipo, ts, dados, deleted)
  values (p_registro_id, rid, tipo_saida, ts_reg, dados, false)
  on conflict (id) do nothing;
  if not found then raise exception 'Lançamento repetido.'; end if;
  insert into etiqueta_baixas (id, restaurante_id, etiqueta_id, acao, potes, registro_id, usuario_id, destino, quantidade, conferida_em)
  values (p_baixa, rid, e.id, 'entrada', p_potes, p_registro_id, auth.uid(), p_cozinha, qtd, now());
  novo_st := _status_pelas_baixas(e.baixadas + p_potes, copias, 'saida', e.status);
  update etiquetas set baixadas = e.baixadas + p_potes, status = novo_st where restaurante_id = rid and id = e.id;
  return jsonb_build_object('ok', true, 'caso', 'entrada', 'registro', p_registro_id,
                            'baixadas', e.baixadas + p_potes, 'copias', copias, 'status', novo_st);
end $$;
revoke all on function receber_etiqueta(text, text, text, integer, text, jsonb, bigint) from public, anon;
grant execute on function receber_etiqueta(text, text, text, integer, text, jsonb, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 7) PERDA e USADO de uma embalagem que está NA Finalização
-- ---------------------------------------------------------------------
create or replace function baixar_no_destino(p_baixa text, p_etiqueta text, p_cozinha text, p_acao text, p_potes integer,
                                             p_registro_id text default null, p_dados jsonb default null,
                                             p_ts bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rid      uuid := meu_restaurante_id();
  e        etiquetas%rowtype;
  b        etiqueta_baixas%rowtype;
  posse    integer;
  qtd      numeric;
  qtd_txt  text;
  dados    jsonb;
  agora_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  ts_reg   bigint;
  rem      text;
begin
  if rid is null then raise exception 'Sem restaurante.'; end if;
  if p_acao is null or p_acao not in ('perda', 'usada') then raise exception 'Ação inválida.'; end if;
  if p_baixa is null or p_baixa !~ '^bx_[a-z0-9_]{6,40}$' then raise exception 'Baixa inválida.'; end if;
  if p_cozinha is null or p_cozinha !~ '^finalizacao(#[a-z0-9]{4})?$' then raise exception 'Cozinha inválida.'; end if;
  if p_potes is null or p_potes < 1 or p_potes > 200 then raise exception 'Quantidade de potes inválida.'; end if;
  if not _pode_gravar_etiqueta(rid, current_date - 3) then
    raise exception 'A conta não está liberada para alterações.';
  end if;

  select * into b from etiqueta_baixas where id = p_baixa;
  if found then
    if b.restaurante_id <> rid then raise exception 'Baixa inválida.'; end if;
    return jsonb_build_object('ok', true, 'repetida', true, 'aqui', _posse_no_destino(rid, b.etiqueta_id, p_cozinha));
  end if;

  select * into e from etiquetas where restaurante_id = rid and id = p_etiqueta and apagada_em is null for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  select * into b from etiqueta_baixas where id = p_baixa;
  if found then return jsonb_build_object('ok', true, 'repetida', true, 'aqui', _posse_no_destino(rid, e.id, p_cozinha)); end if;

  posse := _posse_no_destino(rid, e.id, p_cozinha);
  if posse < p_potes then
    -- ⚠️ "ainda não está aqui": a saída da Produção pode estar subindo pela
    -- fila de outro aparelho — o app tenta de novo, não desfaz na hora
    return jsonb_build_object('ok', false, 'motivo', case when posse = 0 then 'nao_esta_aqui' else 'poucos_potes' end, 'aqui', posse);
  end if;

  if p_acao = 'perda' then
    if coalesce(e.produto_id, '') = '' then return jsonb_build_object('ok', false, 'motivo', 'avulsa'); end if;
    if not coalesce(restaurante_pode_escrever(rid), false) then
      raise exception 'A conta não está liberada para alterações.';
    end if;
    if p_registro_id is null or p_registro_id !~ '^[a-z0-9_]{6,40}$' then raise exception 'Lançamento inválido.'; end if;
    if p_dados is null or jsonb_typeof(p_dados) <> 'object' or pg_column_size(p_dados) > 4096 then
      raise exception 'Lançamento inválido.';
    end if;
    qtd_txt := p_dados->>'quantidade';
    if qtd_txt is null or qtd_txt !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' then raise exception 'Quantidade inválida.'; end if;
    qtd := qtd_txt::numeric;
    if qtd <= 0 then raise exception 'Quantidade inválida.'; end if;
    dados := (p_dados - 'id' - 'ts') || jsonb_build_object(
      'origem', 'estoque', 'produtoId', e.produto_id, 'quantidade', qtd,
      'validade', e.validade, 'etiquetaId', e.id, 'baixaId', p_baixa, 'potes', p_potes);
    ts_reg := case when p_ts between agora_ms - 3 * 86400000 and agora_ms + 600000 then p_ts else agora_ms end;
    insert into registros (id, restaurante_id, tipo, ts, dados, deleted)
    values (p_registro_id, rid, p_cozinha || ':perda', ts_reg, dados, false)
    on conflict (id) do nothing;
    if not found then raise exception 'Lançamento repetido.'; end if;
    insert into etiqueta_baixas (id, restaurante_id, etiqueta_id, acao, potes, registro_id, usuario_id, cozinha)
    values (p_baixa, rid, e.id, 'perda', p_potes, p_registro_id, auth.uid(), p_cozinha);
  else
    -- "usado" não mexe no estoque (o consumo daqui é o Fechar Turno): fica
    -- anotado na remessa mais recente, que já viaja para os aparelhos
    select coalesce(registro_id, saida_vinculada) into rem from etiqueta_baixas
     where restaurante_id = rid and etiqueta_id = e.id and destino = p_cozinha and desfeita_em is null
       and not absorvida and acao in ('saida', 'entrada', 'vinculo')
     order by criada_em desc limit 1;
    if rem is not null then
      update registros
         set dados = jsonb_set(dados, '{usadas}', coalesce(dados->'usadas', '{}'::jsonb)
                     || jsonb_build_object(e.id, coalesce((dados->'usadas'->>e.id)::integer, 0) + p_potes))
       where id = rem and restaurante_id = rid;
    end if;
    insert into etiqueta_baixas (id, restaurante_id, etiqueta_id, acao, potes, usuario_id, cozinha, remessa_id)
    values (p_baixa, rid, e.id, 'usada', p_potes, auth.uid(), p_cozinha, rem);
  end if;
  return jsonb_build_object('ok', true, 'aqui', posse - p_potes);
end $$;
revoke all on function baixar_no_destino(text, text, text, text, integer, text, jsonb, bigint) from public, anon;
grant execute on function baixar_no_destino(text, text, text, text, integer, text, jsonb, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 8) "Chegou" / "Não chegou" de uma remessa, item a item (a lista A conferir)
-- ---------------------------------------------------------------------
create or replace function conferir_remessa(p_registro text, p_produto text, p_resultado text, p_responsavel text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rid uuid := meu_restaurante_id();
  r   registros%rowtype;
begin
  if rid is null then raise exception 'Sem restaurante.'; end if;
  if p_resultado is null or p_resultado not in ('chegou', 'nao_chegou', 'desfazer') then raise exception 'Resultado inválido.'; end if;
  if coalesce(length(p_produto), 0) not between 1 and 120 then raise exception 'Item inválido.'; end if;
  if not coalesce(restaurante_pode_escrever(rid), false) then
    raise exception 'A conta não está liberada para alterações.';
  end if;
  select * into r from registros where id = p_registro and restaurante_id = rid and not deleted for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  if r.tipo !~ '^(saida|producao#[a-z0-9]{4}:saida)$'
     or coalesce(r.dados->>'destino', '') !~ '^finalizacao(#[a-z0-9]{4})?$' then
    raise exception 'Isto não é uma remessa para a Finalização.';
  end if;
  if p_resultado = 'desfazer' then
    perform _marcar_conferida(rid, r.id, p_produto, null);
    update etiqueta_baixas set conferida_em = null
     where restaurante_id = rid and registro_id = r.id and acao in ('saida', 'entrada') and desfeita_em is null;
  else
    perform _marcar_conferida(rid, r.id, p_produto, jsonb_build_object(
      'em', (extract(epoch from clock_timestamp()) * 1000)::bigint,
      'por', left(coalesce(p_responsavel, ''), 80),
      'nao', p_resultado = 'nao_chegou'));
    update etiqueta_baixas set conferida_em = now()
     where restaurante_id = rid and registro_id = r.id and acao in ('saida', 'entrada')
       and desfeita_em is null and conferida_em is null;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function conferir_remessa(text, text, text, text) from public, anon;
grant execute on function conferir_remessa(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9) Sondas: aborta a migração se algum grant ficou errado
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'baixar_etiqueta(text, text, text, integer, text, jsonb, bigint)',
    'desfazer_baixa(text)',
    'receber_etiqueta(text, text, text, integer, text, jsonb, bigint)',
    'baixar_no_destino(text, text, text, text, integer, text, jsonb, bigint)',
    'conferir_remessa(text, text, text, text)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'M61: authenticated sem execute em % — abortando.', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'M61: anon consegue chamar % — abortando.', f;
    end if;
  end loop;
  foreach f in array array[
    '_devolver_baixa(uuid, text)', '_registro_da_baixa_mudou()', '_remessa_restaurada()',
    '_posse_no_destino(uuid, text, text)', '_tipo_da_cozinha(text, text)',
    '_marcar_conferida(uuid, text, text, jsonb)'] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'M61: % está exposta — abortando.', f;
    end if;
  end loop;
  -- ⚠️ UMA função de cada nome: sobrecarga faz o PostgREST responder "ambígua"
  if (select count(*) from pg_proc where proname = 'baixar_etiqueta' and pronamespace = 'public'::regnamespace) <> 1
     or (select count(*) from pg_proc where proname = 'desfazer_baixa' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'M61: baixar_etiqueta/desfazer_baixa ganharam sobrecarga — abortando.';
  end if;
  if has_table_privilege('authenticated', 'etiqueta_baixas', 'select')
     or has_table_privilege('anon', 'etiqueta_baixas', 'select') then
    raise exception 'M61: etiqueta_baixas legível pelo cliente — abortando.';
  end if;
end $$;

commit;
