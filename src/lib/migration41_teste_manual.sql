-- =====================================================================
--  M41 — o teste grátis deixa de ser automático, e passa a ter produto
--
--  DUAS MUDANÇAS PEDIDAS PELO DONO (03/09/2026):
--
--  1) NINGUÉM MAIS GANHA TESTE SÓ POR SE CADASTRAR. Hoje o acesso sai de
--     `created_at + 14 dias`, então qualquer um que preencha o cadastro entra
--     no sistema por duas semanas sem falar com ninguém. Passa a ser uma DATA
--     que a Aurum escolhe conta a conta (`teste_ate`). Cadastro novo nasce
--     sem acesso, esperando a liberação.
--
--  2) DÁ PARA EMPRESTAR O PLANO COMPLETO A QUEM PAGA O ETIQUETAS. Um cliente
--     de R$279,90 experimenta o de R$399 por um tempo; quando o prazo acaba,
--     volta sozinho para o que ele paga.
--
--  ⚠️ POR QUE `teste_ate` SEPARADO DE `assinatura_ate`, e não reaproveitar a
--  data que já existe. Comercialmente são coisas OPOSTAS: uma conta em teste
--  não é receita. Se o teste fosse dado como assinatura, ela apareceria como
--  "Ativo" no painel e entraria no cálculo de quanto entra por mês — o mesmo
--  erro que o `regime` (M37) existe para evitar com as cortesias.
--
--  ⚠️ E POR QUE O PRODUTO DE TESTE NÃO SOBRESCREVE `produto`. O `produto` é o
--  que a pessoa COMPROU e é a base da cobrança; `produto_teste` é o que ela
--  está VENDO agora. Guardar num campo só faria o fim do teste perder a
--  informação de qual era o plano pago — e a conta voltaria para o produto
--  errado, ou nem voltaria.
--
--  ⚠️ OS DADOS DO PLANO COMPLETO SOBREVIVEM AO FIM DO EMPRÉSTIMO, e isso não é
--  sorte: desde a criação do Aurum Etiquetas os dois produtos gravam nas
--  MESMAS chaves de documento, rodando no módulo `producao` raiz (a razão está
--  em utils/produto.js). O que muda entre um e outro é só quais telas abrem.
--  Estoque, compras e produção lançados durante o teste continuam no banco,
--  invisíveis, e reaparecem inteiros se a pessoa assinar o completo depois.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) As colunas novas
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists teste_ate         timestamptz;
alter table restaurantes add column if not exists produto_teste     text;
alter table restaurantes add column if not exists produto_teste_ate timestamptz;

alter table restaurantes drop constraint if exists chk_produto_teste;
alter table restaurantes add constraint chk_produto_teste
  check (produto_teste is null or produto_teste in ('etiquetas', 'completo'));

-- ⚠️ MIGRAÇÃO DOS QUE JÁ EXISTEM. Quem está em teste hoje ganha a data
-- equivalente ao que já tinha (created_at + 14 dias) — ninguém perde acesso
-- no meio do caminho por causa desta mudança. Contas antigas cujo teste já
-- venceu ficam com `teste_ate` no passado, que é a verdade.
update restaurantes
   set teste_ate = created_at + interval '14 days'
 where teste_ate is null;

-- ---------------------------------------------------------------------
-- 2) Quem pode escrever
--
--    ⚠️ O `interval '14 days'` SAI DAQUI. Era ele a concessão automática.
--    Agora o teste é a coluna, e conta sem coluna preenchida não escreve.
-- ---------------------------------------------------------------------
create or replace function restaurante_pode_escrever(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurantes r
    where r.id = rid
      and coalesce(r.bloqueado, false) = false
      and (coalesce(r.assinatura_ate, 'epoch'::timestamptz) > now()
           or coalesce(r.teste_ate, 'epoch'::timestamptz) > now()
           -- cortesia/parceiro: vale enquanto não houver prazo, ou até o prazo
           or (coalesce(r.regime, 'pagante') <> 'pagante'
               and (r.cortesia_ate is null or r.cortesia_ate > now())))
  );
