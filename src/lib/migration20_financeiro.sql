-- =====================================================================
--  MIGRAÇÃO 20 — FINANCEIRO SÓ PARA QUEM PODE, ENFORÇADO NO BANCO
--
--  ⚠️ RODAR ANTES de qualquer tela de preço/custo.
--
--  Por que no banco e não na tela: hoje o isolamento entre módulos é de
--  INTERFACE — as policies filtram só por restaurante_id, e o cliente baixa
--  todos os documentos da conta e filtra em memória. Esconder preço no React
--  não esconderia nada: bastaria o DevTools. O próprio utils/permissoes.js
--  diz isso com todas as letras ("é uma trava de INTERFACE... NÃO é barreira
--  dura"). Custo de insumo é o dado mais sensível de um restaurante — margem,
--  fornecedor, negociação — então ele não pode sair do servidor para quem não
--  tem a permissão.
--
--  Decisão de modelagem: preço NÃO entra no documento `produtos`. Se
--  entrasse, esconder o preço exigiria esconder o catálogo inteiro (que a
--  cozinha precisa ver) — é o mesmo motivo pelo qual a M18 tirou a matriz de
--  permissões de dentro de `prefs`. Preço vive na chave própria `precos`.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) QUEM PODE VER O FINANCEIRO
--
--    Lê a MESMA matriz de permissões que a interface usa (documentos/
--    permissoes), para não existirem duas fontes da verdade que divergem.
--    SECURITY DEFINER porque precisa ler essa linha mesmo para quem não
--    pode lê-la pela policy.
--
--    ⚠️ coalesce em TUDO (lição da M19): `NULL = 'x'` é NULL, `not NULL` é
--    NULL, e `if NULL` não dispara. Uma trava que devolve NULL não é trava.
--    Aqui o padrão é FALSE — negar é o lado seguro do erro.
-- ---------------------------------------------------------------------
create or replace function pode_ver_financeiro()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    -- dono da plataforma e dono do restaurante sempre veem
    when coalesce(sou_super_admin(), false) then true
    when coalesce(meu_cargo(), '') = 'diretoria' then true
    else coalesce(
      (select (d.dados -> meu_cargo() ->> 'verFinanceiro')::boolean
         from documentos d
        where d.restaurante_id = meu_restaurante_id()
          and d.chave = 'permissoes'),
      false)   -- sem matriz, sem cargo, ou chave ausente = NÃO vê
  end
$$;

-- ---------------------------------------------------------------------
-- 2) A LINHA NÃO SAI DO SERVIDOR
--
--    ⚠️ Policies PERMISSIVAS somam por OR (lição da M18): criar a nova sem
--    derrubar doc_sel_v10 não esconderia nada — a antiga continuaria
--    entregando `precos` para todo mundo do restaurante.
-- ---------------------------------------------------------------------
drop policy if exists "doc_sel_v10" on documentos;
drop policy if exists "doc_sel_v20" on documentos;

create policy "doc_sel_v20" on documentos for select
  using (
    restaurante_id = meu_restaurante_id()
    and (chave not like '%precos' or pode_ver_financeiro())
  );

-- `like '%precos'` e não igualdade: quando existirem estoques com namespace
-- ('seco::precos'), a comparação exata deixaria escapar. Mesmo cuidado que a
-- M18 tomou com '%permissoes'.

-- ---------------------------------------------------------------------
-- 3) E NÃO PODE SER ESCRITA POR QUEM NÃO PODE VÊ-LA
--
--    Sem isto, quem não vê preço ainda poderia SOBRESCREVER o documento
--    inteiro (apagando a tabela de custos da casa) sem nunca lê-la.
--    As policies são recriadas MANTENDO a trava de `permissoes` da M18 —
--    CREATE POLICY não acumula, então omitir aqui abriria o que a 18 fechou.
-- ---------------------------------------------------------------------
drop policy if exists "doc_ins_v18" on documentos;
drop policy if exists "doc_upd_v18" on documentos;
drop policy if exists "doc_ins_v20" on documentos;
drop policy if exists "doc_upd_v20" on documentos;

create policy "doc_ins_v20" on documentos for insert
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and (chave not like '%permissoes' or meu_cargo() = 'diretoria')
    and (chave not like '%precos' or pode_ver_financeiro())
  );

create policy "doc_upd_v20" on documentos for update
  using (restaurante_id = meu_restaurante_id())
  with check (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and (chave not like '%permissoes' or meu_cargo() = 'diretoria')
    and (chave not like '%precos' or pode_ver_financeiro())
  );

-- salvar_documento é SECURITY INVOKER e herda as policies acima. Reforço
-- explícito para a mensagem de erro ser legível em vez de "violates RLS".
-- ⚠️ CREATE OR REPLACE troca o CORPO INTEIRO: tudo o que a M18/M19 faziam
-- (trava de permissoes com `is distinct from`, versão -1 do replay offline,
-- retorno de conflito) está reproduzido aqui de propósito.
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

-- O super-admin em modo suporte não mexe em preço do cliente: é dado
-- comercial (margem, fornecedor, negociação), não configuração de sistema.
drop policy if exists "doc_super_ins_v18" on documentos;
drop policy if exists "doc_super_upd_v18" on documentos;

create policy "doc_super_ins_v20" on documentos for insert
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id)
              and chave not in ('prefs', 'permissoes', 'precos'));

create policy "doc_super_upd_v20" on documentos for update
  using (sou_super_admin() and suporte_pode_editar(restaurante_id))
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id)
              and chave not in ('prefs', 'permissoes', 'precos'));

-- ---------------------------------------------------------------------
-- 4) TRAVAS DE CONFERÊNCIA — falhar alto (espírito da M18/M19)
-- ---------------------------------------------------------------------

-- 4a) a função existe e NUNCA devolve NULL
do $$
declare v boolean;
begin
  select pode_ver_financeiro() into v;
  if v is null then
    raise exception 'M20: pode_ver_financeiro() devolveu NULL — trava que devolve NULL não trava (ver M19).';
  end if;
end $$;

-- 4b) a policy antiga não sobreviveu. Se doc_sel_v10 continuasse viva, o OR
--     de policies permissivas entregaria `precos` para todo mundo e esta
--     migração inteira viraria enfeite.
do $$
declare v_sobrou text;
begin
  select string_agg(policyname, ', ' order by policyname) into v_sobrou
    from pg_policies
   where schemaname = 'public' and tablename = 'documentos'
     and cmd in ('SELECT', 'INSERT', 'UPDATE', 'ALL')
     and policyname::text !~ '_v(19|20)$'
     and policyname <> 'doc_super_v4';   -- leitura do super-admin, intencional
  if v_sobrou is not null then
    raise exception 'M20: policy antiga sobreviveu e anula esta migração (OR de permissivas): %', v_sobrou;
  end if;
end $$;

commit;

-- =====================================================================
--  Conferência depois de rodar, com um usuário COZINHA logado:
--    select * from documentos where chave like '%precos';   -- 0 linhas
--    select salvar_documento(meu_restaurante_id(),'precos','{}'::jsonb,0);
--      -- deve falhar com 'Sem permissão para alterar preços e custos.'
--  E como DIRETORIA: as duas coisas funcionam.
--
--  ⚠️ Depois desta, a M18 NÃO pode ser re-executada: a trava dela exige que
--  toda policy termine em _v18 e vai abortar por causa das _v20.
-- =====================================================================
