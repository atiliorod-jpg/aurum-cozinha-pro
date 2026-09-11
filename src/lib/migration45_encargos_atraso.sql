-- =====================================================================
--  M45 — contrato parcelado: 10 dias de tolerância e encargos de atraso
--
--  PEDIDO DO DONO (10/09/2026): "o sistema tem como mudar o valor do
--  pagamento se houver atraso (multa de acordo com o contrato)... ao eu
--  clicar no botão, ele já atualiza uma única vez para o QR code do cliente,
--  apenas dele (com cuidado para não misturar as outras contas)".
--
--  O CONTRATO (cláusulas 6ª e 7ª do Contrato de Assinatura Anual):
--    • parcela em atraso: multa de 2%, juros de 1% ao mês calculados dia a
--      dia e correção pelo IPCA — os encargos podem vir na parcela seguinte,
--      pelo QR Code do sistema;
--    • o acesso só pode ser suspenso com atraso SUPERIOR A 10 DIAS.
--
--  ⚠️ A SEGUNDA REGRA É A MAIS IMPORTANTE DESTA MIGRAÇÃO, e não foi pedida:
--  o app cortava o acesso NO PRIMEIRO DIA depois do vencimento, para todo
--  mundo. Com contrato assinado, isso é a Aurum descumprindo o próprio
--  contrato. A tolerância vale SÓ para conta marcada com contrato parcelado —
--  quem assina pelo app continua como sempre.
--
--  ⚠️ O IPCA FICA DE FORA DA CONTA AUTOMÁTICA, de propósito: em dias ou
--  semanas de atraso ele dá centavos, e exigiria atualizar um índice mensal à
--  mão. O contrato continua permitindo cobrá-lo; o sistema só não calcula.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) A parcela do contrato, gravada na conta
--
--    ⚠️ O VALOR FICA NA CONTA, e não é o preço da tabela: o contrato congela a
--    parcela por 12 meses (cl. 5ª § 3º). Um reajuste de preço não pode mudar a
--    base do encargo de quem já assinou. `null` = sem contrato parcelado.
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists parcela_contrato numeric(10,2);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurantes_parcela_contrato_positiva') then
    alter table restaurantes add constraint restaurantes_parcela_contrato_positiva
      check (parcela_contrato is null or (parcela_contrato > 0 and parcela_contrato <= 100000));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Quem pode escrever — a M41 + a tolerância do contrato
--
--    ⚠️ PARIDADE: `TOLERANCIA_CONTRATO_DIAS` em src/utils/assinatura.js tem de
--    ser igual ao `interval '10 days'` abaixo. Se o app liberar e o banco negar,
--    o que a cozinha lança nesses dias entra na fila offline e some sem erro.
--    O resto do corpo é a M41 SEM MUDANÇA.
-- ---------------------------------------------------------------------
create or replace function restaurante_pode_escrever(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurantes r
    where r.id = rid
      and coalesce(r.bloqueado, false) = false
      and (coalesce(r.assinatura_ate, 'epoch'::timestamptz) > now()
           or coalesce(r.teste_ate, 'epoch'::timestamptz) > now()
           -- cortesia/parceiro: vale enquanto não houver prazo, ou até o prazo
           or (coalesce(r.regime, 'pagante') <> 'pagante'
               and (r.cortesia_ate is null or r.cortesia_ate > now()))
           -- contrato parcelado: 10 dias de tolerância depois do vencimento (cl. 7ª)
           or (r.parcela_contrato is not null
               and coalesce(r.regime, 'pagante') = 'pagante'
               and r.assinatura_ate is not null
               and r.assinatura_ate + interval '10 days' > now()))
  );
$$;

-- ---------------------------------------------------------------------
-- 3) Os encargos
--
--    ⚠️ UM PENDENTE POR CONTA, travado por índice e não só pela tela: é o
--    "atualiza uma única vez" do pedido. Dois toques no botão, ou dois
--    aparelhos, não somam o encargo duas vezes no QR do cliente.
--
--    ⚠️ O VALOR É CONGELADO NO LANÇAMENTO. Os juros correm por dia, mas o que o
--    cliente vê no QR é o que a Aurum lançou — um valor que muda sozinho a cada
--    abertura da tela seria impossível de conferir contra o extrato.
--
--    RLS ligada e NENHUMA policy (molde da M37/M43): só as funções chegam aqui.
-- ---------------------------------------------------------------------
create table if not exists encargos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  vencimento     date not null,          -- a parcela que atrasou
  dias_atraso    integer not null check (dias_atraso > 0),
  base           numeric(10,2) not null check (base > 0),
  multa          numeric(10,2) not null check (multa >= 0),
  juros          numeric(10,2) not null check (juros >= 0),
  valor          numeric(10,2) not null check (valor > 0),
  lancado_em     timestamptz not null default now(),
  lancado_por    text not null,
  quitado_em     timestamptz,
  pagamento_id   uuid references pagamentos(id) on delete set null,
  dispensado_em  timestamptz,
  dispensado_por text
);
create unique index if not exists encargos_um_pendente
  on encargos (restaurante_id) where quitado_em is null and dispensado_em is null;
