-- =====================================================================
--  M36 — o painel passa a ver o USO da conta
--
--  Hoje o painel mostra o que a Aurum vendeu (plano, produto, vencimento) e
--  não mostra nada do que o cliente FAZ. Na hora de renovar, de socorrer ou
--  de decidir se vale insistir num contato, as perguntas são sempre as
--  mesmas: entrou quando pela última vez? Chegou a cadastrar item? Imprimiu
--  etiqueta? Sem isso o suporte liga no escuro e o dono renova no escuro.
--
--  ⚠️ NÚMEROS, NUNCA CONTEÚDO. A função devolve contagens e datas — não o
--  catálogo, não o preço de nada, não o que foi impresso. Ver o conteúdo do
--  cliente continua sendo o modo suporte, que ele autoriza e que fica
--  gravado na trilha dele (M25). Um painel que lê dado de cliente sem
--  autorização é exatamente o que aquela trilha existe para impedir.
--
--  ⚠️ FUNÇÃO NOVA, não `create or replace` em usuarios_do_restaurante: trocar
--  a tabela de retorno de uma função existente dá 42P13 e exigiria DROP —
--  e com o DROP a versão antiga fica sem grant no meio do deploy.
-- =====================================================================

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
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema consulta o uso.';
  end if;

  return query
  select
    (select max(u.last_sign_in_at) from auth.users u
       join perfis p on p.id = u.id
      where p.restaurante_id = p_restaurante),

    (select count(*)::integer from perfis p where p.restaurante_id = p_restaurante),

    (select count(*)::integer from perfis p
      where p.restaurante_id = p_restaurante and coalesce(p.ativo, true)),

    -- ⚠️ `chave like '%produtos'`, não `= 'produtos'`: as chaves são
    -- namespeadas por módulo ('seco::produtos'), então a igualdade contava
    -- só a cozinha de produção e uma casa inteira aparecia com zero item.
    -- jsonb_array_length rebenta em documento que não seja array — daí o
    -- filtro por jsonb_typeof.
    (select coalesce(sum(jsonb_array_length(d.dados)), 0)::integer
       from documentos d
      where d.restaurante_id = p_restaurante
        and d.chave like '%produtos'
        and jsonb_typeof(d.dados) = 'array'),

    (select coalesce(sum(jsonb_array_length(d.dados)), 0)::integer
       from documentos d
      where d.restaurante_id = p_restaurante
        and d.chave like '%etiquetasImpressas'
        and jsonb_typeof(d.dados) = 'array'),

    (select count(*)::integer from registros r where r.restaurante_id = p_restaurante),

    (select max(d.updated_at) from documentos d where d.restaurante_id = p_restaurante);
end $$;

revoke all on function uso_do_restaurante(uuid) from public, anon;
grant execute on function uso_do_restaurante(uuid) to authenticated;

-- =====================================================================
--  Teste rápido:
--    • logado como super-admin: select * from uso_do_restaurante('<rid>');
--      devolve uma linha com as contagens.
--    • logado como cliente: a mesma chamada levanta exceção.
-- =====================================================================
