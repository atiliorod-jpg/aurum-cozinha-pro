# Aurum Cozinha Pro — continuação (reescrito em 21/08/2026)

Cole este arquivo inteiro na primeira mensagem da nova conversa.

---

## Quem você é nesta conversa

Você continua o desenvolvimento do **Aurum Cozinha Pro**, um SaaS de controle de
estoque e produção para cozinhas profissionais. O dono é o Atílio (consultor
gastronômico, Recife/PE). Ele decide o produto; você implementa, audita e é
franco quando algo está errado — inclusive quando o erro foi seu.

**Pasta:** `C:\Users\atili\Downloads\Code\polo-estoque`
**Repositório GitHub:** `atiliorod-jpg/aurum-cozinha-pro` (privado)
⚠️ A pasta local se chama `polo-estoque` mas o repositório é `aurum-cozinha-pro`.

---

## ✅ O que mudou desde o prompt anterior

O prompt antigo dizia "Supabase pausado, duas migrations pendentes". **Nada
disso vale mais.** O banco está no ar e as migrações 17 a 22 foram aplicadas.

Confira antes de qualquer coisa:
```bash
node scripts/checar-migracoes.mjs   # pergunta ao BANCO, não lê os .sql
```

### Você consegue rodar migração sozinho

Existe `SUPABASE_ACCESS_TOKEN` (Personal Access Token) no `.env.local`, e o
executor usa a Management API:
```bash
node scripts/rodar-migracao.mjs 23        # roda; para no primeiro erro
node scripts/rodar-migracao.mjs --lista
node scripts/rodar-migracao.mjs 23 --dry  # só imprime o SQL
```
Há uma regra de permissão em `.claude/settings.local.json` liberando esses dois
scripts. **Não peça ao Atílio para colar SQL no SQL Editor.**

---

## ⛔ A falha de segurança que estava aberta (corrigida, mas leia)

`sou_super_admin()` era `auth.jwt() ->> 'email' = '...'`. Sem login não existe
claim de e-mail → `NULL = '...'` → **NULL**, e `not NULL` também é NULL. No
plpgsql `if NULL then` **não entra no ramo**, então `if not sou_super_admin()
then raise` nunca disparava. **Nove funções** dependiam dela.

Explorado ao vivo: `feedback_todos` vazava feedback real sem login, e
`ativar_assinatura` passava da trava (com um id real, qualquer anônimo se daria
400 dias de assinatura grátis).

**A lição vale para todo código novo:** em SQL, trava que devolve NULL não trava.
Use `coalesce(...)` antes de comparar e `is distinct from` no lugar de `<>`.
Corrigido na migração 19.

Por que passou meses despercebido: com a tabela vazia, a auditoria lia
"200 mas vazio" como "filtrou por dentro" e marcava ✅. **Tabela vazia não é RPC
segura.**

---

## O que o app é

PWA offline-first para cozinha, usado em **tablet**. React 19 + Vite 8 +
Tailwind 3. Backend Supabase (Postgres + RLS + Auth + Realtime). Deploy
automático no GitHub Pages a cada push na `main`.

**Modelo:** R$149/mês, 7 dias grátis, pagamento por **Pix** com ativação manual
pelo super-admin (`atiliopinpolho@gmail.com`). O Stripe existe no código mas
está inerte.

**⚠️ O app ainda NÃO tem uso real.** "Polo Beer" é conta de exemplo. Não vale
otimizar para escala nem construir mais módulos antes de uma cozinha de verdade
rodar um mês no primeiro.

---

## Arquitetura — o que você precisa entender antes de mexer

### Offline-first, e o modo de falha que domina esta base
Tudo grava primeiro em `localStorage` (`pe::<rid>::<chave>`) e sobe depois.
**A tela mostra sucesso mesmo quando o servidor recusou.** Isso já escondeu
vários bugs graves — sempre confira console e rede, nunca só o toast verde.

Desde 21/08, erro **definitivo** (violação de constraint) não vai mais para a
fila: o lançamento otimista é desfeito e a tela avisa. Erro de rede continua
enfileirando normalmente.

### Estoques (antes "módulos")
Três TIPOS, e a conta pode ter **várias instâncias** de cada:

| tipo | o que faz |
|---|---|
| `producao` | porcionamento, receitas, aparas (é o app original) |
| `finalizacao` | recebe da produção, fecha turno contando a sobra |
| `seco` | mantimentos: grãos, enlatados, descartáveis, limpeza |

