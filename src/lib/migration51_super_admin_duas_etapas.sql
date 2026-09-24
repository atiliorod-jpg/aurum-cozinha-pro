-- =====================================================================
--  M51 — O SUPER-ADMIN SÓ VALE COM A VERIFICAÇÃO EM DUAS ETAPAS (24/09/2026)
--
--  Pedido do dono. A conta da Aurum abre o painel de TODOS os clientes:
--  pagamentos, contratos, contas, modo suporte, cópia de dados. Só com a
--  senha, quem a descobrisse teria tudo.
--
--  ⚠️ A TRAVA É AQUI, NO BANCO — não na tela. `sou_super_admin()` é a única
--  função que reconhece a Aurum (conferido no catálogo: nenhuma policy nem
--  outra função cita a conta direto), e toda policy e RPC do painel passa por
--  ela. Exigindo `aal2` (login que passou pelo código do aplicativo
--  autenticador) nela, a API inteira passa a exigir — inclusive para quem
--  chamasse as funções direto, sem o app. A função `restaurante` (abrir conta
--  de cliente) confere o mesmo nível.
--
--  ⚠️ ORDEM DE PUBLICAÇÃO: esta migração só entra DEPOIS do app com a tela
--  de duas etapas (DuasEtapas.jsx) no ar — senão o painel ficaria vazio sem
--  caminho para o código.
--
--  ⚠️ PERDEU O CELULAR? O fator é apagado no painel do Supabase
--  (Authentication → Users → a conta → MFA) ou por SQL em auth.mfa_factors;
--  no próximo acesso o app pede um cadastro novo.
-- =====================================================================

begin;

create or replace function sou_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() = '318071c2-49c0-41d0-89aa-235f0672e1ad'::uuid
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2',
    false)
$$;

do $$
begin
  if not has_function_privilege('authenticated', 'sou_super_admin()', 'execute') then
    raise exception 'M51: authenticated perdeu o execute de sou_super_admin — abortando.';
  end if;
end $$;

commit;
