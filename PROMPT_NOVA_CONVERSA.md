# Aurum Cozinha Pro — Prompt para nova conversa

## O que é este projeto

App PWA para controle de estoque de cozinha industrial (Polo Beer / Aurum Serviços Gastronômicos).
- **Tech**: React 19 + Vite + Tailwind CSS v3, offline-first (vite-plugin-pwa), Supabase (multi-tenant, RLS, realtime)
- **Pasta local**: `C:\Users\atili\Downloads\Code\polo-estoque` (só o nome da pasta ainda é "polo-estoque"; o app/repo é `aurum-cozinha-pro`)
- **Branch/Deploy**: push direto na branch **`main`** → GitHub Actions builda e publica em GitHub Pages (`https://atiliorod-jpg.github.io/aurum-cozinha-pro/`). O workflow injeta os secrets Supabase/Stripe e define `VITE_BASE=/aurum-cozinha-pro/`. **Não há fluxo de PR** (projeto solo). O push para `main` pode ser bloqueado pelo classificador auto-mode — basta repetir com justificativa.
- **Repo único**: `origin` → `https://github.com/atiliorod-jpg/aurum-cozinha-pro.git`. Repo antigo `polo-estoque` foi DELETADO.
- **Super-admin**: email `atiliopinpolho@gmail.com` (campo `sessao.eSuperAdmin`); rota `/admin`, sem senha extra (usa o login normal). **Conta já criada no Supabase Auth (15/06/2026).**
- **Preview local**: `npm run dev` na porta 5173 (exige login Supabase — não dá para passar da tela de login no preview sem credenciais)

---

## Arquitetura geral

### Estado global (`src/store/AppContext.jsx`)
- Catálogos (documentos JSONB no Supabase): `produtos`, `categorias`, `pessoas`, `destinos`, `fichas`, `producoes`, `locais`, `listaManual`, `prefs`
- Registros operacionais (tabela `registros`): `compras`, `entradas`, `saidas`, `aparas`, `desperdicio`, `ajustes`, `auditoria`
- **Outbox pattern**: offline → `outboxAdd` → sync quando volta internet
- **`aplicaReg`**: merge server data + local-only items (race condition fix)
- **`calcEstoquePuro`**: estoque calculado (entradas − saídas − desperdício − aparas + ajustes)
- **`calcLotes`**: rastreio FEFO (first expired, first out) com validades por lote
- **`prefs.autoMinMax`**: recalcula mín/máx automaticamente pela média de saídas dos últimos 15 dias
- **`logAudit`**: grava trilha de auditoria (guard `(prev || []).slice(-1999)` — protegido contra null)
- **`soLeitura`**: `!!impersonando && !impersonando.podeMexer` — bloqueia toda escrita em modo suporte somente-leitura

### Preferências (`prefs`)
- **Aparelho** (não sincronizam): `responsavel`, `turno`, `destino`
- **Restaurante** (sobem para nuvem): `autoMinMax`, `diasMin`, `diasMax`, `guia`, `suporteAtivo`, `suportePermissao`
- `guia: true` por padrão — mostra o painel "Fluxo do turno" em todas as telas
- `suporteAtivo`: timestamp Unix (Date.now() + 24h) quando o cliente autoriza suporte
- `suportePermissao`: `'ver'` | `'mexer'` — o que o cliente permitiu ao super-admin fazer

### Fluxo de produção
- `producoes[]`: receitas com `produtoFinalId`, `rendimentoBase`, `armazenamento`, `ingredientes[]`
- Ingrediente com `abate: true` → produto com estoque controlado (dá baixa)
- Ingrediente com `abate: false` → monitorado/rastreado apenas (não dá baixa no estoque)
- Registrar produção (em `/registrar`) → cria 1 `entrada` (produto final) + 1 `saida` vinculada (`producaoId`)

---

## Páginas e rotas

| Rota | Página | Cargo mínimo |
|------|--------|-------------|
| `/` | Dashboard (Início) | cozinha |
| `/entradas` | Entrada de Mercadoria | cozinha |
| `/saidas` | Saídas para Restaurantes | cozinha |
| `/aparas` | Aparas & Perdas | cozinha |
| `/registrar` | Produção (receitas) | cozinha |
| `/compras` | Compras / Recebimento | cozinha |
| `/inventario` | Inventário / Contagem física | cozinha |
| `/historico` | Histórico | cozinha |
| `/relatorio` | Relatório | gerencia |
| `/configuracoes` | Configurações | gerencia |
| `/auditoria` | Histórico de Mudanças | gerencia |
| `/admin` | Painel super-admin | só `eSuperAdmin` |

Cargos: `cozinha` < `gerencia` < `diretoria`

---

## Componentes-chave

