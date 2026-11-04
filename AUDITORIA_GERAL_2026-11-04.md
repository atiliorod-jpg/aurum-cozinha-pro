# Auditoria geral — 04/11/2026

Sistema auditado: **Aurum Etiquetas** (o plano simples) e **Aurum Cozinha Pro**
(o completo, que também tem as etiquetas). Quando uma melhoria vale para os
dois, está escrito "nos dois".

Como foi feita:
- testes automáticos e robô no navegador;
- verificadores de segurança e de desempenho do próprio Supabase;
- leitura do código, com foco no que mudou nos últimos dias;
- fotos das telas no tamanho de celular, nos dois planos;
- pesquisa do suporte atual a reconhecimento de voz nos navegadores;
- preços atuais da IA da Anthropic.

---

## Resumo em um minuto

- **A saúde é boa.**
  - **Testes e robô:** 1.023 testes e 63 cenários do robô, rodando a cada publicação.
  - **Dependências:** nenhuma vulnerabilidade.
  - **Banco:** nenhum erro de segurança apontado pelo Supabase.
- **Achei 5 bugs e corrigi todos hoje** (seção 2). Dois afetavam o dia a dia
  nos dois planos:
  - a tela nova abria rolada, com o topo escondido;
  - a reimpressão perdia o lote do fabricante.
- **O que mais pesa agora não é código, são três coisas da conta:**
  - a verificação em duas etapas da sua conta do Supabase está desligada;
  - o plano grátis do Supabase não faz cópia de segurança;
  - o Lote B segue parado.
- **IA no sistema: dá, ao vivo, ligada ao app, com internet.** Cada uso custa
  alguns centavos. O melhor começo é a **foto do rótulo do fabricante**, que
  preenche lote e validade original sozinha (nos dois planos). No Pro, depois,
  vem o **assistente de perguntas sobre o estoque**.
- **Busca por voz: dá, sem custo nenhum**, no Chrome do Android e no Safari do
  iPhone. Precisa de internet, porque o áudio vira texto no serviço do
  Google/Apple. É o passo mais barato e rápido desta lista. **Feita e publicada
  no mesmo dia (E1), a pedido do dono.**

---

## 1. Como está hoje

| Item | Situação |
|---|---|
| Código | cerca de 35.700 linhas (fora os testes); 59 migrações no banco |
| Testes | 1.023 testes de unidade em 41 arquivos; 63 cenários do robô no navegador — o deploy para se algum falhar |
| Dependências | 0 vulnerabilidades. Há atualizações menores (React 19.3, Supabase 2.119). O Vite está parado na 8.1.6 de propósito: a 8.3 deixou instável um cenário da tela Entradas, e isso precisa ser investigado antes |
| Primeira abertura do app | cerca de 220 KB de código comprimido. O gerador de QR da janela de impressão vem junto, mesmo antes de alguém imprimir (ver C2) |
| Supabase | plano grátis, Estados Unidos (us-east-1), "Healthy". **Sem cópia de segurança.** Tarefa "Manter o banco acordado" ativa desde 03/11 |
| Uso real | 4 contas de login, 2 restaurantes, 15 etiquetas — ainda sem cliente usando |
| Verificador de segurança do Supabase | **0 erros**, 101 avisos, 15 informações (ver seção 3) |
| Verificador de desempenho do Supabase | **0 erros**, 35 avisos, 29 informações (ver seção 3) |

---

## 2. Bugs encontrados (todos corrigidos e testados hoje)

| # | Onde | O que acontecia | Gravidade | Situação |
|---|---|---|---|---|
| B1 | Nos dois — tela Imprimir | Se o nome expirasse durante a impressão (envio longo pelo Bluetooth, ou o "Saiu no papel?" esperando mais de 1 minuto), a pergunta "Continuar imprimindo?" ficava guardada. Ela aparecia para a **próxima pessoa** que entrasse, e essa pessoa era tirada em 5 segundos | Média | Corrigido. A pergunta só aparece se a pessoa ainda estiver no aparelho quando a etiqueta sai. Robô novo |
| B2 | Nos dois — Impressas | A etiqueta impressa não guardava o **lote do fabricante** nem a validade original. A reimpressão de uma etiqueta estragada saía **sem o lote**, que é o que liga o pote ao recall. Marca e SIF vinham do cadastro de hoje, não do papel original | Média | Corrigido. A etiqueta passa a guardar os quatro, sem migração no banco. Robô novo. ⚠️ Vale para o que for impresso **a partir de agora** |
| B3 | Nos dois — todas as telas | Trocar de tela pela barra de baixo **não voltava ao topo**: a tela nova abria rolada, com as abas, os filtros e a busca escondidos atrás do cabeçalho. Medido: rolei a lista de Imprimir e toquei em Validades; ela abriu com o topo cortado | Média | Corrigido. Toda tela nova abre no topo. Robô novo |
| B4 | Painel da Aurum (só você) | Datas guardadas só com o dia apareciam **um dia antes**: data do pagamento, início da impressora parcelada e fim do desconto. O pagamento do dia 04 aparecia como 03 | Baixa | Corrigido |
| B5 | Nos dois — cópia de segurança | O arquivo da cópia baixada depois das 21h saía com a data de amanhã no nome | Mínima | Corrigido |

