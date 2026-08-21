# Aurum Cozinha Pro — continuação (escrito em 05/08/2026)

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

## ⛔ PRIMEIRA COISA A FAZER: o Supabase está pausado

O projeto Supabase (plano free) **pausou por inatividade** e o DNS do subdomínio
sumiu. Sintoma: `Could not resolve host: <projeto>.supabase.co`. Sem isso, o app
abre mas nenhum login funciona.

**Só o Atílio consegue restaurar** — exige o painel:
https://supabase.com/dashboard → projeto → **Restore project** (leva alguns minutos).

Você **não** consegue: a `service_role` do `.env.local` manipula dados, não o
ciclo de vida do projeto; o CLI do Supabase exige um personal access token.

Confirme antes de qualquer coisa:
```bash
node scripts/auditar-supabase.mjs
```
Esse script aborta com mensagem clara se a REST não responder. Ele foi escrito
justamente porque, com o projeto fora, um teste ingênuo lê "tudo bloqueado" como
"tudo seguro" — servidor morto não é servidor seguro.

---

## ⛔ SEGUNDA COISA: duas migrations pendentes

`src/lib/migration17_modulos.sql` e `src/lib/migration18_autorizacao.sql`
**ainda NÃO foram rodadas**. O Atílio precisa colar cada uma no SQL Editor do
Supabase (nesta ordem) e clicar Run.

**Sem a 17:** Estoque Seco e Cozinha de Finalização gravam no aparelho mas
**nada sobe** — o `CHECK` de `registros.tipo` recusa `seco:*`/`finalizacao:*` e o
item fica preso na fila offline (o app mostra sucesso; a falha é silenciosa).

**Sem a 18:** três falhas de autorização reais continuam abertas —
(a) funcionário desativado continua entrando e gravando;
(b) cozinheiro reescreve a própria matriz de permissões;
(c) trilha de auditoria é forjável e indelével.

Conferência depois de rodar:
```sql
-- a 17 pegou? (as três colunas devem vir true)
select 'entrada' ~ '^(compra|entrada|saida|apara|perda|ajuste|auditoria)$' as producao_ok,
       'seco:entrada' ~ '^(seco|finalizacao):(compra|entrada|saida|apara|perda|ajuste)$' as seco_ok,
       'finalizacao:ajuste' ~ '^(seco|finalizacao):(compra|entrada|saida|apara|perda|ajuste)$' as final_ok;

-- a 18 pegou? nenhuma policy _v10 ou _v7 pode sobrar nessas duas tabelas
select policyname, cmd from pg_policies
 where tablename in ('documentos','registros') order by tablename, policyname;
```
Se a 18 falhar com erro de `gen_random_bytes`, rode antes:
`create extension if not exists pgcrypto;`

Depois que rodarem, **valide de verdade** com:
```bash
node scripts/e2e-restaurante-real.mjs   # cria conta, opera um turno, testa isolamento
node scripts/pentest-limpar.mjs         # apaga as contas de teste (SEMPRE rodar depois)
```

---

## O que o app é

PWA offline-first para cozinha, usado em **tablet**. React 19 + Vite 8 +
Tailwind 3. Backend Supabase (Postgres + RLS + Auth + Realtime). Deploy
automático no GitHub Pages via GitHub Actions a cada push na `main`.

**Modelo de negócio:** R$149/mês, 7 dias de teste grátis, pagamento por **Pix**
com ativação manual pelo super-admin (o Stripe existe no código mas está
inerte e foi adiado). Super-admin = `atiliopinpolho@gmail.com`.

**⚠️ O app ainda NÃO tem uso real.** "Polo Beer" é conta de exemplo. Isso importa
para priorizar: não vale otimizar para escala nem construir mais módulos antes
de uma cozinha de verdade rodar um mês no primeiro.

### Arquitetura que você precisa entender antes de mexer

**Offline-first:** tudo grava primeiro em `localStorage` (`pe::<rid>::<chave>`) e
sobe depois. O que falha vai para uma fila (`outbox`); erros definitivos
(constraint, FK, coluna inexistente) morrem na primeira tentativa em vez de
gastar 8 retries em silêncio. **Consequência prática: a tela mostra sucesso mesmo
quando o servidor recusou.** Isso já escondeu bugs graves — sempre confira o
console/rede ao testar, não só o toast verde.

**Multi-módulo (multi-cozinha).** Três estoques separados dentro da MESMA conta:
| id | nome | o que faz |
|---|---|---|
| `producao` | Cozinha de Produção | porcionamento, receitas, aparas (é o app original) |
| `finalizacao` | Cozinha de Finalização | recebe da produção, fecha turno contando a sobra |
| `seco` | Estoque Seco | mantimentos: grãos, enlatados, descartáveis, limpeza |

A separação é feita por **namespace de chave/tipo**, sem coluna nova no banco:
- documentos: `seco::produtos` (o módulo padrão `producao` mantém a chave antiga)
- registros: `tipo = 'seco:entrada'` (padrão continua `'entrada'`)

