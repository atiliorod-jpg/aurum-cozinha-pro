-- =====================================================================
--  M54 — DESCONTO COMBINADO e COBRANÇA À PARTE (28/09/2026)
--
--  Pedidos do dono:
--
--  1) DESCONTO COMBINADO, em REAIS ou em PERCENTUAL, com motivo e, se quiser,
--     com data para acabar. Antes o painel só conseguia um valor diferente
--     pelo contrato parcelado (parcela fixa, sem semestral/anual) — e o
--     "Registrar pagamento" aceitava qualquer valor, mas o CLIENTE continuava
--     vendo o preço cheio no app. Agora o desconto aparece para ele (preço
--     cheio riscado) no mensal, no semestral e no anual, e o Pix sai certo.
--     • valor em reais = R$ X a menos POR MÊS (plano + unidades);
--     • percentual = X% a menos sobre o mês (plano + unidades);
--     • depois vale o desconto do período (5% semestral, 10% anual);
--     • contrato parcelado não usa: a parcela é o valor combinado.
--     Colunas em `restaurantes` (o cliente já lê a própria linha; só a Aurum
--     grava, pela função). O livro do painel (M39) registra o de/para.
--
--  2) COBRANÇA À PARTE. A unidade criada no meio de um semestral ou anual já
--     pago não pode esperar a renovação: o dono decidiu cobrar à parte o que
--     falta até o vencimento. Serve para qualquer cobrança avulsa combinada.
--     • tabela `cobrancas_avulsas`, RLS sem policy (molde da M45): só as
--       funções chegam; o cliente lê SÓ as próprias pendentes, sem parâmetro.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Desconto combinado
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists desconto_tipo   text;
alter table restaurantes add column if not exists desconto_valor  numeric(10,2);
alter table restaurantes add column if not exists desconto_ate    date;
alter table restaurantes add column if not exists desconto_motivo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurantes_desconto_coerente') then
    alter table restaurantes add constraint restaurantes_desconto_coerente check (
      (desconto_tipo is null and desconto_valor is null)
      or (desconto_tipo = 'percentual' and desconto_valor > 0 and desconto_valor <= 90)
      or (desconto_tipo = 'valor' and desconto_valor > 0 and desconto_valor <= 100000)
    );
  end if;
end $$;

create or replace function definir_desconto(p_restaurante uuid, p_tipo text, p_valor numeric,
                                            p_ate date default null, p_motivo text default null)
returns restaurantes language plpgsql security definer set search_path = public as $$
declare r restaurantes%rowtype;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema define desconto.';
  end if;
  if p_tipo is null then
    update restaurantes set desconto_tipo = null, desconto_valor = null, desconto_ate = null, desconto_motivo = null
     where id = p_restaurante returning * into r;
  else
    if p_tipo not in ('percentual', 'valor') then raise exception 'Tipo de desconto inválido.'; end if;
    if p_valor is null or p_valor <= 0 then raise exception 'Valor de desconto inválido.'; end if;
    if p_tipo = 'percentual' and p_valor > 90 then raise exception 'Percentual acima de 90%%.'; end if;
    if p_ate is not null and p_ate < (now() at time zone 'America/Recife')::date then
      raise exception 'A data final já passou.';
    end if;
    update restaurantes
       set desconto_tipo = p_tipo, desconto_valor = round(p_valor, 2), desconto_ate = p_ate,
           desconto_motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 200)
     where id = p_restaurante returning * into r;
  end if;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 2) Cobrança à parte
-- ---------------------------------------------------------------------
create table if not exists cobrancas_avulsas (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  descricao      text not null check (length(descricao) between 1 and 200),
  valor          numeric(10,2) not null check (valor > 0 and valor <= 100000),
  lancado_em     timestamptz not null default now(),
  lancado_por    text not null,
  quitado_em     timestamptz,
  dispensado_em  timestamptz,
  dispensado_por text
);
create index if not exists cobrancas_avulsas_pendentes
  on cobrancas_avulsas (restaurante_id) where quitado_em is null and dispensado_em is null;
alter table cobrancas_avulsas enable row level security;

