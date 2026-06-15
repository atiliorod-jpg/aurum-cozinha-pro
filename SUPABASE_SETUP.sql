-- =====================================================================
--  AURUM COZINHA PRO — Configuração de segurança no Supabase
--  Cole este arquivo INTEIRO no Supabase → SQL Editor → New query → Run.
--  É seguro rodar mais de uma vez (usa IF NOT EXISTS / DROP POLICY IF EXISTS).
--
--  O que ele faz:
--   1) RLS de segurança por restaurante (cada conta só vê o próprio restaurante)
--   2) Impede que "cozinha" se autopromova de cargo
--   3) Acesso de super-admin (você) para o painel /admin e o modo suporte
--   4) Tabela de sessão única (1 aparelho por conta)
--   5) Limite de 3 contas por restaurante (no aceitar_convite)
-- =====================================================================

-- Email do super-admin (você). Se mudar, troque aqui E em src/pages/Admin.jsx.
-- (Usado nas policies abaixo via auth.jwt() ->> 'email'.)


-- ---------------------------------------------------------------------
-- 0) Garante RLS ligado nas tabelas principais
-- ---------------------------------------------------------------------
alter table restaurantes enable row level security;
alter table perfis        enable row level security;
alter table registros     enable row level security;
alter table documentos    enable row level security;
alter table convites      enable row level security;


-- ---------------------------------------------------------------------
-- 1) Função auxiliar: o restaurante do usuário logado
--    (evita recursão de policy ao consultar a própria tabela perfis)
-- ---------------------------------------------------------------------
create or replace function meu_restaurante()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select restaurante_id from perfis where id = auth.uid()
$$;

create or replace function sou_super_admin()
returns boolean
language sql
stable
as $$
  select auth.jwt() ->> 'email' = 'atiliopinpolho@gmail.com'
$$;


-- ---------------------------------------------------------------------
-- 2) PERFIS
--    - cada um lê os perfis do próprio restaurante
--    - cada um edita só o PRÓPRIO nome (NÃO o cargo — anti-autopromoção)
--    - a diretoria/gerência muda cargo via função segura (item 6)
-- ---------------------------------------------------------------------
drop policy if exists "perfis_select_meu_rest"   on perfis;
drop policy if exists "perfis_update_proprio"    on perfis;
drop policy if exists "perfis_super_admin"       on perfis;

create policy "perfis_select_meu_rest" on perfis
  for select using (restaurante_id = meu_restaurante());

-- Atualiza o próprio perfil MAS sem trocar o próprio cargo nem de restaurante.
create policy "perfis_update_proprio" on perfis
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and cargo = (select cargo from perfis where id = auth.uid())
    and restaurante_id = (select restaurante_id from perfis where id = auth.uid())
  );

create policy "perfis_super_admin" on perfis
  for select using (sou_super_admin());


-- ---------------------------------------------------------------------
-- 3) RESTAURANTES
-- ---------------------------------------------------------------------
drop policy if exists "restaurantes_select_meu" on restaurantes;
drop policy if exists "restaurantes_super_admin" on restaurantes;

create policy "restaurantes_select_meu" on restaurantes
  for select using (id = meu_restaurante());

create policy "restaurantes_super_admin" on restaurantes
  for select using (sou_super_admin());


-- ---------------------------------------------------------------------
-- 4) REGISTROS (compras, entradas, saídas, aparas, perdas, ajustes, auditoria)
--    cada restaurante só mexe nos próprios; super-admin lê todos (modo suporte)
-- ---------------------------------------------------------------------
drop policy if exists "registros_rw_meu_rest" on registros;
drop policy if exists "registros_super_admin" on registros;

create policy "registros_rw_meu_rest" on registros
  for all using (restaurante_id = meu_restaurante())
  with check (restaurante_id = meu_restaurante());

create policy "registros_super_admin" on registros
  for select using (sou_super_admin());


