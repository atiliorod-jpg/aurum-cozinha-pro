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
  -- O GUC é setado por desativar_usuario/reativar_usuario logo antes do UPDATE.
  -- Sem esta conferência o trigger recusa TAMBÉM as RPCs oficiais e a função
  -- "desativar acesso" para de existir. Ele é local à transação, e cada
  -- requisição do PostgREST é a sua própria transação, então não dá para um
  -- cliente pré-setar o GUC e depois mandar o PATCH em outra requisição.
  if new.ativo is distinct from old.ativo
     and coalesce(current_setting('aurum.muda_ativo', true), '') <> '1' then
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
-- passagem legítima com um GUC local à transação.
--
-- ⚠️ As duas funções são recriadas MANTENDO tudo o que a migração 11 já
-- protegia (não desativar a si mesmo, não desativar a última diretoria ativa,
-- respeitar o limite de vagas ao reativar) e o tipo de retorno `boolean`.
-- CREATE OR REPLACE não muda tipo de retorno: escrever `returns void` aqui
-- aborta o script inteiro com 42P13 e NADA desta migração é aplicado.
create or replace function desativar_usuario(p_usuario uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_rid        uuid := meu_restaurante_id();
  v_alvo       perfis%rowtype;
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
  if v_alvo.cargo = 'diretoria' then
    select count(*) into v_diretorias from perfis
      where restaurante_id = v_rid and cargo = 'diretoria' and coalesce(ativo, true) = true;
    if v_diretorias <= 1 then
      raise exception 'Não é possível desativar a última diretoria ativa.';
    end if;
  end if;
  perform set_config('aurum.muda_ativo', '1', true);
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
  select count(*) into v_count from perfis where restaurante_id = v_rid and coalesce(ativo, true) = true;
  select coalesce(max_usuarios, 3) into v_max from restaurantes where id = v_rid;
  if v_count >= v_max then
    raise exception 'Limite de % usuários atingido. Aumente o limite ou desative outro acesso.', v_max;
  end if;
  perform set_config('aurum.muda_ativo', '1', true);
  update perfis set ativo = true where id = p_usuario;
  return true;
end $$;

-- meu_cargo() também precisa ignorar quem foi desativado: sem isto o demitido
-- ainda passa por toda checagem de cargo (ex.: alterar_cargo), e a revogação
-- não é definitiva.
create or replace function meu_cargo()
returns text language sql stable security definer set search_path = public as $$
  select cargo from perfis where id = auth.uid() and coalesce(ativo, true)
$$;

-- O desativado precisa conseguir ler o PRÓPRIO perfil, senão o app não sabe
-- dizer "acesso desativado" e mostra "cadastro incompleto — peça um convite",
-- que é conselho errado (aceitar_convite recusa quem já tem restaurante).
drop policy if exists "perfis_sel_proprio" on perfis;
create policy "perfis_sel_proprio" on perfis for select using (id = auth.uid());

-- ---------------------------------------------------------------------
-- 2) MATRIZ DE PERMISSÕES FORA DO ALCANCE DE QUEM ELA RESTRINGE
--
--    A matriz morava em documentos/prefs, e doc_upd liberava QUALQUER membro
--    a escrever QUALQUER chave. Um cozinheiro se dava todas as permissões
--    com uma requisição. Agora ela tem chave própria, e só diretoria grava.
-- ---------------------------------------------------------------------
-- ⚠️ CRÍTICO: policies PERMISSIVAS do Postgres se combinam com OR. Criar a
-- policy nova SEM derrubar a antiga não trava nada — a antiga continua
-- aprovando. As v10 abaixo não filtram `chave`, então precisam sair, senão
-- toda esta seção vira enfeite e o cozinheiro segue reescrevendo `permissoes`
-- por PATCH direto (sem passar pela RPC).
drop policy if exists "doc_ins_v10" on documentos;
drop policy if exists "doc_upd_v10" on documentos;
drop policy if exists "doc_ins_v18" on documentos;
drop policy if exists "doc_upd_v18" on documentos;

create policy "doc_ins_v18" on documentos for insert
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and (chave not like '%permissoes' or meu_cargo() = 'diretoria')
  );

