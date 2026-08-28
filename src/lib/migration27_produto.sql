-- =====================================================================
--  MIGRAÇÃO 27 — DOIS PRODUTOS COMERCIAIS NA MESMA BASE
--
--  Passa a existir o "Aurum Etiquetas" (R$270/mês): mesma conta, mesmo app,
--  mesmo login, só as telas de etiqueta. O "Aurum Cozinha Pro" (R$500/mês)
--  continua sendo tudo. Upgrade = trocar esta coluna; nada é copiado nem
--  movido, porque o plano etiquetas roda no módulo `producao` raiz e grava
--  nas MESMAS chaves de `documentos` que o app completo lê.
--
--  ⚠️ VOCABULÁRIO. Aqui `produto` é O QUE A CONTA COMPROU (etiquetas|completo).
--  Não confundir com o `plano` que já existe em `aviso_pagamento_plano` e em
--  PLANOS (assinatura.js), que é a DURAÇÃO paga (mensal|semestral|anual). Os
--  dois eixos são independentes: dá para ter "etiquetas anual" e "completo
--  mensal". Foi de propósito que a coluna NÃO se chama `plano`.
--
--  ⚠️ O que esta migração NÃO faz, de propósito:
--  `restaurante_pode_escrever()` (M10) fica intocada. O corte de teste/
--  assinatura/bloqueio é IDÊNTICO nos dois produtos, então a paridade que o
--  comentário de assinatura.js:6-8 promete (TESTE_DIAS=7 ↔ interval '7 days')
--  continua verdadeira. Produto é decisão de INTERFACE; validade é decisão de
--  ACESSO. Se um dia alguém misturar as duas aqui, aquele comentário vira
--  mentira e a próxima pessoa a mexer nos 7 dias vai confiar nele.
--
--  ⚠️ RODAR DEPOIS da 26.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) A coluna
--
--    `default 'completo'` deixa a migração INERTE no dia em que roda: toda
--    conta existente já usa o app inteiro e continua exatamente igual. É
--    também o fallback seguro do lado do app — banco sem esta coluna faz o
--    AuthContext cair em 'completo', e ninguém vira cliente de etiquetas por
--    acidente. O contrário (default 'etiquetas') tiraria telas de quem paga
--    pelo completo, em silêncio.
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists produto text not null default 'completo';

alter table restaurantes drop constraint if exists restaurantes_produto_check;
alter table restaurantes add constraint restaurantes_produto_check
  check (produto in ('etiquetas', 'completo'));

-- ---------------------------------------------------------------------
-- 2) O cliente NÃO pode trocar o próprio produto
--
--    Não precisa de policy nova: `restaurantes` tem só rest_sel_v4 (SELECT)
--    desde a M4, que derrubou o rest_update justamente para fechar o vetor de
--    max_usuarios/ativo. Conferido no banco antes de escrever isto — a única
--    policy da tabela é de leitura.
--
--    Mas "conferi uma vez" não é garantia: se alguém recriar um UPDATE de
--    cliente amanhã, o cliente vira o próprio plano para 'completo' de graça.
--    Então a sonda abaixo é permanente, e ABORTA a migração.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_policies
              where tablename = 'restaurantes' and cmd in ('UPDATE', 'ALL')) then
    raise exception 'M27: existe policy de UPDATE/ALL em restaurantes — o cliente conseguiria trocar o proprio produto. Abortando.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3) criar_restaurante passa a aceitar o produto escolhido no cadastro
--
--    ⚠️⚠️ A ARMADILHA MAIS CARA DESTA MIGRAÇÃO.
--
--    A M24 fez `revoke execute on all functions in schema public from anon,
--    public` e devolveu os grants UM A UM, POR ASSINATURA EXATA. Acrescentar
--    um parâmetro não "altera" a função: cria OUTRA
--    (criar_restaurante(text,text,text)), que nasce sem o grant da M24. O
--    sintoma seria devastador e mudo: TODO cadastro novo falhando com
--    "permission denied for function", exibido ao cliente como a mensagem
--    genérica de erro do traduz().
--
--    E deixar as duas assinaturas convivendo é pior ainda: a chamada de dois
--    argumentos vira ambígua e o Postgres recusa por "function is not unique".
--    Por isso o DROP da antiga vem antes, e o GRANT logo depois do CREATE.
--
--    O corpo abaixo foi COPIADO da definição viva no banco
--    (pg_get_functiondef), não do arquivo da M4 — é a mesma lição que a M22
--    registrou sobre CREATE OR REPLACE trocar o corpo inteiro em silêncio.
--    A única diferença em relação ao que está rodando hoje é o `produto` no
--    insert.
-- ---------------------------------------------------------------------
drop function if exists criar_restaurante(text, text);

