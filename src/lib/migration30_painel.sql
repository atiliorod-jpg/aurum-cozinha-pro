-- =====================================================================
--  M30 — o painel ganha o cadastro do cliente e o feedback vira conversa
--
--  Duas coisas que estavam pela metade:
--
--  1. CADASTRO. CNPJ, WhatsApp, cidade e UF entram uma vez, no formulário, e
--     nunca mais podiam ser tocados. O WhatsApp é por onde a Aurum fala com o
--     cliente e o CNPJ é o que identifica a conta na cobrança — errar a
--     digitação ali deixava a conta incontactável sem conserto.
--
--  2. FEEDBACK DE MÃO ÚNICA. O cliente escrevia, a Aurum lia e marcava
--     "resolvido" — e o cliente nunca ficava sabendo de nada. Do lado dele o
--     canal parecia um buraco: escreveu, sumiu. Agora a resposta volta pelo
--     mesmo lugar, e ele vê que foi respondida.
--
--  ⚠️ TUDO POR RPC, a tabela `feedback` continua SEM POLICY NENHUMA (M15). É
--  o que impede um restaurante de ler o feedback de outro — e o que já vale
--  para `restaurantes`, que não tem policy de escrita de propósito.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Cadastro do cliente — só super-admin
--
--    Mesmo molde de definir_produto (M27) e definir_nome_restaurante (M29):
--    SECURITY DEFINER, trava como PRIMEIRA linha, tocando SÓ estas colunas.
--
--    ⚠️ NULL SIGNIFICA "NÃO MEXER", e isso precisa ser explícito: sem o
--    coalesce cada campo deixado em branco na tela APAGARIA o valor gravado.
--    Corrigir a cidade não pode limpar o CNPJ.
-- ---------------------------------------------------------------------
create or replace function definir_cadastro_restaurante(
  p_restaurante uuid,
  p_cnpj text default null,
  p_whatsapp text default null,
  p_cidade text default null,
  p_uf text default null
) returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare
  v_cnpj text;
  v_uf   text;
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema altera o cadastro.';
  end if;

  -- Só dígitos: o CNPJ é gravado cru e formatado na tela. Guardar com pontos
  -- em umas linhas e sem pontos em outras quebraria a busca e o índice único.
  v_cnpj := nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '');
  if v_cnpj is not null and not cnpj_valido(v_cnpj) then
    raise exception 'CNPJ invalido.';
  end if;

  v_uf := nullif(upper(btrim(coalesce(p_uf, ''))), '');
  if v_uf is not null and length(v_uf) <> 2 then
    raise exception 'UF deve ter 2 letras.';
  end if;

  update restaurantes set
    cnpj     = coalesce(v_cnpj, cnpj),
    whatsapp = coalesce(nullif(btrim(coalesce(p_whatsapp, '')), ''), whatsapp),
    cidade   = coalesce(nullif(btrim(coalesce(p_cidade, '')), ''), cidade),
    uf       = coalesce(v_uf, uf)
  where id = p_restaurante;
  if not found then
    raise exception 'Restaurante nao encontrado.';
  end if;
  return true;
end $function$;

grant execute on function definir_cadastro_restaurante(uuid, text, text, text, text) to authenticated;
revoke execute on function definir_cadastro_restaurante(uuid, text, text, text, text) from anon;

-- ---------------------------------------------------------------------
-- 2) A resposta ao cliente
-- ---------------------------------------------------------------------
alter table feedback add column if not exists resposta      text;
alter table feedback add column if not exists respondida_em timestamptz;
alter table feedback add column if not exists resposta_lida boolean not null default false;