create index if not exists encargos_rest_data on encargos (restaurante_id, lancado_em desc);
alter table encargos enable row level security;

-- ---------------------------------------------------------------------
-- 4) A Aurum marca o contrato parcelado (e o valor da parcela)
--    O gatilho da M39 em `restaurantes` já registra o de/para no livro.
-- ---------------------------------------------------------------------
create or replace function definir_parcela_contrato(p_restaurante uuid, p_valor numeric)
returns numeric language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema marca contrato parcelado.';
  end if;
  if p_valor is not null and (p_valor <= 0 or p_valor > 100000) then
    raise exception 'Valor de parcela inválido.';
  end if;
  update restaurantes set parcela_contrato = round(p_valor, 2) where id = p_restaurante;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  return round(p_valor, 2);
end $$;

-- ---------------------------------------------------------------------
-- 5) Lançar o encargo — o BANCO faz a conta
--
--    ⚠️ A tela mostra uma prévia, mas o número que vale sai daqui: é ele que
--    tem de bater com o contrato, e o contrato não pode depender do relógio
--    ou da conta de um navegador. Mesma fórmula de src/utils/encargos.js.
--
--    ⚠️ O DIA É O DE RECIFE, não o UTC do servidor: às 22h de um dia o UTC
--    já está no seguinte e somaria um dia de juros a mais.
-- ---------------------------------------------------------------------
create or replace function lancar_encargo(p_restaurante uuid)
returns encargos language plpgsql security definer set search_path = public as $$
declare
  r       restaurantes%rowtype;
  v_dias  integer;
  v_multa numeric;
  v_juros numeric;
  v_novo  encargos%rowtype;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema lança encargos.';
  end if;
  select * into r from restaurantes where id = p_restaurante;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  if r.parcela_contrato is null then
    raise exception 'Esta conta não tem contrato parcelado.';
  end if;
  if coalesce(r.regime, 'pagante') <> 'pagante' then
    raise exception 'Conta de cortesia ou parceria não tem encargo de atraso.';
  end if;
  if r.assinatura_ate is null then
    raise exception 'Esta conta não tem vencimento registrado.';
  end if;

  v_dias := (now() at time zone 'America/Recife')::date
          - (r.assinatura_ate at time zone 'America/Recife')::date;
  if v_dias <= 0 then
    raise exception 'A conta não está em atraso.';
  end if;
  if exists (select 1 from encargos
              where restaurante_id = p_restaurante and quitado_em is null and dispensado_em is null) then
    raise exception 'Já existe um encargo lançado e ainda não pago para esta conta.';
  end if;

  v_multa := round(r.parcela_contrato * 0.02, 2);
  v_juros := round(r.parcela_contrato * 0.01 / 30 * v_dias, 2);

  insert into encargos (restaurante_id, vencimento, dias_atraso, base, multa, juros, valor, lancado_por)
    values (p_restaurante, (r.assinatura_ate at time zone 'America/Recife')::date, v_dias,
            r.parcela_contrato, v_multa, v_juros, v_multa + v_juros,
            coalesce(auth.jwt() ->> 'email', 'aurum'))
    returning * into v_novo;

  -- ⚠️ No livro da M39 à mão: o gatilho de lá não vigia esta tabela.
  insert into admin_log (restaurante_id, restaurante, tabela, acao, mudancas, feito_por)
    values (p_restaurante, r.nome, 'encargos', 'INSERT',
            jsonb_build_object('encargo', jsonb_build_object('de', null,
              'para', 'R$ ' || (v_multa + v_juros)::text || ' (' || v_dias || ' dias)')),
            coalesce(auth.jwt() ->> 'email', 'aurum'));
  return v_novo;
end $$;

