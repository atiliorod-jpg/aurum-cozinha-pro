-- =====================================================================
--  M37 — regime da conta e registro de pagamento
--
--  ⚠️ O QUE FALTAVA. O sistema tinha COBRANÇA e não tinha FINANCEIRO. A conta
--  guardava uma data — `assinatura_ate` — e mais nada: ao liberar dias, o
--  aviso de pagamento era apagado e NENHUM registro ficava de que houve
--  pagamento. Perguntas que o painel não conseguia responder:
--     • quanto entrou este mês?
--     • este cliente já pagou quantas vezes, e de quanto?
--     • foi mensal ou semestral aquele pagamento de março?
--  A "receita" que o painel mostra hoje é ESTIMATIVA pelo preço do plano das
--  contas ativas, e continuará sendo até esta tabela existir.
--
--  ⚠️ E NÃO EXISTIA CONTA DE CORTESIA. Para manter alguém rodando de graça —
--  um piloto, um cliente de consultoria, a conta da própria casa — só havia
--  clicar "liberar dias" para sempre. Pior: essa conta aparecia no painel como
--  cliente pagante igual aos outros e entrava na conta de receita, inflando o
--  número justamente onde não há dinheiro. Daí o REGIME.
--
--  ⚠️ REGIME E ASSINATURA SÃO EIXOS DIFERENTES, e misturá-los é o próximo bug:
--     regime          → POR QUE esta conta está ativa   (cobrança/cortesia)
--     assinatura_ate  → ATÉ QUANDO ela pode escrever    (acesso)
--  Cortesia não é "assinatura infinita": é uma conta que não entra na fila de
--  cobrança nem na receita. Quem manda no acesso continua sendo a data.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) O regime da conta
--
--    'pagante'  — cliente normal (padrão; é o que toda conta é hoje)
--    'cortesia' — não paga, por decisão da Aurum. Fora da fila e da receita.
--    'parceiro' — parceria comercial. Mesma regra da cortesia no dinheiro,
--                 separado só para a Aurum saber quantos são de cada tipo.
--
--    ⚠️ SEM 'teste': teste não é regime, é a fase em que a conta está — e ela
--    já é calculada por created_at + TESTE_DIAS. Guardar em coluna criaria
--    duas fontes para a mesma verdade, e uma delas envelheceria.
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists regime text not null default 'pagante';
alter table restaurantes add column if not exists regime_motivo text;
-- Cortesia com prazo (piloto de 3 meses, por exemplo). NULL = sem prazo.
alter table restaurantes add column if not exists cortesia_ate timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurantes_regime_check') then
    alter table restaurantes add constraint restaurantes_regime_check
      check (regime in ('pagante', 'cortesia', 'parceiro'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Os pagamentos
--
--    ⚠️ `valor` É NUMERIC(10,2), NUNCA float. Dinheiro em ponto flutuante
--    soma errado por arredondamento — 0.1 + 0.2 não dá 0.3 — e o erro aparece
--    justo no total do mês, que é onde ninguém quer descobrir surpresa.
--
--    ⚠️ `contas_extras` e `valor_extras` existem para o adicional por conta de
--    equipe além do que o plano inclui. O PREÇO fica de fora de propósito: é
--    negociado caso a caso e ainda não foi definido pelo dono — quem digita o
--    valor é ele, no ato do registro. Cravar um número aqui seria inventar
--    tabela de preço.
-- ---------------------------------------------------------------------
create table if not exists pagamentos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  pago_em        date not null default current_date,
  valor          numeric(10,2) not null check (valor >= 0),
  plano          text,            -- mensal | semestral | anual (informativo)
  produto        text,            -- etiquetas | completo, no momento do pagamento
  dias           integer not null check (dias >= 0),
  meio           text default 'pix',
  contas_extras  integer not null default 0 check (contas_extras >= 0),
  valor_extras   numeric(10,2) not null default 0 check (valor_extras >= 0),
  observacao     text,
  registrado_por text,            -- e-mail de quem registrou (só a Aurum registra)
  criado_em      timestamptz not null default now()
);

alter table pagamentos enable row level security;
-- ⚠️ SEM POLICY NENHUMA, igual à documentos_historico (M31): todo acesso passa
-- pelas RPCs abaixo. Dado financeiro não tem por que ser alcançável pelo
-- PostgREST, nem para leitura.

create index if not exists idx_pagamentos_rest on pagamentos (restaurante_id, pago_em desc);

-- ---------------------------------------------------------------------
-- 3) Registrar pagamento — UM toque resolve tudo
--
--    Grava o pagamento, soma os dias na assinatura e limpa o aviso. Antes eram
--    dois passos separados (liberar dias / dispensar aviso) e o registro do
--    dinheiro não existia em lugar nenhum.
--
--    ⚠️ SOMA A PARTIR DO VENCIMENTO, não de hoje: quem paga adiantado não pode
--    perder os dias que ainda tinha. Mesma conta de `ativar_assinatura` (M13).
-- ---------------------------------------------------------------------
create or replace function registrar_pagamento(
  p_restaurante   uuid,
  p_valor         numeric,
  p_dias          integer,
  p_plano         text default null,
  p_meio          text default 'pix',
  p_contas_extras integer default 0,
  p_valor_extras  numeric default 0,
  p_observacao    text default null,
  p_pago_em       date default null
)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_ate timestamptz;
  v_produto text;
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema registra pagamentos.';
  end if;
  if p_valor is null or p_valor < 0 then raise exception 'Valor invalido.'; end if;
  -- Mesma faixa de ativar_assinatura: 400 dias cobre o plano anual com folga e
  -- barra o zero a mais digitado sem querer.
  if p_dias is null or p_dias < 0 or p_dias > 400 then raise exception 'Dias invalidos (0 a 400).'; end if;

  select produto into v_produto from restaurantes where id = p_restaurante;
  if not found then raise exception 'Restaurante nao encontrado.'; end if;

  insert into pagamentos (restaurante_id, pago_em, valor, plano, produto, dias, meio,
                          contas_extras, valor_extras, observacao, registrado_por)
    values (p_restaurante, coalesce(p_pago_em, current_date), p_valor, p_plano, v_produto,
            p_dias, coalesce(nullif(trim(p_meio), ''), 'pix'),
            coalesce(p_contas_extras, 0), coalesce(p_valor_extras, 0),
            nullif(trim(p_observacao), ''), coalesce(auth.jwt() ->> 'email', 'aurum'));

  -- ⚠️ `p_dias = 0` é legítimo: pagamento só do adicional de contas, sem
  -- estender a assinatura. Nesse caso a data não se move.
  if p_dias > 0 then
    update restaurantes
       set assinatura_ate = greatest(coalesce(assinatura_ate, now()), now()) + make_interval(days => p_dias),
           aviso_pagamento_em = null, aviso_pagamento_plano = null, aviso_pagamento_nome = null
     where id = p_restaurante
     returning assinatura_ate into v_ate;
  else
    update restaurantes
       set aviso_pagamento_em = null, aviso_pagamento_plano = null, aviso_pagamento_nome = null
     where id = p_restaurante
     returning assinatura_ate into v_ate;
  end if;

  return v_ate;
