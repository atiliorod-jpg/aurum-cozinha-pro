-- =====================================================================
--  M44 — a conta dona apaga uma etiqueta que foi contada e não saiu
--
--  DEFEITO ACHADO PELO DONO (10/09/2026): no computador, tocar em
--  "Imprimir" abre a janela de impressão do navegador — e a etiqueta já era
--  contada ali, mesmo que ele fechasse a janela sem imprimir. Entrou no
--  relatório uma etiqueta que nunca existiu, e não havia como tirar.
--
--  A causa foi corrigida no app (ele agora pergunta "saiu no papel?" antes de
--  contar). Esta função é a outra metade: consertar o que já entrou errado —
--  e o que ainda entrar por engano.
--
--  ⚠️ SÓ A CONTA DONA, conferido AQUI e não só na tela, a pedido dele:
--  `meu_cargo()` (M18) já devolve NULL para conta desativada. Apagar mexe no
--  número que o dono usa para cobrar a equipe; se a cozinha pudesse apagar,
--  o relatório deixaria de valer justamente para isso. O super-admin no modo
--  suporte também não passa — o cargo dele não é o da casa.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Apagar
--
--    ⚠️ TRÊS JEITOS DE ACHAR A LINHA, do mais certo para o menos:
--      1. `p_id` — o id da impressão, que a lista de Impressas passa a
--         guardar a partir de hoje (`impressaoId`);
--      2. `p_lote` — as linhas que a M43 recuperou da lista antiga têm id
--         derivado do lote: md5(restaurante + ':' + lote);
--      3. dia + hora + item — o que foi impresso entre a M43 e esta correção
--         (inclusive a etiqueta que o dono achou) não tem vínculo nenhum. Os
--         três campos saem do MESMO instante nas duas listas.
--
--    ⚠️ TIRA CÓPIAS, NÃO NECESSARIAMENTE A LINHA. Pelo navegador com QR, um
--    lote de 5 vira 5 itens na lista e UMA linha de 5 aqui. Apagar um item
--    tira 1; a linha só some quando zera.
--
--    ⚠️ O CONTADOR DA M42 DESCE JUNTO, pelo mesmo motivo que ele sobe junto
--    (M43): os dois números têm de contar a mesma coisa.
--
--    Não achou nada → devolve 0, sem erro: a etiqueta pode nunca ter subido
--    (impressa sem internet e ainda na fila, ou em conta de demonstração). A
--    tela apaga da lista mesmo assim.
-- ---------------------------------------------------------------------
create or replace function apagar_impressao(
  p_id     uuid    default null,
  p_lote   text    default null,
  p_dia    date    default null,
  p_hora   text    default null,
  p_item   text    default null,
  p_copias integer default 1
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  rid   uuid;
  alvo  etiquetas_impressoes%rowtype;
  tirar integer;
begin
  -- ⚠️ `coalesce` antes de comparar: trava que devolve NULL não trava (M19).
  if coalesce(meu_cargo(), '') <> 'diretoria' then
    raise exception 'Só a conta dona do restaurante apaga uma etiqueta impressa.';
  end if;
  rid := meu_restaurante_id();
  if rid is null then
    raise exception 'Conta sem restaurante.';
  end if;

  if p_id is not null then
    select * into alvo from etiquetas_impressoes
     where id = p_id and restaurante_id = rid;
  end if;

  if alvo.id is null and coalesce(p_lote, '') <> '' then
    select * into alvo from etiquetas_impressoes
     where id = md5(rid::text || ':' || p_lote)::uuid and restaurante_id = rid;
  end if;

  if alvo.id is null and p_dia is not null then
    select * into alvo from etiquetas_impressoes
     where restaurante_id = rid
       and dia = p_dia
       and hora = left(coalesce(p_hora, ''), 5)
       and upper(btrim(item)) = upper(btrim(coalesce(p_item, '')))
     order by criado_em desc
     limit 1;
  end if;

  if alvo.id is null then return 0; end if;

  tirar := least(greatest(coalesce(p_copias, 1), 1), alvo.copias);
  if tirar >= alvo.copias then
    delete from etiquetas_impressoes where id = alvo.id;
  else
    update etiquetas_impressoes set copias = copias - tirar where id = alvo.id;
  end if;

  update restaurantes
     set etiquetas_impressas = greatest(coalesce(etiquetas_impressas, 0) - tirar, 0)
   where id = rid;

  return tirar;
end $$;

revoke all on function apagar_impressao(uuid, text, date, text, text, integer) from public, anon;
grant execute on function apagar_impressao(uuid, text, date, text, text, integer) to authenticated;

do $$
begin
  if not has_function_privilege('authenticated', 'apagar_impressao(uuid, text, date, text, text, integer)', 'execute') then
    raise exception 'M44: o grant de execute não pegou — abortando.';
  end if;
  if has_function_privilege('anon', 'apagar_impressao(uuid, text, date, text, text, integer)', 'execute') then
    raise exception 'M44: anon consegue chamar — abortando.';
  end if;
end $$;

commit;

-- =====================================================================
--  Teste rápido:
--    • como cozinha/gerência: select apagar_impressao('<id>'); → exceção.
--    • como diretoria: devolve quantas cópias tirou; a linha some quando
--      zera, e `restaurantes.etiquetas_impressas` desce o mesmo tanto.
-- =====================================================================
