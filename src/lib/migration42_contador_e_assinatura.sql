-- =====================================================================
--  M42 — quantas etiquetas cada casa imprimiu, e a data de assinatura editável
--
--  DUAS COISAS PEDIDAS PELO DONO (03/09/2026):
--
--  1) O PAINEL MOSTRAVA "0 ETIQUETAS" PARA TODA CONTA DO PLANO ETIQUETAS, e
--     não era defeito de leitura: aquele plano NÃO GUARDA o histórico de
--     etiquetas (decisão de 30/08 — `historicoEtiquetas` só existe no plano
--     completo), e o painel contava justamente esse histórico. Ou seja, o
--     número era impossível de existir para o produto que está sendo vendido.
--
--     ⚠️ A SAÍDA NÃO É LIGAR O HISTÓRICO. Ele guarda nome do item, validade,
--     responsável e data — conteúdo do cliente. Para saber USO não é preciso
--     saber O QUÊ: passa a existir um CONTADOR, um número por conta. A Aurum
--     vê "1.482 etiquetas impressas" e continua sem ver o que a casa etiqueta.
--     É a mesma régua da M36, que já dizia "números, nunca conteúdo".
--
--  2) O PAINEL SÓ SABIA SOMAR DIAS. `ativar_assinatura` (M13) acrescenta N
--     dias a partir do vencimento atual — perfeito para renovar, inútil para
--     CORRIGIR. Cliente que teve dia demais lançado por engano, acordo de data
--     cheia ("vence todo dia 10"), cancelamento que precisa antecipar o fim:
--     nada disso tinha caminho, e o dono tinha de mexer no banco à mão.
--     Entra `definir_assinatura`, que grava a data exata — inclusive no
--     passado, inclusive `null`.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) O contador
--
--    ⚠️ NA TABELA `restaurantes`, não numa tabela de eventos. Uma linha por
--    impressão viraria, ela sim, um registro do que a casa etiqueta e quando —
--    exatamente o que a decisão de 30/08 tirou do produto. Um inteiro que só
--    cresce não conta história nenhuma.
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists etiquetas_impressas bigint not null default 0;

-- ⚠️ COMEÇA DO QUE JÁ EXISTE, senão toda conta antiga apareceria com zero e o
-- painel mentiria de um jeito novo. Quem tem histórico (plano completo) já tem
-- a contagem verdadeira guardada nos documentos; ela vira o ponto de partida.
-- Contas do plano Etiquetas começam em zero mesmo — não há de onde tirar o
-- passado delas, e isso é consequência da decisão de não guardar.
update restaurantes r
   set etiquetas_impressas = coalesce((
         select sum(jsonb_array_length(d.dados))
           from documentos d
          where d.restaurante_id = r.id
            and d.chave like '%etiquetasImpressas'
            and jsonb_typeof(d.dados) = 'array'), 0)
 where r.etiquetas_impressas = 0;

