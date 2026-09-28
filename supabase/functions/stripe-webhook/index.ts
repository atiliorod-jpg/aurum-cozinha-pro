// =====================================================================
//  Aurum Cozinha Pro — Webhook do Stripe (Supabase Edge Function)
//
//  Ativa a assinatura AUTOMATICAMENTE quando o Stripe confirma o pagamento,
//  sem ninguém precisar clicar "+30 dias" no /admin.
//
//  A chave secreta do Stripe e a service role do Supabase ficam aqui, NO
//  SERVIDOR (variáveis de ambiente / secrets do Supabase) — nunca no app do
//  navegador nem no GitHub.
//
//  Como publicar e configurar: veja STRIPE_SETUP.md na raiz do repositório.
//  Segredos que esta função lê (defina com `supabase secrets set ...`):
//    STRIPE_SECRET_KEY         (sk_live_... ou sk_test_...)
//    STRIPE_WEBHOOK_SECRET     (whsec_... — vem do endpoint de webhook do Stripe)
//    SUPABASE_URL              (já vem preenchido no ambiente da função)
//    SUPABASE_SERVICE_ROLE_KEY (já vem preenchido no ambiente da função)
// =====================================================================
import Stripe from 'https://esm.sh/stripe@17?target=deno';
// versão fixa (28/09/2026): '@2' pegava qualquer 2.x publicada, sem revisão
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

// Premissa: o Payment Link do Stripe é MENSAL (R$149). Sempre +31 dias.
// Se um dia oferecer semestral/anual pelo Stripe, mapear o preço → dias aqui
// (o app tem os planos em src/utils/assinatura.js PLANOS).
const DIAS_POR_PAGAMENTO = 31; // 1 mês + folga para o cliente não ficar bloqueado no vencimento
// ⚠️ VALOR MÍNIMO (28/09/2026): sem isto, QUALQUER link de pagamento da mesma
// conta Stripe (um de teste de R$ 1, por exemplo) liberava 31 dias. Defina o
// segredo STRIPE_VALOR_MINIMO_CENTAVOS (ex.: 23000 = R$ 230,00).
const VALOR_MINIMO = Number(Deno.env.get('STRIPE_VALOR_MINIMO_CENTAVOS') ?? '0') || 0;

// ⚠️ O STRIPE REENVIA O MESMO EVENTO (timeout, falha de rede): sem esta trava,
// cada reenvio somava mais 31 dias. O id do evento é gravado; repetido = ignora.
async function jaProcessado(id: string) {
  const { error } = await supabase.from('stripe_eventos').insert({ id });
  if (!error) return false;
  if ((error as { code?: string }).code === '23505') return true; // chave repetida
  throw new Error('não registrou o evento: ' + error.message);
}

// Soma DIAS a partir do maior entre "agora" e o vencimento atual (renovação
// não perde os dias que ainda restavam). Grava também o customer do Stripe
// para reconhecer as renovações futuras.
async function ativarAssinatura(restauranteId: string, customerId?: string) {
  const { data } = await supabase
    .from('restaurantes').select('assinatura_ate').eq('id', restauranteId).maybeSingle();
  if (!data) { console.warn('restaurante não encontrado:', restauranteId); return; }
  const atual = data.assinatura_ate ? new Date(data.assinatura_ate).getTime() : 0;
  const base = Math.max(Date.now(), atual);
  const ate = new Date(base + DIAS_POR_PAGAMENTO * 86400000).toISOString();
  // limpa o aviso "Já paguei" (senão o banner de aviso fica preso após ativar,
  // igual faz a RPC ativar_assinatura do fluxo manual)
  const patch: Record<string, unknown> = {
    assinatura_ate: ate, bloqueado: false,
    aviso_pagamento_em: null, aviso_pagamento_plano: null, aviso_pagamento_nome: null,
  };
  if (customerId) patch.stripe_customer_id = customerId;
  const { error } = await supabase.from('restaurantes').update(patch).eq('id', restauranteId);
  if (error) console.error('falha ao ativar', restauranteId, error.message);
  else console.log('assinatura ativada até', ate, 'para', restauranteId);
}

Deno.serve(async (req) => {
  const assinatura = req.headers.get('stripe-signature');
  const corpo = await req.text();
  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(corpo, assinatura ?? '', webhookSecret);
  } catch (e) {
    return new Response(`Assinatura inválida: ${(e as Error).message}`, { status: 400 });
  }

  try {
    if (evento.type === 'checkout.session.completed' || evento.type === 'checkout.session.async_payment_succeeded') {
      // Primeiro pagamento: o app enviou o id do restaurante em client_reference_id.
      const s = evento.data.object as Stripe.Checkout.Session;
      // ⚠️ BOLETO chega aqui com payment_status 'unpaid' — o dinheiro só entra
      // (ou não) dias depois, em async_payment_succeeded. Só libera pago.
      if (s.payment_status !== 'paid') return new Response('aguardando pagamento', { status: 200 });
      if (VALOR_MINIMO && (s.amount_total ?? 0) < VALOR_MINIMO) {
        console.warn('pagamento abaixo do mínimo — não libera', s.id, s.amount_total);
        return new Response('valor abaixo do plano', { status: 200 });
      }
      if (await jaProcessado(evento.id)) return new Response('repetido', { status: 200 });
      const rid = s.client_reference_id;
      if (rid) await ativarAssinatura(rid, typeof s.customer === 'string' ? s.customer : undefined);
      else console.warn('checkout sem client_reference_id — não sei qual restaurante ativar');
    } else if (evento.type === 'invoice.paid') {
      // Renovação mensal (não o primeiro pagamento, que já veio no checkout acima).
      const inv = evento.data.object as Stripe.Invoice;
      if (inv.billing_reason === 'subscription_cycle') {
        if (VALOR_MINIMO && (inv.amount_paid ?? 0) < VALOR_MINIMO) {
          console.warn('renovação abaixo do mínimo — não libera', inv.id, inv.amount_paid);
          return new Response('valor abaixo do plano', { status: 200 });
        }
        if (await jaProcessado(evento.id)) return new Response('repetido', { status: 200 });
        const cust = typeof inv.customer === 'string' ? inv.customer : undefined;
        if (cust) {
          const { data } = await supabase
            .from('restaurantes').select('id').eq('stripe_customer_id', cust).maybeSingle();
          if (data?.id) await ativarAssinatura(data.id, cust);
          else console.warn('renovação sem restaurante mapeado para o customer', cust);
        }
      }
    }
    // outros eventos: ignoramos de propósito
  } catch (e) {
    console.error('erro ao processar evento', (e as Error).message);
    return new Response('erro interno', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
