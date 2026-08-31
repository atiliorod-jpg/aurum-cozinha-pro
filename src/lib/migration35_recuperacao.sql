-- =====================================================================
--  M35 — recuperar senha passa a exigir e-mail + CNPJ, e só para o dono
--
--  Hoje basta saber o e-mail de alguém para disparar um link de nova senha
--  naquela caixa. Não é falha grave (o link vai para o e-mail da própria
--  pessoa), mas é ruído que dá para eliminar: com o CNPJ junto, quem não é da
--  casa não consegue nem incomodar.
--
--  ⚠️ E SÓ A CONTA DONA. As contas de equipe entram com `maria.polobeer` e um
--  endereço interno que NÃO TEM CAIXA DE ENTRADA — link de recuperação para
--  elas nunca chegaria a lugar nenhum. Quem troca a senha delas é o dono, em
--  Administração → Contas da equipe. A função devolve `false` para elas, e a
--  tela explica o caminho em vez de mandar a pessoa esperar um e-mail que não
--  vem.
--
--  ⚠️ ESTA FUNÇÃO É ALCANÇÁVEL SEM LOGIN, e tem que ser: quem esqueceu a senha
--  não está logado. É a exceção deliberada à regra de negar tudo para `anon`
--  (M24/M26). Por isso ela devolve APENAS true/false — nunca o nome do
--  restaurante, o cargo ou se o e-mail existe — e tem trava de tentativas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Trava de tentativas
--
--    ⚠️ Sem ela, exigir CNPJ vira convite para varredura: CNPJ é público, e um
--    script testaria milhares contra um e-mail conhecido. Cinco por quarto de
--    hora não atrapalha quem errou a digitação e mata a varredura.
-- ---------------------------------------------------------------------
create table if not exists recuperacao_tentativas (
  id       bigserial primary key,
  email    text not null,
  quando   timestamptz not null default now()
);
alter table recuperacao_tentativas enable row level security;
-- sem policy: só a função abaixo escreve aqui.

create index if not exists idx_rec_tent on recuperacao_tentativas (lower(email), quando desc);

-- ---------------------------------------------------------------------
-- 2) A verificação
-- ---------------------------------------------------------------------
create or replace function recuperacao_permitida(p_email text, p_cnpj text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_cnpj  text;
  v_n     integer;
  v_ok    boolean;
begin
  v_email := lower(btrim(coalesce(p_email, '')));
  v_cnpj  := regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
  if v_email = '' or length(v_cnpj) <> 14 then
    return false;
  end if;

  select count(*) into v_n from recuperacao_tentativas
    where lower(email) = v_email and quando > now() - interval '15 minutes';
  if v_n >= 5 then
    -- ⚠️ Erro, não `false`: a tela precisa dizer "espere um pouco". Um `false`
    -- aqui viraria "e-mail e CNPJ não conferem", e a pessoa passaria a tarde
    -- conferindo dados que estavam certos.
    raise exception 'Muitas tentativas. Espere 15 minutos e tente de novo.';
  end if;
  insert into recuperacao_tentativas (email) values (v_email);

  -- Limpeza oportunista: sem isto a tabela cresce para sempre por causa de um
  -- controle que só olha os últimos 15 minutos.
  delete from recuperacao_tentativas where quando < now() - interval '1 day';

  select exists (
    select 1
      from auth.users u
      join perfis p        on p.id = u.id
      join restaurantes r  on r.id = p.restaurante_id
     where lower(u.email) = v_email
       and coalesce(p.ativo, true) = true
       -- só a conta dona: as de equipe não têm caixa de entrada
       and p.cargo = 'diretoria'
       and regexp_replace(coalesce(r.cnpj, ''), '[^0-9]', '', 'g') = v_cnpj
  ) into v_ok;

  return coalesce(v_ok, false);
end $$;

-- ⚠️ ANON DE PROPÓSITO. Quem esqueceu a senha não tem sessão. A função devolve
-- só true/false e é limitada por tentativa — é o mínimo que o caso exige.
grant execute on function recuperacao_permitida(text, text) to anon;
grant execute on function recuperacao_permitida(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) SONDAS
-- ---------------------------------------------------------------------
do $$
declare
  v_rest uuid := gen_random_uuid();
  v_ok   boolean;
begin
  -- (a) a tabela de tentativas não pode ser lida por ninguém de fora
  if exists (select 1 from pg_policies where tablename = 'recuperacao_tentativas') then
    raise exception 'M35: apareceu policy em recuperacao_tentativas. Abortando.';
  end if;

  -- (b) alcance: anon precisa; e não pode ter ganhado nada além disso
  if not has_function_privilege('anon', 'recuperacao_permitida(text,text)', 'EXECUTE') then
    raise exception 'M35: anon sem EXECUTE em recuperacao_permitida — recuperar senha nasceria quebrado. Abortando.';
  end if;

  -- (c) LIXO É RECUSADO. "Escrevi a validação" não é o mesmo que "ela recusa".
  select recuperacao_permitida('', '') into v_ok;
  if v_ok is not false then raise exception 'M35: vazio foi aceito. Abortando.'; end if;
  select recuperacao_permitida('ninguem@exemplo.com', '11111111111111') into v_ok;
  if v_ok is not false then raise exception 'M35: e-mail inexistente foi aceito. Abortando.'; end if;
  select recuperacao_permitida('ninguem@exemplo.com', '123') into v_ok;
  if v_ok is not false then raise exception 'M35: CNPJ curto foi aceito. Abortando.'; end if;

  -- (d) E A TRAVA DE TENTATIVAS DISPARA MESMO. Sem esta sonda, exigir CNPJ
  --     daria falsa sensação de segurança: dá para varrer CNPJ à vontade.
  begin
    for i in 1..8 loop
      perform recuperacao_permitida('sonda.m35@exemplo.com', '11111111111111');
    end loop;
    raise exception 'M35: a trava de tentativas nao disparou em 8 chamadas. Abortando.';
  exception when others then
    if sqlerrm like 'M35:%' then raise; end if;
    null; -- a recusa esperada
  end;

  delete from recuperacao_tentativas where email like '%exemplo.com';
  perform v_rest;
end $$;
