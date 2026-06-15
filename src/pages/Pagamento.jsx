import { useState } from 'react';
import Layout from '../components/Layout';

const WPP_NUMERO = '5581998184489';
const STRIPE_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK || '';

const RECURSOS_BASICO = [
  '✅ Controle de estoque',
  '✅ Entradas e saídas',
  '✅ Lista de compras automática',
  '✅ Fichas técnicas',
  '✅ Mín/máx automático',
  '✅ Até 3 usuários',
  '✅ Sincronização em nuvem',
];

const RECURSOS_PRO = [
  '✅ Tudo do Básico',
  '✅ Relatórios avançados',
  '✅ Histórico ilimitado',
  '✅ Suporte prioritário',
  '✅ Até 10 usuários',
  '✅ Exportação de dados',
  '🔜 Integrações (NF-e, iFood)',
];

export default function Pagamento() {
  const [carregando, setCarregando] = useState(false);

  const assinarPro = () => {
    if (STRIPE_LINK) {
      // Link de pagamento Stripe configurado — abre checkout hospedado
      window.open(STRIPE_LINK, '_blank');
      return;
    }
    // Fallback: contato via WhatsApp enquanto o link Stripe não está configurado
    setCarregando(true);
    const msg = encodeURIComponent('Olá! Quero assinar o plano Pro do Aurum Cozinha (R$149/mês).');
    window.open(`https://wa.me/${WPP_NUMERO}?text=${msg}`, '_blank');
    setTimeout(() => setCarregando(false), 1500);
  };

  return (
    <Layout title="Assinatura">
      {/* Status atual */}
      <div className="bg-polo-navy rounded-2xl p-5 mb-6 flex items-center gap-4">
        <div className="w-14 h-14 bg-polo-gold/20 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
          🏪
        </div>
        <div>
          <p className="text-xs text-white/60 uppercase tracking-wide">Plano atual</p>
          <p className="text-polo-gold font-bold text-xl">Básico</p>
          <p className="text-white/60 text-xs mt-0.5">Ativo · sincronização em nuvem incluída</p>
        </div>
      </div>

      {/* Planos */}
      <div className="space-y-4 mb-6">
        {/* Básico */}
        <div className="border-2 border-gray-200 bg-white rounded-2xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-bold text-polo-navy text-lg">Básico</p>
              <p className="text-xs text-gray-500">Para começar</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-polo-navy">R$ 0</span>
              <span className="text-xs text-gray-500">/mês</span>
            </div>
          </div>
          <ul className="space-y-1.5 mb-4">
            {RECURSOS_BASICO.map((r, i) => <li key={i} className="text-sm text-gray-700">{r}</li>)}
          </ul>
          <div className="text-center text-xs text-green-600 font-semibold py-2">✅ Plano atual</div>
        </div>

        {/* Pro */}
        <div className="border-2 border-polo-gold bg-polo-beige rounded-2xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-bold text-polo-navy text-lg">Pro</p>
              <p className="text-xs text-gray-500">Para restaurantes em operação</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-polo-navy">R$ 149</span>
              <span className="text-xs text-gray-500">/mês</span>
            </div>
          </div>
          <ul className="space-y-1.5 mb-4">
            {RECURSOS_PRO.map((r, i) => <li key={i} className="text-sm text-gray-700">{r}</li>)}
          </ul>
          <button onClick={assinarPro} disabled={carregando}
            className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm disabled:opacity-60">
            {carregando ? 'Abrindo…' : STRIPE_LINK ? '💳 Assinar Pro' : '💬 Falar com suporte →'}
          </button>
        </div>
      </div>

      {/* Aviso */}
      {!STRIPE_LINK && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
          <p className="font-bold mb-1">💳 Pagamento online em breve</p>
          <p>A cobrança automática via cartão está sendo configurada. Por enquanto, entre em contato pelo WhatsApp para contratar o plano Pro.</p>
        </div>
      )}
    </Layout>
  );
}