**A conferir num celular de verdade (não confirmado como bug):**
- **Vírgula nos números (Pro):** os campos de quantidade são numéricos. Em
  alguns teclados de Android, digitar "1,5" pode ser recusado ou virar "1".
  Teste rápido: lançar uma entrada de 1,5 kg pelo celular e ver se chegam 1,5.
- ~~1 minuto sem uso também nos lançamentos do Pro~~ → **resolvido no mesmo
  dia (D6):** o minuto só vale na tela Imprimir. Nos lançamentos o nome não
  expira. Quem chega na tela Imprimir depois de 1 minuto com o aparelho parado
  em outra tela também volta para os nomes, para ninguém imprimir no nome de
  quem saiu.

---

## 3. Segurança e banco (nos dois)

**Ações que só você pode fazer:**
1. **Verificação em duas etapas na sua conta do Supabase: DESLIGADA**
   (conferido hoje, "No authenticator apps yet"). É a conta que abre os dados
   de todos os clientes. Para ligar: supabase.com → Account → Security → Add app.
2. **Token de acesso do Supabase: inválido** (testado hoje). Sem ele, eu só mexo
   no banco pelo painel aberto no seu Chrome.
3. **Plano grátis do Supabase:**
   - **sem cópia de segurança diária;**
   - **sem a proteção contra senhas vazadas**, um aviso do verificador que só se
     resolve no plano pago;
   - **pausa sem uso**, já contornada pela tarefa automática.

   Recomendação mantida: plano Pro (US$ 25/mês) quando entrar o primeiro cliente
   pagante.

**O que o verificador de segurança apontou:**
- 0 erros.
- **99 dos 101 avisos são de propósito.** São as funções que o app chama e que
  conferem a permissão por dentro (quem é, de que casa, se pode). Duas delas
  respondem sem login, também de propósito: a do link de convite e a do
  "Esqueci minha senha", que tem trava de tentativas.
- **As 15 informações são de propósito.** São tabelas que ninguém lê direto,
  só por essas funções.
- **Pequenos ajustes (migração M62, curta):**
  - fixar o caminho de busca da função `_fecha_funcao_nova`;
  - tirar a permissão de chamar as 6 funções internas de gatilho (`_check_cargo_change` e outras).
    Hoje elas já não podem ser chamadas como gatilho de fora, mas fica mais limpo.

**O que o verificador de desempenho apontou** (só pesa com muitos clientes; dá
para ir junto na M62):
- as regras de acesso de `perfis` e `sessoes` recalculam "quem está logado" a
  cada linha. O ajuste é trocar `auth.uid()` por `(select auth.uid())`;
- `documentos` tem várias regras de acesso que se somam, e dá para juntar;
- 8 chaves estrangeiras sem índice;
- índices "sem uso" — normal sem clientes ainda; não apagar.

**Funções do servidor conferidas:**
- `contas`: confere quem chama, se é o dono ativo e se a conta alvo é da mesma casa.
- `stripe-webhook`: só libera pagamento confirmado — boleto sem pagar não libera.
- Nenhum problema novo.

---

## 4. Melhorias — Aurum Etiquetas (o plano simples)

| # | Melhoria | Para quê | Tamanho |
|---|---|---|---|
| E1 | **Busca por voz** na tela Imprimir (ver seção 8) — **FEITO 04/11** | Achar o item falando, com a mão suja ou de luva | Pequeno |
| E2 | **"Vence hoje / amanhã"** no topo da tela Imprimir e como filtro em Impressas | O plano simples não tem a tela Validades do Pro; hoje ninguém vê de relance o que vence no dia | Médio |
| E3 | **Imprimir vários itens de uma vez** (marcar 5 itens, quantidades, um envio só) | A abertura da cozinha imprime a mesma lista todo dia; hoje é um item por vez | Médio |
| E4 | **Foto do rótulo preenche lote e validade original** (IA, ver seção 7) | Hoje são digitados à mão, e o lote é o que mais se erra | Médio |
| E5 | **Cadastro assistido** (IA): digitar ou falar uma lista ("frango desfiado, molho branco, arroz…") e o app sugere grupo, método e prazo, para o dono aprovar | A conta nova começa vazia; cadastrar 50 itens é o maior atrito do início | Médio |
| E6 | **Guia do iPhone dentro do app** (navegador Bluefy) | O iPhone não imprime pelo Bluetooth no Safari; hoje o app não diz o que fazer | Pequeno |

