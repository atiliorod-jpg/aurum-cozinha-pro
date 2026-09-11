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

## Onde paramos (10/09/2026, fim da noite) — RELATÓRIO DE ETIQUETAS (M43)

Pedido do dono: "o proprietário analisar os dias passados — mês passado,
por semana e por dia". **Feito e no ar**, migração 43 aplicada e conferida.

- **Banco (M43):** tabela `etiquetas_impressoes` (uma linha por impressão,
  RLS ligada e ZERO policy) + `registrar_impressoes(jsonb)` (id gerado no
  aparelho → `on conflict do nothing`, reenvio da fila não conta em dobro;
  soma no contador da M42 só o que entrou) + `relatorio_etiquetas(de, ate,
  p_restaurante)` (devolve agrupado; `p_restaurante` só vale para o
  super-admin). Recuperou o que estava nas listas `…etiquetasImpressas`
  (11 linhas / 14 etiquetas da Aurum Serviços). Conferido como usuário comum
  numa transação desfeita: 3 → reenvio 0 → relatório 17 → pedir o vizinho
  devolve o próprio → contador 23→26.
- **App:** `EtiquetaPrint.aoImprimir` NÃO chama mais `contar_etiquetas_impressas`
  (contaria em dobro — há teste que trava isso); chama `registrarImpressoes`
  do AppContext, que entra na FILA OFFLINE (kind `'impressao'`). O dia é o
  do APARELHO, nunca o `now()` do banco (UTC). A função velha continua no
  banco por causa dos apps congelados no endereço antigo.
- **Tela** `/relatorio-etiquetas` (pages/RelatorioEtiquetas.jsx, nos DOIS
  planos): este mês / mês passado / 30 dias / datas; total com % contra o
  período anterior (mês contra mês, trecho contra o mesmo trecho), média,
  pico, reimpressões, por dia, por semana (seg–dom), top itens, por
  responsável, planilha e PDF. Porta: botão no topo da aba Impressas
  (plano Etiquetas) e cartão na Administração (completo).
- **Permissão nova** `verRelatorioEtiquetas` — cozinha DESLIGADA, gerência
  ligada; o dono decide na matriz. É trava de TELA (o dado não é segredo na
  casa; a aba Impressas já mostra item e responsável).
- Reimpressão: `Impressas.reimprimir` manda `reimpressao: true`.
- Contas puras em `utils/relatorioEtiquetas.js`, com teste próprio.
  517 testes, lint 0 erros, build ok. Tela NÃO vista no navegador: a
  demonstração pede nome/contato antes de abrir e a conta real pede senha.

**Senha da conta aberta pelo painel — MUDOU no mesmo dia, a pedido do dono.**
Antes: senha aleatória que ninguém via + link de "escolher senha" por e-mail.
Agora (função `restaurante` versão 4, publicada em 10/09): a senha continua
SORTEADA (12 caracteres sem letra ambígua, `senhaInicial()`), mas volta na
resposta e o painel mostra UMA vez, com "Copiar acesso"; **nenhum e-mail sai**.
O dono entra na conta, deixa pronta e entrega. O cliente troca a senha em
**Administração → Trocar minha senha** (`components/config/CartaoMinhaSenha.jsx`,
novo, só para a conta dona; também em Configurações no plano completo) — antes
não existia troca de senha dentro do app, só pelo link de recuperação.
Se o painel ainda estiver com a função antiga (sem `senha` na resposta), ele
cai no link por e-mail, como era. O botão "nova senha" do cartão do
restaurante continua mandando link por e-mail (não foi mexido — perguntar
antes de trocar por "sortear senha nova", porque isso dá à Aurum o poder de
entrar em qualquer conta de cliente sem ele saber).
Perda aceita: o link provava que o e-mail existia; agora conferir o e-mail
com o cliente na entrega.

**Trocar o e-mail da conta dona pelo painel (10/09, função `restaurante` v5).**
Botão "trocar e-mail" na linha da conta diretoria, no cartão do restaurante;
e-mail digitado DUAS vezes + confirmação com "de/para"; nenhum e-mail sai.
Ação `acao: 'email'` na função: só `cargo = diretoria`, nunca a conta da
Aurum (a trava da função compara o E-MAIL — trocar o dela trancaria o
painel), recusa `@contas.aurum.app` e e-mail já usado. Login, recuperação
(`recuperacao_permitida`, M35) e a lista do painel (`usuarios_do_restaurante`,
M9) leem `auth.users` na hora — mudam sozinhos. A única cópia,
`onboarding.contato_email`, é atualizada junto. Fica no livro da M39 À MÃO
(`tabela = 'auth.users'`, "Conta de acesso" no painel) — o gatilho de lá não
alcança `auth.users`. Não testado ponta a ponta (mexeria numa conta real);
conferido 401 sem login.

**Publicação, para não haver dúvida:** `git push` na `main` dispara o
"Deploy GitHub Pages", que publica em `app.aurumcozinha.com.br` (~1 a 2 min).
Conferido em 10/09 procurando os textos novos DENTRO do bundle no ar. Funções
do servidor vão por `node scripts/publicar-funcao.mjs <nome>`; migrações por
`rodar-migracao.mjs` — as duas direto no Supabase, sem passar pelo git.

**DEFEITO: o computador contava etiqueta que não saiu (10/09, achado pelo dono).**
"Imprimir pelo computador" chamava `aoImprimir` ANTES de `window.print()` —
fechar a janela sem imprimir já contava. O navegador não diz se a pessoa
imprimiu ou cancelou (`print()` e `afterprint` são iguais nos dois casos),
então agora o app PERGUNTA "Etiqueta foi impressa?" — Sim / Não, texto do dono,
sem frase de apoio embaixo (só nesse caminho; o
Bluetooth não pergunta). "Sim" conta E fecha a janela (é o toque em Fechar de
antes — ele pediu cuidado para não virar passo a mais); "Não" deixa
aberto; fechar sem responder não conta. A pergunta guarda o `etiquetaState`
que a gerou (`perguntaPara`), então some sozinha no próximo pedido.
⚠️ O `useState` dela mora ANTES do `if (!etiquetaState) return null` — o lint
pegou a primeira versão depois do retorno.
**M44 `apagar_impressao`** — só `meu_cargo() = 'diretoria'` (conferido NO
BANCO; gerência testada e recusada). Acha a linha por `impressaoId` (novo
campo gravado em cada item da lista de Impressas, o MESMO id da linha do
relatório), ou pelo lote (linhas recuperadas pela M43 = md5), ou por
dia+hora+item (o que foi impresso entre a M43 e esta correção). Tira CÓPIAS
(pelo navegador com QR, 5 itens da lista = 1 linha de 5), e o contador da M42
desce junto. Botão "Apagar" na aba Impressas só para a conta dona; apaga do
banco PRIMEIRO e da lista depois. O relatório diz onde fica o botão.
Conferido como dono numa transação desfeita: 1 → 2 → sem vínculo 1 →
contador 23→27→23. 522 testes.

