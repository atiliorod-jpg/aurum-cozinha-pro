-- =====================================================================
--  MIGRAÇÃO 22 — VÁRIOS ESTOQUES DO MESMO TIPO (instâncias)
--
--  ⚠️ RODAR ANTES de liberar a criação de instâncias no app.
--
--  Sem ela o app PARECE funcionar: o offline-first grava no aparelho, a tela
--  mostra o toast verde, e o INSERT é recusado pelo CHECK — o lançamento fica
--  preso na fila para sempre. Foi exatamente o que aconteceu com o Estoque
--  Seco antes da migração 17, e é por isso que banco vem antes de cliente.
--
--  Formato do id:  <tipo>#<4 caracteres>   →  'seco#x7k2'
--    • usa '#' e não ':' → lerTipo() (corta no PRIMEIRO ':') não muda
--    • a instância RAIZ mantém o id de sempre ('seco'), e a produção continua
--      SEM prefixo → nenhum dado existente precisa ser convertido
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) O CHECK aceita instâncias — e SÓ o formato exato
--
--    Restrito de propósito, pela mesma razão que a M17 documenta: um regex
--    do tipo "qualquer texto" deixaria lixo entrar e poluir relatório.
-- ---------------------------------------------------------------------
alter table registros drop constraint if exists registros_tipo_check;

alter table registros add constraint registros_tipo_check
  check (
    -- Cozinha de Produção (raiz): sem prefixo, como sempre foi
    tipo in ('compra','entrada','saida','apara','perda','ajuste','auditoria')
    -- Seco / Finalização raiz: idêntico à M17, intocado
    or tipo ~ '^(seco|finalizacao):(compra|entrada|saida|apara|perda|ajuste)$'
    -- Instâncias. 'producao#....' entra de propósito: quando o app liberar a
    -- segunda cozinha de produção não vai precisar de outra migração.
    or tipo ~ '^(producao|seco|finalizacao)#[a-z0-9]{4}:(compra|entrada|saida|apara|perda|ajuste)$'
  );

-- NOTA: 'producao:entrada' (prefixo base SEM '#') continua RECUSADO de
-- propósito. Duas grafias para o mesmo estoque é como saldo duplicado nasce:
-- metade dos lançamentos numa, metade na outra, e nenhuma tela somando as duas.

-- ---------------------------------------------------------------------
-- 2) O REGISTRO DE INSTÂNCIAS — mesma proteção da matriz de permissões
--
--    Quem cria, renomeia ou arquiva instância decide o que cada tablet
--    enxerga, e pode ESCONDER o estoque de um restaurante inteiro. É decisão
--    de diretoria, não de quem opera.
--
--    ⚠️ Policies permissivas somam por OR (lição da M18): criar a nova sem
--    derrubar a v20 não travaria nada.
-- ---------------------------------------------------------------------
drop policy if exists "doc_ins_v20" on documentos;
drop policy if exists "doc_upd_v20" on documentos;
drop policy if exists "doc_ins_v22" on documentos;
drop policy if exists "doc_upd_v22" on documentos;

create policy "doc_ins_v22" on documentos for insert
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and (chave not like '%permissoes' or meu_cargo() = 'diretoria')
    and (chave not like '%estoques'   or meu_cargo() = 'diretoria')
    and (chave not like '%precos'     or pode_ver_financeiro())
  );

create policy "doc_upd_v22" on documentos for update
  using (restaurante_id = meu_restaurante_id())
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and (chave not like '%permissoes' or meu_cargo() = 'diretoria')
    and (chave not like '%estoques'   or meu_cargo() = 'diretoria')
    and (chave not like '%precos'     or pode_ver_financeiro())
  );

-- `like '%estoques'` e não igualdade: um 'seco::estoques' escaparia de uma
-- comparação exata. Mesmo cuidado da M18 com '%permissoes'.

-- salvar_documento é SECURITY INVOKER e herda as policies. Reforço explícito
-- para a mensagem ser legível em vez de "violates RLS".
-- ⚠️ CREATE OR REPLACE troca o CORPO INTEIRO: tudo o que M18/M19/M20 faziam
-- está reproduzido aqui de propósito.
create or replace function salvar_documento(p_restaurante uuid, p_chave text, p_dados jsonb, p_versao integer)
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_atual documentos%rowtype;
begin
  if p_chave like '%permissoes' and meu_cargo() is distinct from 'diretoria' then
    raise exception 'Só a diretoria altera as permissões da equipe.';
  end if;
  if p_chave like '%estoques' and meu_cargo() is distinct from 'diretoria' then
    raise exception 'Só a diretoria cria, renomeia ou arquiva estoques.';
  end if;
  if p_chave like '%precos' and coalesce(pode_ver_financeiro(), false) is not true then
    raise exception 'Sem permissão para alterar preços e custos.';
  end if;

  select * into v_atual from documentos
   where restaurante_id = p_restaurante and chave = p_chave for update;

  if not found then
    insert into documentos (restaurante_id, chave, dados, versao, updated_at)
    values (p_restaurante, p_chave, p_dados, 1, now());
    return jsonb_build_object('ok', true, 'versao', 1);
  end if;

  -- versão -1 = replay do offline: força a gravação e sobe o contador
  if p_versao <> -1 and p_versao <> v_atual.versao then
    return jsonb_build_object('ok', false, 'conflito', true,
                              'versao', v_atual.versao, 'dados', v_atual.dados);
  end if;

  update documentos
     set dados = p_dados, versao = v_atual.versao + 1, updated_at = now()
   where restaurante_id = p_restaurante and chave = p_chave;

  return jsonb_build_object('ok', true, 'versao', v_atual.versao + 1);
