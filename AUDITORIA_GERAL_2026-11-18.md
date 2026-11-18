# Auditoria geral — 15 a 18/11/2026

Segunda auditoria completa, duas semanas depois da de 04/11
(`AUDITORIA_GERAL_2026-11-04.md`). Foco: o que mudou desde então (voz, método
pela voz, minuto sem uso), o banco e a manutenção.

---

## Resumo em um minuto

- **O APP ESTÁ FORA DO AR PARA QUEM TEM CONTA: o Supabase pausou o banco de
  novo em 14/11.** A demonstração funciona, porque não usa o banco. Para
  voltar, só você pode agir: painel do Supabase → projeto "Estoque controle
  Aurum" → **Resume project**.
- **A tarefa que mantinha o banco acordado não bastou.** Ela consultava o
  banco dia sim, dia não, e o Supabase considerou isso pouco. Já reforcei: 4
  rodadas por dia, 3 consultas cada. Mesmo assim não é garantia; garantia só
  no plano pago.
- **A busca por voz tinha um defeito:** os 6 itens da biblioteca com hífen
  (Couve-flor, Grão-de-bico, Pimenta-do-reino, Noz-moscada, Cheiro-verde,
  Batata-doce) nunca eram achados. **Corrigido e publicado.** Testei a voz
  contra os 261 itens da biblioteca, com quantidade e método juntos: todos
  passam.
- **A vírgula nos números funciona:** num navegador em português, "1,5" vira
  1,5 kg certinho. O ponto que ficou "a conferir" na auditoria de 04/11 está
  fechado.
- Testes: **1.069 de unidade** e **73 cenários do robô**, todos passando.
  Nenhuma vulnerabilidade nas dependências.

---

## 1. O banco pausado (o mais urgente)

**O que aconteceu, pelos e-mails do Supabase:**

| Data | E-mail |
|---|---|
| 13/11 | "Your project Estoque controle Aurum is going to be paused" — sem "atividade suficiente" em 7 dias |
| 14/11 | "has been paused" |
| 15/11 e 17/11 | a tarefa "Manter o banco acordado" falhou nas duas rodadas (o GitHub te mandou e-mail) |

**Por que a tarefa não segurou:** a documentação do Supabase diz que o que
costuma bastar são "algumas consultas ao banco por dia" na semana, sem dar o
número exato. A tarefa fazia **uma consulta a cada dois dias**: rodou sempre
com sucesso, mas ficou abaixo do que o Supabase conta.

**O que já foi feito:** a tarefa agora roda **4 vezes por dia**, com **3
consultas** em cada rodada, totalizando 12 consultas por dia. Só a rodada das
08h17 manda e-mail se o banco não responder, para não chegarem 4 e-mails por
dia.

**O que só você pode fazer:**
1. Entrar em supabase.com/dashboard **com a conta atiliopinpolho**. O Chrome
   está logado em outra conta do Supabase, e por isso eu não consegui ver o
   projeto.
2. Abrir o projeto **Estoque controle Aurum** e tocar em **Resume project**.
   Pela documentação, os dados voltam como estavam, e dá para restaurar em até
   1 ano depois da pausa.
3. Decidir o **plano pago (US$ 25/mês)**. É a única garantia de que não pausa,
   e traz junto a cópia de segurança diária e a proteção contra senha vazada.
   Com um cliente pagando, deixa de ser opcional: cliente sem conseguir entrar
   por uma semana é cliente perdido.

**Outro aviso que chegou (30/10):** o projeto **instituto-cesar-santos** (o
app do Instituto) estava pausado havia 85 dias e seria **congelado de vez**
5 dias depois, em 04/11. Já passou do prazo. Se ainda quiser esse app, dá para
baixar os dados pelo painel; restaurar o projeto do jeito que estava, não dá
mais.

---

## 2. Bugs achados e corrigidos

