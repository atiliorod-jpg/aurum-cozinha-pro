# Auditoria geral do app — Aurum Etiquetas e Aurum Cozinha Pro (14/10/2026)

Pedido do dono: o app foi montado aos poucos e ficou "um pouco Frankenstein".
Ele pediu uma auditoria de como funciona e de como melhorar — defeitos,
acessibilidade e facilidade de uso, com melhorias que funcionem na prática —
e um plano completo de reestruturação.

**Nada foi alterado no app por esta auditoria.** As correções e a
reestruturação esperam a aprovação do dono, lote por lote.

---

## Como foi feita

- **39 telas fotografadas no tamanho de celular** (375 px), nos dois planos e
  nas três cozinhas do Pro (Produção, Finalização e Seco), pela demonstração.
- **Medição automática em 20 telas, com o app rodando:**
  - botões e campos menores que 44 px;
  - texto com contraste abaixo do mínimo (4,5:1 para texto normal);
  - letras menores que 12 px.
- **Leitura do código:**
  - rotas e navegação;
  - a central de estado (AppContext);
  - os dois editores de item;
  - relatórios, configurações e formatação de números.
- **Base:** as auditorias anteriores (22/08, 03/09 e 28/09). Os 51 achados de
  28/09 que foram aplicados não se repetem aqui.

## O que está bom (e não deve ser perdido)

- **Sem internet:** funciona até 72 h, com fila de envio e conferência pelo
  número de lançamentos.
- **Banco protegido:** as regras de acesso valem no banco, não só na tela.
  Inclui as migrações 56 e 59 (catálogo com permissão; baixa atômica pela
  etiqueta).
- **Etiqueta:** a impressão Bluetooth é sólida, com envio item a item,
  retomada e a pergunta "Saiu no papel?".
- **Robô de teste:** 20 cenários rodam a cada publicação e barram o deploy se
  algo quebrar.
- **Sem emoji, campos com nome, janelas acessíveis:** o componente `Dialogo`
  prende o foco e fecha com Esc.

---

## Resumo em 1 minuto

O app funciona e é seguro. O "Frankenstein" aparece em cinco coisas:

1. **O mesmo assunto mora em vários lugares.**
   - O item é editado em 4 telas, com campos diferentes.
   - Há 2 cartões "Minha senha".
   - O "Responsável" é escolhido de novo em cada formulário, enquanto a
     etiqueta já usa nome e senha.
   - As Configurações misturam 15 assuntos numa rolagem só.
2. **Cada tela foi feita do seu jeito.**
   - O botão de registrar fica no topo em umas telas e no fim em outras.
   - O armazenamento aparece em 2×2 numa tela e em 4 numa linha em outra.
   - Os títulos e as cores mudam de tela para tela.
3. **Uma peça central do código faz quase tudo.** São 2.215 linhas, 61 funções
   e 32 estados, e 45 telas dependem dela. Mexer num canto pode estragar
   outro, e qualquer mudança redesenha as 45 telas.
4. **Os testes amarram o código.** De 874 testes, 524 conferem o TEXTO do
   código (inclusive comentários) em vez do comportamento. Reorganizar uma
   tela quebra dezenas de testes sem ter quebrado nada para quem usa.
5. **Toque e leitura na cozinha.** Os números medidos:
   - o botão **Imprimir** da lista, o mais usado do app, tem **36 px** de
     altura;
   - os filtros de categoria têm **30 px**;
   - os cartões do Início têm contraste de **2,8** (o mínimo é 4,5);
   - há telas com 20 a 29 textos menores que 12 px.

---

## 1. Defeitos encontrados

