-- =====================================================================
--  AURUM COZINHA PRO — Migração 12: mapeamento do cliente Stripe
--  Rode SÓ quando for ativar o webhook do Stripe (ver STRIPE_SETUP.md).
--  Seguro rodar mais de uma vez.
--
--  Guarda o "customer" do Stripe em cada restaurante para reconhecer as
--  RENOVAÇÕES mensais (o webhook casa invoice.paid → restaurante por aqui).
-- =====================================================================
alter table restaurantes add column if not exists stripe_customer_id text;
create index if not exists idx_restaurantes_stripe_customer on restaurantes (stripe_customer_id);