end $$;

-- ---------------------------------------------------------------------
-- 4) Ler os pagamentos de um restaurante
-- ---------------------------------------------------------------------
create or replace function pagamentos_do_restaurante(p_restaurante uuid)
returns table (
  id uuid, pago_em date, valor numeric, plano text, produto text, dias integer,
  meio text, contas_extras integer, valor_extras numeric, observacao text, registrado_por text
)
language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema consulta pagamentos.';
  end if;
  return query
    select p.id, p.pago_em, p.valor, p.plano, p.produto, p.dias, p.meio,
           p.contas_extras, p.valor_extras, p.observacao, p.registrado_por
      from pagamentos p
     where p.restaurante_id = p_restaurante
     order by p.pago_em desc, p.criado_em desc;
end $$;

-- ---------------------------------------------------------------------
-- 5) Quanto entrou — o número que a "receita estimada" vai substituir
-- ---------------------------------------------------------------------
create or replace function recebido_por_mes(p_meses integer default 12)
returns table (mes date, total numeric, quantos integer)
language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema consulta o recebido.';
  end if;
  return query
    select date_trunc('month', p.pago_em)::date as mes,
           sum(p.valor + p.valor_extras)        as total,
           count(*)::integer                    as quantos
      from pagamentos p
     where p.pago_em >= (current_date - make_interval(months => greatest(1, least(coalesce(p_meses, 12), 60))))
     group by 1
     order by 1 desc;
end $$;

-- ---------------------------------------------------------------------
-- 6) Definir o regime da conta
-- ---------------------------------------------------------------------
create or replace function definir_regime(
  p_restaurante uuid,
  p_regime      text,
  p_motivo      text default null,
  p_ate         timestamptz default null
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema define o regime.';
  end if;
  if p_regime not in ('pagante', 'cortesia', 'parceiro') then
    raise exception 'Regime invalido.';
  end if;
  -- ⚠️ O motivo é OBRIGATÓRIO fora do 'pagante'. Cortesia sem motivo escrito é
  -- a conta que, seis meses depois, ninguém lembra por que não paga — e que
  -- ninguém tem coragem de voltar a cobrar.
  if p_regime <> 'pagante' and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escreva o motivo da cortesia.';
  end if;
  update restaurantes
     set regime = p_regime,
         regime_motivo = case when p_regime = 'pagante' then null else trim(p_motivo) end,
         cortesia_ate  = case when p_regime = 'pagante' then null else p_ate end
   where id = p_restaurante;
  if not found then raise exception 'Restaurante nao encontrado.'; end if;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 7) A CORTESIA PRECISA VALER NO BANCO TAMBÉM
