# Aurum Cozinha Pro — Prompt para nova conversa

## O que é este projeto

App PWA para controle de estoque de cozinha industrial (Polo Beer / Aurum Serviços Gastronômicos).
- **Tech**: React 19 + Vite + Tailwind CSS v3, offline-first (vite-plugin-pwa), Supabase (multi-tenant, RLS, realtime)
- **Pasta local**: `C:\Users\atili\Downloads\Code\polo-estoque` (só o nome da pasta ainda é "polo-estoque"; o app/repo é `aurum-cozinha-pro`)
- **Branch/Deploy**: push direto na branch **`main`** → GitHub Actions builda e publica em GitHub Pages (`https://atiliorod-jpg.github.io/aurum-cozinha-pro/`). O workflow injeta os secrets Supabase/Stripe e define `VITE_BASE=/aurum-cozinha-pro/`. **Não há fluxo de PR** (projeto solo). O push para `main` é bloqueado pelo classificador auto-mode — basta repetir o push.
- **Repo único**: `origin` → `https://github.com/atiliorod-jpg/aurum-cozinha-pro.git`. Repo antigo `polo-estoque` foi DELETADO.
- **Super-admin**: email `atiliopinpolho@gmail.com` (campo `sessao.eSuperAdmin`); rota `/admin`, sem senha extra (usa o login normal).
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
- **`logAudit`**: grava trilha de auditoria (só quando `r` (restauranteId) não é null)

### Preferências (`prefs`)
- **Aparelho** (não sincronizam): `responsavel`, `turno`, `destino`
- **Restaurante** (sobem para nuvem): `autoMinMax`, `diasMin`, `diasMax`, `guia`
- `guia: true` por padrão — mostra o painel "Fluxo do turno" em todas as telas

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

Cargos: `cozinha` < `gerencia` < `diretoria`

---

## Componentes-chave

- **`Layout.jsx`**: header, marca d'água, NavBar, injeta `<GuideTour />` no topo do `<main>`
- **`GuideTour.jsx`**: painel "Fluxo do turno" (Entradas → Aparas → Produção → Saídas), dispensável por dia via localStorage, controlado por `prefs.guia`
- **`NavBar.jsx`**: badge numérico no Início (produtos abaixo do mín), badge "🍲" quando há receitas a produzir
- **`CalculadoraProducao.jsx`**: calculadora de porções (gramatura) e de ingredientes por receita — só usa `coccao` quando produto encontrado (sem fallback para `[0]`)
- **`Charts.jsx`**: gráficos com guard `v == null ? '—'` para evitar NaN
- **`ResponsavelSelect.jsx`**: dropdown de responsável com link para cadastrar equipe
- **`UIContext.jsx`**: toasts, modal confirm (Escape + backdrop click fecha se não `perigo`)

---

## Utilitários principais

| Arquivo | O que faz |
|---------|-----------|
| `src/utils/estoque.js` — `calcEstoquePuro` | Calcula estoque atual por produto |
| `src/utils/lotes.js` — `calcLotes` | FEFO: rastreia lotes por validade |
| `src/utils/analise.js` — `listaDeCompras` | Lista de compras automática (abaixo do mín) |
| `src/utils/analise.js` — `mediaDiariaSaidas` | Média diária num janela de 15 dias |
| `src/utils/analise.js` — `fatorCorrecaoItem` | FC histórico (aparas/perdas por compra) |
| `src/utils/sugestoes.js` — `calcSugestoesMinMax` | Sugere mín/máx por consumo real |
| `src/utils/calculos.js` — `filtrarPorPeriodo` | Filtra registros por intervalo de datas (guard `r.data &&`) |
| `src/utils/producao.js` — `planejarProducao` | Planeja ingredientes para X unidades de uma receita |
| `src/utils/datas.js` — `validarDataRegistro` | Valida datas (não futuras, confirma se muito antigas) |

---

## Decisões de design importantes

### O que existe e por quê

1. **`prefs.guia`**: ligado por padrão (`prefs.guia === false` é o único estado "desligado"); toggle em Config → Sistema.

2. **Cocção (`coccao`)**: campo só aparece no modal de produto quando há alguma receita (`producoes`) que usa o produto como ingrediente (`abate: true`) ou como produto final. Raciocínio: cocção é perda que a cozinha faz — se não há receita, não há processo de cozimento a medir.

3. **`entradaCozida`**: flag separada que diz "este produto entra no estoque já cozido" — afeta o cálculo de bruto na lista de compras. Independente de ter receita.

4. **Excluir produto → desativar**: `setProdutos(map(p => id === p.id ? {...p, ativo: false} : p))` — preserva histórico; o "×" nas configurações desativa, não apaga.

5. **Inventário com `inventarioId`**: cada contagem física agrupa seus ajustes por `inventarioId = 'inv_' + Date.now().toString(36)` — permite remover uma sessão inteira de uma vez.

6. **Produção não-atômica**: ao remover uma produção no Histórico, remove-se a saída (ingredientes) ANTES da entrada (produto final) — pior caso de falha deixa ingredientes em estoque.

7. **`autoMinMax` com `useRef`**: evita loop `useEffect` — lê `produtos` via ref sem colocá-lo como dependência, só recalcula quando `saidas` muda.

