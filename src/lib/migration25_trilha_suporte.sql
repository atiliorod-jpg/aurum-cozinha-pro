-- =====================================================================
--  MIGRAÇÃO 25 — O ACESSO DO SUPORTE DEIXA RASTRO
--
--  Último achado de segurança da auditoria de 22/08, e o dono escolheu a
--  opção que preserva o trabalho dele: o super-admin CONTINUA enxergando os
--  dados do cliente para dar suporte, mas cada entrada em modo suporte fica
--  registrada na trilha DAQUELE cliente — que ele lê na própria tela de
--  Histórico de mudanças.
--
--  O que isso conserta: o app mostra ao cliente um texto de privacidade, e
--  hoje esse texto não era verdade. `reg_sel_v4` e `doc_super_v4` dão SELECT
--  irrestrito ao super-admin em qualquer restaurante, sem passar por
--  `suporte_pode_editar()` e sem deixar nada para trás. Com a trilha, o texto
--  passa a poder dizer o que de fato acontece: a equipe acessa quando precisa,
--  e o acesso fica registrado para o cliente ver.
--
--  ⚠️ Por que não um trigger: Postgres não tem trigger de SELECT. O evento que
--  importa e que dá para capturar é a ENTRADA EM MODO SUPORTE — é o momento em
--  que o super-admin de fato passa a olhar os dados daquela casa.
--
--  ⚠️ RODAR DEPOIS da 24.
-- =====================================================================

begin;

create or replace function registrar_acesso_suporte(p_restaurante uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions   -- pgcrypto (gen_random_bytes) vive em `extensions`
as $$
begin
  -- Só o super-admin registra acesso de suporte. Sem coalesce aqui a função
  -- viraria a mesma armadilha da M19: sou_super_admin() já devolve boolean com
  -- coalesce por dentro, mas a comparação explícita torna a leitura óbvia.
  if coalesce(sou_super_admin(), false) is not true then
    raise exception 'Apenas o administrador do sistema registra acesso de suporte.';
  end if;
  if p_restaurante is null then
    raise exception 'Informe o restaurante.';
  end if;

  insert into registros (id, restaurante_id, tipo, ts, dados, deleted)
  values (
    encode(gen_random_bytes(8), 'hex'),
    p_restaurante, 'auditoria', (extract(epoch from now()) * 1000)::bigint,
    jsonb_build_object(
      'acao', 'abriu a conta em modo suporte',
      'detalhe', left(coalesce(p_motivo, 'Acesso da equipe Aurum para suporte.'), 400),
      -- nome e cargo vêm do BANCO, nunca do cliente — mesma regra da M18
      'usuario', 'Suporte Aurum',
      'cargo', 'suporte',
      'data', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
      'hora', to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI')
    ),
    false
  );
end $$;

-- Deny-by-default continua valendo (M24): sem este grant a função não é
-- chamável. Só `authenticated` — o super-admin está logado.
grant execute on function registrar_acesso_suporte(uuid, text) to authenticated;

commit;

-- =====================================================================
--  CONFERÊNCIA
--
--  1) a função existe e exige super-admin:
--     select prosrc like '%sou_super_admin%' from pg_proc
--      where proname = 'registrar_acesso_suporte';
--     → t
--
--  2) o anônimo não alcança (deny-by-default da M24):
--     select has_function_privilege('anon',
--       'registrar_acesso_suporte(uuid,text)', 'EXECUTE');
--     → f
--
--  3) o registro cai na trilha do CLIENTE, não na do super-admin: entre em
--     modo suporte por um restaurante de teste e confira que aparece em
--     Administração → Histórico de mudanças DELE, como "Suporte Aurum".
-- =====================================================================
