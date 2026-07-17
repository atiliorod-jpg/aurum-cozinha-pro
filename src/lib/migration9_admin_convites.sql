-- =====================================================================
--  AURUM COZINHA PRO — Migração 9: ADMIN COMERCIAL + HARDENING DE CONVITE
--  (auditoria 17/07/2026, aprovada pelo dono)
--  Cole INTEIRO no Supabase → SQL Editor → New query → Run.
--  Rode DEPOIS das migrações 4–8. É seguro rodar mais de uma vez.
--
--  1) BUG do convite (R1): quem JÁ tem restaurante usava um convite e o
--     token era QUEIMADO sem vincular ninguém. Agora falha com mensagem
--     clara SEM consumir o código.
--  2) VIP: RPC para o super-admin subir max_usuarios (3 padrão → até 5).
--  3) Bloqueio comercial: coluna bloqueado + RPC (corta acesso sem apagar).
--  4) E-mails dos usuários para o painel Admin (RPC só super-admin).
--  5) Notas internas por restaurante (invisíveis ao cliente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) aceitar_convite v9 — não queima token de quem já tem restaurante
-- ---------------------------------------------------------------------
create or replace function aceitar_convite(p_token text, p_nome text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_conv  convites%rowtype;
  v_count integer;
  v_max   integer;
begin
  -- quem já pertence a um restaurante não pode aceitar convite — e o token
  -- NÃO é consumido (antes: on conflict do nothing + usado=true = token perdido)
  if exists (select 1 from perfis where id = auth.uid()) then
    raise exception 'Esta conta já pertence a um restaurante. Use outro e-mail ou fale com o suporte.';
  end if;

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
    values (auth.uid(), v_conv.restaurante_id, coalesce(nullif(trim(p_nome), ''), 'Funcionário'), v_conv.cargo);
  update convites set usado = true where token = p_token;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 2) VIP — super-admin define o limite de usuários (3 padrão, até 5)
-- ---------------------------------------------------------------------
create or replace function definir_max_usuarios(p_restaurante uuid, p_max int)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema altera o limite de usuários.';
  end if;
  if p_max is null or p_max < 1 or p_max > 5 then
    raise exception 'Limite inválido (1 a 5).';
  end if;
  update restaurantes set max_usuarios = p_max where id = p_restaurante;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  return p_max;
end $$;

-- ---------------------------------------------------------------------
-- 3) Bloqueio comercial (inadimplência) — sem apagar nada
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists bloqueado boolean not null default false;

create or replace function definir_bloqueio(p_restaurante uuid, p_bloqueado boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema bloqueia/desbloqueia contas.';
  end if;
  update restaurantes set bloqueado = coalesce(p_bloqueado, false) where id = p_restaurante;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  return coalesce(p_bloqueado, false);
end $$;

-- ---------------------------------------------------------------------
-- 4) E-mails dos usuários de um restaurante (para o painel Admin)
--    SECURITY DEFINER porque auth.users não é acessível pelo client;
--    trava explícita: só o super-admin consegue chamar.
-- ---------------------------------------------------------------------
create or replace function usuarios_do_restaurante(p_restaurante uuid)
returns table (id uuid, nome text, cargo text, email text, ativo boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema consulta e-mails.';
  end if;
  return query
    select p.id, p.nome, p.cargo, u.email::text, coalesce(p.ativo, true)
    from perfis p
    join auth.users u on u.id = p.id
    where p.restaurante_id = p_restaurante
    order by p.cargo, p.nome;
end $$;

-- ---------------------------------------------------------------------
-- 5) Notas internas do administrador (o cliente nunca vê — a policy de
--    SELECT do cliente continua a mesma; a coluna só é escrita via RPC e
--    lida pelo painel Admin, que roda como super-admin)
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists notas_admin text;

create or replace function salvar_notas_admin(p_restaurante uuid, p_notas text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema edita notas.';
  end if;
  update restaurantes set notas_admin = p_notas where id = p_restaurante;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  return true;
end $$;

-- =====================================================================
--  PRONTO. Teste rápido: convite usado por conta que já tem restaurante
--  deve falhar SEM queimar o token; definir_max_usuarios(id, 5) só pelo
--  super-admin; bloqueado=true derruba o cliente na tela de bloqueio.
-- =====================================================================
