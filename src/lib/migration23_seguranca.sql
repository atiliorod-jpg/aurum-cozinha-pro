-- =====================================================================
--  MIGRAÇÃO 23 — ENDURECIMENTO ANTES DO PRIMEIRO CLIENTE PAGANTE
--
--  Seis buracos achados na auditoria de 22/08. Nenhum deles vaza dado entre
--  restaurantes diferentes — o isolamento por `meu_restaurante_id()` está de
--  pé. O que estes concedem é PRIVILÉGIO DEMAIS DENTRO da mesma conta: um
--  cozinheiro alcançando coisa de diretoria pela API, sem passar pela tela.
--
--  ⚠️ A lição da M19 se repete aqui em dois pontos (itens 5 e 6): em SQL,
--  comparação que devolve NULL não trava. `coalesce` antes de comparar e
--  `is distinct from` no lugar de `<>`.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) CONVITES: o token não é mais legível por qualquer membro
--
--    `conv_sel_v4` filtrava só por restaurante. Um usuário de cozinha fazia
--    GET /rest/v1/convites?select=token,cargo e recebia TODOS os códigos
--    pendentes — inclusive um de diretoria, que ele então usaria para se
--    promover. A tela nunca ofereceu isso; a API oferecia.
-- ---------------------------------------------------------------------
drop policy if exists "conv_sel_v4" on convites;

create policy "conv_sel_v23" on convites for select
  using (
    restaurante_id = meu_restaurante_id()
    and coalesce(meu_cargo(), '') in ('gerencia', 'diretoria')
  );

-- ---------------------------------------------------------------------
-- 2) CONVITES LEGADOS: 8 caracteres hex = 32 bits, varrível por força bruta
--
--    A M10 trocou o DEFAULT para 16 caracteres, mas DEFAULT só vale para
--    linha nova. Todo convite emitido antes continua com o token curto e
--    continua válido até expirar ou ser usado.
-- ---------------------------------------------------------------------
update convites
   set expira_em = now()
 where length(token) = 8
   and usado = false
   and expira_em > now();

-- Trava o formato para o futuro: nenhum caminho pode gravar token curto.
--
-- ⚠️ NOT VALID de propósito. Sem isso o ALTER valida as linhas JÁ EXISTENTES,
-- e basta um convite antigo (mesmo usado, mesmo expirado) com token de 8
-- caracteres para o comando falhar e derrubar a migração inteira no meio.
-- NOT VALID aplica a regra a toda linha nova e a todo UPDATE, que é o que
-- importa aqui: o histórico fica como está, e o futuro fica travado.
alter table convites drop constraint if exists convites_token_len;
alter table convites add constraint convites_token_len check (length(token) >= 16) not valid;

-- ---------------------------------------------------------------------
-- 3) DOCUMENTOS: o DELETE ficou de fora de TODAS as travas de chave
--
--    `salvar_documento` protege `permissoes`, `estoques` e `precos` — mas só
--    no caminho de gravação. `doc_del_v10` permitia DELETE direto de qualquer
--    chave: apagar `permissoes` derruba a matriz de acessos da conta, e
--    apagar `estoques` derruba a topologia de instâncias da M22. As travas de
--    conferência das migrações 18, 20 e 22 checavam só
--    cmd in ('SELECT','INSERT','UPDATE','ALL') — DELETE nunca foi olhado.
-- ---------------------------------------------------------------------
drop policy if exists "doc_del_v10" on documentos;

create policy "doc_del_v23" on documentos for delete
  using (
    restaurante_id = meu_restaurante_id()
    and restaurante_pode_escrever(restaurante_id)
    and (chave not like '%permissoes' or coalesce(meu_cargo(), '') = 'diretoria')
    and (chave not like '%estoques'   or coalesce(meu_cargo(), '') = 'diretoria')
    and (chave not like '%precos'     or coalesce(pode_ver_financeiro(), false) is true)
  );

-- ---------------------------------------------------------------------
-- 4) REGISTROS: some o DELETE físico
--
--    `reg_del_v10` permitia apagar DEFINITIVAMENTE qualquer lançamento a
--    qualquer membro, sem olhar cargo nem a capacidade `removerRegistros` —
--    que era, portanto, só trava de interface. E o registro apagado assim não
--    deixa rastro na auditoria nem volta pelo Desfazer.
--
--    O app NÃO precisa disso: toda remoção dele é soft-delete
--    (update deleted = true), coberta por `reg_upd_v18`. Sem policy de
--    DELETE, o PostgREST simplesmente recusa.
-- ---------------------------------------------------------------------
drop policy if exists "reg_del_v10" on registros;

