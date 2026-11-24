-- =====================================================================
--  MIGRAÇÃO 62 — A ADMINISTRAÇÃO COM SENHA (jeito do Magurō, 23/11/2026)
--
--  Pedido do dono: tirar as contas da equipe, os cargos e a matriz de
--  acessos. Fica assim:
--   • um LOGIN DA CASA, em quantos aparelhos quiser (a sessão única saiu no
--     app — não há regra de banco para ela);
--   • os nomes com senha de 2 números (já existiam), que dizem quem fez;
--   • UMA senha da Administração por conta, de 4 a 8 números, que abre a
--     Administração, Meus itens e os relatórios em QUALQUER aparelho — o
--     celular do dono também pede.
--  Imprimir, lançar e reimprimir continuam livres.
--
--  ⚠️ QUEM DECIDE É O BANCO, não a tela. A senha é conferida aqui, e abre a
--  Administração só para a SESSÃO de login daquele aparelho (o claim
--  `session_id` do token): o login da casa é o mesmo em todos os aparelhos, e
--  abrir no celular do dono não pode abrir no tablet da cozinha. Fica aberta
--  por 5 minutos, renovados enquanto alguém mexe (o app fecha com 3 parado).
--
--  ⚠️ E `meu_cargo()` — que dezenas de regras conferem desde a M4 — passa a
--  responder 'diretoria' só com a Administração aberta, e 'cozinha' fechada.
--  Nenhuma regra antiga precisou ser reescrita: todas continuam conferindo o
--  cargo, e o cargo agora segue a senha.
--  O cargo gravado em `perfis` só serve para uma coisa: quem é a CONTA DONA
--  (cargo 'diretoria'), a única que cria a primeira senha ou resolve o
--  "esqueci" — provando que acabou de digitar a senha do LOGIN.
--
--  Aplicar:   node scripts/rodar-migracao.mjs 62
--  Conferir:  node scripts/pentest-administracao.mjs
-- =====================================================================

-- 1) A SENHA, uma por conta. Ninguém lê nem grava direto: só as funções abaixo.
create table if not exists administracao_senha (
  restaurante_id uuid primary key references restaurantes(id) on delete cascade,
  hash           text not null,
  erros          integer not null default 0,
  espera_ate     timestamptz,
  trocada_em     timestamptz not null default now()
);
alter table administracao_senha enable row level security;
revoke all on administracao_senha from anon, authenticated;

-- 2) A ADMINISTRAÇÃO ABERTA — por SESSÃO de login (um aparelho), não por usuário
create table if not exists administracao_aberta (
  usuario        uuid not null,
  sessao         uuid not null,
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  ate            timestamptz not null,
  primary key (usuario, sessao)
);
alter table administracao_aberta enable row level security;
revoke all on administracao_aberta from anon, authenticated;

-- 3) A sessão de quem chama, e se a Administração está aberta para ela
create or replace function sessao_atual()
returns uuid language sql stable set search_path = public as $$
  select nullif(coalesce(auth.jwt() ->> 'session_id', ''), '')::uuid
$$;

create or replace function administracao_liberada()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from administracao_aberta a
     where a.usuario = auth.uid() and a.sessao = sessao_atual() and a.ate > now()
  )
$$;

-- 4) O CARGO EFETIVO. Quem não tem perfil (o super-admin) continua NULL.
create or replace function meu_cargo()
returns text language sql stable security definer set search_path = public as $$
  select case when administracao_liberada() then 'diretoria' else 'cozinha' end
    from perfis where id = auth.uid()
$$;

-- 5) A MATRIZ SAIU: o cadastro de itens e o financeiro pedem a Administração
create or replace function pode_na_conta(p_cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(sou_super_admin(), false) or coalesce(meu_cargo(), '') = 'diretoria'
$$;

create or replace function pode_ver_financeiro()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(sou_super_admin(), false) or coalesce(meu_cargo(), '') = 'diretoria'
$$;

create or replace function pode_ver_perda_em_reais()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(pode_ver_financeiro(), false)
$$;

-- 6) O QUE O APP CHAMA

-- a conta já tem senha? (a tela decide entre "digite" e "crie a primeira")
create or replace function tem_senha_administracao()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from administracao_senha where restaurante_id = meu_restaurante_id())
$$;

