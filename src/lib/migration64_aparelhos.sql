-- =====================================================================
--  MIGRAÇÃO 64 — APARELHOS CONECTADOS (24/11/2026, pedido do dono)
--
--  O Aurum Etiquetas passa a R$ 99,90 por mês com ATÉ 3 APARELHOS
--  conectados na mesma conta. O 4º aparelho mostra o Pix de R$ 20 e só
--  entra depois que a Aurum confirma o pagamento no painel; daí em diante,
--  R$ 20 por aparelho a mais entram em toda cobrança (`aparelhos_extras`).
--  O Cozinha Pro (em breve) fica sem limite por enquanto.
--
--  ⚠️ APARELHO = A SESSÃO DE LOGIN. Cada vez que alguém entra num aparelho,
--  o Supabase cria uma sessão, e o id dela vem ASSINADO no token
--  (`session_id`, lido por sessao_atual() da M62). Não dá para forjar, e não
--  depende de nada guardado no aparelho. "Sair" apaga a linha e libera a vaga.
--
--  ⚠️ NINGUÉM LÊ NEM GRAVA A TABELA DIRETO: sem policy e sem grant. Tudo
--  passa pelas funções abaixo, que conferem a conta (meu_restaurante_id) e a
--  sessão. O aparelho que espera o pagamento não tem como se promover.
--
--  Aplicar:  node scripts/rodar-migracao.mjs 64
--  Conferir: node scripts/pentest-aparelhos.mjs
-- =====================================================================

alter table restaurantes add column if not exists aparelhos_extras int not null default 0;
alter table restaurantes drop constraint if exists restaurantes_aparelhos_extras_ck;
alter table restaurantes add constraint restaurantes_aparelhos_extras_ck check (aparelhos_extras between 0 and 50);

create table if not exists aparelhos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  sessao         uuid not null unique,        -- o session_id do login (sessao_atual())
  usuario        uuid not null,               -- auth.uid() de quem entrou
  nome           text not null default '',    -- "Android · Chrome", só para reconhecer
  situacao       text not null default 'ativo' check (situacao in ('ativo', 'aguardando', 'removido')),
  criado_em      timestamptz not null default now(),
  visto_em       timestamptz not null default now(),
  pedido_em      timestamptz,                 -- tocou "Já paguei" (o aparelho a mais)
  pagador        text
);
create index if not exists aparelhos_restaurante_idx on aparelhos (restaurante_id, situacao);
alter table aparelhos enable row level security;
revoke all on aparelhos from public, anon, authenticated;