**Pagamento e Termos (10/09, pedido do dono).**
- "Sua conta" (Administração do Etiquetas) ganhou **"Ver planos e pagar"**
  fixo — antes a tela de Assinatura só aparecia na faixa do teste, nos 3
  últimos dias e no bloqueio. No MODO SUPORTE ele não aparece (a sessão é do
  super-admin, "isento"); para ver como o cliente, entrar com a senha dele.
- Pagamento: "Como funciona" não promete mais "14 dias de teste" (acabou na
  M41); a situação diz "Aguardando liberação" / "Conta cortesia" / "Acesso
  vencido" em vez de cair em "Conta administrativa".
- `fmtPreco` (utils/assinatura.js): o preço saía "R$ 279.9/mês" no cadastro,
  na Administração e no painel. Usar SEMPRE ele para mostrar preço.
- **Termos 1.2** (vigência 10/09/2026): teste liberado pela contratada (cl.
  3); Cozinha Pro em pré-lançamento (cl. 2); trocar a senha inicial (cl. 6);
  conta aberta pela Aurum com senha que ela conhece + troca de e-mail a
  pedido (cl. 8 e exceções na 14); responsáveis e registro de impressões nos
  dados tratados (cl. 12). Aceite só é gravado no cadastro — sem novo aceite.
- **Ficou para o dono decidir:** a cl. 14 promete que o acesso do suporte
  fica no "Histórico de mudanças do próprio contratante", e essa tela NÃO
  existe no plano Etiquetas (o registro existe no banco). E a data da
  CVS 3/2026 na "Base normativa" segue sem conferência.
- **Termos 1.2 — complemento no MESMO dia (a pedido dele, sem mudar a versão):**
  a Aurum passou a fechar PLANO ANUAL POR CONTRATO ASSINADO (Word em
  Downloads: "Contrato Modelo Aurum - Assinatura Anual com Impressora
  (revisado).docx"), com impressora MDK-022 em comodato (vira do cliente após
  12 meses pagos), fidelidade, multa de 20% das parcelas restantes, devolução
  ou R$ 600 pela impressora, uma impressora por GRUPO econômico. Os Termos
  agora dizem: contrato assinado prevalece (cl. 2); atraso em parcela = 2% +
  1% a.m. dia a dia + IPCA, cobráveis na parcela seguinte pelo QR Code (cl.
  2); impressora cedida — desgaste, sem assistência (cl. 7); e a cl. 10
  deixou de prometer "sair sem multa" quando há contrato com prazo mínimo.
- **PROPOSTA PENDENTE (não construída, esperando o OK dele):** encargos de
  atraso no sistema — o painel calcula multa + juros de quem está atrasado,
  o super-admin toca UMA vez para lançar, e o valor entra no QR Code SÓ
  daquele cliente até o próximo pagamento registrado.
- **Indique e ganhe (10/09, pedido dele):** bloco no pé da tela de Pagamento
  com "Indicar pelo WhatsApp". A indicação viaja DENTRO da mensagem: o link
  leva o indicado ao WhatsApp da Aurum já dizendo "Fui indicado por <nome do
  restaurante>" — sem código, sem tabela. O mês grátis é lançado À MÃO no
  painel ("Liberar dias de acesso", `ativar_assinatura`, soma a partir do
  vencimento) quando o indicado paga a 1ª vez. Regras na cl. 2 dos Termos
  (1 por estabelecimento; não vale mesmo grupo nem ex-cliente; 30 dias ou
  dispensa da parcela seguinte; não vira dinheiro). Some sem nome de
  restaurante (super-admin/demo).
- **Contrato revisado:** o dono editou o Word (título "Sistema Aurum", impressora
  R$ 600, assinaturas simplificadas). Em cima da versão DELE entraram, sem
  regenerar: § 2º/§ 3º na cl. 2 (uma impressora por grupo econômico + declaração
  sob pena de pagar os R$ 600), frase dos encargos pelo QR Code na cl. 6, o fecho
  que tinha sido cortado, a linha de assinatura do cliente no Anexo I (tinha
  sumido) e o bloco de assinaturas preso numa página. Script em scratchpad
  (revisar_contrato.py) acha tudo pelo TEXTO.

**Sentry: o dono adiou em 10/09 ("é pago") — não lembrar até ele voltar ao assunto.**

---

## Onde paramos (10/09/2026, noite) — O APP INSTALADO ESTAVA CONGELADO EM 31/08

### ⚠️ A ARMADILHA DO DOMÍNIO PRÓPRIO — todo aparelho instalado antes de 31/08, 11h

O dono viu na Administração "Mudar para o Aurum Cozinha Pro — R$ 500/mês —
Quero o plano completo" e "Aurum Etiquetas — R$ 270/mês". Nada disso existe no
código desde `cfde9a5` (31/08, 13h31). O site no ar estava certo — conferido
baixando o bundle de app.aurumcozinha.com.br, que já tem "Quero saber quando
abrir". O app INSTALADO é que estava parado numa versão anterior.

Por quê: ele foi instalado pelo endereço antigo
(`atiliorod-jpg.github.io/aurum-cozinha-pro/`). Desde `4ee1eab` (31/08, 11h14)
o GitHub Pages responde esse endereço com **301** para o domínio novo — o
`sw.js` inclusive. E o navegador **recusa atualizar um service worker cuja
busca é redirecionada**. O worker antigo segue servindo o app antigo do cache,
para sempre, e nenhum código novo chega lá para consertar.

Conserto: SÓ NO APARELHO — desinstalar o app e instalar de novo por
`app.aurumcozinha.com.br`. Não há conserto por código: nada no endereço antigo
pode ser servido sem redirecionar. ⚠️ Vale para os tablets e celulares dele
instalados antes de 31/08 — e para qualquer piloto que tenha instalado cedo.
⚠️ Se o domínio mudar de novo, isso se repete. Antes de trocar, publicar no
endereço velho um `sw.js` que se desregistra, e só depois redirecionar.

### A letra do computador virou padrão no celular
O dono imprimiu, aprovou e pediu para tirar a opção. `usaBitmap =
mostrarDireto`; a chave `letraDoComputador` saiu do padrão e o interruptor saiu
da Administração. A queda para a fonte interna (sem canvas) continua.