- **`Layout.jsx`**: header, marca d'água, NavBar, injeta `<GuideTour />` no topo do `<main>`. Guard `(sessao.nome || '?').slice(0,1)` — protegido contra nome null (super-admin sem perfil completo).
- **`GuideTour.jsx`**: painel "Fluxo do turno" (Entradas → Aparas → Produção → Saídas), dispensável por dia via localStorage, controlado por `prefs.guia`
- **`NavBar.jsx`**: badge numérico no Início (produtos abaixo do mín), badge "🍲" quando há receitas a produzir
- **`AutocompleteInput.jsx`**: substituiu o `<datalist>` nativo (era preto no Android). Lista estilizada com busca, setas ↑↓, Enter/Esc, click-outside. Usado em "item comprado" e "fornecedor".
- **`Charts.jsx`**: gráficos com guard `v == null ? '—'` e `?.data?.slice(5)` para evitar NaN/null.
- **`UIContext.jsx`**: toasts, modal confirm (Escape + backdrop click fecha se não `perigo`)

---

## Utilitários principais

| Arquivo | O que faz |
|---------|-----------|
| `src/utils/estoque.js` — `calcEstoquePuro` | Calcula estoque atual por produto |
| `src/utils/lotes.js` — `calcLotes` | FEFO: rastreia lotes por validade |
| `src/utils/analise.js` — `listaDeCompras` | Lista de compras automática (abaixo do mín) |
| `src/utils/analise.js` — `agruparListaPorMateriaPrima` | Agrupa lista de compras por `produto.materiaPrima` |
| `src/utils/analise.js` — `fatorCorrecaoItem` | FC histórico (aparas/perdas por compra) |
| `src/utils/analise.js` — `fatorCorrecaoProduto`/`fcEfetivo` | FC calculado AO VIVO |
| `src/utils/sugestoes.js` — `calcSugestoesMinMax` | Sugere mín/máx por consumo real |
| `src/utils/datas.js` — `validarDataRegistro` | Valida datas (não futuras, confirma se muito antigas) |

---

## Decisões de design importantes

1. **`prefs.guia`**: ligado por padrão (`prefs.guia === false` é o único estado "desligado"); toggle em Config → Sistema.
2. **Cocção (`coccao`)**: campo só aparece no modal de produto quando há alguma receita (`producoes`) que usa o produto.
3. **`entradaCozida`**: flag separada — produto entra no estoque já cozido — afeta cálculo de bruto na lista de compras.
4. **Excluir produto → desativar**: preserva histórico; o "×" nas configurações faz `ativo: false`.
5. **`autoMinMax` com `useRef`**: evita loop `useEffect` — lê `produtos` via ref sem colocá-lo como dependência.
6. **FC por ingrediente/matéria-prima**: um FC do filé cobre todas as preparações que usam filé (todas saem do mesmo estoque limpo).
7. **`materiaPrima`** no produto: campo livre editável na TabelaRendimento (Config→Sistema). Produtos com a mesma `materiaPrima` (case-insensitive) são agrupados na lista de compras.

---

## Segurança e multi-tenant

### Supabase (`SUPABASE_SETUP.sql` — JÁ RODADO em 15/06/2026)
- **RLS ativo** em: `restaurantes`, `perfis`, `registros`, `documentos`, `convites`, `sessoes`
- **`meu_restaurante()`**: função STABLE SECURITY DEFINER que retorna `restaurante_id` do usuário logado (evita recursão de policy)
- **`sou_super_admin()`**: verifica `auth.jwt() ->> 'email' = 'atiliopinpolho@gmail.com'`
- **`alterar_cargo(p_usuario, p_cargo)`**: RPC SECURITY DEFINER — valida quem chama, impede autopromoção
- **Tabela `sessoes`**: sessão única por conta (1 aparelho por vez); Realtime ativo
- **Limite 3 contas/restaurante**: guard em `criarConvite` (frontend) + esboço de RPC `aceitar_convite` no SQL

### Modo suporte (impersonação)
- **`AuthContext`**: `impersonando = { restauranteId, restauranteNome, podeMexer }` | null
- **`verComoRestaurante(id, nome, podeMexer)`**: só funciona se `sessao.eSuperAdmin`
- **`AppContext`**: `rid = impersonando?.restauranteId || sessao?.restauranteId` — troca o restaurante lido
- **`soLeitura = !!impersonando && !impersonando.podeMexer`**: bloqueia toda escrita se cliente só autorizou "ver"
- **`BannerSuporte`** (App.jsx): faixa âmbar (somente leitura) ou vermelha (pode editar) + botão "Sair"
- **Admin.jsx**: lê `documentos.chave='prefs'` para obter `suporteAtivo` e `suportePermissao` — NÃO lê de `registros`

### Sessão única
- **`registrarSessaoAtiva(userId)`**: chamado em todo login; upsert em `sessoes` com token novo
- **Realtime**: effect escuta mudanças em `sessoes` para o próprio `user_id`; token diferente → `setDerrubado(true)` + signOut
- **Tela "Conta aberta em outro aparelho"**: renderizada antes do Login quando `derrubado === true`
- **Inerte** se a tabela `sessoes` não existir (try/catch silencioso)

