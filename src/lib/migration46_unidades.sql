-- =====================================================================
--  M46 — UNIDADES: vários CNPJs na mesma conta, nos dois planos
--
--  PEDIDO DO DONO (22/09/2026): um grupo com mais de um restaurante precisa
--  usar a mesma conta, e cada casa imprime a etiqueta com o PRÓPRIO CNPJ.
--  Até aqui cada conta tinha um CNPJ só (restaurantes.cnpj, M28) — a segunda
--  casa sairia no pote com o nome dela e o CNPJ e o endereço da primeira, que
--  é justamente o que a Vigilância confere.
--
--  ⚠️ A UNIDADE PRINCIPAL NÃO MORA AQUI, de propósito. Ela é a própria conta:
--  nome, CNPJ e endereço continuam onde sempre estiveram. Esta tabela guarda só
--  as unidades EXTRAS. Consequência que importa: nenhuma conta existente
--  precisa ser migrada, login, recuperação de senha e a trava do teste grátis
--  seguem lendo `restaurantes.cnpj`, e conta de uma casa só não vê diferença.
--
--  ⚠️ SÓ A AURUM CRIA UNIDADE (decisão do dono): o CNPJ é o que identifica
--  quem manipulou o alimento, e o cliente já não edita o da conta. Ele só
--  mexe no ENDEREÇO da unidade, como já faz com o da principal.
--
--  ⚠️ CADA UNIDADE NASCE COM A SUA COZINHA DE PRODUÇÃO (`cozinha`, id no
--  formato das instâncias da M22: 'producao#xxxx'). O app SINTETIZA essa
--  cozinha a partir desta tabela, do mesmo jeito que sintetiza as raízes — ela
--  não é gravada no documento `estoques`. É isso que deixa a Aurum criar a
--  unidade pelo painel: o suporte NÃO pode gravar `estoques` (M22), e nem
--  precisa. Os registros e documentos da cozinha nova já são aceitos pelo
--  banco desde a M22 (o CHECK de `registros.tipo` já prevê 'producao#....').
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) A tabela
--
--    RLS ligada e SÓ policy de leitura: a conta lê as próprias unidades (é
--    isso que a etiqueta imprime) e o super-admin lê todas (painel e modo
--    suporte). Toda escrita passa pelas funções abaixo — mesmo molde da M37 e
--    da M43.
-- ---------------------------------------------------------------------
create table if not exists unidades (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  nome           text not null check (length(btrim(nome)) between 2 and 80),
  cnpj           text not null check (cnpj ~ '^[0-9]{14}$'),
  endereco       text,
  cidade         text,
  uf             text check (uf is null or uf ~ '^[A-Z]{2}$'),
  cep            text check (cep is null or cep ~ '^[0-9]{8}$'),
  cozinha        text not null check (cozinha ~ '^producao#[a-z0-9]{4}$'),
  arquivada_em   timestamptz,
  criada_em      timestamptz not null default now(),
  criada_por     text not null default 'aurum'
);
create unique index if not exists unidades_cnpj_unico     on unidades (cnpj);
create unique index if not exists unidades_cozinha_unica  on unidades (restaurante_id, cozinha);
create index        if not exists unidades_rest           on unidades (restaurante_id);

alter table unidades enable row level security;
revoke all on table unidades from anon;

drop policy if exists "unidades_sel_v46" on unidades;
create policy "unidades_sel_v46" on unidades for select
  using (restaurante_id = meu_restaurante_id() or coalesce(sou_super_admin(), false));

-- ---------------------------------------------------------------------
-- 2) CNPJ único NO SISTEMA INTEIRO
--
--    ⚠️ O índice de cada tabela só enxerga a própria. Sem estes gatilhos, um
--    CNPJ poderia ser unidade de um grupo e, ao mesmo tempo, conta própria em
--    outro lugar — e é assim que teste grátis e impressora saem em dobro.
--
--    ⚠️ GATILHO, E NÃO UMA CHECAGEM EM CADA FUNÇÃO: o cadastro público (M28),
--    o painel (M30) e a função `restaurante` gravam CNPJ, e reescrever as três
--    seria arriscar o cadastro para ganhar uma linha. O gatilho pega todos os
--    caminhos, inclusive os que ainda não existem.
--
--    ⚠️ errcode 23505 (unique_violation) de propósito: o cadastro público já
--    traduz esse código para "Já existe uma conta para este CNPJ".
-- ---------------------------------------------------------------------
create or replace function _cnpj_livre_para_restaurante()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cnpj is not null and exists (select 1 from unidades u where u.cnpj = new.cnpj) then
    raise exception 'Esse CNPJ já é de uma unidade de outra conta.' using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists trg_cnpj_restaurante on restaurantes;
create trigger trg_cnpj_restaurante
  before insert or update of cnpj on restaurantes
  for each row execute function _cnpj_livre_para_restaurante();

