-- =====================================================================
--  M43 — relatório de etiquetas: quantas por dia, por semana e por mês
--
--  PEDIDO DO DONO (10/09/2026): "o proprietário da conta analisar os dados
--  dos dias passados, como se fosse um relatório de etiquetas — mês passado
--  quantas foram impressas, por semana e por dia".
--
--  ⚠️ NADA DO QUE EXISTIA DAVA ESSE NÚMERO, e não por falta de tela:
--    • o contador da M42 é UM inteiro por conta — total desde sempre, sem
--      data. Não existe "mês passado" dentro de um número só;
--    • a lista da aba Impressas é PODADA (`podarEtiquetas`: vencida some com
--      30 dias, encerrada com 120, teto de 4000). Um "mês passado" montado em
--      cima dela sairia menor do que foi, com cara de certo;
--    • o contador perdia de propósito o que era impresso sem internet.
--
--  ⚠️ ISTO REVÊ UMA DECISÃO DA M42, e é bom deixar escrito por quê. A M42
--  recusou "uma linha por impressão" porque aquilo contaria à AURUM o que a
--  casa etiqueta. Continua valendo para o painel da Aurum — `uso_do_restaurante`
--  segue lendo só o contador, sem nome de item nenhum. O que muda é que agora
--  o PRÓPRIO CLIENTE pediu o relatório, e relatório por dia exige guardar o
--  dia. Esta tabela é dado do cliente, na mesma régua de `documentos`: só a
--  casa lê, e o super-admin só pelo modo suporte (como já lê o resto).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Uma linha por impressão
--
--    ⚠️ O `id` NASCE NO APARELHO, não aqui. A impressão feita sem internet vai
--    para a fila offline, e a fila REENVIA — se a resposta de um envio que deu
--    certo se perder no caminho, o mesmo lote chega duas vezes. Com o id do
--    aparelho como chave, a segunda chegada bate no `on conflict do nothing` e
--    a etiqueta não é contada em dobro.
--
--    ⚠️ `dia` É A DATA LOCAL DO APARELHO, mandada pronta. O banco pensa em
--    UTC: uma etiqueta impressa às 22h em Recife cairia no dia seguinte se o
--    dia saísse do `now()` daqui.
--
--    ⚠️ `on delete cascade`: apagar o restaurante (M38) leva isto junto. É uma
--    das tabelas que a cláusula de exclusão definitiva promete apagar.
-- ---------------------------------------------------------------------
create table if not exists etiquetas_impressoes (
  id             uuid primary key,
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  dia            date not null,
  hora           text not null default '',
  item           text not null default '',
  responsavel    text not null default '',
  copias         integer not null check (copias between 1 and 200),
  reimpressao    boolean not null default false,
  criado_em      timestamptz not null default now()
);
create index if not exists etiquetas_impressoes_rest_dia
  on etiquetas_impressoes (restaurante_id, dia);

-- ⚠️ RLS LIGADA E NENHUMA POLICY, de propósito (mesmo molde da M15/M31/M38):
-- ninguém lê nem grava a tabela direto. Só as duas funções abaixo chegam
-- nela, e cada uma decide sozinha de qual restaurante se trata.
alter table etiquetas_impressoes enable row level security;