-- ---------------------------------------------------------------------
-- 5) salvar_documento: `p_versao` NULL desligava o controle de conflito
--
--    A M8 comparava com coalesce. Da M18 em diante o coalesce sumiu, e com
--    p_versao = null: `NULL <> -1` é NULL, o `and` curto-circuita para NULL,
--    o `if` não entra no ramo do conflito e a gravação passa por cima da
--    versão do servidor — silenciosamente, que é o pior jeito de perder o
--    trabalho de outro tablet.
-- ---------------------------------------------------------------------
create or replace function salvar_documento(p_restaurante uuid, p_chave text, p_dados jsonb, p_versao integer)
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_atual documentos%rowtype;
begin
  if p_chave like '%permissoes' and meu_cargo() is distinct from 'diretoria' then
    raise exception 'Só a diretoria altera as permissões da equipe.';
  end if;
  if p_chave like '%estoques' and meu_cargo() is distinct from 'diretoria' then
    raise exception 'Só a diretoria cria, renomeia ou arquiva estoques.';
  end if;
  if p_chave like '%precos' and coalesce(pode_ver_financeiro(), false) is not true then
    raise exception 'Sem permissão para alterar preços e custos.';
  end if;

  select * into v_atual from documentos
   where restaurante_id = p_restaurante and chave = p_chave for update;

  if not found then
    insert into documentos (restaurante_id, chave, dados, versao, updated_at)
    values (p_restaurante, p_chave, p_dados, 1, now());
    return jsonb_build_object('ok', true, 'versao', 1);
  end if;

  -- versão -1 = replay do offline: força a gravação e sobe o contador.
  -- ⚠️ coalesce + is distinct from: sem isso, p_versao NULL vira "sem trava".
  if coalesce(p_versao, 0) <> -1
     and coalesce(p_versao, 0) is distinct from coalesce(v_atual.versao, 0) then
    return jsonb_build_object('ok', false, 'conflito', true,
                              'versao', v_atual.versao, 'dados', v_atual.dados);
  end if;

  update documentos
     set dados = p_dados, versao = v_atual.versao + 1, updated_at = now()
   where restaurante_id = p_restaurante and chave = p_chave;

  return jsonb_build_object('ok', true, 'versao', v_atual.versao + 1);
end $$;

-- ---------------------------------------------------------------------
-- 6) alterar_cargo: lia `perfis` cru e comparava sem coalesce
--
--    A M18 endureceu `meu_cargo()` e `meu_restaurante_id()` para ignorar quem
--    foi DESATIVADO, mas `alterar_cargo` fazia o próprio SELECT em perfis e
--    não passava por elas: um gerente desativado continuava promovendo gente.
--    E as comparações usavam `not in` / `<>` sem coalesce — o mesmo formato
--    que produziu a falha da M19.
-- ---------------------------------------------------------------------
create or replace function alterar_cargo(p_usuario uuid, p_cargo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_rest_alvo uuid;
begin
  if coalesce(meu_cargo(), '') not in ('gerencia', 'diretoria') then
    raise exception 'Só gerência ou diretoria altera cargos.';
  end if;
  if p_cargo not in ('cozinha', 'gerencia', 'diretoria') then
    raise exception 'Cargo inválido.';
  end if;
  -- ⚠️ As três travas abaixo JÁ EXISTIAM e precisam sobreviver a esta
  -- reescrita: o que muda aqui é só de onde vem o cargo de quem chama.
  -- Anti-autopromoção: ninguém altera o próprio cargo, nem chamando a RPC direto.
  if p_usuario = auth.uid() then
    raise exception 'Você não pode alterar o seu próprio cargo.';
  end if;
  -- Gerência não concede cargo acima do próprio nível.
  if p_cargo = 'diretoria' and coalesce(meu_cargo(), '') <> 'diretoria' then
    raise exception 'Gerência não pode promover ninguém a Diretoria.';
  end if;

  select restaurante_id into v_rest_alvo from perfis where id = p_usuario;

  -- Alvo inexistente: erro controlado em vez de "sucesso" silencioso.
  if v_rest_alvo is null then
    raise exception 'Usuário alvo não encontrado.';
  end if;
  if meu_restaurante_id() is null
     or v_rest_alvo is distinct from meu_restaurante_id() then
    raise exception 'Usuário não é da sua equipe.';
  end if;

  update perfis set cargo = p_cargo where id = p_usuario;
end $$;

commit;

-- =====================================================================
--  CONFERÊNCIA — rode depois e confira os quatro resultados
--
--  1) o token de convite só sai para gestão:
--     select polname, pg_get_expr(polqual, polrelid)
--       from pg_policy where polrelid = 'convites'::regclass and polcmd = 'r';
--     → deve conter meu_cargo() e NÃO deve existir 'conv_sel_v4'
--
--  2) nenhum convite curto continua válido:
--     select count(*) from convites
--      where length(token) = 8 and usado = false and expira_em > now();
--     → 0
--
--  3) nenhum MEMBRO apaga registro fisicamente:
--     select polname, pg_get_expr(polqual, polrelid) from pg_policy
--      where polrelid = 'registros'::regclass and polcmd = 'd';
--     → deve sobrar SÓ 'reg_super_del_v7', que já exige
--       sou_super_admin() AND suporte_pode_editar(). Contar policies não serve
--       como conferência: essa do super-admin é legítima e continua de pé.
--
--  4) o guard de NULL entrou em salvar_documento:
--     select prosrc like '%coalesce(p_versao, 0)%' from pg_proc
--      where proname = 'salvar_documento';
--     → t
-- =====================================================================
