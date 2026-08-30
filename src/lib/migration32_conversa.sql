-- =====================================================================
--  M32 — o feedback vira conversa de verdade: ida, volta e encerramento
--
--  A M30 abriu a volta (a Aurum responde e o cliente lê). Faltava o resto de
--  uma conversa: o cliente não conseguia CONTINUAR o assunto nem dizer que já
--  estava resolvido. Para fazer as duas coisas ele tinha que abrir um assunto
--  novo pelo formulário de três perguntas — e do lado da Aurum chegava como se
--  fosse outro caso, sem ligação com o primeiro.
--
--  ⚠️ AS MENSAGENS FICAM NUMA COLUNA jsonb, não numa tabela nova. Uma conversa
--  de suporte tem meia dúzia de falas e é SEMPRE lida inteira, junto com o
--  registro que a originou — tabela separada só acrescentaria um join e uma
--  segunda porta para proteger. O limite de 30 falas por assunto é o que
--  impede a linha de crescer sem fim.
-- =====================================================================

alter table feedback add column if not exists mensagens jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 1) O cliente continua o assunto
--
--    ⚠️ REABRE. Assunto marcado como resolvido que recebe fala nova volta para
--    'novo' — senão a resposta do cliente cairia no fim da lista do painel,
--    embaixo de tudo que já foi resolvido, e ninguém veria.
-- ---------------------------------------------------------------------
create or replace function continuar_feedback(p_id uuid, p_texto text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_rid  uuid;
  v_txt  text;
  v_qtd  integer;
begin
  v_rid := meu_restaurante_id();
  if v_rid is null then raise exception 'Sem restaurante ativo.'; end if;

  v_txt := btrim(coalesce(p_texto, ''));
  if length(v_txt) = 0 then raise exception 'Escreva a mensagem.'; end if;
  if length(v_txt) > 4000 then raise exception 'Mensagem muito longa.'; end if;

  -- ⚠️ O `and restaurante_id` não é redundante com o `meu_restaurante_id()`
  -- acima: sem ele, quem descobrisse um id escreveria dentro da conversa de
  -- OUTRO restaurante.
  select jsonb_array_length(mensagens) into v_qtd from feedback
    where id = p_id and restaurante_id = v_rid;
  if v_qtd is null then raise exception 'Assunto nao encontrado.'; end if;
  if v_qtd >= 30 then
    raise exception 'Esta conversa já está longa. Abra um assunto novo.';
  end if;

  update feedback set
    mensagens = mensagens || jsonb_build_object('de', 'cliente', 'texto', v_txt, 'em', now()),
    status = 'novo',
    -- A resposta anterior deixa de ser "a última palavra": zerar o aviso aqui
    -- evita o selo vermelho ficar aceso depois que o próprio cliente escreveu.
    resposta_lida = true
  where id = p_id and restaurante_id = v_rid;
  return true;
end $$;

grant execute on function continuar_feedback(uuid, text) to authenticated;
revoke execute on function continuar_feedback(uuid, text) from anon;

-- ---------------------------------------------------------------------
-- 2) O cliente encerra
--
--    Encerrar é dele: quem sabe se o problema acabou é quem estava com o
--    problema. A Aurum continua podendo reabrir pelo painel.
-- ---------------------------------------------------------------------
create or replace function concluir_feedback(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rid uuid;
begin
  v_rid := meu_restaurante_id();
  if v_rid is null then raise exception 'Sem restaurante ativo.'; end if;
  update feedback set status = 'resolvido', resposta_lida = true
    where id = p_id and restaurante_id = v_rid;
  return found;
end $$;

grant execute on function concluir_feedback(uuid) to authenticated;
revoke execute on function concluir_feedback(uuid) from anon;

-- ---------------------------------------------------------------------
-- 3) As duas leituras passam a devolver a conversa
--
--    ⚠️ DROP antes: mudar a tabela de retorno de uma função é 42P13 em
--    `create or replace`, e a migração morreria no meio.
-- ---------------------------------------------------------------------
drop function if exists meus_feedbacks();
create or replace function meus_feedbacks()
returns table (id uuid, tipo text, dados jsonb, status text, created_at timestamptz,
               resposta text, respondida_em timestamptz, resposta_lida boolean,
               autor text, mensagens jsonb)
