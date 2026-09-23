-- =====================================================================
--  M47 — A HORA DO SERVIDOR (limite de uso sem internet, 23/09/2026)
--
--  PEDIDO DO DONO: o app não pode seguir funcionando sem internet para quem
--  está com a assinatura vencida. A regra combinada: sem internet ele
--  funciona até 72 horas depois da última confirmação da assinatura, nunca
--  além da data de vencimento já conhecida, e desconfia de relógio atrasado.
--
--  ⚠️ O RELÓGIO É DO APARELHO, e aparelho tem relógio que se atrasa — de
--  propósito ou não. A tela compara a data de vencimento com a hora de
--  AGORA; com o relógio voltado um mês, uma assinatura vencida pareceria em
--  dia. Esta função devolve a hora do banco: na confirmação o app mede a
--  diferença e passa a contar com a hora certa.
--
--  Só leitura, sem dado de ninguém. Mesmo assim, só para quem está logado
--  (M24: toda função nova nasce sem grant).
-- =====================================================================

begin;

create or replace function hora_do_servidor()
returns timestamptz language sql stable security invoker set search_path = public as $$
  select now();
$$;

revoke all on function hora_do_servidor() from public, anon;
grant execute on function hora_do_servidor() to authenticated;

do $$
begin
  if not has_function_privilege('authenticated', 'hora_do_servidor()', 'execute') then
    raise exception 'M47: authenticated sem execute em hora_do_servidor — abortando.';
  end if;
  if has_function_privilege('anon', 'hora_do_servidor()', 'execute') then
    raise exception 'M47: anon consegue chamar hora_do_servidor — abortando.';
  end if;
end $$;

commit;
