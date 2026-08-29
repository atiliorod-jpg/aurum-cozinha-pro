-- =====================================================================
--  MIGRAÇÃO 28 — CADASTRO B2B: CNPJ ÚNICO, CONTATO, E TESTE DE 5 DIAS
--
--  Dois problemas comerciais que o cadastro tinha:
--
--  1) NÃO HAVIA TRAVA NENHUMA no teste grátis. Um e-mail novo = restaurante
--     novo = mais 7 dias, para sempre. A única checagem era "este usuário já
--     pertence a um restaurante", que impede o MESMO usuário ter dois — não
--     impede a mesma pessoa criar contas infinitas com e-mails diferentes.
--     Agora o teste é amarrado ao CNPJ, com índice ÚNICO no banco.
--
--  2) O dono cobra por Pix e ativa por WhatsApp, mas não tinha o telefone do
--     cliente até ele aparecer. Agora WhatsApp entra no cadastro.
--     Cidade/UF também: norma sanitária varia por estado (a CVS é de SP), e é
--     o que permite orientar cada cliente com a regra que vale para ele.
--
--  ⚠️ JANELA CERTA: conferido antes de escrever — 0 restaurantes, 0 perfis no
--  banco. Não há conta antiga para receber cnpj NULL, e encurtar o teste de 7
--  para 5 dias não tira dia de ninguém. Depois do primeiro cliente pagante,
--  cada um desses vira migração de dados.
--
--  ⚠️ RODAR DEPOIS da 27.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Colunas do cadastro
--
--    ⚠️ CNPJ guardado SÓ COM DÍGITOS. Com máscara, "11.222.333/0001-81" e
--    "11222333000181" seriam dois valores distintos e o índice único não
--    pegaria nada — a trava existiria no papel e não na prática.
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists cnpj     text;
alter table restaurantes add column if not exists whatsapp text;
alter table restaurantes add column if not exists cidade   text;
alter table restaurantes add column if not exists uf       text;

alter table restaurantes drop constraint if exists restaurantes_cnpj_check;
alter table restaurantes add constraint restaurantes_cnpj_check
  check (cnpj is null or cnpj ~ '^[0-9]{14}$');

alter table restaurantes drop constraint if exists restaurantes_uf_check;
alter table restaurantes add constraint restaurantes_uf_check
  check (uf is null or uf ~ '^[A-Z]{2}$');

-- ÍNDICE ÚNICO PARCIAL — é ESTA linha que trava o teste infinito.
-- Parcial (`where cnpj is not null`) porque conta sem CNPJ tem NULL, e vários
-- NULL não podem colidir entre si.
create unique index if not exists restaurantes_cnpj_unico
  on restaurantes (cnpj) where cnpj is not null;

-- ---------------------------------------------------------------------
-- 2) Validador de CNPJ NO BANCO
--
--    ⚠️ Por que também aqui, se o app já valida: o app é código que roda na
--    máquina do cliente e pode ser contornado. O banco é a única barreira que
--    ele não alcança. O app valida para dar erro na hora de digitar; o banco
--    valida porque é o que de fato garante.
--
--    Fica como FUNÇÃO chamada pela RPC, não dentro de um CHECK: constraint
--    exigiria função IMMUTABLE e complicaria sem ganho, já que
--    `criar_restaurante` é o ÚNICO caminho de inserção (não existe policy de
--    INSERT em restaurantes desde a M10).
-- ---------------------------------------------------------------------
create or replace function cnpj_valido(p_cnpj text)
returns boolean language plpgsql immutable set search_path to 'public' as $function$
declare
  v text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_soma int; v_resto int; v_d1 int; v_d2 int;
  v_pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  v_pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  i int;
