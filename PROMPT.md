# PROMPT — Polo Beer / Aurum Estoque (atualizado 2026-06-13)

## Contexto geral
Você é especialista em dev React, design/UX, acessibilidade e gastronomia. Este é um app tablet PWA de controle de estoque de cozinha para a Polo Beer / Aurum. Sempre que notar algo ruim em design, acessibilidade ou lógica de negócio gastronômico, aponte antes de implementar.

## Stack técnica
- React + Vite + Tailwind CSS v3 (PWA)
- Deploy: GitHub Pages em `https://atiliorod-jpg.github.io/aurum-cozinha-teste/`
- Supabase multi-tenant (RLS + realtime), `@supabase/supabase-js` v2
- offline-first: localStorage cache + outbox pattern
- Testes: Vitest, 20 testes em `src/utils/*.test.js`
- **Deploy SEMPRE via PowerShell**: `$env:VITE_BASE='/aurum-cozinha-teste/'; npm run build` — NUNCA bash (MSYS converte paths)

## Estrutura de stores (AppContext)
- `produtos` — matérias-primas e produtos finais (modelo unificado, ver abaixo)
- `saidas` — saídas para pontos de venda; saídas com `destino='producao'` são internas e NÃO entram no estoque calculado
- `entradas` — entradas avulsas (produto pronto sem receita)
- `compras` — recebimento de fornecedores
- `aparas` + `desperdicio` — perdas e aproveitamentos
- `producoes` — receitas de produção (vários ingredientes → 1 produto final com rendimento)
- `fichas` — LEGADO (fichas de gramatura antigas), mantidas só para migração automática
- `prefs` — preferências: `autoMinMax`, `diasMin`, `diasMax`, `gramaturasMigradas`, etc.
- `locais` — pontos de venda (destinos de saída)
- `destinos` — destinos de aparas
- `pessoas`, `categorias` — cadastros auxiliares

## Modelo de produto (unificado desde 2026-06-13)
```js
{
  id: string,
  nome: string,
  categoria: string,
  unidade: 'kg' | 'unid' | 'g' | 'L',
  estoqueInicial: number,
  min: number,         // estoque mínimo
  max: number,         // estoque máximo
  valCongelado: number, // dias de validade congelado
  valResfriado: number, // dias de validade resfriado
  pesoUnidade: number,  // g por unidade (só unid)
  ativo: boolean,

  // GRAMATURA / PORCIONAMENTO (antes ficavam em fichas — agora aqui)
  gramatura: number,      // g por porção (0 = não configurado)
  coccao: number,         // % de perda no cozimento (0..90)
  entradaCozida: boolean, // true = produto ENTRA NO ESTOQUE JÁ COZIDO
                          // (ex: cupim cozido, carne de sol desfiada)
                          // false = entra cru (filé de frango, etc.)
}
```

### O que `entradaCozida` afeta:
- **Lista de compras**: quando `entradaCozida=true`, o `brutoKg` na lista aplica tanto FC (fator de correção histórico) quanto cocção: `brutoKg = liquidoKg / (1-FC) / (1-coccao%)`. Para itens crus, cocção NÃO entra na compra.
- **Calculadora de porções**: cocção aplica SEMPRE quando tem `p.coccao > 0` (você cozinha o item antes de servir, independente de como entrou no estoque).

## Cálculo de estoque
```js
calcEstoquePuro = estoqueInicial + Σentradas − Σsaidas(exceto destino='producao') − Σperdas(origem='estoque')
```
- `calcLotes` em `utils/lotes.js` — sistema FEFO de lotes
- `calcSugestoesMinMax` em `utils/sugestoes.js` — janela 15 dias, usa `prefs.diasMin` / `prefs.diasMax`

## FC (Fator de Correção)
- Calculado historicamente de aparas + perdas ligadas a compras de cada produto
- Está em `fatorCorrecaoItem` em `utils/analise.js`
- Aparece na lista de compras como "% de perda na limpeza/preparo"