| # | O que acontece | Onde | Gravidade |
|---|---|---|---|
| D1 | Números com ponto e zero sobrando: "7.50 kg", "3.80 unid/dia", "93.0%", "1.40 kg". O certo no Brasil é "7,5 kg". | `fmtNum` em `utils/formatters.js` usa `toFixed`; 94 lugares nas telas | Média (aparece em todo lugar) |
| D2 | O Relatório mostra o código interno no lugar do nome ("empanado", "molho", "unidade_centro", "cozinha"). Na demonstração acontece sempre, porque o relatório lê o catálogo-padrão e não o da demo. Na conta real, acontece depois de apagar um item ou um destino de saída. | `utils/relatorios.js`, `utils/analise.js` (recaem no id); `visaoDoEstoque` na demo | Média (a demo é a vitrine de venda) |
| D3 | A conta dona vê **dois** cartões "Minha senha" em Configurações → Sistema (Pro). O segundo aparece para qualquer conta com acesso (a conta da equipe troca a própria senha, que pela regra é o dono quem troca) e **também no modo suporte**, onde trocaria a senha do próprio super-admin achando que é a do cliente. | `pages/Configuracoes.jsx` (cartão escrito à mão perto da linha 1421) | Média |
| D4 | "Restaurar produtos padrão", na Zona de perigo, troca o catálogo inteiro do cliente pelos 2 itens de exemplo de fábrica ("Filé (exemplo — edite ou apague)" e "Molho da casa"). E toda conta nova do Pro nasce com esses 2 exemplos, que a pessoa tem de apagar. *(Correção de 14/10: a primeira versão desta auditoria dizia que eram os 43 itens da Polo Beer. Errado: esses ficam em `data/presetPolo.js` e só entram se alguém importar.)* | `resetarProdutos`, `catalogosPadrao`, `PRODUTOS_BASE` | Alta (apaga o catálogo de um cliente com um toque) |
| D5 | Na Finalização, o Início acusa "abaixo do mínimo" usando o mínimo da Produção (8 alertas na demo), e a bolinha vermelha da barra fica sempre acesa: alarme falso permanente. | Dashboard e NavBar com `min`/`max` do catálogo | Média |
| D6 | Itens que só servem para etiqueta (leite aberto, molho do dia) entram em Entradas, Saídas, Contagem e Início, com estoque 0 e situação "—". | Não existe "não controla estoque" no item | Média |
| D7 | "Dispensar por hoje", no aviso de vencimento, grava o dia em UTC. Depois das 21h, o aviso some até as 21h do dia seguinte. | `components/AvisoVencimento.jsx` | Baixa |
| D8 | Na barra de baixo da Finalização, "Registrar" e "Fechar turno" usam o mesmo ícone (+). | `components/NavBar.jsx` | Baixa |
| D9 | A demonstração mostra a vitrine pela metade: Custos zerados (sem preço), Relatório de etiquetas vazio ("não existe na demonstração"), e a faixa amarela cobre o cabeçalho ao rolar. | `data/demo.js`, `App.jsx` (faixa `sticky top-0` com o cabeçalho também `sticky top-0`) | Média (venda) |
| D10 | A perda mostra o código do motivo: "V · baixa", "V — Vencimento". | Histórico e Relatório | Baixa |
| D11 | "Exigir o responsável para imprimir" ficou sem sentido com a tela "Quem vai imprimir?": com equipe cadastrada, alguém sempre assina. | `CartoesConfig.jsx` | Baixa (confunde) |

**Já corrigido hoje (14/10, publicado):**
- O QR e o "Dar entrada no estoque" apareciam no plano Etiquetas.
- O QR só voltaria ao plano Etiquetas se o dono pedir.

## 2. Acessibilidade e toque (medido no app rodando)

**Toques menores que 44 px** (o mínimo para dedo, ainda mais com luva ou mão
molhada):

| Elemento | Tamanho | Onde |
|---|---|---|
| Botão **Imprimir** de cada item | 78 × 36 | Etiquetas (o botão mais usado do app) |
| Filtros de categoria | 30 px de altura | Início, Entradas, Saídas, Contagem, Configurações, Histórico |
| Abas Produtos / Receitas / Acessos / Sistema | 32 px | Configurações |
| Períodos (Hoje, 7 dias, Mês…) e botão PDF | 28 px | Relatório |
| Campos de formulário (data, selects) | 38 a 40 px | Entradas, Apara/Perda, Compras |
| Botões do armazenamento | 40 px | Entradas |
| Destinos da apara (STG, HAM) | 36 px | Apara/Perda |
| "Renomear" | 25 px | Unidades e cozinhas |
| Botão Ajuda | 36 px de largura | Cabeçalho, em todas as telas |
| Campos do armazenamento e "Remover" | 34 e 28 px | Administração do plano Etiquetas |

**Contraste abaixo do mínimo:**

| Onde | Contraste | O que é |
|---|---|---|
| Cartões do Início | 2,8 / 3,3 / 3,7 | Branco sobre laranja, verde e azul |
| Histórico | 3,2 | Texto laranja e vermelho dos lançamentos |
| Apara/Perda | 2,2 | Botão "Apara" selecionado (branco sobre âmbar) |
| Várias telas | 4,2 | Cinza-claro de 11–12 px sobre o bege da página |

**Letras menores que 12 px:**

| Tela | Quantidade |
|---|---|
| Configurações → Sistema | 29 |
| Relatório | 26 |
| Início do Pro | 23 |
| Administração do Etiquetas | 23 |
| Histórico | 19 |

Numa cozinha, o celular fica longe e a leitura é rápida.

## 3. Facilidade de uso — o que atrapalha na prática

