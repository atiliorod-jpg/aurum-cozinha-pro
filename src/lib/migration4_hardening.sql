-- =====================================================================
--  AURUM COZINHA PRO — Migração 4: HARDENING DE SEGURANÇA (auditoria 17/06/2026)
--  Cole INTEIRO no Supabase → SQL Editor → New query → Run.
--  Rode DEPOIS do schema.sql/SUPABASE_SETUP.sql. É seguro rodar mais de uma vez.
--
--  Consolida o RLS num ÚNICO estado seguro (os scripts anteriores criaram
--  policies com nomes divergentes que coexistiam e somavam acesso). Fecha:
--   1) escalada de privilégio via convite (cozinha criando convite de diretoria)
--   2) alteração de restaurante (max_usuarios/ativo) por usuário comum
--   3) criação aberta de restaurantes (spam) → passa a ser via RPC
--   4) corrida no aceitar_convite (mesmo token usado 2x)
--   5) trilha de auditoria adulterável (update/delete de registros de auditoria)
--   6) autopromoção via UPDATE direto em perfis
--   7) registros.tipo sem validação
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Funções helper — SEMPRE com search_path fixo (evita shadowing)
-- ---------------------------------------------------------------------
create or replace function meu_restaurante_id()
returns uuid language sql stable security definer set search_path = public as $$
  select restaurante_id from perfis where id = auth.uid()
$$;

create or replace function meu_cargo()
returns text language sql stable security definer set search_path = public as $$
  select cargo from perfis where id = auth.uid()
$$;

create or replace function sou_super_admin()
returns boolean language sql stable set search_path = public as $$
  select auth.jwt() ->> 'email' = 'atiliopinpolho@gmail.com'
$$;

-- ---------------------------------------------------------------------
-- 1) PERFIS — remove TODAS as policies legadas (nomes de todos os scripts)
--    e recria um conjunto único. Mudança de cargo só pela RPC alterar_cargo.
-- ---------------------------------------------------------------------
drop policy if exists "perfis_select"            on perfis;
drop policy if exists "perfis_insert"            on perfis;
drop policy if exists "perfis_update"            on perfis;
drop policy if exists "perfis_select_meu_rest"   on perfis;
drop policy if exists "perfis_update_proprio"    on perfis;
drop policy if exists "perfis_super_admin"       on perfis;

create policy "perfis_sel_v4" on perfis for select
  using (restaurante_id = meu_restaurante_id() or sou_super_admin());

-- INSERT só do próprio vínculo (id = auth.uid()). O onboarding e o aceite de
-- convite usam RPCs SECURITY DEFINER, mas mantemos esta checagem como rede.
create policy "perfis_ins_v4" on perfis for insert
  with check (id = auth.uid());

-- UPDATE: só o próprio perfil, sem trocar de restaurante. O cargo é protegido
-- pelo trigger abaixo (e a troca legítima passa pela RPC alterar_cargo).
create policy "perfis_upd_v4" on perfis for update
  using (id = auth.uid())
  with check (id = auth.uid() and restaurante_id = meu_restaurante_id());

-- Trigger: bloqueia QUALQUER mudança de cargo que não venha da diretoria
-- (a RPC alterar_cargo roda como definer e valida quem chama).
create or replace function _check_cargo_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cargo is distinct from old.cargo then
    if meu_cargo() is distinct from 'diretoria' then
      raise exception 'Apenas a diretoria pode alterar cargos.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_cargo_change on perfis;
create trigger trg_cargo_change before update on perfis
  for each row execute function _check_cargo_change();

-- ---------------------------------------------------------------------
-- 2) RESTAURANTES — sem UPDATE pelo client; criação só via RPC.
-- ---------------------------------------------------------------------
drop policy if exists "rest_select"              on restaurantes;
drop policy if exists "rest_insert"              on restaurantes;
drop policy if exists "rest_update"              on restaurantes;  -- FECHA o vetor de max_usuarios/ativo
drop policy if exists "restaurantes_select_meu"  on restaurantes;
drop policy if exists "restaurantes_super_admin" on restaurantes;

create policy "rest_sel_v4" on restaurantes for select
  using (id = meu_restaurante_id() or sou_super_admin());
-- Sem policy de INSERT/UPDATE: criar restaurante é só pela RPC criar_restaurante
-- (definer) e ninguém edita o restaurante pelo client.

