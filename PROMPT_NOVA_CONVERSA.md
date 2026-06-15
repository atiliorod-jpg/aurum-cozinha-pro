# Aurum Cozinha Pro — Prompt para nova conversa

## O que é este projeto

App PWA para controle de estoque de cozinha industrial (Polo Beer / Aurum Serviços Gastronômicos).
- **Tech**: React + Vite + Tailwind CSS v3, offline-first (vite-plugin-pwa), Supabase (multi-tenant, RLS, realtime)
- **Repositório local**: `C:\Users\atili\Downloads\Code\polo-estoque`
- **Branch de trabalho**: `feat/supabase`
- **Deploy**: GitHub Pages — `npx gh-pages -d dist` após `$env:VITE_BASE='/aurum-cozinha-teste/'` + `npm run build`
- **Credenciais de teste**: `teste-prod@aurum.app` / `teste123`
- **Git**: sempre usar `-c user.email="atiliopinpolho@gmail.com" -c user.name="atiliorod-jpg"`
- **Preview local**: servidor Vite na porta 5173

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
# Instalar dependências (se necessário)
npm install

# Servidor de desenvolvimento
npm run dev
# → http://localhost:5173

# Build de produção para gh-pages
$env:VITE_BASE='/aurum-cozinha-teste/'
npm run build

# Deploy — OBRIGATÓRIO usar -r para o repo correto
npx gh-pages -d dist -u "atiliorod-jpg <atiliopinpolho@gmail.com>" -r "https://github.com/atiliorod-jpg/aurum-cozinha-teste.git"
# ATENÇÃO: o remote 'origin' local é 'polo-estoque' (repo de desenvolvimento).
# O site é servido pelo repo SEPARADO 'aurum-cozinha-teste'. Sem o -r, o deploy vai para o lugar errado.
```

Login de teste: `teste-prod@aurum.app` / `teste123`

---

## Estado atual do sistema (junho/2026)

- Todas as correções da auditoria completa foram aplicadas (críticos C1–C5, altos A1–A7, médios M1–M10, baixos B1–B5)
- Sistema em uso pelo restaurante Polo Beer / Polo Central
- Branch `feat/supabase` tem tudo; `main` pode estar desatualizado
