-- =====================================================================
--  M49 — A LISTA DE ETIQUETAS IMPRESSAS VIRA LINHAS (24/09/2026)
--
--  PEDIDO DO DONO ("deixar mais leve o sistema"). A lista de impressas de
--  cada cozinha era UM documento (`documentos`, chave '…etiquetasImpressas'),
--  regravado INTEIRO a cada etiqueta — depois de um mês de uso, 0,6 a 1,5 MB
--  subindo a cada toque em imprimir, e o tempo real mandando o documento
--  inteiro para cada outro aparelho da conta. Com ~50 etiquetas/dia e 2
--  aparelhos, ~1,5 GB/mês de tráfego POR CLIENTE: o plano grátis do Supabase
--  (~5 GB) estouraria com 3 a 5 clientes, e a fila offline já tinha enchido o
--  localStorage com cópias desse documento (23/09).
--
--  Agora cada etiqueta é UMA LINHA (~400 bytes): imprimir manda só as novas,
--  o tempo real manda só a linha que mudou, e mudar a situação (Validades)
--  muda uma linha. Não há mais "outro aparelho alterou" nem conflito de
--  versão para juntar: duas etiquetas são duas linhas.
--
--  ⚠️ ESCRITA SÓ PELAS FUNÇÕES (como `unidades`): a tabela tem policy de
--  leitura e nenhuma de escrita. `registrar_etiquetas` é idempotente pelo id
--  (o `loteId` que vai no QR, gerado no aparelho) — o reenvio da fila offline
--  não duplica.
--
--  ⚠️ APAGAR CONTINUA SÓ DA CONTA DONA (M44): `apagar_impressao` passa a
--  marcar também a etiqueta como apagada, na mesma transação do relatório.
--
--  ⚠️ O QUE JÁ EXISTE NÃO SE PERDE: o fim desta migração copia as listas dos
--  documentos para as linhas. O documento antigo FICA (só leitura): aparelho
--  com a versão velha do app que ainda grave nele tem as etiquetas absorvidas
--  pelo app novo, pelo mesmo `registrar_etiquetas`.
-- =====================================================================

begin;

create table if not exists etiquetas (
  restaurante_id uuid        not null references restaurantes(id) on delete cascade,
  id             text        not null check (length(id) between 1 and 80),
  -- a cozinha dona da lista, no formato das chaves de módulo: 'producao',
  -- 'seco', 'finalizacao#ab12', 'producao#ab12'…
  cozinha        text        not null check (cozinha ~ '^[a-z]+(#[a-z0-9]{4})?$'),
  impressao_id   uuid,
  produto_id     text,
  nome           text        not null default '',
  impresso_em    date        not null,
  validade       date,
  status         text        not null default 'valida' check (status in ('valida', 'consumida', 'descartada')),
  -- ⚠️ APAGAR É MARCAR, não tirar a linha: o aviso de linha APAGADA do tempo
  -- real do Supabase não passa pela policy de leitura (iria para os aparelhos
  -- de TODAS as contas). A marcação chega como alteração — só à própria conta.
  apagada_em     timestamptz,
  -- o registro inteiro como o app o monta (medida, armazenamento, horas,
  -- responsável, lote…) — a etiqueta de reposição sai igual à original
  dados          jsonb       not null default '{}'::jsonb check (pg_column_size(dados) <= 8192),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  primary key (restaurante_id, id)
);
create index if not exists etiquetas_cozinha_idx on etiquetas (restaurante_id, cozinha, impresso_em desc);
create index if not exists etiquetas_validade_idx on etiquetas (restaurante_id, cozinha, validade);

alter table etiquetas enable row level security;
drop policy if exists "etiquetas_sel_v49" on etiquetas;
create policy "etiquetas_sel_v49" on etiquetas for select
  using (restaurante_id = meu_restaurante_id() or coalesce(sou_super_admin(), false));
revoke all on table etiquetas from anon;

-- o tempo real entrega a linha nova/alterada aos outros aparelhos da conta
-- (respeitando a policy de leitura acima)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'etiquetas') then
    alter publication supabase_realtime add table etiquetas;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Gravar etiquetas (a impressão e a fila offline)