### Impressão pelo computador: o rodapé parou de cortar, a letra seguia fraca
A dose anterior (`-webkit-text-stroke: 0.06mm`) era quase nada: o contorno é
metade para dentro, metade para fora — 0,03 mm por lado, um quarto de ponto.
Agora: `text-shadow: 0.125mm 0 0` (a "segunda batida" do TSPL, 1 ponto à
direita) + contorno de 0,1 mm; no rodapé, contorno de 0,05 mm. E o rodapé
(CNPJ, endereço, cidade) estava com peso 400 — passou a 700. ⚠️ Falta o papel.

A driver tem `OutputDensity` (LEVEL0–15, está em LEVEL8), mas com
`PrinterSetting = ON` ("usar configuração da impressora") essa densidade é
ignorada. Mexer nisso é configuração do Windows do dono — oferecido, não feito.

⚠️ **REVERTIDO NO MESMO DIA.** O dono imprimiu e achou que ficou TUDO em
negrito — pediu para voltar exatamente ao anterior (contorno de 0,06 mm, rodapé
em peso normal). A margem de 1,5 mm, que acabou com o corte do rodapé, ficou.
A nota em `index.css` registra a recusa: **não engrossar a letra do computador
sem ele pedir**. Se voltar a incomodar, a alavanca é a densidade da driver.

---

## Onde paramos (10/09/2026, tarde) — A RODADA DE TESTES DO BITMAP

Pedido: testar as últimas atualizações. O workflow de 10 agentes MORREU no
limite semanal de uso sem entregar nada; dois deixaram probes órfãs na raiz
(`_probe_*.test.js`) — a do bitmap estava completa e foi rodada à mão antes de
ser apagada. Resultado: 493 testes (eram 481), lint 0 erros, build ok.

### ⚠️ Oito defeitos no caminho "letra do computador", todos corrigidos

A opção nasce DESLIGADA, então nenhum chegou a cliente — mas o primeiro
apareceria na primeira etiqueta cheia de quem ligasse para testar.

1. **Etiqueta cheia + nome longo estourava o rodapé** (folga 1,1 → -1,9 mm). A
   escalada tinha perdido o degrau "nome volta a uma linha": com UM bitmap, a
   altura vinha dele e não de `linhasNome`. Agora vão DOIS desenhos
   (`nomeBitmaps = {1, 2}`, de `bitmapsDoNome`) e `bitmapDoNivel` escolhe por
   nível. Medido depois, com canvas real: cabe, com 2,4 mm.
2. **A letra encolhia até 1,5 mm** em palavra única comprida. Piso de 2,4 mm
   (`PISO_PX`, o mínimo que o próprio app já mediu no papel); abaixo disso
   corta com ".", como a fonte interna sempre fez.
3. **Palavra maior que a caixa era desenhada além da borda** (561 pontos numa
   caixa de 440), sem ".". Agora TODA linha que não cabe é encurtada.
4. **Espaço duplo, TAB ou espaço inquebrável ganhavam um "." espúrio**
   ("FILE  MIGNON."). O espaço é normalizado antes de tudo.
5. **A prévia lia os DADOS do BITMAP como texto.** Pixels cujos bytes formavam
   uma quebra de linha seguida de "BAR ..." desenhavam uma tarja fantasma; com
   "PRINT", a prévia ficava vazia. `interpretarTSPL` agora pula os dados pelo
   tamanho declarado — exatamente como a impressora faz.
6. **Bitmap com tamanho que não bate com os dados** (ou altura ausente, que
   virava NaN nas coordenadas) era aceito. ⚠️ No papel isso é grave: o firmware
   lê bytesPorLinha × altura bytes e comeria os comandos seguintes como pixel.
   `bitmapValido` recusa, e o nome volta à fonte interna.
7. **Um teste passava por acidente.** "O resto fica na mesma posição" usava um
   bitmap FALSO de 32 pontos — a altura da fonte interna. O real mede 39, e
   tudo abaixo do nome desce 7 pontos, de propósito. O teste agora prova que
   desce EXATAMENTE a diferença; o comentário de `montarEtiqueta` que dizia
   "nada abaixo se desloca" também mentia e foi corrigido.

8. **O nome perdia o fim mesmo cabendo.** Já estava na primeira versão do nome
   em imagem; apareceu na captura de tela desta rodada. "Cabe?" comparava a
   largura do nome numa linha só com "largura × linhas", esquecendo a sobra
   que a quebra por palavra deixa no fim de cada linha: saía "BACALHAU
   DESSALGADO / DESFIADO PARA BOLINHO DA C.", enquanto a fonte interna (opção
   desligada) mostrava o nome inteiro. Agora "cabe" é o nome JÁ QUEBRADO:
   encolhe até caber inteiro e só corta no piso. O mesmo nome sai inteiro a
   3,0 mm. ⚠️ Com medida ao lado (caixa de 316 pontos), nome longo corta nos
   DOIS modos — o bitmap ainda mostra um pouco mais que a fonte interna.

⚠️ A tela passou a MEDIR com os bitmaps (`desenhos` em EtiquetaPrint.jsx).
Antes media sem, e avisaria "cabe" sobre etiqueta que o papel entregava
estourada.

### O que foi conferido e estava certo
- Divisão da suíte em quatro: 0 testes perdidos, 0 duplicados (diff de
  títulos contra o arquivo antigo, recuperado do git).
- Ordem dos hooks em EtiquetaPrint: todos antes do `return null` de render; o
  componente é montado incondicionalmente em App.jsx, então isso importa.
- Memo dos contextos: AppContext 72 chaves = 72 dependências; AuthContext só
  tem `erroNaURL` fora, que é constante de módulo.
- `totaisImpressos` e `podarEtiquetas` certos em UTC-3 e UTC, com virada de mês
  e de ano. ⚠️ O Node no Windows ignora `TZ=` com nome de fuso — só `UTC` pegou.

### Técnica que vale guardar
Canvas SIMULADO no vitest (`globalThis.document = { createElement }` com um
`measureText` previsível) testa a lógica do `nomeEmBitmap` sem jsdom. Ver o
último `describe` de `etiquetas.test.js`.

---

## Onde paramos (10/09/2026, madrugada) — O PAPEL, DEPOIS DO USO REAL

Commits `e4f3d3e` e `b623744`. 481 testes, lint 0 erros, build ok.

### Impressão pelo COMPUTADOR — dois defeitos que o dono viu no papel