--
--    ⚠️ ESTA É A PARTE QUE NÃO PODE FICAR PARA DEPOIS. O corte de acesso mora
--    em DOIS lugares — `statusAssinatura` no app e `restaurante_pode_escrever`
--    aqui — e o comentário do assinatura.js já avisa: se um liberar e o outro
--    negar, o app diz "ok", o banco recusa a escrita, e como o app é
--    offline-first o lançamento entra na fila e SOME SEM ERRO NA TELA. A
--    cozinha registra a entrada, vai embora e o dado não existe.
--
--    Então o regime entra aqui no mesmo commit em que entra no app. Corpo
--    copiado da M28 com uma cláusula a mais.
--
--    ⚠️ `bloqueado` continua passando por cima de tudo, inclusive da cortesia:
--    suspender uma conta é a decisão mais forte que existe no painel, e uma
--    cortesia que não pode ser suspensa seria uma conta impossível de fechar.
-- ---------------------------------------------------------------------
create or replace function restaurante_pode_escrever(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurantes r
    where r.id = rid
      and coalesce(r.bloqueado, false) = false
      and (coalesce(r.assinatura_ate, 'epoch'::timestamptz) > now()
           or r.created_at + interval '5 days' > now()
           -- cortesia/parceiro: vale enquanto não houver prazo, ou até o prazo
           or (coalesce(r.regime, 'pagante') <> 'pagante'
               and (r.cortesia_ate is null or r.cortesia_ate > now())))
  );
$$;

-- ---------------------------------------------------------------------
-- 8) Permissões — negar por padrão (M24/M26), liberar só o necessário
-- ---------------------------------------------------------------------
revoke all on function registrar_pagamento(uuid, numeric, integer, text, text, integer, numeric, text, date) from public, anon;
revoke all on function pagamentos_do_restaurante(uuid) from public, anon;
revoke all on function recebido_por_mes(integer) from public, anon;
revoke all on function definir_regime(uuid, text, text, timestamptz) from public, anon;

grant execute on function registrar_pagamento(uuid, numeric, integer, text, text, integer, numeric, text, date) to authenticated;
grant execute on function pagamentos_do_restaurante(uuid) to authenticated;
grant execute on function recebido_por_mes(integer) to authenticated;
grant execute on function definir_regime(uuid, text, text, timestamptz) to authenticated;

-- ⚠️ SONDA DE GRANT, no molde da M27. A M24 concede EXECUTE por ASSINATURA
-- EXATA: se um parâmetro mudar de tipo, nasce OUTRA função sem grant e o
-- painel quebra com "permission denied" mostrado como erro genérico. Melhor a
-- migração abortar aqui do que descobrir na frente do cliente.
do $$
begin
  if not has_function_privilege('authenticated',
       'public.registrar_pagamento(uuid, numeric, integer, text, text, integer, numeric, text, date)', 'execute') then
    raise exception 'O grant de registrar_pagamento nao pegou — nada foi aplicado.';
  end if;
  if not has_function_privilege('authenticated', 'public.definir_regime(uuid, text, text, timestamptz)', 'execute') then
    raise exception 'O grant de definir_regime nao pegou — nada foi aplicado.';
  end if;
end $$;

-- ⚠️ A PARIDADE DOS 5 DIAS TEM QUE SOBREVIVER À REESCRITA. `TESTE_DIAS` no app
-- e este `interval` são a MESMA regra em dois lugares; ao recriar a função
-- acima eu poderia ter deixado o número para trás sem ninguém notar — até um
-- cliente perder um dia de teste. Mesma sonda da M28.
do $$
declare v_corpo text;
begin
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'restaurante_pode_escrever';
  if v_corpo not like '%5 days%' then
    raise exception 'M37: restaurante_pode_escrever perdeu os 5 dias de teste. Nada foi aplicado.';
  end if;
  if v_corpo not like '%regime%' then
    raise exception 'M37: restaurante_pode_escrever nao ficou com o regime. Nada foi aplicado.';
  end if;
end $$;

commit;

-- =====================================================================
--  Teste rápido (como super-admin):
--    select registrar_pagamento('<rid>', 249, 30, 'mensal');
--    select * from pagamentos_do_restaurante('<rid>');
--    select * from recebido_por_mes(6);
--    select definir_regime('<rid>', 'cortesia', 'piloto do plano completo');
--  Como cliente: todas devem levantar excecao.
-- =====================================================================