| # | O que atrapalha | Por que importa |
|---|---|---|
| U1 | No Pro, **imprimir etiqueta não está na barra de baixo**: fica dentro de Registrar. | É o gesto mais repetido do dia, e no plano Etiquetas ele é a primeira aba. |
| U2 | **Duas identidades.** A etiqueta usa nome e senha ("Quem vai imprimir?"), mas Entrada, Saída, Perda, Produção, Contagem e Fechar turno têm um seletor "Responsável" livre. | Qualquer um lança no nome de qualquer outro, e o relatório "quem fez" não é confiável. |
| U3 | O botão de registrar fica **no topo** em Entradas, Saídas, Perdas e Fechar turno, e **no fim** em Produção e Compras. | A pessoa procura o botão a cada tela. |
| U4 | O **Início do Pro tenta ser tudo**: guia do turno, 3 cartões, calculadora, lista de compras, produzir hoje, vencendo e o estoque inteiro. São 2 telas e meia de rolagem. | O que é urgente se perde. |
| U5 | No Histórico, cada linha tem um botão **"Remover" vermelho grande**, e a saída (comum) aparece em vermelho. | O vermelho parece erro, e apagar fica a um toque de distância. |
| U6 | **Nomes cortados**: "Filé de Frango (por…" nas listas; títulos "Entrada av…", "Aparas & P…". | Justamente o nome do item, que é o que importa. |
| U7 | **Configurações → Sistema** são 5 telas de rolagem com 15 assuntos: suporte remoto, armazenamento, etiqueta, estabelecimento, rendimento, senha, mín/máx, guia, destinos de saída, destinos de apara, planilha, cópia, zona de perigo… | Ninguém acha nada. |
| U8 | **O item é editado em 4 lugares**: Meus itens, Configurações → Produtos, Planilha e Registrar → "Produtos do estoque" (que leva a Meus itens). Os dois editores têm campos diferentes: "Categoria" num, "Grupo" no outro; mínimo e máximo só num; medida padrão só no outro. | A pessoa não sabe onde muda o quê. |
| U9 | **Apara/Perda com jargão**: "Associar à compra", "Produto de origem", "STG — Strogonoff", motivo "V". | Quem está na bancada não sabe o que preencher. |
| U10 | **Fechar turno**: o botão vem antes da contagem e o Responsável começa vazio. | A ordem natural é contar e depois fechar. |
| U11 | **Cabeçalho apertado no celular.** | Detalhes abaixo da tabela. |
| U12 | **Produção**: os 4 botões de armazenamento ficam espremidos numa linha ("Temperatura ambiente" quebra). | Na Entrada são 2×2: a mesma escolha muda de forma de uma tela para outra. |

O cabeçalho apertado (U11):
- o título corta;
- a troca de área é só um ícone (faca, frigideira) sem o nome escrito;
- tocar no próprio nome faz sair da conta.

## 4. Estrutura do código — o "Frankenstein" por dentro

**Tamanho.** São 34 mil linhas. Os maiores arquivos:

| Arquivo | Linhas | O que é |
|---|---|---|
| `Admin.jsx` | 3.131 | o painel da Aurum |
| `AppContext.jsx` | 2.215 | a central de estado |
| `Configuracoes.jsx` | 1.828 | |
| `EtiquetaPrint.jsx` | 1.558 | |
| `AuthContext.jsx` | 1.130 | |
| `CartoesConfig.jsx` | 1.092 | |

**AppContext faz tudo.** Num arquivo só estão:
- carregamento do cache e da nuvem;
- fila sem internet e tempo real;
- regras de estoque e lotes;
- etiquetas e baixa pelo QR;
- demonstração;
- cópia de segurança;
- senhas da equipe.

Um único contexto entrega 61 funções e 32 estados a 45 telas. Qualquer
mudança (um toast, uma etiqueta nova) faz as 45 recalcularem.

**Duas árvores de rotas escritas à mão** (Etiquetas e Pro), com as regras de
acesso repetidas e espalhadas (`can`, `temRecurso`, `Restrito`,
`podeAbrirAdministracao`).

**Formulários de lançamento sem base comum.** Entrada, Saída, Perda,
Produção, Compra, Contagem e Fechar turno repetem cada um: data, responsável,
rascunho, busca, filtros, botão e confirmação de estoque negativo. Cada um do
seu jeito.

**Testes que leem o código.** 524 conferências procuram trechos de texto no
código-fonte. Elas foram úteis para travar regressões quando não havia outro
jeito (o projeto não tem simulador de tela). Hoje elas:
- reprovam quando o código muda de forma, mesmo com o comportamento igual;
- deixam passar defeitos de comportamento — o D1 e o D2 passaram por elas.

O robô (Playwright) é a rede de segurança que vale.

**Dados de um cliente como padrão do produto.** O catálogo da Polo Beer
(`data/produtos.js`) é o ponto de partida de toda conta nova do Pro (D4).

**Peso.**
- ~250 KB comprimidos na primeira abertura. A planilha (480 KB) já é
  separada.
- A fila e o cache dos lançamentos ainda dividem o localStorage (5 MB),
  embora os lançamentos já estejam também no IndexedDB.
- O tempo real escuta tabelas inteiras.

---

## 5. Plano de reestruturação

O jeito de trabalhar segue o de sempre:
- cada lote é publicado sozinho e conferido pelo robô e em fotos de celular;
- cada lote só começa com o "pode aplicar" do dono;
- o que muda para quem usa vem descrito antes.