Já existem e não entram aqui: a planilha do relatório de etiquetas, os "Mais
usados" no topo e a etiqueta de teste da impressora.

---

## 5. Melhorias — Aurum Cozinha Pro

| # | Melhoria | Para quê | Tamanho |
|---|---|---|---|
| P1 | **Lote B (M61)**: embalagem recebida na Finalização pelo QR | Está pronto; falta só a mudança no banco | Já feito, falta aplicar |
| P2 | **Lotes 8 e 10 da auditoria de 14/10**, por dentro: separar a central de dados, lançamentos no IndexedDB, tempo real mais leve, apagar etiquetas antigas | Aguentar contas grandes e muitos aparelhos sem pesar | Grande |
| P3 | **Grupos como filtro** em Entradas, Saídas e Contagem | Ficou de fora do Lote 11; hoje essas telas usam só o grupo principal | Pequeno |
| P4 | **Voz para a quantidade** nos lançamentos ("frango, quatro quilos") | Lançar sem largar o que está pesando | Médio |
| P5 | **Nota fiscal por foto** (IA): fotografar a nota ou o romaneio e o app monta a entrada em Compras para conferir | Hoje cada item da nota é digitado | Médio a grande |
| P6 | **Assistente de perguntas** (IA): "quanto frango produzi esta semana?", "o que vence amanhã?", "por que a picanha está acabando?" — responde com os números da conta | Tirar dúvida sem montar relatório | Grande |
| P7 | **Resumo da semana em texto** (IA), toda segunda: perdas, o que mais saiu, o que faltou | O dono lê em 1 minuto o que hoje exige abrir 3 relatórios | Pequeno a médio |

---

## 6. Por dentro (nos dois, nada muda na tela)

| # | Melhoria | Tamanho |
|---|---|---|
| C1 | Migração M62 (os ajustes do banco da seção 3) | Pequeno |
| C2 | Carregar a janela de impressão só quando alguém for imprimir: o gerador de QR sai da primeira abertura, e o app abre mais rápido no celular fraco | Pequeno |
| C3 | Atualizar dependências; investigar a tela Entradas antes de subir o Vite | Pequeno a médio |

---

## 7. IA no sistema — dá para colocar?

**Dá, ao vivo e ligada ao app.** O desenho é este:

```
celular (app) → função no Supabase → IA da Anthropic (Claude)
```

- **A chave da IA fica só no servidor.** Ninguém consegue tirá-la do app.
- **A função confere quem está logado** e conta quanto cada casa usou no dia.
  Um limite por conta impede que um cliente gaste sem controle.
- **Sem internet, a IA não funciona.** O app continua como hoje, com digitação.
- **A IA nunca imprime nem grava sozinha.** Ela preenche os campos e a pessoa
  confere. Prazo sugerido pela IA só vale depois que o responsável aprova: a
  responsabilidade sanitária continua sendo da casa.

**O que cada plano ganharia:**

| Uso | Etiquetas | Pro |
|---|---|---|
| Foto do rótulo → lote, validade original, marca, SIF | sim (E4) | sim |
| Cadastro assistido de itens | sim (E5) | sim |
| Comando completo ("3 etiquetas de frango desfiado refrigerado") | sim | sim |
| Nota fiscal por foto → entrada | — | sim (P5) |
| Assistente de perguntas sobre o estoque | — | sim (P6) |
| Resumo da semana | — | sim (P7) |

**Quanto custa cada uso** (estimativa — o piloto mede o número real; dólar
a R$ 5,50, ajustar pela cotação do dia):

| Uso | Claude Opus 5.5 (o mais preciso) | Claude Sonnet 5.5 | Claude Haiku 5.5 (o mais barato) |
|---|---|---|---|
| Foto do rótulo | ~R$ 0,07 | ~R$ 0,035 | ~R$ 0,002 |
| Comando falado ou digitado | ~R$ 0,03 | ~R$ 0,015 | ~R$ 0,002 |
| Cadastro assistido (lista de 20 itens) | ~R$ 0,25 | ~R$ 0,13 | ~R$ 0,01 |
| Nota fiscal por foto | ~R$ 0,15 | ~R$ 0,08 | ~R$ 0,005 |
| Uma pergunta ao assistente | ~R$ 0,30 | ~R$ 0,15 | ~R$ 0,01 |
| Resumo da semana (processado em lote, metade do preço) | ~R$ 0,20 | ~R$ 0,10 | ~R$ 0,01 |

