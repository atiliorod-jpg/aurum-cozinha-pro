-- ============================================================
-- Migração 2 — Segurança dos convites (rodar UMA vez no SQL Editor)
-- Fecha a leitura aberta da tabela de convites e cria a função
-- segura aceitar_convite(), usada no cadastro por convite.
-- ============================================================

DROP POLICY IF EXISTS "conv_select" ON convites;
DROP POLICY IF EXISTS "conv_update" ON convites;

CREATE POLICY "conv_select" ON convites
  FOR SELECT USING (restaurante_id = meu_restaurante_id());

CREATE OR REPLACE FUNCTION aceitar_convite(p_token text, p_nome text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conv convites%ROWTYPE;
BEGIN
  SELECT * INTO v_conv FROM convites
    WHERE token = p_token AND usado = false AND expira_em > now();
  IF v_conv.token IS NULL THEN RETURN false; END IF;
  INSERT INTO perfis (id, restaurante_id, nome, cargo)
    VALUES (auth.uid(), v_conv.restaurante_id, p_nome, v_conv.cargo)
    ON CONFLICT (id) DO NOTHING;
  UPDATE convites SET usado = true WHERE token = p_token;
  RETURN true;
END $$;
