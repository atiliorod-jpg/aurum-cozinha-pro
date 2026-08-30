-- =====================================================================
--  M31 — rede de segurança: o banco guarda as versões anteriores sozinho
--
--  O medo é concreto e legítimo: uma atualização com defeito, ou um engano do
--  próprio cliente, apaga o catálogo e as configurações de uma cozinha que
--  levou semanas cadastrando. Hoje o único recurso é o "exportar cópia" manual
--  — que depende de o cliente ter clicado antes, e ninguém clica.
--
--  A partir daqui o banco guarda as versões anteriores por conta própria, e a
--  Aurum devolve pelo painel. Não depende de o cliente ter feito nada.
--
--  ⚠️ O QUE ENTRA NO HISTÓRICO — e por que não é tudo.
--  Só CATÁLOGO e CONFIGURAÇÃO: produtos, categorias, equipe, fichas, receitas,
--  destinos, etiquetas avulsas, permissões, preços, estoques e prefs. São os
--  documentos que o cliente CONSTRÓI e que, perdidos, não voltam.
--  Ficam de fora os registros do dia a dia (entradas, saídas, compras, perdas,
--  auditoria): crescem sem parar, são append-only — um defeito não "zera" uma
--  entrada, no máximo deixa de somar uma nova — e guardar cópia deles estouraria
--  o banco em semanas.
--
--  ⚠️ O NOME DA CHAVE VEM COM PREFIXO DE MÓDULO ('seco::produtos'), então a
--  comparação é pelo pedaço DEPOIS do '::'. Comparar a chave inteira deixaria
--  de fora todo estoque que não é o da raiz — justamente o multi-instância.
-- =====================================================================

create table if not exists documentos_historico (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null,
  chave          text not null,
  dados          jsonb not null,
  versao         integer,
  criado_em      timestamptz not null default now()
);
alter table documentos_historico enable row level security;
-- sem NENHUMA policy: todo acesso passa pelas RPCs abaixo (mesmo molde da M15).

create index if not exists idx_hist_rest_chave
  on documentos_historico (restaurante_id, chave, criado_em desc);

-- ---------------------------------------------------------------------
-- 1) O gatilho
--
--    ⚠️ UMA CÓPIA POR HORA, no máximo, por documento. Sem esta trava cada
--    tecla salva viraria uma linha: um dia de cadastro geraria centenas de
--    cópias quase idênticas, elas empurrariam as antigas para fora do limite
--    e o histórico cobriria as últimas duas horas em vez das últimas semanas.
--    O que salva um cliente é ALCANCE, não resolução.
--
--    ⚠️ E NUNCA copia igual ao que já está guardado: salvar sem mudar nada
--    (abrir e fechar a tela de configurações) não pode consumir uma vaga.
-- ---------------------------------------------------------------------
create or replace function historiar_documento()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_base    text;
  v_ultimo  timestamptz;
  v_igual   boolean;
begin
  v_base := split_part(old.chave, '::', 2);
  if v_base = '' then v_base := old.chave; end if;

  if v_base not in ('produtos','categorias','pessoas','fichas','producoes','locais',
                    'destinos','listaManual','etiquetasAvulsas','permissoes','precos',
                    'estoques','metas','prefs') then
    return new;
  end if;

  -- ⚠️ Documento gigante fica de fora: uma cozinha com catálogo fora do comum
  -- não pode encher o banco sozinha. 1 MB comporta com folga os 257 itens da
  -- biblioteca inteira mais o que o cliente criar.
  if pg_column_size(old.dados) > 1048576 then
    return new;
  end if;

  select h.criado_em, (h.dados = old.dados) into v_ultimo, v_igual
    from documentos_historico h
    where h.restaurante_id = old.restaurante_id and h.chave = old.chave
    order by h.criado_em desc limit 1;

  if v_igual then return new; end if;
  if v_ultimo is not null and v_ultimo > now() - interval '1 hour' then return new; end if;

  insert into documentos_historico (restaurante_id, chave, dados, versao)
    values (old.restaurante_id, old.chave, old.dados, old.versao);

  -- Poda: mantém as 40 mais recentes deste documento. Com uma por hora e uma
  -- cozinha que mexe no cadastro algumas vezes por dia, 40 cobre semanas.
  delete from documentos_historico
   where id in (
     select id from documentos_historico
      where restaurante_id = old.restaurante_id and chave = old.chave
      order by criado_em desc offset 40);

  return new;
end $$;

drop trigger if exists trg_historiar_documento on documentos;
create trigger trg_historiar_documento
  before update on documentos
  for each row execute function historiar_documento();

-- ---------------------------------------------------------------------
-- 2) O painel enxerga o que existe
--
--    Devolve o TAMANHO e um resumo (quantos itens), não o conteúdo: a lista
--    precisa ser leve e a pessoa escolhe pela data. O conteúdo vem só quando
--    se abre uma versão.
-- ---------------------------------------------------------------------
create or replace function historico_restaurante(p_restaurante uuid)
returns table (id uuid, chave text, versao integer, criado_em timestamptz,
               itens integer, bytes integer)
language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema vê o histórico.';
  end if;
  return query
    select h.id, h.chave, h.versao, h.criado_em,
           case when jsonb_typeof(h.dados) = 'array' then jsonb_array_length(h.dados)
                else null end,
           pg_column_size(h.dados)
    from documentos_historico h
    where h.restaurante_id = p_restaurante
    order by h.criado_em desc
    limit 300;
end $$;

grant execute on function historico_restaurante(uuid) to authenticated;
revoke execute on function historico_restaurante(uuid) from anon;

