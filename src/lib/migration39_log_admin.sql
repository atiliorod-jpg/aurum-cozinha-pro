-- =====================================================================
--  M39 — o que a Aurum faz na conta do cliente fica registrado
--
--  A M25 registra a ENTRADA em modo suporte, e isso foi bem feito. Mas todo o
--  resto que o painel faz não deixava rastro nenhum: liberar dias, trocar o
--  plano, renomear o restaurante, corrigir o CNPJ, bloquear, apagar feedback,
--  restaurar um documento por cima do atual, registrar pagamento, virar
--  cortesia. Se um cliente disser "vocês mexeram no meu cadastro", não há o
--  que mostrar — nem para ele, nem para nós mesmos seis meses depois.
--
--  Isso passou a pesar mais desde 02/09, quando o painel ganhou APAGAR
--  RESTAURANTE e REGISTRAR PAGAMENTO. São exatamente as ações que precisam de
--  rastro.
--
--  ⚠️ POR QUE GATILHO E NÃO UMA CHAMADA EM CADA FUNÇÃO. Havia doze funções
--  para instrumentar, e a décima terceira — a que alguém escrever mês que vem
--  — nasceria sem registro, em silêncio. Um gatilho na TABELA pega qualquer
--  caminho: RPC nova, correção manual pelo painel do Supabase, script. É a
--  diferença entre "registramos o que lembramos de registrar" e "registramos
--  o que aconteceu".
--
--  ⚠️ E POR QUE SÓ O SUPER-ADMIN. O cliente mexe no próprio cadastro o dia
--  inteiro — registrar isso encheria a tabela de ruído e escondria justamente
--  o que importa. O filtro é `sou_super_admin()`: só entra o que a AURUM fez
--  na conta de alguém. Efeito colateral bom: em `documentos`, que o cliente
--  grava a cada toque, o gatilho sai fora na primeira linha.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) O livro
--
--    ⚠️ SEM chave estrangeira para `restaurantes`, e com o NOME copiado: uma
--    das ações registradas é apagar o restaurante (M38). Com FK, o registro
--    morreria junto com o que ele descreve — justamente no caso em que ele é
--    mais necessário.
-- ---------------------------------------------------------------------
create table if not exists admin_log (
  id             bigserial primary key,
  restaurante_id uuid,
  restaurante    text,
  tabela         text not null,
  acao           text not null,          -- INSERT | UPDATE | DELETE
  mudancas       jsonb not null default '{}'::jsonb,
  feito_por      text not null,
  criado_em      timestamptz not null default now()
);
alter table admin_log enable row level security;
-- sem NENHUMA policy: só as RPCs abaixo chegam nela (mesmo molde da M15/M31/M38).

create index if not exists idx_admin_log_data on admin_log (criado_em desc);
create index if not exists idx_admin_log_rest on admin_log (restaurante_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 2) O gatilho
-- ---------------------------------------------------------------------
create or replace function _registrar_acao_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mud   jsonb := '{}'::jsonb;
  v_rid   uuid;
  v_nome  text;
  v_chave text;
  v_antes jsonb;
  v_dep   jsonb;
begin
  -- ⚠️ PRIMEIRA LINHA, de propósito: o cliente grava em `documentos` a cada
  -- toque na tela, e o resto desta função nunca deve rodar para ele.
  if not sou_super_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then v_antes := to_jsonb(old); v_dep := null;
  elsif tg_op = 'INSERT' then v_antes := null; v_dep := to_jsonb(new);
  else v_antes := to_jsonb(old); v_dep := to_jsonb(new);
  end if;

  -- Só o que MUDOU, campo a campo. Guardar a linha inteira faria o registro
  -- de "liberou 30 dias" carregar o catálogo do cliente junto.
  if tg_op = 'UPDATE' then
    for v_chave in select key from jsonb_each(v_dep) loop
      if v_antes -> v_chave is distinct from v_dep -> v_chave then
        v_mud := v_mud || jsonb_build_object(
          v_chave, jsonb_build_object('de', v_antes -> v_chave, 'para', v_dep -> v_chave));
      end if;
    end loop;
    -- UPDATE que não mudou nada não vira linha no livro.
    if v_mud = '{}'::jsonb then return new; end if;
  end if;

  -- De onde sai o restaurante depende da tabela.
  if tg_table_name = 'restaurantes' then
    v_rid  := coalesce((v_dep ->> 'id')::uuid, (v_antes ->> 'id')::uuid);
    v_nome := coalesce(v_dep ->> 'nome', v_antes ->> 'nome');
  else
    v_rid  := coalesce((v_dep ->> 'restaurante_id')::uuid, (v_antes ->> 'restaurante_id')::uuid);
    select nome into v_nome from restaurantes where id = v_rid;
  end if;

  -- ⚠️ Em DELETE e INSERT guarda-se só uma marca do que era, não a linha
  -- inteira: o conteúdo do documento de um cliente não tem por que morar no
  -- nosso livro de auditoria.
  if tg_op <> 'UPDATE' then
    v_mud := jsonb_build_object('chave', coalesce(v_dep ->> 'chave', v_antes ->> 'chave',
                                                  v_dep ->> 'tipo',  v_antes ->> 'tipo'));
  end if;

  insert into admin_log (restaurante_id, restaurante, tabela, acao, mudancas, feito_por)
    values (v_rid, v_nome, tg_table_name, tg_op, v_mud,
            coalesce(auth.jwt() ->> 'email', 'sistema'));

  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 3) Onde ele fica
-- ---------------------------------------------------------------------
drop trigger if exists trg_log_restaurantes on restaurantes;
create trigger trg_log_restaurantes
  after update or delete on restaurantes
  for each row execute function _registrar_acao_admin();

drop trigger if exists trg_log_feedback on feedback;
create trigger trg_log_feedback
  after delete on feedback
  for each row execute function _registrar_acao_admin();

-- ⚠️ `documentos` é onde mora o cadastro do cliente, e é o que o modo suporte
-- pode reescrever. O filtro de super-admin na primeira linha garante que a
-- gravação normal do cliente não passe por aqui.
drop trigger if exists trg_log_documentos on documentos;
create trigger trg_log_documentos
  after update on documentos
  for each row execute function _registrar_acao_admin();

-- ---------------------------------------------------------------------
-- 4) Ler o livro (painel)
-- ---------------------------------------------------------------------
create or replace function log_admin(p_restaurante uuid default null, p_limite integer default 100)
returns setof admin_log
language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema lê o registro.';
  end if;
  return query
    select * from admin_log
     where p_restaurante is null or restaurante_id = p_restaurante
     order by criado_em desc
     limit least(coalesce(p_limite, 100), 500);
end $$;

revoke all on function log_admin(uuid, integer) from public, anon;
grant execute on function log_admin(uuid, integer) to authenticated;

commit;

-- =====================================================================
--  Teste rápido:
--    • como super-admin: um UPDATE em restaurantes vira uma linha em
--      admin_log, com só os campos que mudaram.
--    • como cliente: gravar um documento NÃO gera linha nenhuma.
--    • anônimo: log_admin() levanta exceção.
-- =====================================================================