### Conta super-admin
- Email: `atiliopinpolho@gmail.com`
- **Conta criada** no Supabase Auth em 15/06/2026 (via Dashboard → Authentication → Users → Add user)
- Sem restaurante próprio → `"/"` redireciona direto para `"/admin"` (não trava em "cadastro incompleto")

---

## Features recentes (15/06/2026 — sétima/oitava rodada)

- **Modo suporte ver/editar**: cliente escolhe "👁️ Só visualizar" ou "✏️ Ver e editar" antes de autorizar. `prefs.suportePermissao` armazena a escolha. Banner do admin muda de cor.
- **Sessão única (1 aparelho/conta)**: tabela `sessoes` + realtime. Derruba automaticamente o aparelho anterior ao logar em outro.
- **Máximo 3 contas por restaurante**: guard em `criarConvite` + toast de aviso.
- **`alterarCargo` via RPC segura**: não faz UPDATE direto; chama `alterar_cargo()` SECURITY DEFINER.
- **RLS completo** rodado no Supabase (ver `SUPABASE_SETUP.sql`).
- **APK gerado via PWABuilder** (Package ID: `io.github.atiliorod.aurum`, aba "Other Android"). Arquivo `.zip` baixado em `Downloads/`. Instalar `app-release-signed.apk` no tablet.
- **Bug corrigido — tela branca**: `sessao.nome` era null para o super-admin (sem perfil no banco) → `(sessao.nome || '?').slice(0,1)` em Layout.jsx. `(prev || []).slice(-1999)` em AppContext.jsx.
- **`AutocompleteInput`**: substitui `<datalist>` nativo (preto no Android) por lista estilizada.
- **TabelaRendimento colapsável**: estado `aberto` (default false), cabeçalho-botão com setinha.
- **Busca na lista de compras**: filtra por nome e `materiaPrima`.
- **Agrupamento por matéria-prima**: `agruparListaPorMateriaPrima` em analise.js; grupo expansível na lista.
- **Renomear ingrediente**: botão ✏️ inline no card da TabelaRendimento.
- **"suporte (Aurum)"**: substituiu "suporte (Atílio)" em todos os textos.

---

## Pendências abertas

- **SQL no Supabase (ação manual, SQL Editor):** (1) verificar se `migration4_hardening.sql` foi rodado — `select polname from pg_policies where tablename='convites';` deve mostrar `conv_*_v4`; se mostrar `conv_insert` antiga, rodar o migration4; (2) rodar `src/lib/migration5_convite_valido.sql` (novo, 03/07 — valida convite antes do signUp; sem ele o app usa fallback e funciona como antes).
- **APK no tablet**: arquivo baixado em Downloads/. Passar para o tablet via USB/Google Drive e instalar. Aceitar "instalar de fontes desconhecidas" se pedido. Package ID salvo: `io.github.atiliorod.aurum` — **guardar o .zip e a chave de assinatura** para futuros updates de APK. **Obs:** manifest mudou (`orientation: any`) — vale regenerar o APK no PWABuilder quando for atualizar.
- **Stripe ainda em test mode**: falta ativar live mode + conta bancária BRL para saque.
- **M9 (Compra + Entrada unificada)**: adiado pelo próprio dono; reescrita grande do fluxo de recebimento.
- **Auditoria completa 03/07/2026** em `AUDITORIA_COMPLETA_2026-07-03.md` (nota 70/100, roadmap 30/60/90d). Bloco P0/P1 de código JÁ aplicado (duplo clique produção, conta órfã de convite, xlsx 0.20.3 → 0 vulnerabilidades, zoom liberado, logo 1,8MB→366KB, orientation any, noopener). **Custos/CMV = fora de escopo por decisão do dono** (app é de produção/estoque; custos ficam na planilha Ficha Técnica).

---

## Como testar / deploy

```bash
npm install            # se necessário
npm run dev            # dev server → http://localhost:5173
npx vitest run         # testes (32/32)
npx vite build         # build local de sanidade

# Deploy = só commitar e dar push na main; o GitHub Actions faz o resto.
# NUNCA usar git add -A (o classificador bloqueia por causa do .env.local) — adicionar arquivos por nome.
git add <arquivos> && git commit -m "mensagem" && git push origin main
```

Login de teste: `teste-prod@aurum.app` / `teste123`

---

## Arquivos importantes

| Arquivo | O que é |
|---------|---------|
| `SUPABASE_SETUP.sql` | SQL completo de RLS, sessões, funções seguras — JÁ RODADO |
| `GUIA_APK_TABLET.md` | Passo a passo PWABuilder → APK → tablet |
| `src/store/AuthContext.jsx` | Auth + impersonação + sessão única |
| `src/store/AppContext.jsx` | Estado global + guards soLeitura |
| `src/pages/Admin.jsx` | Painel super-admin (lista restaurantes, suporte) |
| `src/pages/Configuracoes.jsx` | Config sistema: TabelaRendimento, suporte, instalar app |
| `src/utils/analise.js` | FC, lista de compras, agrupamento por matéria-prima |