-- ---------------------------------------------------------------------
-- 2) Gravar
--
--    ⚠️ SEM `p_restaurante`, como o contador da M42: o alvo sai de
--    `meu_restaurante_id()`, então não existe parâmetro para alguém trocar e
--    escrever no relatório do vizinho.
--
--    ⚠️ SOMA NO CONTADOR DA M42 SÓ O QUE ENTROU DE VERDADE. É por isso que o
--    app parou de chamar `contar_etiquetas_impressas`: as duas juntas
--    contariam cada etiqueta duas vezes. E, como o reenvio da fila não entra
--    (conflito de id), o contador do painel também deixou de contar em dobro
--    — e passou a contar o que foi impresso sem internet.
--
--    ⚠️ `contar_etiquetas_impressas` CONTINUA EXISTINDO: o app instalado pelo
--    endereço antigo fica congelado na versão velha e segue chamando ela.
--    Apagar a função quebraria a impressão daquele aparelho com um erro no
--    console — sem ganho nenhum.
--
--    Tetos: 200 linhas por chamada (a tela manda uma por item do lote) e 200
--    cópias por linha, os mesmos MAX_COPIAS da tela. Data fora da janela de
--    400 dias para trás / 1 para a frente é descartada: é relógio de aparelho
--    errado, e um dia de 1970 estragaria o gráfico.
-- ---------------------------------------------------------------------
create or replace function registrar_impressoes(p_itens jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  rid     uuid;
  somadas integer;
begin
  rid := meu_restaurante_id();
  if rid is null then return 0; end if;            -- sem restaurante, nada a contar
  if jsonb_typeof(p_itens) is distinct from 'array' then return 0; end if;
  if jsonb_array_length(p_itens) > 200 then
    raise exception 'Lote grande demais: no máximo 200 itens por chamada.';
  end if;

  with novas as (
    insert into etiquetas_impressoes (id, restaurante_id, dia, hora, item, responsavel, copias, reimpressao)
    select (e->>'id')::uuid,
           rid,
           (e->>'dia')::date,
           left(coalesce(e->>'hora', ''), 5),
           left(coalesce(e->>'item', ''), 120),
           left(coalesce(e->>'responsavel', ''), 80),
           least(greatest(coalesce((e->>'copias')::integer, 1), 1), 200),
           coalesce((e->>'reimpressao')::boolean, false)
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

-- ---------------------------------------------------------------------
-- 3) Ler — já agrupado
--
--    ⚠️ DEVOLVE A SOMA POR (dia, item, responsável, reimpressão), não as
--    linhas cruas. Um mês de cozinha movimentada são milhares de linhas; o
--    agrupamento é o que a tela precisa e cabe em poucas centenas.
--
--    ⚠️ `p_restaurante` SÓ VALE PARA O SUPER-ADMIN, no modo suporte. Para
--    qualquer outra conta ele é IGNORADO e manda `meu_restaurante_id()` —
--    mandar o id do vizinho devolve o próprio relatório, não o do vizinho.
--    `coalesce` antes de decidir: trava que devolve NULL não trava (M19).
--
--    ⚠️ A CAPACIDADE `verRelatorioEtiquetas` É TRAVA DE TELA, como a
--    `verRelatorio` do plano completo. Não é barreira dura porque o dado não
--    é segredo dentro da casa: a aba Impressas já mostra, a quem tem acesso a
--    ela, o nome, o responsável e a hora de cada etiqueta.
-- ---------------------------------------------------------------------
create or replace function relatorio_etiquetas(p_de date, p_ate date, p_restaurante uuid default null)
returns table (dia date, item text, responsavel text, reimpressao boolean, etiquetas bigint, impressoes bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  rid uuid;
begin
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido.';
  end if;
  -- um ano contra o ano anterior cabe folgado; mais que isso é engano
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
    select e.dia, e.item, e.responsavel, e.reimpressao,
           sum(e.copias)::bigint, count(*)::bigint
      from etiquetas_impressoes e
     where e.restaurante_id = rid
       and e.dia between p_de and p_ate
     group by e.dia, e.item, e.responsavel, e.reimpressao
     order by e.dia;
end $$;

-- ---------------------------------------------------------------------
-- 4) O que já existia entra no relatório
--
--    ⚠️ O RELATÓRIO NÃO NASCE VAZIO para quem já imprimiu: a lista da aba
--    Impressas (documentos `…etiquetasImpressas`) tem dia, hora, item,
--    responsável e cópias — é tudo o que o relatório precisa. Entra o que a
--    poda ainda não levou; o que já tinha sumido não volta, e o relatório
--    avisa que conta a partir de setembro de 2026.
--
--    ⚠️ O ID É DERIVADO (md5 do restaurante + id do lote), então rodar esta
--    migração de novo não duplica nada. E NÃO soma no contador da M42: essas
--    etiquetas já foram contadas por ele quando saíram.
--
--    Reimpressão fica `false` aqui: a lista antiga não guardava essa marca.
-- ---------------------------------------------------------------------
insert into etiquetas_impressoes (id, restaurante_id, dia, hora, item, responsavel, copias, reimpressao)
select md5(d.restaurante_id::text || ':' || (e->>'id'))::uuid,
       d.restaurante_id,
       (e->>'impressoEm')::date,
       left(coalesce(e->>'impressoEmHora', ''), 5),
       left(coalesce(e->>'nome', ''), 120),
       left(coalesce(e->>'responsavel', ''), 80),
       case when coalesce(e->>'copias', '') ~ '^[0-9]{1,6}$'
            then least(greatest((e->>'copias')::integer, 1), 200) else 1 end,
       false
  from documentos d
  cross join lateral jsonb_array_elements(d.dados) e
 where d.chave like '%etiquetasImpressas'
   and jsonb_typeof(d.dados) = 'array'
   and jsonb_typeof(e) = 'object'
   and coalesce(e->>'id', '') <> ''
   and coalesce(e->>'impressoEm', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   and (e->>'impressoEm')::date between current_date - 400 and current_date + 1
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 5) Quem pode chamar
--
--    ⚠️ FUNÇÃO NOVA NASCE SEM GRANT (M24 + gatilho da M26). Sem estas linhas
--    a impressão seguiria funcionando, mas cada lote cairia na fila offline
--    com "permission denied" e morreria lá — em silêncio.
-- ---------------------------------------------------------------------
revoke all on function registrar_impressoes(jsonb)              from public, anon;
revoke all on function relatorio_etiquetas(date, date, uuid)    from public, anon;
grant execute on function registrar_impressoes(jsonb)           to authenticated;
grant execute on function relatorio_etiquetas(date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Sonda: se o grant não pegou, a transação inteira volta
-- ---------------------------------------------------------------------
do $$
begin
  if not has_function_privilege('authenticated', 'registrar_impressoes(jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'relatorio_etiquetas(date, date, uuid)', 'execute') then
    raise exception 'M43: o grant de execute não pegou — abortando.';
  end if;
  if has_function_privilege('anon', 'registrar_impressoes(jsonb)', 'execute')
     or has_function_privilege('anon', 'relatorio_etiquetas(date, date, uuid)', 'execute') then
    raise exception 'M43: anon consegue chamar — abortando.';
  end if;
end $$;

commit;

-- =====================================================================
--  Teste rápido:
--    • logado como cliente:
--        select registrar_impressoes('[{"id":"<uuid>","dia":"2026-09-10","copias":3}]');
--      → devolve 3; a MESMA chamada de novo devolve 0 (reenvio da fila).
--    • logado como cliente:
--        select * from relatorio_etiquetas('2026-09-01', '2026-09-30', '<rid do vizinho>');
--      → devolve o PRÓPRIO relatório; o id do vizinho é ignorado.
--    • sem login: as duas levantam "permission denied".
-- =====================================================================