-- ── O limite ──────────────────────────────────────────────────────
-- ⚠️ PARIDADE com APARELHOS_INCLUSOS em src/utils/assinatura.js.
-- NULL = sem limite (o Cozinha Pro, por enquanto).
create or replace function limite_de_aparelhos(p_rid uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when coalesce(r.produto, 'completo') = 'etiquetas'
              then 3 + coalesce(r.aparelhos_extras, 0) end
    from restaurantes r where r.id = p_rid
$$;

-- ── O aparelho se apresenta ───────────────────────────────────────
-- Ao entrar, ao voltar para o app e de tempos em tempos. Devolve
--   { situacao: 'ativo' | 'aguardando' | 'removido' | 'isento',
--     usados, limite, extras, pedido_em }
-- ⚠️ O que entra é decidido AQUI, com a linha da conta travada: dois
-- aparelhos entrando no mesmo instante não passam os dois pela última vaga.
create or replace function registrar_aparelho(p_nome text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rid    uuid := meu_restaurante_id();
  v_sessao uuid := sessao_atual();
  v_limite int;
  v_extras int;
  v_usados int;
  v_id     uuid;
  v_sit    text;
  v_dono   uuid;
  v_pedido timestamptz;
  v_nome   text := left(coalesce(nullif(trim(p_nome), ''), 'Aparelho'), 60);
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  -- o suporte da Aurum e a conta sem restaurante não ocupam vaga
  if coalesce(sou_super_admin(), false) or v_rid is null or v_sessao is null then
    return jsonb_build_object('situacao', 'isento');
  end if;

  perform 1 from restaurantes where id = v_rid for update;
  v_limite := limite_de_aparelhos(v_rid);
  select coalesce(aparelhos_extras, 0) into v_extras from restaurantes where id = v_rid;

  -- ⚠️ PARADO HÁ MAIS DE 30 DIAS LIBERA A VAGA SOZINHO: o celular que
  -- quebrou, o app reinstalado sem "Sair". Se ele voltar, entra de novo como
  -- qualquer aparelho — se houver vaga.
  delete from aparelhos
   where restaurante_id = v_rid and sessao <> v_sessao and visto_em < now() - interval '30 days';

  select id, situacao, restaurante_id, pedido_em into v_id, v_sit, v_dono, v_pedido
    from aparelhos where sessao = v_sessao;
  -- a mesma sessão noutra conta não existe; se existir, recomeça do zero
  if v_id is not null and v_dono <> v_rid then
    delete from aparelhos where id = v_id;
    v_id := null; v_sit := null; v_pedido := null;
  end if;

  -- tirado pela Administração: o aparelho sai da conta
  if v_sit = 'removido' then
    return jsonb_build_object('situacao', 'removido');
  end if;

  select count(*) into v_usados from aparelhos
   where restaurante_id = v_rid and situacao = 'ativo' and id is distinct from v_id;

  if v_sit = 'ativo' then
    update aparelhos set visto_em = now(), nome = v_nome where id = v_id;
    return jsonb_build_object('situacao', 'ativo', 'usados', v_usados + 1, 'limite', v_limite, 'extras', v_extras);
  end if;

  -- novo, ou esperando: entra se houver vaga
  if v_limite is null or v_usados < v_limite then
    if v_id is null then
      insert into aparelhos (restaurante_id, sessao, usuario, nome) values (v_rid, v_sessao, auth.uid(), v_nome);
    else
      -- ⚠️ o pedido (pedido_em) FICA: se ele já pagou e uma vaga abriu, a
      -- Aurum ainda vê o pagamento no painel e decide
      update aparelhos set situacao = 'ativo', visto_em = now(), nome = v_nome where id = v_id;
    end if;
    return jsonb_build_object('situacao', 'ativo', 'usados', v_usados + 1, 'limite', v_limite, 'extras', v_extras);
  end if;

  if v_id is null then
    insert into aparelhos (restaurante_id, sessao, usuario, nome, situacao)
      values (v_rid, v_sessao, auth.uid(), v_nome, 'aguardando');
  else
    update aparelhos set visto_em = now(), nome = v_nome where id = v_id;
  end if;
  return jsonb_build_object('situacao', 'aguardando', 'usados', v_usados, 'limite', v_limite,
    'extras', v_extras, 'pedido_em', v_pedido);
end $$;

-- ── "Sair": a vaga volta na hora ──────────────────────────────────
create or replace function sair_do_aparelho()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  delete from aparelhos where sessao = sessao_atual() and usuario = auth.uid();
  return true;
end $$;

-- ── A lista da conta (Administração e a tela do aparelho a mais) ──
create or replace function meus_aparelhos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rid uuid := meu_restaurante_id();
begin
  if auth.uid() is null or v_rid is null then raise exception 'Sem restaurante.'; end if;
  return jsonb_build_object(
    'limite', limite_de_aparelhos(v_rid),
    'extras', (select coalesce(aparelhos_extras, 0) from restaurantes where id = v_rid),
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'nome', a.nome, 'situacao', a.situacao,
               'criado_em', a.criado_em, 'visto_em', a.visto_em,
               'pedido_em', a.pedido_em, 'este', a.sessao = sessao_atual())
             order by a.situacao, a.visto_em desc)
        from aparelhos a
       where a.restaurante_id = v_rid and a.situacao <> 'removido'
         and a.visto_em >= now() - interval '30 days'), '[]'::jsonb));
end $$;

