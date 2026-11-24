-- =====================================================================
--  MIGRAÇÃO 63 — MEUS ITENS SEM SENHA (24/11/2026, pedido do dono)
--
--  A M62 pôs o cadastro de itens (produtos, grupos, fichas) atrás da senha
--  da Administração. O dono pediu Meus itens aberto: cadastrar item e mudar
--  prazo passa a valer para quem está na conta. O resto — custos, estoques,
--  a matriz antiga — continua só com a Administração aberta.
--
--  Aplicar:  node scripts/rodar-migracao.mjs 63
--  Conferir: node scripts/pentest-administracao.mjs
-- =====================================================================

create or replace function pode_na_conta(p_cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(sou_super_admin(), false)
      or coalesce(meu_cargo(), '') = 'diretoria'
      -- Meus itens: livre para quem está na conta (perfil ativo)
      or (p_cap = 'gerenciarProdutos' and meu_restaurante_id() is not null)
$$;
-- `create or replace` mantém as permissões da M62 (só authenticated).
