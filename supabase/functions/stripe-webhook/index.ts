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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const DIAS_POR_PAGAMENTO = 31; // 1 mês + folga para o cliente não ficar bloqueado no vencimento

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
  const patch: Record<string, unknown> = { assinatura_ate: ate, bloqueado: false };
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
    if (evento.type === 'checkout.session.completed') {
      // Primeiro pagamento: o app enviou o id do restaurante em client_reference_id.
      const s = evento.data.object as Stripe.Checkout.Session;
      const rid = s.client_reference_id;
      if (rid) await ativarAssinatura(rid, typeof s.customer === 'string' ? s.customer : undefined);
      else console.warn('checkout sem client_reference_id — não sei qual restaurante ativar');
    } else if (evento.type === 'invoice.paid') {
      // Renovação mensal (não o primeiro pagamento, que já veio no checkout acima).
      const inv = evento.data.object as Stripe.Invoice;
      if (inv.billing_reason === 'subscription_cycle') {
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
