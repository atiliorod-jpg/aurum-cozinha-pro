-- =====================================================================
--  AURUM COZINHA PRO — Migração 15: canal de feedback (bug/sugestão)
--  Cole INTEIRO no Supabase → SQL Editor → New query → Run.
--  Rode DEPOIS das migrações 4–14. É seguro rodar mais de uma vez.
--
--  As mensagens de bug/sugestão do cliente param de ir pro WhatsApp e passam
--  a cair na aba do super-admin. Tabela sem policy de client (acesso só via
--  RPCs SECURITY DEFINER): o cliente só ENVIA; só o super-admin LÊ/gerencia.
-- =====================================================================
create table if not exists feedback (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid references restaurantes(id) on delete set null,
  usuario_id     uuid,
  tipo           text not null check (tipo in ('bug','sugestao')),
  dados          jsonb not null default '{}',
  contexto       text,
  status         text not null default 'novo' check (status in ('novo','visto','resolvido')),
  created_at     timestamptz not null default now()
);
alter table feedback enable row level security;
-- sem NENHUMA policy: todo acesso é pelas RPCs abaixo.

-- Cliente envia (funciona mesmo com plano vencido — é suporte).
create or replace function enviar_feedback(p_tipo text, p_dados jsonb, p_contexto text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_tipo not in ('bug','sugestao') then raise exception 'Tipo inválido.'; end if;
  insert into feedback (restaurante_id, usuario_id, tipo, dados, contexto)
    values (meu_restaurante_id(), auth.uid(), p_tipo, coalesce(p_dados, '{}'::jsonb), p_contexto);
  return true;
end $$;

-- Super-admin lê tudo (com nome do restaurante e de quem enviou).
create or replace function feedback_todos()
returns table (id uuid, restaurante_id uuid, restaurante_nome text, usuario_nome text,
               tipo text, dados jsonb, contexto text, status text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then raise exception 'Apenas o administrador do sistema vê o feedback.'; end if;
  return query
    select f.id, f.restaurante_id, r.nome, p.nome, f.tipo, f.dados, f.contexto, f.status, f.created_at
    from feedback f
    left join restaurantes r on r.id = f.restaurante_id
    left join perfis p on p.id = f.usuario_id
    order by (f.status = 'resolvido'), f.created_at desc;
end $$;

-- Super-admin marca como visto/resolvido.
create or replace function marcar_feedback(p_id uuid, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then raise exception 'Apenas o administrador do sistema altera o feedback.'; end if;
  if p_status not in ('novo','visto','resolvido') then raise exception 'Status inválido.'; end if;
  update feedback set status = p_status where id = p_id;
  return true;
end $$;

-- =====================================================================
--  PRONTO. Teste: enviar_feedback('sugestao','{"ideia":"x"}') como cliente,
--  feedback_todos() como super-admin (deve listar), como cliente deve falhar.
-- =====================================================================
