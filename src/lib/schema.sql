-- ============================================================
-- ⚠️ ARQUIVO HISTÓRICO / BOOTSTRAP ANTIGO — NÃO REAPLICAR EM PRODUÇÃO.
--    As policies aqui (ex.: perfis_insert aberto, rest_insert with check true)
--    foram SUPERADAS e ENDURECIDAS pelas migrations 4–11. Rodar este arquivo
--    por cima da produção REABRE buracos de segurança já fechados.
--    Estado correto = migrations 4–11 aplicadas em ordem (ver README).
--    Use este schema só para entender a estrutura ou semear um banco novo
--    DO ZERO (e, mesmo aí, rode as migrations 4–11 em seguida).
-- ============================================================
-- Polo Estoque — Schema Supabase (multi-tenant / multi-restaurante)
-- Modelo: cada restaurante é isolado por Row Level Security (RLS).
-- ============================================================

-- ── 1. Restaurantes (cada cliente do sistema) ───────────────
CREATE TABLE IF NOT EXISTS restaurantes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text        NOT NULL,
  ativo      boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Perfis (liga auth.users ↔ restaurante + cargo) ───────
CREATE TABLE IF NOT EXISTS perfis (
  id             uuid    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurante_id uuid    NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nome           text    NOT NULL,
  cargo          text    NOT NULL DEFAULT 'cozinha'
                         CHECK (cargo IN ('cozinha','gerencia','diretoria')),
  ativo          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Convites (diretoria gera código p/ novo funcionário) ─
CREATE TABLE IF NOT EXISTS convites (
  token          text        PRIMARY KEY DEFAULT encode(gen_random_bytes(4),'hex'),
  restaurante_id uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  cargo          text        NOT NULL DEFAULT 'cozinha',
  usado          boolean     NOT NULL DEFAULT false,
  expira_em      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Documentos (catálogos: 1 linha por lista, JSONB) ─────
-- chave ∈ produtos, categorias, pessoas, destinos, fichas, prefs
CREATE TABLE IF NOT EXISTS documentos (
  restaurante_id uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  chave          text        NOT NULL,
  dados          jsonb       NOT NULL DEFAULT '[]',
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, chave)
);

-- ── 5. Registros (todos os lançamentos operacionais) ────────
-- tipo ∈ compra, entrada, saida, apara, perda, ajuste, auditoria
CREATE TABLE IF NOT EXISTS registros (
  id             text        PRIMARY KEY,
  restaurante_id uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  tipo           text        NOT NULL,
  ts             bigint      NOT NULL,
  dados          jsonb       NOT NULL DEFAULT '{}',
  deleted        boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_registros_rest ON registros (restaurante_id, tipo, ts);

-- ── 6. Row Level Security ────────────────────────────────────
ALTER TABLE restaurantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE convites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros    ENABLE ROW LEVEL SECURITY;

-- Retorna o restaurante do usuário logado (SECURITY DEFINER evita loop no RLS)
CREATE OR REPLACE FUNCTION meu_restaurante_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT restaurante_id FROM perfis WHERE id = auth.uid()
$$;

-- restaurantes
CREATE POLICY "rest_select" ON restaurantes FOR SELECT USING (id = meu_restaurante_id());
CREATE POLICY "rest_insert" ON restaurantes FOR INSERT WITH CHECK (true);
CREATE POLICY "rest_update" ON restaurantes FOR UPDATE USING (id = meu_restaurante_id());

-- perfis
CREATE POLICY "perfis_select" ON perfis FOR SELECT USING (restaurante_id = meu_restaurante_id());
CREATE POLICY "perfis_insert" ON perfis FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "perfis_update" ON perfis FOR UPDATE USING (restaurante_id = meu_restaurante_id());

-- convites: só a diretoria do próprio restaurante enxerga/cria.
-- A aceitação roda pela função segura aceitar_convite() (abaixo), que NÃO
-- expõe a tabela — evita listar/adivinhar códigos de outros restaurantes.
CREATE POLICY "conv_select" ON convites FOR SELECT USING (restaurante_id = meu_restaurante_id());
CREATE POLICY "conv_insert" ON convites FOR INSERT WITH CHECK (restaurante_id = meu_restaurante_id());

-- Valida o token e cria o perfil do usuário recém-cadastrado, sem expor convites.
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

-- documentos
CREATE POLICY "doc_all" ON documentos FOR ALL
  USING (restaurante_id = meu_restaurante_id())
  WITH CHECK (restaurante_id = meu_restaurante_id());

-- registros
CREATE POLICY "reg_all" ON registros FOR ALL
  USING (restaurante_id = meu_restaurante_id())
  WITH CHECK (restaurante_id = meu_restaurante_id());

-- ── 7. Realtime (sincronização entre aparelhos) ─────────────
ALTER PUBLICATION supabase_realtime ADD TABLE documentos;
ALTER PUBLICATION supabase_realtime ADD TABLE registros;