-- Super-admin responde. Responder também marca como VISTO quando ainda estava
-- 'novo': responder e deixar na fila de novos é trabalho repetido.
create or replace function responder_feedback(p_id uuid, p_resposta text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_txt text;
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema responde o feedback.';
  end if;
  v_txt := btrim(coalesce(p_resposta, ''));
  if length(v_txt) = 0 then raise exception 'Escreva a resposta.'; end if;
  if length(v_txt) > 4000 then raise exception 'Resposta muito longa.'; end if;
  update feedback set
    resposta = v_txt,
    respondida_em = now(),
    -- ⚠️ ZERA O "LIDA". Editar uma resposta que o cliente já tinha lido tem
    -- que voltar a avisar — senão a correção fica invisível justamente para
    -- quem precisava dela.
    resposta_lida = false,
    status = case when status = 'novo' then 'visto' else status end
  where id = p_id;
  if not found then raise exception 'Feedback nao encontrado.'; end if;
  return true;
end $$;

grant execute on function responder_feedback(uuid, text) to authenticated;
revoke execute on function responder_feedback(uuid, text) from anon;

-- O painel precisa enxergar o que já respondeu. `create or replace` troca o
-- corpo INTEIRO, então esta é a versão da M15 acrescida das colunas novas —
-- omitir o join ou a ordenação apagaria o que a M15 fez.
--
-- ⚠️ Assinatura de RETORNO diferente exige DROP: `create or replace` recusa
-- mudança na tabela de retorno com 42P13, e a migração morreria aqui.
drop function if exists feedback_todos();
create or replace function feedback_todos()
returns table (id uuid, restaurante_id uuid, restaurante_nome text, usuario_nome text,
               tipo text, dados jsonb, contexto text, status text, created_at timestamptz,
               resposta text, respondida_em timestamptz, resposta_lida boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then raise exception 'Apenas o administrador do sistema vê o feedback.'; end if;
  return query
    select f.id, f.restaurante_id, r.nome, p.nome, f.tipo, f.dados, f.contexto, f.status, f.created_at,
           f.resposta, f.respondida_em, f.resposta_lida
    from feedback f
    left join restaurantes r on r.id = f.restaurante_id
    left join perfis p on p.id = f.usuario_id
    order by (f.status = 'resolvido'), f.created_at desc;
end $$;

grant execute on function feedback_todos() to authenticated;
revoke execute on function feedback_todos() from anon;

-- ---------------------------------------------------------------------
-- 3) O cliente vê o que enviou e o que foi respondido
--
--    ⚠️ FILTRA PELO RESTAURANTE, não pelo usuário. Quem escreveu pode ter sido
--    a cozinheira e quem lê a resposta é a diretoria — filtrar por auth.uid()
--    faria a dona da conta não enxergar o que a equipe dela perguntou.
--    `meu_restaurante_id()` já ignora perfil inativo (M18), então ex-
--    funcionário não alcança nada.
-- ---------------------------------------------------------------------
create or replace function meus_feedbacks()
returns table (id uuid, tipo text, dados jsonb, status text, created_at timestamptz,
               resposta text, respondida_em timestamptz, resposta_lida boolean,
               autor text)
language plpgsql security definer set search_path = public as $$
declare v_rid uuid;
begin
  v_rid := meu_restaurante_id();
  if v_rid is null then return; end if;
  return query
    select f.id, f.tipo, f.dados, f.status, f.created_at,
           f.resposta, f.respondida_em, f.resposta_lida, p.nome
    from feedback f
    left join perfis p on p.id = f.usuario_id
    where f.restaurante_id = v_rid
    order by f.created_at desc
    limit 50;
end $$;

grant execute on function meus_feedbacks() to authenticated;
revoke execute on function meus_feedbacks() from anon;

-- Cliente marca a resposta como lida (some o aviso no botão Ajuda).
-- ⚠️ O `where` repete o restaurante: sem ele, quem descobrisse um id marcaria
-- como lida a resposta de OUTRO restaurante — e aquele cliente perderia o
-- aviso sem nunca ter aberto.
create or replace function marcar_resposta_lida(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rid uuid;
begin
  v_rid := meu_restaurante_id();
  if v_rid is null then raise exception 'Sem restaurante ativo.'; end if;
  update feedback set resposta_lida = true where id = p_id and restaurante_id = v_rid;
  return found;
end $$;

grant execute on function marcar_resposta_lida(uuid) to authenticated;
revoke execute on function marcar_resposta_lida(uuid) from anon;

-- ---------------------------------------------------------------------
-- 4) SONDAS — falham ALTO, dentro da transação, e desfazem tudo
-- ---------------------------------------------------------------------
do $$
begin
  -- (a) a tabela de feedback continua sem policy: é o que separa um cliente do
  --     outro. Uma policy permissiva aqui vazaria conversa entre restaurantes.
  if exists (select 1 from pg_policies where tablename = 'feedback') then
    raise exception 'M30: apareceu policy em feedback — um restaurante leria a conversa do outro. Abortando.';
  end if;

  -- (b) `restaurantes` continua sem escrita direta (herdado da M27/M29)
  if exists (select 1 from pg_policies
              where tablename = 'restaurantes' and cmd in ('UPDATE', 'ALL')) then
    raise exception 'M30: apareceu policy de UPDATE/ALL em restaurantes. Abortando.';
  end if;

  -- (c) quem precisa alcança
  if not has_function_privilege('authenticated', 'definir_cadastro_restaurante(uuid,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'responder_feedback(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'meus_feedbacks()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'feedback_todos()', 'EXECUTE') then
    raise exception 'M30: authenticated sem EXECUTE em alguma funcao nova — a tela nasceria quebrada. Abortando.';
  end if;

  -- (d) quem não fez login não alcança nada
  if has_function_privilege('anon', 'definir_cadastro_restaurante(uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'responder_feedback(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'meus_feedbacks()', 'EXECUTE')
     or has_function_privilege('anon', 'marcar_resposta_lida(uuid)', 'EXECUTE') then
    raise exception 'M30: funcao alcancavel sem login. Abortando.';
  end if;

  -- (e) a versão antiga de feedback_todos não pode ter sobrado: duas
  --     assinaturas fariam a chamada do painel ficar ambígua.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'feedback_todos') <> 1 then
    raise exception 'M30: existe mais de uma feedback_todos — a chamada do painel ficaria ambigua. Abortando.';
  end if;

  -- (f) as colunas novas existem de verdade
  if not exists (select 1 from information_schema.columns
                  where table_name = 'feedback' and column_name = 'resposta') then
    raise exception 'M30: coluna resposta nao foi criada. Abortando.';
  end if;
end $$;