-- ---------------------------------------------------------------------
-- 5) DOCUMENTOS (catálogos: produtos, fichas, prefs, etc.)
-- ---------------------------------------------------------------------
drop policy if exists "documentos_rw_meu_rest" on documentos;
drop policy if exists "documentos_super_admin" on documentos;

create policy "documentos_rw_meu_rest" on documentos
  for all using (restaurante_id = meu_restaurante())
  with check (restaurante_id = meu_restaurante());

create policy "documentos_super_admin" on documentos
  for select using (sou_super_admin());


-- ---------------------------------------------------------------------
-- 6) Trocar cargo de outro usuário — só diretoria/gerência do MESMO restaurante.
--    Roda como SECURITY DEFINER para furar o bloqueio de cargo do item 2,
--    mas valida quem está chamando.
-- ---------------------------------------------------------------------
create or replace function alterar_cargo(p_usuario uuid, p_cargo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  meu_cargo text;
  meu_rest  uuid;
  alvo_rest uuid;
begin
  select cargo, restaurante_id into meu_cargo, meu_rest from perfis where id = auth.uid();
  select restaurante_id into alvo_rest from perfis where id = p_usuario;

  if meu_cargo not in ('gerencia','diretoria') then
    raise exception 'Sem permissão para alterar cargos.';
  end if;
  if meu_rest is null or meu_rest <> alvo_rest then
    raise exception 'Usuário não é do seu restaurante.';
  end if;
  if p_cargo not in ('cozinha','gerencia','diretoria') then
    raise exception 'Cargo inválido.';
  end if;

  update perfis set cargo = p_cargo where id = p_usuario;
end;
$$;


-- ---------------------------------------------------------------------
-- 7) SESSÃO ÚNICA — 1 aparelho por conta
-- ---------------------------------------------------------------------
create table if not exists sessoes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      text not null,
  updated_at timestamptz default now()
);
alter table sessoes enable row level security;

drop policy if exists "sessoes_select_propria" on sessoes;
drop policy if exists "sessoes_insert_propria" on sessoes;
drop policy if exists "sessoes_update_propria" on sessoes;

create policy "sessoes_select_propria" on sessoes
  for select using (user_id = auth.uid());
create policy "sessoes_insert_propria" on sessoes
  for insert with check (user_id = auth.uid());
create policy "sessoes_update_propria" on sessoes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- IMPORTANTE: ligar o Realtime nesta tabela para o "derrubar o outro aparelho"
-- funcionar. Rode também:
alter publication supabase_realtime add table sessoes;
-- (Se der erro "already member", pode ignorar — já estava ligado.)


-- ---------------------------------------------------------------------
-- 8) LIMITE DE 3 CONTAS POR RESTAURANTE — reforça no aceitar_convite.
--    Recrie a sua RPC aceitar_convite incluindo esta checagem. Exemplo:
-- ---------------------------------------------------------------------
-- create or replace function aceitar_convite(p_token text, p_nome text)
-- returns boolean
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_rest uuid;
--   v_cargo text;
--   v_qtd int;
-- begin
--   select restaurante_id, cargo into v_rest, v_cargo
--     from convites where token = p_token and usado = false and expira_em > now();
--   if v_rest is null then return false; end if;
--
--   select count(*) into v_qtd from perfis where restaurante_id = v_rest;
--   if v_qtd >= 3 then
--     raise exception 'Limite de 3 contas por restaurante atingido.';
--   end if;
--
--   insert into perfis (id, nome, cargo, restaurante_id)
--     values (auth.uid(), p_nome, v_cargo, v_rest);
--   update convites set usado = true where token = p_token;
--   return true;
-- end;
-- $$;
--
-- (Ajuste os nomes de coluna conforme a sua tabela `convites`.)


-- =====================================================================
--  PRONTO. Depois de rodar, teste: faça login como super-admin e abra /admin.
-- =====================================================================