- **Rodapé cortado** ("CNPJ, endereço e cidade, às vezes vai muito embaixo").
  A etiqueta usava a altura CHEIA do papel com o rodapé ancorado na borda —
  folga zero. Qualquer diferença entre o que o Chrome manda e o que a driver
  imprime comia a última linha. O "às vezes" é a assinatura do defeito.
  Agora reserva **1,5 mm** embaixo, e a folga sai do miolo, nunca do rodapé.
  ⚠️ O TSPL já reservava 2 mm; só a tela não reservava.
- **Etiqueta lavada.** O navegador desenha com antialiasing (pixel CINZA), e a
  térmica é de 1 bit — vira ponto esparso. `-webkit-text-stroke: 0.06mm` +
  `print-color-adjust: exact`. É o equivalente da dupla batida do TSPL.
  ⚠️ Se o texto miúdo do rodapé borrar, reduzir o stroke.

### ⚠️ NOME DO ITEM COM A LETRA DO COMPUTADOR, TAMBÉM NO CELULAR

`utils/tsplBitmap.js` + `lib/nomeEmBitmap.js`. **Desligado de fábrica**, em
Administração → Etiquetas (`etiquetaConfig.letraDoComputador`).

⚠️ **No TSPL, bit 1 é BRANCO e bit 0 é PRETO** — invertido do que se assume.
Trocar imprime um retângulo preto com a letra vazada. Tem teste.

⚠️ **SÓ O NOME**, e é orçamento de tempo: a etiqueta inteira em pixel são
24.000 bytes, e o BLE manda 20 por escrita (acima disso o firmware barato
quebra) — passaria de meio minuto. Só o nome são ~2.100 bytes ≈ 1,6 s.

**Bônus:** como é imagem, os ACENTOS voltam — "PICANHA (PORÇÃO)" em vez de
"PICANHA (PORCAO)". A fonte interna nunca imprimiu acento.

Três medições que mudaram o desenho no caminho, e que valem para quem mexer:
1. "86% da altura da linha" saiu PEQUENO — a maiúscula é ~2/3 do corpo.
2. Medir `'MÁQ'` como régua deixou o ACENTO mandar no tamanho de TODO nome,
   até dos sem acento. A régua virou o próprio nome.
3. A caixa do nome em pixel é mais ALTA que a da fonte interna: no mesmo
   corpo, a letra da tela gasta 37 pontos onde a interna gasta 32.
O corpo agora sai de `corpoDoNomeMm` — a MESMA regra da etiqueta do
computador, num lugar só.

### `/impressas`

- **Hora da impressão** na lista, campo NOVO (`impressoEmHora`). ⚠️ NÃO é a
  hora escrita na etiqueta: numa reimpressão o papel repete a hora de
  manipulação original e a lista mostra quando o rolo andou.
- Reimpressão **já contabilizava** — conferido (1 → 2).
- ⚠️ `podarEtiquetas` só descarta vencida com +30 dias e encerrada com +120,
  então **não morde** em Hoje / 7 dias / Este mês. Só afeta olhar meses atrás.

---

## Onde paramos (10/09/2026) — LAPIDAÇÃO DE ARQUITETURA

Auditoria da organização do código (o app foi feito sem dev). Commits `24dad68`
e `a2f4a56`. 465 testes, lint 0 erros, build ok.

### O que estava BOM (não mexer achando que é bagunça)

- **Camadas limpas, zero inversão**: `utils/` nunca importa de `pages`,
  `components` ou `store`; `components` nunca importa de `pages`; `lib` nunca
  importa de `components`. Medido.
- 29 dos 30 arquivos de `utils/` têm teste (só `contas.js` fora).
- Modais 100% consolidados: nenhum `role="dialog"` fora do `Dialogo.jsx`.
- Tem `ErrorBoundary`, code splitting (19 rotas lazy), 6 dependências de runtime.

### ⚠️ Corrigido: cada toast re-renderizava o app inteiro (`24dad68`)

Ordem dos providers é `UIProvider > AuthProvider > AppProvider`, e o UIContext
guarda os **toasts**. Sem memo, cada toast criava um `value` novo no
AppProvider e re-renderizava os **34** arquivos que chamam `useApp()`.

`AppContext` (72 deps) e `AuthContext` (31 deps) agora memoizam o `value`.
⚠️ O risco é dependência esquecida → dado velho na tela. Lista literal, e o
`react-hooks/exhaustive-deps` confere. `erroNaURL` fica FORA de propósito: é
constante de módulo.

### Testes divididos em quatro (`a2f4a56`)

`etiquetas` / `operacao` / `acessos` / `comercial`, por ASSUNTO. Mesmos 465
testes, mesmo texto. ⚠️ Armadilha: o arquivo original importava o mesmo símbolo
em duas linhas do mesmo módulo — separar sem deduplicar dá redeclaração.

### ⚠️ DOIS ACHADOS MEUS QUE NÃO SE SUSTENTARAM — não refazer

1. **"20 caixas de aviso feitas na mão, inacessíveis"** — ERRADO. Investigando:
   4 eram **placares do relatório** (regex meu contou errado), e a maioria do
   resto é **texto explicativo estático**, lido na ordem do documento. `role="status"`
   em conteúdo estático faz leitor de tela anunciar à toa — seria REGRESSÃO.
   O `Aviso` está usado onde importa: mensagens que aparecem/somem nos modais.
2. **"8 lugares formatam data fora do `formatters.js`"** — verdade técnica, mas
   `formatters.js` não tem formatador de moeda nem de data-com-hora, e os 8 usam
   formatos DIFERENTES de propósito. Consolidar mudaria o que aparece na tela.

### Em aberto, por decisão (não é esquecimento)

- **`Admin.jsx`: 1.883 linhas, um componente, 25 `useState`.** Real, mas é o
  painel interno da Aurum, não a tela do cliente. Dividir é risco sem retorno
  visível num app pronto. Só fazer se for mexer muito nessa tela.
- `Configuracoes.jsx` tem 1.898 linhas mas está dividido em 8 peças — menos
  urgente que o Admin.

---

## Onde paramos (09/09/2026, noite) — A PRÉVIA PARA DE MENTIR, E /IMPRESSAS

Teste do sistema de etiquetas inteiro (suíte, banco de casos medindo o desenho
real, e o app no navegador). Commit `cebfca4`. 455 testes, lint 0 erros, build ok.

### A família de defeitos encontrada

Todos a mesma coisa: **a tela desenha em HTML, a impressora em TSPL, e os dois
discordavam**.

- **Nome**: prévia mostrava inteiro em duas linhas, papel imprimia uma só,
  cortada. Corrigido — o TSPL quebra em duas linhas.
- **Lote do fabricante**: `"SIF 1234 - L-2026-0912-."` Lote truncado não casa
  com recall nenhum. Ganha linha própria quando não cabe com o SIF.
