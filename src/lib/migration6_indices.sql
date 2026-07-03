-- =====================================================================
--  AURUM COZINHA PRO — Migração 6: índices de performance
--  (auditoria 03/07/2026)
--  Cole INTEIRO no Supabase → SQL Editor → New query → Run.
--  É seguro rodar mais de uma vez.
--
--  Toda leitura do app filtra registros por (restaurante_id, deleted) e o
--  realtime/hidratação ordena por ts. Sem índice composto, o Postgres varre
--  a tabela inteira — imperceptível hoje, lento com 1+ ano de lançamentos.
-- =====================================================================

create index if not exists idx_registros_rest_deleted_tipo_ts
  on registros (restaurante_id, deleted, tipo, ts);

-- (documentos já tem PRIMARY KEY (restaurante_id, chave) — não precisa de índice extra.)

-- =====================================================================
--  PRONTO.
-- =====================================================================