-- ── Tirar um aparelho da conta: só com a Administração aberta ─────
-- (meu_cargo() = 'diretoria' só com a senha digitada NESTA sessão, M62)
create or replace function remover_aparelho(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rid uuid;
begin
  select restaurante_id into v_rid from aparelhos where id = p_id;
  if v_rid is null then raise exception 'Aparelho não encontrado.'; end if;
  if not coalesce(sou_super_admin(), false) then
    if v_rid is distinct from meu_restaurante_id() or coalesce(meu_cargo(), '') <> 'diretoria' then
      raise exception 'Abra a Administração para tirar um aparelho.';
    end if;
  end if;
  update aparelhos set situacao = 'removido', visto_em = now() where id = p_id;
  return true;
end $$;

-- ── O aparelho a mais: "Já paguei" ────────────────────────────────
-- Marca o pedido no aparelho que espera; a Aurum vê no painel e confirma.
create or replace function pedir_aparelho_extra(p_pagador text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pedido timestamptz;
begin
  if auth.uid() is null or meu_restaurante_id() is null then raise exception 'Sem restaurante.'; end if;
  select id, pedido_em into v_id, v_pedido from aparelhos
   where sessao = sessao_atual() and restaurante_id = meu_restaurante_id() and situacao = 'aguardando';
  if v_id is null then raise exception 'Este aparelho não está esperando vaga.'; end if;
  if v_pedido is not null and v_pedido > now() - interval '10 minutes' then
    raise exception 'Você já avisou há pouco. Aguarde a confirmação da equipe.';
  end if;
  update aparelhos set pedido_em = now(), pagador = left(nullif(trim(p_pagador), ''), 80) where id = v_id;
  return true;
end $$;

-- ── O painel da Aurum ─────────────────────────────────────────────
create or replace function aparelhos_admin()
returns table (id uuid, restaurante_id uuid, nome text, situacao text, criado_em timestamptz,
               visto_em timestamptz, pedido_em timestamptz, pagador text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not sou_super_admin() then raise exception 'Apenas o administrador do sistema.'; end if;
  return query
    select a.id, a.restaurante_id, a.nome, a.situacao, a.criado_em, a.visto_em, a.pedido_em, a.pagador
      from aparelhos a
     where a.situacao <> 'removido' and (a.visto_em >= now() - interval '30 days' or a.pedido_em is not null)
     order by a.restaurante_id, a.situacao, a.visto_em desc;
end $$;

-- Confirmou o Pix do aparelho a mais: a conta ganha uma vaga paga (R$ 20 por
-- mês a partir da próxima cobrança), o aparelho entra, e o pagamento fica no
-- histórico. `p_aparelho` nulo = o aparelho que pediu primeiro.
create or replace function confirmar_aparelho_extra(p_restaurante uuid, p_aparelho uuid default null, p_valor numeric default 20)
returns int language plpgsql security definer set search_path = public as $$
declare v_extras int; v_id uuid; v_produto text;
begin
  if not sou_super_admin() then raise exception 'Apenas o administrador do sistema.'; end if;
  if p_valor is null or p_valor < 0 or p_valor > 1000 then raise exception 'Valor inválido.'; end if;
  select produto into v_produto from restaurantes where id = p_restaurante for update;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  update restaurantes set aparelhos_extras = least(50, coalesce(aparelhos_extras, 0) + 1)
   where id = p_restaurante returning aparelhos_extras into v_extras;
  select a.id into v_id from aparelhos a
   where a.restaurante_id = p_restaurante
     and (a.id = p_aparelho or (p_aparelho is null and a.pedido_em is not null))
   order by a.pedido_em nulls last limit 1;
  if v_id is not null then
    update aparelhos set situacao = 'ativo', pedido_em = null, pagador = null, visto_em = now() where id = v_id;
  end if;
  -- ⚠️ NO HISTÓRICO, valor + valor_extras = o que entrou (é como o painel
  -- soma). O Pix é TODO do aparelho a mais: valor 0, extras = o Pix.
  if p_valor > 0 then
    insert into pagamentos (restaurante_id, pago_em, valor, plano, produto, dias, meio,
                            contas_extras, valor_extras, observacao, registrado_por)
      values (p_restaurante, current_date, 0, 'aparelho', v_produto, 0, 'pix',
              1, p_valor, 'Aparelho a mais (1º mês)', coalesce(auth.jwt() ->> 'email', 'aurum'));
  end if;
  return v_extras;
end $$;

-- O Pix não caiu: o pedido some do painel; o aparelho continua esperando.
create or replace function dispensar_pedido_de_aparelho(p_aparelho uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then raise exception 'Apenas o administrador do sistema.'; end if;
  update aparelhos set pedido_em = null, pagador = null where id = p_aparelho;
  return found;
end $$;

-- Ajuste à mão (cliente deixou de usar o aparelho a mais, cortesia...).
-- ⚠️ Baixar o número não derruba ninguém: vale para os próximos que entrarem.
create or replace function definir_aparelhos_extras(p_restaurante uuid, p_extras int)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then raise exception 'Apenas o administrador do sistema.'; end if;
  if p_extras is null or p_extras < 0 or p_extras > 50 then raise exception 'Número inválido (0 a 50).'; end if;
  update restaurantes set aparelhos_extras = p_extras where id = p_restaurante;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  return p_extras;
end $$;

-- ── Permissões: nada para anon; o painel confere o super-admin por dentro ──
revoke all on function limite_de_aparelhos(uuid) from public, anon, authenticated;
revoke all on function registrar_aparelho(text) from public, anon;
revoke all on function sair_do_aparelho() from public, anon;
revoke all on function meus_aparelhos() from public, anon;
revoke all on function remover_aparelho(uuid) from public, anon;
revoke all on function pedir_aparelho_extra(text) from public, anon;
revoke all on function aparelhos_admin() from public, anon;
revoke all on function confirmar_aparelho_extra(uuid, uuid, numeric) from public, anon;
revoke all on function dispensar_pedido_de_aparelho(uuid) from public, anon;
revoke all on function definir_aparelhos_extras(uuid, int) from public, anon;
grant execute on function registrar_aparelho(text) to authenticated;
grant execute on function sair_do_aparelho() to authenticated;
grant execute on function meus_aparelhos() to authenticated;
grant execute on function remover_aparelho(uuid) to authenticated;
grant execute on function pedir_aparelho_extra(text) to authenticated;
grant execute on function aparelhos_admin() to authenticated;
grant execute on function confirmar_aparelho_extra(uuid, uuid, numeric) to authenticated;
grant execute on function dispensar_pedido_de_aparelho(uuid) to authenticated;
grant execute on function definir_aparelhos_extras(uuid, int) to authenticated;