create policy "doc_upd_v18" on documentos for update
  using (restaurante_id = meu_restaurante_id())
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and (chave not like '%permissoes' or meu_cargo() = 'diretoria')
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
  if p_chave like '%permissoes' and meu_cargo() <> 'diretoria' then
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
set search_path = public, extensions   -- pgcrypto (gen_random_bytes) vive em `extensions` no Supabase
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
-- mesma armadilha do OR: sem derrubar a v10 (que não filtra `tipo`), o INSERT
-- direto de tipo='auditoria' continuaria passando e a trilha seguiria forjável.
drop policy if exists "reg_ins_v10" on registros;
drop policy if exists "reg_ins_v18" on registros;
-- ⚠️ E não basta travar o INSERT. O `with check` do UPDATE antigo NÃO
-- restringia `tipo`, então dava para pegar um lançamento comum e reescrever
-- `tipo='auditoria'`. Pior: num upsert (INSERT ... ON CONFLICT DO UPDATE) o
-- Postgres aplica as policies de UPDATE no caminho de conflito, ou seja, a
-- policy de INSERT nem chega a ser avaliada. E, como auditoria não pode ser
-- apagada, a linha forjada ficaria lá para sempre.
drop policy if exists "reg_upd_v10" on registros;
create policy "reg_upd_v18" on registros for update
  using (restaurante_id = meu_restaurante_id() and tipo <> 'auditoria')
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and tipo <> 'auditoria'   -- <<< faltava: impede virar auditoria por UPDATE/upsert
  );

-- mesma falha na policy do modo suporte
drop policy if exists "reg_super_ins_v7" on registros;
drop policy if exists "reg_super_upd_v7" on registros;
create policy "reg_super_ins_v18" on registros for insert
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id) and tipo <> 'auditoria');
create policy "reg_super_upd_v18" on registros for update
  using (sou_super_admin() and suporte_pode_editar(restaurante_id))
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id) and tipo <> 'auditoria');
create policy "reg_ins_v18" on registros for insert
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and tipo <> 'auditoria'
  );

-- O super-admin em modo suporte escreve documentos do cliente (migração 7).
-- Ele já não podia tocar em `prefs`; `permissoes` entra na mesma proteção,
-- senão a matriz de acessos do cliente seria alterável de fora.
drop policy if exists "doc_super_ins_v7" on documentos;
drop policy if exists "doc_super_upd_v7" on documentos;

create policy "doc_super_ins_v18" on documentos for insert
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id)
              and chave not in ('prefs', 'permissoes'));

create policy "doc_super_upd_v18" on documentos for update
  using (sou_super_admin() and suporte_pode_editar(restaurante_id))
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id)
              and chave not in ('prefs', 'permissoes'));

-- =====================================================================
--  Conferência sugerida depois de rodar:
--    select coalesce(ativo,true) from perfis where id = auth.uid();
--    -- como cozinha, isto deve FALHAR:
--    select salvar_documento(meu_restaurante_id(), 'permissoes', '{}'::jsonb, 0);
--    -- e isto também:
--    insert into registros(id,restaurante_id,tipo,ts,dados,deleted)
--      values ('x', meu_restaurante_id(), 'auditoria', 0, '{}'::jsonb, false);
--    -- e confira que NENHUMA policy antiga sobreviveu:
--    select policyname, cmd from pg_policies
--     where tablename in ('documentos','registros') order by tablename, policyname;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4) TRAVA DE CONFERÊNCIA — a migração precisa falhar alto, não em silêncio
--
--    Os `drop policy if exists` acima miram nomes fixos (_v10, _v7). Se o
--    banco tiver drift e alguma policy antiga se chamar outra coisa, o drop
--    não acha nada, não reclama, e a policy velha — PERMISSIVA, ou seja,
--    somada por OR — continua aprovando o que as novas recusam. Foi assim
--    que a primeira versão desta migração "rodou" sem fechar nada.
--
--    Depois desta migração, TODA policy de INSERT/UPDATE em documentos e
--    registros tem que ser uma _v18. Se sobrar qualquer outra, aborta e a
--    transação inteira volta atrás — melhor não aplicar do que aplicar pela
--    metade e achar que está seguro.
-- ---------------------------------------------------------------------
do $$
declare v_sobrou text;
begin
  select string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ' order by tablename, policyname)
    into v_sobrou
    from pg_policies
   where schemaname = 'public'
     and tablename in ('documentos', 'registros')
     and cmd in ('INSERT', 'UPDATE', 'ALL')
     and policyname not like '%\_v18';

  if v_sobrou is not null then
    raise exception 'Policy antiga sobreviveu e anula esta migração (OR de policies permissivas): %', v_sobrou;
  end if;
end $$;