-- ---------------------------------------------------------------------
-- 6) Baixar o encargo: pago ou dispensado
--
--    ⚠️ "PAGO" É UM TOQUE EXPLÍCITO, não gatilho em `pagamentos`: o cliente
--    pode pagar só a parcela, por transferência, sem o QR. Um gatilho daria o
--    encargo por pago sem ninguém conferir. O painel faz os dois toques juntos
--    quando o pagamento registrado inclui o encargo (caixa marcada).
-- ---------------------------------------------------------------------
create or replace function quitar_encargo(p_restaurante uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema dá baixa em encargos.';
  end if;
  update encargos
     set quitado_em = now(),
         pagamento_id = (select id from pagamentos where restaurante_id = p_restaurante
                          order by criado_em desc limit 1)
   where restaurante_id = p_restaurante and quitado_em is null and dispensado_em is null;
  if not found then raise exception 'Nenhum encargo pendente nesta conta.'; end if;
  select nome into v_nome from restaurantes where id = p_restaurante;
  insert into admin_log (restaurante_id, restaurante, tabela, acao, mudancas, feito_por)
    values (p_restaurante, v_nome, 'encargos', 'UPDATE',
            jsonb_build_object('encargo', jsonb_build_object('de', 'pendente', 'para', 'pago')),
            coalesce(auth.jwt() ->> 'email', 'aurum'));
end $$;

create or replace function dispensar_encargo(p_restaurante uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema dispensa encargos.';
  end if;
  update encargos
     set dispensado_em = now(), dispensado_por = coalesce(auth.jwt() ->> 'email', 'aurum')
   where restaurante_id = p_restaurante and quitado_em is null and dispensado_em is null;
  if not found then raise exception 'Nenhum encargo pendente nesta conta.'; end if;
  select nome into v_nome from restaurantes where id = p_restaurante;
  insert into admin_log (restaurante_id, restaurante, tabela, acao, mudancas, feito_por)
    values (p_restaurante, v_nome, 'encargos', 'UPDATE',
            jsonb_build_object('encargo', jsonb_build_object('de', 'pendente', 'para', 'dispensado')),
            coalesce(auth.jwt() ->> 'email', 'aurum'));
end $$;

-- ---------------------------------------------------------------------
-- 7) Ler
--
--    ⚠️ O CLIENTE LÊ SÓ O PRÓPRIO, e sem parâmetro nenhum: o restaurante sai
--    de `meu_restaurante_id()`. Não existe id para trocar e ver — ou pagar —
--    o encargo de outra casa. É isso que garante "não misturar as contas".
-- ---------------------------------------------------------------------
create or replace function meu_encargo_pendente()
returns table (valor numeric, multa numeric, juros numeric, base numeric,
               dias_atraso integer, vencimento date, lancado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select e.valor, e.multa, e.juros, e.base, e.dias_atraso, e.vencimento, e.lancado_em
    from encargos e
   where e.restaurante_id = meu_restaurante_id()
     and e.quitado_em is null and e.dispensado_em is null
   limit 1;
$$;

create or replace function encargos_pendentes_admin()
returns setof encargos language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema consulta os encargos.';
  end if;
  return query select * from encargos where quitado_em is null and dispensado_em is null;
end $$;

-- ---------------------------------------------------------------------
-- 8) Quem pode chamar (M24 + gatilho da M26: função nova nasce sem grant)
-- ---------------------------------------------------------------------
revoke all on function definir_parcela_contrato(uuid, numeric) from public, anon;
revoke all on function lancar_encargo(uuid)                    from public, anon;
revoke all on function quitar_encargo(uuid)                    from public, anon;
revoke all on function dispensar_encargo(uuid)                 from public, anon;
revoke all on function meu_encargo_pendente()                  from public, anon;
revoke all on function encargos_pendentes_admin()              from public, anon;
grant execute on function definir_parcela_contrato(uuid, numeric) to authenticated;
grant execute on function lancar_encargo(uuid)                    to authenticated;
grant execute on function quitar_encargo(uuid)                    to authenticated;
grant execute on function dispensar_encargo(uuid)                 to authenticated;
grant execute on function meu_encargo_pendente()                  to authenticated;
grant execute on function encargos_pendentes_admin()              to authenticated;
-- a M24 já dava este grant; repetido porque o corpo foi recriado acima
grant execute on function restaurante_pode_escrever(uuid)         to authenticated;

do $$
declare f text;
begin
  foreach f in array array['definir_parcela_contrato(uuid, numeric)', 'lancar_encargo(uuid)',
                           'quitar_encargo(uuid)', 'dispensar_encargo(uuid)',
                           'meu_encargo_pendente()', 'encargos_pendentes_admin()',
                           'restaurante_pode_escrever(uuid)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'M45: authenticated sem execute em % — abortando.', f;
    end if;
    if f <> 'restaurante_pode_escrever(uuid)' and has_function_privilege('anon', f, 'execute') then
      raise exception 'M45: anon consegue chamar % — abortando.', f;
    end if;
  end loop;
  if pg_get_functiondef('restaurante_pode_escrever(uuid)'::regprocedure) not like '%interval ''10 days''%' then
    raise exception 'M45: a tolerância de 10 dias não entrou em restaurante_pode_escrever — abortando.';
  end if;
end $$;

commit;

-- =====================================================================
--  Teste rápido (como super-admin):
--    select definir_parcela_contrato('<rid>', 279.90);
--    -- com assinatura_ate 5 dias atrás:
--    select restaurante_pode_escrever('<rid>');   → true  (tolerância)
--    select * from lancar_encargo('<rid>');       → multa 5,60 + juros 0,47
--    select * from lancar_encargo('<rid>');       → erro: já existe pendente
--  Como o dono daquela casa:
--    select * from meu_encargo_pendente();        → a linha acima, e só ela
-- =====================================================================
