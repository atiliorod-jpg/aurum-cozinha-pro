-- =====================================================================
--  M38 — apagar restaurante de verdade
--
--  Os Termos prometem (cláusula 15) atender pedido de exclusão definitiva da
--  conta e dos dados em até 4 dias úteis. Não havia função nenhuma: a única
--  saída era escrever DELETE à mão no banco, de madrugada, sem rede de
--  segurança — e apagar o cliente errado na mão não tem volta.
--
--  ⚠️ O QUE UM `delete from restaurantes` SOZINHO DEIXARIA PARA TRÁS. Medido
--  no banco antes de escrever: das nove tabelas com `restaurante_id`, SETE
--  apagam em cascata e DUAS NÃO —
--     • `documentos_historico`, que guarda CÓPIAS DOS DADOS DO CLIENTE
--       (a rede de segurança da M31), e
--     • `feedback`, que guarda o que ele escreveu para a gente.
--  Ou seja: a "exclusão definitiva" deixaria justamente o histórico completo
--  dele vivo no banco. É o oposto do que a cláusula promete.
--
--  ⚠️ AS CONTAS DE AUTENTICAÇÃO NÃO SAEM DAQUI. `perfis` cascateia, mas
--  `auth.users` não — sobrariam contas que ainda entram e não pertencem a
--  restaurante nenhum. Por isso esta função DEVOLVE os ids, e quem os apaga é
--  a edge function `restaurante`, que tem a chave de administrador. Fazer isso
--  em SQL exigiria mexer por dentro do esquema de autenticação do Supabase.
--
--  ⚠️ `sou_super_admin()` COMPARA auth.uid() CONTRA UM UUID CRAVADO, não o
--  e-mail (conferido no banco em 02/09). A edge function `restaurante` compara
--  e-mail. São travas DIFERENTES para a mesma pessoa — o que é bom, mas quem
--  for mexer numa precisa saber que a outra não muda junto.
--
--  ⚠️ A TRAVA É O NOME DIGITADO. Não é confirmação de tela — tela não é trava.
--  Quem chama precisa mandar o nome exato do restaurante; errou uma letra, não
--  apaga. É o que separa "apagar o cliente que pediu" de "apagar o cliente que
--  estava na linha de cima".
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) A lápide
--
--    ⚠️ SEM chave estrangeira para `restaurantes`, de propósito: a linha
--    precisa sobreviver ao restaurante que ela descreve. É a prova de que a
--    conta existiu, de quando saiu e de quem mandou sair — o mínimo para
--    responder "vocês apagaram meus dados?" seis meses depois.
-- ---------------------------------------------------------------------
create table if not exists admin_exclusoes (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null,
  nome           text not null,
  cnpj           text,
  produto        text,
  criado_em      timestamptz,          -- quando a conta nasceu
  apagado_em     timestamptz not null default now(),
  apagado_por    text not null,
  usuarios       integer not null default 0,
  registros      integer not null default 0
);
alter table admin_exclusoes enable row level security;
-- sem NENHUMA policy: só as RPCs abaixo chegam nela (mesmo molde da M15/M31).

-- ---------------------------------------------------------------------
-- 2) Apagar
-- ---------------------------------------------------------------------
create or replace function apagar_restaurante(p_restaurante uuid, p_confirmacao text)
returns table (usuario_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_nome  text;
  v_cnpj  text;
  v_prod  text;
  v_desde timestamptz;
  v_users integer;
  v_regs  integer;
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema apaga contas.';
  end if;

  select nome, cnpj, produto, created_at into v_nome, v_cnpj, v_prod, v_desde
    from restaurantes where id = p_restaurante;
  if v_nome is null then
    raise exception 'Restaurante não encontrado.';
  end if;

  -- ⚠️ A TRAVA. `trim` porque o nome vem de um campo digitado à mão; o resto
  -- é comparação exata de propósito — maiúscula, acento e espaço no meio
  -- contam. Quem não consegue copiar o nome certo não deveria estar apagando.
  if trim(p_confirmacao) is distinct from trim(v_nome) then
    raise exception 'O nome digitado não confere com o do restaurante.';
  end if;

  select count(*) into v_users from perfis where restaurante_id = p_restaurante;
  select count(*) into v_regs  from registros where restaurante_id = p_restaurante;

  insert into admin_exclusoes (restaurante_id, nome, cnpj, produto, criado_em, apagado_por, usuarios, registros)
    values (p_restaurante, v_nome, v_cnpj, v_prod, v_desde,
            coalesce(auth.jwt() ->> 'email', 'desconhecido'), v_users, v_regs);

  -- Os ids saem ANTES do delete: depois da cascata não há mais de onde tirar.
  create temporary table _apagar_users on commit drop as
    select id from perfis where restaurante_id = p_restaurante;

  -- ⚠️ As duas que NÃO cascateiam, explicitamente e ANTES do restaurante.
  delete from documentos_historico where restaurante_id = p_restaurante;
  delete from feedback              where restaurante_id = p_restaurante;

  -- e o resto vai junto pela cascata (perfis, documentos, registros,
  -- convites, admin_notas, onboarding, pagamentos)
  delete from restaurantes where id = p_restaurante;

  return query select id from _apagar_users;
end $$;

revoke all on function apagar_restaurante(uuid, text) from public, anon;
grant execute on function apagar_restaurante(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Ler as lápides (para o painel mostrar o que já foi apagado)
-- ---------------------------------------------------------------------
create or replace function exclusoes_admin()
returns setof admin_exclusoes
language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema consulta as exclusões.';
  end if;
  return query select * from admin_exclusoes order by apagado_em desc limit 200;
end $$;

revoke all on function exclusoes_admin() from public, anon;
grant execute on function exclusoes_admin() to authenticated;

commit;

-- =====================================================================
--  Teste rápido:
--    • como cliente: apagar_restaurante(...) levanta exceção.
--    • com o nome errado: levanta exceção e NADA é apagado.
--    • com o nome certo: devolve os ids dos usuários e some com tudo;
--      `select * from admin_exclusoes` mostra a lápide.
-- =====================================================================
