# IA na busca por voz: plano (24/11/2026)

Pedido do dono: usar IA para **entender o pedido falado** na tela de imprimir,
depois que a pessoa toca no nome dela. Uma frase errada ou fora de ordem não
pode travar, como trava hoje no modo de voz sem IA.

**Decisão do dono (24/11/2026): é um TESTE, com o modelo mais barato.**
Claude Haiku 5.5 (`claude-haiku-5-5`), chamado **só quando a busca de hoje não
entender**. Ligado primeiro só na conta de teste do dono.

Primeiro teste: só a tela **Imprimir** do Aurum Etiquetas (o microfone ao lado
de "Buscar produto"). O Pro fica para depois.

---

## 1. O que muda para quem usa

Hoje (`src/utils/voz.js`, `entenderFala` / `acharPorVoz` / `itemCerto`), o app
separa a frase na mão: quantidade, método ("congelado") e o resto vira o nome do
item. Funciona com frases arrumadas. Falha com frases naturais:

- "põe aí duas do frango… não, da carne moída, pra geladeira"
- "imprime o molho de tomate que eu fiz agora, três"
- "frango desfiadu congelado" (erro do reconhecimento de fala)
- "etiqueta do arroz aberto hoje"

Com a IA, nesses casos a **janela de imprimir abre já preenchida** com o item, o
método e a quantidade. **Quem confere e toca Imprimir é a pessoa.** A IA nunca
imprime sozinha.

Se a IA tiver dúvida ("frango desfiado ou peito de frango?"), a tela mostra 2 ou
3 botões grandes para escolher, sem digitar nada.

## 2. Como funciona: a busca de hoje primeiro, a IA só no que ela não entender

```
fala → texto (o reconhecimento do navegador, grátis, como hoje)
     → busca de hoje, no próprio aparelho, na hora (acharPorVoz + itemCerto)
         entendeu com certeza → segue como hoje, SEM IA, sem custo
         não achou ou ficou em dúvida → função "entender-fala" no Supabase
             → Claude Haiku 5.5 devolve { item, método, quantidade, dúvida }
             → a janela de imprimir abre preenchida
```

- **A IA só entra quando a busca de hoje falha** ("Não achei", item sem
  certeza entre parecidos, ou sobra de frase que ela não sabe ler). A maior parte
  das frases continua sem custo e sem espera.
- **A chave da Anthropic fica só no servidor** (segredo da função no Supabase),
  nunca no app. É o mesmo padrão das funções `contas` e `stripe-webhook`, com
  `scripts/publicar-funcao.mjs`.
- **A função lê a lista de itens da própria conta** no banco, com o login de
  quem chamou. O app manda só o texto falado (até 200 letras, com até 3 versões
  que o navegador ouviu). Isso evita que alguém use a nossa chave para outra
  coisa.
- **A resposta só pode apontar itens da lista** (saída estruturada com o id do
  item). Item que não existe na conta não passa.
- **Sem internet, erro, demora de mais de 2,5 s ou resposta incerta: vale o que
  a busca de hoje já mostrava.** Nada fica pior do que é.

### Esboço da função (Deno, SDK oficial da Anthropic)

```ts
// supabase/functions/entender-fala/index.ts (esboço, ainda não existe)
import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod";

const Pedido = z.object({
  itemId: z.string().nullable(),          // só ids da lista enviada no prompt
  metodo: z.string().nullable(),          // id do método/armazenamento do item
  quantidade: z.number().int().min(1).max(50).nullable(),
  duvida: z.array(z.string()).max(3),     // ids de itens, quando não deu para decidir
});

const client = new Anthropic(); // lê ANTHROPIC_API_KEY do segredo da função

const resposta = await client.messages.parse({
  model: "claude-haiku-5-5",              // decisão do dono: o mais barato, como teste
  max_tokens: 1024,
  output_config: { effort: "low", format: zodOutputFormat(Pedido) },
  system: [{ type: "text", text: INSTRUCOES_E_LISTA_DA_CONTA, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: textoFalado }],
});
// stop_reason "refusal" ou parsed_output nulo → o app fica com a busca de hoje
```

Pontos da implementação:

- **Esforço `low`**: é uma escolha simples entre itens, e a cozinha espera a
  resposta.
- **Recusa**: conferir `stop_reason === "refusal"` antes de ler a resposta. O
  Haiku 5.5 não tem troca automática de modelo nesse caso; aqui não precisa,
  porque a reserva é a busca de hoje.
- **Login obrigatório** (a função confere o token) e **limite por conta**
  (ex.: 300 frases por dia), contado no banco.
- **Registro do teste**: guardar, por conta e por dia, quantas frases foram para
  a IA, quantas ela resolveu e os tokens gastos. É assim que se decide se o
  teste vira parte do produto.

## 3. Custo do teste

Estimativa por frase que vai para a IA: cerca de 1.500 tokens de entrada
(instruções + lista de uns 60 itens) e 300 de saída. Preço do Claude Haiku 5.5
em 03/11/2026: US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de
saída.

| Cenário (100 frases por dia, 30 dias) | Por mês, por restaurante |
|---|---|
| Toda frase indo para a IA | cerca de US$ 0,90 (uns R$ 5) |
| Só as que a busca de hoje não entende (estimativa: 20%) | cerca de US$ 0,18 (uns R$ 1) |

A API é paga pelo uso: coloca-se um crédito na conta da Anthropic e ele vai
sendo gasto. Os preços mudam: conferir na página de preços da Anthropic.

## 4. Etapas

1. **Frases reais**: juntar 60 a 100 frases como a cozinha fala, inclusive as
   erradas e as que o reconhecimento estraga, com a resposta certa de cada uma.
   Medir quantas a busca de hoje já acerta e quantas o Haiku 5.5 acerta das que
   ela erra. Meta: 95% de item certo no total.
2. **A função `entender-fala`** + o teste com as frases.
3. **O app**: chamar a função só quando a busca de hoje falhar, "Entendendo…" na
   tela, janela preenchida, botões de dúvida. Ligado por conta (chave em
   `restaurantes`), primeiro só na conta de teste.
4. **O registro do teste no painel**: frases por dia, quantas a IA resolveu,
   custo.
5. **Termos 1.5**: dizer que o texto falado (não o áudio) pode ser processado
   por um fornecedor de IA, sem dados pessoais. Precisa antes de ligar para
   clientes.
6. **Piloto** na conta de teste do dono, no celular, com papel. Depois decidir
   se liga para todos.

## 5. O que o dono precisa fazer

- Criar a conta e a chave da API no Console da Anthropic
  (platform.claude.com), pôr um crédito pequeno e **colar a chave no
  `.env.local`** como `ANTHROPIC_API_KEY=...`. Nunca no chat. O script de
  publicação manda a chave para o segredo da função.
- Testar no celular, como fez com a busca por voz em 05/11.

## 6. Riscos

- **Internet ruim na cozinha**: fica o que a busca de hoje mostrava, sem espera
  longa (2,5 s no máximo).
- **Custo por volume**: limite diário por conta e o registro do teste.
- **Frase ambígua**: a IA devolve dúvida e a pessoa escolhe; nunca chuta e
  imprime.
- **Privacidade**: só o texto falado e os nomes dos itens saem da conta. Nada
  de nome da pessoa, CNPJ ou endereço.