end $$;

-- O super-admin em modo suporte não mexe na topologia de estoques do cliente.
drop policy if exists "doc_super_ins_v20" on documentos;
drop policy if exists "doc_super_upd_v20" on documentos;

create policy "doc_super_ins_v22" on documentos for insert
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id)
              and chave not in ('prefs', 'permissoes', 'precos', 'estoques'));

create policy "doc_super_upd_v22" on documentos for update
  using (sou_super_admin() and suporte_pode_editar(restaurante_id))
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id)
              and chave not in ('prefs', 'permissoes', 'precos', 'estoques'));

-- ---------------------------------------------------------------------
-- 3) TRAVAS DE CONFERÊNCIA — falhar alto, e provar as DUAS direções
-- ---------------------------------------------------------------------

-- 3a) nenhuma policy antiga sobreviveu
do $$
declare v_sobrou text;
begin
  select string_agg(policyname, ', ' order by policyname) into v_sobrou
    from pg_policies
   where schemaname = 'public' and tablename = 'documentos'
     and cmd in ('SELECT', 'INSERT', 'UPDATE', 'ALL')
     and policyname::text !~ '_v(20|22)$'
     and policyname <> 'doc_super_v4';   -- leitura do super-admin, intencional
  if v_sobrou is not null then
    raise exception 'M22: policy antiga sobreviveu e anula esta migração (OR de permissivas): %', v_sobrou;
  end if;
end $$;

-- 3b) SONDA POSITIVA — o CHECK precisa ACEITAR um id de instância.
--     O `ALTER` "rodar" não prova nada: se o constraint não pegou, o app grava
--     na fila offline em silêncio e o dono só descobre semanas depois.
do $$
declare v_rid uuid;
begin
  select id into v_rid from restaurantes limit 1;
  if v_rid is null then
    raise notice 'M22: nenhum restaurante para a sonda — testar à mão antes de liberar.';
    return;
  end if;
  begin
    insert into registros (id, restaurante_id, tipo, ts, dados, deleted)
      values ('__m22_sonda__', v_rid, 'seco#zzzz:entrada', 0, '{}'::jsonb, true);
    raise exception 'M22_SONDA_OK';   -- força o rollback da linha de teste
  exception
    when check_violation then
      raise exception 'M22: o CHECK RECUSOU "seco#zzzz:entrada". A migração não pegou — NÃO libere a criação de instâncias.';
    when raise_exception then
      if sqlerrm <> 'M22_SONDA_OK' then raise; end if;
  end;
end $$;

-- 3c) SONDA NEGATIVA — o CHECK precisa RECUSAR a grafia duplicada.
do $$
declare v_rid uuid; v_recusou boolean := false;
begin
  select id into v_rid from restaurantes limit 1;
  if v_rid is null then return; end if;
  begin
    insert into registros (id, restaurante_id, tipo, ts, dados, deleted)
      values ('__m22_sonda2__', v_rid, 'producao:entrada', 0, '{}'::jsonb, true);
  exception when check_violation then v_recusou := true;
  end;
  if not v_recusou then
    raise exception 'M22: o CHECK ACEITOU "producao:entrada" — duas grafias para o mesmo estoque duplicam saldo. Abortando.';
  end if;
end $$;

commit;

-- =====================================================================
--  ÍNDICE: não é preciso índice novo. A migração 6 já criou
--  (restaurante_id, deleted, tipo, ts), que serve exatamente ao filtro
--  `restaurante_id = ? and deleted = false and tipo in (...)`. O que falta é o
--  CLIENTE passar a usar `.in('tipo', ...)` na leitura.
--
--  `documentos` não muda: `chave` é texto livre e a PK (restaurante_id, chave)
--  já comporta 'seco#x7k2::metas'.
--
--  ⚠️ Depois desta, M18/M20 NÃO podem ser re-executadas: as travas delas exigem
--  que toda policy termine em _v18 / _v20 e vão abortar por causa das _v22.
-- =====================================================================