-- ---------------------------------------------------------------------
-- 2) O cliente soma no próprio contador
--
--    ⚠️ ESCREVE SÓ NO PRÓPRIO RESTAURANTE. Não recebe `p_restaurante`: o alvo
--    sai de `meu_restaurante_id()`, então não existe parâmetro para alguém
--    trocar e mexer na conta do vizinho. Uma função com id de restaurante no
--    argumento é uma função que precisa de trava; sem o argumento, não há o
--    que travar.
--
--    ⚠️ TETO POR CHAMADA igual ao MAX_COPIAS da tela (200). O pior caso
--    continua sendo alguém inflar o próprio número de uso, que não vale nada
--    para ninguém — mas número absurdo estragaria a leitura do painel.
--
--    ⚠️ E NÃO ENTRA NA FILA OFFLINE. Impressão feita sem internet não é
--    contada, de propósito: a fila existe para não PERDER LANÇAMENTO do
--    cliente, e este número é estatística da Aurum. Pagar o preço de uma
--    espécie nova na fila (com retentativa, conflito e limpeza) por um contador
--    seria caro no lugar errado. O painel conta o que passou pela nuvem.
-- ---------------------------------------------------------------------
create or replace function contar_etiquetas_impressas(p_quantas integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
  n   integer;
begin
  rid := meu_restaurante_id();
  if rid is null then return; end if;              -- sem restaurante, nada a contar
  n := least(greatest(coalesce(p_quantas, 0), 0), 200);
  if n = 0 then return; end if;
  update restaurantes set etiquetas_impressas = coalesce(etiquetas_impressas, 0) + n
   where id = rid;
end $$;

-- ---------------------------------------------------------------------
-- 3) O painel passa a ler o contador
--
--    ⚠️ `create or replace` mantendo a MESMA assinatura e a MESMA ordem de
--    colunas: a tela lê pelo nome, mas a função devolve uma tabela e trocar a
--    ordem quebraria em silêncio. Só a origem do campo `etiquetas` muda.
-- ---------------------------------------------------------------------
create or replace function uso_do_restaurante(p_restaurante uuid)
returns table (
  ultimo_acesso    timestamptz,
  usuarios         integer,
  usuarios_ativos  integer,
  itens            integer,
  etiquetas        integer,
  registros        integer,
  ultima_gravacao  timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  -- ⚠️ `coalesce` antes de negar: trava que devolve NULL não trava (M19).
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema consulta o uso.';
  end if;

  return query select
    (select max(u.last_sign_in_at)
       from auth.users u
       join perfis p on p.id = u.id
      where p.restaurante_id = p_restaurante),

    (select count(*)::integer from perfis p where p.restaurante_id = p_restaurante),

    (select count(*)::integer from perfis p
      where p.restaurante_id = p_restaurante and coalesce(p.ativo, true)),

    (select coalesce(sum(jsonb_array_length(d.dados)), 0)::integer
       from documentos d
      where d.restaurante_id = p_restaurante
        and d.chave like '%produtos'
        and jsonb_typeof(d.dados) = 'array'),

    -- ⚠️ AGORA VEM DO CONTADOR, não do histórico. O histórico não existe no
    -- plano Etiquetas, e era por isso que toda conta daquele plano aparecia
    -- com zero etiquetas impressas — o número era impossível, não ausente.
    (select coalesce(r.etiquetas_impressas, 0)::integer
       from restaurantes r where r.id = p_restaurante),

    (select count(*)::integer from registros r where r.restaurante_id = p_restaurante),

    (select max(d.updated_at) from documentos d where d.restaurante_id = p_restaurante);
end $$;

-- ---------------------------------------------------------------------
-- 4) A Aurum define a data exata da assinatura
--
--    ⚠️ ACEITA DATA NO PASSADO E `null`, e isso é o ponto. `ativar_assinatura`
--    só sabe SOMAR dias a partir do vencimento atual: ótimo para renovar,
--    incapaz de corrigir um lançamento errado ou de encerrar antes do prazo.
--    Sem isso, corrigir exigia abrir o banco à mão.
--
--    ⚠️ NÃO MEXE NO `regime` NEM NO AVISO DE PAGAMENTO. Data de assinatura e
--    natureza comercial da conta (pagante/cortesia/parceiro) são decisões
--    separadas — uma função que mexesse nas duas faria o dono mudar uma sem
--    querer ao ajustar a outra. O aviso de pagamento é limpo por
--    `registrar_pagamento`, que é onde ele nasce.
-- ---------------------------------------------------------------------
create or replace function definir_assinatura(p_restaurante uuid, p_ate timestamptz)
returns timestamptz language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema altera a assinatura.';
  end if;
  update restaurantes set assinatura_ate = p_ate where id = p_restaurante;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  return p_ate;
end $$;

-- ---------------------------------------------------------------------
-- 5) Quem pode chamar
--
--    ⚠️ FUNÇÃO NOVA NASCE SEM GRANT (M24: deny-by-default, e o gatilho da M26
--    revoga anon/PUBLIC a cada CREATE FUNCTION). Sem estas linhas, a tela
--    quebraria com "permission denied" mostrado como erro genérico — foi o
--    que quase aconteceu na M27.
-- ---------------------------------------------------------------------
revoke all on function contar_etiquetas_impressas(integer) from public, anon;
revoke all on function definir_assinatura(uuid, timestamptz)  from public, anon;
revoke all on function uso_do_restaurante(uuid)               from public, anon;
grant execute on function contar_etiquetas_impressas(integer) to authenticated;
grant execute on function definir_assinatura(uuid, timestamptz)  to authenticated;
grant execute on function uso_do_restaurante(uuid)               to authenticated;

-- ---------------------------------------------------------------------
-- 6) Sonda: se o grant não pegou, a transação inteira volta
--
--    A M27 registrou por que isto existe — grant que não pega vira erro
--    genérico na tela do cliente, e ninguém liga uma coisa à outra.
-- ---------------------------------------------------------------------
do $$
begin
  if not has_function_privilege('authenticated', 'contar_etiquetas_impressas(integer)', 'execute')
     or not has_function_privilege('authenticated', 'definir_assinatura(uuid, timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'uso_do_restaurante(uuid)', 'execute') then
    raise exception 'M42: o grant de execute não pegou — abortando.';
  end if;
end $$;

commit;

-- =====================================================================
--  Teste rápido:
--    • logado como cliente:      select contar_etiquetas_impressas(3);
--      → soma 3 no PRÓPRIO restaurante; não há como apontar para outro.
--    • logado como cliente:      select definir_assinatura('<rid>', now());
--      → levanta exceção.
--    • logado como super-admin:  select * from uso_do_restaurante('<rid>');
--      → a coluna `etiquetas` agora vem do contador.
-- =====================================================================