language plpgsql security definer set search_path = public as $$
declare v_rid uuid;
begin
  v_rid := meu_restaurante_id();
  if v_rid is null then return; end if;
  return query
    select f.id, f.tipo, f.dados, f.status, f.created_at,
           f.resposta, f.respondida_em, f.resposta_lida, p.nome, f.mensagens
    from feedback f
    left join perfis p on p.id = f.usuario_id
    where f.restaurante_id = v_rid
    order by f.created_at desc
    limit 50;
end $$;

grant execute on function meus_feedbacks() to authenticated;
revoke execute on function meus_feedbacks() from anon;

drop function if exists feedback_todos();
create or replace function feedback_todos()
returns table (id uuid, restaurante_id uuid, restaurante_nome text, usuario_nome text,
               tipo text, dados jsonb, contexto text, status text, created_at timestamptz,
               resposta text, respondida_em timestamptz, resposta_lida boolean, mensagens jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then raise exception 'Apenas o administrador do sistema vê o feedback.'; end if;
  return query
    select f.id, f.restaurante_id, r.nome, p.nome, f.tipo, f.dados, f.contexto, f.status, f.created_at,
           f.resposta, f.respondida_em, f.resposta_lida, f.mensagens
    from feedback f
    left join restaurantes r on r.id = f.restaurante_id
    left join perfis p on p.id = f.usuario_id
    order by (f.status = 'resolvido'), f.created_at desc;
end $$;

grant execute on function feedback_todos() to authenticated;
revoke execute on function feedback_todos() from anon;

-- A resposta da Aurum passa a entrar na conversa TAMBÉM. `resposta` continua
-- existindo como "a última palavra da Aurum": é o que o painel usa para saber
-- se já respondeu e se o cliente leu.
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
    mensagens = mensagens || jsonb_build_object('de', 'aurum', 'texto', v_txt, 'em', now()),
    resposta_lida = false,
    status = case when status = 'novo' then 'visto' else status end
  where id = p_id;
  if not found then raise exception 'Feedback nao encontrado.'; end if;
  return true;
end $$;

grant execute on function responder_feedback(uuid, text) to authenticated;
revoke execute on function responder_feedback(uuid, text) from anon;

-- ---------------------------------------------------------------------
-- 4) SONDAS
-- ---------------------------------------------------------------------
do $$
declare
  v_rest uuid := gen_random_uuid();
  v_fb   uuid;
  v_n    integer;
begin
  if exists (select 1 from pg_policies where tablename = 'feedback') then
    raise exception 'M32: apareceu policy em feedback — um restaurante leria a conversa do outro. Abortando.';
  end if;

  if not has_function_privilege('authenticated', 'continuar_feedback(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'concluir_feedback(uuid)', 'EXECUTE') then
    raise exception 'M32: authenticated sem EXECUTE nas funcoes de conversa. Abortando.';
  end if;
  if has_function_privilege('anon', 'continuar_feedback(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'concluir_feedback(uuid)', 'EXECUTE') then
    raise exception 'M32: funcao de conversa alcancavel sem login. Abortando.';
  end if;

  -- Só uma assinatura de cada leitura: duas deixariam a chamada ambígua.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('meus_feedbacks','feedback_todos')) <> 2 then
    raise exception 'M32: sobrou versao antiga de meus_feedbacks/feedback_todos. Abortando.';
  end if;

  -- ⚠️ A CONVERSA GUARDA MESMO. "Criei a coluna" não é o mesmo que "o append
  -- funciona": o operador || em jsonb com objeto no lugar de array é um erro
  -- clássico e silencioso — vira merge de chaves em vez de acrescentar item.
  insert into restaurantes (id, nome) values (v_rest, 'SONDA M32 apagar');
  insert into feedback (restaurante_id, tipo, dados) values (v_rest, 'bug', '{}'::jsonb)
    returning id into v_fb;
  update feedback set mensagens = mensagens || jsonb_build_object('de','aurum','texto','oi')
    where id = v_fb;
  update feedback set mensagens = mensagens || jsonb_build_object('de','cliente','texto','ok')
    where id = v_fb;
  select jsonb_array_length(mensagens) into v_n from feedback where id = v_fb;
  if v_n <> 2 then
    raise exception 'M32: a conversa nao acumulou (achei % falas, esperava 2). Abortando.', v_n;
  end if;

  delete from feedback where restaurante_id = v_rest;
  delete from restaurantes where id = v_rest;
  if exists (select 1 from restaurantes where id = v_rest) then
    raise exception 'M32: o restaurante da sonda nao foi apagado. Abortando.';
  end if;
end $$;
