-- =====================================================================
--  M34 — o painel pode apagar um feedback
--
--  "Resolvido" some da fila mas continua na lista para sempre. Depois de
--  algumas dezenas de clientes, teste antigo, mensagem duplicada e assunto que
--  nasceu por engano ficam empilhados na frente do que importa.
--
--  ⚠️ APAGAR É DEFINITIVO e leva a conversa junto — é por isso que a tela
--  pergunta antes. Aqui não há "lixeira": guardar o apagado seria manter o
--  mesmo volume com outro nome.
-- =====================================================================

create or replace function apagar_feedback(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema apaga feedback.';
  end if;
  delete from feedback where id = p_id;
  return found;
end $$;

grant execute on function apagar_feedback(uuid) to authenticated;
revoke execute on function apagar_feedback(uuid) from anon;

do $$
declare
  v_rest uuid := gen_random_uuid();
  v_fb   uuid;
begin
  -- a tabela continua sem policy: é o que separa a conversa de um cliente da
  -- do outro, e uma função de apagar não pode ter virado motivo para abrir.
  if exists (select 1 from pg_policies where tablename = 'feedback') then
    raise exception 'M34: apareceu policy em feedback. Abortando.';
  end if;
  if not has_function_privilege('authenticated', 'apagar_feedback(uuid)', 'EXECUTE') then
    raise exception 'M34: authenticated sem EXECUTE em apagar_feedback. Abortando.';
  end if;
  if has_function_privilege('anon', 'apagar_feedback(uuid)', 'EXECUTE') then
    raise exception 'M34: apagar_feedback alcancavel sem login. Abortando.';
  end if;

  -- ⚠️ E apaga MESMO. Uma função que devolve true sem remover nada deixaria o
  -- painel dizendo "apagado" com a linha ainda lá — e o dono repetindo o
  -- clique sem entender.
  insert into restaurantes (id, nome) values (v_rest, 'SONDA M34 apagar');
  insert into feedback (restaurante_id, tipo, dados) values (v_rest, 'bug', '{}'::jsonb)
    returning id into v_fb;
  delete from feedback where id = v_fb;
  if exists (select 1 from feedback where id = v_fb) then
    raise exception 'M34: o feedback nao foi apagado. Abortando.';
  end if;
  delete from restaurantes where id = v_rest;
end $$;