-- abrir: confere a senha. A cada 5 erros seguidos, espera — 30 s, 1 min,
-- 2 min... até 10 min. A espera é da CONTA, não do aparelho: trocar de tablet
-- não zera a conta de quem está chutando.
create or replace function abrir_administracao(p_senha text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_rest   uuid := meu_restaurante_id();
  v_sessao uuid := sessao_atual();
  v_s      administracao_senha%rowtype;
  v_ate    timestamptz := now() + interval '5 minutes';
begin
  if auth.uid() is null or v_rest is null then
    return jsonb_build_object('ok', false, 'motivo', 'erro', 'mensagem', 'Entre com o login da casa.');
  end if;
  if v_sessao is null then
    return jsonb_build_object('ok', false, 'motivo', 'erro', 'mensagem', 'Sessão sem identificação. Saia e entre de novo.');
  end if;
  select * into v_s from administracao_senha where restaurante_id = v_rest for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sem_senha');
  end if;
  if v_s.espera_ate is not null and v_s.espera_ate > now() then
    return jsonb_build_object('ok', false, 'motivo', 'espera',
      'segundos', ceil(extract(epoch from v_s.espera_ate - now()))::int);
  end if;
  if p_senha is null or v_s.hash <> crypt(p_senha, v_s.hash) then
    update administracao_senha
       set erros = erros + 1,
           espera_ate = case when (erros + 1) % 5 = 0
             then now() + make_interval(secs => least(600, 30 * power(2, (erros + 1) / 5 - 1)))
             else espera_ate end
     where restaurante_id = v_rest
    returning * into v_s;
    if v_s.erros % 5 = 0 then
      return jsonb_build_object('ok', false, 'motivo', 'espera',
        'segundos', ceil(extract(epoch from v_s.espera_ate - now()))::int);
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'senha', 'restantes', 5 - (v_s.erros % 5));
  end if;
  update administracao_senha set erros = 0, espera_ate = null where restaurante_id = v_rest;
  insert into administracao_aberta (usuario, sessao, restaurante_id, ate)
       values (auth.uid(), v_sessao, v_rest, v_ate)
  on conflict (usuario, sessao) do update set ate = excluded.ate, restaurante_id = excluded.restaurante_id;
  -- faxina: o que venceu há mais de um dia
  delete from administracao_aberta where ate < now() - interval '1 day';
  return jsonb_build_object('ok', true, 'ate', v_ate);
end $$;

-- enquanto alguém mexe, mais 5 minutos (só se ainda estiver aberta)
create or replace function renovar_administracao()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ate timestamptz := now() + interval '5 minutes';
begin
  update administracao_aberta set ate = v_ate
   where usuario = auth.uid() and sessao = sessao_atual() and ate > now();
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'ate', v_ate);
end $$;

-- fechar neste aparelho (o botão do cadeado, os 3 minutos parado)
create or replace function fechar_administracao()
returns void language sql security definer set search_path = public as $$
  delete from administracao_aberta where usuario = auth.uid() and sessao = sessao_atual()
$$;

-- criar ou trocar a senha:
--  • com a Administração aberta (quem sabe a senha atual), ou
--  • a CONTA DONA que acabou de digitar a senha do login — o token novo traz a
--    hora desse login no `amr`. É a primeira senha e o "esqueci a senha".
create or replace function definir_senha_administracao(p_nova text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_rest  uuid := meu_restaurante_id();
  v_dono  boolean;
  v_login boolean;
begin
  if auth.uid() is null or v_rest is null then
    raise exception 'Entre com o login da casa para definir a senha da Administração.';
  end if;
  if p_nova is null or p_nova !~ '^[0-9]{4,8}$' then
    raise exception 'A senha da Administração tem de 4 a 8 números.';
  end if;
  select coalesce(cargo = 'diretoria', false) into v_dono from perfis where id = auth.uid();
  v_login := exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m
     where m ->> 'method' = 'password'
       and coalesce((m ->> 'timestamp')::bigint, 0) >= extract(epoch from now())::bigint - 600);
  if not administracao_liberada() and not (coalesce(v_dono, false) and v_login) then
    raise exception 'Para criar ou trocar a senha da Administração, abra a Administração ou confirme a senha do login da conta dona.';
  end if;
  insert into administracao_senha (restaurante_id, hash)
       values (v_rest, crypt(p_nova, gen_salt('bf', 8)))
  on conflict (restaurante_id) do update
     set hash = excluded.hash, erros = 0, espera_ate = null, trocada_em = now();
  return jsonb_build_object('ok', true);
end $$;

-- 7) QUEM CHAMA O QUÊ (o padrão da M24: nada para anon nem public)
revoke all on function sessao_atual() from public, anon;
revoke all on function administracao_liberada() from public, anon;
revoke all on function tem_senha_administracao() from public, anon;
revoke all on function abrir_administracao(text) from public, anon;
revoke all on function renovar_administracao() from public, anon;
revoke all on function fechar_administracao() from public, anon;
revoke all on function definir_senha_administracao(text) from public, anon;
grant execute on function sessao_atual() to authenticated;
grant execute on function administracao_liberada() to authenticated;
grant execute on function tem_senha_administracao() to authenticated;
grant execute on function abrir_administracao(text) to authenticated;
grant execute on function renovar_administracao() to authenticated;
grant execute on function fechar_administracao() to authenticated;
grant execute on function definir_senha_administracao(text) to authenticated;
-- meu_cargo, pode_na_conta, pode_ver_financeiro e pode_ver_perda_em_reais:
-- `create or replace` mantém as permissões que já tinham (M24).
