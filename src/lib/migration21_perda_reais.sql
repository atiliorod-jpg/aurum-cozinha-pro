-- =====================================================================
--  MIGRAÇÃO 21 — PERDA EM R$ SEM ENTREGAR O CUSTO DE CADA INSUMO
--
--  O problema que ela resolve: ver "R$ 340 no lixo este mês" é o número que
--  mais muda comportamento de equipe. Mas quem não tem `verFinanceiro` não
--  RECEBE a tabela de custos (migração 20) — então o app dele não teria como
--  calcular esse total. Não é questão de esconder na tela: o dado não chega.
--
--  E não bastaria mandar a quebra por item: "queijo: R$ 120" somado a
--  "2 kg de queijo" no histórico revela o custo do queijo. A quebra por item é
--  matematicamente equivalente a entregar a tabela de custos.
--
--  Por isso o SERVIDOR calcula e devolve SÓ O AGREGADO. O custo unitário nunca
--  sai daqui para quem não pode vê-lo.
--
--  ⚠️ DUPLICAÇÃO CONSCIENTE: a regra de conversão de unidade existe também em
--  src/utils/financeiro.js (custoUnitario). Duas implementações da mesma regra
--  divergem com o tempo — é uma das formas clássicas de um relatório passar a
--  mentir. A defesa está em scripts/pentest-financeiro.mjs, que calcula em JS e
--  compara com o que esta função devolve, para os mesmos dados. Se divergirem,
--  o script falha.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) QUEM PODE VER O TOTAL DA PERDA
--
--    Capacidade PRÓPRIA (`verPerdaEmReais`), separada de `verFinanceiro`:
--    é a decisão do dono de mostrar o custo do desperdício para a equipe sem
--    abrir a planilha de custos. Quem já tem `verFinanceiro` vê de qualquer
--    forma — não faria sentido exigir as duas.
--
--    coalesce em tudo (lição da M19): trava que devolve NULL não trava.
-- ---------------------------------------------------------------------
create or replace function pode_ver_perda_em_reais()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when coalesce(pode_ver_financeiro(), false) then true
    else coalesce(
      (select (d.dados -> meu_cargo() ->> 'verPerdaEmReais')::boolean
         from documentos d
        where d.restaurante_id = meu_restaurante_id()
          and d.chave = 'permissoes'),
      false)
  end
$$;

-- ---------------------------------------------------------------------
-- 2) O AGREGADO
--
--    Devolve total, período e quantos lançamentos ficaram SEM custo — nunca a
--    lista de itens nem o custo unitário. `itens_sem_custo` importa: um total
--    que ignora o que não soube calcular mente por omissão, e sem esse número
--    a tela não teria como avisar.
-- ---------------------------------------------------------------------
create or replace function perda_em_reais(p_de text default null, p_ate text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
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
end $$;

-- ---------------------------------------------------------------------
-- 3) TRAVAS DE CONFERÊNCIA
-- ---------------------------------------------------------------------

-- 3a) as funções não devolvem NULL (lição da M19)
do $$
declare v boolean;
begin
  select pode_ver_perda_em_reais() into v;
  if v is null then
    raise exception 'M21: pode_ver_perda_em_reais() devolveu NULL — trava que devolve NULL não trava.';
  end if;
end $$;

-- 3b) sem sessão a função de agregado NÃO responde. Se ela respondesse para o
--     anônimo, o total de perdas de qualquer restaurante vazaria — a mesma
--     classe de furo que a M19 fechou nas nove funções de super-admin.
do $$
declare v_ok boolean := false;
begin
  begin
    perform perda_em_reais(null, null);
  exception when others then
    v_ok := true;   -- esperado: 'Sem restaurante nesta sessão.'
  end;
  if not v_ok then
    raise exception 'M21: perda_em_reais() respondeu SEM sessão — vazaria o total de perdas.';
  end if;
end $$;

commit;

-- =====================================================================
--  Conferência depois de rodar:
--    node scripts/pentest-financeiro.mjs
--  Esse script confere, entre outras coisas, que o total devolvido aqui BATE
--  com o calculado em JS pelos mesmos dados — é o que impede as duas
--  implementações da conversão de unidade de divergirem em silêncio.
-- =====================================================================
