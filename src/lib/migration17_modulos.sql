-- =====================================================================
--  MIGRAÇÃO 17 — MULTI-MÓDULO (Cozinha de Produção · Estoque Seco)
--
--  ⚠️ RODAR ANTES de liberar o módulo Estoque Seco para os clientes.
--  Sem isto o app parece funcionar (offline-first grava no aparelho), mas
--  NENHUM registro do seco sobe para a nuvem: o INSERT é recusado pelo
--  constraint e o item fica preso na fila de sincronização.
--
--  O que muda: o `tipo` do registro passa a aceitar o prefixo do módulo
--  ('seco:entrada'). O módulo de produção continua SEM prefixo ('entrada'),
--  então nenhum dado existente precisa ser convertido.
-- =====================================================================

-- O constraint antigo existe para evitar lixo/poluição de relatório — a ideia
-- continua. Em vez de afrouxar para "qualquer texto", listamos explicitamente
-- os módulos e tipos aceitos. Ao criar um MÓDULO NOVO no app, acrescente o id
-- dele aqui, senão os registros dele são recusados pelo banco.
alter table registros drop constraint if exists registros_tipo_check;

alter table registros add constraint registros_tipo_check
  check (
    tipo in ('compra','entrada','saida','apara','perda','ajuste','auditoria')
    or tipo ~ '^(seco|finalizacao):(compra|entrada|saida|apara|perda|ajuste)$'
  );

-- Conferência rápida (deve devolver 't' nas duas linhas):
--   select 'entrada'      ~ '^(compra|entrada|saida|apara|perda|ajuste|auditoria)$' as producao_ok;
--   select 'seco:entrada'        ~ '^(seco|finalizacao):(compra|entrada|saida|apara|perda|ajuste)$' as seco_ok;
--   select 'finalizacao:ajuste' ~ '^(seco|finalizacao):(compra|entrada|saida|apara|perda|ajuste)$' as final_ok;

-- =====================================================================
--  Nada muda em `documentos`: a coluna `chave` já é texto livre e o
--  namespace do módulo ('seco::produtos') cabe sem alteração de schema.
--  A policy continua filtrando por restaurante_id, então o isolamento
--  entre clientes segue valendo igual.
-- =====================================================================