**Instância:** `seco#x7k2` — tipo + `#` + 4 caracteres.
- Usa **`#` e não `:`** porque `lerTipo` corta no primeiro `:`
- A instância **RAIZ** mantém o id de sempre (`seco`, `producao`) → **nenhum
  dado precisa ser convertido**. Não quebre essa regra.
- `moduloValido` valida por **FORMATO**, nunca consultando o registro. Se
  dependesse do registro, arquivar uma instância faria `lerTipo` cair no
  fallback e **despejar o estoque daquele restaurante dentro da Produção**.

**Catálogo compartilhado, saldo e mín/máx próprios** (decisão do dono):
- catálogo: `catalogoDe(id)` → por TIPO. Todo Seco lê `seco::produtos`
- saldo: sai de graça, os lançamentos levam a instância no `tipo`
- mín/máx: documento `metas` por instância, sobreposto ao catálogo

`setProdutos` é o **ponto único** da separação catálogo × metas. Todas as telas
chamam com a lista inteira, como sempre — se cada uma soubesse da separação,
bastava uma esquecer para gravar o mínimo de um restaurante por cima do outro.

### Áreas: operação × administração
São **duas áreas separadas**, e isso foi corrigido a duro custo:
- `Layout` recebe `area="estoque"` (padrão) ou `area="admin"`
- na Administração **não** aparece a barra de operação nem o seletor de estoque
- **nenhum botão da Administração troca o estoque aberto.** Relatório e
  Financeiro têm um seletor próprio ("MOSTRANDO") que muda o que se OLHA
- `visoesPorEstoque` monta a visão de qualquer estoque a partir dos dados já
  baixados — custo zero de rede

⚠️ "Administração" **não** é um valor de `modulo`. Se fosse, toda chave viraria
`admin::produtos` e o banco recusaria em silêncio.

### Financeiro travado no BANCO
`verFinanceiro` é a única capacidade que é barreira dura: a policy de SELECT
chama `pode_ver_financeiro()` e a linha `precos` **não sai do servidor** para
quem não tem. Por isso preço mora na chave própria `precos`, nunca dentro de
`produtos` — o catálogo a cozinha precisa ver.

O custo entra pela tela de **Compras** (campo visível só a quem tem a
permissão), e o valor **não** é gravado na compra: `registros` é lido por todo
mundo. Vale a **última compra**.

`perda_em_reais(de, ate)` é um agregado do servidor: devolve só o TOTAL, nunca
a quebra por item — "queijo: R$ 120" + "2 kg de queijo" revelaria o custo.
⚠️ A conversão de unidade existe em **dois lugares** (JS e SQL). O
`pentest-financeiro.mjs` compara os dois; se divergirem, ele falha.

### Etiquetas com QR
Cada cópia impressa ganha um `loteId` único. O QR tem **orçamento apertado**
(`QR_MAX_CARACTERES = 106`) — numa térmica de 203 DPI cada módulo precisa de
~4 pontos. Há teste travando isso; se acrescentar campo, meça antes.

O nome impresso vem do **estoque** (opcional) com queda para o da conta.

---

## Onde paramos (21/08/2026)

Sessão longa. Segurança, Fases 0 a 4 completas.

```
1442552  Fecha a Fase 4: balanco consolidado, etiqueta por estoque, erro que nao mente
e92e75a  Administracao vira area de verdade + min/max por estoque (Fase 3)
8b02c3c  Multi-instancia funcionando: criar estoques, saldo separado, catalogo comum
3c8c183  Base para multi-instancia + Admin fora da barra
2feac0e  Financeiro: tela de custos na Administracao + captura do custo na compra
f8e7149  Perda em R$ para a equipe, sem entregar o custo de cada insumo
6d6ab65  Fase 2: financeiro travado NO BANCO, antes de existir tela de preco
b869dde  Fase 2: Administracao unificada como 4a opcao do seletor
48d59e2  SEGURANCA: logout de conta real nao apagava NADA do cache
416add3  Fase 1: cada estoque passa a dizer a verdade sobre o que ele e
d6ddec1  SEGURANCA: a trava de super-admin nunca travou (NULL nao e FALSE)
```

**Estado:** 201 testes, lint 0 erros, build ok, deploy verde, e2e 48/48,
pentest financeiro 18/18, auditoria 26/26, banco de produção limpo.

---

## Achados registrados e NÃO corrigidos

Ordem sugerida. **Escolha com o Atílio antes de implementar.**

### Segurança / dados
1. **Drift entre repositório e banco.** `alterar_cargo` em produção pode ser
   mais antiga que o arquivo do repo. Levante o que está lá:
   `select prosrc from pg_proc where proname = 'alterar_cargo';`