create or replace function lancar_cobranca_avulsa(p_restaurante uuid, p_descricao text, p_valor numeric)
returns cobrancas_avulsas language plpgsql security definer set search_path = public as $$
declare v_nome text; v_nova cobrancas_avulsas%rowtype;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema lança cobranças.';
  end if;
  select nome into v_nome from restaurantes where id = p_restaurante;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  if nullif(btrim(coalesce(p_descricao, '')), '') is null then raise exception 'Descreva a cobrança.'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000 then raise exception 'Valor inválido.'; end if;
  insert into cobrancas_avulsas (restaurante_id, descricao, valor, lancado_por)
    values (p_restaurante, left(btrim(p_descricao), 200), round(p_valor, 2), coalesce(auth.jwt() ->> 'email', 'aurum'))
    returning * into v_nova;
  insert into admin_log (restaurante_id, restaurante, tabela, acao, mudancas, feito_por)
    values (p_restaurante, v_nome, 'cobrancas_avulsas', 'INSERT',
            jsonb_build_object('cobrança à parte', jsonb_build_object('de', null,
              'para', v_nova.descricao || ' — R$ ' || v_nova.valor::text)),
            coalesce(auth.jwt() ->> 'email', 'aurum'));
  return v_nova;
end $$;

-- p_pago = true: recebida; false: dispensada
create or replace function baixar_cobranca_avulsa(p_id uuid, p_pago boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c cobrancas_avulsas%rowtype; v_nome text;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema dá baixa em cobranças.';
  end if;
  update cobrancas_avulsas
     set quitado_em    = case when p_pago then now() end,
         dispensado_em = case when p_pago then null else now() end,
         dispensado_por = case when p_pago then null else coalesce(auth.jwt() ->> 'email', 'aurum') end
   where id = p_id and quitado_em is null and dispensado_em is null
   returning * into c;
  if not found then raise exception 'Cobrança não encontrada ou já baixada.'; end if;
  select nome into v_nome from restaurantes where id = c.restaurante_id;
  insert into admin_log (restaurante_id, restaurante, tabela, acao, mudancas, feito_por)
    values (c.restaurante_id, v_nome, 'cobrancas_avulsas', 'UPDATE',
            jsonb_build_object('cobrança à parte', jsonb_build_object('de', 'pendente',
              'para', case when p_pago then 'paga' else 'dispensada' end)),
            coalesce(auth.jwt() ->> 'email', 'aurum'));
end $$;

-- ⚠️ O CLIENTE LÊ SÓ AS PRÓPRIAS, sem parâmetro (molde de meu_encargo_pendente)
create or replace function minhas_cobrancas_avulsas()
returns table (id uuid, descricao text, valor numeric, lancado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.descricao, c.valor, c.lancado_em
    from cobrancas_avulsas c
   where c.restaurante_id = meu_restaurante_id()
     and c.quitado_em is null and c.dispensado_em is null
   order by c.lancado_em;
$$;

create or replace function cobrancas_avulsas_admin()
returns setof cobrancas_avulsas language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema consulta as cobranças.';
  end if;
  return query select * from cobrancas_avulsas where quitado_em is null and dispensado_em is null order by lancado_em;
end $$;

-- ---------------------------------------------------------------------
-- 3) Grants (M24: função nova nasce sem) + sonda
-- ---------------------------------------------------------------------
revoke all on function definir_desconto(uuid, text, numeric, date, text)      from public, anon;
revoke all on function lancar_cobranca_avulsa(uuid, text, numeric)            from public, anon;
revoke all on function baixar_cobranca_avulsa(uuid, boolean)                  from public, anon;
revoke all on function minhas_cobrancas_avulsas()                             from public, anon;
revoke all on function cobrancas_avulsas_admin()                              from public, anon;
grant execute on function definir_desconto(uuid, text, numeric, date, text)   to authenticated;
grant execute on function lancar_cobranca_avulsa(uuid, text, numeric)         to authenticated;
grant execute on function baixar_cobranca_avulsa(uuid, boolean)               to authenticated;
grant execute on function minhas_cobrancas_avulsas()                          to authenticated;
grant execute on function cobrancas_avulsas_admin()                           to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'definir_desconto(uuid, text, numeric, date, text)',
    'lancar_cobranca_avulsa(uuid, text, numeric)',
    'baixar_cobranca_avulsa(uuid, boolean)',
    'minhas_cobrancas_avulsas()',
    'cobrancas_avulsas_admin()'] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'M54: authenticated sem execute em % — abortando.', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'M54: anon consegue chamar % — abortando.', f;
    end if;
  end loop;
  if exists (select 1 from pg_policies where tablename = 'cobrancas_avulsas') then
    raise exception 'M54: cobrancas_avulsas ganhou policy — abortando.';
  end if;
end $$;

commit;
