# Aurum Cozinha Pro — continuação (reescrito em 22/08/2026)

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

| tipo | o que faz | particularidades |
|---|---|---|
| `producao` | porcionamento, receitas, aparas (é o app original) | compra ≠ entrada: compra o cru, porciona, e a **porção** entra |
| `finalizacao` | recebe da produção, fecha turno contando a sobra | não tem saída; o consumo nasce do fechamento |
| `seco` | mantimentos: grãos, enlatados, descartáveis, limpeza | **compra JÁ é a entrada**; sem etiqueta, sem temperatura; validade é a **do produtor** |

⚠️ As diferenças acima são declaradas em `RECURSOS_MODULO`, não espalhadas em
`if` pelas telas. Ao criar regra nova, declare o recurso — `temRecurso` é
ESTRITO (só liga o que está `true`), e há teste exigindo que todo módulo declare
todos os recursos.

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

### Consumo: uma conta só para as três áreas
`saidasParaConsumo` no contexto. Na Produção e no Seco são as saídas; na
Finalização é `consumoComoSaidas(ajustes)` — o consumo apurado no fechamento de
turno, convertido para o formato de saída.

Isso é o que permite média diária, previsão de ruptura e sugestão de mín/máx
funcionarem nas três com **uma implementação só**. Duplicar essas contas por
área é onde elas começam a divergir.

Consumo negativo é descartado: significa que sobrou mais do que entrou
(recebimento não registrado), e somar puxaria a média para baixo.

### Contagem física tem DUAS formas — e ignorar uma some com o número
- Inventário (Produção/Seco): um ajuste **por produto**, `produtoId`/`quantidade`
  na raiz.
- Fechamento de turno (Finalização): **um** ajuste com vários `itens[]`, onde
  `quantidade` é a sobra contada.

`calcEstoquePuro` lia só a forma da raiz, então o fechamento era descartado em
silêncio — a bancada contava 5 de sobra e o estoque seguia mostrando os 20
recebidos. Corrigido em 21/08, com teste travando as duas formas.

E `recebimentos` **precisa** entrar no cálculo do estoque: a Finalização não tem
tela de entrada, então sem essa lista o estoque dela ficava sempre zerado.

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

## Onde paramos (31/08/2026) — UMA EXPERIÊNCIA SÓ, E O PAINEL COMPLETO

### Preços novos, e o completo saiu da venda

| Produto | Preço | Estado |
|---|---|---|
| **Aurum Etiquetas** | R$ 249/mês | à venda |
| **Aurum Cozinha Pro** | R$ 399/mês | **em breve** — em teste, não se vende ainda |

`PRODUTOS.completo.emBreve = true` (`utils/assinatura.js`). No cadastro o cartão
dele aparece cinza, com selo "em breve", e não dá para escolher. **Na
demonstração os dois abrem** — ver funcionando é o que faz alguém esperar por
ele; o selo evita a promessa de que já dá para assinar.

⚠️ Os testes de preço **derivam de `PRODUTOS`**, menos três âncoras com número
cravado (`249`, `399`, `2689.2`, `2274.3`). Se o preço mudar de novo, é só
ajustar essas âncoras — a versão anterior repetia 500 e 270 em doze lugares e
doze testes quebraram de uma vez sem dizer nada útil.

### A integração etiquetas ↔ completo (as quatro fases, feitas)

Antes, quem fizesse upgrade encontrava OUTRO app: abas diferentes, sem
biblioteca, com um cadastro de 12 campos. Agora é a mesma experiência.

- **Fase 1** — `etiquetas/Itens.jsx` virou o cadastro **dos dois produtos**. Os
  campos de estoque (tem hoje / mín / máx / peso por unidade) vivem num
  `<details>` recolhido que **só existe no completo**. Cadastro pesado é onde o
  cliente desiste, mas quem tem estoque precisa deles.