-- ---------------------------------------------------------------------
-- 3) Restaurar
--
--    ⚠️ GUARDA O ESTADO ATUAL ANTES DE SOBRESCREVER, e por fora do gatilho.
--    O gatilho tem trava de uma hora; numa restauração errada, seguida de
--    outra tentativa minutos depois, essa trava faria a versão boa não ser
--    guardada — e o socorro viraria a segunda perda. Aqui a cópia é forçada.
--
--    ⚠️ BUMP DE VERSÃO obrigatório: os tablets comparam `versao` para saber
--    que precisam recarregar. Restaurar sem incrementar deixaria o aparelho
--    do cliente sentado em cima do conteúdo velho, e ele diria que "não
--    voltou nada".
-- ---------------------------------------------------------------------
create or replace function restaurar_documento(p_hist uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_h documentos_historico%rowtype;
  v_d documentos%rowtype;
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema restaura dados.';
  end if;

  select * into v_h from documentos_historico where id = p_hist;
  if not found then raise exception 'Versao nao encontrada.'; end if;

  select * into v_d from documentos
    where restaurante_id = v_h.restaurante_id and chave = v_h.chave
    for update;

  if found then
    insert into documentos_historico (restaurante_id, chave, dados, versao)
      values (v_d.restaurante_id, v_d.chave, v_d.dados, v_d.versao);
    update documentos set dados = v_h.dados, versao = coalesce(v_d.versao, 0) + 1, updated_at = now()
      where restaurante_id = v_h.restaurante_id and chave = v_h.chave;
  else
    -- O documento sumiu por inteiro — é o caso mais grave e o que mais
    -- justifica isto existir.
    insert into documentos (restaurante_id, chave, dados, versao, updated_at)
      values (v_h.restaurante_id, v_h.chave, v_h.dados, 1, now());
  end if;

  return jsonb_build_object('ok', true, 'chave', v_h.chave, 'de', v_h.criado_em);
end $$;

grant execute on function restaurar_documento(uuid) to authenticated;
revoke execute on function restaurar_documento(uuid) from anon;

-- ---------------------------------------------------------------------
-- 4) SONDAS — falham ALTO, dentro da transação, e desfazem tudo
-- ---------------------------------------------------------------------
do $$
declare
  v_rest uuid;
  v_n    integer;
begin
  -- (a) a tabela nova não pode ser lida por cliente nenhum
  if exists (select 1 from pg_policies where tablename = 'documentos_historico') then
    raise exception 'M31: apareceu policy em documentos_historico — um restaurante leria o backup do outro. Abortando.';
  end if;

  -- (b) quem precisa alcança; quem não fez login, não
  if not has_function_privilege('authenticated', 'historico_restaurante(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'restaurar_documento(uuid)', 'EXECUTE') then
    raise exception 'M31: authenticated sem EXECUTE nas funcoes de historico. Abortando.';
  end if;
  if has_function_privilege('anon', 'historico_restaurante(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'restaurar_documento(uuid)', 'EXECUTE') then
    raise exception 'M31: funcao de historico alcancavel sem login. Abortando.';
  end if;

  -- (c) o gatilho existe MESMO (drop+create pode ter falhado em silêncio)
  if not exists (select 1 from pg_trigger where tgname = 'trg_historiar_documento') then
    raise exception 'M31: o gatilho nao foi criado. Abortando.';
  end if;

  -- (d) O TESTE QUE IMPORTA: o gatilho realmente guarda. "Criei o gatilho" não
  --     é o mesmo que "o gatilho grava" — a M24 ensinou essa diferença.
  -- ⚠️ A sonda precisa de um restaurante DE VERDADE: `documentos` tem chave
  -- estrangeira para `restaurantes`, e um uuid solto é recusado antes de o
  -- gatilho sequer rodar. Este é criado e apagado dentro da transação.
  v_rest := gen_random_uuid();
  insert into restaurantes (id, nome) values (v_rest, 'SONDA M31 — apagar');
  insert into documentos (restaurante_id, chave, dados, versao, updated_at)
    values (v_rest, 'sonda::produtos', '[{"id":"a"}]'::jsonb, 1, now());
  update documentos set dados = '[{"id":"b"}]'::jsonb, versao = 2
    where restaurante_id = v_rest and chave = 'sonda::produtos';
  select count(*) into v_n from documentos_historico
    where restaurante_id = v_rest and chave = 'sonda::produtos';
  if v_n <> 1 then
    raise exception 'M31: o gatilho nao guardou a versao anterior (achei % linhas). Abortando.', v_n;
  end if;

  -- (e) e NÃO guarda o que está fora da lista: sem isto o histórico encheria
  --     de entradas e saídas e o banco estouraria em semanas.
  insert into documentos (restaurante_id, chave, dados, versao, updated_at)
    values (v_rest, 'sonda::entradas', '[{"id":"a"}]'::jsonb, 1, now());
  update documentos set dados = '[{"id":"b"}]'::jsonb, versao = 2
    where restaurante_id = v_rest and chave = 'sonda::entradas';
  select count(*) into v_n from documentos_historico
    where restaurante_id = v_rest and chave = 'sonda::entradas';
  if v_n <> 0 then
    raise exception 'M31: o gatilho guardou um documento de registro. Abortando.';
  end if;

  delete from documentos_historico where restaurante_id = v_rest;
  delete from documentos where restaurante_id = v_rest;
  delete from restaurantes where id = v_rest;

  -- ⚠️ E CONFIRMA QUE A SONDA SUMIU. Restaurante fantasma no painel do
  -- super-admin seria pior que não ter testado: ele apareceria na lista de
  -- clientes e alguém iria atrás de saber quem é.
  if exists (select 1 from restaurantes where id = v_rest) then
    raise exception 'M31: o restaurante da sonda nao foi apagado. Abortando.';
  end if;
end $$;