- **Endereço**: cortava em ~36 caracteres, o bairro sumia (RDC 216). Ganha
  segunda linha quando há papel.
- **Rodapé**: a tela agrupava "CNPJ + CEP", o papel "cidade + CEP". **Quem
  cedeu foi a tela** — no TSPL os dois juntos passam de ~36 caracteres e cortam
  o CNPJ.

### ⚠️ `melhorDesenho` — desenha e confere, não estima

As três folgas (nome em 2 linhas, SIF/LOTE separados, endereço em 2) competem
pelo **mesmo papel**: cada uma cabe sozinha, as três juntas nem sempre. E o
espaço depende dos campos ligados, do rodapé e do comprimento do nome — não há
conta fechada. Então `melhorDesenho` **desenha a etiqueta inteira** e confere se
o corpo bateu no rodapé, do nível mais generoso ao mais apertado. A ordem das
concessões é a inversa da importância: endereço → lote → nome por último.

`nivelDeDesenho()` expõe o nível escolhido, e **a prévia da tela consulta ele**
em vez de supor. Enquanto existirem dois desenhos, pelo menos as decisões são
tomadas num lugar só.

Efeito colateral bom: o aviso "Não cabe no papel" **voltou a ser alcançável**
(estava inatingível desde que o tamanho travou em 60×50).

### `/impressas` no plano Etiquetas — e a decisão de 30/08 revertida

Ver o que saiu no rolo e **repetir uma etiqueta que rasgou**.

⚠️ **REPETE, NÃO RECALCULA.** Datas, **hora** e armazenamento vêm gravados do
registro. Remontar do zero recalcularia a validade a partir de hoje e devolveria
um pote mentindo sobre a própria idade — e a hora importa: num item de 3 dias
ela é metade da informação.

⚠️ Isto **reverte** `historicoEtiquetas: false` para o plano etiquetas
(decisão de 30/08). Aquela decisão estava certa quando não havia leitor — as
linhas só eram lidas pelo Inventário e pelo Validades, telas que este produto
não tem. Agora há leitor dentro do próprio produto. O custo (uma linha por
lote, sincronizada) voltou, e agora é pago por algo que o cliente vê.

### A prévia passou a LER o TSPL (commit `f574d95`)

`utils/tsplPreview.js` interpreta o TSPL; `components/EtiquetaTSPL.jsx` desenha
em SVG. **No celular** a prévia é esse desenho — o mesmo texto que vai pelo
Bluetooth. Campo novo no gerador aparece sozinho.

⚠️ **NADA DO QUE É IMPRESSO MUDOU.** `utils/tspl.js` está intocado (só ganhou o
export das tabelas de fonte). A `etiqueta-print-area` do diálogo do navegador
continua sendo o MESMO HTML, e **no computador a prévia também segue HTML** —
ali ela já É o artefato impresso; trocá-la por SVG seria piorar.

⚠️ Efeito visível: a prévia do celular mostra o texto **sem acento**, que é o
que a impressora imprime de verdade. Quem estava mentindo era a prévia.

Limite honesto: a fonte da tela não é a da impressora, então a LETRA continua
aproximada. Exata passa a ser a GEOMETRIA.

### `/impressas`: totais e matriz de acessos

Totais de **hoje, 7 dias e mês do calendário**, contando etiquetas de PAPEL
(uma linha pode valer N cópias). A conta é `totaisImpressos` em
`utils/etiquetas.js`, com teste — regra do projeto: o que precisa de
verificação sai do componente, porque **não há jsdom aqui**.

Os totais ficam FORA da busca, de propósito: número de controle que muda ao
digitar no filtro é número em que ninguém confia.

Capacidade nova **`verImpressas`** na matriz de acessos. Nasce LIGADA para
cozinha e gerência; o dono fecha se quiser. Rota e aba usam a MESMA chave — aba
que aparece e leva a redirecionamento silencioso já foi defeito aqui (o /itens).

### Também em aberto

- **Etiqueta de teste** na tela Impressora (hoje o primeiro teste de alinhamento
  do rolo é com etiqueta real).
- **QR não sai no TSPL** — `tspl.js` não emite `QRCODE`. Só o plano Completo
  liga o QR, e é justo o plano cuja contagem por câmera depende dele. **O dono
  tirou do escopo em 09/09**; se voltar, TSPL tem o comando.

---

## Onde paramos (09/09/2026) — A IMPRESSORA QUE TRAVAVA ANTES DE PROCURAR

Teste em três Android: **dois imprimiram, um não**. No terceiro, tocar em
imprimir deixava a tela carregando e o seletor de dispositivos **nem chegava a
abrir**. Commit `57701fb`, publicado. 451 testes, lint 0 erros, build ok.

### A causa, e por que ela só aparecia em alguns aparelhos

`gatt.connect()` **não tem tempo limite, e isso é de propósito na
plataforma**: se o aparelho não está por perto, a chamada espera até ele
aparecer. Não resolve, não rejeita, não lança — `try/catch` não pega e o
`await` nunca volta.

O reconectar silencioso rodava **dentro do clique** de imprimir. Em celular que
já tinha permissão salva, `getDevices()` devolvia a impressora, o código
pendurava no connect e o seletor nunca abria. Nos celulares sem permissão a
lista vinha vazia, o reconectar desistia na hora e tudo funcionava.

⚠️ **O defeito nascia na SEGUNDA tentativa.** Passava na demonstração e chegaria
ao cliente depois da primeira semana. Vale como padrão: qualquer coisa que
dependa de permissão persistida do navegador tem esse formato.

### O que mudou (`lib/impressoraBLE.js` e `components/EtiquetaPrint.jsx`)

- **Tempo limite em tudo** (`comLimite`). Abortar um connect pendente não tem
  API própria: quem corta é `disconnect()` no mesmo dispositivo. `Promise.race`
  sozinho não cancela nada — a promessa perdedora continua pendurada.
- **Reconectar saiu do clique** e virou `useEffect` na abertura do modal.
- ⚠️ **`requestDevice` não pode ter NENHUM `await` na frente.** A "ativação
  transitória" do toque dura ~5s e cada espera gasta esse orçamento; estourando,
  o Chrome recusa o seletor com `NotAllowedError` e a tela acusava bloqueio de
  permissão que não existia. A checagem de rádio ligado passou para DEPOIS da
  falha, só para escolher a mensagem.
- **Botão Cancelar** enquanto envia — antes não havia saída da tela travada.
- `escolherConhecido` no lugar de `conhecidos[0]` às cegas (a permissão é por
  site e se acumula; o primeiro pode não ser impressora).