**Pré-requisito: publicar o Lote B da 2ª etapa (M61)** antes de reestruturar.
Ele mexe em AppContext, Validades, Fechar turno, Histórico e Saídas, e está
parado num ramo à espera do token do Supabase. Reestruturar antes dele
transforma a junção num trabalho grande e arriscado.

Tamanhos: P = pequeno, M = médio, G = grande.

### Lote 0 — Rede de segurança (G, não muda nada na tela)
- O robô passa a cobrir cada fluxo nos dois planos:
  - entrada, saída, perda/apara, produção, compra e contagem;
  - fechar turno, imprimir, ler QR e reimprimir;
  - itens, equipe/senha e cópia de segurança.
- Ele também tira fotos de comparação das telas principais.
- Simulador de tela nos testes (jsdom + Testing Library) para testar
  formulários pelo que a pessoa vê e toca.
- Os testes que leem o texto do código **saem à medida que cada tela é
  refeita**. Ficam só as travas de segurança que não dá para testar de outro
  jeito.

### Lote 1 — Correções rápidas (M)
- **D1** números em português ("7,5 kg").
- **D2** nome no lugar do código, com "(item apagado)" quando o item não
  existe mais.
- **D3** um só "Minha senha", só para a conta dona e nunca no modo suporte.
- **D4** sai o "Restaurar produtos padrão"; o Pro novo nasce vazio, com a
  biblioteca de itens prontos, como o Etiquetas. Entradas e Saídas sem itens
  passam a dizer onde cadastrar.
- **D7**, **D8**, **D10** (motivo por extenso), **D11**.
- **Toque e contraste** nos pontos medidos:
  - botão Imprimir, filtros, abas e períodos com 44 px;
  - cartões do Início e Histórico com cores que passam no contraste;
  - nada menor que 12 px.

### Lote 2 — Uma pessoa por vez no aparelho (M)
- **"Quem está trabalhando?"** passa a valer para **tudo**: Entrada, Saída,
  Perda, Produção, Compra, Contagem, Fechar turno e Etiqueta. É a mesma
  lista de nomes, com a mesma senha opcional e os mesmos 5 minutos.
- **Muda para quem usa:**
  - o seletor "Responsável" sai dos formulários;
  - no topo aparece "Registrando como Maria · Trocar";
  - o histórico e os relatórios de "quem fez" passam a ser confiáveis.
- **Decisão do dono:** pedir o nome ao abrir o app (vale para tudo até
  trocar ou passarem 5 min) ou só na hora de registrar ou imprimir.

### Lote 3 — Navegação igual nos dois planos (P)
- **Barra de baixo do Pro:**

  | Cozinha | Itens da barra |
  |---|---|
  | Produção e Seco | Início · **Imprimir** · Registrar · Validades |
  | Finalização | Início · Imprimir · Registrar · Fechar turno · Validades |

  No Seco, Imprimir é a etiqueta de abertura.
- **Cabeçalho:**
  - o nome da área escrito ao lado do ícone;
  - "Sair" e "Trocar minha senha" num menu da conta, e não ao tocar no nome.

### Lote 4 — Um lugar para cada coisa (G)
- **Itens:**
  - **um editor só** (Meus itens), com três partes: *Etiqueta* (prazos,
    medida, marca, SIF, data de abertura), *Estoque* (mínimo, máximo, peso
    por unidade, estoque inicial) e *Produção* (cocção, rendimento);
  - nova opção **"Só etiqueta — não controla estoque"**, ligada por padrão
    nos itens com data de abertura (resolve o D6);
  - a planilha vira um botão dentro de Meus itens;
  - Configurações → Produtos deixa de existir.
- **Administração em 5 grupos, iguais nos dois planos** (o que o plano não
  tem não aparece):

  | Grupo | O que reúne |
  |---|---|
  | **A casa** | dados do estabelecimento, unidades e cozinhas |
  | **Etiqueta** | campos, QR, armazenamentos e temperaturas, impressora |
  | **Equipe** | nomes e senhas, contas de acesso, o que cada cargo pode |
  | **Estoque** | destinos de saída, destinos de apara, mínimo/máximo automático, rendimento |
  | **Conta** | plano e pagamento, minha senha, suporte remoto, cópia de segurança, zona de perigo |

  Relatórios, Custos, Balanço e Histórico de mudanças continuam como cartões
  de consulta no topo.

### Lote 5 — Formulário de lançamento único (G)
- Entrada, Saída, Perda/Apara, Produção, Compra, Contagem e Fechar turno com
  **a mesma forma**:
  - topo: data e quem já preenchidos;
  - meio: lista de itens com busca, filtros e − / + grandes, sem cortar o
    nome;
  - embaixo, **fixos**: o resumo ("3 itens · 12 unid → Finalização") e o
    botão.