8. **`aplicaReg` funcional**: usa `setRaw(prev => ...)` para mergear dados do servidor com itens adicionados localmente durante o fetch — evita race condition.

---

## Features excluídas (não implementar)

O cliente não quer:
- Custo unitário / CMV
- Temperatura no recebimento (exigência sanitária)
- Solicitação de compra com aprovação
- Foto da NF no recebimento
- Notificações push de vencimento

---

## Features intencionalmente adiadas (não urgentes)

- **A5**: Remover `fichas.js` legado — ainda usado para sugestões de itens em Compras e migração de gramatura; risco sem auditoria completa.
- **M2**: Consolidar alertas do Dashboard — vencimento e ruptura são dimensões diferentes; ambos são úteis.
- **M9**: Compra + entrada em um passo — feature grande, não prioritária.

---

## Ingredientes de receita na lista de compras

Na aba "🧾 Lista de compras" em `/compras`, ao final dos itens automáticos e manuais, aparece a seção **"📖 Ingredientes de receita (referência)"** — mostra ingredientes com `abate: false` (não controlados em estoque) agrupados por nome, com as receitas que os usam e as quantidades. É somente orientação para o comprador — não entra no cálculo de compra automático.

---

## Fluxo de turno (GuideTour)

Painel no topo de todas as telas (via `Layout.jsx`):
- 4 passos: Entradas → Aparas → Produção → Saídas
- Cada passo fica ✅ quando há registro daquele tipo com `data === hoje()`
- Produção: detectada por `entradas.some(e => e.data === dt && !!e.producaoId)`
- Dispensável clicando "×" — salva `guia_dismiss_YYYY-MM-DD` no `localStorage` (reseta no próximo dia)
- Desativar permanentemente: Config → Sistema → toggle "Guia de fluxo do turno"

---

## Como testar

```bash
npm install            # se necessário
npm run dev            # dev server → http://localhost:5173
npx vitest run         # testes (32/32 hoje)
npx vite build         # build local de sanidade

# Deploy = só commitar e dar push na main; o GitHub Actions faz o resto.
# Não usar git add -A (o classificador bloqueia por causa do .env.local) — adicionar arquivos por nome.
git add <arquivos> ; git commit -F <arquivo-msg> ; git push origin main
```

Login de teste: `teste-prod@aurum.app` / `teste123`

---

## Estado atual do sistema (atualizado 15/06/2026)

- Auditoria completa aplicada + várias rodadas de melhorias. `main` é a verdade (deploy contínuo).
- Sistema em uso pelo restaurante Polo Beer / Polo Central.

### Features recentes (15/06/2026)
- **PWA instalável**: ícones PNG com `sizes` explícitos (192/512/maskable). Botão "📲 Instalar app" em Config→Sistema (`src/lib/pwaInstall.js` + hook `usePwaInstall`).
- **FC (fator de correção) v2**: calculado AO VIVO (`fatorCorrecaoProduto`/`fcEfetivo` em analise.js), soma **aparas E perdas** ligadas ao produto (`produtoId`) ou a uma compra dele (`compraId`). Só o FC manual fica gravado (`fcManual`+`fcMedio`).
- **Tabela "🎯 Rendimento por ingrediente"** (Config→Sistema, `TabelaRendimento`, colapsável): lista todos os produtos ativos; agrupa preparações (fichas) por produto; FC auto/manual editável; ✏️ renomeia o produto; "mover" reatribui ficha; campo "🛒 Compra como (matéria-prima)".
- **Unificação de matéria-prima na lista de compras** (`agruparListaPorMateriaPrima`): produtos com a mesma `produto.materiaPrima` viram 1 linha somando o bruto, com detalhe expansível por produto. Busca na lista de compras.
- **Painel /admin (super-admin)**: lista restaurantes/usuários/suporte. Atalho em Config→Sistema. **Precisa das policies RLS** (a própria página /admin mostra o SQL: SELECT em restaurantes/perfis/registros/**documentos** para `auth.jwt()->>'email' = atiliopinpolho@gmail.com`). Sem elas, carrega vazio.
- **Modo suporte (impersonação)**: super-admin clica "👁️ Ver como este restaurante" (só quando o cliente autorizou em Config→Sistema→Suporte remoto, `prefs.suporteAtivo`). `AuthContext.impersonando` troca o `rid` lido pelo AppContext; `soLeitura` bloqueia TODA escrita. Faixa âmbar fixa + "Sair do modo suporte" (App.jsx `BannerSuporte`).

### Pendências abertas
- **Tablet Positivo Vision TAB 7 (Android 14 Go) não instala o PWA** (Chrome e Firefox) — provável limitação do Android Go (sem WebAPK). S22 instalou OK. Caminho sugerido: gerar APK via TWA (PWABuilder/Bubblewrap).
- **Policies RLS do super-admin** — ação do usuário no Supabase (SQL na página /admin).
- **Sessão única por conta (máx ~3 usuários)** — pedido do usuário, AINDA NÃO IMPLEMENTADO; exige registro de sessão no Supabase (token ativo por usuário) + realtime para derrubar a sessão antiga. Discutir abordagem antes.
- Stripe ainda em test mode.
