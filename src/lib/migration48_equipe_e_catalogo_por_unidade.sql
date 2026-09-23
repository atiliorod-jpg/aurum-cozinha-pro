-- =====================================================================
--  M48 — EQUIPE PRESA A UMA UNIDADE e CATÁLOGO POR UNIDADE (23/09/2026)
--
--  Pedido do dono, a segunda fase das unidades (M46):
--
--  1) EQUIPE PRESA A UMA UNIDADE. Até aqui toda conta da equipe via todas as
--     unidades e podia trocar de unidade (com confirmação) — um cozinheiro da
--     casa do Centro podia imprimir com o CNPJ da casa de Boa Viagem. Agora a
--     conta dona escolhe, conta por conta: "todas as unidades" (como era) ou
--     UMA unidade, e aí aquela conta só trabalha nela.
--     • `perfis.unidade_fixa` + `perfis.unidade_id` (nulo = a principal).
--     • ⚠️ A TRAVA É NO BANCO: a policy perfis_upd_v4 (M4) deixa cada pessoa
--       alterar o PRÓPRIO perfil. Sem o gatilho abaixo, o cozinheiro se
--       soltaria sozinho pela API. Só a função da conta dona muda isto.
--     • `registrar_impressoes` grava a unidade da conta presa (não a que o
--       aparelho mandou), e `relatorio_etiquetas` mostra só a dela.
--
--  2) CATÁLOGO POR UNIDADE. A lista de itens era uma só para a conta inteira
--     (por tipo de cozinha). Num grupo com conceitos diferentes — pizzaria e
--     hamburgueria — cada casa precisa da sua. `unidades.catalogo_proprio`
--     liga a lista própria; quem liga é a Aurum, no painel (decisão de
--     estrutura, como criar a unidade).
--     • ⚠️ AO LIGAR, A LISTA ATUAL É COPIADA para a unidade, com os mesmos
--       ids: a unidade não nasce vazia, e as etiquetas já impressas e o
--       relatório continuam apontando para os mesmos itens. Dali em diante
--       as duas listas seguem separadas.
--     • Desligar volta a unidade para a lista da conta; a própria FICA
--       guardada (religar reaproveita, não copia de novo).
--     • As chaves seguem o formato das instâncias da M22 ('producao#xxxx::
--       produtos'), que a policy de documentos já aceita — nada a mudar lá.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Colunas
-- ---------------------------------------------------------------------
alter table unidades add column if not exists catalogo_proprio boolean not null default false;
alter table perfis   add column if not exists unidade_fixa boolean not null default false;
alter table perfis   add column if not exists unidade_id uuid references unidades(id) on delete set null;

-- ---------------------------------------------------------------------
-- 2) A unidade de uma conta só muda pela função da conta dona
-- ---------------------------------------------------------------------
create or replace function _bloqueia_troca_de_unidade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.unidade_fixa is distinct from old.unidade_fixa or new.unidade_id is distinct from old.unidade_id)
     and coalesce(current_setting('aurum.muda_unidade', true), '') <> '1'
     -- a unidade foi APAGADA (só acontece ao apagar a conta inteira, M38): o
     -- "set null" da chave estrangeira tem de passar
     and not (new.unidade_id is null and old.unidade_id is not null
              and not exists (select 1 from unidades where id = old.unidade_id)) then
    raise exception 'A unidade de uma conta só muda pela conta dona.';
  end if;
  return new;
end $$;
drop trigger if exists trg_unidade_da_conta on perfis;
create trigger trg_unidade_da_conta before update on perfis
  for each row execute function _bloqueia_troca_de_unidade();

-- ---------------------------------------------------------------------
-- 3) A conta dona define a unidade de uma conta da equipe
--    p_fixa = false → todas as unidades (como sempre foi)
--    p_fixa = true e p_unidade nulo → presa à unidade PRINCIPAL
-- ---------------------------------------------------------------------
create or replace function definir_unidade_da_conta(p_usuario uuid, p_fixa boolean, p_unidade uuid default null)
returns perfis language plpgsql security definer set search_path = public as $$
declare
  rid    uuid := meu_restaurante_id();
  v_alvo perfis%rowtype;
begin
  if coalesce(meu_cargo(), '') <> 'diretoria' then
    raise exception 'Só a conta dona define a unidade da equipe.';
  end if;
  if rid is null or not coalesce(restaurante_pode_escrever(rid), false) then
    raise exception 'A conta não está liberada para alterações.';
  end if;
  select * into v_alvo from perfis where id = p_usuario and restaurante_id = rid;
  if not found then raise exception 'Conta não encontrada nesta casa.'; end if;
  if v_alvo.cargo = 'diretoria' then
    raise exception 'A diretoria trabalha em todas as unidades.';
  end if;
  if coalesce(p_fixa, false) and p_unidade is not null and not exists (
       select 1 from unidades where id = p_unidade and restaurante_id = rid and arquivada_em is null) then
    raise exception 'Unidade não encontrada nesta conta.';
  end if;
  perform set_config('aurum.muda_unidade', '1', true);
  update perfis
     set unidade_fixa = coalesce(p_fixa, false),
         unidade_id   = case when coalesce(p_fixa, false) then p_unidade end
   where id = p_usuario
   returning * into v_alvo;
  perform set_config('aurum.muda_unidade', '', true);
  return v_alvo;
