# Ativar pagamentos de verdade (Stripe) — Aurum Cozinha Pro

> ⚠️ **Situação atual (19/07/2026): o pagamento na tela do app é por PIX** (QR + copia-e-cola +
> "Já paguei"), com ativação manual pelo super-admin no `/admin`. **O Stripe é OPCIONAL/futuro** —
> este guia (webhook, Payment Link) só entra em cena se você decidir migrar para cartão automático.
> O código do webhook está pronto em `supabase/functions/stripe-webhook/` mas **não está publicado**;
> o app **não depende** dele. Premissa do webhook: Payment Link **mensal** (sempre +31 dias) e rode a
> `migration12` antes (mapeia o cliente Stripe para reconhecer renovações).

Este guia leva o pagamento (via Stripe) para produção, caso você opte por ele em vez do Pix.
Enquanto o app usa Payment Link em **modo de teste**, cartões são falsos e nada é cobrado; a
ativação é manual (super-admin, botões de plano no `/admin`).

Este guia leva o pagamento para produção. São **duas fases**:

- **Fase 1 — receber de verdade (o essencial).** Você ativa a conta no Stripe, conecta o banco
  e troca as chaves de teste pelas de produção. A cobrança passa a ser real; a ativação continua
  manual pelo `/admin` (funciona bem para os primeiros clientes).
- **Fase 2 — ativação automática (opcional).** Publica a função `stripe-webhook` no Supabase para
  que a assinatura ative sozinha assim que o cliente paga (e renove todo mês, sem ninguém clicar nada).

> ⚠️ **Chave secreta (`sk_...`) nunca vai para o app nem para o GitHub.** Ela só existe no painel do
> Stripe e, na Fase 2, nos *secrets* do Supabase (servidor). Não cole a chave secreta em lugar nenhum
> do código nem me envie por chat. A chave **publicável** (`pk_...`) é pública por design e pode ficar no app.

---

## Fase 1 — Receber pagamentos de verdade

Tudo aqui é feito por você, no site do Stripe (você controla dinheiro e documentos).

1. **Ative o modo de produção (live)** em https://dashboard.stripe.com — o Stripe pede alguns dados
   do seu negócio/CPF-CNPJ para verificação (exigência legal). Pode levar de minutos a alguns dias.
2. **Conecte uma conta bancária brasileira (BRL)** em *Settings → Bank accounts and currencies*.
   É para onde o Stripe deposita o que você receber.
3. **Crie o produto e o preço**: *Product catalog → Add product* → nome "Aurum Cozinha Pro",
   preço **R$ 149,00**, cobrança **mensal (recurring)**.
4. **Crie um Payment Link** para esse preço: *Payment links → New*. Marque para **coletar o e-mail**
   e, em *After payment*, aponte a URL de sucesso para `https://atiliorod-jpg.github.io/aurum-cozinha-pro/`.
   Copie o link gerado (algo como `https://buy.stripe.com/xxxxxxxx`).
5. **Pegue a chave publicável de produção**: *Developers → API keys → Publishable key* (`pk_live_...`).
6. **Troque os secrets do GitHub** (Settings → Secrets and variables → Actions do repositório):
   - `VITE_STRIPE_PAYMENT_LINK` → o novo link `https://buy.stripe.com/...`
   - `VITE_STRIPE_PUBLISHABLE_KEY` → a `pk_live_...`
   Um novo push (ou "Re-run" do último deploy) publica o app já com o link de produção.

Pronto: o cliente paga de verdade. Você vê o pagamento no Stripe e ativa a conta dele no `/admin`
(o `client_reference_id` que o app envia já mostra **qual restaurante** pagou — é o id que aparece no
pagamento dentro do Stripe, facilitando o casamento).

> Enquanto não fizer a Fase 2, o texto "a equipe Aurum ativa em até 24h" na tela de assinatura
> continua verdadeiro.

---

## Fase 2 — Ativação automática (webhook)

Deixa a assinatura ativar sozinha no pagamento e nas renovações mensais. O código já está pronto no
repositório (`supabase/functions/stripe-webhook/`); falta **publicar** e **configurar os segredos** —
passos seus, porque envolvem suas credenciais.

Pré-requisito: ter a [CLI do Supabase](https://supabase.com/docs/guides/cli) instalada e logada
(`supabase login`), e o projeto vinculado (`supabase link --project-ref lifiyldinefisedmkayz`).

1. **Rode a migração 12** (adiciona a coluna que reconhece as renovações):
   cole `src/lib/migration12_stripe.sql` no *SQL Editor* do Supabase e execute.
2. **Publique a função:**
   ```bash
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
   (`--no-verify-jwt` porque quem chama é o Stripe, não um usuário logado.)
   A URL fica: `https://lifiyldinefisedmkayz.functions.supabase.co/stripe-webhook`
3. **Defina a chave secreta do Stripe** como secret do Supabase (nunca no código):
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_...   # ou sk_test_... para testar antes
   ```
4. **Crie o endpoint de webhook no Stripe**: *Developers → Webhooks → Add endpoint*.
   - URL: a do passo 2.
   - Eventos: `checkout.session.completed` e `invoice.paid`.
   - Copie o *Signing secret* (`whsec_...`) que o Stripe mostra.
5. **Defina o signing secret** no Supabase:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```
   (As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já vêm preenchidas no ambiente da função —
   não precisa defini-las.)
6. **Teste antes de ir para produção**, ainda em modo teste do Stripe: use o Payment Link de teste com
   `?client_reference_id=<id-de-um-restaurante-de-teste>` e confirme que a coluna `assinatura_ate`
   daquele restaurante avança sozinha. A CLI do Stripe ajuda: `stripe listen --forward-to <URL da função>`.

Quando estiver validado, é só usar as chaves `sk_live_/pk_live_` e o Payment Link de produção da Fase 1.

> Depois que o webhook estiver no ar, dá para trocar o texto da tela de assinatura para "a ativação é
> automática assim que o pagamento é confirmado" — me avise que eu ajusto.

---

## Segurança — resumo

- **`pk_...` (publicável):** pública por design. Pode no app e no GitHub. ✅
- **`sk_...` (secreta):** só no painel do Stripe e nos secrets do Supabase. Nunca no app, nunca no
  GitHub, nunca em chat. ❌
- O `.env.local` (que tem chaves de teste e a service role do Supabase) **é ignorado pelo Git** pela
  regra `*.local` — confira que continua assim antes de qualquer commit; **nunca** rode `git add -A`.
- Ative **MFA** na conta do Stripe e na conta super-admin do Supabase.
