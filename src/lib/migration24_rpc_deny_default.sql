-- =====================================================================
--  MIGRAÇÃO 24 — DENY-BY-DEFAULT NAS RPCs, IDENTIDADE DO SUPER-ADMIN
--                E JANELA MÍNIMA NA PERDA EM R$
--
--  Fecha os três achados de segurança que ficaram de fora da migração 23.
--
--  ⚠️ RODAR DEPOIS da 23.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) DENY-BY-DEFAULT: nenhuma RPC nasce chamável sem login
--
--    No Postgres, EXECUTE de função é concedido a PUBLIC por padrão, e o
--    Supabase expõe o schema `public` inteiro pelo PostgREST para as roles
--    `anon` e `authenticated`. Resultado: as 30 funções do projeto eram
--    chamáveis SEM LOGIN — confirmado no banco, todas com `anon=X`.
--
--    Isso é a RAIZ da falha da M19: `ativar_assinatura` só não deu 400 dias de
--    assinatura grátis a qualquer anônimo porque a trava interna foi
--    corrigida. A trava interna é a segunda linha de defesa; a primeira é não
--    deixar a função ao alcance de quem não fez login.
--
--    O único caminho legítimo pré-login é `convite_valido`: o app o chama
--    ANTES do signUp (AuthContext, valida o token para não deixar conta órfã).
--    `criar_restaurante` e `aceitar_convite` rodam DEPOIS do signUp.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from anon, public;

-- O único pré-login.
grant execute on function convite_valido(text) to anon, authenticated;

-- RPCs que o app chama depois do login.
grant execute on function aceitar_convite(text, text) to authenticated;
grant execute on function alterar_cargo(uuid, text) to authenticated;
grant execute on function ativar_assinatura(uuid, integer) to authenticated;
grant execute on function avisar_pagamento(text, text) to authenticated;
grant execute on function criar_restaurante(text, text) to authenticated;
grant execute on function definir_bloqueio(uuid, boolean) to authenticated;
grant execute on function definir_max_usuarios(uuid, integer) to authenticated;
grant execute on function desativar_usuario(uuid) to authenticated;
grant execute on function enviar_feedback(text, jsonb, text) to authenticated;
grant execute on function feedback_todos() to authenticated;
grant execute on function limpar_aviso_pagamento(uuid) to authenticated;
grant execute on function marcar_feedback(uuid, text) to authenticated;
grant execute on function notas_admin_todas() to authenticated;
grant execute on function perda_em_reais(text, text) to authenticated;
grant execute on function reativar_usuario(uuid) to authenticated;
grant execute on function registrar_auditoria(text, text) to authenticated;
grant execute on function salvar_documento(uuid, text, jsonb, integer) to authenticated;
grant execute on function salvar_notas_admin(uuid, text) to authenticated;
grant execute on function usuarios_do_restaurante(uuid) to authenticated;

-- ⚠️ Helpers usados DENTRO das policies de RLS. A expressão da policy é
-- avaliada como o usuário que chama: sem EXECUTE aqui, TODA leitura e escrita
-- do app quebra com "permission denied for function". Não remover.
grant execute on function meu_cargo() to authenticated;
grant execute on function meu_restaurante() to authenticated;
grant execute on function meu_restaurante_id() to authenticated;
grant execute on function pode_ver_financeiro() to authenticated;
grant execute on function pode_ver_perda_em_reais() to authenticated;
grant execute on function restaurante_pode_escrever(uuid) to authenticated;
grant execute on function sou_super_admin() to authenticated;
grant execute on function suporte_pode_editar(uuid) to authenticated;

