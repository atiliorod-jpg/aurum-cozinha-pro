-- =====================================================================
--  M55 — CONTA SEM LIBERAÇÃO NÃO GRAVA ETIQUETA, E HÁ TETO POR DIA (28/09/2026)
--
--  Achado da análise de segurança: `registrar_etiquetas`, `registrar_impressoes`
--  e `mudar_status_etiqueta` só conferiam de qual restaurante era a pessoa.
--  Desde a M41 uma conta recém-cadastrada nasce SEM acesso, mas já tem
--  restaurante — e podia chamar essas funções pela API, sem limite: 400 linhas
--  de até 8 KB por chamada, em laço. O plano grátis do Supabase tem 500 MB, e
--  banco cheio fica SÓ LEITURA para TODOS os clientes.
--
--  Agora:
--  • só grava a conta que está liberada (restaurante_pode_escrever) OU a
--    etiqueta impressa ATÉ o último vencimento conhecido da conta (+1 dia). É
--    isso que deixa subir a fila sem internet de quem imprimiu em dia e só
--    reconectou depois de vencer — e barra a conta que nunca foi liberada
--    (sem vencimento nenhum) e a bloqueada;
--  • teto de 5.000 etiquetas e 5.000 linhas de relatório por conta em 24 h
--    (uma cozinha real imprime de 50 a 150 por dia);
--  • cada etiqueta até 2 KB (a maior gravada até hoje tem 424 bytes).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) Quem pode gravar a etiqueta do dia `p_dia`
-- ---------------------------------------------------------------------
create or replace function _pode_gravar_etiqueta(p_rid uuid, p_dia date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurantes r
     where r.id = p_rid
       and not coalesce(r.bloqueado, false)
       and (coalesce(restaurante_pode_escrever(p_rid), false)
            or p_dia <= (greatest(r.assinatura_ate, r.teste_ate, r.cortesia_ate)
                         at time zone 'America/Recife')::date + 1)
  );
$$;
revoke all on function _pode_gravar_etiqueta(uuid, date) from public, anon, authenticated;

create index if not exists etiquetas_rest_criado on etiquetas (restaurante_id, criado_em);
create index if not exists etiquetas_impressoes_rest_criado on etiquetas_impressoes (restaurante_id, criado_em);

alter table etiquetas drop constraint if exists etiquetas_dados_check;
alter table etiquetas add constraint etiquetas_dados_check check (pg_column_size(dados) <= 2048);

-- ---------------------------------------------------------------------
-- 1) registrar_etiquetas (a da M52, com a trava e o teto)
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
  -- ⚠️ M55: teto por dia (a conta legítima fica muito abaixo)
  if (select count(*) from etiquetas where restaurante_id = rid and criado_em > now() - interval '1 day') >= 5000 then
    raise exception 'Limite diário de etiquetas atingido. Fale com a Aurum.';
  end if;

  insert into etiquetas (restaurante_id, id, cozinha, impressao_id, produto_id, nome,
                         impresso_em, validade, status, dados)
  select rid, x.id, x.cozinha, x.impressao_id, x.produto_id, x.nome, x.impresso_em, x.validade, x.status, x.dados
    from (
      select left(e->>'id', 80) as id,
             e->>'cozinha' as cozinha,
             case when coalesce(e->>'impressaoId', '') ~ uuid_re then (e->>'impressaoId')::uuid end as impressao_id,
             left(nullif(e->>'produtoId', ''), 80) as produto_id,
             left(coalesce(e->>'nome', ''), 120) as nome,
             case when coalesce(e->>'impressoEm', '') ~ data_re then (e->>'impressoEm')::date else current_date end as impresso_em,
             case when coalesce(e->>'validade', '') ~ data_re then (e->>'validade')::date end as validade,
             case when e->>'status' in ('consumida', 'descartada') then e->>'status' else 'valida' end as status,
             (e - 'cozinha') as dados
        from jsonb_array_elements(p_itens) e
       where coalesce(e->>'id', '') <> ''
         and coalesce(e->>'cozinha', '') ~ '^[a-z]+(#[a-z0-9]{4})?$'
         and pg_column_size(e) <= 2048
    ) x
   -- ⚠️ M55: conta liberada, ou etiqueta impressa até o último vencimento
   where _pode_gravar_etiqueta(rid, x.impresso_em)
  on conflict (restaurante_id, id) do update
     set cozinha = excluded.cozinha, impressao_id = excluded.impressao_id,
         produto_id = excluded.produto_id, nome = excluded.nome,
         impresso_em = excluded.impresso_em, validade = excluded.validade,
         status = excluded.status, dados = excluded.dados, apagada_em = null,
         criado_em = now(), atualizado_em = now()
   where etiquetas.impresso_em < excluded.impresso_em - 180
     and coalesce(etiquetas.validade, etiquetas.impresso_em) < excluded.impresso_em - 30;
  get diagnostics novas = row_count;
  return novas;
