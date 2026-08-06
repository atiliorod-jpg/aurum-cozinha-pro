-- =====================================================================
--  MIGRAÇÃO 18 — FECHA 3 FURAS DE AUTORIZAÇÃO (auditoria de 05/08/2026)
--
--  ⚠️ RODAR JUNTO COM A 17. As três correções abaixo são de segurança real,
--  não cosméticas: hoje um funcionário demitido continua entrando, um
--  cozinheiro se promove sozinho, e qualquer um forja a trilha de auditoria.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) "DESATIVAR ACESSO" PRECISA REALMENTE REVOGAR
--
--    `perfis.ativo=false` era gravado, mas meu_restaurante_id() não olhava
--    essa coluna — então TODAS as policies continuavam liberando o usuário.
--    O demitido lia estoque/custos e ainda gravava lançamentos.
-- ---------------------------------------------------------------------
create or replace function meu_restaurante_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select restaurante_id from perfis
   where id = auth.uid()
     and coalesce(ativo, true)   -- <<< desativado não tem restaurante = não passa em policy nenhuma
$$;

-- O próprio desativado se reativava com um PATCH em perfis (o trigger antigo
-- só protegia a coluna `cargo`). Agora `ativo` só muda pelas RPCs
-- desativar_usuario / reativar_usuario, que exigem gerência/diretoria.
create or replace function _bloqueia_auto_reativacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ativo is distinct from old.ativo then
    raise exception 'Ativação/desativação só pela função do sistema.';
  end if;
  return new;
end $$;

drop trigger if exists trg_ativo_change on perfis;
create trigger trg_ativo_change
  before update on perfis
  for each row execute function _bloqueia_auto_reativacao();

-- As RPCs oficiais precisam continuar funcionando: elas são SECURITY DEFINER,
-- então rodam como owner — o trigger acima bloquearia também. Marcamos a
-- passagem legítima com um GUC de sessão.
create or replace function desativar_usuario(p_usuario uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if meu_cargo() not in ('gerencia','diretoria') then
    raise exception 'Sem permissão para desativar usuários.';
  end if;
  if not exists (select 1 from perfis where id = p_usuario and restaurante_id = meu_restaurante_id()) then
    raise exception 'Usuário não encontrado neste restaurante.';
  end if;
  perform set_config('aurum.muda_ativo', '1', true);
  update perfis set ativo = false where id = p_usuario;
end $$;

create or replace function reativar_usuario(p_usuario uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if meu_cargo() not in ('gerencia','diretoria') then
    raise exception 'Sem permissão para reativar usuários.';
  end if;
  if not exists (select 1 from perfis where id = p_usuario and restaurante_id = meu_restaurante_id()) then
    raise exception 'Usuário não encontrado neste restaurante.';
  end if;
  perform set_config('aurum.muda_ativo', '1', true);
  update perfis set ativo = true where id = p_usuario;
end $$;

-- trigger passa a respeitar o GUC
create or replace function _bloqueia_auto_reativacao()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.ativo is distinct from old.ativo
     and coalesce(current_setting('aurum.muda_ativo', true), '') <> '1' then
    raise exception 'Ativação/desativação só pela função do sistema.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2) MATRIZ DE PERMISSÕES FORA DO ALCANCE DE QUEM ELA RESTRINGE
--
--    A matriz morava em documentos/prefs, e doc_upd liberava QUALQUER membro
--    a escrever QUALQUER chave. Um cozinheiro se dava todas as permissões
--    com uma requisição. Agora ela tem chave própria, e só diretoria grava.
-- ---------------------------------------------------------------------
drop policy if exists "doc_ins_v18" on documentos;
drop policy if exists "doc_upd_v18" on documentos;

create policy "doc_ins_v18" on documentos for insert
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and (chave <> 'permissoes' or meu_cargo() = 'diretoria')
  );

create policy "doc_upd_v18" on documentos for update
  using (restaurante_id = meu_restaurante_id())
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and (chave <> 'permissoes' or meu_cargo() = 'diretoria')
  );

-- salvar_documento é SECURITY INVOKER, então herda as policies acima — a
-- checagem vale também pelo caminho da RPC. Reforço explícito mesmo assim:
create or replace function salvar_documento(p_restaurante uuid, p_chave text, p_dados jsonb, p_versao integer)
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_atual documentos%rowtype;
begin
  if p_chave = 'permissoes' and meu_cargo() <> 'diretoria' then
    raise exception 'Só a diretoria altera as permissões da equipe.';
  end if;

  select * into v_atual from documentos
   where restaurante_id = p_restaurante and chave = p_chave for update;

  if not found then
    insert into documentos (restaurante_id, chave, dados, versao, updated_at)
    values (p_restaurante, p_chave, p_dados, 1, now());
    return jsonb_build_object('ok', true, 'versao', 1);
  end if;

  -- versão -1 = replay do offline: força a gravação e sobe o contador
  if p_versao <> -1 and p_versao <> v_atual.versao then
    return jsonb_build_object('ok', false, 'conflito', true,
                              'versao', v_atual.versao, 'dados', v_atual.dados);
  end if;

  update documentos
     set dados = p_dados, versao = v_atual.versao + 1, updated_at = now()
   where restaurante_id = p_restaurante and chave = p_chave;

  return jsonb_build_object('ok', true, 'versao', v_atual.versao + 1);
end $$;

-- ---------------------------------------------------------------------
-- 3) TRILHA DE AUDITORIA NÃO PODE SER ESCRITA PELO CLIENTE
--
--    A linha era montada no navegador com `usuario` e `cargo` vindos da
--    sessão local: dava para forjar entrada atribuída à diretoria — e, como
--    a policy impede apagar auditoria, ninguém conseguia remover depois.
-- ---------------------------------------------------------------------
create or replace function registrar_auditoria(p_acao text, p_detalhe text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_rid uuid; v_nome text; v_cargo text;
begin
  select restaurante_id, nome, cargo into v_rid, v_nome, v_cargo
    from perfis where id = auth.uid() and coalesce(ativo, true);
  if v_rid is null then return; end if;   -- sem perfil ativo: não registra (e não falha o app)

  insert into registros (id, restaurante_id, tipo, ts, dados, deleted)
  values (
    encode(gen_random_bytes(8), 'hex'),
    v_rid, 'auditoria', (extract(epoch from now()) * 1000)::bigint,
    jsonb_build_object(
      'acao', left(coalesce(p_acao, ''), 200),
      'detalhe', left(coalesce(p_detalhe, ''), 400),
      'usuario', coalesce(v_nome, '—'),   -- <<< vem do BANCO, não do cliente
      'cargo', coalesce(v_cargo, '—'),
      'data', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
      'hora', to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI')
    ),
    false
  );
end $$;

-- INSERT de auditoria pelo cliente passa a ser barrado (só a RPC acima grava)
drop policy if exists "reg_ins_v18" on registros;
create policy "reg_ins_v18" on registros for insert
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and tipo <> 'auditoria'
  );

-- =====================================================================
--  Conferência sugerida depois de rodar:
--    select coalesce(ativo,true) from perfis where id = auth.uid();
--    -- como cozinha, isto deve FALHAR:
--    select salvar_documento(meu_restaurante_id(), 'permissoes', '{}'::jsonb, 0);
--    -- e isto também:
--    insert into registros(id,restaurante_id,tipo,ts,dados,deleted)
--      values ('x', meu_restaurante_id(), 'auditoria', 0, '{}'::jsonb, false);
-- =====================================================================
