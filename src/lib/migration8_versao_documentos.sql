-- =====================================================================
--  AURUM COZINHA PRO — Migração 8: VERSÃO NOS CATÁLOGOS (anti-sobrescrita)
--  (auditoria 11/07/2026, item T1.4)
--  Cole INTEIRO no Supabase → SQL Editor → New query → Run.
--  Rode DEPOIS das migrações 4–7. É seguro rodar mais de uma vez.
--
--  Problema: os catálogos (produtos, receitas, prefs…) são gravados como o
--  documento INTEIRO. Com dois tablets editando ao mesmo tempo, o último a
--  salvar sobrescrevia o outro em silêncio (last-writer-wins).
--  Solução: coluna `versao` + RPC de gravação condicional — o app envia a
--  versão que conhece; se o servidor tiver outra, devolve o conteúdo vigente
--  em vez de sobrescrever, e o app avisa o usuário.
--
--  A função é SECURITY INVOKER (padrão): todo acesso passa pelo RLS normal
--  (cliente só grava o próprio restaurante; suporte só com autorização v7).
-- =====================================================================

alter table documentos add column if not exists versao integer not null default 0;

create or replace function salvar_documento(p_restaurante uuid, p_chave text, p_dados jsonb, p_versao integer)
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_atual documentos%rowtype;
begin
  select * into v_atual from documentos
    where restaurante_id = p_restaurante and chave = p_chave
    for update;                       -- serializa gravações concorrentes

  if not found then
    insert into documentos (restaurante_id, chave, dados, versao, updated_at)
      values (p_restaurante, p_chave, p_dados, 1, now());
    return jsonb_build_object('ok', true, 'versao', 1);
  end if;

  -- p_versao = -1: replay da fila offline — o aparelho ficou sem internet e
  -- está subindo o que guardou; grava por cima com bump de versão (documentado:
  -- conflito offline continua last-writer, mas o online agora é protegido).
  if p_versao <> -1 and coalesce(v_atual.versao, 0) <> coalesce(p_versao, 0) then
    return jsonb_build_object('ok', false, 'conflito', true,
      'versao', coalesce(v_atual.versao, 0), 'dados', v_atual.dados);
  end if;

  update documentos
    set dados = p_dados, versao = coalesce(v_atual.versao, 0) + 1, updated_at = now()
    where restaurante_id = p_restaurante and chave = p_chave;
  return jsonb_build_object('ok', true, 'versao', coalesce(v_atual.versao, 0) + 1);
end $$;

-- =====================================================================
--  PRONTO. Teste: dois navegadores logados na mesma conta, os dois editam
--  produtos quase juntos → o segundo recebe aviso e a tela recarrega o
--  catálogo vigente em vez de sobrescrever o primeiro.
-- =====================================================================
