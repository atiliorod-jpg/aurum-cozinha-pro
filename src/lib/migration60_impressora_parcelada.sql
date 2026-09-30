-- =====================================================================
--  M60 — IMPRESSORA PARCELADA (30/09/2026, decisão do dono)
--
--  A impressora deixou de ser CEDIDA no plano anual por contrato e passou a
--  ser VENDIDA em parcelas no 1º ano, junto com a assinatura:
--     mensal    → 12 × R$ 60   (R$ 720)
--     semestral →  2 × R$ 290  (R$ 580)
--     anual     →  1 × R$ 560
--  Paga no MESMO QR do sistema. Quitada, é do cliente, e a cobrança volta a
--  ser só a do sistema — sem ninguém precisar lembrar. Cancelou antes: o
--  saldo é cobrado conforme o contrato ("Cobrar o saldo" → cobrança à parte,
--  M54). Cada impressora é uma linha: a unidade adicional que quiser a sua
--  paga a mesma tabela.
--
--  ⚠️ OS VALORES NÃO MORAM AQUI: vêm do app (IMPRESSORA_PARCELADA, em
--  utils/assinatura.js), e o banco só confere a faixa. Assim um desconto
--  combinado numa venda não exige migração.
--
--  ⚠️ UMA FORMA DE PAGAMENTO POR VEZ. As parcelas só batem com o QR se o
--  período pago for o da impressora; por isso duas impressoras em pagamento
--  na mesma conta têm de ter a mesma forma, e o cliente não troca de
--  período enquanto paga (a tela trava).
-- =====================================================================

begin;

create table if not exists impressoras_vendidas (
  id               uuid primary key default gen_random_uuid(),
  restaurante_id   uuid not null references restaurantes(id) on delete cascade,
  unidade_id       uuid references unidades(id) on delete set null,
  forma            text not null check (forma in ('mensal', 'semestral', 'anual')),
  parcelas         integer not null check (parcelas between 1 and 24),
  valor_parcela    numeric(10,2) not null check (valor_parcela > 0 and valor_parcela <= 10000),
  parcelas_pagas   integer not null default 0,
  inicio           date not null default current_date,
  observacao       text check (observacao is null or length(observacao) <= 200),
  saldo_cobrado_em timestamptz,
  removida_em      timestamptz,
  criada_em        timestamptz not null default now(),
  criada_por       text,
  constraint impressoras_pagas_na_faixa check (parcelas_pagas between 0 and parcelas)
);
create index if not exists impressoras_vendidas_rest on impressoras_vendidas (restaurante_id) where removida_em is null;
alter table impressoras_vendidas enable row level security;
revoke all on impressoras_vendidas from anon, authenticated;

-- livro do painel (M39): quem vendeu, corrigiu ou cobrou o saldo
drop trigger if exists trg_log_impressoras_vendidas on impressoras_vendidas;
create trigger trg_log_impressoras_vendidas after insert or update or delete on impressoras_vendidas
  for each row execute function _registrar_acao_admin();

-- Em pagamento: não removida, saldo não cobrado à parte, parcelas faltando.
create or replace function _impressora_em_pagamento(i impressoras_vendidas)
returns boolean language sql immutable set search_path = public as $$
  select i.removida_em is null and i.saldo_cobrado_em is null and i.parcelas_pagas < i.parcelas;