-- As duas funções de TRIGGER (_bloqueia_auto_reativacao, _check_cargo_change)
-- ficam sem grant de propósito: trigger é disparado pelo sistema e não exige
-- EXECUTE de quem fez o INSERT/UPDATE.
--
-- ⚠️ Medido no banco DEPOIS de aplicar: `authenticated` continua com EXECUTE
-- nas 30 funções, não nas 28 que eu esperava. O Supabase concede EXECUTE a
-- `authenticated` EXPLICITAMENTE (a ACL de cada função já trazia
-- `authenticated=X/postgres`), e este revoke mira `anon, public` — a grant
-- explícita sobrevive. Não é problema: chamar uma função de trigger fora do
-- contexto de trigger falha no Postgres. O que este bloco fecha é o alcance do
-- ANÔNIMO, e esse foi de 30 funções para 1.

-- ---------------------------------------------------------------------
-- 2) sou_super_admin() amarrado à IDENTIDADE, não a um claim de e-mail
--
--    A M19 corrigiu o NULL mas manteve a decisão de base: comparar
--    `auth.jwt() ->> 'email'` com uma string. Esse claim reflete o valor ATUAL
--    de auth.users.email, que muda por fluxo de troca de e-mail — e um token
--    antigo carrega o claim antigo. `auth.uid()` é imutável e é a identidade
--    de verdade.
--
--    coalesce mantido: a lição da M19 é que comparação que devolve NULL não
--    trava, e `auth.uid()` é NULL quando não há login.
-- ---------------------------------------------------------------------
create or replace function sou_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.uid() = '318071c2-49c0-41d0-89aa-235f0672e1ad'::uuid, false)
$$;