| # | Onde | O que acontecia | Situação |
|---|---|---|---|
| A1 | Nos dois planos — busca por voz | Nome com hífen nunca era achado: "couve-flor" virava "couveflor". São 6 itens da biblioteca, mais os que o cliente cadastrar com hífen | **Corrigido e publicado (38339a8)**. Teste contra os 261 itens da biblioteca: pelo nome, com quantidade e com método |
| A2 | Nos dois planos — busca por voz | O nome de cada item era recalculado a cada comparação; numa conta grande, a busca pesaria no celular fraco | **Corrigido**: o nome é preparado uma vez só. O teste dos 261 itens caiu de 107 s para 7,5 s |
| A3 | Banco | A tarefa de manter o banco acordado consultava pouco | **Corrigido** (seção 1). Falta você restaurar o projeto |

**Conferido e sem defeito:**
- **Vírgula nos números (Pro):** com o navegador em português, "1,5" e
  "0,25" chegam como 1,5 e 0,25.
- **Voz:** quantidade e método em qualquer ordem, frase repetida pelo Android,
  item sem o método falado. Todos cobertos pelo robô.
- **Segurança do código:**
  - nenhuma chave secreta no app publicado;
  - nenhum link externo sem proteção;
  - o único HTML injetado é o desenho do QR, que o próprio app gera.

---

## 3. Manutenção (nada muda na tela)

| # | O quê | Por quê | Tamanho |
|---|---|---|---|
| M1 | **Subir o Node do deploy de 20 para 22** | O Node 20 deixou de receber correções de segurança em abril/2026. O deploy ainda funciona, mas roda numa versão sem suporte | Pequeno |
| M2 | Atualizar dependências menores (Supabase 2.119, React 19.3, Playwright 1.65) | Correções acumuladas; nenhuma é de segurança | Pequeno |
| M3 | Vite: investigar a tela Entradas antes de subir para 8.3 | Continua parado em 8.1.6 de propósito (ver 04/11) | Pequeno a médio |
| M4 | Política de segurança de conteúdo (CSP) no `index.html` | Pendente desde a auditoria de julho: limita de onde o app aceita carregar coisas. Precisa de teste com o Stripe e o app instalado | Pequeno, testar bem |
| M5 | Os 3 avisos antigos do verificador de código | Dependências de efeito (`soEtiquetas`, `tiposDoModulo`). Não quebram nada hoje | Pequeno |
| M6 | Migração M62 (ajustes do banco, da auditoria de 04/11) | Continua valendo; precisa do banco de volta | Pequeno |

---

## 4. O que continua com você

1. **Restaurar o banco** (Resume project) — **urgente**.
2. **Plano pago do Supabase** — recomendado antes do primeiro cliente.
3. **Verificação em duas etapas** na conta do Supabase. Em 04/11 estava
   desligada. Hoje não consegui conferir, porque o Chrome está em outra conta.
4. **Token do Supabase** — continua inválido (testado hoje).
5. **Lote B (M61)**.
6. **APK e Stripe**.

## 5. Números

| Item | Hoje | 04/11 |
|---|---|---|
| Testes de unidade | 1.069 | 1.015 |
| Cenários do robô | 73 | 60 |
| Vulnerabilidades | 0 | 0 |
| Último deploy | 15–18/11, com sucesso | — |
| Banco | **pausado desde 14/11** | no ar |

---

## Apêndice técnico (para a próxima conversa)

- `utils/voz.js`:
  - `pedacos` troca toda pontuação (hífen incluído) por espaço antes de
    separar as palavras;
  - `nomePronto` guarda o nome de cada item já preparado, num Map com teto de
    5.000 nomes;
  - `pontuarItem` usa o nome preparado; o nível 80 confere as palavras
    direto, sem passar por `casaBusca`;
  - `tirarMetodo` procura o método do fim para o começo.
- `voz.test.js`: bloco "a biblioteca inteira pela voz" (os 261 itens).
- `.github/workflows/manter-acordado.yml`: cron `17 11 * * *` (avisa) +
  `47 2,17,22 * * *` (só registra). A variável `AVISAR` decide se a rodada
  falha.
- Documentação do Supabase sobre a pausa: 7 dias, "a few user requests to the
  database each day"; restaura em até 1 ano.
