-- =====================================================================
--  M33 — contas de colaborador criadas pelo dono
--
--  Hoje a única forma de alguém entrar é o dono gerar um código, a pessoa se
--  cadastrar sozinha com um e-mail próprio e escolher a própria senha. Numa
--  cozinha isso trava em dois lugares: nem todo cozinheiro tem (ou lembra) um
--  e-mail, e o dono não tem controle nenhum sobre a conta depois de criada.
--
--  A partir daqui o dono cria a conta, entrega o acesso e continua no comando:
--  troca a senha, bloqueia, muda o cargo.
--
--  ⚠️ ESTA MIGRAÇÃO NÃO CRIA USUÁRIO. Criar conta de outra pessoa exige a
--  chave de administrador do Supabase, que não pode existir no navegador —
--  estaria no aparelho de qualquer um que abrisse o app. Quem cria é uma
--  função hospedada no próprio Supabase (edge function `contas`), com a chave
--  guardada nos segredos do projeto. Aqui ficam só as COLUNAS e as regras que
--  aquela função e o app precisam.
--
--  ⚠️ E NÃO MEXE NOS TRÊS CARGOS. `cozinha`, `gerencia` e `diretoria` estão
--  numa trava da tabela e em mais de cem verificações das regras de acesso —
--  são os NÍVEIS de segurança, não rótulos. O dono ganha nomes livres por
--  cima: cada cargo que ele inventa se apoia num dos três, e o que vai na
--  coluna `cargo` continua sendo o nível. Mexer nisso seria reescrever
--  justamente o código que impede um cozinheiro de virar diretor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) O apelido da casa — a segunda metade do login
--
--    O login é `maria.polobeer`: o usuário e o apelido do restaurante. Sem o
--    apelido, duas "maria" de casas diferentes colidiriam — e a primeira a
--    existir tomaria o nome para sempre.
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists apelido text;

-- ⚠️ Índice PARCIAL: restaurante sem apelido ainda é a maioria, e um índice
-- único comum trataria todos os NULL como... na verdade o Postgres já permite
-- vários NULL, mas o parcial deixa a intenção explícita e não indexa o vazio.
create unique index if not exists idx_rest_apelido on restaurantes (lower(apelido))
  where apelido is not null;

create or replace function definir_apelido(p_apelido text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  v_rid uuid;
  v_ap  text;
begin
  v_rid := meu_restaurante_id();
  if v_rid is null then raise exception 'Sem restaurante ativo.'; end if;
  -- ⚠️ coalesce antes de comparar: meu_cargo() nulo faria a trava não entrar
  -- no ramo e passar batido (a lição que custou nove funções na M23).
  if coalesce(meu_cargo(), '') <> 'diretoria' and not coalesce(sou_super_admin(), false) then
    raise exception 'Apenas a conta dona define o apelido da casa.';
  end if;

  -- Só letras e números, minúsculo: o apelido entra no login e num endereço
  -- interno. Acento, espaço e ponto ali viram fonte de "não consigo entrar".
  v_ap := lower(btrim(coalesce(p_apelido, '')));
  v_ap := translate(v_ap, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
  v_ap := regexp_replace(v_ap, '[^a-z0-9]', '', 'g');
  if length(v_ap) < 3 or length(v_ap) > 20 then
    raise exception 'O apelido precisa ter de 3 a 20 letras ou numeros.';
  end if;

  if exists (select 1 from restaurantes where lower(apelido) = v_ap and id <> v_rid) then
    raise exception 'Ja existe uma casa com esse apelido. Escolha outro.';
  end if;

  update restaurantes set apelido = v_ap where id = v_rid;
  return v_ap;
end $function$;

grant execute on function definir_apelido(text) to authenticated;
revoke execute on function definir_apelido(text) from anon;

-- Qualquer um precisa conseguir descobrir o apelido para montar o login na
-- tela de entrada — mas SÓ o apelido, e só a partir do id. Sem isto o app
-- teria que ler a tabela de restaurantes, que é fechada.
create or replace function apelido_do_restaurante(p_restaurante uuid)
returns text language sql stable security definer set search_path = public as $$
  select apelido from restaurantes where id = p_restaurante;
$$;
grant execute on function apelido_do_restaurante(uuid) to authenticated;
revoke execute on function apelido_do_restaurante(uuid) from anon;

-- ---------------------------------------------------------------------
-- 2) O usuário e o rótulo do cargo, no perfil
--
--    `usuario` é a primeira metade do login. `cargo_rotulo` é o cargo que o
--    DONO inventou ("Confeiteiro"); a coluna `cargo` continua guardando o
--    nível de segurança em que aquele rótulo se apoia.
-- ---------------------------------------------------------------------
alter table perfis add column if not exists usuario      text;
alter table perfis add column if not exists cargo_rotulo text;

-- ⚠️ Único POR RESTAURANTE, não global: duas casas podem ter uma "maria", e é
-- o apelido que as separa no login. Único global obrigaria a segunda a se
-- chamar maria2 por causa de um restaurante que ela nem conhece.
create unique index if not exists idx_perfis_usuario
  on perfis (restaurante_id, lower(usuario)) where usuario is not null;

-- ---------------------------------------------------------------------
-- 3) Permissão por CONTA, não só por cargo
--
--    O dono pediu para poder abrir algo em uma conta específica: a Maria é
--    Cozinha, mas só ela vê o relatório.
--
--    ⚠️ O financeiro é a única permissão que o BANCO decide (M20) — as outras
--    são trava de tela. Então ela é a única que precisa aprender a olhar a
--    exceção; deixar de fora faria o dono ligar na tela e o servidor continuar
--    recusando, sem erro visível.
--
--    Ordem: super-admin > diretoria > exceção da conta > cargo > não.
--    A exceção vem ANTES do cargo de propósito: exceção que perde para a regra
--    geral não é exceção.
-- ---------------------------------------------------------------------
create or replace function pode_ver_financeiro()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when coalesce(sou_super_admin(), false) then true
    when coalesce(meu_cargo(), '') = 'diretoria' then true
    else coalesce(
      (select (d.dados -> 'porConta' -> auth.uid()::text ->> 'verFinanceiro')::boolean
         from documentos d
        where d.restaurante_id = meu_restaurante_id() and d.chave = 'permissoes'),
      (select (d.dados -> meu_cargo() ->> 'verFinanceiro')::boolean
         from documentos d
        where d.restaurante_id = meu_restaurante_id() and d.chave = 'permissoes'),
      false)   -- sem matriz, sem cargo, ou chave ausente = NÃO vê
  end
