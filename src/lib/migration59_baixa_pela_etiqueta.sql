-- =====================================================================
--  M59 — BAIXA PELA ETIQUETA (30/09/2026, pedido do dono, plano Pro)
--
--  Ler o QR do pote (ou digitar o código dele) dá SAÍDA, PERDA ou só marca
--  como usado — e o estoque abate o lote com a VALIDADE DAQUELE POTE, não o
--  que vence primeiro.
--
--  ⚠️ UM CÓDIGO POR LOTE, com contador. Pelo Bluetooth as N cópias de um item
--  saem com o mesmo código (`PRINT 1,N`); a linha da etiqueta guarda `copias`.
--  Cada baixa consome potes desse lote — "pote 2 de 5". Potes com validade
--  diferente nunca dividem código: são impressos separados.
--
--  AS TRAVAS (o dono pediu "sem brechas"):
--  • ATÔMICA: a conferência (ainda há pote?), o lançamento no estoque e o
--    contador acontecem na MESMA transação, com a linha da etiqueta travada
--    (`for update`). Dois aparelhos lendo o último pote ao mesmo tempo: um
--    passa, o outro recebe "já baixada".
--  • IDEMPOTENTE: cada baixa tem um id gerado no aparelho. A fila sem internet
--    pode reenviar quantas vezes quiser — a segunda vez só devolve o estado.
--  • O QUE DECIDE O ESTOQUE VEM DA ETIQUETA, não do aparelho: o item, a
--    validade e a COZINHA (o tipo do registro) saem da linha do banco. O
--    aparelho só manda a quantidade, o destino e quem fez.
--  • COERENTE NOS DOIS SENTIDOS: apagar pelo Histórico a saída que uma baixa
--    gerou devolve o pote (gatilho em `registros`); restaurar a saída tira de
--    novo. Sem isto, o estoque e a etiqueta divergiriam por um caminho que a
--    tela de baixa nem enxerga.
-- =====================================================================

begin;

alter table etiquetas add column if not exists baixadas integer not null default 0;
alter table etiquetas drop constraint if exists etiquetas_baixadas_check;
alter table etiquetas add constraint etiquetas_baixadas_check check (baixadas >= 0);

create table if not exists etiqueta_baixas (
  id             text primary key check (id ~ '^bx_[a-z0-9_]{6,40}$'),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  etiqueta_id    text not null,
  acao           text not null check (acao in ('saida', 'perda', 'usada')),
  potes          integer not null check (potes between 1 and 200),
  registro_id    text,
  usuario_id     uuid,
  criada_em      timestamptz not null default now(),
  desfeita_em    timestamptz
);
create index if not exists etiqueta_baixas_rest_etq on etiqueta_baixas (restaurante_id, etiqueta_id);
create index if not exists etiqueta_baixas_registro on etiqueta_baixas (registro_id) where registro_id is not null;
alter table etiqueta_baixas enable row level security;
revoke all on etiqueta_baixas from anon, authenticated;

-- Quantas cópias a linha representa (texto livre no `dados`: só número conta).
create or replace function _copias_da_etiqueta(p_dados jsonb)
returns integer language sql immutable set search_path = public as $$
  select case when coalesce(p_dados->>'copias', '') ~ '^[0-9]{1,4}$'
              then greatest(1, least((p_dados->>'copias')::integer, 1000)) else 1 end;
$$;