- **Fase 2** — as mesmas duas abas nos dois: **Etiquetar · Impressora**.
- **Fase 3** — a aba **"Avulsas" não existe mais**. Era uma segunda lista para a
  mesma pergunta ("o que eu etiqueto?") e a pessoa tinha que adivinhar em qual
  procurar. O que diferenciava um avulso era a data ser de ABERTURA, e isso já é
  campo do item. Migração única em `AppContext` converte os avulsos que existem
  em itens da categoria **"Abertos"** (id estável `avulsa_<id>`, flag
  `prefs.avulsasMigradas`, lista antiga preservada no banco).
  ⚠️ O prazo vai **igual em todos os estados** de propósito: a etiqueta avulsa
  não passava por seletor nenhum, então repetir o número é o que garante a mesma
  validade impressa. A linha do item colapsa para "3d em qualquer estado".
- **Fase 4** — quem sobe de plano vê no Início: *"Seus N itens já estão aqui —
  falta dizer quanto tem de cada um"*, com botão para a contagem
  (`components/BoasVindasCompleto.jsx`). Some sozinho na primeira contagem.
  ⚠️ A decisão saiu para `marcaDeUpgrade()` (função pura, com teste) e o efeito
  **espera as prefs hidratarem** antes de decidir — ele é declarado antes do
  efeito de hidratação, e decidir cedo gravaria por cima da marca antiga,
  engolindo o aviso justamente de quem acabou de subir.

### O painel super-admin (M36 + edge function `restaurante`)

Três poderes novos, todos dentro do cartão de cada restaurante:

1. **📊 Uso da conta** — último acesso, última gravação, itens, etiquetas
   impressas, lançamentos, contas ativas. **Números, nunca conteúdo**: ver o que
   o cliente tem dentro continua sendo o modo suporte, que ele autoriza e que
   fica na trilha dele (M25).
2. **nova senha** — manda o link para a caixa do cliente. Não é senha que eu
   escolho e dito por telefone. Só aparece para endereço que RECEBE e-mail:
   conta de equipe é `@contas.aurum.app` e não tem caixa de entrada
   (`utils/contas.js` é onde essa regra mora agora — estava solta em dois
   lugares, e bastava um mudar para o outro mentir em silêncio).
3. **+ Abrir conta de cliente** — a venda acontece no WhatsApp; mandar o cliente
   "entrar no site e preencher" é perder a pessoa na porta. Edge function
   `restaurante`: cria auth user + restaurante + perfil de diretoria, com
   rollback em cada passo. **A senha nasce aleatória e ninguém a conhece** — o
   dono recebe o link para escolher a dele, o que de quebra prova que o e-mail
   existe (é o único caminho de recuperação dele).
   ⚠️ Não reusa `criar_restaurante` (M28): aquela é escrita em cima de
   `auth.uid()` e criaria o restaurante para a conta da Aurum.

**Sondado contra o banco real:** M36 é SECURITY DEFINER, `anon` sem execute, e a
trava recusa até a conexão de administração. A função `restaurante` publicada:
sem sessão → 401, com a chave anônima → 401, nada criado.
**Falta o Atílio conferir a TELA do painel** — ela só abre com a conta
super-admin, que o agente não tem.

**Estado:** 337 testes, lint 0 erros (2 warnings antigos), build ok,
audit-check ok. Migração 36 aplicada.

---

## Antes disso (28/08/2026) — DOIS PRODUTOS COMERCIAIS

O app passou a vender **dois produtos a partir do mesmo código**:

| Produto | Preço | O que entrega |
|---|---|---|
| **Aurum Etiquetas** | R$ 270/mês (hoje 249) | Biblioteca de itens prontos, cadastro próprio, impressão, controle do que vence |
| **Aurum Cozinha Pro** | R$ 500/mês (hoje 399) | Tudo acima + estoque, compras, produção, receitas, relatórios, financeiro |