Essa regra do "padrão mantém a chave antiga" é o que evitou migração de dados.
**Não quebre isso.** Ver `src/utils/modulos.js`.

O `useApp()` devolve os dados **do módulo ativo**, então as telas herdadas
funcionam nos três sem alteração. O que muda por módulo está em
`RECURSOS_MODULO` — e `temRecurso()` é **estrito** (só liga o que está declarado
`true`), porque a versão permissiva fazia telas aparecerem onde não deviam.
Há um teste que exige que todo módulo declare todos os recursos.

⚠️ **Módulo NÃO é fronteira de segurança.** O cliente baixa todos os registros do
restaurante e filtra em memória. É organização de tela. Se um dia for vender
"cada equipe só vê o seu módulo", precisa de coluna `modulo` no RLS.

**Etiquetas com QR.** Cada cópia impressa ganha um `loteId` único, registrado em
`etiquetasImpressas`, e o QR permite contar estoque com a câmera
(`BarcodeDetector`, Chrome/Android). O QR tem um **orçamento de caracteres
apertado** (`QR_MAX_CARACTERES = 106`): numa térmica de 203 DPI cada módulo do
código precisa de ~4 pontos para sair legível, e texto a mais empurra a versão do
QR para cima até o leitor parar de pegar. Há teste travando isso. Se for
acrescentar campo ao QR, meça antes.

---

## Onde paramos (sessão de 05/08/2026)

Última sessão foi longa: Fase 1 e 2 do multi-cozinha, recursos inspirados no
concorrente **Suflex**, e três rodadas de auditoria com agentes especializados.

**Commits (mais recente primeiro):**
```
c3776ea  Auditoria final: corrige a migracao 18 (que nem rodava) + 6 defeitos
d1a5d44  Organizacao inspirada na Suflex: Validades na barra + temperatura no recebimento
47cb4a0  Fecha as falhas de autorizacao da auditoria (migracao 18)
6cdb09f  Auditoria por agentes: corrige 9 defeitos
f7d9a69  Fecha o ciclo da etiqueta: id de lote, leitura por camera, validades, subgrupos
fd6dff1  Fase 2: Cozinha de Finalizacao
ff1ec50  Multi-modulo Fase 1: seletor de estoque + Estoque Seco
```

**Estado:** 108 testes passando, lint 0, build ok, deploy verde.
Banco de produção limpo (contas de teste apagadas).

**Lição da última sessão, que vale repetir:** a migration 18 que eu escrevi
**não rodava** (`returns void` conflitando com `returns boolean` da migration 11
→ erro 42P13 → rollback do script inteiro) e, mesmo se rodasse, **não fecharia
nada** (policies permissivas do Postgres somam por **OR**; criar a nova sem
derrubar a antiga não trava). Um agente descobriu isso **testando ao vivo contra
o banco**, não lendo os arquivos. Auditoria que só lê `.sql` não é confiável.

---

## Achados registrados e NÃO corrigidos

Ordem sugerida. Nada aqui está em andamento — escolha com o Atílio.

### Segurança / dados
1. **Drift entre repositório e banco.** `alterar_cargo` rodando em produção é
   mais antiga que o arquivo do repo — falta a trava anti-autopromoção.
   Levante o que realmente está lá antes de confiar em qualquer `.sql`:
   `select prosrc from pg_proc where proname = 'alterar_cargo';`
   `select tgname, tgenabled from pg_trigger where tgrelid = 'perfis'::regclass;`
2. **Convites legados de 8 caracteres** (32 bits) ainda pendentes são varríveis
   por força bruta, e `convite_valido` está aberto ao `anon` sem rate limit:
   `update convites set expira_em = now() where length(token) = 8 and usado = false;`
3. **Webhook Stripe desbloqueia conta suspensa.** `ativarAssinatura` grava
   `bloqueado: false` sem checar por que estava bloqueada; e não confere
   `payment_status` (boleto emite `completed` sem pagamento). Está inerte hoje.
4. **`importarBackup` aplica `prefs` sem whitelist** — um backup adulterado
   reescreve permissões e libera acesso do suporte.
5. **Cache local não é limpo no logout** — em tablet compartilhado, o próximo
   usuário lê histórico e custos pelo DevTools. Pior no modo suporte: dados do
   cliente ficam no aparelho do super-admin.
6. **Auditoria forjável localmente via importação de backup** (não toca o banco,
   mas o print do tablet mostra a versão falsificada).
7. **`registrar_auditoria` sem rate limit** e sem checar plano vencido — e a
   linha é indelével por design.

### Lógica / integridade
8. **Ponte Produção→Finalização não funciona em tempo real.** Só na hidratação:
   o tablet da finalização não vê o que chegou até recarregar.
9. **Destino "Cozinha de Finalização" não existe em contas já criadas** — o
   local fixo só é semeado quando o documento `locais` não existe. Precisa de
   merge na hidratação, não semeadura.
10. **`Inventario` acessível na Finalização** por Configurações (gated só por
    permissão, não por `temRecurso`) — a contagem salva ali corrompe o cálculo
    do fechamento de turno.
