-- =====================================================================
--  MIGRAÇÃO 19 — FECHA A TRAVA DE SUPER-ADMIN QUE NUNCA TRAVOU
--
--  ⚠️ SEGURANÇA. Rodar imediatamente. Não é refatoração.
--
--  O bug, em uma linha: em SQL, `NULL = 'x'` não é FALSE, é NULL — e
--  `not NULL` também é NULL. No plpgsql, `if NULL then ... end if` NÃO
--  entra no ramo. Então:
--
--      if not sou_super_admin() then raise exception '...'; end if;
--
--  ...não levantava exceção nenhuma para quem chama SEM LOGIN, porque
--  sou_super_admin() era:
--
--      select auth.jwt() ->> 'email' = 'atiliopinpolho@gmail.com'
--
--  e um visitante anônimo não tem claim `email` → NULL = '...' → NULL.
--  A trava existia, estava escrita, e simplesmente não rodava.
--
--  NOVE funções dependiam dela. Verificado ao vivo contra este banco:
--    • feedback_todos      → VAZOU o feedback real de cliente sem login
--    • ativar_assinatura   → passou da trava e da validação de dias;
--                            com um restaurante_id real (que qualquer um
--                            obtém criando a própria conta) um anônimo
--                            se daria até 400 dias de assinatura grátis
--    • notas_admin_todas   → só devolveu vazio porque a tabela está vazia
--    • definir_bloqueio, definir_max_usuarios, salvar_notas_admin,
--      marcar_feedback, limpar_aviso_pagamento, usuarios_do_restaurante
--
--  Por que ninguém viu antes: com a tabela `feedback` vazia, a auditoria
--  lia "200 mas vazio" como "filtrou por dentro" e marcava ✅. Tabela
--  vazia não é RPC segura — o mesmo erro de leitura que fez "projeto
--  pausado" parecer "tudo bloqueado".
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) A CORREÇÃO — sou_super_admin() nunca mais devolve NULL
--
--    coalesce ANTES da comparação: sem claim de e-mail o resultado passa
--    a ser FALSE de verdade, e o `if not ...` das nove funções volta a
--    disparar. Uma linha fecha as nove — por isso não reescrevemos cada
--    função: menos superfície, menos chance de introduzir outro erro.
-- ---------------------------------------------------------------------
create or replace function sou_super_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'atiliopinpolho@gmail.com'
$$;

-- ---------------------------------------------------------------------
-- 2) MESMA ARMADILHA NAS TRAVAS DE CARGO
--
--    meu_cargo() devolve NULL para quem não tem sessão (e, desde a M18,
--    para quem foi desativado). `NULL <> 'diretoria'` é NULL, então estes
--    `if` também não disparavam.
--
--    Hoje o estrago era contido por acidente: logo depois vinha uma
--    consulta com meu_restaurante_id() = NULL, que não achava linha e
--    abortava com outra mensagem. Acidente não é proteção — `is distinct
--    from` trata NULL como valor e devolve TRUE, que é o que queremos.
--
--    ⚠️ As três funções são recriadas MANTENDO tudo o que já faziam
--    (M11: não desativar a si mesmo, não desativar a última diretoria,
--    limite de vagas; M18: GUC aurum.muda_ativo, trava de permissoes;
--    M8: versão -1 do replay offline e retorno de conflito). CREATE OR
--    REPLACE troca o corpo inteiro — omitir qualquer coisa aqui a apaga.
-- ---------------------------------------------------------------------
create or replace function desativar_usuario(p_usuario uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_rid        uuid := meu_restaurante_id();
  v_alvo       perfis%rowtype;
  v_diretorias integer;
begin
  if coalesce(meu_cargo(), '') not in ('gerencia','diretoria') then
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
  if coalesce(meu_cargo(), '') not in ('gerencia','diretoria') then
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

create or replace function salvar_documento(p_restaurante uuid, p_chave text, p_dados jsonb, p_versao integer)
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_atual documentos%rowtype;
begin
  -- `is distinct from` e não `<>`: com meu_cargo() NULL a comparação antiga
  -- devolvia NULL e a trava não disparava.
  if p_chave like '%permissoes' and meu_cargo() is distinct from 'diretoria' then
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
-- 3) TRAVAS DE CONFERÊNCIA — falhar alto, no espírito da M18
-- ---------------------------------------------------------------------

-- 3a) sou_super_admin() precisa devolver FALSE (não NULL) sem claim de e-mail.
--     Esta é a asserção que prova a correção; sem ela a migração "roda" e
--     a gente não sabe se pegou.
do $$
declare v_r boolean;
begin
  select sou_super_admin() into v_r;
  if v_r is null then
    raise exception 'M19: sou_super_admin() ainda devolve NULL — a trava continua sem funcionar.';
  end if;
  if v_r is not false then
    raise exception 'M19: sou_super_admin() devolveu % rodando como owner sem claim de e-mail; esperado FALSE.', v_r;
  end if;
end $$;

-- 3b) nenhuma função de super-admin pode ter ficado para trás.
do $$
declare v_faltou text;
begin
  select string_agg(proname, ', ' order by proname) into v_faltou
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and prosrc like '%sou_super_admin%'
     and proname <> 'sou_super_admin'
     and prosrc not like '%not sou_super_admin()%';
  if v_faltou is not null then
    raise notice 'M19: funções que citam sou_super_admin sem o padrão "not sou_super_admin()": % — conferir à mão.', v_faltou;
  end if;
end $$;

commit;

-- =====================================================================
--  Conferência depois de rodar (com a chave ANON, sem login):
--    POST /rest/v1/rpc/feedback_todos      → 400 "Apenas o administrador…"
--    POST /rest/v1/rpc/notas_admin_todas   → 400 "Apenas o administrador…"
--    POST /rest/v1/rpc/ativar_assinatura   → 400 "Apenas o administrador…"
--      (com p_dias VÁLIDO — com dias inválidos a mensagem de dias mascarava
--       o furo, que foi como ele passou despercebido)
--
--  E rodar: node scripts/auditar-supabase.mjs
--  ⚠️ A auditoria só flagra RPC de leitura que vaza se houver DADO na
--     tabela. Tabela vazia devolve [] e parece segura.
-- =====================================================================