-- A situação da linha a partir do contador (a vencida é derivada no app).
create or replace function _status_pelas_baixas(p_baixadas integer, p_copias integer, p_acao text, p_atual text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_baixadas >= p_copias then (case when p_acao = 'perda' then 'descartada' else 'consumida' end)
    when p_atual in ('consumida', 'descartada') and p_baixadas < p_copias then 'valida'
    else coalesce(p_atual, 'valida') end;
$$;

-- ---------------------------------------------------------------------
-- A BAIXA
--   p_baixa       id da baixa, gerado no aparelho ('bx_...') — idempotência
--   p_acao        'saida' | 'perda' | 'usada' (só marca, não mexe no estoque)
--   p_potes       quantos potes deste código (padrão 1)
--   p_registro_id id do lançamento de estoque (saída/perda), gerado no aparelho
--   p_dados       o lançamento como o app monta (data, hora, responsável,
--                 destino ou motivo, quantidade); item/validade/cozinha são
--                 SOBRESCRITOS pelo banco a partir da etiqueta
--   p_ts          carimbo do aparelho (ms), aceito só se for de agora
-- ---------------------------------------------------------------------
create or replace function baixar_etiqueta(p_baixa text, p_etiqueta text, p_acao text, p_potes integer,
                                           p_registro_id text default null, p_dados jsonb default null,
                                           p_ts bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rid      uuid := meu_restaurante_id();
  e        etiquetas%rowtype;
  b        etiqueta_baixas%rowtype;
  copias   integer;
  base     text;
  tipo_reg text;
  qtd      numeric;
  qtd_txt  text;
  dados    jsonb;
  agora_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  ts_reg   bigint;
  novo_st  text;
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

  copias := _copias_da_etiqueta(e.dados);
  -- linha marcada à mão ANTES da M59 (sem contador): vale como toda baixada
  if e.status in ('consumida', 'descartada') and e.baixadas = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'ja_baixada', 'status', e.status, 'copias', copias, 'baixadas', copias);
  end if;
  if e.baixadas >= copias then
    return jsonb_build_object('ok', false, 'motivo', 'ja_baixada', 'status', e.status, 'copias', copias, 'baixadas', e.baixadas);
  end if;
  if p_potes > copias - e.baixadas then
    return jsonb_build_object('ok', false, 'motivo', 'poucos_potes', 'restantes', copias - e.baixadas,
                              'copias', copias, 'baixadas', e.baixadas);
  end if;

  if p_acao in ('saida', 'perda') then
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

    -- ⚠️ A COZINHA DO LANÇAMENTO É A DA ETIQUETA, não a aberta no aparelho
    base := case when p_acao = 'saida' then 'saida' else 'perda' end;
    tipo_reg := case when e.cozinha = 'producao' then base else e.cozinha || ':' || base end;

    if p_acao = 'saida' then
      if coalesce(length(p_dados->>'destino'), 0) not between 1 and 80 then raise exception 'Escolha o destino da saída.'; end if;
      dados := (p_dados - 'itens' - 'id' - 'ts') || jsonb_build_object(
        'itens', jsonb_build_array(jsonb_build_object(
          'produtoId', e.produto_id, 'quantidade', qtd, 'validade', e.validade, 'etiquetaId', e.id)),
        'etiquetaId', e.id, 'baixaId', p_baixa);
    else
      dados := (p_dados - 'id' - 'ts') || jsonb_build_object(
        'origem', 'estoque', 'produtoId', e.produto_id, 'quantidade', qtd,
        'validade', e.validade, 'etiquetaId', e.id, 'baixaId', p_baixa);
    end if;

    ts_reg := case when p_ts between agora_ms - 3 * 86400000 and agora_ms + 600000 then p_ts else agora_ms end;
    insert into registros (id, restaurante_id, tipo, ts, dados, deleted)
    values (p_registro_id, rid, tipo_reg, ts_reg, dados, false)
    on conflict (id) do nothing;
    if not found then raise exception 'Lançamento repetido.'; end if;
  end if;

  insert into etiqueta_baixas (id, restaurante_id, etiqueta_id, acao, potes, registro_id, usuario_id)
  values (p_baixa, rid, e.id, p_acao, p_potes,
          case when p_acao = 'usada' then null else p_registro_id end, auth.uid());

  novo_st := _status_pelas_baixas(e.baixadas + p_potes, copias, p_acao, e.status);
  update etiquetas set baixadas = e.baixadas + p_potes, status = novo_st
   where restaurante_id = rid and id = e.id;

  return jsonb_build_object('ok', true, 'baixadas', e.baixadas + p_potes, 'copias', copias, 'status', novo_st);
end $$;
revoke all on function baixar_etiqueta(text, text, text, integer, text, jsonb, bigint) from public, anon;
grant execute on function baixar_etiqueta(text, text, text, integer, text, jsonb, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Devolver os potes de uma baixa (usado pelo desfazer e pelo gatilho)
-- ---------------------------------------------------------------------
create or replace function _devolver_baixa(p_rid uuid, p_baixa text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  b etiqueta_baixas%rowtype;
  e etiquetas%rowtype;
  n integer;
  tem_etiqueta boolean;
begin
  select * into b from etiqueta_baixas where id = p_baixa and restaurante_id = p_rid for update;
  if not found or b.desfeita_em is not null then return false; end if;
  select * into e from etiquetas where restaurante_id = p_rid and id = b.etiqueta_id for update;
  tem_etiqueta := found;
  update etiqueta_baixas set desfeita_em = now() where id = b.id;
  if tem_etiqueta then
    n := greatest(0, coalesce(e.baixadas, 0) - b.potes);
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
  select * into b from etiqueta_baixas where id = p_baixa and restaurante_id = rid;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  if b.desfeita_em is not null then return jsonb_build_object('ok', true, 'repetida', true); end if;
  -- desfazer é para o engano da hora; depois disso, corrige-se pelo Histórico
  if b.criada_em < now() - interval '1 day' then
    return jsonb_build_object('ok', false, 'motivo', 'antiga');
  end if;
  if b.registro_id is not null then
    -- o gatilho de `registros` devolve os potes
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
-- O lançamento que uma baixa gerou foi apagado (ou restaurado) por fora
-- ---------------------------------------------------------------------
create or replace function _registro_da_baixa_mudou()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b etiqueta_baixas%rowtype;
  e etiquetas%rowtype;
  n integer;
  copias integer;
begin
  if coalesce(new.dados->>'baixaId', '') = '' then return new; end if;
  if new.deleted and not coalesce(old.deleted, false) then
    perform _devolver_baixa(new.restaurante_id, new.dados->>'baixaId');
  elsif not new.deleted and coalesce(old.deleted, false) then
    -- restaurado (o "desfazer" do Histórico): a baixa volta, se ainda couber
    select * into b from etiqueta_baixas
     where id = new.dados->>'baixaId' and restaurante_id = new.restaurante_id for update;
    if found and b.desfeita_em is not null then
      select * into e from etiquetas where restaurante_id = new.restaurante_id and id = b.etiqueta_id for update;
      if found then
        copias := _copias_da_etiqueta(e.dados);
        n := least(copias, coalesce(e.baixadas, 0) + b.potes);
        update etiqueta_baixas set desfeita_em = null where id = b.id;
        update etiquetas set baixadas = n, status = _status_pelas_baixas(n, copias, b.acao, e.status)
         where restaurante_id = new.restaurante_id and id = e.id;
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function _registro_da_baixa_mudou() from public, anon, authenticated;
drop trigger if exists trg_registro_da_baixa on registros;
create trigger trg_registro_da_baixa after update of deleted on registros
  for each row when (new.deleted is distinct from old.deleted)
  execute function _registro_da_baixa_mudou();

do $$
declare f text;
begin
  foreach f in array array['baixar_etiqueta(text, text, text, integer, text, jsonb, bigint)', 'desfazer_baixa(text)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'M59: authenticated sem execute em % — abortando.', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'M59: anon consegue chamar % — abortando.', f;
    end if;
  end loop;
  foreach f in array array['_devolver_baixa(uuid, text)', '_registro_da_baixa_mudou()'] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'M59: % está exposta — abortando.', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'etiqueta_baixas', 'select')
     or has_table_privilege('anon', 'etiqueta_baixas', 'select') then
    raise exception 'M59: etiqueta_baixas legível pelo cliente — abortando.';
  end if;
end $$;

commit;
