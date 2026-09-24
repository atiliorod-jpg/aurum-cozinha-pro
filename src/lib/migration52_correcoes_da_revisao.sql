-- =====================================================================
--  M52 — CORREÇÕES DA REVISÃO DE 24/09/2026 (etiquetas em linhas e unidades)
--
--  A revisão com verificação adversarial das mudanças de 24/09 confirmou
--  defeitos em funções do banco. Todas são recriadas com a MESMA assinatura
--  (create or replace mantém o grant) e a sonda do fim confere.
--
--  1) APAGAR DUAS VEZES DESCONTAVA DUAS VEZES (apagar_impressao, M49). A
--     etiqueta já apagada podia reaparecer num aparelho (documento antigo, ou
--     o outro aparelho sem o aviso do tempo real); apagar de novo tirava mais
--     uma cópia do relatório e do contador. Agora: etiqueta que existe e JÁ
--     estava apagada devolve 0 e não mexe no relatório.
--
--  2) ID REPETIDO NO HISTÓRICO (registrar_etiquetas, M49). O id da etiqueta
--     (8 caracteres, vai no QR) foi feito para não repetir na lista do mês; as
--     linhas ficam para sempre. Quando uma etiqueta NOVA repetia o id de uma
--     linha ANTIGA, ela não entrava no banco, sem erro. O app agora guarda o
--     contador do id (quase elimina a repetição) e, se ainda repetir com uma
--     linha que já saiu de todas as telas (impressa há mais de 180 dias e
--     vencida há mais de 30), a nova ocupa o lugar — como era antes da M49,
--     quando a antiga já tinha saído da lista. O reenvio da fila continua sem
--     duplicar: ele tem a mesma data de impressão, e aí nada muda.
--
--  3) DIRETORIA PRESA A UMA UNIDADE (M48). Quem era promovido a Diretoria com
--     a trava ligada ficava preso para sempre: o cartão não lista a diretoria
--     e definir_unidade_da_conta recusava QUALQUER mudança para ela. Agora:
--     • alterar_cargo solta a trava ao promover a Diretoria;
--     • definir_unidade_da_conta aceita SOLTAR a diretoria (prender, não);
--     • registrar_impressoes e relatorio_etiquetas ignoram a trava da
--       diretoria (defesa em profundidade);
--     • quem já está nessa situação é solto aqui.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Apagar: a etiqueta já apagada não desconta o relatório de novo
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
  tirar integer := 0;
begin
  -- ⚠️ `coalesce` antes de comparar: trava que devolve NULL não trava (M19).
  if coalesce(meu_cargo(), '') <> 'diretoria' then
    raise exception 'Só a conta dona do restaurante apaga uma etiqueta impressa.';
  end if;
  rid := meu_restaurante_id();
  if rid is null then
    raise exception 'Conta sem restaurante.';
  end if;

  -- a etiqueta (M49) sai da lista sempre que o lote vier — marcada, não
  -- apagada (ver a coluna apagada_em)
  if coalesce(p_lote, '') <> '' then
    update etiquetas set apagada_em = now(), atualizado_em = now()
     where restaurante_id = rid and id = p_lote and apagada_em is null;
    -- ⚠️ M52: a linha existe e JÁ estava apagada → o relatório já foi
    -- descontado. O update acima trava a linha, então duas chamadas ao mesmo
    -- tempo também não descontam duas vezes.
    if not found and exists (select 1 from etiquetas where restaurante_id = rid and id = p_lote) then
      return 0;
    end if;
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

