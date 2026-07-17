-- =====================================================================
--  AURUM COZINHA PRO — Migração 11: CONVITES x PLANO + DESATIVAR USUÁRIO
--  Cole INTEIRO no Supabase → SQL Editor → New query → Run.
--  Rode DEPOIS das migrações 4–10. É seguro rodar mais de uma vez.
--
--  M1) Convites passam a respeitar o corte de plano/bloqueio (restaurante_
--      pode_escrever) — antes, conta bloqueada/vencida ainda gerava/revogava
--      convite via API. Mantém as regras de cargo da m4.
--  P1) Desativar/reativar usuário (libera vaga sem apagar histórico):
--      RPCs SECURITY DEFINER com trava de cargo, sem desativar a si mesmo
--      nem a última diretoria ativa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- M1) CONVITES — INSERT/DELETE exigem plano vigente (além das regras de cargo)
-- ---------------------------------------------------------------------
drop policy if exists "conv_ins_v4"  on convites;
drop policy if exists "conv_ins_v11" on convites;
create policy "conv_ins_v11" on convites for insert
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and meu_cargo() in ('gerencia','diretoria')
    and (cargo <> 'diretoria' or meu_cargo() = 'diretoria')
  );

drop policy if exists "conv_del_v4"  on convites;
drop policy if exists "conv_del_v11" on convites;
create policy "conv_del_v11" on convites for delete
  using (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and meu_cargo() in ('gerencia','diretoria')
  );
-- SELECT de convites continua como está (listar pendentes não depende de plano).

-- ---------------------------------------------------------------------
-- P1) DESATIVAR / REATIVAR USUÁRIO
-- ---------------------------------------------------------------------
create or replace function desativar_usuario(p_usuario uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_rid       uuid := meu_restaurante_id();
  v_alvo      perfis%rowtype;
  v_diretorias integer;
begin
  if meu_cargo() not in ('gerencia','diretoria') then
    raise exception 'Apenas gerência ou diretoria pode desativar acessos.';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'Você não pode desativar o seu próprio acesso.';
  end if;
  select * into v_alvo from perfis where id = p_usuario and restaurante_id = v_rid;
  if v_alvo.id is null then
    raise exception 'Usuário não encontrado neste restaurante.';
  end if;
  -- não deixar o restaurante sem nenhuma diretoria ativa
  if v_alvo.cargo = 'diretoria' then
    select count(*) into v_diretorias from perfis
      where restaurante_id = v_rid and cargo = 'diretoria' and coalesce(ativo, true) = true;
    if v_diretorias <= 1 then
      raise exception 'Não é possível desativar a última diretoria ativa.';
    end if;
  end if;
  update perfis set ativo = false where id = p_usuario;
  return true;
end $$;

create or replace function reativar_usuario(p_usuario uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_rid   uuid := meu_restaurante_id();
  v_count integer;
  v_max   integer;
begin
  if meu_cargo() not in ('gerencia','diretoria') then
    raise exception 'Apenas gerência ou diretoria pode reativar acessos.';
  end if;
  if not exists (select 1 from perfis where id = p_usuario and restaurante_id = v_rid) then
    raise exception 'Usuário não encontrado neste restaurante.';
  end if;
  -- respeita o limite de vagas (contando só ativos)
  select count(*) into v_count from perfis where restaurante_id = v_rid and coalesce(ativo, true) = true;
  select coalesce(max_usuarios, 3) into v_max from restaurantes where id = v_rid;
  if v_count >= v_max then
    raise exception 'Limite de % usuários atingido. Aumente o limite ou desative outro acesso.', v_max;
  end if;
  update perfis set ativo = true where id = p_usuario;
  return true;
end $$;

-- =====================================================================
--  PRONTO. Checagens:
--    select polname, cmd from pg_policies where tablename = 'convites';
--      → conv_ins_v11 / conv_del_v11 / conv_sel_v4
--    select proname from pg_proc where proname in ('desativar_usuario','reativar_usuario');
-- =====================================================================
