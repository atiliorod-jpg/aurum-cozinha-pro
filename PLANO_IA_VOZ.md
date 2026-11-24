# IA na busca por voz: plano (24/11/2026)

Pedido do dono: usar IA para **entender o pedido falado** na tela de imprimir,
depois que a pessoa toca no nome dela. Uma frase errada ou fora de ordem não
pode travar, como trava hoje no modo de voz sem IA.

Primeiro teste: só a tela **Imprimir** do Aurum Etiquetas (o microfone ao lado
de "Buscar produto"). O Pro fica para depois.

---

## 1. O que muda para quem usa

Hoje (`src/utils/voz.js`, `entenderFala` / `acharPorVoz`), o app separa a frase
na mão: quantidade, método ("congelado") e o resto vira o nome do item. Funciona
com frases arrumadas. Falha com frases naturais:

- "põe aí duas do frango… não, da carne moída, pra geladeira"
- "imprime o molho de tomate que eu fiz agora, três"
- "frango desfiadu congelado" (erro do reconhecimento de fala)
- "etiqueta do arroz aberto hoje"

Com a IA, a pessoa fala do jeito dela, e a **janela de imprimir abre já
preenchida** com o item, o método e a quantidade. **Quem confere e toca
Imprimir é a pessoa.** A IA nunca imprime sozinha.

Se a IA tiver dúvida ("frango desfiado ou peito de frango?"), a tela mostra 2 ou
3 botões grandes para escolher, sem digitar nada.

## 2. Como funciona

```
fala → texto (o mesmo reconhecimento do navegador de hoje)
     → função no Supabase "entender-fala" (com a chave da Anthropic)
     → Claude devolve { item, método, quantidade, dúvida }
     → a janela de imprimir abre preenchida
```

- **A chave da Anthropic fica só no servidor** (segredo da função no Supabase),
  nunca no app. É o mesmo padrão das funções `contas` e `stripe-webhook`, com
  `scripts/publicar-funcao.mjs`.
- **A função lê a lista de itens da própria conta** no banco, com o login de
  quem chamou. O app manda só o texto falado (até 200 letras). Isso evita que
  alguém use a nossa chave para outra coisa.
- **A resposta só pode apontar itens da lista** (saída estruturada com o id do
  item). Item que não existe na conta não passa.
- **Sem internet, erro, demora de mais de 2,5 s ou resposta incerta: vale o
  entendimento de hoje** (`acharPorVoz`). Nada fica pior do que já é.

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
  model: "claude-opus-5-5",
  max_tokens: 1024,
  output_config: { effort: "low", format: zodOutputFormat(Pedido) },
  system: [{ type: "text", text: INSTRUCOES_E_LISTA_DA_CONTA, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: textoFalado }],
});
// stop_reason "refusal" ou parsed_output nulo → o app usa o entendimento de hoje
```

Pontos da implementação:

- **Esforço `low`**: é uma escolha simples entre itens, e a cozinha espera a
  resposta. Medir antes de subir.
- **Cache da lista de itens** (`cache_control`): as instruções e a lista mudam
  pouco, então ficam no início do prompt e saem mais baratas a partir da
  segunda frase.
- **Recusa**: conferir `stop_reason === "refusal"` antes de ler a resposta; o
  guia da Anthropic recomenda ligar o `fallbacks: "default"` (beta
  `server-side-fallback-2026-07-01`) nesse modelo. Aqui, se recusar, o app usa
  o entendimento de hoje.
- **Login obrigatório** (a função confere o token) e **limite por conta**
  (ex.: 300 frases por dia), contado no banco.

## 3. Modelo e custo (decisão do dono)

Estimativa por frase: cerca de 1.500 tokens de entrada (instruções + lista de
uns 60 itens) e 300 de saída. Preços da Anthropic em 03/11/2026, sem contar o
desconto do cache:

| Modelo | Por frase | 100 frases por dia, 30 dias |
|---|---|---|
| Claude Opus 5.5 (`claude-opus-5-5`), o padrão recomendado | cerca de US$ 0,012 | cerca de US$ 36 por conta |
| Claude Haiku 5.5 (`claude-haiku-5-5`) | cerca de US$ 0,0003 | cerca de US$ 0,90 por conta |

Com o plano a R$ 99,90, o custo pesa. **Quem decide o modelo é o dono**, depois
de ver os dois acertando (ou errando) as mesmas frases reais (etapa 1). Os
preços mudam: conferir na página de preços da Anthropic antes de decidir.

## 4. Etapas

1. **Frases reais** (antes de qualquer código): juntar 60 a 100 frases como a
   cozinha fala, inclusive as erradas e as que o reconhecimento estraga, com a
   resposta certa de cada uma. É a régua para medir os dois modelos.
2. **A função `entender-fala`** + o teste com as frases (taxa de acerto do item,
   do método e da quantidade). Meta: 95% de item certo.
3. **O app**: chamar a função depois do microfone, "Entendendo…" na tela,
   janela preenchida, botões de dúvida, e o entendimento de hoje como reserva.
   Ligado por conta (chave em `restaurantes`), primeiro só na conta de teste.
4. **Limite e custo no painel**: frases por dia por conta e tokens gastos,
   para a Aurum ver quanto custa cada cliente.
5. **Termos 1.5**: dizer que o texto falado (não o áudio) é processado por um
   fornecedor de IA, sem dados pessoais. Precisa antes de ligar para clientes.
6. **Piloto** na conta de teste do dono, no celular, com papel. Depois decidir
   se liga para todos e se vira parte do plano ou um adicional.

## 5. O que o dono precisa fazer

- Criar a conta e a chave da API no Console da Anthropic
  (platform.claude.com) e **colar a chave no `.env.local`** como
  `ANTHROPIC_API_KEY=...`. Nunca no chat. O script de publicação manda a chave
  para o segredo da função.
- Escolher o modelo depois da etapa 1.
- Testar no celular, como fez com a busca por voz em 05/11.

## 6. Riscos

- **Internet ruim na cozinha**: a reserva é o entendimento de hoje, sem espera
  longa (2,5 s no máximo).
- **Custo por volume**: limite diário por conta e o número no painel.
- **Frase ambígua**: a IA devolve dúvida e a pessoa escolhe; nunca chuta e
  imprime.
- **Privacidade**: só o texto falado e os nomes dos itens saem da conta. Nada
  de nome da pessoa, CNPJ ou endereço.
