-- =====================================================================
--  M57 — LEVEZA (28/09/2026, lote C da análise)
--
--  1) PAINEL SEM N+1: o painel pedia os usuários de CADA cliente numa
--     consulta, em fila (usuarios_do_restaurante × N). Com 50 clientes, 50
--     idas ao banco antes de mostrar a lista. Agora uma só.
--
--  2) ETIQUETAS: SÓ O QUE MUDOU (o mesmo desenho da M53). Cada abertura do
--     plano Etiquetas baixava de novo a janela inteira de 120 dias (até ~2 MB
--     por abertura, ~0,5 GB por mês por cliente — o plano grátis tem 5 GB de
--     tráfego). Agora o aparelho guarda a lista e pede só as linhas mudadas.
--     O carimbo `atualizado_em` passa a vir do BANCO em toda gravação, e há
--     índice para a consulta.
-- =====================================================================

begin;

create or replace function usuarios_de_todos_restaurantes()
returns table (restaurante_id uuid, id uuid, nome text, cargo text, email text, ativo boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas o administrador do sistema consulta e-mails.';
  end if;
  return query
    select p.restaurante_id, p.id, p.nome, p.cargo, u.email::text, coalesce(p.ativo, true)
      from perfis p
      join auth.users u on u.id = p.id
     order by p.restaurante_id, p.cargo, p.nome, p.id; -- ordem única: dá para paginar
end $$;
revoke all on function usuarios_de_todos_restaurantes() from public, anon;
grant execute on function usuarios_de_todos_restaurantes() to authenticated;

create or replace function _etiquetas_atualizado_em()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado_em := clock_timestamp();
  return new;
end $$;
drop trigger if exists trg_etiquetas_atualizado_em on etiquetas;
create trigger trg_etiquetas_atualizado_em before insert or update on etiquetas
  for each row execute function _etiquetas_atualizado_em();

create index if not exists etiquetas_rest_cozinha_atualizado on etiquetas (restaurante_id, cozinha, atualizado_em, id);

do $$
begin
  if not has_function_privilege('authenticated', 'usuarios_de_todos_restaurantes()', 'execute') then
    raise exception 'M57: authenticated sem execute — abortando.';
  end if;
  if has_function_privilege('anon', 'usuarios_de_todos_restaurantes()', 'execute') then
    raise exception 'M57: anon consegue chamar — abortando.';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_etiquetas_atualizado_em' and not tgisinternal) then
    raise exception 'M57: o carimbo das etiquetas não foi criado — abortando.';
  end if;
end $$;

commit;