$$;

-- ---------------------------------------------------------------------
-- 4) SONDAS
-- ---------------------------------------------------------------------
do $$
declare
  v_rest uuid := gen_random_uuid();
  v_ok   boolean;
begin
  -- (a) as colunas nasceram
  if not exists (select 1 from information_schema.columns
                  where table_name = 'restaurantes' and column_name = 'apelido')
     or not exists (select 1 from information_schema.columns
                     where table_name = 'perfis' and column_name = 'usuario') then
    raise exception 'M33: coluna nova faltando. Abortando.';
  end if;

  -- (b) a trava dos três níveis CONTINUA de pé: é ela que impede um cargo
  --     inventado de virar diretoria por escrita direta.
  if not exists (select 1 from information_schema.check_constraints c
                  join information_schema.constraint_column_usage u
                    on u.constraint_name = c.constraint_name
                 where u.table_name = 'perfis' and u.column_name = 'cargo') then
    raise exception 'M33: a trava de cargo em perfis sumiu — cargo inventado viraria diretoria. Abortando.';
  end if;

  -- (c) alcance das funções novas
  if not has_function_privilege('authenticated', 'definir_apelido(text)', 'EXECUTE') then
    raise exception 'M33: authenticated sem EXECUTE em definir_apelido. Abortando.';
  end if;
  if has_function_privilege('anon', 'definir_apelido(text)', 'EXECUTE')
     or has_function_privilege('anon', 'apelido_do_restaurante(uuid)', 'EXECUTE') then
    raise exception 'M33: funcao de apelido alcancavel sem login. Abortando.';
  end if;

  -- (d) O APELIDO É MESMO ÚNICO. "Criei o índice" não é o mesmo que "o índice
  --     recusa": um índice em `apelido` cru deixaria passar "PoloBeer" ao lado
  --     de "polobeer", e as duas casas brigariam pelo mesmo login.
  insert into restaurantes (id, nome, apelido) values (v_rest, 'SONDA M33 apagar', 'sondam33');
  begin
    insert into restaurantes (id, nome, apelido)
      values (gen_random_uuid(), 'SONDA M33 b', 'SondaM33');
    raise exception 'M33: o apelido duplicado foi aceito (diferenca so de maiuscula). Abortando.';
  exception when others then
    if sqlerrm like 'M33:%' then raise; end if;
    null; -- recusa esperada
  end;
  delete from restaurantes where nome like 'SONDA M33%';
  if exists (select 1 from restaurantes where nome like 'SONDA M33%') then
    raise exception 'M33: a sonda nao foi apagada. Abortando.';
  end if;

  -- (e) o financeiro continua respondendo (sem sessão, tem que ser NÃO)
  select pode_ver_financeiro() into v_ok;
  if v_ok is not false then
    raise exception 'M33: pode_ver_financeiro devolveu % sem sessao — deveria ser false. Abortando.', v_ok;
  end if;
end $$;