- Busca de serviço **na ordem declarada** em `SERVICOS_IMPRESSORA`, mais
  **Nordic UART** (`6e400001-…`), que faltava. `getPrimaryServices()` não promete
  ordem, e o que não está declarado em `optionalServices` não é entregue.
- ⚠️ **Pedaço de 20 bytes TAMBÉM com confirmação.** Os 100 bytes viravam *long
  write* (prepare+execute) acima do MTU negociado, e o firmware das térmicas
  baratas costuma não implementar esse par. Onde o celular negocia MTU grande
  cabia num pacote e funcionava — outro defeito que só aparecia em alguns
  aparelhos. Como o Web Bluetooth não expõe o MTU, não dá para detectar.
- **iPhone deixou de receber "abra no Chrome"**, que lá é falso: todo navegador
  do iOS é obrigado a usar WebKit e nenhum implementa Web Bluetooth.

### Falta confirmar

O diagnóstico é firme na leitura do código e bate com o sintoma, mas **só está
provado quando o celular daquele colega imprimir**. Se ainda falhar, o próximo
passo combinado é uma **tela de diagnóstico** que despeje navegador, versão,
`getAvailability`, e os serviços/características encontrados ao conectar — hoje
a falha é muda e se investiga por adivinhação.

### iPhone — decisão pendente do dono

Web Bluetooth não existe no iOS e não há como contornar por código. Opções
levantadas: **Bluefy** (navegador de terceiro, grátis, o app funciona sem mudar
nada), extensão tipo beacio, ou **app nativo** (Capacitor + plugin BLE, US$ 99/ano
de Apple Developer + revisão da App Store). Recomendação dada: Bluefy agora,
nativo só quando um cliente pagante exigir iPhone.

---

## Onde paramos (03/09/2026, noite) — O QUE O USO REAL MOSTROU

O dono levou o app para a rua (celular de um amigo, impressão pelo computador)
e voltou com defeitos e pedidos. Tudo abaixo já está aplicado e publicado.

**Estado:** 441 testes, lint 0 erros, build ok. Migrações até a **42**.

### Os defeitos, e o que eles ensinam

⚠️ **CONSULTA QUE FALHA NÃO PODE TIRAR ACESSO.** O dono via "Falta liberarmos o
seu acesso" ir e voltar no meio do uso, com assinatura em dia. Quando a leitura
da linha do restaurante falha (sem internet, RLS oscilando), a cascata de
fallback do `AuthContext` termina com `rest` nulo e a sessão nasce com TODAS as
datas nulas — e `statusAssinatura` lia isso como "nunca foi liberada". Agora a
sessão carrega `assinaturaLida` e a régua devolve `'indeterminado'` (ok).
**Ausência de dado não é dado.** Quem barra de verdade é o banco.

⚠️ **O SUPER-ADMIN SÓ TINHA A ROTA "/" DESVIADA** para o painel. Qualquer outro
caminho abria uma cozinha vazia com as abas do cliente. Agora todo caminho fora
do painel volta para lá.

⚠️ **O `NotFoundError` DO BLUETOOTH ERA ENGOLIDO.** Tocar em conectar sem achar
impressora não dizia NADA. O Web Bluetooth usa o mesmo erro para "cancelei" e
para "lista vazia" — o texto agora serve aos dois, e antes de abrir o seletor
`bluetoothLigado()` pergunta se o adaptador existe.

⚠️ **O `confirm()` ESTAVA NA CAMADA 110**, abaixo do modal de impressão (120) e
do seletor de área (130): aberto de dentro deles, renderizava atrás, invisível,
e o app parecia travado. Foi para a camada de cima (140).

### O que mudou a pedido dele

- **Aba de imprimir agrupada por categoria** (era a única lista corrida do app).
- **Armazenamento em destaque** no modal de impressão: linha inteira, moldura
  navy, fundo bege, valor em corpo grande. ⚠️ Uma confirmação em DOIS TOQUES
  foi construída e o dono mandou tirar — ele quis destaque, não atrito. Se a
  ideia voltar algum dia: ela precisa ser INLINE, nunca `confirm()`, porque o
  seletor de Bluetooth exige GESTO do usuário e um diálogo no meio o consome.
- **A memória do aparelho sobrevive ao logout** (`_prefs_device`): responsável,
  último armazenamento, turno e destino. ⚠️ `limparCacheLocal` levava tudo, e
  o dono perdia o responsável a cada relogin. A isenção é nomeada em
  `lib/cache.js` — se entrar algo sensível em `PREFS_APARELHO`, revisar junto.
- **M42** — contador de etiquetas por conta (o painel mostrava 0 para todo
  cliente do plano Etiquetas, porque aquele plano não guarda histórico) e
  `definir_assinatura`, que grava a data exata (o painel só sabia somar dias).
  Sondado com `scripts/pentest-m42.mjs` (8/8).
- **Administração delegável**: a porta passou de cargo para a capacidade
  `configurarSistema`. Assinatura, contas, matriz de acessos e suporte remoto
  seguem só do dono. ⚠️ A gerência ganha a chave por padrão de fábrica — o
  dono desliga na matriz se não quiser.

### Aberto

- **Impressão pelo computador**: ele relatou tudo descendo para o rodapé da
  etiqueta, e depois disse que voltou a funcionar. Não reproduzi: o desenho da
  etiqueta, o `tspl.js` e o CSS de impressão não foram tocados (só a cor do
  anel de foco). Se voltar, pedir foto + se a prévia "Como vai sair" mostra o
  mesmo — isso separa dado/desenho de CSS de impressão.
- **APK**: o aviso "versão mais antiga de Android" é do pacote TWA, não do app;
  resolve regerando no PWABuilder com o MESMO Package ID e a MESMA keystore. O
  "inseguro" é normal de APK fora da Play Store. **Não confirmado** se o Web
  Bluetooth funciona dentro da TWA — o teste que decide é abrir o site no
  Chrome do mesmo aparelho e tentar conectar.
- **Atualização automática do APK**: o conteúdo atualiza sozinho (a TWA carrega
  o site), mas a CASCA não. Sem Play Store não há auto-update.

---

## Onde paramos (03/09/2026, tarde) — A ULTRA AUDITORIA FECHADA

**Os 18 achados que estavam abertos foram aplicados e publicados.** Quatro
commits, um por lote, todos já no GitHub (`git push` feito a cada lote):

```
ecf241d  A5 e B2: o RESP. em branco no primeiro rolo, e o código que não existe
9ac6e55  Lote B (B1 e B3): impressora que cai no meio, e o pedaço que era um chute
161ab56  Lote C: os dez achados de acessibilidade, com um diálogo único
67e55b4  Lote D: os quatro textos que mandavam a pessoa a lugar nenhum
```