## Receitas de produção (`producoes`)
```js
{
  id, nome,
  produtoFinalId: string,  // produto que entra no estoque
  rendimentoBase: number,  // quanto rende
  armazenamento: 'congelado' | 'resfriado',
  ingredientes: [{ abate: boolean, produtoId?: string, nome?: string, unidade?: string, quantidade: number }]
}
```
- `abate=true` → baixa do estoque controlado
- `abate=false` → só monitora (estoque seco), sem baixa real
- Itens produzidos entram no estoque via `saidas` com `destino='producao'` (são saídas internas dos ingredientes) e `entradas` do produto final

## Migração fichas → produtos (AppContext.jsx)
- Na primeira carga, o `useEffect` de migração copia `gramatura` e `coccao` das fichas antigas para o produto correspondente (match por nome)
- Controlado por `prefs.gramaturasMigradas = true`
- As fichas antigas continuam no store (não apaga) mas a UI não as usa mais para criar novas

## Arquitetura das telas
- `/` → Dashboard (estoque, alertas, CalculadoraProducao)
- `/registrar` → Hub com 3 seções: Recebimento (Compra) | Estoque interno (Produção + Entrada avulsa) | Saída e correções (Saída + Apara/Perda)
- `/compras` → Tabs: "Nova compra" + "Lista de compras" (sem Planejar)
- `/entradas`, `/saidas`, `/aparas` → formulários
- `/producao` → executa receita, baixa ingredientes, entrada do produto final
- `/configuracoes` → tabs: Produtos | Receitas (Gramaturas via produtos + Produções) | Acessos | Sistema

## Padrões de código
- **Inputs numéricos**: SEMPRE store como string enquanto edita, converter só em `onBlur` — NUNCA `onChange={parseFloat()||0}` (isso trava o campo ao apagar)
- Modal z-index: `z-[70]` (NavBar é z-50)
- Formatação: `fmtNum` em `utils/formatters.js`
- Sem comentários óbvios no código; comentários só para WHY não-óbvio

## Deploy step-by-step
```powershell
# 1. Build (no aurum-cozinha-pro)
cd C:\Users\atili\Downloads\Code\aurum-cozinha-pro
$env:VITE_BASE='/aurum-cozinha-teste/'; npm run build

# 2. Sincronizar branch gh-pages
cd C:\Users\atili\Downloads\Code\aurum-cozinha-teste
git fetch origin
git reset --hard origin/gh-pages

# 3. Copiar dist
$src = "C:\Users\atili\Downloads\Code\aurum-cozinha-pro\dist"
$dst = "C:\Users\atili\Downloads\Code\aurum-cozinha-teste"
Get-ChildItem $dst -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
Copy-Item -Path "$src\*" -Destination $dst -Recurse -Force

# 4. Commit + push
git add -A
git -c user.email="atiliopinpolho@gmail.com" -c user.name="atiliorod-jpg" commit -m "deploy: mensagem aqui"
git push origin gh-pages --force
```

## Supabase
- Projeto: `aurum-cozinha` (prod) + `aurum-cozinha-teste` (staging, mesmo banco)
- RLS ativo; `empresa_id` em todos os registros
- Realtime subscriptions em todos os stores principais
- `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

## O que está PENDENTE / pode melhorar
1. **Tela de Produção (`/producao`)**: verificar se o produto final entra corretamente no estoque e se os ingredientes aparecem nas saídas com `destino='producao'`
2. **AparasPerdas**: confirmar que produtos de produção aparecem no seletor de produto (não só matérias-primas brutas)
3. **Receitas simplificadas**: o modal de nova receita poderia ter um fluxo guiado 3 passos (nome+produto, gramatura, ingredientes)
4. **Fichas antigas no Supabase**: após confirmar que migração funcionou, pode limpar a tabela `fichas` do banco (não urgente)
5. **Chunk size warning**: `index.js` está em 631KB — considerar code-splitting por rota futuramente
6. **PWA cache**: sempre hard-refresh (Limpar dados do site) após deploy para pegar novo SW
