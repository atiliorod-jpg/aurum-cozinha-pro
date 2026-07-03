-- =====================================================================
--  AURUM COZINHA PRO — Migração 5: validação de convite ANTES do signUp
--  (auditoria 03/07/2026 — fecha o achado da "conta órfã")
--  Cole INTEIRO no Supabase → SQL Editor → New query → Run.
--  Rode DEPOIS do SUPABASE_SETUP.sql e do migration4_hardening.sql.
--  É seguro rodar mais de uma vez.
--
--  Problema: o app fazia auth.signUp ANTES de validar o token do convite.
--  Token inválido/expirado → a conta Auth já tinha sido criada sem perfil:
--  o e-mail ficava "já registrado" e o usuário preso em "Cadastro incompleto"
--  (só o admin do Supabase conseguia limpar).
--
--  Solução: RPC de leitura que diz apenas se o token é válido (true/false),
--  SEM expor a tabela de convites nem exigir usuário autenticado — precisa
--  rodar antes do signUp, quando ainda não há sessão.
-- =====================================================================

create or replace function convite_valido(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from convites
    where token = p_token and usado = false and expira_em > now()
  );
$$;

-- Permite chamar sem sessão (o cadastro por convite acontece antes do login).
-- A função só devolve true/false — não expõe cargo, restaurante nem lista de tokens.
grant execute on function convite_valido(text) to anon, authenticated;

-- =====================================================================
--  PRONTO. Teste: na tela de login → "Tenho um código de convite",
--  digite um código inválido — deve avisar SEM criar a conta.
-- =====================================================================
