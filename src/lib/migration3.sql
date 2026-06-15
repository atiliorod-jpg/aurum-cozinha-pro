-- ============================================================
-- Migração 3 — Segurança de cargo + controle de restaurantes
-- Cole no SQL Editor do Supabase Dashboard e clique em Run.
-- ============================================================

-- ── 1. Função helper: cargo do usuário logado ────────────────
CREATE OR REPLACE FUNCTION meu_cargo()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT cargo FROM perfis WHERE id = auth.uid()
$$;

-- ── 2. Trigger: bloqueia mudança de cargo por não-diretoria ─
--    Mesmo que um usuário burle o RLS, o banco rejeita.
CREATE OR REPLACE FUNCTION _check_cargo_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.cargo IS DISTINCT FROM OLD.cargo THEN
    IF meu_cargo() IS DISTINCT FROM 'diretoria' THEN
      RAISE EXCEPTION 'Apenas diretoria pode alterar o cargo.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cargo_change ON perfis;
CREATE TRIGGER trg_cargo_change
  BEFORE UPDATE ON perfis
  FOR EACH ROW EXECUTE FUNCTION _check_cargo_change();

-- ── 3. Melhora o RLS de update em perfis ────────────────────
--    Antes: qualquer usuário do restaurante podia editar qualquer perfil.
--    Agora: cada um edita só o próprio; diretoria edita qualquer um do restaurante.
DROP POLICY IF EXISTS "perfis_update" ON perfis;

CREATE POLICY "perfis_update" ON perfis FOR UPDATE
  USING (
    id = auth.uid()
    OR (restaurante_id = meu_restaurante_id() AND meu_cargo() = 'diretoria')
  )
  WITH CHECK (restaurante_id = meu_restaurante_id());

-- ── 4. Adiciona limite de usuários por restaurante ───────────
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS max_usuarios integer NOT NULL DEFAULT 3;

-- ── 5. Bloqueia criação de restaurante sem convite do admin ──
--    Remove a política aberta e substitui por: só a service role cria restaurantes.
--    (Quando você cria um restaurante novo, usa o script de onboarding com service key.)
DROP POLICY IF EXISTS "rest_insert" ON restaurantes;

-- Sem policy de insert = apenas service role (seu backend/script) cria restaurantes.
-- A linha abaixo é opcional — habilite só se quiser bloquear por completo no client:
-- (já está bloqueado pela ausência de policy, mantemos assim)

-- ── 6. Função aceitar_convite com limite de usuários ─────────
CREATE OR REPLACE FUNCTION aceitar_convite(p_token text, p_nome text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conv  convites%ROWTYPE;
  v_count integer;
  v_max   integer;
BEGIN
  SELECT * INTO v_conv FROM convites
    WHERE token = p_token AND usado = false AND expira_em > now();
  IF v_conv.token IS NULL THEN RETURN false; END IF;

  -- Conta usuários ativos no restaurante
  SELECT COUNT(*) INTO v_count FROM perfis
    WHERE restaurante_id = v_conv.restaurante_id AND ativo = true;
  SELECT max_usuarios INTO v_max FROM restaurantes
    WHERE id = v_conv.restaurante_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de % usuários atingido para este restaurante.', v_max;
  END IF;

  INSERT INTO perfis (id, restaurante_id, nome, cargo)
    VALUES (auth.uid(), v_conv.restaurante_id, p_nome, v_conv.cargo)
    ON CONFLICT (id) DO NOTHING;
  UPDATE convites SET usado = true WHERE token = p_token;
  RETURN true;
END $$;

-- ── 7. Tabela de onboarding (controle de contas do admin) ────
--    Lista todos os restaurantes que você criou, com status e contato.
CREATE TABLE IF NOT EXISTS onboarding (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  contato_nome   text,
  contato_email  text,
  plano          text        NOT NULL DEFAULT 'basico'
                             CHECK (plano IN ('basico', 'pro')),
  ativo          boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Só service role acessa — sem RLS policies abertas
ALTER TABLE onboarding ENABLE ROW LEVEL SECURITY;
-- (sem policies = apenas service key tem acesso, nunca o client)