begin
  if length(v) <> 14 then return false; end if;
  -- ⚠️ Todos os dígitos iguais PASSAM no módulo 11 (00000000000000,
  -- 11111111111111...). Sem esta linha, catorze vezes o mesmo número seria
  -- aceito como CNPJ válido — e viraria conta nova a cada semana.
  if v ~ '^(.)\1{13}$' then return false; end if;

  v_soma := 0;
  for i in 1..12 loop
    v_soma := v_soma + substr(v, i, 1)::int * v_pesos1[i];
  end loop;
  v_resto := v_soma % 11;
  v_d1 := case when v_resto < 2 then 0 else 11 - v_resto end;
  if v_d1 <> substr(v, 13, 1)::int then return false; end if;

  v_soma := 0;
  for i in 1..13 loop
    v_soma := v_soma + substr(v, i, 1)::int * v_pesos2[i];
  end loop;
  v_resto := v_soma % 11;
  v_d2 := case when v_resto < 2 then 0 else 11 - v_resto end;
  return v_d2 = substr(v, 14, 1)::int;
end $function$;

-- ---------------------------------------------------------------------
-- 3) criar_restaurante com os dados do cadastro
--
--    ⚠️⚠️ A ARMADILHA QUE JÁ QUASE CUSTOU CARO NA M27, DE NOVO AQUI.
--    A M24 concede EXECUTE **por assinatura exata**. Acrescentar parâmetros
--    não "altera" a função: cria OUTRA, que nasce sem grant. O sintoma seria
--    mudo e devastador — TODO cadastro novo falhando com "permission denied",
--    exibido ao cliente como erro genérico. Por isso: DROP da antiga primeiro,
--    CREATE, GRANT logo em seguida, e sonda no fim que aborta a transação.
--
--    O corpo abaixo foi COPIADO da definição VIVA no banco
--    (pg_get_functiondef), não do arquivo da M27.
-- ---------------------------------------------------------------------
drop function if exists criar_restaurante(text, text, text);

create or replace function criar_restaurante(
  p_nome_restaurante text,
  p_nome_admin       text,
  p_produto          text default 'completo',
  p_cnpj             text default null,
  p_whatsapp         text default null,
  p_cidade           text default null,
  p_uf               text default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_rid  uuid;
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
  v_fone text := nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '');
begin
  if auth.uid() is null then
    raise exception 'Nao autenticado.';
  end if;
  if exists (select 1 from perfis where id = auth.uid()) then
    raise exception 'Este usuario ja pertence a um restaurante.';
  end if;

  -- CNPJ é opcional na assinatura para não quebrar chamada antiga, mas quando
  -- vier tem que ser válido. Mensagem pronta para a tela: o cliente não pode
  -- ver erro técnico.
  if v_cnpj is not null and not cnpj_valido(v_cnpj) then
    raise exception 'CNPJ invalido. Confira os numeros.';
  end if;

  begin
    insert into restaurantes (nome, produto, cnpj, whatsapp, cidade, uf)
      values (
        coalesce(nullif(trim(p_nome_restaurante), ''), 'Meu Restaurante'),
        -- Normaliza em vez de recusar: texto inesperado vindo do cliente não
        -- pode DERRUBAR um cadastro. Só 'etiquetas' liga o produto menor;
        -- qualquer outra coisa cai no completo, que é o padrão seguro.
        case when p_produto = 'etiquetas' then 'etiquetas' else 'completo' end,
        v_cnpj,
        v_fone,
        nullif(trim(coalesce(p_cidade, '')), ''),
        nullif(upper(trim(coalesce(p_uf, ''))), '')
      )
      returning id into v_rid;
  exception when unique_violation then
    -- ⚠️ É AQUI que o teste infinito morre. E a mensagem importa tanto quanto
    -- a trava: "duplicate key value violates unique constraint" na tela faria
    -- o cliente ligar para o suporte sem entender nada.
    raise exception 'Ja existe uma conta para este CNPJ. Faca login ou fale com o suporte.';
  end;

  insert into perfis (id, restaurante_id, nome, cargo)
    values (auth.uid(), v_rid, coalesce(nullif(trim(p_nome_admin), ''), 'Diretoria'), 'diretoria');
  return v_rid;
end $function$;