$$;

-- ---------------------------------------------------------------------
-- 3) A Aurum define o teste
-- ---------------------------------------------------------------------
create or replace function definir_teste(p_restaurante uuid, p_ate timestamptz)
returns timestamptz language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema define o período de teste.';
  end if;
  -- `null` tira o teste (a conta volta a depender de assinatura/cortesia).
  update restaurantes set teste_ate = p_ate where id = p_restaurante;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  return p_ate;
end $$;

-- ---------------------------------------------------------------------
-- 4) A Aurum empresta um produto
--
--    ⚠️ Emprestar o MESMO produto que a conta já tem não faz sentido e seria
--    só ruído no painel — a função recusa, em vez de gravar algo inócuo.
-- ---------------------------------------------------------------------
create or replace function definir_produto_teste(
  p_restaurante uuid, p_produto text, p_ate timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare v_atual text;
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema empresta um plano.';
  end if;

  -- Tirar o empréstimo: os dois campos saem juntos.
  if p_produto is null then
    update restaurantes set produto_teste = null, produto_teste_ate = null
     where id = p_restaurante;
    if not found then raise exception 'Restaurante não encontrado.'; end if;
    return;
  end if;

  if p_produto not in ('etiquetas', 'completo') then
    raise exception 'Produto inválido.';
  end if;
  if p_ate is null or p_ate <= now() then
    raise exception 'O empréstimo precisa de uma data futura.';
  end if;

  select produto into v_atual from restaurantes where id = p_restaurante;
  if v_atual is null then raise exception 'Restaurante não encontrado.'; end if;
  if v_atual = p_produto then
    raise exception 'Esta conta já tem o plano %.', p_produto;
  end if;

  update restaurantes
     set produto_teste = p_produto, produto_teste_ate = p_ate
   where id = p_restaurante;
end $$;

revoke all on function definir_teste(uuid, timestamptz) from public, anon;
revoke all on function definir_produto_teste(uuid, text, timestamptz) from public, anon;
grant execute on function definir_teste(uuid, timestamptz) to authenticated;
grant execute on function definir_produto_teste(uuid, text, timestamptz) to authenticated;

-- ⚠️ SONDA DE GRANT (molde da M27/M37): a M24 concede EXECUTE por assinatura
-- exata. Melhor a migração abortar aqui do que o painel quebrar na frente do
-- cliente com "permission denied" mostrado como erro genérico.
do $$
begin
  if not has_function_privilege('authenticated', 'public.definir_teste(uuid, timestamptz)', 'execute') then
    raise exception 'M41: o grant de definir_teste nao pegou. Nada foi aplicado.';
  end if;
  if not has_function_privilege('authenticated', 'public.definir_produto_teste(uuid, text, timestamptz)', 'execute') then
    raise exception 'M41: o grant de definir_produto_teste nao pegou. Nada foi aplicado.';
  end if;
end $$;

-- ⚠️ E A TRAVA QUE IMPORTA: a concessão automática TEM que ter sumido. Se o
-- `interval` sobreviver a uma reescrita futura, volta o cadastro que se
-- autoliberera — exatamente o que esta migração existe para acabar.
do $$
declare v_corpo text;
begin
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'restaurante_pode_escrever';
  if v_corpo like '%interval%' then
    raise exception 'M41: sobrou concessao automatica por intervalo. Nada foi aplicado.';
  end if;
  if v_corpo not like '%teste_ate%' then
    raise exception 'M41: a funcao nao passou a olhar teste_ate. Nada foi aplicado.';
  end if;
end $$;

commit;

-- =====================================================================
--  Teste rápido:
--    • conta nova, sem teste_ate no futuro → NÃO escreve.
--    • definir_teste(rid, now()+7d) → escreve, e o painel mostra "teste".
--    • definir_produto_teste(rid,'completo',now()+7d) numa conta etiquetas →
--      ela passa a ver o app inteiro; ao vencer, volta para etiquetas com os
--      dados do completo intactos no banco.
--    • como cliente: as duas funções levantam exceção.
-- =====================================================================
