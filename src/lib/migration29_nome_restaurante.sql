-- =====================================================================
--  M29 — o nome do estabelecimento passa a ser corrigível, com autorização
--
--  O nome entra uma vez, no cadastro, e nunca mais podia ser tocado. Ele sai
--  IMPRESSO no rodapé de toda etiqueta e aparece no topo do app — um erro de
--  digitação ali circula colado no pote e não tinha conserto.
--
--  ⚠️ O CLIENTE PEDE; QUEM MUDA É A AURUM. Chegou-se a considerar liberar a
--  edição direta ao dono da conta, e a decisão foi outra: o nome é o que
--  identifica o estabelecimento na etiqueta, no contrato e na cobrança. Trocar
--  sozinho gera confusão — inclusive suporte olhando para um cliente que
--  "sumiu" porque virou outro nome. O pedido vai pelo canal de feedback, que
--  já existe, já tem rate limit e já cai numa aba que a Aurum lê.
--
--  Por isso esta migração faz DUAS coisas pequenas:
--    1. um terceiro tipo de feedback: 'pedido'
--    2. uma função de renomear, para o SUPER-ADMIN
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) O tipo 'pedido'
--
--    ⚠️ O CHECK antigo tem que sair ANTES do novo entrar; `add constraint`
--    com o mesmo nome falha, e um CHECK velho sobrevivendo recusaria em
--    silêncio todo pedido enviado pelo app — o cliente veria "não consegui
--    enviar agora" sem nunca entender por quê.
-- ---------------------------------------------------------------------
alter table feedback drop constraint if exists feedback_tipo_check;
alter table feedback add constraint feedback_tipo_check
  check (tipo in ('bug', 'sugestao', 'pedido'));

-- A função é reescrita INTEIRA (create or replace troca o corpo todo): esta é
-- a versão da M16, com o rate limit preservado. Omitir o limite aqui seria
-- apagá-lo sem ninguém notar.
create or replace function enviar_feedback(p_tipo text, p_dados jsonb, p_contexto text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_tipo not in ('bug','sugestao','pedido') then raise exception 'Tipo inválido.'; end if;
  select count(*) into v_count from feedback
    where usuario_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_count >= 10 then
    raise exception 'Muitas mensagens em pouco tempo. Tente novamente mais tarde.';
  end if;
  insert into feedback (restaurante_id, usuario_id, tipo, dados, contexto)
    values (meu_restaurante_id(), auth.uid(), p_tipo, coalesce(p_dados, '{}'::jsonb), p_contexto);
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 2) Renomear — só o super-admin
--
--    ⚠️ FUNÇÃO, NÃO POLICY DE UPDATE. A M27 deixou uma sonda que ABORTA se
--    aparecer policy de UPDATE/ALL em `restaurantes`, e ela está certa: a
--    mesma linha guarda `produto`, `assinatura_ate`, `max_usuarios` e
--    `bloqueado`. Abrir escrita ali — mesmo "só do nome" — deixaria o cliente
--    trocar o próprio plano, estender a própria assinatura e se desbloquear.
--    PostgREST manda a coluna que quiser; quem decide é o banco.
--
--    Mesmo molde de definir_produto (M27): trava como PRIMEIRA linha.
-- ---------------------------------------------------------------------
create or replace function definir_nome_restaurante(p_restaurante uuid, p_nome text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare v_nome text;
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema muda o nome do estabelecimento.';
  end if;
  v_nome := btrim(coalesce(p_nome, ''));
  if length(v_nome) < 2 then
    raise exception 'O nome precisa de pelo menos 2 caracteres.';
  end if;
  -- 60 é o que o cabeçalho do app e o rodapé da etiqueta comportam. Sem teto,
  -- um nome colado de outro lugar sairia cortado no papel sem avisar ninguém.
  if length(v_nome) > 60 then
    raise exception 'O nome pode ter no maximo 60 caracteres.';
  end if;
  update restaurantes set nome = v_nome where id = p_restaurante;
  if not found then
    raise exception 'Restaurante nao encontrado.';
  end if;
  return v_nome;
end $function$;

grant execute on function definir_nome_restaurante(uuid, text) to authenticated;
revoke execute on function definir_nome_restaurante(uuid, text) from anon;

-- ---------------------------------------------------------------------
-- 3) SONDAS — falham ALTO, dentro da transação, e desfazem tudo
--
--    "Concedi" não é o mesmo que "está concedido" (M24), e "não criei policy"
--    não é o mesmo que "não existe policy" (M27).
-- ---------------------------------------------------------------------
do $$
begin
  -- (a) a tabela continua SEM escrita direta: é isto que torna a função segura
  if exists (select 1 from pg_policies
              where tablename = 'restaurantes' and cmd in ('UPDATE', 'ALL')) then
    raise exception 'M29: apareceu policy de UPDATE/ALL em restaurantes — o cliente trocaria o proprio plano e a propria assinatura. Abortando.';
  end if;

  -- (b) o super-admin alcança a função nova
  if not has_function_privilege('authenticated', 'definir_nome_restaurante(uuid,text)', 'EXECUTE') then
    raise exception 'M29: authenticated sem EXECUTE em definir_nome_restaurante — o botao do painel nasceria quebrado. Abortando.';
  end if;

  -- (c) quem não fez login não alcança nada disto
  if has_function_privilege('anon', 'definir_nome_restaurante(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'enviar_feedback(text,jsonb,text)', 'EXECUTE') then
    raise exception 'M29: funcao alcancavel sem login. Abortando.';
  end if;

  -- (d) o CHECK novo aceita 'pedido' E continua recusando lixo. Sem esta
  --     sonda, um CHECK antigo sobrevivente faria todo pedido do app falhar
  --     com "não consegui enviar agora" e ninguém saberia por quê.
  begin
    insert into feedback (restaurante_id, usuario_id, tipo, dados)
      values (null, null, 'pedido', '{"sonda":true}'::jsonb);
    delete from feedback where dados ? 'sonda';
  exception when others then
    raise exception 'M29: o tipo pedido nao passa no CHECK da tabela feedback (%). Abortando.', sqlerrm;
  end;

  begin
    insert into feedback (restaurante_id, usuario_id, tipo, dados)
      values (null, null, 'nao_existe', '{"sonda":true}'::jsonb);
    delete from feedback where dados ? 'sonda';
    raise exception 'M29: a tabela feedback aceitou um tipo invalido — o CHECK sumiu. Abortando.';
  exception when others then
    if sqlerrm like 'M29:%' then raise; end if;
    null; -- recusa esperada
  end;
end $$;
