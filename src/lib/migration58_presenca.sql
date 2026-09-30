-- =====================================================================
--  M58 — QUEM ESTÁ USANDO AGORA (30/09/2026, pedido do dono)
--
--  O painel só sabia o "último acesso" (o último LOGIN, que pode ter semanas
--  com a sessão ainda viva) e a "última gravação". Nenhum dos dois responde
--  "tem alguém com o app aberto neste momento?".
--
--  Desenho: cada aparelho dá um SINAL a cada 2 minutos enquanto o app está
--  aberto e visível. Uma linha por USUÁRIO (não por sinal): a tabela não
--  cresce com o uso, só com o número de contas. O painel lê quem deu sinal
--  nos últimos 5 minutos.
--
--  ⚠️ POR QUE NÃO O "PRESENCE" DO REALTIME. Ele não grava nada, mas segura
--  uma conexão aberta por aparelho (o plano grátis tem 200) e não guarda o
--  "visto por último" — que é metade do que o painel quer mostrar.
--
--  ⚠️ SEM POLICY: a tabela só é tocada pelas duas funções abaixo. O cliente
--  não lê a presença de ninguém, nem a própria.
-- =====================================================================

begin;

create table if not exists presenca (
  usuario_id     uuid primary key references auth.users(id) on delete cascade,
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  visto_em       timestamptz not null default now(),
  aparelho       text check (aparelho is null or aparelho in ('celular', 'computador'))
);
create index if not exists presenca_rest_visto on presenca (restaurante_id, visto_em);
alter table presenca enable row level security;
revoke all on presenca from anon, authenticated;

-- ---------------------------------------------------------------------
-- O sinal do aparelho.
--
-- ⚠️ A Aurum não conta: nem a conta do super-admin, nem o modo suporte (que
-- o app nem chama). Senão "em uso agora" acenderia toda vez que o dono
-- abrisse o painel.
--
-- ⚠️ FREIO DE 45 s no próprio banco: chamada repetida não vira gravação.
-- O app manda a cada 2 min; isto segura aba duplicada e laço por engano.
-- ---------------------------------------------------------------------
create or replace function marcar_presenca(p_aparelho text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  ap  text := case when p_aparelho in ('celular', 'computador') then p_aparelho else null end;
begin
  if uid is null or uid = '318071c2-49c0-41d0-89aa-235f0672e1ad'::uuid then return; end if;
  rid := meu_restaurante_id();
  if rid is null then return; end if;
  insert into presenca as p (usuario_id, restaurante_id, visto_em, aparelho)
  values (uid, rid, now(), ap)
  on conflict (usuario_id) do update
     set visto_em = now(), restaurante_id = excluded.restaurante_id, aparelho = excluded.aparelho
   where p.visto_em < now() - interval '45 seconds';
end $$;
revoke all on function marcar_presenca(text) from public, anon;
grant execute on function marcar_presenca(text) to authenticated;

-- ---------------------------------------------------------------------
-- O painel: uma linha por restaurante que já deu sinal alguma vez.
--   agora  → quantas pessoas deram sinal nos últimos 5 minutos
--   quem   → os nomes delas
--   ultimo → o sinal mais recente da conta (para o "visto há X")
-- ---------------------------------------------------------------------
create or replace function presenca_dos_restaurantes()
returns table (restaurante_id uuid, agora integer, quem text[], ultimo timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  -- ⚠️ `coalesce` antes de negar: trava que devolve NULL não trava (M19).
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema consulta a presença.';
  end if;
  return query
    select pr.restaurante_id,
           count(*) filter (where pr.visto_em > now() - interval '5 minutes')::integer,
           coalesce(array_agg(coalesce(nullif(pf.nome, ''), 'sem nome') order by pf.nome)
                      filter (where pr.visto_em > now() - interval '5 minutes'), '{}'),
           max(pr.visto_em)
      from presenca pr
      left join perfis pf on pf.id = pr.usuario_id
     group by pr.restaurante_id;
end $$;
revoke all on function presenca_dos_restaurantes() from public, anon;
grant execute on function presenca_dos_restaurantes() to authenticated;

do $$
begin
  if not has_function_privilege('authenticated', 'marcar_presenca(text)', 'execute')
     or not has_function_privilege('authenticated', 'presenca_dos_restaurantes()', 'execute') then
    raise exception 'M58: authenticated sem execute — abortando.';
  end if;
  if has_function_privilege('anon', 'marcar_presenca(text)', 'execute')
     or has_function_privilege('anon', 'presenca_dos_restaurantes()', 'execute') then
    raise exception 'M58: anon consegue chamar — abortando.';
  end if;
  if has_table_privilege('authenticated', 'presenca', 'select') or has_table_privilege('anon', 'presenca', 'select') then
    raise exception 'M58: a tabela presenca está legível pelo cliente — abortando.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'presenca'::regclass) then
    raise exception 'M58: presenca sem RLS — abortando.';
  end if;
end $$;

commit;
