-- =====================================================================
--  AURUM COZINHA PRO — Migração 10: HARDENING (auditoria de segurança 17/07/2026)
--  Cole INTEIRO no Supabase → SQL Editor → New query → Run.
--  Rode DEPOIS das migrações 4–9. É seguro rodar mais de uma vez.
--
--  S1) P0 — fecha o INSERT direto em perfis: a policy antiga validava só
--      id = auth.uid(), permitindo a qualquer conta autenticada se inserir
--      no restaurante de OUTRO cliente (até como diretoria) via API.
--      O onboarding legítimo já é 100% RPC (criar_restaurante/aceitar_convite).
--  S2) P1 — notas internas do admin saem de restaurantes (o dono conseguia
--      lê-las via ?select=notas_admin) para a tabela admin_notas SEM policy
--      de cliente; leitura/escrita só por RPC de super-admin.
--  S3) P1 — corte de plano/bloqueio passa a valer também no BANCO:
--      leitura continua ok (dados históricos), escrita em registros e
--      documentos exige teste vigente OU assinatura ativa E não-bloqueado.
--  S4) P2 — token de convite dobra de tamanho (8 → 16 hex); tokens antigos
--      pendentes continuam válidos até expirar/usar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- S1) PERFIS — sem policy de INSERT para o client.
--     Sem policy = nenhum INSERT via API; só as RPCs SECURITY DEFINER
--     (criar_restaurante, aceitar_convite) inserem perfis.
-- ---------------------------------------------------------------------
drop policy if exists "perfis_insert" on perfis;
drop policy if exists "perfis_ins_v4" on perfis;

-- ---------------------------------------------------------------------
-- S2) NOTAS INTERNAS — tabela própria, invisível ao cliente.
-- ---------------------------------------------------------------------
create table if not exists admin_notas (
  restaurante_id uuid primary key references restaurantes(id) on delete cascade,
  notas          text,
  updated_at     timestamptz not null default now()
);
alter table admin_notas enable row level security;
-- Sem NENHUMA policy: nem select, nem insert. Todo acesso é via as RPCs
-- abaixo (SECURITY DEFINER + trava sou_super_admin()).

-- migra notas já escritas na coluna antiga (migration9), se houver
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'restaurantes' and column_name = 'notas_admin') then
    insert into admin_notas (restaurante_id, notas)
      select id, notas_admin from restaurantes
      where notas_admin is not null and btrim(notas_admin) <> ''
      on conflict (restaurante_id) do update set notas = excluded.notas, updated_at = now();
    alter table restaurantes drop column notas_admin;
  end if;
end $$;

create or replace function salvar_notas_admin(p_restaurante uuid, p_notas text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema edita notas.';
  end if;
  if not exists (select 1 from restaurantes where id = p_restaurante) then
    raise exception 'Restaurante não encontrado.';
  end if;
  insert into admin_notas (restaurante_id, notas, updated_at)
    values (p_restaurante, p_notas, now())
    on conflict (restaurante_id) do update set notas = excluded.notas, updated_at = now();
  return true;
end $$;

-- todas as notas de uma vez (evita 1 chamada por restaurante no painel)
create or replace function notas_admin_todas()
returns table (restaurante_id uuid, notas text)
language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema consulta notas.';
  end if;
  return query select a.restaurante_id, a.notas from admin_notas a;
end $$;

-- ---------------------------------------------------------------------
-- S3) PLANO/BLOQUEIO NO BANCO — escrita condicionada.
--     Mesmas regras do client (utils/assinatura.js): bloqueado → não;
--     assinatura vigente OU dentro dos 7 dias de teste → sim.
--     Leitura NÃO muda (cliente vencido continua vendo os dados).
--     Modo suporte NÃO passa por aqui: as policies *_super_v7 continuam
--     exigindo suporte_pode_editar (autorização 24h do cliente).
-- ---------------------------------------------------------------------
create or replace function restaurante_pode_escrever(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurantes r
    where r.id = rid
      and coalesce(r.bloqueado, false) = false
      and (coalesce(r.assinatura_ate, 'epoch'::timestamptz) > now()
           or r.created_at + interval '7 days' > now())
  );
$$;

-- REGISTROS: recria as policies de escrita do tenant com o corte de plano.
-- (reg_sel_v4 e as *_super_v7 do suporte ficam como estão.)
drop policy if exists "reg_ins_v4"  on registros;
drop policy if exists "reg_upd_v4"  on registros;
drop policy if exists "reg_del_v4"  on registros;
drop policy if exists "reg_ins_v10" on registros;
drop policy if exists "reg_upd_v10" on registros;
drop policy if exists "reg_del_v10" on registros;

create policy "reg_ins_v10" on registros for insert
  with check (restaurante_id = meu_restaurante_id()
              and restaurante_pode_escrever(restaurante_id));
create policy "reg_upd_v10" on registros for update
  using (restaurante_id = meu_restaurante_id() and tipo <> 'auditoria')
  with check (restaurante_id = meu_restaurante_id()
              and restaurante_pode_escrever(restaurante_id));
create policy "reg_del_v10" on registros for delete
  using (restaurante_id = meu_restaurante_id() and tipo <> 'auditoria'
         and restaurante_pode_escrever(restaurante_id));

-- DOCUMENTOS: separa leitura (livre para o tenant) de escrita (condicionada).
-- A doc_rw_v4 era FOR ALL — substituída por 4 policies.
drop policy if exists "doc_rw_v4"   on documentos;
drop policy if exists "doc_sel_v10" on documentos;
drop policy if exists "doc_ins_v10" on documentos;
drop policy if exists "doc_upd_v10" on documentos;
drop policy if exists "doc_del_v10" on documentos;

create policy "doc_sel_v10" on documentos for select
  using (restaurante_id = meu_restaurante_id());
create policy "doc_ins_v10" on documentos for insert
  with check (restaurante_id = meu_restaurante_id()
              and restaurante_pode_escrever(restaurante_id));
create policy "doc_upd_v10" on documentos for update
  using (restaurante_id = meu_restaurante_id())
  with check (restaurante_id = meu_restaurante_id()
              and restaurante_pode_escrever(restaurante_id));
create policy "doc_del_v10" on documentos for delete
  using (restaurante_id = meu_restaurante_id()
         and restaurante_pode_escrever(restaurante_id));

-- ---------------------------------------------------------------------
-- S4) TOKEN DE CONVITE — 16 caracteres hex (era 8).
--     Convites já emitidos continuam valendo até expirar/usar.
-- ---------------------------------------------------------------------
alter table convites alter column token set default encode(gen_random_bytes(8), 'hex');

-- =====================================================================
--  PRONTO. Checagens rápidas:
--    select polname, cmd from pg_policies where tablename = 'perfis';
--      → NENHUMA linha com cmd = 'INSERT'
--    select notas_admin from restaurantes;  → erro (coluna não existe)
--    novo convite → token com 16 caracteres
--  Pentest completo: ver checklist no README (migração 10).
-- =====================================================================