-- ---------------------------------------------------------------------
-- 2) Gravar: id repetido com uma linha que já saiu de todas as telas
-- ---------------------------------------------------------------------
create or replace function registrar_etiquetas(p_itens jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  rid    uuid := meu_restaurante_id();
  novas  integer;
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  data_re constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
begin
  if rid is null then return 0; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then return 0; end if;
  if jsonb_array_length(p_itens) > 400 then
    raise exception 'Lote grande demais: no máximo 400 etiquetas por chamada.';
  end if;

  insert into etiquetas (restaurante_id, id, cozinha, impressao_id, produto_id, nome,
                         impresso_em, validade, status, dados)
  select rid,
         left(e->>'id', 80),
         e->>'cozinha',
         case when coalesce(e->>'impressaoId', '') ~ uuid_re then (e->>'impressaoId')::uuid end,
         left(nullif(e->>'produtoId', ''), 80),
         left(coalesce(e->>'nome', ''), 120),
         case when coalesce(e->>'impressoEm', '') ~ data_re then (e->>'impressoEm')::date else current_date end,
         case when coalesce(e->>'validade', '') ~ data_re then (e->>'validade')::date end,
         case when e->>'status' in ('consumida', 'descartada') then e->>'status' else 'valida' end,
         (e - 'cozinha')
    from jsonb_array_elements(p_itens) e
   where coalesce(e->>'id', '') <> ''
     and coalesce(e->>'cozinha', '') ~ '^[a-z]+(#[a-z0-9]{4})?$'
     and pg_column_size(e) <= 8192
  on conflict (restaurante_id, id) do update
     set cozinha = excluded.cozinha, impressao_id = excluded.impressao_id,
         produto_id = excluded.produto_id, nome = excluded.nome,
         impresso_em = excluded.impresso_em, validade = excluded.validade,
         status = excluded.status, dados = excluded.dados, apagada_em = null,
         criado_em = now(), atualizado_em = now()
   -- ⚠️ SÓ a linha que já saiu de todas as telas (a janela da lista é de 120
   -- dias de impressão e 30 de vencida). O reenvio da mesma etiqueta tem a
   -- mesma data e não passa aqui — a fila continua sem duplicar nem desfazer
   -- nada.
   where etiquetas.impresso_em < excluded.impresso_em - 180
     and coalesce(etiquetas.validade, etiquetas.impresso_em) < excluded.impresso_em - 30;
  get diagnostics novas = row_count;
  return novas;
end $$;

-- ---------------------------------------------------------------------
-- 3) Diretoria nunca presa
-- ---------------------------------------------------------------------
create or replace function alterar_cargo(p_usuario uuid, p_cargo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rest_alvo uuid;
begin
  if coalesce(meu_cargo(), '') not in ('gerencia', 'diretoria') then
    raise exception 'Só gerência ou diretoria altera cargos.';
  end if;
  if p_cargo not in ('cozinha', 'gerencia', 'diretoria') then
    raise exception 'Cargo inválido.';
  end if;
  -- ⚠️ As três travas abaixo JÁ EXISTIAM e precisam sobreviver a esta
  -- reescrita: o que muda aqui é só de onde vem o cargo de quem chama.
  -- Anti-autopromoção: ninguém altera o próprio cargo, nem chamando a RPC direto.
  if p_usuario = auth.uid() then
    raise exception 'Você não pode alterar o seu próprio cargo.';
  end if;
  -- Gerência não concede cargo acima do próprio nível.
  if p_cargo = 'diretoria' and coalesce(meu_cargo(), '') <> 'diretoria' then
    raise exception 'Gerência não pode promover ninguém a Diretoria.';
  end if;

  select restaurante_id into v_rest_alvo from perfis where id = p_usuario;

  -- Alvo inexistente: erro controlado em vez de "sucesso" silencioso.
  if v_rest_alvo is null then
    raise exception 'Usuário alvo não encontrado.';
  end if;
  if meu_restaurante_id() is null
     or v_rest_alvo is distinct from meu_restaurante_id() then
    raise exception 'Usuário não é da sua equipe.';
  end if;

  update perfis set cargo = p_cargo where id = p_usuario;

  -- ⚠️ M52: a diretoria trabalha em todas as unidades. Promovida com a trava
  -- da M48 ligada, ficava presa para sempre.
  if p_cargo = 'diretoria' then
    perform set_config('aurum.muda_unidade', '1', true);
    update perfis set unidade_fixa = false, unidade_id = null
     where id = p_usuario and (unidade_fixa or unidade_id is not null);
    perform set_config('aurum.muda_unidade', '', true);
  end if;
end $$;

create or replace function definir_unidade_da_conta(p_usuario uuid, p_fixa boolean, p_unidade uuid default null)
returns perfis language plpgsql security definer set search_path = public as $$
declare
  rid    uuid := meu_restaurante_id();
  v_alvo perfis%rowtype;
begin
  if coalesce(meu_cargo(), '') <> 'diretoria' then
    raise exception 'Só a conta dona define a unidade da equipe.';
  end if;
  if rid is null or not coalesce(restaurante_pode_escrever(rid), false) then
    raise exception 'A conta não está liberada para alterações.';
  end if;
  select * into v_alvo from perfis where id = p_usuario and restaurante_id = rid;
  if not found then raise exception 'Conta não encontrada nesta casa.'; end if;
  -- ⚠️ M52: prender a diretoria, não; SOLTAR, sim (antes recusava as duas)
  if v_alvo.cargo = 'diretoria' and coalesce(p_fixa, false) then
    raise exception 'A diretoria trabalha em todas as unidades.';
  end if;
  if coalesce(p_fixa, false) and p_unidade is not null and not exists (
       select 1 from unidades where id = p_unidade and restaurante_id = rid and arquivada_em is null) then
    raise exception 'Unidade não encontrada nesta conta.';
  end if;
  perform set_config('aurum.muda_unidade', '1', true);
  update perfis
     set unidade_fixa = coalesce(p_fixa, false),
         unidade_id   = case when coalesce(p_fixa, false) then p_unidade end
   where id = p_usuario
   returning * into v_alvo;
  perform set_config('aurum.muda_unidade', '', true);
  return v_alvo;
end $$;

create or replace function registrar_impressoes(p_itens jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  rid     uuid;
  somadas integer;
  v_fixa  boolean;
  v_uni   uuid;
begin
  rid := meu_restaurante_id();
  if rid is null then return 0; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then return 0; end if;
  if jsonb_array_length(p_itens) > 200 then
    raise exception 'Lote grande demais: no máximo 200 itens por chamada.';
  end if;
  -- ⚠️ conta presa a uma unidade (M48): vale a unidade DELA, não a que o
  -- aparelho mandou — o relatório não pode ser enganado pelo aparelho.
  -- A diretoria nunca é presa (M52).
  select unidade_fixa and cargo <> 'diretoria', unidade_id into v_fixa, v_uni from perfis where id = auth.uid();

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
           case when coalesce(v_fixa, false)
             then (select u.id from unidades u where u.restaurante_id = rid and u.id = v_uni)
             else (select u.id from unidades u
                    where u.restaurante_id = rid
                      and u.id = case
                        when coalesce(e->>'unidade', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                        then (e->>'unidade')::uuid end)
           end
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

create or replace function relatorio_etiquetas(p_de date, p_ate date, p_restaurante uuid default null)
returns table (dia date, item text, responsavel text, reimpressao boolean, unidade_id uuid,
               etiquetas bigint, impressoes bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  rid    uuid;
  v_fixa boolean := false;
  v_uni  uuid;
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
    -- a diretoria nunca é presa (M52)
    select coalesce(p.unidade_fixa, false) and p.cargo <> 'diretoria', p.unidade_id
      into v_fixa, v_uni from perfis p where p.id = auth.uid();
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
       and (not coalesce(v_fixa, false) or e.unidade_id is not distinct from v_uni)
     group by e.dia, e.item, e.responsavel, e.reimpressao, e.unidade_id
     order by e.dia;
end $$;

-- quem já é diretoria e está preso sai daqui
select set_config('aurum.muda_unidade', '1', true);
update perfis set unidade_fixa = false, unidade_id = null
 where cargo = 'diretoria' and (unidade_fixa or unidade_id is not null);
select set_config('aurum.muda_unidade', '', true);

-- ---------------------------------------------------------------------
-- 4) Grants (as mesmas de antes) + sonda que aborta
-- ---------------------------------------------------------------------
revoke all on function apagar_impressao(uuid, text, date, text, text, integer)   from public, anon;
revoke all on function registrar_etiquetas(jsonb)                               from public, anon;
revoke all on function alterar_cargo(uuid, text)                                from public, anon;
revoke all on function definir_unidade_da_conta(uuid, boolean, uuid)            from public, anon;
revoke all on function registrar_impressoes(jsonb)                              from public, anon;
revoke all on function relatorio_etiquetas(date, date, uuid)                    from public, anon;
grant execute on function apagar_impressao(uuid, text, date, text, text, integer) to authenticated;
grant execute on function registrar_etiquetas(jsonb)                             to authenticated;
grant execute on function alterar_cargo(uuid, text)                              to authenticated;
grant execute on function definir_unidade_da_conta(uuid, boolean, uuid)          to authenticated;
grant execute on function registrar_impressoes(jsonb)                            to authenticated;
grant execute on function relatorio_etiquetas(date, date, uuid)                  to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'apagar_impressao(uuid, text, date, text, text, integer)',
    'registrar_etiquetas(jsonb)',
    'alterar_cargo(uuid, text)',
    'definir_unidade_da_conta(uuid, boolean, uuid)',
    'registrar_impressoes(jsonb)',
    'relatorio_etiquetas(date, date, uuid)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'M52: authenticated sem execute em % — abortando.', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'M52: anon consegue chamar % — abortando.', f;
    end if;
  end loop;
  if exists (select 1 from perfis where cargo = 'diretoria' and unidade_fixa) then
    raise exception 'M52: ainda há diretoria presa a uma unidade — abortando.';
  end if;
end $$;

commit;
