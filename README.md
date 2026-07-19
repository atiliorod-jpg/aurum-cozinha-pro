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
| 9 | `src/lib/migration10_hardening.sql` | **Segurança**: fecha INSERT direto em `perfis` (quebra de multi-tenant via API), notas internas migram para tabela `admin_notas` só-RPC (cliente não lê mais), corte de plano/bloqueio no RLS (`restaurante_pode_escrever` em registros/documentos — leitura livre, escrita exige teste/assinatura vigente), token de convite 8→16 chars | ✅ rodado (17/07/2026) |
| 10 | `src/lib/migration11_convites_equipe.sql` | Convites passam a respeitar o corte de plano/bloqueio (`conv_ins_v11`/`conv_del_v11`); RPCs `desativar_usuario`/`reativar_usuario` (libera vaga sem apagar histórico; não desativa a si mesmo nem a última diretoria) | ✅ rodado (17/07/2026) |
| 11 | `src/lib/migration12_stripe.sql` | Coluna `stripe_customer_id` para o webhook reconhecer renovações mensais | ⏳ rodar só na Fase 2 do Stripe (ver `STRIPE_SETUP.md`) |
| 12 | `src/lib/migration13_aviso_pagamento.sql` | Colunas `aviso_pagamento_em/plano` + RPC `avisar_pagamento` (cliente avisa que pagou o Pix, vale vencido) + `ativar_assinatura` limpa o aviso + `limpar_aviso_pagamento` | ✅ rodado (18/07/2026) |
| 13 | `src/lib/migration14_aviso_nome.sql` (inline) | Coluna `aviso_pagamento_nome` + `avisar_pagamento(p_plano, p_nome)` guarda o nome de quem pagou | ✅ rodado (18/07/2026) |
| 14 | `src/lib/migration15_feedback.sql` | Tabela `feedback` (sem policy de client) + RPCs `enviar_feedback` (cliente envia bug/sugestão, vale vencido), `feedback_todos`/`marcar_feedback` (só super-admin) | ✅ rodado (18/07/2026) |
| 13 | `src/lib/migration14_pagador.sql` | Coluna `aviso_pagamento_nome` + `avisar_pagamento(p_plano, p_nome)` — guarda o nome de quem fez o Pix (app tem fallback se faltar) | ⏳ pendente (rodar no SQL Editor) |

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

-- migration9/10: RPCs de admin + hardening
select proname from pg_proc where proname in (
  'definir_max_usuarios', 'definir_bloqueio', 'usuarios_do_restaurante',
  'salvar_notas_admin', 'notas_admin_todas', 'restaurante_pode_escrever');

-- migration10: sem INSERT aberto em perfis (esperado: NENHUMA linha)
select policyname, cmd from pg_policies where tablename = 'perfis' and cmd = 'INSERT';

-- migration10: notas fora de restaurantes (esperado: erro "column does not exist")
-- select notas_admin from restaurantes limit 1;
```

**Corte de plano também no RLS (migração 10):** conta bloqueada ou com teste+assinatura vencidos continua LENDO os dados, mas qualquer escrita em `registros`/`documentos` é negada pelo banco (`restaurante_pode_escrever`) — a tela de bloqueio do app deixou de ser a única barreira. Se o plano vencer com o app offline, o outbox falha ao sincronizar: comportamento intencional (renovou → volta a subir). O período de teste (`interval '7 days'`) precisa ficar IGUAL a `TESTE_DIAS` em `src/utils/assinatura.js`.

## Permissões por função (matriz configurável)

A diretoria (quem cria o restaurante já entra assim) tem acesso total sempre. Em **Config → Acessos** ela ajusta uma matriz do que **cozinha** e **gerência** podem fazer (ver relatório, configurar, remover lançamentos, inventário, produtos, auditoria) — guardada em `prefs.permissoes`, com defaults que reproduzem o comportamento hierárquico antigo (`src/utils/permissoes.js`, helper `pode()`). É uma trava de **interface** (organiza a equipe, evita acidentes num time pequeno); as barreiras duras — criar convite, trocar cargo, painel admin — continuam enforçadas por cargo no banco.

## Pentest / regressão de segurança

Scripts em `scripts/` rodam ataques reais contra o Supabase (multi-tenant, convite, plano). **Precisam do `.env.local`** (URL + anon; service role para bloquear/limpar) e **criam contas `pentest.*@aurum.app` que devem ser APAGADAS depois** (Authentication → Users, ou o snippet de limpeza via service role). **Nunca no CI de produção** — prefira um projeto de staging.

```bash
node scripts/pentest-adversarial.mjs   # 13 checagens multi-tenant + m10 (S1/S2/S4, RPCs super-admin)
node scripts/pentest-convite.mjs       # convite: mesma memória, token 16, reuso bloqueado, R1 não queima
node scripts/pentest-m11.mjs           # M1 (convite respeita bloqueio) + P1 (desativar/reativar)
```

Última execução (17/07/2026): 13/13 + suíte convite + 9/9 (m11), todas PASS; contas de teste apagadas.

**Segurança da conta super-admin:** ative MFA (TOTP) em `atiliopinpolho@gmail.com` no Supabase Auth e use senha forte e exclusiva — `sou_super_admin()` confia no e-mail do JWT, então comprometer esse e-mail = acesso total.

**Atenção:** o `aceitar_convite` do migration4 usa `perfis.ativo` e `restaurantes.max_usuarios`. Se o schema não tiver essas colunas:
```sql
alter table perfis add column if not exists ativo boolean default true;
alter table restaurantes add column if not exists max_usuarios int default 3;
```

## Deploy

Push na branch `main` → GitHub Actions (`.github/workflows/deploy.yml`) roda **test → lint → audit → build** e publica no GitHub Pages. Não há fluxo de PR (projeto solo).

**Secrets do repositório** (Settings → Secrets and variables → Actions):
`VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` · `VITE_STRIPE_PUBLISHABLE_KEY` · `VITE_STRIPE_PAYMENT_LINK`

**Pagamento por Pix (manual):** a tela de Assinatura mostra a chave Pix + QR (BR Code) e um botão "Já paguei" que registra um aviso para o super-admin (RPC `avisar_pagamento`, funciona mesmo com a conta vencida) e abre o WhatsApp para o cliente mandar o comprovante. Configure via secrets:
`VITE_PIX_CHAVE` (a chave — **use uma chave aleatória** do banco, não CPF/telefone, já que o valor fica público no app) · `VITE_PIX_NOME` (nome do recebedor, sem acento) · `VITE_PIX_CIDADE`. Sem `VITE_PIX_CHAVE`, a tela cai no fluxo só-WhatsApp. Planos: Mensal R$149, Semestral −10%, Anual −20% (`src/utils/assinatura.js`). O super-admin ativa o plano pago no `/admin` (botões Mensal/Semestral/Anual). **Teste o QR escaneando com seu banco uma vez** — o padrão BR Code é sensível a um caractere.

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
