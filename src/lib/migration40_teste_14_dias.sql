-- =====================================================================
--  M40 — o teste grátis passa de 5 para 14 dias
--
--  POR QUÊ. O produto se vende com a impressora junto: o cliente precisa
--  cadastrar itens, ESPERAR O CORREIO trazer a MDK-022 e o rolo, conectar por
--  Bluetooth e imprimir. Com 5 dias o teste acabava antes de a caixa chegar —
--  e a pessoa julgava o produto sem nunca ter visto uma etiqueta sair. 14 dias
--  cobrem o frete e ainda sobra uma semana de uso de verdade.
--
--  ⚠️ ESTA É A METADE DA MUDANÇA. A outra é `TESTE_DIAS` em
--  src/utils/assinatura.js, e as duas TÊM que ir no mesmo commit. Se só o app
--  mudar, ele diz "você ainda tem 9 dias" e o banco recusa a escrita — e como
--  o app é offline-first o lançamento entra na fila e SOME SEM ERRO NA TELA.
--  É a pior falha possível aqui: o cliente registra a produção do dia, vê
--  tudo certo, e no dia seguinte não há nada.
--
--  ⚠️ NINGUÉM PERDE NADA COM ISTO. O teste é calculado por
--  `created_at + intervalo`, não por uma data guardada na conta — então quem
--  está em teste hoje simplesmente ganha os dias a mais, e quem já assinou não
--  é afetado (a assinatura vem antes na condição).
--
--  Corpo copiado da M37, com 5 → 14. É a terceira vez que esta função é
--  reescrita (M28, M37, M40) e as três trocaram o mesmo `interval` de lugar,
--  por isso a sonda no fim.
-- =====================================================================

begin;

create or replace function restaurante_pode_escrever(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurantes r
    where r.id = rid
      and coalesce(r.bloqueado, false) = false
      and (coalesce(r.assinatura_ate, 'epoch'::timestamptz) > now()
           or r.created_at + interval '14 days' > now()
           -- cortesia/parceiro: vale enquanto não houver prazo, ou até o prazo
           or (coalesce(r.regime, 'pagante') <> 'pagante'
               and (r.cortesia_ate is null or r.cortesia_ate > now())))
  );
$$;

-- ⚠️ SONDA. As três reescritas desta função tinham o risco de deixar o número
-- para trás, e ninguém notaria até um cliente perder dias de teste. Aborta a
-- transação inteira se o intervalo não ficou, se o regime sumiu, ou se sobrou
-- o valor antigo em algum lugar do corpo.
do $$
declare v_corpo text;
begin
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'restaurante_pode_escrever';

  if v_corpo not like '%14 days%' then
    raise exception 'M40: restaurante_pode_escrever nao ficou com 14 days. Nada foi aplicado.';
  end if;
  if v_corpo like '%5 days%' then
    raise exception 'M40: sobrou "5 days" no corpo da funcao. Nada foi aplicado.';
  end if;
  if v_corpo not like '%regime%' then
    raise exception 'M40: a funcao perdeu o regime (cortesia). Nada foi aplicado.';
  end if;
end $$;

commit;

-- =====================================================================
--  Teste rápido:
--    • conta criada há 10 dias, sem assinatura → pode escrever (antes: não).
--    • conta criada há 20 dias, sem assinatura → não pode.
--    • conta em regime 'cortesia' → pode, independente da idade.
-- =====================================================================
