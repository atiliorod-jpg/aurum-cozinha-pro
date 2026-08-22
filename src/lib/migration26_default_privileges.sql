-- =====================================================================
--  MIGRAÇÃO 26 — O DENY-BY-DEFAULT DA M24 NÃO ERA DEFAULT
--
--  ⚠️ Esta migração conserta um defeito da migração 24, escrita nesta mesma
--  sessão. Vale registrar o erro por inteiro, porque a classe dele se repete.
--
--  A M24 fez `revoke execute on all functions in schema public from anon`.
--  Isso limpa o que EXISTE no instante em que roda — e só isso. O Supabase
--  mantém DEFAULT PRIVILEGES no schema `public` concedendo EXECUTE a `anon`
--  em toda função NOVA:
--
--    pg_default_acl → dono=postgres, schema=public, tipo=f
--    postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | ...
--
--  Resultado: a M24 fechou as 30 funções existentes, e a PRIMEIRA função
--  criada depois dela (`registrar_acesso_suporte`, da M25) já nasceu chamável
--  sem login. Descobri isso conferindo a M25 contra o banco, não lendo o
--  arquivo — que é exatamente o motivo de conferir contra o banco.
--
--  A lição é a mesma da M10 com o token de convite: `alter column ... set
--  default` mudou o DEFAULT e não tocou nas linhas existentes; aqui o `revoke`
--  tocou nas existentes e não mudou o default. Os dois lados precisam ser
--  ditos explicitamente, sempre.
--
--  ⚠️ RODAR DEPOIS da 25.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) A função que vazou pelo buraco (criada na M25, depois do revoke da M24)
-- ---------------------------------------------------------------------
revoke execute on function registrar_acesso_suporte(uuid, text) from anon, public;

-- ---------------------------------------------------------------------
-- 2) O DEFAULT em si — para função nova não nascer aberta
--
--    `alter default privileges` sozinho NÃO resolve, e eu conferi isso no
--    banco: mesmo depois de revogar `anon` e `public` do default do `postgres`
--    (o dono de todas as funções do projeto), uma função criada em seguida
--    ainda nascia com `=X/postgres` na ACL — a concessão embutida do Postgres
--    para PUBLIC. Mantenho o ALTER porque ele é correto e barato, mas ele é
--    insuficiente sozinho.
--
--    O que de fato fecha é o EVENT TRIGGER abaixo: a cada CREATE/ALTER
--    FUNCTION em `public`, ele revoga EXECUTE de anon e de PUBLIC. Testado:
--    função nova passa a nascer com `postgres | authenticated | service_role`,
--    anon fora e `authenticated` preservado — se o authenticated caísse junto,
--    o app inteiro parava.
-- ---------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, public;

do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public
             revoke execute on functions from anon, public';
exception when insufficient_privilege or undefined_object then
  raise notice 'default privileges de supabase_admin nao alteraveis — o event trigger cobre';
end $$;

create or replace function _fecha_funcao_nova()
returns event_trigger
language plpgsql
as $f$
declare r record;
begin
  for r in select * from pg_event_trigger_ddl_commands()
           where command_tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
             and schema_name = 'public'
  loop
    -- ⚠️ Só anon e PUBLIC. `authenticated` PRECISA continuar com EXECUTE:
    -- os helpers de RLS são avaliados como o usuário que chama, e sem eles
    -- toda leitura e escrita do app quebra com "permission denied".
    execute format('revoke execute on function %s from anon, public', r.object_identity);
  end loop;
end $f$;

drop event trigger if exists trg_fecha_funcao_nova;
create event trigger trg_fecha_funcao_nova on ddl_command_end
  when tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
  execute function _fecha_funcao_nova();

commit;

-- =====================================================================
--  CONFERÊNCIA — a segunda é a que importa, porque é a que a M24 não fez
--
--  1) só `convite_valido` continua ao alcance do anônimo:
--     select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public' and has_function_privilege('anon', p.oid, 'EXECUTE');
--     → só 'convite_valido'
--
--  2) o DEFAULT parou de conceder a anon (é isto que impede a recaída):
--     select array_to_string(d.defaclacl::text[], ' | ')
--       from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
--      where d.defaclobjtype = 'f' and n.nspname = 'public'
--        and pg_get_userbyid(d.defaclrole) = 'postgres';
--     → NÃO deve conter 'anon=X'
--
--  3) prova prática — a que importa, porque a 2 sozinha me enganou:
--     create function _teste_default() returns int language sql as 'select 1';
--     select has_function_privilege('anon', '_teste_default()', 'EXECUTE');        → f
--     select has_function_privilege('authenticated','_teste_default()','EXECUTE'); → t
--     drop function _teste_default();
--
--  4) o event trigger está de pé:
--     select evtname, evtenabled from pg_event_trigger
--      where evtname = 'trg_fecha_funcao_nova';
--     → uma linha, evtenabled = 'O'
--
--  ⚠️ O `auditar-supabase.mjs` passou a conferir isso a cada rodada: se uma RPC
--  nova aparecer ao alcance do anônimo, ele falha. Era o único jeito de a
--  recaída não passar despercebida — a plataforma reconcede por padrão.
-- =====================================================================