`PRECO_MES = 149` **não existe mais.** Preço vem de `PRODUTOS` em `utils/assinatura.js`.

Cinco commits, um por fase:

```
a0c2e10  fase 5: escolha do produto no cadastro
0298054  fase 4: navegacao e casa propria do plano
39680e8  fase 3: biblioteca de itens prontos e cadastro proprio
4e13817  fase 2: armazenamento configuravel com faixa de temperatura
52a5ba6  fase 1: produto contratado na conta, sessao e painel
```

### As cinco coisas que você precisa saber antes de mexer nisso

**1. TRÊS eixos de gating, e confundi-los é o próximo bug.**
```
temRecurso(modulo, x)       → que tipo de COZINHA é esta?   (utils/modulos.js)
pode(sessao, permissoes, x) → o que este CARGO pode fazer?  (utils/permissoes.js)
produtoTem(produto, x)      → o que a CONTA comprou?        (utils/produto.js)  ← novo
```
Os três são estritos (`=== true`). A coluna chama-se `produto`, **nunca `plano`**:
`PLANOS` já significa a *duração* paga (mensal/semestral/anual).

**2. O plano Etiquetas roda no módulo `producao` raiz, e isso é a coisa mais
importante do desenho.** Não é preguiça: os documentos são namespeados por
módulo, então um módulo próprio faria as chaves virarem `etiquetas::produtos` —
e no dia do upgrade o cliente abriria a Cozinha de Produção e veria **catálogo
vazio**, com os itens dele vivos no banco e nenhuma tela alcançando, sem erro
nenhum. Reusando `producao`, upgrade = `definir_produto(rid,'completo')` e pronto.

**3. Migração 27 aplicada.** Coluna `restaurantes.produto` (default `'completo'`,
CHECK), RPC `definir_produto`, e `criar_restaurante` recriada com `p_produto`.
⚠️ **A armadilha que quase custou caro:** a M24 concede EXECUTE **por assinatura
exata**. Acrescentar um parâmetro cria OUTRA função, sem grant — todo cadastro
novo quebraria com "permission denied" mostrado como erro genérico. A M27 tem
sonda `has_function_privilege` que aborta a transação se o grant não pegar.
Qualquer mudança futura em assinatura de RPC precisa do mesmo cuidado.

**4. Armazenamento é configurável** (`prefs.armazenamentos`, não documento novo).
Os ids `congelado` e `resfriado` são **reservados e imutáveis** — essas strings
estão gravadas cruas em `registros[].armazenamento`, `producoes[]` e
`etiquetasImpressas`. Nome e faixa são editáveis; o id nunca.
`prazoDe()` lê o formato antigo (`valCongelado`/`valResfriado`) **e** o novo
(`prazos{}`), sem migração de dados. Ao salvar, `comEspelhoDePrazos()` faz
**dual-write** — obrigatório, porque tablet com cache antigo só sabe ler o
formato velho e imprimiria validade zerada em silêncio.
⚠️ O Estoque Seco usa `valCongelado` como *prazo de prateleira* (`data/seco.js`)
e foi deixado quieto de propósito: remapear reatribuiria a validade de todo
mantimento.

**5. Prazos da biblioteca vêm EM BRANCO de propósito.** Nome, categoria e unidade
são fatos; prazo de validade é responsabilidade sanitária do estabelecimento.
Número inventado vira data impressa em pote de comida. A tela avisa o que falta
(ponto âmbar) e o Atílio completa. Se ele quiser padronizar uma tabela como
consultor, é só preencher `data/bibliotecaEtiquetas.js` — nada no código muda.

### Como testar o plano etiquetas

```
?produto=etiquetas    → demo do plano menor (é também o link de visita comercial)
node scripts/pentest-produto.mjs   # depois: node scripts/pentest-limpar.mjs
```
⚠️ **Teste por URL DIRETA** que as rotas do app completo redirecionam
(`/compras`, `/producao`, `/financeiro`, `/administracao`…). O `App.jsx` já teve
esse mesmo defeito três vezes — os comentários das linhas 233-238, 248-250 e
262-265 registram cada uma.