Preço por milhão de "pedaços de texto" (tokens), entrada / saída:
- Opus 5.5: US$ 4 / US$ 20;
- Sonnet 5.5: US$ 2 / US$ 10;
- Haiku 5.5: US$ 0,10 / US$ 0,50.

**Exemplo de um mês, numa cozinha:** 20 fotos de rótulo por dia (600 no mês)
e 10 perguntas por dia no Pro (300 no mês).

| | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|---|
| Fotos de rótulo | ~R$ 40 | ~R$ 20 | ~R$ 1 |
| Perguntas ao assistente | ~R$ 90 | ~R$ 45 | ~R$ 3 |

Perto dos R$ 149,90 do plano, a escolha do modelo e um **limite por conta**
(ou a IA como adicional pago) são decisões de negócio — suas.

**Recomendação:**
1. Começar por um **piloto da foto do rótulo**, com o Opus 5.5, em umas 30
   fotos reais de rótulos da cozinha (amassados, molhados, de lado).
2. Medir quanto ele acerta e quanto custou.
3. Rodar as mesmas fotos nos outros dois modelos. Se acertarem igual, baratear
   é uma escolha segura, e a decisão fica com você com os números na mão.

**IA por voz ("falar com o app"):**
- A voz vira texto no próprio celular, de graça (seção 8).
- O Claude entende o pedido.
- O app executa e pode responder falando, com a voz do próprio celular, também
  de graça.

A IA da Anthropic trabalha com texto e imagem; ela não recebe o áudio direto.
A resposta leva de 2 a 5 segundos.

**Cuidados antes de ligar:**
- **Termos de uso e privacidade:** incluir a Anthropic como prestadora de
  serviço. Pelos termos comerciais dela, o que é enviado pela API não é usado
  para treinar os modelos.
- **Foto de rótulo não tem dado pessoal.** O assistente de perguntas envia
  dados da casa: o cliente precisa saber disso.
- **Erro de leitura:** rótulo amassado ou borrado pode ser lido errado. Por
  isso a pessoa sempre confere antes de imprimir, e a tela mostra a foto ao
  lado do que foi lido.

---

## 8. Busca por voz — dá para colocar?

**Dá, e sem IA paga.** O próprio navegador transforma fala em texto.

**Como fica na tela Imprimir (nos dois planos):**
1. Um botão grande de microfone ao lado de "Buscar produto". A pessoa segura o
   botão, fala e solta.
2. A tela mostra o que entendeu ("frango desfiado") e faz a mesma busca de hoje,
   que já ignora acentos. Ganha tolerância a pequenos erros: "frango desfiada"
   acha "Frango desfiado".
3. Se só um item casa, a janela de impressão já abre. Com vários, a lista filtra.
   Se nenhum casa: "Não achei 'X'. Fale de novo ou digite."
4. "Três etiquetas de frango desfiado" já abre com 3 na quantidade. Isso é feito
   no próprio app, sem custo.

**Onde funciona:**
- **Funciona:**
  - no Chrome do Android, inclusive no app instalado;
  - no Safari do iPhone, a partir do iOS 14.5;
  - no Chrome e no Edge do computador.
- **Não funciona:**
  - no Firefox;
  - no navegador de dentro do WhatsApp e do Instagram.

  Nesses casos o botão não aparece.
- **Precisa de internet.** O áudio vai para o serviço de voz do Google (Chrome)
  ou da Apple (Safari). O modo que funciona sem internet existe, mas ainda é
  experimental nos navegadores, então não dá para contar com ele.
- **Barulho da cozinha:** a coifa atrapalha. Ajuda segurar o botão para falar,
  aproximar o celular da boca e mostrar o que foi entendido antes de agir.
- **Microfone:** o navegador pede permissão uma vez.
- **Privacidade:** citar nos Termos que a voz passa pelo serviço do Google ou
  da Apple.

**Custo:** zero. **Tamanho:** pequeno, um lote. **Vale nos dois planos**,
porque a tela Imprimir é a mesma. No Pro dá para levar depois às buscas de
Entradas, Saídas e Contagem (P4).