create or replace function criar_restaurante(
  p_nome_restaurante text,
  p_nome_admin       text,
  p_produto          text default 'completo'
)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_rid uuid;
begin
  if auth.uid() is null then
    raise exception 'Nao autenticado.';
  end if;
  if exists (select 1 from perfis where id = auth.uid()) then
    raise exception 'Este usuario ja pertence a um restaurante.';
  end if;
  insert into restaurantes (nome, produto)
    values (
      coalesce(nullif(trim(p_nome_restaurante), ''), 'Meu Restaurante'),
      -- Normaliza em vez de recusar: texto inesperado vindo do cliente não
      -- pode DERRUBAR um cadastro. Só 'etiquetas' liga o produto menor;
      -- qualquer outra coisa cai no completo, que é o padrão seguro.
      case when p_produto = 'etiquetas' then 'etiquetas' else 'completo' end
    )
    returning id into v_rid;
  insert into perfis (id, restaurante_id, nome, cargo)
    values (auth.uid(), v_rid, coalesce(nullif(trim(p_nome_admin), ''), 'Diretoria'), 'diretoria');
  return v_rid;
end $function$;

grant execute on function criar_restaurante(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Troca de produto — só super-admin (upgrade/downgrade comercial)
--
--    Mesmo molde de definir_bloqueio/definir_max_usuarios (M9): SECURITY
--    DEFINER + trava sou_super_admin() como PRIMEIRA linha.
--
--    Downgrade NÃO apaga nada: só esconde telas. Os registros e documentos do
--    período completo continuam no banco e reaparecem inteiros se o cliente
--    voltar a assinar.
-- ---------------------------------------------------------------------
create or replace function definir_produto(p_restaurante uuid, p_produto text)
returns text language plpgsql security definer set search_path to 'public' as $function$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema muda o produto contratado.';
  end if;
  if p_produto not in ('etiquetas', 'completo') then
    raise exception 'Produto invalido: %', p_produto;
  end if;
  update restaurantes set produto = p_produto where id = p_restaurante;
  if not found then
    raise exception 'Restaurante nao encontrado.';
  end if;
  return p_produto;
end $function$;

grant execute on function definir_produto(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5) SONDAS — falham ALTO, dentro da transação, e desfazem tudo
--
--    A M24 ensinou que "revoguei/concedi" não é o mesmo que "está concedido".
--    Estas três checam o RESULTADO, não a intenção.
-- ---------------------------------------------------------------------
do $$
begin
  -- (a) a que protege o cadastro do app inteiro
  if not has_function_privilege('authenticated', 'criar_restaurante(text,text,text)', 'EXECUTE') then
    raise exception 'M27: authenticated sem EXECUTE em criar_restaurante(text,text,text) — TODO cadastro novo quebraria. Abortando.';
  end if;

  -- (b) a assinatura antiga não pode ter sobrado: duas versões = chamada ambígua
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'criar_restaurante'
                and p.oid::regprocedure::text = 'criar_restaurante(text,text)') then
    raise exception 'M27: criar_restaurante(text,text) sobreviveu — a chamada de 2 args ficaria ambigua. Abortando.';
  end if;

  -- (c) o anônimo não pode alcançar nenhuma das duas funções (M24/M26)
  if has_function_privilege('anon', 'criar_restaurante(text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'definir_produto(uuid,text)', 'EXECUTE') then
    raise exception 'M27: funcao alcancavel sem login — o gatilho da M26 nao pegou. Abortando.';
  end if;

  -- (d) o CHECK recusa lixo
  begin
    insert into restaurantes (nome, produto) values ('__sonda_m27__', 'xpto');
    raise exception 'M27: o CHECK de produto aceitou valor invalido. Abortando.';
  exception when check_violation then
    null; -- esperado
  end;
end $$;

commit;

-- =====================================================================
--  CONFERÊNCIA (rodar depois, contra o BANCO — não contra este arquivo)
--
--  1) toda conta existente ficou no completo:
--     select produto, count(*) from restaurantes group by produto;
--     → só 'completo', com o total de sempre
--
--  2) a função nova está no ar com a assinatura certa e só ela:
--     select oid::regprocedure::text from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname='public' and proname='criar_restaurante';
--     → uma linha: criar_restaurante(text,text,text)
--
--  3) o cadastro REAL continua funcionando (é o que a sonda (a) protege):
--     node scripts/e2e-restaurante-real.mjs
--     e SEMPRE depois:  node scripts/pentest-limpar.mjs
--
--  4) nenhuma RPC nova ficou aberta ao anônimo:
--     node scripts/auditar-supabase.mjs
-- =====================================================================