grant execute on function criar_restaurante(text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4) TESTE DE 7 PARA 5 DIAS — o lado do BANCO
--
--    ⚠️ PARIDADE. `TESTE_DIAS` em src/utils/assinatura.js e este
--    `interval` são a MESMA regra escrita em dois lugares. Mudar só um lado
--    faz o app dizer "ok" e o banco recusar a escrita — e o app é
--    offline-first, então o lançamento entra na fila e some sem erro visível.
--    O commit que muda a constante é o mesmo que roda esta migração.
--
--    Corpo copiado da M10 (migration10_hardening.sql:87-96), com 7 → 5.
-- ---------------------------------------------------------------------
create or replace function restaurante_pode_escrever(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurantes r
    where r.id = rid
      and coalesce(r.bloqueado, false) = false
      and (coalesce(r.assinatura_ate, 'epoch'::timestamptz) > now()
           or r.created_at + interval '5 days' > now())
  );
$$;

-- ---------------------------------------------------------------------
-- 5) SONDAS — falham ALTO, dentro da transação, e desfazem tudo
-- ---------------------------------------------------------------------
do $$
declare v_erro text;
begin
  -- (a) a que protege o cadastro do app inteiro
  if not has_function_privilege('authenticated',
       'criar_restaurante(text,text,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'M28: authenticated sem EXECUTE em criar_restaurante — TODO cadastro novo quebraria. Abortando.';
  end if;

  -- (b) a assinatura antiga não pode sobrar: duas versões = chamada ambigua
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'criar_restaurante'
                and p.oid::regprocedure::text = 'criar_restaurante(text,text,text)') then
    raise exception 'M28: criar_restaurante(text,text,text) sobreviveu — chamada ficaria ambigua. Abortando.';
  end if;

  -- (c) nada novo ao alcance do anonimo (M24/M26)
  if has_function_privilege('anon', 'criar_restaurante(text,text,text,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'cnpj_valido(text)', 'EXECUTE') then
    raise exception 'M28: funcao alcancavel sem login — o gatilho da M26 nao pegou. Abortando.';
  end if;

  -- (d) o validador de CNPJ funciona nos dois sentidos
  if not cnpj_valido('11222333000181') then
    raise exception 'M28: cnpj_valido recusou um CNPJ VALIDO. Abortando.';
  end if;
  if cnpj_valido('11222333000182') or cnpj_valido('11111111111111') or cnpj_valido('123') then
    raise exception 'M28: cnpj_valido aceitou CNPJ invalido. Abortando.';
  end if;

  -- (e) o indice unico realmente barra CNPJ repetido
  insert into restaurantes (nome, cnpj) values ('__sonda_a_m28__', '11222333000181');
  begin
    insert into restaurantes (nome, cnpj) values ('__sonda_b_m28__', '11222333000181');
    raise exception 'M28: o indice unico aceitou CNPJ repetido. Abortando.';
  exception when unique_violation then
    null; -- esperado
  end;
  delete from restaurantes where nome in ('__sonda_a_m28__', '__sonda_b_m28__');

  -- (f) o corte de 5 dias entrou na funcao do banco
  select pg_get_functiondef(p.oid) into v_erro
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'restaurante_pode_escrever';
  if v_erro not like '%5 days%' then
    raise exception 'M28: restaurante_pode_escrever nao ficou com 5 days. Abortando.';
  end if;
end $$;

commit;

-- =====================================================================
--  CONFERÊNCIA (contra o BANCO, não contra este arquivo)
--
--  1) uma assinatura só, e a certa:
--     select oid::regprocedure::text from pg_proc p
--       join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public' and proname='criar_restaurante';
--
--  2) o cadastro REAL continua funcionando (é o que a sonda (a) protege):
--     node scripts/e2e-restaurante-real.mjs
--     e SEMPRE depois:  node scripts/pentest-limpar.mjs
--
--  3) nenhuma RPC nova aberta ao anônimo:
--     node scripts/auditar-supabase.mjs
-- =====================================================================