$$;
revoke all on function _impressora_em_pagamento(impressoras_vendidas) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- O cliente lê as SUAS (a tela de pagamento soma a parcela no QR)
-- ---------------------------------------------------------------------
create or replace function minhas_impressoras()
returns table (id uuid, unidade_id uuid, forma text, parcelas integer, valor_parcela numeric,
               parcelas_pagas integer, inicio date, saldo_cobrado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.unidade_id, i.forma, i.parcelas, i.valor_parcela, i.parcelas_pagas, i.inicio, i.saldo_cobrado_em
    from impressoras_vendidas i
   where i.restaurante_id = meu_restaurante_id() and i.removida_em is null
   order by i.criada_em;
$$;
revoke all on function minhas_impressoras() from public, anon;
grant execute on function minhas_impressoras() to authenticated;

-- ---------------------------------------------------------------------
-- O painel (super-admin)
-- ---------------------------------------------------------------------
create or replace function impressoras_admin()
returns setof impressoras_vendidas language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema consulta as impressoras.';
  end if;
  return query select * from impressoras_vendidas where removida_em is null order by restaurante_id, criada_em;
end $$;
revoke all on function impressoras_admin() from public, anon;
grant execute on function impressoras_admin() to authenticated;

create or replace function adicionar_impressora(p_restaurante uuid, p_forma text, p_parcelas integer,
                                                p_valor_parcela numeric, p_inicio date default null,
                                                p_unidade uuid default null, p_observacao text default null)
returns impressoras_vendidas language plpgsql security definer set search_path = public as $$
declare
  v_nova impressoras_vendidas%rowtype;
  v_outra text;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema vende impressoras.';
  end if;
  if not exists (select 1 from restaurantes where id = p_restaurante) then raise exception 'Restaurante não encontrado.'; end if;
  if p_forma is null or p_forma not in ('mensal', 'semestral', 'anual') then raise exception 'Forma de pagamento inválida.'; end if;
  if p_parcelas is null or p_parcelas < 1 or p_parcelas > 24 then raise exception 'Número de parcelas inválido (1 a 24).'; end if;
  if p_valor_parcela is null or p_valor_parcela <= 0 or p_valor_parcela > 10000 then raise exception 'Valor da parcela inválido.'; end if;
  if p_unidade is not null and not exists (select 1 from unidades where id = p_unidade and restaurante_id = p_restaurante) then
    raise exception 'A unidade não é desta conta.';
  end if;
  -- ⚠️ uma forma de pagamento por vez (ver o cabeçalho)
  select i.forma into v_outra from impressoras_vendidas i
   where i.restaurante_id = p_restaurante and _impressora_em_pagamento(i) and i.forma <> p_forma
   limit 1;
  if v_outra is not null then
    raise exception 'Esta conta já paga uma impressora no %. Use a mesma forma de pagamento.', v_outra;
  end if;
  insert into impressoras_vendidas (restaurante_id, unidade_id, forma, parcelas, valor_parcela, inicio, observacao, criada_por)
  values (p_restaurante, p_unidade, p_forma, p_parcelas, round(p_valor_parcela, 2),
          coalesce(p_inicio, current_date), nullif(left(btrim(coalesce(p_observacao, '')), 200), ''),
          coalesce(auth.jwt() ->> 'email', 'aurum'))
  returning * into v_nova;
  return v_nova;
end $$;
revoke all on function adicionar_impressora(uuid, text, integer, numeric, date, uuid, text) from public, anon;
grant execute on function adicionar_impressora(uuid, text, integer, numeric, date, uuid, text) to authenticated;

-- Registrou o pagamento com a parcela da impressora junto: avança UMA parcela
-- de cada impressora em pagamento (a forma é a mesma do período pago).
create or replace function pagar_parcela_impressora(p_restaurante uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema registra pagamentos.';
  end if;
  update impressoras_vendidas i set parcelas_pagas = i.parcelas_pagas + 1
   where i.restaurante_id = p_restaurante and _impressora_em_pagamento(i);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function pagar_parcela_impressora(uuid) from public, anon;
grant execute on function pagar_parcela_impressora(uuid) to authenticated;

-- Corrigir a contagem (engano no registro, pagamento feito por fora)
create or replace function corrigir_parcelas_impressora(p_id uuid, p_pagas integer)
returns impressoras_vendidas language plpgsql security definer set search_path = public as $$
declare v impressoras_vendidas%rowtype;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema corrige parcelas.';
  end if;
  update impressoras_vendidas set parcelas_pagas = p_pagas
   where id = p_id and removida_em is null and p_pagas between 0 and parcelas
  returning * into v;
  if not found then raise exception 'Parcelas fora da faixa, ou impressora não encontrada.'; end if;
  return v;
end $$;
revoke all on function corrigir_parcelas_impressora(uuid, integer) from public, anon;
grant execute on function corrigir_parcelas_impressora(uuid, integer) to authenticated;

-- Cancelou antes de quitar: o saldo vira cobrança à parte (M54), no QR dele
create or replace function cobrar_saldo_impressora(p_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v impressoras_vendidas%rowtype;
  v_faltam integer;
  v_saldo numeric;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema cobra o saldo.';
  end if;
  select * into v from impressoras_vendidas where id = p_id for update;
  if not found or v.removida_em is not null then raise exception 'Impressora não encontrada.'; end if;
  if not _impressora_em_pagamento(v) then raise exception 'Esta impressora não tem saldo a cobrar.'; end if;
  v_faltam := v.parcelas - v.parcelas_pagas;
  v_saldo := round(v_faltam * v.valor_parcela, 2);
  perform lancar_cobranca_avulsa(v.restaurante_id,
    'Saldo da impressora: ' || v_faltam || ' parcela(s) de R$ ' || replace(to_char(v.valor_parcela, 'FM999990.00'), '.', ','),
    v_saldo);
  update impressoras_vendidas set saldo_cobrado_em = now() where id = p_id;
  return v_saldo;
end $$;
revoke all on function cobrar_saldo_impressora(uuid) from public, anon;
grant execute on function cobrar_saldo_impressora(uuid) to authenticated;

-- Lançada por engano
create or replace function remover_impressora(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema remove impressoras.';
  end if;
  update impressoras_vendidas set removida_em = now() where id = p_id and removida_em is null;
  if not found then raise exception 'Impressora não encontrada.'; end if;
end $$;
revoke all on function remover_impressora(uuid) from public, anon;
grant execute on function remover_impressora(uuid) to authenticated;

do $$
declare f text;
begin
  foreach f in array array['minhas_impressoras()', 'impressoras_admin()',
      'adicionar_impressora(uuid, text, integer, numeric, date, uuid, text)', 'pagar_parcela_impressora(uuid)',
      'corrigir_parcelas_impressora(uuid, integer)', 'cobrar_saldo_impressora(uuid)', 'remover_impressora(uuid)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'M60: authenticated sem execute em % — abortando.', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'M60: anon consegue chamar % — abortando.', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'impressoras_vendidas', 'select')
     or has_table_privilege('anon', 'impressoras_vendidas', 'select') then
    raise exception 'M60: impressoras_vendidas legível direto pelo cliente — abortando.';
  end if;
end $$;

commit;