Fontes da pesquisa (04/11/2026):
- [MDN: processLocally (experimental)](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally)
- [Microsoft Edge: reconhecimento de voz no aparelho](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api)
- [Suporte da Speech Recognition API por navegador](https://www.testmuai.com/learning-hub/speech-recognition-api-browser-support/)
- [Chrome: introdução à Web Speech API](https://developer.chrome.com/blog/voice-driven-web-apps-introduction-to-the-web-speech-api?hl=en)

---

## 9. Decisões que são suas

| # | Decisão |
|---|---|
| D1 | Ligar a verificação em duas etapas na conta do Supabase (só você pode) |
| D2 | Quando passar o Supabase para o plano pago (cópia de segurança + proteção de senha vazada) |
| D3 | Quando aplicar o Lote B (M61) |
| D4 | ~~Busca por voz~~ → **sim, feita e publicada em 04/11** |
| D5 | Piloto da IA com a foto do rótulo → **"agora não"** (04/11). Fica o plano da seção 7 |
| D6 | ~~Minuto sem uso nos lançamentos~~ → **só na tela de impressão** (feito em 04/11) |
| D7 | E2, E3, E6 e P3 → **sem escolha por enquanto** (04/11) |

## 10. Ordem sugerida

1. **Feito hoje:** os 5 bugs da seção 2, com testes e robô.
2. **Você:** verificação em duas etapas no Supabase (D1).
3. ~~Busca por voz (E1)~~ — **feita em 04/11**.
4. **Por dentro:** M62 (banco) + C2 (abrir mais leve) + C3 (dependências).
5. **Lote B (M61)**, quando você liberar.
6. **Piloto da IA** (foto do rótulo), depois da sua decisão sobre custo.
7. E2, E3, E6 e P3, conforme sua escolha.
8. Lotes 8 e 10, sem pressa.

---

## Apêndice técnico (para a próxima conversa)

- **B1:** `Etiquetas.jsx` → `operadorAgora` (ref sincronizada por efeito). O
  `aoTerminar` só liga a pergunta se houver operador no momento em que a
  etiqueta sai. Robô: `e2e/auditoria0411.pw.js` (relógio simulado, "Saiu no
  papel?" + 1:10).
- **B2:** `registrarImpressao` grava `lote`, `valOriginal`, `marca` e `sif` no
  `dados` (jsonb, teto de 2 KB da M55 — cabe); `Impressas.reimprimir` devolve.
  Linhas antigas continuam sem esses campos.
- **B3:** `App.jsx` → `TopoAoTrocarDeTela` (`scrollTo(0, 0)` a cada `pathname`;
  com `#`, não mexe).
- **B4:** `formatters.fmtDataDoBanco` (dia sozinho por `fmtData`, carimbo por
  `toLocaleDateString`). `Admin.dataBR = fmtDataDoBanco`.
- **B5:** nomes das cópias com `hoje()`.
- **IA:**
  - Edge Function em TypeScript (Deno) com o SDK oficial `@anthropic-ai/sdk`;
    a chave vai nos segredos do Supabase;
  - modelo padrão `claude-opus-5-5` (o raciocínio fica sempre ligado; para
    leitura de rótulo, esforço `low`);
  - saída em JSON garantida por `output_config.format`;
  - lista de itens da casa no prompt com cache (leitura a US$ 0,20 por milhão);
  - tabela `uso_ia` (conta, dia, tokens) para o limite e o custo;
  - resumo semanal pela Batch API (50%).
- **Voz:** `SpeechRecognition`/`webkitSpeechRecognition` com `lang='pt-BR'`,
  `interimResults` para mostrar o que está entendendo; erro `network` → avisar
  "a voz precisa de internet". Esconder o botão quando a API não existe.
- **Voz (feita em 04/11):** `utils/voz.js` (`entenderFala`, `pontuarItem`,
  `acharPorVoz`, `itemCerto`, `textoDoErroDeVoz`) + `components/BuscaPorVoz.jsx`
  em volta da busca de `pages/Etiquetas.jsx`. A quantidade falada fica em
  `qtdDaVoz` para o item tocado na lista. Robô: `e2e/buscaPorVoz.pw.js`, com o
  reconhecimento de fala trocado por um de mentira (`window.__fala`).
- **Minuto sem uso só na tela Imprimir (04/11):** `OperadorContext` conta as
  telas abertas (`useTelaDeImprimir`, chamado em Etiquetas.jsx). Fora delas,
  `conferir` não expira. `abrirTelaDeImprimir` compara o toque anterior
  (`usoAnteriorRef`) com o que trouxe até a tela: 1 minuto ou mais parado →
  expira na chegada.
