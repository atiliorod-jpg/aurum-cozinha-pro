-- =====================================================================
--  M56 — O CATÁLOGO SÓ MUDA COM A PERMISSÃO (28/09/2026)
--
--  Achado da análise de segurança: a matriz de acessos ("Gerenciar itens")
--  valia só na TELA. As policies de `documentos` travavam apenas permissões,
--  estoques e preços — uma conta da cozinha, pelo DevTools, regravava
--  'produtos' com o prazo refrigerado de 30 dias, e a etiqueta seguinte saía
--  com a validade errada colada no pote.
--
--  Agora o banco confere a MESMA regra da tela (utils/permissoes.js → pode):
--  super-admin e diretoria sempre; depois a exceção por conta, o cargo
--  inventado (cargo_rotulo), o cargo, e o padrão (gerência pode, cozinha não).
--  Vale para as listas de itens, categorias e fichas de TODAS as cozinhas e
--  unidades ('produtos', 'seco::produtos', 'producao#ab12::fichas'…).
--
--  E o webhook do Stripe ganha a tabela dos eventos já processados (o Stripe
--  reenvia; cada reenvio somava mais 31 dias).
-- =====================================================================

begin;

create or replace function pode_na_conta(p_cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when coalesce(sou_super_admin(), false) then true
    when coalesce(meu_cargo(), '') = 'diretoria' then true
    when meu_cargo() is null then false
    else coalesce(
      (select (d.dados -> 'porConta' -> auth.uid()::text ->> p_cap)::boolean
         from documentos d
        where d.restaurante_id = meu_restaurante_id() and d.chave = 'permissoes'),
      (select (d.dados -> p.cargo_rotulo ->> p_cap)::boolean
         from documentos d, perfis p
        where p.id = auth.uid() and p.cargo_rotulo is not null and p.cargo_rotulo <> p.cargo
          and d.restaurante_id = meu_restaurante_id() and d.chave = 'permissoes'),
      (select (d.dados -> meu_cargo() ->> p_cap)::boolean
         from documentos d
        where d.restaurante_id = meu_restaurante_id() and d.chave = 'permissoes'),
      -- o padrão de fábrica (PERMISSOES_PADRAO): gerência sim, cozinha não
      case when p_cap in ('gerenciarProdutos', 'configurarSistema') then meu_cargo() = 'gerencia' else false end)
  end
$$;
revoke all on function pode_na_conta(text) from public, anon;
grant execute on function pode_na_conta(text) to authenticated;

-- as mesmas policies da M22/M23, com a trava do catálogo
drop policy if exists "doc_ins_v22" on documentos;
drop policy if exists "doc_ins_v56" on documentos;
create policy "doc_ins_v56" on documentos for insert with check (
  restaurante_id = meu_restaurante_id() and restaurante_pode_escrever(restaurante_id)
  and (chave not like '%permissoes' or meu_cargo() = 'diretoria')
  and (chave not like '%estoques' or meu_cargo() = 'diretoria')
  and (chave not like '%precos' or pode_ver_financeiro())
  and (chave !~ '(^|::)(produtos|categorias|fichas)$' or coalesce(pode_na_conta('gerenciarProdutos'), false))
);

drop policy if exists "doc_upd_v22" on documentos;
drop policy if exists "doc_upd_v56" on documentos;
create policy "doc_upd_v56" on documentos for update
  using (restaurante_id = meu_restaurante_id())
  with check (
    restaurante_id = meu_restaurante_id() and restaurante_pode_escrever(restaurante_id)
    and (chave not like '%permissoes' or meu_cargo() = 'diretoria')
    and (chave not like '%estoques' or meu_cargo() = 'diretoria')
    and (chave not like '%precos' or pode_ver_financeiro())
    and (chave !~ '(^|::)(produtos|categorias|fichas)$' or coalesce(pode_na_conta('gerenciarProdutos'), false))
  );

drop policy if exists "doc_del_v23" on documentos;
drop policy if exists "doc_del_v56" on documentos;
create policy "doc_del_v56" on documentos for delete using (
  restaurante_id = meu_restaurante_id() and restaurante_pode_escrever(restaurante_id)
  and (chave not like '%permissoes' or coalesce(meu_cargo(), '') = 'diretoria')
  and (chave not like '%estoques' or coalesce(meu_cargo(), '') = 'diretoria')
  and (chave not like '%precos' or coalesce(pode_ver_financeiro(), false) is true)
  and (chave !~ '(^|::)(produtos|categorias|fichas)$' or coalesce(pode_na_conta('gerenciarProdutos'), false))
);

-- salvar_documento (security invoker: a policy já barra); a mensagem clara
-- vem daqui — "violates row-level security" não diz nada a ninguém
create or replace function salvar_documento(p_restaurante uuid, p_chave text, p_dados jsonb, p_versao integer)
returns jsonb language plpgsql set search_path = public as $$
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
  -- ⚠️ M56: o cadastro de itens (prazos que vão na etiqueta) só com a permissão
  if p_chave ~ '(^|::)(produtos|categorias|fichas)$' and not coalesce(pode_na_conta('gerenciarProdutos'), false)
     and not coalesce(sou_super_admin(), false) then
    raise exception 'Sem permissão para alterar o cadastro de itens.';
  end if;

  select * into v_atual from documentos
   where restaurante_id = p_restaurante and chave = p_chave for update;

  if not found then
    insert into documentos (restaurante_id, chave, dados, versao, updated_at)
    values (p_restaurante, p_chave, p_dados, 1, now());
    return jsonb_build_object('ok', true, 'versao', 1);
  end if;

  -- versão -1 = replay do offline: força a gravação e sobe o contador.
  -- ⚠️ coalesce + is distinct from: sem isso, p_versao NULL vira "sem trava".
  if coalesce(p_versao, 0) <> -1
     and coalesce(p_versao, 0) is distinct from coalesce(v_atual.versao, 0) then
    return jsonb_build_object('ok', false, 'conflito', true,
                              'versao', v_atual.versao, 'dados', v_atual.dados);
  end if;

  update documentos
     set dados = p_dados, versao = v_atual.versao + 1, updated_at = now()
   where restaurante_id = p_restaurante and chave = p_chave;

  return jsonb_build_object('ok', true, 'versao', v_atual.versao + 1);
end $$;

-- eventos do Stripe já processados (só a função do webhook, com a service role)
create table if not exists stripe_eventos (
  id          text primary key,
  recebido_em timestamptz not null default now()
);
alter table stripe_eventos enable row level security;
revoke all on table stripe_eventos from anon, authenticated;

do $$
begin
  if not has_function_privilege('authenticated', 'salvar_documento(uuid, text, jsonb, integer)', 'execute') then
    raise exception 'M56: salvar_documento perdeu o execute — abortando.';
  end if;
  if (select count(*) from pg_policies where tablename = 'documentos'
       and policyname in ('doc_ins_v56', 'doc_upd_v56', 'doc_del_v56')) <> 3 then
    raise exception 'M56: as policies novas não foram criadas — abortando.';
  end if;
  if exists (select 1 from pg_policies where tablename = 'documentos'
              and policyname in ('doc_ins_v22', 'doc_upd_v22', 'doc_del_v23')) then
    raise exception 'M56: sobrou policy antiga (mais permissiva) — abortando.';
  end if;
end $$;

commit;