### Falta

- Fase 6: migrar Entradas/Produção/Compras para aposentar `valCongelado`/
  `valResfriado` do formulário (hoje convivem pelo adaptador, sem urgência).
- Demo do plano etiquetas com dados próprios (hoje usa o seed do completo, que
  tem estoque que aquele produto não mostra).
- Estoque Seco e o `valCongelado` como prazo de prateleira (item 4 acima).

**Estado na época:** 268 testes, lint 0 erros, build ok, audit-check ok. Contra o BANCO:
auditoria 27/27, e2e 48/48, pentest-produto 5/5, contas de teste limpas.

---

## Antes disso (22/08/2026)

Auditoria multi-agente do app inteiro (sete especialistas: texto de interface,
navegação, corretude, relatórios, acessibilidade, design e segurança
multi-conta), com um segundo agente conferindo cada achado grave contra o
código. **171 achados**, salvos em `AUDITORIA_2026-08-22.json` na raiz.

**Os sete lotes foram aplicados.** Nove commits, um por lote:

```
b6df173  Lote 4: um destino, um caminho — atalhos repetidos e avisos mortos
86975e2  Lote 7: seis privilegios demais dentro da conta (migracao 23 aplicada)
4438489  Lote 6: icones desenhados, botao unico, etiqueta que cortava o QR
093662c  Lote 5: legivel e tocavel numa bancada de cozinha
56ab999  Lote 3: desperdicio dia a dia, por cozinha, ligado a compra
282fd7b  Lote 2: o texto deixa de explicar o sistema e passa a instruir a tarefa
0a12a34  Lote 1 (2/2): seis numeros errados no relatorio e no financeiro
8f809ae  Lote 1: dois numeros errados que a tela mostrava como certos
3772577  Administracao: o seletor do cabecalho vira a porta unica entre as areas
```

**Estado:** 243 testes (eram 220), lint 0 erros, build ok, audit-check ok.
Contra o BANCO: auditoria 26/26, pentest financeiro 18/18, e2e 48/48, contas de
teste limpas.

### O que mudou e você precisa saber antes de mexer

**Migrações 23 a 26 estão aplicadas.** A 23 fechou seis brechas de privilégio DENTRO da
mesma conta (nenhuma vazava entre restaurantes): token de convite legível por
qualquer membro, convites legados de 8 hex, DELETE de documentos sem trava de
chave, DELETE físico de registros por qualquer membro, `p_versao` NULL
desligando o controle de conflito, e `alterar_cargo` lendo `perfis` cru em vez
das helpers endurecidas pela M18.

A **24** fechou mais três: (a) deny-by-default nas RPCs — as 30 funções do
projeto estavam chamáveis SEM LOGIN (`anon=X` em todas), e o anônimo agora
alcança só `convite_valido`, o único caminho pré-login; (b) `sou_super_admin()`
amarrado a `auth.uid()` em vez do claim de e-mail; (c) janela mínima de 7 dias
em `perda_em_reais`, que com janela de 1 dia deixava reconstruir o custo
unitário item a item.

A **25** fez o acesso do suporte deixar rastro: entrar em modo suporte grava na
trilha do próprio cliente, como "Suporte Aurum". O texto de privacidade foi
corrigido junto — ele afirmava que o acesso da equipe só ocorre com
autorização, e isso só valia para a ESCRITA.

A **26** conserta um defeito da 24: o `revoke` dela limpou o que existia e não
mudou o padrão, então a primeira função criada depois já nasceu aberta ao
anônimo. Quem fecha de verdade é um **event trigger** (`trg_fecha_funcao_nova`)
que revoga anon/PUBLIC a cada CREATE/ALTER FUNCTION.

