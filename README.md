# Aurum Cozinha Pro

Controle de estoque e produção para cozinhas profissionais. PWA offline-first, multi-restaurante (multi-tenant), feito para tablet compartilhado na cozinha.

- **Produção:** https://atiliorod-jpg.github.io/aurum-cozinha-pro/
- **Stack:** React 19 + Vite + Tailwind CSS 3 · Supabase (Postgres + Auth + Realtime, RLS multi-tenant) · vite-plugin-pwa
- Obs.: a **pasta local** chama `polo-estoque` por razões históricas — o produto e o repositório são `aurum-cozinha-pro`. Não renomear (quebraria caminhos).

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:5173 — exige login (Supabase real)
npm test           # vitest (utils de cálculo: estoque, FEFO, sugestões…)
npm run lint       # zerado em 03/07/2026 — manter em zero (roda no CI)
npm run build      # build de produção
```

Crie um `.env.local` (gitignored) com:

```
VITE_SUPABASE_URL=<url do projeto Supabase>
VITE_SUPABASE_ANON_KEY=<publishable/anon key>
```

Login de teste: `teste-prod@aurum.app` / `teste123` (restaurante "Teste Produção").

## Banco de dados — ORDEM DOS SCRIPTS SQL (importante!)

Todos são colados no Supabase → SQL Editor e são idempotentes (seguro rodar de novo).
**A ordem importa** e o repo não sabe o que já foi rodado no banco — na dúvida, rode todos em ordem:

| # | Arquivo | O que faz | Status esperado |
|---|---------|-----------|-----------------|
| 1 | `src/lib/schema.sql` | Tabelas (restaurantes, perfis, convites, documentos, registros) | ✅ rodado (06/2026) |
| 2 | `SUPABASE_SETUP.sql` | RLS por restaurante, super-admin, sessão única, alterar_cargo | ✅ rodado (15/06/2026) |
| 3 | `src/lib/migration4_hardening.sql` | **Segurança crítica**: fecha escalada via convite, auditoria imutável, RPC criar_restaurante, anti-corrida no aceitar_convite | ✅ rodado (03/07/2026) |
| 4 | `src/lib/migration5_convite_valido.sql` | RPC `convite_valido` (valida convite antes do signUp — evita conta órfã) | ✅ rodado (03/07/2026) |
| 5 | `src/lib/migration6_indices.sql` | Índice composto de `registros` (performance com histórico grande) | ✅ rodado (03/07/2026) |
| 6 | `src/lib/migration7_suporte_assinatura.sql` | Suporte com edição (policies condicionadas à autorização 24h do cliente) + coluna `assinatura_ate` + RPC `ativar_assinatura` | ✅ rodado (07/07/2026) |
| 7 | `src/lib/migration8_versao_documentos.sql` | Versão nos catálogos + RPC `salvar_documento` (anti-sobrescrita entre 2 tablets; app tem fallback se faltar) | ✅ rodado (11/07/2026) |
| 8 | `src/lib/migration9_admin_convites.sql` | `aceitar_convite` v9 (não queima token se a conta já tem restaurante), RPCs de super-admin (`definir_max_usuarios`, `definir_bloqueio`, `usuarios_do_restaurante`, `salvar_notas_admin`) + colunas `bloqueado`/`notas_admin` | ✅ rodado (17/07/2026) |

`migration2.sql`/`migration3.sql` são históricos — superados pelo migration4 (que consolida as policies).

**Queries de checagem (SQL Editor) — banco novo ou na dúvida:**
```sql
-- migration4: policies consolidadas v4
select policyname from pg_policies where tablename = 'convites';
-- Esperado: conv_sel_v4, conv_ins_v4, conv_del_v4. Se aparecer "conv_insert" (antiga), rode o migration4.

-- migration5/7/8: funções existem?
select proname from pg_proc where proname in ('convite_valido', 'suporte_pode_editar', 'ativar_assinatura', 'criar_restaurante', 'aceitar_convite', 'salvar_documento');

-- migration6: índice existe?
select indexname from pg_indexes where indexname = 'idx_registros_rest_deleted_tipo_ts';

-- migration7: coluna de assinatura existe?
select column_name from information_schema.columns where table_name = 'restaurantes' and column_name = 'assinatura_ate';
```

**Atenção:** o `aceitar_convite` do migration4 usa `perfis.ativo` e `restaurantes.max_usuarios`. Se o schema não tiver essas colunas:
```sql
alter table perfis add column if not exists ativo boolean default true;
alter table restaurantes add column if not exists max_usuarios int default 3;
```

## Deploy

Push na branch `main` → GitHub Actions (`.github/workflows/deploy.yml`) roda **test → lint → audit → build** e publica no GitHub Pages. Não há fluxo de PR (projeto solo).

**Secrets do repositório** (Settings → Secrets and variables → Actions):
`VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` · `VITE_STRIPE_PUBLISHABLE_KEY` · `VITE_STRIPE_PAYMENT_LINK`

Regras deste repo:
- **Nunca `git add -A`** — adicionar arquivos por nome (protege o `.env.local`).
- A PWA usa service worker: depois de um deploy, o tablet mostra o banner "App atualizado".

## Arquitetura em 1 minuto

- **`src/store/AppContext.jsx`** — estado global offline-first: hidrata do cache (localStorage por restaurante) → rede → realtime; escritas são otimistas com fila de pendências (`src/lib/cache.js`, padrão outbox).
- **`src/store/AuthContext.jsx`** — Supabase Auth, convites, sessão única (1 aparelho/conta), modo suporte (impersonação somente leitura do super-admin).
- **`src/utils/`** — TODAS as regras de cálculo (estoque, lotes FEFO, mín/máx, fator de correção, produção), puras e testadas — páginas não recalculam nada.
- **Dados no banco:** `documentos` (catálogos JSONB: produtos, receitas, prefs…) + `registros` (1 tabela para todos os lançamentos, coluna `tipo`, soft-delete).
- Cargos: `cozinha` < `gerencia` < `diretoria`. Super-admin = e-mail em `sou_super_admin()` (SQL) + `Admin.jsx`.

## Documentos do projeto

- `PROMPT_NOVA_CONVERSA.md` — estado atual detalhado (para retomar o desenvolvimento)
- `AUDITORIA_COMPLETA_2026-07-03.md` — auditoria técnica + gastronômica, roadmap 30/60/90 dias
- `GUIA_APK_TABLET.md` — empacotar a PWA em APK (PWABuilder) para tablets Android Go