grant execute on function sou_super_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 3) perda_em_reais: janela mínima de 7 dias
--
--    O cabeçalho da M21 diz que a quebra por item "é matematicamente
--    equivalente a entregar a tabela de custos", e por isso só o total sai.
--    Mas p_de/p_ate eram livres e comparam a data com granularidade de DIA:
--    pedindo um dia de cada vez, e cruzando com a quantidade que a tela de
--    perdas já mostra, o custo unitário se reconstrói item a item.
--
--    Sete dias é o menor período que a tela do Financeiro oferece (7/30/90),
--    então a trava não tira nada de ninguém.
--
--    A definição abaixo foi CAPTURADA DO BANCO (pg_get_functiondef) e teve só
--    a trava inserida — não é uma reescrita de cabeça.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.perda_em_reais(p_de text DEFAULT NULL::text, p_ate text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rid    uuid := meu_restaurante_id();
  v_precos jsonb;
  v_prods  jsonb := '{}'::jsonb;
  v_total  numeric := 0;
  v_sem    integer := 0;
  r        record;
  v_custo  numeric;
  v_unidC  text;   -- unidade da COMPRA (onde o custo foi registrado)
  v_unidP  text;   -- unidade do ESTOQUE (como o produto é contado)
  v_peso   numeric;
  v_unit   numeric;
  v_qtd    numeric;
begin
  if v_rid is null then
    raise exception 'Sem restaurante nesta sessão.';
  end if;
  if coalesce(pode_ver_perda_em_reais(), false) is not true then
    raise exception 'Sem permissão para ver o valor das perdas.';
  end if;

  -- ⚠️ JANELA MÍNIMA. p_de/p_ate eram livres e comparam a data com
  -- granularidade de DIA: pedindo um dia de cada vez, e cruzando com a
  -- quantidade que a tela de perdas já mostra, dá para reconstruir o custo
  -- unitário item a item — exatamente o que o agregado existe para impedir.
  -- Sete dias é o menor período que a tela do Financeiro oferece, então isto
  -- não tira nada de ninguém.
  -- ⚠️ Só barra a janela ESTREITA. Período aberto (p_de/p_ate nulos) é o
  -- histórico inteiro — o caso MENOS vazante, não o mais: o ataque precisa
  -- isolar um dia, não somar tudo. Barrar o nulo aqui quebrou 5 testes do
  -- pentest, que é justamente quem chama sem período.
  if p_de is not null and p_ate is not null and (p_ate::date - p_de::date) < 6 then
    raise exception 'O período mínimo é de 7 dias.';
  end if;

  select dados into v_precos from documentos
   where restaurante_id = v_rid and chave = 'precos';
  if v_precos is null then
    return jsonb_build_object('total', 0, 'itens_sem_custo', 0, 'sem_precos', true,
                              'de', p_de, 'ate', p_ate);
  end if;

  -- Catálogos de TODOS os estoques num mapa só (produtoId → produto). Os ids
  -- são únicos entre módulos (o seco usa prefixo 'seco_'), então mesclar é
  -- seguro e evita descobrir de qual módulo é cada perda.
  for r in
    select dados from documentos
     where restaurante_id = v_rid and chave like '%produtos'
  loop
    if jsonb_typeof(r.dados) = 'array' then
      select coalesce(v_prods || jsonb_object_agg(x->>'id', x), v_prods)
        into v_prods
        from jsonb_array_elements(r.dados) x
       where x->>'id' is not null;
    end if;
  end loop;

  for r in
    select dados from registros
     where restaurante_id = v_rid
       and deleted = false
       and tipo ~ '(^|:)perda$'
       and (p_de  is null or coalesce(dados->>'data', '') >= p_de)
       and (p_ate is null or coalesce(dados->>'data', '') <= p_ate)
  loop
    v_qtd := nullif(r.dados->>'quantidade', '')::numeric;
    if v_qtd is null or v_qtd <= 0 then continue; end if;

    v_custo := nullif(v_precos -> (r.dados->>'produtoId') ->> 'custo', '')::numeric;
    v_unidC := lower(trim(coalesce(v_precos -> (r.dados->>'produtoId') ->> 'unidade', '')));
    v_unidP := lower(trim(coalesce(v_prods -> (r.dados->>'produtoId') ->> 'unidade', '')));
    v_peso  := nullif(v_prods -> (r.dados->>'produtoId') ->> 'pesoUnidade', '')::numeric;

    -- MESMA regra de custoUnitario() em src/utils/financeiro.js
    v_unit := null;
    if v_custo is not null and v_custo > 0 and v_unidC <> '' and v_unidP <> '' then
      if v_unidC = v_unidP then
        v_unit := v_custo;
      elsif v_unidC = 'kg' and v_unidP = 'unid' and v_peso is not null and v_peso > 0 then
        v_unit := v_custo * (v_peso / 1000);
      elsif v_unidC = 'unid' and v_unidP = 'kg' and v_peso is not null and v_peso > 0 then
        v_unit := v_custo / (v_peso / 1000);
      end if;
    end if;

    if v_unit is null then
      v_sem := v_sem + 1;            -- litro x quilo, sem peso da peça, sem preço
    else
      v_total := v_total + round(v_qtd * v_unit, 2);
    end if;
  end loop;

  return jsonb_build_object(
    'total', round(v_total, 2),
    'itens_sem_custo', v_sem,
    'sem_precos', false,
    'de', p_de, 'ate', p_ate
  );
end $function$
;

grant execute on function perda_em_reais(text, text) to authenticated;

commit;

-- =====================================================================
--  CONFERÊNCIA
--
--  1) nenhuma função sobrou ao alcance do anônimo, fora convite_valido:
--     select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public'
--        and has_function_privilege('anon', p.oid, 'EXECUTE');
--     → só 'convite_valido'  (conferido: era 30, ficou 1)
--
--  2) o super-admin é decidido por uid:
--     select prosrc like '%auth.uid()%' from pg_proc where proname='sou_super_admin';
--     → t
--
--  3) a janela mínima entrou:
--     select prosrc like '%período mínimo%' from pg_proc where proname='perda_em_reais';
--     → t
--
--  4) e o app continua funcionando de ponta a ponta:
--     node scripts/e2e-restaurante-real.mjs      → 48/48
--     node scripts/pentest-financeiro.mjs        → 18/18
--     node scripts/auditar-supabase.mjs          → 26/26
--     node scripts/pentest-limpar.mjs            (SEMPRE depois)
-- =====================================================================