- **Linguagem de bancada:**
  - "De qual compra veio? (opcional)";
  - "Para onde vai a apara" com o nome por extenso;
  - motivo da perda por extenso.
- **Fechar turno:** contar primeiro e fechar no fim, com o resumo.

### Lote 6 — Início que diz o que fazer (M)
- Cada cozinha abre no que importa **agora**:

  | Cozinha | O que o Início mostra |
  |---|---|
  | Produção | produzir hoje, vencendo, abaixo do mínimo, últimas etiquetas |
  | Finalização | a conferir, vencendo, fechar turno — **sem** alarme de mínimo da Produção (D5) |
  | Seco | abaixo do mínimo e lista de compras |

- O estoque completo vira uma tela própria, **Estoque**, com filtros e lotes.
- Calculadora, guia do turno e lista de compras vão para onde fazem sentido.

### Lote 7 — Peças padrão de tela (M, vem antes dos lotes 4 a 6)
- Componentes únicos, todos com 44 px e contraste certo, usados por todas as
  telas: cabeçalho de página, barra de ação fixa, campo com rótulo, − / +,
  filtros e abas, selo de situação, estado vazio, linha de lista.
- Tamanhos de letra e cores definidos num lugar só.
- **Para quem usa:** as telas ficam parecidas entre si, e cada correção de
  toque ou contraste vale para todas de uma vez.

### Lote 8 — Organização do código por dentro (G, não muda a tela)
- **Divisão da central de estado (AppContext):**

  | Parte | O que leva |
  |---|---|
  | Sincronização (fora do React) | carregar, cache, fila sem internet, tempo real |
  | Catálogo | itens, categorias, equipe, destinos |
  | Lançamentos e saldo | registros, estoque, lotes |
  | Etiquetas | impressas, baixa pelo QR |
  | Preferências | prefs da conta e do aparelho |

  As telas continuam chamando `useApp()` por uma "fachada", então a mudança é
  interna e pode ser feita aos poucos.
- **Rotas:** uma tabela única com o acesso de cada tela, valendo para os dois
  planos.
- **Painel da Aurum (`Admin.jsx`):** dividido por assunto (contas, cobrança,
  unidades, suporte), cada parte carregada só quando aberta.

### Lote 9 — Demonstração como vitrine (P)
- Relatórios e Custos leem o catálogo da demo (D2).
- Preços de exemplo, para Custos mostrar valores.
- Relatório de etiquetas calculado no aparelho.
- Faixa da demo sem cobrir o cabeçalho (D9).

### Lote 10 — Leveza e escala (M, sem mudança visível)
- Lançamentos só no IndexedDB; o localStorage fica para a fila e as
  preferências.
- Tempo real só do que a tela usa (Broadcast) e retenção das etiquetas
  antigas, o pendente "G" de 28/09.
- Primeira abertura mais leve.

### Ordem sugerida
1. Lote B (M61), quando o token voltar.
2. Lote 1 (correções rápidas) — dá para começar já, não depende de nada.
3. Lote 0 (rede de segurança).
4. Lote 7 (peças padrão).
5. Lotes 3 → 2 → 4 → 5 → 6, um por vez, cada um publicado e testado em papel
   pelo dono.
6. Lotes 8, 9 e 10, por dentro, sem pressa.

---

## Decisões que são do dono

1. **Lote 2:** pedir o nome **ao abrir o app** (vale para tudo) ou **só na
   hora** de registrar ou imprimir?
2. **Lote 3:** barra do Pro com **Imprimir** (Início · Imprimir · Registrar ·
   Validades)?
3. **Lote 4:** itens com data de abertura nascem como **"Só etiqueta"**?
4. **Lote 1 / D4:** conta nova do Pro começa **vazia**, com a biblioteca,
   como o Etiquetas? E o "Restaurar produtos padrão" sai? *(Decidido: sim.)*
5. **QR no plano Etiquetas:** fica sem (como era o combinado da M59) ou volta?

---

## Andamento

### Respostas do dono (14/10/2026)

| Pergunta | Resposta |
|---|---|
| Lote 1 | Aprovado e aplicado. |
| Quando pedir o nome | Só na hora de registrar ou imprimir (Lote 2). |
| Conta nova do Pro | Começa vazia, com a biblioteca de itens prontos; o "Restaurar produtos padrão" sai. |
| Barra de baixo do Pro | Imprimir entra (Lote 3). |

### Lote 1 — aplicado e publicado em 14/10/2026