11. **Auditoria duplicada:** o registro otimista local tem id diferente do que o
    banco gera, então nunca casa no merge e a tela mostra tudo em dobro.
12. **`calcSugestoesMinMax` propaga NaN** quando uma saída não tem `data` — com
    auto-mín/máx ligado, grava NaN no catálogo e o produto some da lista de compras.
13. **Realtime de catálogo compartilhado não chega na Finalização** (usa
    `modulo` onde deveria usar `catalogoDe(modulo)`).
14. **`resetarProdutos` devolve o catálogo da produção mesmo no Seco.**

### UX de cozinha (tablet)
15. **Recebimento partido em duas telas** — Compras não entra no estoque; é
     preciso redigitar tudo em Entradas. É o maior ganho de fluxo disponível, e
     é literalmente o produto "Essencial" da Suflex.
16. **Trabalho longo evapora sem aviso** — 25 min de contagem somem num toque
     acidental. Falta rascunho em `localStorage` e confirmação ao sair.
17. **Botão principal no topo em 3 telas e no rodapé em 3**, e desabilitado sem
     dizer o que falta (em Aparas/Perdas são 4 condições invisíveis).
18. **Popup "O que há de novo" empilha** com o modal de etiqueta na primeira
     ação de uma conta nova.
19. **Banner do fluxo do turno** ocupa ~4 linhas em todas as telas, mesmo em 2/2.
20. **Alvos de toque < 44px** em Remover, reimprimir e nos steppers de etiqueta.
21. **Aba "Receitas" morta** em Seco/Finalização: o botão aparece e não faz nada.
22. **Alertas do Início são becos sem saída** — "lotes vencendo", "risco de
     faltar" e "estoque negativo" não navegam para lugar nenhum.
23. **Inventário sem "Todos" e sem busca** (todas as outras listas têm).

### O que copiar da Suflex (pesquisa já feita)
A Suflex organiza por **etapa do fluxo**: Recebimento → Validades → Produção →
Contagem → Relatórios. Planos: Essencial (recebimento+validades+etiquetagem),
Avançado (+produção), Diamante (+contagem e "controlados"), Business (multiunidade).
- **"Controlados"** é o recurso premium mais barato de construir aqui: já existe
  `loteId`, QR, FEFO e leitura por câmera. Falta uma flag `controlado` no produto
  que exija lote na saída e ganhe bloco próprio no relatório.
- Renomear telas pela etapa do fluxo, não pelo verbo do banco.

### Pendências antigas do Atílio (não são código)
- Sentry (ele achou que era pago; tem plano free — decisão dele)
- Instalar o APK no tablet físico (`GUIA_APK_TABLET.md`)
- Stripe em modo live (adiado; hoje é Pix)
- Confirmação de e-mail no cadastro (parou esperando ele verificar remetente no
  Brevo/Resend)
- Impressora térmica **Tomate MDK-022** + etiqueta BOPP: ele não comprou ainda.
  Aceita TSPL, mas navegador não escreve em USB/Bluetooth — precisaria de ponte
  (QZ Tray no PC, print service no Android) ou Web Bluetooth. Hoje imprime pelo
  diálogo do navegador, que funciona.

---

## Como trabalhar neste projeto

**Comandos:**
```bash
npx vitest run      # 108 testes
npx eslint .        # tem que dar 0
npx vite build
node scripts/audit-check.mjs        # gate de vulnerabilidade do CI
node scripts/auditar-supabase.mjs   # estrutura + isolamento do banco
node scripts/e2e-restaurante-real.mjs  # E2E via API
node scripts/pentest-limpar.mjs     # apagar contas de teste
```

**Servidor de preview:** use a ferramenta do Browser pane (`preview_start` com
`{"name":"polo-estoque"}`), nunca `npm run dev` pelo Bash.

**Antes de commitar:** testes + lint + build. O CI roda os três e o deploy
quebra se algum falhar.

**Convenções deste projeto:**
- Comentários e mensagens de commit em **português**.
- Comentário explica **por quê**, não o quê. Quando corrigir bug, o comentário
  registra o que quebrava — isso já evitou várias regressões aqui.
- Conta de teste: e-mail `pentest.*@example.invalid`, restaurante `Pentest ...`.
  **Sempre** rodar `pentest-limpar.mjs` depois: o banco é de produção.
- Nunca force `npm audit fix --force`. O gate aceita exceções documentadas em
  `scripts/audit-check.mjs`, e exceção obsoleta deve ser removida.

**O que o Atílio espera de você:**
- Provar, não afirmar. Ele valoriza verificação real (decodificar o QR gerado,
  medir pontos/módulo, simular a corrida do outbox) em vez de "deve funcionar".
- Perguntar antes de aplicar o que não for bug óbvio.
- Dizer com todas as letras quando um trabalho seu estava errado. Já aconteceu
  várias vezes nesta base e foi assim que os bugs graves apareceram.
- Não inflar resultado: se um teste não cobriu algo, diga que não cobriu.