end $$;

-- ---------------------------------------------------------------------
-- 2) mudar_status_etiqueta (a da M49, com a trava — 3 dias de folga)
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
  if not _pode_gravar_etiqueta(rid, current_date - 3) then
    raise exception 'A conta não está liberada para alterações.';
  end if;
  update etiquetas set status = p_status, atualizado_em = now()
   where restaurante_id = rid and id = p_id and apagada_em is null;
  return found;
end $$;

-- ---------------------------------------------------------------------
-- 3) registrar_impressoes (a da M52, com a trava e o teto)
-- ---------------------------------------------------------------------
create or replace function registrar_impressoes(p_itens jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  rid     uuid;
  somadas integer;
  v_fixa  boolean;
  v_uni   uuid;
begin
  rid := meu_restaurante_id();
  if rid is null then return 0; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then return 0; end if;
  if jsonb_array_length(p_itens) > 200 then
    raise exception 'Lote grande demais: no máximo 200 itens por chamada.';
  end if;
  if (select count(*) from etiquetas_impressoes where restaurante_id = rid and criado_em > now() - interval '1 day') >= 5000 then
    raise exception 'Limite diário do relatório de etiquetas atingido. Fale com a Aurum.';
  end if;
  -- ⚠️ conta presa a uma unidade (M48): vale a unidade DELA, não a que o
  -- aparelho mandou. A diretoria nunca é presa (M52).
  select unidade_fixa and cargo <> 'diretoria', unidade_id into v_fixa, v_uni from perfis where id = auth.uid();

  with novas as (
    insert into etiquetas_impressoes (id, restaurante_id, dia, hora, item, responsavel, copias, reimpressao, unidade_id)
    select (e->>'id')::uuid,
           rid,
           (e->>'dia')::date,
           left(coalesce(e->>'hora', ''), 5),
           left(coalesce(e->>'item', ''), 120),
           left(coalesce(e->>'responsavel', ''), 80),
           least(greatest(coalesce((e->>'copias')::integer, 1), 1), 200),
           coalesce((e->>'reimpressao')::boolean, false),
           case when coalesce(v_fixa, false)
             then (select u.id from unidades u where u.restaurante_id = rid and u.id = v_uni)
             else (select u.id from unidades u
                    where u.restaurante_id = rid
                      and u.id = case
                        when coalesce(e->>'unidade', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                        then (e->>'unidade')::uuid end)
           end
      from jsonb_array_elements(p_itens) e
     where (e->>'dia')::date between current_date - 400 and current_date + 1
       -- ⚠️ M55: conta liberada, ou impressão feita até o último vencimento
       and _pode_gravar_etiqueta(rid, (e->>'dia')::date)
    on conflict (id) do nothing
    returning copias
  )
  select coalesce(sum(copias), 0) into somadas from novas;

  if somadas > 0 then
    update restaurantes set etiquetas_impressas = coalesce(etiquetas_impressas, 0) + somadas
     where id = rid;
  end if;
  return somadas;
end $$;

-- ---------------------------------------------------------------------
-- 4) Grants (as mesmas) + sonda
-- ---------------------------------------------------------------------
revoke all on function registrar_etiquetas(jsonb)            from public, anon;
revoke all on function mudar_status_etiqueta(text, text)      from public, anon;
revoke all on function registrar_impressoes(jsonb)           from public, anon;
grant execute on function registrar_etiquetas(jsonb)          to authenticated;
grant execute on function mudar_status_etiqueta(text, text)   to authenticated;
grant execute on function registrar_impressoes(jsonb)         to authenticated;

do $$
declare f text;
begin
  foreach f in array array['registrar_etiquetas(jsonb)', 'mudar_status_etiqueta(text, text)', 'registrar_impressoes(jsonb)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'M55: authenticated sem execute em % — abortando.', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'M55: anon consegue chamar % — abortando.', f;
    end if;
  end loop;
  if has_function_privilege('authenticated', '_pode_gravar_etiqueta(uuid, date)', 'execute') then
    raise exception 'M55: a função interna ficou exposta — abortando.';
  end if;
end $$;

commit;