| Item | O que foi feito |
|---|---|
| D1 | `fmtNum` em português ("7,5 kg"); os gráficos também. |
| D2 | "Item apagado" e "Destino removido" (`nomeProduto` e `nomeDestino`, em `utils/calculos.js`) no lugar dos códigos. A demo lê o próprio catálogo e os próprios destinos nos relatórios. |
| D3 | Saiu o segundo "Minha senha" de Configurações. |
| D4 | Conta nova vazia, com as categorias da biblioteca. Saiu o "Restaurar produtos padrão". Entradas e Saídas sem itens mostram "Cadastrar itens". |
| D7 | O aviso de vencimento usa o dia do aparelho. |
| D8 | Ícone próprio para Fechar turno na barra. |
| D10 | O motivo da perda aparece por extenso (`rotuloMotivo`). |
| D11 | Com equipe cadastrada, a caixa "Exigir o responsável" virou a frase "Toda etiqueta sai assinada". |
| Toque e leitura | Regra global de 44 px para campos; filtros, abas, períodos, chaves (agora com papel de chave e nome), botões de remover e o Imprimir da lista com 44 px; nenhuma letra abaixo de 12 px; cores com contraste. O PDF do Relatório saiu do cabeçalho; na lista de produtos o nome quebra em duas linhas. |

**Medição antes e depois, nas mesmas 20 telas:**

| O que se mediu | Antes | Depois |
|---|---|---|
| Toques menores que 44 px | 243 | 0 |
| Textos com contraste abaixo do mínimo | 46 | 0 |
| Letras menores que 12 px | 170 | 0 |

**Testes:** 872 testes (11 novos em `lote1Auditoria.test.js`). O robô tem 21
cenários; um novo confere a vírgula e os nomes no Relatório.

**Ficaram para os próximos lotes:** D5 (Lote 6), D6 (Lote 4) e D9 (Lote 9).

### Lote 0 — rede de segurança, aplicado em 14/10/2026 (nada muda na tela)

O robô passou de **21 para 34 cenários**, e o deploy para se algum falhar.

**`e2e/fluxos.pw.js`** — cada lançamento do dia, conferido pelo saldo e pelo
Histórico:
- entrada avulsa, saída para outra unidade e perda do estoque (com o motivo
  por extenso);
- apara (não mexe no saldo), produção, compra e contagem física;
- fechar o turno na Finalização;
- item da biblioteca e item do zero no plano Etiquetas, que já podem ser
  impressos;
- cópia de segurança.

**`e2e/acessibilidade.pw.js`** — a medição da auditoria virou permanente:
- percorre todas as telas dos dois planos e das três cozinhas, no tamanho de
  celular;
- inclui as janelas mais usadas: imprimir, imprimir pedindo o nome, teclado
  da senha, trocar de área e ajuda;
- **reprova** se aparecer toque menor que 44 px, texto sem contraste ou letra
  menor que 12 px;
- ficam de fora a prévia da etiqueta, que reproduz o papel, e os enfeites
  marcados `aria-hidden`.

Ao estender a medição às telas e janelas que faltavam, ela achou e corrigiu:
- o número vermelho da barra de baixo (contraste 3,8);
- textos claros em Planos e pagamento, na troca de área, na Ajuda e nos
  recebidos do Histórico;
- os botões da janela de Ajuda (36–40 px);
- o "×" do primeiro uso;
- a caixa "Dar entrada no estoque" (20 → 24 px).

**`e2e/apoio.js`** — o apoio comum dos cenários: entrar na demo, navegar,
"Quem vai imprimir?", ler o saldo e medir a acessibilidade.

**Simulador de tela nos testes** (jsdom + Testing Library, dependências só de
desenvolvimento):
- primeiros testes de componente pelo que a pessoa vê e toca: `Dialogo` (foco,
  Esc, ×), `QuemImprime` (nomes, toque, teclado, trava, dica só na demo) e
  `SemItens`;
- é a base dos testes das telas novas dos próximos lotes.

**Fotos de comparação** (`npm run fotos:base` antes, `npm run fotos` depois):
- 31 telas fotografadas com o relógio parado;
- a diferença fica em `test-results`;
- ficam só neste computador e **fora do deploy**, porque a fonte do Windows e
  a do Linux desenham diferente.

**O lote B (M61)** recebeu o Lote 1 (merge no ramo `etapa2-lote-b`, testado:
890 testes e 23 cenários). Continua esperando o token do Supabase, ainda
inválido em 14/10.

### Lote 7 (peças padrão), Lote 3 (navegação) e Lote 2 (uma pessoa por vez) — aplicados em 14/10/2026

**Lote 7 — peças padrão em `src/components/ui/`:**

| Peça | Onde entrou |
|---|---|
| `Abas` | 9 telas |
| `Filtros` | 8 telas; Entradas e Saídas só com as categorias que têm item |
| `Chave` | 6 chaves e a matriz de acessos, que tinha uma chave de 40×20 px |
| `Selo` | Início |
| `Vazio` | 6 listas vazias, que tinham cinza sem contraste no bege |
| `Cartao` | criada; entra com o Lote 4 |

**Lote 3 — navegação:**
- barra do Pro: Início · **Imprimir** · Registrar · Validades (+ Fechar turno
  na Finalização, com ícone próprio);
- o cabeçalho escreve onde a pessoa está ("Cozinha de Produção", com a
  unidade antes quando há várias);