-- ---------------------------------------------------------------------
create or replace function registrar_etiquetas(p_itens jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  rid    uuid := meu_restaurante_id();
  novas  integer;
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  data_re constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
begin
  if rid is null then return 0; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then return 0; end if;
  if jsonb_array_length(p_itens) > 400 then
    raise exception 'Lote grande demais: no máximo 400 etiquetas por chamada.';
  end if;

  insert into etiquetas (restaurante_id, id, cozinha, impressao_id, produto_id, nome,
                         impresso_em, validade, status, dados)
  select rid,
         left(e->>'id', 80),
         e->>'cozinha',
         case when coalesce(e->>'impressaoId', '') ~ uuid_re then (e->>'impressaoId')::uuid end,
         left(nullif(e->>'produtoId', ''), 80),
         left(coalesce(e->>'nome', ''), 120),
         case when coalesce(e->>'impressoEm', '') ~ data_re then (e->>'impressoEm')::date else current_date end,
         case when coalesce(e->>'validade', '') ~ data_re then (e->>'validade')::date end,
         case when e->>'status' in ('consumida', 'descartada') then e->>'status' else 'valida' end,
         (e - 'cozinha')
    from jsonb_array_elements(p_itens) e
   where coalesce(e->>'id', '') <> ''
     and coalesce(e->>'cozinha', '') ~ '^[a-z]+(#[a-z0-9]{4})?$'
     and pg_column_size(e) <= 8192
  on conflict (restaurante_id, id) do nothing;
  get diagnostics novas = row_count;
  return novas;
end $$;

-- ---------------------------------------------------------------------
-- 2) Mudar a situação (Validades do Pro: consumida / descartada / válida)
-- ---------------------------------------------------------------------
create or replace function mudar_status_etiqueta(p_id text, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  rid uuid := meu_restaurante_id();
begin
  if rid is null then return false; end if;
  if p_status not in ('valida', 'consumida', 'descartada') then
    raise exception 'Situação inválida.';
  end if;
  update etiquetas set status = p_status, atualizado_em = now()
   where restaurante_id = rid and id = p_id and apagada_em is null;
  return found;
end $$;

-- ---------------------------------------------------------------------
-- 3) Apagar (só a conta dona — M44): tira do relatório E da lista
--    (mesma assinatura da M44: create or replace mantém o grant)
-- ---------------------------------------------------------------------
create or replace function apagar_impressao(
  p_id     uuid    default null,
  p_lote   text    default null,
  p_dia    date    default null,
  p_hora   text    default null,
  p_item   text    default null,
  p_copias integer default 1
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  rid   uuid;
  alvo  etiquetas_impressoes%rowtype;
  tirar integer := 0;
begin
  -- ⚠️ `coalesce` antes de comparar: trava que devolve NULL não trava (M19).
  if coalesce(meu_cargo(), '') <> 'diretoria' then
    raise exception 'Só a conta dona do restaurante apaga uma etiqueta impressa.';
  end if;
  rid := meu_restaurante_id();
  if rid is null then
    raise exception 'Conta sem restaurante.';
  end if;

  -- a etiqueta (M49) sai da lista sempre que o lote vier — marcada, não
  -- apagada (ver a coluna apagada_em)
  if coalesce(p_lote, '') <> '' then
    update etiquetas set apagada_em = now(), atualizado_em = now()
     where restaurante_id = rid and id = p_lote and apagada_em is null;
  end if;

  if p_id is not null then
    select * into alvo from etiquetas_impressoes
     where id = p_id and restaurante_id = rid;
  end if;

  if alvo.id is null and coalesce(p_lote, '') <> '' then
    select * into alvo from etiquetas_impressoes
     where id = md5(rid::text || ':' || p_lote)::uuid and restaurante_id = rid;
  end if;

  if alvo.id is null and p_dia is not null then
    select * into alvo from etiquetas_impressoes
     where restaurante_id = rid
       and dia = p_dia
       and hora = left(coalesce(p_hora, ''), 5)
       and upper(btrim(item)) = upper(btrim(coalesce(p_item, '')))
     order by criado_em desc
     limit 1;
  end if;

  if alvo.id is null then return 0; end if;

  tirar := least(greatest(coalesce(p_copias, 1), 1), alvo.copias);
  if tirar >= alvo.copias then
    delete from etiquetas_impressoes where id = alvo.id;
  else
    update etiquetas_impressoes set copias = copias - tirar where id = alvo.id;
  end if;

  update restaurantes
     set etiquetas_impressas = greatest(coalesce(etiquetas_impressas, 0) - tirar, 0)
   where id = rid;

  return tirar;
end $$;

-- ---------------------------------------------------------------------
-- 4) O que já existe: as listas dos documentos viram linhas
-- ---------------------------------------------------------------------
insert into etiquetas (restaurante_id, id, cozinha, impressao_id, produto_id, nome,
                       impresso_em, validade, status, dados)
select d.restaurante_id,
       left(e->>'id', 80),
       case when d.chave = 'etiquetasImpressas' then 'producao' else split_part(d.chave, '::', 1) end,
       case when coalesce(e->>'impressaoId', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (e->>'impressaoId')::uuid end,
       left(nullif(e->>'produtoId', ''), 80),
       left(coalesce(e->>'nome', ''), 120),
       case when coalesce(e->>'impressoEm', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            then (e->>'impressoEm')::date else d.updated_at::date end,
       case when coalesce(e->>'validade', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (e->>'validade')::date end,
       case when e->>'status' in ('consumida', 'descartada') then e->>'status' else 'valida' end,
       e
  from documentos d
  cross join lateral jsonb_array_elements(
         case when jsonb_typeof(d.dados) = 'array' then d.dados else '[]'::jsonb end) e
 where (d.chave = 'etiquetasImpressas' or d.chave like '%::etiquetasImpressas')
   and coalesce(e->>'id', '') <> ''
   and (case when d.chave = 'etiquetasImpressas' then 'producao' else split_part(d.chave, '::', 1) end)
       ~ '^[a-z]+(#[a-z0-9]{4})?$'
   and pg_column_size(e) <= 8192
on conflict (restaurante_id, id) do nothing;

-- ---------------------------------------------------------------------
-- 5) Grants + sonda
-- ---------------------------------------------------------------------
revoke all on function registrar_etiquetas(jsonb)                                   from public, anon;
revoke all on function mudar_status_etiqueta(text, text)                             from public, anon;
revoke all on function apagar_impressao(uuid, text, date, text, text, integer)       from public, anon;
grant execute on function registrar_etiquetas(jsonb)                                 to authenticated;
grant execute on function mudar_status_etiqueta(text, text)                          to authenticated;
grant execute on function apagar_impressao(uuid, text, date, text, text, integer)     to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'registrar_etiquetas(jsonb)',
    'mudar_status_etiqueta(text, text)',
    'apagar_impressao(uuid, text, date, text, text, integer)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'M49: authenticated sem execute em % — abortando.', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'M49: anon consegue chamar % — abortando.', f;
    end if;
  end loop;
  if exists (select 1 from pg_policies where tablename = 'etiquetas' and cmd <> 'SELECT') then
    raise exception 'M49: a tabela etiquetas ganhou policy de escrita — abortando.';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'etiquetas') then
    raise exception 'M49: etiquetas fora do tempo real — abortando.';
  end if;
end $$;

commit;
