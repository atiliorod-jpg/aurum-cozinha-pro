-- =====================================================================
--  AURUM COZINHA PRO — Migração 7: SUPORTE COM EDIÇÃO + ASSINATURA
--  (decisões do dono em 07/07/2026)
--  Cole INTEIRO no Supabase → SQL Editor → New query → Run.
--  Rode DEPOIS do migration4/5/6. É seguro rodar mais de uma vez.
--
--  1) Suporte com edição REAL: o super-admin só consegue ESCREVER na conta
--     de um cliente enquanto o cliente tiver autorizado "ver e editar"
--     (prefs.suportePermissao='mexer') e dentro do prazo de 24h
--     (prefs.suporteAtivo > agora). Fora disso, continua só leitura.
--     A trilha de auditoria continua IMUTÁVEL até para o suporte.
--  2) Assinatura: coluna restaurantes.assinatura_ate + RPC ativar_assinatura
--     (só super-admin) — o app mostra teste de 7 dias (created_at + 7d) e
--     bloqueia visualmente quando teste e assinatura vencem.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Função: o cliente autorizou o suporte a EDITAR (e ainda está no prazo)?
--    Lê a autorização de documentos.chave='prefs' (onde o app grava).
-- ---------------------------------------------------------------------
create or replace function suporte_pode_editar(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from documentos
    where restaurante_id = rid and chave = 'prefs'
      and dados->>'suportePermissao' = 'mexer'
      and coalesce((dados->>'suporteAtivo')::numeric, 0) > extract(epoch from now()) * 1000
  );
$$;

-- ---------------------------------------------------------------------
-- 2) REGISTROS — escrita do super-admin condicionada à autorização.
--    Auditoria continua imutável (nem o suporte altera/apaga).
-- ---------------------------------------------------------------------
drop policy if exists "reg_super_ins_v7" on registros;
drop policy if exists "reg_super_upd_v7" on registros;
drop policy if exists "reg_super_del_v7" on registros;

create policy "reg_super_ins_v7" on registros for insert
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id));
create policy "reg_super_upd_v7" on registros for update
  using (sou_super_admin() and suporte_pode_editar(restaurante_id) and tipo <> 'auditoria')
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id));
create policy "reg_super_del_v7" on registros for delete
  using (sou_super_admin() and suporte_pode_editar(restaurante_id) and tipo <> 'auditoria');

-- ---------------------------------------------------------------------
-- 3) DOCUMENTOS (catálogos) — escrita do super-admin condicionada.
--    Exceção de segurança: o suporte NÃO altera a linha 'prefs' do cliente
--    (é nela que mora a própria autorização — senão o suporte poderia
--    estender o próprio prazo).
-- ---------------------------------------------------------------------
drop policy if exists "doc_super_ins_v7" on documentos;
drop policy if exists "doc_super_upd_v7" on documentos;

create policy "doc_super_ins_v7" on documentos for insert
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id) and chave <> 'prefs');
create policy "doc_super_upd_v7" on documentos for update
  using (sou_super_admin() and suporte_pode_editar(restaurante_id) and chave <> 'prefs')
  with check (sou_super_admin() and suporte_pode_editar(restaurante_id) and chave <> 'prefs');

-- ---------------------------------------------------------------------
-- 4) ASSINATURA — coluna + RPC de ativação (só super-admin).
--    O select do próprio restaurante (rest_sel_v4) já deixa o app ler.
-- ---------------------------------------------------------------------
alter table restaurantes add column if not exists assinatura_ate timestamptz;

create or replace function ativar_assinatura(p_restaurante uuid, p_dias int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_ate timestamptz;
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema ativa assinaturas.';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 400 then
    raise exception 'Dias inválidos (1 a 400).';
  end if;
  -- soma a partir do vencimento atual se ainda estiver ativo (renovação),
  -- senão a partir de agora
  select greatest(coalesce(assinatura_ate, now()), now()) + make_interval(days => p_dias)
    into v_ate from restaurantes where id = p_restaurante;
  if v_ate is null then
    raise exception 'Restaurante não encontrado.';
  end if;
  update restaurantes set assinatura_ate = v_ate where id = p_restaurante;
  return v_ate;
end $$;

-- =====================================================================
--  PRONTO. Teste do suporte-edição: cliente autoriza "ver e editar" →
--  super-admin entra em modo suporte e registra algo → deve SALVAR.
--  Com "só visualizar", a escrita deve continuar bloqueada.
-- =====================================================================