-- RPC de onboarding atômico: cria restaurante + perfil diretoria de uma vez,
-- e impede que um usuário que já tem perfil crie outro restaurante.
create or replace function criar_restaurante(p_nome_restaurante text, p_nome_admin text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_rid uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  if exists (select 1 from perfis where id = auth.uid()) then
    raise exception 'Este usuário já pertence a um restaurante.';
  end if;
  insert into restaurantes (nome) values (coalesce(nullif(trim(p_nome_restaurante), ''), 'Meu Restaurante'))
    returning id into v_rid;
  insert into perfis (id, restaurante_id, nome, cargo)
    values (auth.uid(), v_rid, coalesce(nullif(trim(p_nome_admin), ''), 'Diretoria'), 'diretoria');
  return v_rid;
end $$;

-- ---------------------------------------------------------------------
-- 3) CONVITES — fecha a escalada de privilégio.
--    Só gerência/diretoria criam convites; e só a diretoria cria convite
--    de diretoria. (Antes, qualquer cargo criava qualquer convite via API.)
-- ---------------------------------------------------------------------
drop policy if exists "conv_select" on convites;
drop policy if exists "conv_insert" on convites;
drop policy if exists "conv_update" on convites;

create policy "conv_sel_v4" on convites for select
  using (restaurante_id = meu_restaurante_id());

create policy "conv_ins_v4" on convites for insert
  with check (
    restaurante_id = meu_restaurante_id()
    and meu_cargo() in ('gerencia','diretoria')
    and (cargo <> 'diretoria' or meu_cargo() = 'diretoria')
  );

-- Permite revogar (apagar) um convite ainda não usado do próprio restaurante
-- (gerência/diretoria) — fecha o achado de convite vazado sem revogação.
create policy "conv_del_v4" on convites for delete
  using (restaurante_id = meu_restaurante_id() and meu_cargo() in ('gerencia','diretoria'));

-- cargo do convite precisa ser um dos válidos
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'convites_cargo_check') then
    alter table convites add constraint convites_cargo_check check (cargo in ('cozinha','gerencia','diretoria'));
  end if;
end $$;

-- aceitar_convite: trava a linha do convite (FOR UPDATE) para o token não ser
-- usado duas vezes em cadastros simultâneos; respeita o limite de usuários.
create or replace function aceitar_convite(p_token text, p_nome text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_conv  convites%rowtype;
  v_count integer;
  v_max   integer;
begin
  select * into v_conv from convites
    where token = p_token and usado = false and expira_em > now()
    for update;                       -- serializa o consumo do token
  if v_conv.token is null then return false; end if;

  select count(*) into v_count from perfis
    where restaurante_id = v_conv.restaurante_id and ativo = true;
  select coalesce(max_usuarios, 3) into v_max from restaurantes
    where id = v_conv.restaurante_id;
  if v_count >= v_max then
    raise exception 'Limite de % usuários atingido para este restaurante.', v_max;
  end if;

  insert into perfis (id, restaurante_id, nome, cargo)
    values (auth.uid(), v_conv.restaurante_id, coalesce(nullif(trim(p_nome), ''), 'Funcionário'), v_conv.cargo)
    on conflict (id) do nothing;
  update convites set usado = true where token = p_token;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 4) DOCUMENTOS — leitura/escrita do próprio restaurante; super-admin lê.
-- ---------------------------------------------------------------------
drop policy if exists "doc_all"                 on documentos;
drop policy if exists "documentos_rw_meu_rest"  on documentos;
drop policy if exists "documentos_super_admin"  on documentos;

create policy "doc_rw_v4" on documentos for all
  using (restaurante_id = meu_restaurante_id())
  with check (restaurante_id = meu_restaurante_id());
create policy "doc_super_v4" on documentos for select using (sou_super_admin());

-- ---------------------------------------------------------------------
-- 5) REGISTROS — auditoria vira IMUTÁVEL (insert-only) para o client.
--    Leitura/insert do próprio restaurante; update/delete EXCETO 'auditoria'.
-- ---------------------------------------------------------------------
drop policy if exists "reg_all"                 on registros;
drop policy if exists "registros_rw_meu_rest"   on registros;
drop policy if exists "registros_super_admin"   on registros;

create policy "reg_sel_v4" on registros for select
  using (restaurante_id = meu_restaurante_id() or sou_super_admin());
create policy "reg_ins_v4" on registros for insert
  with check (restaurante_id = meu_restaurante_id());
create policy "reg_upd_v4" on registros for update
  using (restaurante_id = meu_restaurante_id() and tipo <> 'auditoria')
  with check (restaurante_id = meu_restaurante_id());
create policy "reg_del_v4" on registros for delete
  using (restaurante_id = meu_restaurante_id() and tipo <> 'auditoria');

-- tipo precisa ser um dos válidos (evita lixo/poluição de relatório)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'registros_tipo_check') then
    alter table registros add constraint registros_tipo_check
      check (tipo in ('compra','entrada','saida','apara','perda','ajuste','auditoria'));
  end if;
end $$;

-- =====================================================================
--  PRONTO. Estado de RLS consolidado e endurecido.
--  Teste: login como cozinha e tente criar convite de diretoria → deve falhar.
-- =====================================================================
