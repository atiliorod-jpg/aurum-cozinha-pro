-- =====================================================================
--  M50 — OS ERROS DOS APARELHOS CHEGAM NO PAINEL (24/09/2026)
--
--  Pedido do dono. Quando uma tela travava no cliente, o erro ficava só no
--  aparelho dele (a BarreiraDeErro guardava no localStorage) e a Aurum só
--  sabia se o cliente reclamasse — o "Sentry" pago foi recusado. Aqui a
--  versão grátis: o app manda cada erro para esta tabela e o painel mostra.
--
--  ⚠️ SÓ O SUPER-ADMIN LÊ (policy de leitura), e ninguém escreve na tabela
--  direto: só `registrar_erro`, que
--   • limita a 30 erros por pessoa por hora (um laço de erro não enche o
--     banco nem a cota do plano grátis);
--   • soma o MESMO erro da mesma pessoa em 10 minutos numa linha só (`vezes`);
--   • corta textos longos;
--   • apaga o que tem mais de 60 dias, de vez em quando.
--  Nada de dado do cliente: mensagem de erro, tela, versão do app e navegador.
-- =====================================================================

begin;

create table if not exists erros_app (
  id             bigserial   primary key,
  criado_em      timestamptz not null default now(),
  visto_em       timestamptz not null default now(),
  restaurante_id uuid        references restaurantes(id) on delete cascade,
  usuario_id     uuid,
  tipo           text        not null check (tipo in ('tela', 'js', 'promessa', 'fila')),
  mensagem       text        not null,
  onde           text,
  tela           text,
  versao         text,
  navegador      text,
  vezes          integer     not null default 1
);
create index if not exists erros_app_quando_idx on erros_app (criado_em desc);
create index if not exists erros_app_usuario_idx on erros_app (usuario_id, criado_em desc);

alter table erros_app enable row level security;
drop policy if exists "erros_app_sel_v50" on erros_app;
create policy "erros_app_sel_v50" on erros_app for select using (coalesce(sou_super_admin(), false));
revoke all on table erros_app from anon;

create or replace function registrar_erro(
  p_tipo      text,
  p_mensagem  text,
  p_onde      text default null,
  p_tela      text default null,
  p_versao    text default null,
  p_navegador text default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  v_msg   text := left(btrim(coalesce(p_mensagem, '')), 500);
  v_tipo  text := case when p_tipo in ('tela', 'js', 'promessa', 'fila') then p_tipo else 'js' end;
  v_id    bigint;
begin
  if uid is null or v_msg = '' then return false; end if;
  -- um laço de erro não enche o banco
  if (select count(*) from erros_app where usuario_id = uid and criado_em > now() - interval '1 hour') >= 30 then
    return false;
  end if;
  -- o mesmo erro da mesma pessoa, de novo em 10 minutos: soma
  select id into v_id from erros_app
   where usuario_id = uid and mensagem = v_msg and tipo = v_tipo and visto_em > now() - interval '10 minutes'
   order by visto_em desc limit 1;
  if v_id is not null then
    update erros_app set vezes = vezes + 1, visto_em = now() where id = v_id;
    return true;
  end if;
  insert into erros_app (restaurante_id, usuario_id, tipo, mensagem, onde, tela, versao, navegador)
  values (meu_restaurante_id(), uid, v_tipo, v_msg, left(p_onde, 800), left(p_tela, 200),
          left(p_versao, 40), left(p_navegador, 300));
  -- limpeza de vez em quando (1 a cada ~50 registros)
  if random() < 0.02 then
    delete from erros_app where criado_em < now() - interval '60 days';
  end if;
  return true;
end $$;

revoke all on function registrar_erro(text, text, text, text, text, text) from public, anon;
grant execute on function registrar_erro(text, text, text, text, text, text) to authenticated;

do $$
begin
  if not has_function_privilege('authenticated', 'registrar_erro(text, text, text, text, text, text)', 'execute') then
    raise exception 'M50: authenticated sem execute em registrar_erro — abortando.';
  end if;
  if has_function_privilege('anon', 'registrar_erro(text, text, text, text, text, text)', 'execute') then
    raise exception 'M50: anon consegue chamar registrar_erro — abortando.';
  end if;
  if exists (select 1 from pg_policies where tablename = 'erros_app' and cmd <> 'SELECT') then
    raise exception 'M50: erros_app ganhou policy de escrita — abortando.';
  end if;
end $$;

commit;