2. **Convites legados de 8 caracteres** (32 bits) são varríveis por força bruta:
   `update convites set expira_em = now() where length(token) = 8 and usado = false;`
3. **`importarBackup` aplica `prefs` sem whitelist** — backup adulterado
   reescreve permissões.
4. **`exportarBackup` não carimba de qual estoque veio**, e `importarBackup`
   aplica no aberto. Com várias instâncias, restaurar no lugar errado
   sobrescreve dado bom.
5. **Webhook Stripe desbloqueia conta suspensa** (inerte hoje).
6. **`registrar_auditoria` sem rate limit.**

### Lógica / integridade
7. **`pe::modulo` é do aparelho.** Já cai para a raiz quando o id não serve
   (`moduloUtilizavel`), mas **não avisa na tela** — a troca parece bug.
8. **Realtime é por restaurante**: todo tablet recebe toda linha de toda
   instância e filtra em memória. Com N instâncias, multiplica CPU e bateria.
9. **O cliente baixa TODOS os registros** e filtra no cliente. O índice
   `idx_registros_rest_deleted_tipo_ts` já existe; falta usar `.in('tipo', ...)`.
10. **`prefs` é da conta inteira** — `diasMin`, `diasMax`, `autoMinMax` valem
    para todos os estoques. Só o nome do estabelecimento foi separado.

### UX de cozinha (tablet)
11. **Recebimento partido em duas telas** — Compras não entra no estoque; é
    preciso redigitar em Entradas. É o maior ganho de fluxo disponível.
12. **Trabalho longo evapora sem aviso** — 25 min de contagem somem num toque.
    Falta rascunho e confirmação ao sair.
13. **Botão principal no topo em 3 telas e no rodapé em 3**, e desabilitado sem
    dizer o que falta.
14. **Alertas do Início são becos sem saída** — "risco de faltar" e "estoque
    negativo" não navegam (o de validade já virou atalho).
15. **Inventário sem "Todos" e sem busca.**
16. **Alvos de toque < 44px** em Remover, reimprimir e nos steppers.

### O que copiar da Suflex
"Controlados" é o recurso premium mais barato de construir: já existe `loteId`,
QR, FEFO e leitura por câmera. Falta uma flag `controlado` no produto que exija
lote na saída.

### Pendências do Atílio (não são código)
- Sentry (tem plano free — decisão dele)
- Instalar o APK no tablet físico (`GUIA_APK_TABLET.md`)
- Confirmação de e-mail no cadastro (parou esperando verificar remetente)
- Impressora térmica **Tomate MDK-022** — não comprou. Navegador não escreve em
  USB/Bluetooth; hoje imprime pelo diálogo do navegador, que funciona.

---

## Como trabalhar neste projeto

```bash
npx vitest run                        # 201 testes
npx eslint .                          # 0 ERROS (2 warnings pré-existentes)
npx vite build
node scripts/audit-check.mjs          # gate de vulnerabilidade do CI
node scripts/checar-migracoes.mjs     # o banco tem as migrações?
node scripts/rodar-migracao.mjs N     # aplica migração
node scripts/auditar-supabase.mjs     # estrutura + isolamento
node scripts/e2e-restaurante-real.mjs # E2E via API
node scripts/pentest-financeiro.mjs   # trava do financeiro + cross-check SQL×JS
node scripts/pentest-limpar.mjs       # SEMPRE depois dos pentests
```

**Preview:** use o Browser pane (`preview_start` com `{"name":"polo-estoque"}`),
nunca `npm run dev` pelo Bash.

**Antes de commitar:** testes + lint + build + **audit-check**. O CI roda os
quatro. (Já quebrou o deploy por esquecer o audit-check.)

**Convenções:**
- Comentários e commits em **português**
- Comentário explica **por quê**. Ao corrigir bug, registre o que quebrava
- Conta de teste: `pentest.*@example.invalid`. **Sempre** rodar
  `pentest-limpar.mjs` depois — o banco é de produção
- Nunca `npm audit fix --force`

**O que o Atílio espera:**
- **Perguntar antes de aplicar** desenho de funcionalidade. Bug óbvio e
  segurança pode corrigir direto. Mesmo quando ele delega, apresente o que
  pretende construir antes de construir
- **Commitar sempre**, sem perguntar. Push é decisão dele
- **Não fazer picotado.** Ele reclamou disso: quando pedir uma mudança
  estrutural, faça inteira
- **Design limpo, sem repetição de botão.** Um destino, um caminho
- Provar, não afirmar. Verificação real no navegador e contra o banco
- Dizer com todas as letras quando um trabalho seu estava errado
- Não inflar resultado: se um teste não cobriu algo, diga que não cobriu