- tocar no próprio nome abre "Sua conta" (cargo, casa e Sair da conta) em vez
  de sair direto;
- a tela de imprimir tem o mesmo título nos dois planos.

**Lote 2 — "Quem está registrando?":**
- Entrada, Saída, Apara, Perda, Produção, Compra, Contagem, Fechar turno e a
  baixa pela etiqueta (inclusive o modo rápido) usam a MESMA pessoa que entrou
  pelo nome para imprimir.
- Saiu o seletor livre "Responsável".
- Se ninguém entrou, o formulário mostra a grade de nomes (com o teclado da
  senha) e o botão espera.
- Com a equipe vazia, o seletor de sempre continua.
- O nome que vai no lançamento sai de `useQuemRegistra` (OperadorContext).
- Os "(s)"/"(ns)" das telas viraram plurais de verdade.

**Testes:** 890 testes e 38 cenários do robô. Novos: navegação, o lançamento
perguntando o nome, quem tem senha digitando no formulário e o nome que expira
com a janela de imprimir aberta.

### Lote 4 — um lugar para cada coisa, aplicado em 14/10/2026

**Resposta do dono:** item com data de abertura nasce **"só etiqueta"**.

**Itens — um editor só (Meus itens), nos dois planos:**
- a ficha tem três partes: **Etiqueta** (os dois planos), **Estoque** e
  **Produção** (só no Pro). As partes de estoque e produção ficam recolhidas,
  com um resumo do que já está preenchido;
- trouxe de Configurações → Produtos o que só existia lá: subgrupo, "entra no
  estoque já cozido" com a perda na cocção, a sugestão de mínimo e máximo pelo
  consumo e o fator de correção (vazio = automático);
- chave **"Controla estoque"**: desligada, o item só imprime. A regra mora em
  `utils/itens.js` (`controlaEstoque`, `ativoNoEstoque`). Item novo de
  abertura nasce desligado; no Estoque Seco, onde a etiqueta é sempre de
  abertura, nasce ligado. A ficha grava a escolha explícita;
- as telas de estoque (Início, barra, Entradas, Saídas, Contagem, Validades,
  Relatório, custos, lista de compras, sugestões) leem só o que controla
  estoque. O catálogo continua inteiro: é ele que se grava (resolve o **D6**:
  o "Leite aberto" saiu do Início, das Entradas, das Saídas e da Contagem);
- na lista, o item se anuncia com **"só etiqueta"**;
- **"Itens removidos"** no fim da lista, com "Devolver" (era o Ativo/Inativo
  de Configurações), e **"Grupos criados por você"**, com remover;
- "Tem hoje" só no item novo; no item que já tem lançamentos o campo vira
  "Estoque inicial", com o aviso de usar a Contagem — digitar a contagem ali
  somava em cima dos lançamentos;
- a unidade ganha grafia única ao salvar ("Kg", "un" → kg, unid).

**Planilha — um botão dentro de Meus itens, nos dois planos:**
- sai com os itens **da conta** (ou vazia), para editar no Excel e importar de
  volta. Antes o modelo vinha com os 55 itens do Polo;
- uma coluna de prazo por armazenamento da casa;
- corrigidos: dois itens com o mesmo nome viravam um ao importar; coluna
  ausente zerava o valor; o prazo importado não valia (ia para o campo
  antigo); unidade fora da lista virava "kg";
- regras em `utils/planilhaItens.js`, com testes.

**Administração em cinco grupos, a mesma nos dois planos:**

| Grupo | O que tem |
|---|---|
| A casa | dados do estabelecimento (saíram de dentro do cartão Etiquetas); no Pro, o caminho para Unidades e cozinhas; no Etiquetas, unidades e a equipe por unidade |
| Etiqueta | armazenamentos, campos e QR (Pro), e o caminho para a impressora (`?aba=impressora`) |
| Equipe | nomes e senhas, contas da equipe (uma lista só, com troca de cargo), cargos e acessos |
| Estoque (Pro) | receitas, destinos de saída e de apara, mínimo e máximo automáticos, rendimento, guia do turno — com o aviso de qual cozinha está sendo ajustada |
| Conta | plano e pagamento, minha senha, suporte remoto, cópia de segurança, instalar o app, novidades e (Pro) apagar os registros |

- consultas (relatórios, custos, balanço, histórico) e Meus itens (Pro) no
  topo; o aviso de lançamento que não subiu também;
- quem alcança o quê: `store/acessosAdmin.js`, a mesma regra no hub e nos
  grupos. Duas travas **fecharam** no Pro: suporte remoto e "apagar todos os
  registros" passam a ser só da conta dona (antes, qualquer cargo com
  "configurar o sistema");
- Configurações e Ajustes deixaram de existir. `/configuracoes?secao=...` e
  `/ajustes` levam ao lugar novo;