create or replace function _cnpj_livre_para_unidade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from restaurantes r where r.cnpj = new.cnpj) then
    raise exception 'Esse CNPJ já é de um restaurante cadastrado.' using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists trg_cnpj_unidade on unidades;
create trigger trg_cnpj_unidade
  before insert or update of cnpj on unidades
  for each row execute function _cnpj_livre_para_unidade();

-- ---------------------------------------------------------------------
-- 3) O livro do painel (M39) vigia as edições
--
--    A CRIAÇÃO é registrada à mão em `criar_unidade`, com nome e CNPJ: o
--    gatilho da M39 guarda só uma marca em INSERT, que aqui sairia vazia.
-- ---------------------------------------------------------------------
drop trigger if exists trg_log_unidades on unidades;
create trigger trg_log_unidades
  after update on unidades
  for each row execute function _registrar_acao_admin();

-- ---------------------------------------------------------------------
-- 4) A Aurum cria, edita e arquiva
-- ---------------------------------------------------------------------
create or replace function criar_unidade(
  p_restaurante uuid,
  p_nome        text,
  p_cnpj        text,
  p_endereco    text default null,
  p_cidade      text default null,
  p_uf          text default null,
  p_cep         text default null
)
returns unidades language plpgsql security definer set search_path = public as $$
declare
  v_nome    text := btrim(coalesce(p_nome, ''));
  v_cnpj    text := regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
  v_uf      text := nullif(upper(btrim(coalesce(p_uf, ''))), '');
  v_cep     text := nullif(regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g'), '');
  v_rest    text;
  v_cozinha text;
  v_tent    integer := 0;
  v_nova    unidades%rowtype;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema cria unidades.';
  end if;
  select nome into v_rest from restaurantes where id = p_restaurante;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  if length(v_nome) < 2 then raise exception 'Escreva o nome da unidade.'; end if;
  if not cnpj_valido(v_cnpj) then raise exception 'CNPJ inválido. Confira os números.'; end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then raise exception 'UF deve ter 2 letras.'; end if;
  if v_cep is not null and length(v_cep) <> 8 then raise exception 'CEP deve ter 8 números.'; end if;
  if exists (select 1 from unidades where cnpj = v_cnpj) then
    raise exception 'Esse CNPJ já é de uma unidade.';
  end if;

  -- ⚠️ O id da cozinha não pode repetir nenhum que a conta já use — nem de
  -- outra unidade, nem de uma instância criada pelo dono no documento
  -- `estoques`. Duas cozinhas com o mesmo id somariam os lançamentos das duas.
  loop
    v_cozinha := 'producao#' || substr(md5(gen_random_uuid()::text), 1, 4);
    exit when not exists (select 1 from unidades
                           where restaurante_id = p_restaurante and cozinha = v_cozinha)
          and not exists (select 1 from documentos d
                            cross join lateral jsonb_array_elements(
                              case when jsonb_typeof(d.dados -> 'itens') = 'array'
                                   then d.dados -> 'itens' else '[]'::jsonb end) i
                           where d.restaurante_id = p_restaurante
                             and d.chave = 'estoques'
                             and i ->> 'id' = v_cozinha);
    v_tent := v_tent + 1;
    if v_tent > 50 then raise exception 'Não consegui gerar o identificador da cozinha.'; end if;
  end loop;

  insert into unidades (restaurante_id, nome, cnpj, endereco, cidade, uf, cep, cozinha, criada_por)
    values (p_restaurante, v_nome, v_cnpj,
            nullif(btrim(coalesce(p_endereco, '')), ''), nullif(btrim(coalesce(p_cidade, '')), ''),
            v_uf, v_cep, v_cozinha, coalesce(auth.jwt() ->> 'email', 'aurum'))
    returning * into v_nova;

  insert into admin_log (restaurante_id, restaurante, tabela, acao, mudancas, feito_por)
    values (p_restaurante, v_rest, 'unidades', 'INSERT',
            jsonb_build_object('unidade', jsonb_build_object('de', null,
              'para', v_nome || ' · CNPJ ' || v_cnpj)),
            coalesce(auth.jwt() ->> 'email', 'aurum'));
  return v_nova;
end $$;

create or replace function editar_unidade(
  p_id       uuid,
  p_nome     text,
  p_cnpj     text,
  p_endereco text default null,
  p_cidade   text default null,
  p_uf       text default null,
  p_cep      text default null
)
returns unidades language plpgsql security definer set search_path = public as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
  v_uf   text := nullif(upper(btrim(coalesce(p_uf, ''))), '');
  v_cep  text := nullif(regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g'), '');
  v_u    unidades%rowtype;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema edita unidades.';
  end if;
  if length(v_nome) < 2 then raise exception 'Escreva o nome da unidade.'; end if;
  if not cnpj_valido(v_cnpj) then raise exception 'CNPJ inválido. Confira os números.'; end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then raise exception 'UF deve ter 2 letras.'; end if;
  if v_cep is not null and length(v_cep) <> 8 then raise exception 'CEP deve ter 8 números.'; end if;
  if exists (select 1 from unidades where cnpj = v_cnpj and id <> p_id) then
    raise exception 'Esse CNPJ já é de outra unidade.';
  end if;
  update unidades
     set nome = v_nome, cnpj = v_cnpj,
         endereco = nullif(btrim(coalesce(p_endereco, '')), ''),
         cidade   = nullif(btrim(coalesce(p_cidade, '')), ''),
         uf = v_uf, cep = v_cep
   where id = p_id
   returning * into v_u;
  if not found then raise exception 'Unidade não encontrada.'; end if;
  return v_u;
end $$;

-- ⚠️ ARQUIVAR, NUNCA APAGAR — mesma regra dos estoques (M22). Apagar deixaria
-- órfãos os lançamentos e as etiquetas daquela casa: sumiriam de toda tela e
-- continuariam no banco. Arquivada, a unidade sai do seletor e o histórico
-- continua legível. Para voltar, `p_arquivar = false`.
create or replace function arquivar_unidade(p_id uuid, p_arquivar boolean)
returns unidades language plpgsql security definer set search_path = public as $$
declare v_u unidades%rowtype;
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema arquiva unidades.';
  end if;
  update unidades
     set arquivada_em = case when coalesce(p_arquivar, true) then now() else null end
   where id = p_id
   returning * into v_u;
  if not found then raise exception 'Unidade não encontrada.'; end if;
  return v_u;
end $$;

-- ---------------------------------------------------------------------
-- 5) O dono edita o ENDEREÇO da unidade — nunca o CNPJ nem o nome
--
--    ⚠️ Mesma divisão da conta principal: o endereço o dono já edita hoje
--    (Administração → Dados do estabelecimento); CNPJ e nome passam pela
--    Aurum. Só a diretoria, só nas unidades da própria conta, e só com a
--    conta liberada para escrever — a régua de todo o resto do app.
-- ---------------------------------------------------------------------
create or replace function editar_endereco_unidade(
  p_id       uuid,
  p_endereco text default null,
  p_cidade   text default null,
  p_uf       text default null,
  p_cep      text default null
)
returns unidades language plpgsql security definer set search_path = public as $$
declare
  rid   uuid := meu_restaurante_id();
  v_uf  text := nullif(upper(btrim(coalesce(p_uf, ''))), '');
  v_cep text := nullif(regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g'), '');
  v_u   unidades%rowtype;
begin
  if coalesce(meu_cargo(), '') <> 'diretoria' then
    raise exception 'Só a conta dona altera o endereço de uma unidade.';
  end if;
  if rid is null or not coalesce(restaurante_pode_escrever(rid), false) then
    raise exception 'A conta não está liberada para alterações.';
  end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then raise exception 'UF deve ter 2 letras.'; end if;
  if v_cep is not null and length(v_cep) <> 8 then raise exception 'CEP deve ter 8 números.'; end if;
  update unidades
     set endereco = nullif(btrim(coalesce(p_endereco, '')), ''),
         cidade   = nullif(btrim(coalesce(p_cidade, '')), ''),
         uf = v_uf, cep = v_cep
   where id = p_id and restaurante_id = rid
   returning * into v_u;
  if not found then raise exception 'Unidade não encontrada nesta conta.'; end if;
  return v_u;
end $$;

-- ---------------------------------------------------------------------
-- 6) O relatório de etiquetas (M43) passa a saber a unidade
--
--    `unidade_id` nulo = unidade principal. Todo o histórico que já existe
--    fica assim, e está certo: até hoje só existia a principal.
-- ---------------------------------------------------------------------
alter table etiquetas_impressoes
  add column if not exists unidade_id uuid references unidades(id) on delete set null;
create index if not exists etiquetas_impressoes_rest_unid
  on etiquetas_impressoes (restaurante_id, unidade_id, dia);

-- ⚠️ MESMA ASSINATURA E MESMO CORPO DA M43, mais a unidade. A unidade só é
-- aceita se for DA PRÓPRIA CONTA — outra coisa (id de outra conta, texto
-- quebrado) grava como principal em vez de derrubar o lote. O `case` garante
-- que o texto só vira uuid depois de conferido: numa condição com `and`, o
-- banco pode avaliar a conversão antes e o lote inteiro cairia.
create or replace function registrar_impressoes(p_itens jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  rid     uuid;
  somadas integer;
begin
  rid := meu_restaurante_id();
  if rid is null then return 0; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then return 0; end if;
  if jsonb_array_length(p_itens) > 200 then
    raise exception 'Lote grande demais: no máximo 200 itens por chamada.';
  end if;

  with novas as (
    insert into etiquetas_impressoes (id, restaurante_id, dia, hora, item, responsavel, copias, reimpressao, unidade_id)
    select (e->>'id')::uuid,
           rid,
           (e->>'dia')::date,
           left(coalesce(e->>'hora', ''), 5),
           left(coalesce(e->>'item', ''), 120),
           left(coalesce(e->>'responsavel', ''), 80),
           least(greatest(coalesce((e->>'copias')::integer, 1), 1), 200),
           coalesce((e->>'reimpressao')::boolean, false),
           (select u.id from unidades u
             where u.restaurante_id = rid
               and u.id = case
                 when coalesce(e->>'unidade', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                 then (e->>'unidade')::uuid end)
      from jsonb_array_elements(p_itens) e
     where (e->>'dia')::date between current_date - 400 and current_date + 1
    on conflict (id) do nothing
    returning copias
  )
  select coalesce(sum(copias), 0) into somadas from novas;

  if somadas > 0 then
    update restaurantes set etiquetas_impressas = coalesce(etiquetas_impressas, 0) + somadas
     where id = rid;
  end if;
  return somadas;
end $$;

-- ⚠️ O TIPO DE RETORNO MUDA (entra `unidade_id`), e `create or replace` não
-- aceita isso: a função sai e volta. Por isso o grant é refeito abaixo e a
-- sonda confere — função recriada sem grant quebraria o relatório com um
-- "permission denied" genérico na tela do dono.
drop function if exists relatorio_etiquetas(date, date, uuid);
create function relatorio_etiquetas(p_de date, p_ate date, p_restaurante uuid default null)
returns table (dia date, item text, responsavel text, reimpressao boolean, unidade_id uuid,
               etiquetas bigint, impressoes bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  rid uuid;
begin
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido.';
  end if;
  if p_ate - p_de > 800 then
    raise exception 'Período longo demais.';
  end if;

  if p_restaurante is not null and coalesce(sou_super_admin(), false) then
    rid := p_restaurante;
  else
    rid := meu_restaurante_id();
  end if;
  if rid is null then
    raise exception 'Conta sem restaurante.';
  end if;

  return query
    select e.dia, e.item, e.responsavel, e.reimpressao, e.unidade_id,
           sum(e.copias)::bigint, count(*)::bigint
      from etiquetas_impressoes e
     where e.restaurante_id = rid
       and e.dia between p_de and p_ate
     group by e.dia, e.item, e.responsavel, e.reimpressao, e.unidade_id
     order by e.dia;
end $$;

-- ---------------------------------------------------------------------
-- 7) Quem pode chamar (M24 + gatilho da M26: função nova nasce sem grant)
-- ---------------------------------------------------------------------
revoke all on function criar_unidade(uuid, text, text, text, text, text, text)  from public, anon;
revoke all on function editar_unidade(uuid, text, text, text, text, text, text) from public, anon;
revoke all on function arquivar_unidade(uuid, boolean)                          from public, anon;
revoke all on function editar_endereco_unidade(uuid, text, text, text, text)    from public, anon;
revoke all on function registrar_impressoes(jsonb)                              from public, anon;
revoke all on function relatorio_etiquetas(date, date, uuid)                    from public, anon;
grant execute on function criar_unidade(uuid, text, text, text, text, text, text)  to authenticated;
grant execute on function editar_unidade(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function arquivar_unidade(uuid, boolean)                          to authenticated;
grant execute on function editar_endereco_unidade(uuid, text, text, text, text)    to authenticated;
grant execute on function registrar_impressoes(jsonb)                              to authenticated;
grant execute on function relatorio_etiquetas(date, date, uuid)                    to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'criar_unidade(uuid, text, text, text, text, text, text)',
    'editar_unidade(uuid, text, text, text, text, text, text)',
    'arquivar_unidade(uuid, boolean)',
    'editar_endereco_unidade(uuid, text, text, text, text)',
    'registrar_impressoes(jsonb)',
    'relatorio_etiquetas(date, date, uuid)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'M46: authenticated sem execute em % — abortando.', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'M46: anon consegue chamar % — abortando.', f;
    end if;
  end loop;
  if exists (select 1 from pg_policies where tablename = 'unidades' and cmd <> 'SELECT') then
    raise exception 'M46: a tabela unidades ganhou policy de escrita — abortando.';
  end if;
end $$;

commit;

-- =====================================================================
--  Teste rápido (como super-admin):
--    select * from criar_unidade('<rid>', 'Unidade Centro', '<cnpj válido>');
--    → devolve a linha, com `cozinha` = 'producao#xxxx'.
--    O mesmo CNPJ de novo, ou o CNPJ de qualquer conta → recusado.
--  Como o dono daquela conta:
--    select * from unidades;   → só as dele.
-- =====================================================================