**Estado:** 433 testes (eram 421), lint 0 erros (3 avisos antigos), build ok,
audit-check ok. Migrações continuam na **41** — nada tocou o banco nesta rodada.

### Duas peças novas que valem conhecer antes de mexer em qualquer tela

**`components/Dialogo.jsx` é a casca de TODO modal.** Havia oito modais escritos
à mão, todos dizendo `role="dialog" aria-modal="true"` — o que faz o leitor de
tela ESCONDER o resto da página — e nenhum levava o foco para dentro. Não
existia UM `.focus()` em todo o `src/`. Os oito foram convertidos. Modal novo
usa o `Dialogo`; escrever mais um à mão recria o defeito.

⚠️ **O `autoFocus` do React NÃO chega nesses modais** — medido no navegador, o
atributo nem é renderizado. O comentário do modal de confirmar dizia que o
"Cancelar" recebia foco sozinho; nunca recebeu. Hoje recebe, por ser o primeiro
alcançável do painel. Se precisar de foco num campo específico, não confie no
`autoFocus`: é preciso resolver dentro do `Dialogo`.

⚠️ **Quem abriu o diálogo é lido no RENDER, não no efeito.** Foi bug de verdade
nesta sessão: o commit do React aplica o foco antes de qualquer `useEffect`,
então o efeito guardava um campo de DENTRO do modal como "quem abriu" e, ao
fechar, devolvia o foco para um nó já arrancado da página.

**`components/Aviso.jsx` é a caixinha que o leitor de tela anuncia.** `tom="erro"`
vira `role="alert"` (assertivo — só para consequência de uma AÇÃO, como a
impressora recusar); os demais viram `role="status"` (educado), porque aviso que
nasce do preenchimento picotaria a leitura a cada tecla.

### Impressão: o que mudou no driver

⚠️ **O pedaço de 100 bytes era um chute.** O mínimo garantido pelo ATT é 20
bytes de carga, e no modo sem confirmação o que passa disso é descartado EM
SILÊNCIO. O Web Bluetooth **não expõe o MTU negociado** — então não se chuta:
`planoDeEnvio` (função pura, com teste) escolhe escrita COM confirmação a 100
bytes quando existe, e 20 bytes quando só há a sem confirmação.

⚠️ **O envio é um ITEM POR VEZ.** Era o lote inteiro numa chamada, e o registro
só acontecia depois de tudo — se a impressora caísse no meio, o que já tinha
saído no papel não ficava gravado e o reenvio duplicava etiqueta. As cópias
seguem nativas (`PRINT 1,N`) dentro de cada item.

⚠️ **Só se grava código que EXISTE em papel** (decisão do dono, 03/09). O
`PRINT 1,N` repete a mesma etiqueta com um código só: virou UMA linha de
histórico com o campo `copias`, não N linhas com códigos fantasmas. No diálogo
do navegador com QR ligado continuam N linhas — ali cada cópia tem o seu QR.

⚠️ **Erro nosso carrega a marca `emPortugues`.** Sem ela o tradutor da tela
embrulhava a frase dentro de "Não deu para imprimir… (a mesma frase)".

### Primeiro uso

`components/PrimeiroUso.jsx` pede o responsável e o endereço no caminho de
entrada (tela Etiquetar). A decisão de aparecer mora em `utils/primeiroUso.js`
(pura, 8 testes) — mesmo motivo do `marcaDeUpgrade`: **o projeto não tem jsdom**,
então componente se verifica no navegador e regra pura se verifica no CI.

⚠️ A gravação do endereço **mescla** com o que já existe: o CEP é gravado na
mesma chave pela Administração, e sobrescrever o objeto apagaria o dele.

### O que NÃO foi exercido ao vivo, e é honesto dizer

- **"Saíram X de Y etiquetas"** só aparece em lote com mais de um item, que só
  as telas de Entradas/Histórico do plano completo abrem. A lógica está lá e o
  caminho de um item foi testado; a mensagem em si não foi vista na tela.
- A queda da impressora foi simulada com uma **impressora falsa** no navegador
  (o driver é módulo com estado próprio, não dá para injetar em teste puro).

---

## Antes disso (03/09/2026, manhã) — PREÇO NOVO, TESTE MANUAL E PLANO EMPRESTADO

**Estado:** 421 testes, lint sem erros (3 avisos antigos), build ok,
audit-check ok. Migrações até a **41**. Tudo commitado; o último commit
(`51f8739`) **ainda não foi enviado** — ver "O que fazer primeiro" abaixo.

### 1. Preço: R$ 249 → R$ 279,90

Só em `utils/assinatura.js`. Semestral e anual saem por cálculo
(R$ 1.595,43 e R$ 3.022,92). As âncoras dos testes foram refeitas.

### 2. O teste grátis deixou de ser automático (M41)

**Esta é a mudança de comportamento mais importante da semana.** Antes o
acesso saía de `created_at + 14 dias`: quem preenchesse o cadastro entrava
sozinho por duas semanas. Agora:

- Coluna `restaurantes.teste_ate` — só a Aurum escreve, via RPC `definir_teste`
- **Cadastro novo nasce SEM acesso nenhum**
- O login parou de prometer "dias grátis"
- No painel, cada restaurante tem botões de 7/14/30 dias e "encerrar"

⚠️ `teste_ate` é coluna PRÓPRIA, não reaproveita `assinatura_ate`:
comercialmente são opostos. Teste dado como assinatura apareceria como
"Ativo" no painel e entraria na conta de receita — o mesmo erro que o
`regime` existe para evitar com as cortesias.

⚠️ `TESTE_DIAS` **não concede mais nada** — virou só a sugestão que o painel
oferece. Se algum código voltar a assumir "teste por data de criação", é bug.

### 3. Emprestar um plano (M41)

A Aurum pode deixar quem paga o Etiquetas experimentar o Completo por um
prazo. `produto_teste` + `produto_teste_ate`, separados de `produto` (que é a
base da cobrança). `produtoAtivo()` checa o empréstimo antes de cair no
produto comprado; quando a data passa, **volta sozinho**.

⚠️ **CONFERIDO NO BANCO** (era a dúvida do dono): item, estoque e lançamentos
feitos durante o empréstimo continuam intactos depois de vencer E depois de a
conta assinar o completo. Não é sorte — os dois produtos gravam nas mesmas
chaves desde a criação do Etiquetas.

### 4. `aguardando`: quem nunca entrou não é quem foi embora

