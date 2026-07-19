-- =====================================================================
--  AURUM COZINHA PRO — Migração 16: anti-spam (rate limit)
--  Rode DEPOIS das migrações 13–15. Seguro rodar mais de uma vez.
--
--  Sem freio, um cliente podia tocar "Já paguei" ou mandar feedback em loop e
--  poluir a aba do super-admin. Não é falha de isolamento (as RPCs já amarram
--  meu_restaurante_id / auth.uid), é só abuso operacional. Aqui limitamos:
--   - avisar_pagamento: no máximo 1 aviso por hora
--   - enviar_feedback: no máximo 10 mensagens por hora por usuário
-- =====================================================================

-- IMPORTANTE: a m13 criou avisar_pagamento(text) e a m14 criou
-- avisar_pagamento(text, text). Como as assinaturas diferem, o `create or
-- replace` cria uma SOBRECARGA nova em vez de substituir — a versão de 1
-- argumento (sem rate limit) continuaria existindo e furaria o limite.
-- Removemos a antiga para sobrar só a de 2 args, com o freio.
drop function if exists avisar_pagamento(text);

create or replace function avisar_pagamento(p_plano text, p_nome text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_rid    uuid := meu_restaurante_id();
  v_ultimo timestamptz;
begin
  if v_rid is null then raise exception 'Sem restaurante.'; end if;
  select aviso_pagamento_em into v_ultimo from restaurantes where id = v_rid;
  if v_ultimo is not null and v_ultimo > now() - interval '1 hour' then
    raise exception 'Você já avisou há pouco. Aguarde a confirmação da equipe (pode mandar o comprovante no WhatsApp).';
  end if;
  update restaurantes
     set aviso_pagamento_em = now(),
         aviso_pagamento_plano = coalesce(nullif(trim(p_plano), ''), 'mensal'),
         aviso_pagamento_nome = nullif(trim(p_nome), '')
   where id = v_rid;
  return true;
end $$;

create or replace function enviar_feedback(p_tipo text, p_dados jsonb, p_contexto text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_tipo not in ('bug','sugestao') then raise exception 'Tipo inválido.'; end if;
  select count(*) into v_count from feedback
    where usuario_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_count >= 10 then
    raise exception 'Muitas mensagens em pouco tempo. Tente novamente mais tarde.';
  end if;
  insert into feedback (restaurante_id, usuario_id, tipo, dados, contexto)
    values (meu_restaurante_id(), auth.uid(), p_tipo, coalesce(p_dados, '{}'::jsonb), p_contexto);
  return true;
end $$;

-- =====================================================================
--  PRONTO. Teste: avisar_pagamento 2x seguidas → 2ª falha; após 1h, ok.
--  10 feedbacks na mesma hora → o 11º falha.
-- =====================================================================