- contas da equipe: senha mínima de 8 (o texto dizia 6), botões de 44 px, o
  erro do banco aparece ao bloquear ou liberar, e o cargo mostrado é o atual
  (o rótulo antigo ficava velho depois de uma troca);
- títulos de verdade (`h2`) nos cartões que ainda usavam parágrafo.

**Testes:** 913 testes (23 novos em `lote4Itens.test.js`) e 43 cenários do
robô (5 novos em `e2e/lote4.pw.js`: só etiqueta, a ficha com os campos de
estoque, a planilha, e a Administração nos dois planos). A medição de toque e
contraste passou a cobrir os cinco grupos, a ficha do item aberta e a janela
da planilha.

### Lote 5 — formulário de lançamento único, aplicado em 15/10/2026

As sete telas (Entrada, Saída, Apara/Perda, Produção, Compra, Contagem e
Fechar turno) terminam do mesmo jeito.

- **Pé fixo** (`components/lancamento/RodapeLancamento.jsx`), logo acima da
  barra: o resumo do que vai ser gravado e o botão. Exemplos de resumo:
  "2 itens · 5 unid → Congelado", "Apara · Ponta de picanha · 0,3 kg →
  Strogonoff". O botão apagado diz o que falta. Resolve o **U3**: o botão
  ficava no topo em umas telas e no fim em outras.
- **Data e quem no topo** em todas: em Compras e em Apara/Perda o "quem
  está registrando" ficava depois de tudo preenchido.
- **− / + iguais** (`components/lancamento/Passador.jsx`) em Entrada,
  Saída, Contagem e Fechar turno. A Contagem e o Fechar turno só tinham o
  campo.
- **Nomes inteiros** (U6): quebram em duas linhas, não cortam mais.
- **Resumo por unidade** (`utils/lancamento.js`): o consumo do turno
  somava "3 unid + 3 L + 2 unid" num "18" sem unidade.
- **Fechar turno: contar antes de fechar** (U10). O botão foi para o pé.
  Fechar sem nenhuma sobra contada pede confirmação, porque isso vira
  consumo de tudo o que estava disponível. Em branco continua valendo zero.
- **Língua da bancada em Apara/Perda** (U9):
  - "De qual compra veio?" e "De qual item é a apara?" no lugar de "Associar
    à compra" e "Produto de origem";
  - "Para onde vai a apara" e "Por que foi perdido?" com o nome por extenso
    ("Strogonoff", "Vencimento"), sem os códigos "STG —" e "V —";
  - "Qual item foi perdido".
- Produção com o armazenamento em 2 por linha (U12). Saídas: a validade que
  vai para a Finalização aparece acima do pé.
- Títulos: "Contagem" (era "Inventário / Contagem") e "Aparas e perdas"
  ("Perdas" onde não há apara).

**Testes:** 920 testes e 46 cenários do robô (3 novos em `e2e/lote5.pw.js`:
o resumo no pé, o Fechar turno que pede a contagem e apara/perda sem
códigos).

### Lote 6 — o Início diz o que fazer, aplicado em 15/10/2026

**O Início de cada cozinha mostra só o que pede ação agora** (U4: eram duas
telas e meia de rolagem):

| Cozinha | O Início mostra |
|---|---|
| Produção | produzir hoje, vencendo, risco de faltar, lista de compras, etiquetas impressas hoje |
| Finalização | **fechar o turno** (com quantos itens estão na bancada), vencendo, etiquetas de hoje |
| Seco | vencendo, risco de faltar, lista de compras |

- Em todas, um cartão leva ao **Estoque completo** (tela nova
  `pages/Estoque.jsx`, rota `/estoque`). Na Produção e no Seco ele mostra os
  números normal, abaixo do mínimo e acima do máximo.
- Na tela Estoque, esses três números também são **filtro**. Ela tem as
  categorias, os subgrupos, os lotes de cada item e as sugestões de mínimo e
  máximo, que saíram do Início.
- A **calculadora de produção** foi para a tela de Produção.

**D5 — a Finalização sem as metas da Produção:**
- novo recurso de cozinha `metasDeEstoque`: ligado na Produção e no Seco,
  desligado na Finalização (`utils/modulos.js`);
- na Finalização saem os "abaixo do mínimo", a bolinha vermelha da barra (que
  ficava sempre acesa) e o selo e a barra de cada item. Os itens que nunca
  chegaram à bancada ficam escondidos até pedir;
- **defeito corrigido junto:** com o mínimo/máximo automático ligado, um
  aparelho aberto na Finalização regravava as metas da Produção com o consumo
  da bancada (as duas cozinhas leem o mesmo catálogo). O recálculo agora só
  roda onde as metas são da própria cozinha.

**Testes:** 926 testes (6 novos em `lote6Inicio.test.js`) e 49 cenários do
robô (3 novos em `e2e/lote6.pw.js`). A medição de toque e contraste cobre a
tela Estoque nas três cozinhas.