end $$;

-- ---------------------------------------------------------------------
-- 4) A Aurum liga/desliga a lista de itens própria de uma unidade
-- ---------------------------------------------------------------------
create or replace function definir_catalogo_da_unidade(p_id uuid, p_proprio boolean)
returns unidades language plpgsql security definer set search_path = public as $$
declare
  v_u   unidades%rowtype;
  v_suf text;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema muda a lista de itens de uma unidade.';
  end if;
  update unidades set catalogo_proprio = coalesce(p_proprio, false) where id = p_id returning * into v_u;
  if not found then raise exception 'Unidade não encontrada.'; end if;
  if v_u.catalogo_proprio then
    -- 'producao#ab12' → a Produção (e a Finalização) da unidade leem
    -- 'producao#ab12::produtos'; o Seco lê 'seco#ab12::produtos'
    v_suf := split_part(v_u.cozinha, '#', 2);
    insert into documentos (restaurante_id, chave, dados, versao, updated_at)
    select d.restaurante_id,
           case when d.chave like 'seco::%' then 'seco#' || v_suf || '::' || substr(d.chave, 7)
                else v_u.cozinha || '::' || d.chave end,
           d.dados, 1, now()
      from documentos d
     where d.restaurante_id = v_u.restaurante_id
       and d.chave in ('produtos', 'categorias', 'fichas', 'seco::produtos', 'seco::categorias', 'seco::fichas')
    on conflict (restaurante_id, chave) do nothing;
  end if;
  return v_u;
end $$;

-- ---------------------------------------------------------------------
-- 5) Impressão: a conta presa grava a SUA unidade
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
  -- ⚠️ conta presa a uma unidade (M48): vale a unidade DELA, não a que o
  -- aparelho mandou — o relatório não pode ser enganado pelo aparelho
  select unidade_fixa, unidade_id into v_fixa, v_uni from perfis where id = auth.uid();

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
-- 6) Relatório: a conta presa vê só a sua unidade
--    (mesma assinatura e mesmo retorno da M46 — create or replace basta)
-- ---------------------------------------------------------------------
create or replace function relatorio_etiquetas(p_de date, p_ate date, p_restaurante uuid default null)
returns table (dia date, item text, responsavel text, reimpressao boolean, unidade_id uuid,
               etiquetas bigint, impressoes bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  rid    uuid;
  v_fixa boolean := false;
  v_uni  uuid;
begin
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido.';
  end if;
  if p_ate - p_de > 800 then
    raise exception 'Período longo demais.';
  end if;

  if p_restaurante is not null and coalesce(sou_super_admin(), false) then
    rid := p_restaurante;
  else
    rid := meu_restaurante_id();
    select coalesce(p.unidade_fixa, false), p.unidade_id into v_fixa, v_uni from perfis p where p.id = auth.uid();
  end if;
  if rid is null then
    raise exception 'Conta sem restaurante.';
  end if;

  return query
    select e.dia, e.item, e.responsavel, e.reimpressao, e.unidade_id,
           sum(e.copias)::bigint, count(*)::bigint
      from etiquetas_impressoes e
     where e.restaurante_id = rid
       and e.dia between p_de and p_ate
       and (not coalesce(v_fixa, false) or e.unidade_id is not distinct from v_uni)
     group by e.dia, e.item, e.responsavel, e.reimpressao, e.unidade_id
     order by e.dia;
end $$;

-- ---------------------------------------------------------------------
-- 7) Grants (M24: toda função nova nasce sem) + sonda que aborta
-- ---------------------------------------------------------------------
revoke all on function definir_unidade_da_conta(uuid, boolean, uuid) from public, anon;
revoke all on function definir_catalogo_da_unidade(uuid, boolean)    from public, anon;
revoke all on function registrar_impressoes(jsonb)                    from public, anon;
revoke all on function relatorio_etiquetas(date, date, uuid)          from public, anon;
grant execute on function definir_unidade_da_conta(uuid, boolean, uuid) to authenticated;
grant execute on function definir_catalogo_da_unidade(uuid, boolean)    to authenticated;
grant execute on function registrar_impressoes(jsonb)                    to authenticated;
grant execute on function relatorio_etiquetas(date, date, uuid)          to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'definir_unidade_da_conta(uuid, boolean, uuid)',
    'definir_catalogo_da_unidade(uuid, boolean)',
    'registrar_impressoes(jsonb)',
    'relatorio_etiquetas(date, date, uuid)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'M48: authenticated sem execute em % — abortando.', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'M48: anon consegue chamar % — abortando.', f;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'trg_unidade_da_conta' and not tgisinternal) then
    raise exception 'M48: a trava da unidade da conta não foi criada — abortando.';
  end if;
end $$;

commit;