`statusAssinatura` ganhou o estado `'aguardando'` (conta sem NENHUMA data
registrada). Antes, quem acabava de se cadastrar via *"Seu período de teste
terminou — continue de onde parou"*, logo depois de pagar. Agora vê "Falta
liberarmos o seu acesso" com botão para o WhatsApp da Aurum — não para pagar
de novo.

### 5. Dois bugs graves achados e corrigidos no caminho

- **O `regime` (cortesia) nunca chegava na sessão.** O SELECT em
  `AuthContext.jsx` não trazia a coluna, então `sessao.regime` era sempre
  indefinido e toda conta era tratada como pagante. Uma conta de cortesia
  seria BLOQUEADA na tela enquanto o banco liberava a escrita — o pior par
  possível. Corrigido junto com as colunas novas.
- **A trava "não cabe no papel" media a etiqueta errada.** Ela usava `config`
  puro; a impressão real usa `{ ...config, estabelecimento }`. Media 12,9 mm
  de folga onde o papel tinha 2,4 — cega por mais do que a folga inteira.

### 6. Da ultra auditoria, seis correções aplicadas

A1 (boas-vindas com o nome do produto errado), A2 ("Meus itens" que a cozinha
tocava e voltava), A3 (a trava acima), A4 (categorias vazias — eu havia dado
por feito e não estava), A6 (aviso que prometia campo desligado), B4 (tela de
pagamento vendendo "Etiquetas avulsas", removido em 31/08).

---

## O que fazer primeiro na próxima conversa

**As 7 especialidades que nunca rodaram** — segurança, integridade de dados,
performance, qualidade de código, banco, regras comerciais e primeiro uso.
Duas tentativas por agentes morreram no limite de sessão; a terceira deve ir
UMA POR VEZ, não sete em paralelo.

⚠️ Esta é a lacuna mais cara que resta: a semana de 03/09 inteira mexeu em
ACESSO e COBRANÇA (teste manual, empréstimo de plano, preço novo) e nada disso
passou por uma lente de segurança ou de regra comercial.

Depois delas, o que ficou registrado e não é achado de auditoria continua na
lista de "Achados registrados e NÃO corrigidos", lá embaixo.

✅ A conta de teste `caloteiro.teste@example.invalid` (restaurante
`42f3c374-…`, "Caloteiro Teste") JÁ FOI APAGADA — pelo próprio dono, no
painel, em 03/09 às 19:47 UTC (lápide em `admin_exclusoes`). Conferido no
banco em 10/09: nem conta, nem restaurante, nem linha órfã. Restam só três
contas no banco, todas reais (a do dono e mais duas); nenhuma de teste.

---

## Pendências do DONO (não são código)

- **Ligar a verificação em duas etapas** na conta `atiliopinpolho@gmail.com`
  do Supabase. Conferido no banco: **nenhuma das três contas tem MFA**. Essa
  conta abre a de todos os clientes.
- **A6 da auditoria**: conferir a CVS 3/2026 (vale a partir de 04/10) na
  fonte oficial. Ele é de PE e a CVS é de SP — não o obriga; o que vale em
  todo o Brasil é a RDC 216/2004 da ANVISA. Combinado de estruturar juntos.
- **Plano Pro do Supabase (~US$25/mês)** destrava dois itens de segurança que
  hoje respondem 402: senha vazada (HIBP) e expiração de sessão. Decisão
  comercial dele.

---

## Antes disso (02/09/2026) — A AUDITORIA APLICADA

Auditoria completa em 31/08 (41 achados, documento no artefato) e **24 já
resolvidos e publicados**. O app está no ar em `app.aurumcozinha.com.br`, e
**push agora é a cada lote** — ver [[feedback_commitar_sempre]].

### O que entrou (migrações 36 a 39)

| | |
|---|---|
| M36 | uso da conta no painel — números, nunca conteúdo |
| M37 | regime (cortesia/VIP) e registro de pagamento |
| M38 | apagar restaurante de verdade + lápide `admin_exclusoes` |
| M39 | **log do que a Aurum faz na conta do cliente** (gatilho) |

### As armadilhas que estas quatro deixaram registradas

⚠️ **`sou_super_admin()` compara `auth.uid()` com um UUID cravado, NÃO o
e-mail** (conferido no banco em 02/09). A edge function `restaurante` compara
E-MAIL. São travas diferentes para a mesma pessoa — trocar o e-mail da conta
derruba uma; recriar a conta derruba a outra. Eu documentei errado uma vez.

⚠️ **Duas tabelas NÃO cascateiam de `restaurantes`**: `documentos_historico` e
`feedback`. Um `delete` ingênuo deixaria o histórico do cliente vivo no banco.
A M38 apaga as duas explicitamente. Tabela nova → conferir a cascata.

⚠️ **O log é GATILHO, não chamada em função.** Doze funções para instrumentar
e a décima terceira nasceria sem registro. O filtro `sou_super_admin()` na
primeira linha é o que mantém `documentos` (que o cliente grava a cada toque)
fora do caminho.

⚠️ **Sonda de segurança com assinatura errada passa para sempre.** A de
`registrar_pagamento` estava sem `p_dias`, o PostgREST devolvia 404 e a sonda
dava por "negada" sem nunca chegar na função. Ao acrescentar RPC na varredura,
conferir que o erro é **401**, não 404.

⚠️ **Teste de segurança vermelho pelo motivo errado é pior que teste que
falha.** O `pentest-produto` deu 0/2 por três dias porque a confirmação de
e-mail foi ligada e o login falhava em SILÊNCIO. Agora ele confirma o e-mail
pela API de administração e **falha alto** se não autenticar.

### Estado

405→410 testes · lint 0 erros · varredura Supabase **38/38** ·
pentest-produto 5/5 · pacote principal 735 KB (era 873).

**Supabase:** C1/C2/C3 ligados (reautenticação para trocar senha — testado em
produção com o dono; avisos de senha e MFA; mínimo 8). `password_hibp_enabled`
**é pago**, fica de fora.

### O que sobrou, e é decisão do dono

- **A6** — CVS 3/2026 vale a partir de 04/10 e é de SP; ele é de PE (vale a
  RDC 216/2004 da ANVISA). Os 5 campos obrigatórios o app já imprime. **Nunca
  escrever "conforme norma X" na tela.**
- **C7** — MFA na conta super-admin. Só ele confere.
- **D4** — esticar o teste de 5 dias.
- **C5/C6** — sessão sem prazo, cadastro sem captcha.

---

## Antes disso (31/08/2026) — UMA EXPERIÊNCIA SÓ, E O PAINEL COMPLETO

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