⚠️ Ao mexer em RPC nova, **lembre do grant**: com deny-by-default, função sem
`grant execute ... to authenticated` simplesmente não é chamável. E os 8
helpers usados dentro das policies de RLS PRECISAM do grant — a expressão da
policy roda como o usuário que chama.

⚠️ **`auditar-supabase.mjs` agora falha** se qualquer RPC além de
`convite_valido` ficar alcançável sem login. Se isso disparar depois de um
upgrade do Supabase, a plataforma reconcedeu — rode a migração 26 de novo.

**`separarMetas` agora RECUSA chamada sem catálogo.** Não é validação de dado:
o catálogo nunca é undefined, então undefined ali só pode ser chamador
esquecido — foi exatamente o bug que matou o mín/máx por instância.

**A ponte Produção→Finalização exige destino de finalização E diferente da
origem.** Sem as duas travas, a baixa de ingrediente da receita (destino
'producao') voltava como recebimento do próprio estoque e se anulava.

**Toda quantidade de apara/perda é quebrada POR UNIDADE.** `somaPorUnidade`,
`rendimentoPorItem` e `somaPorCampo` nunca somam kg com unid. Correção em
unidade incompatível fica FORA da conta e o rendimento vira null — número
errado com cara de certo é pior que um traço.

**Emoji não é mais ícone.** Todo ícone de interface sai de `Icons.jsx` (33
desenhos). O campo `icone` de `MODULOS` guarda NOME DE ÍCONE, com teste
travando. Emoji só sobrevive em texto corrido de ajuda.

**Existe `Botao.jsx`.** Variantes fechadas. Vermelho é só para DESTRUIR.

**O guia do turno vive no Dashboard**, não no Layout — lá ele aparecia em toda
tela, inclusive na Administração.

**A Administração não tem barra inferior.** O seletor do cabeçalho é a porta
única entre as áreas, nos dois sentidos, e escolher uma cozinha lá NAVEGA.

### Armadilha de ambiente que custou tempo

O dev server do Vite envenena o grafo de módulos depois de muitos hot-reloads
("Could not Fast Refresh"), e aí o console mostra erros que NÃO existem no
código — `useApp() is null`, `Icon is not defined`, até tela branca. Antes de
investigar erro de console, **abra uma aba nova** (`tabs_create`) ou reinicie o
servidor. Errei nisso duas vezes nesta sessão, uma delas chegando a usar
`git stash` atrás de uma regressão que não existia.

## Achados registrados e NÃO corrigidos

Ordem sugerida. **Escolha com o Atílio antes de implementar.**

### Segurança / dados — o que a migração 23 NÃO cobriu

Os itens 1, 2 e 3 da lista antiga (drift do `alterar_cargo`, convites legados,
`importarBackup` sem whitelist) foram **corrigidos** em 22/08. Sobrou:

1. **`exportarBackup` não carimba de qual estoque veio**, e `importarBackup`
   aplica no aberto. Com várias instâncias, restaurar no lugar errado
   sobrescreve dado bom.
2. **Webhook Stripe desbloqueia conta suspensa** (inerte hoje).
3. **`registrar_auditoria` sem rate limit.**
**Nenhum achado de segurança da auditoria continua em aberto.** Os quatro que
tinham ficado de fora foram fechados nas migrações 24, 25 e 26 — o último deles
(leitura do super-admin) pela via que o dono escolheu: mantém a leitura e grava
trilha, com o texto de privacidade corrigido para dizer a verdade.

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
11. **Recebimento partido em duas telas NA PRODUÇÃO.** No Seco já foi resolvido
    (a compra dá entrada). Na Produção segue: compra o filé cru e depois
    redigita na produção/entrada. Aqui unir é mais delicado — somar as duas
    contaria o mesmo insumo duas vezes, a menos que a receita abata o cru.
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
npx vitest run                        # 220 testes
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
