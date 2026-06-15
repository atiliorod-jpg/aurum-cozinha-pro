import { useState } from 'react';
import Layout from '../components/Layout';

/**
 * Página de gestão de assinatura.
 * Integração Stripe pendente — requer VITE_STRIPE_PUBLISHABLE_KEY e
 * uma Supabase Edge Function para criar sessões de checkout e gerenciar webhooks.
 *
 * Por enquanto exibe o plano atual e permite solicitar upgrade via email/WhatsApp.
 */

const PLANOS = [
  {
    id: 'basico',
    nome: 'Básico',
    preco: 'R$ 0',
    periodo: '/mês',
    descricao: 'Para começar',
    recursos: [
      '✅ Controle de estoque',
      '✅ Entradas e saídas',
      '✅ Lista de compras automática',
      '✅ Fichas técnicas',
      '✅ Mín/máx automático',
      '✅ Até 3 usuários',
      '✅ Sincronização em nuvem',
    ],
    cor: 'border-gray-200 bg-white',
    botao: null,
  },
  {
    id: 'pro',
    nome: 'Pro',
    preco: 'R$ 149',
    periodo: '/mês',
    descricao: 'Para restaurantes em operação',
    recursos: [
      '✅ Tudo do Básico',
      '✅ Relatórios avançados',
      '✅ Histórico ilimitado',
      '✅ Suporte prioritário',
      '✅ Até 10 usuários',
      '✅ Exportação de dados',
      '🔜 Integrações (NF-e, iFood)',
    ],
    cor: 'border-polo-gold bg-polo-beige',
    botao: 'Quero o Pro',
  },
];

export default function Pagamento() {
  const [solicitando, setSolicitando] = useState(false);

  const solicitarUpgrade = () => {
    // Enquanto Stripe não está integrado, abre WhatsApp do suporte
    const msg = encodeURIComponent('Olá! Quero fazer upgrade para o plano Pro do Aurum Cozinha.');
    window.open(`https://wa.me/5500000000000?text=${msg}`, '_blank');
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
        {PLANOS.map(p => (
          <div key={p.id} className={`border-2 rounded-2xl p-5 ${p.cor}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-polo-navy text-lg">{p.nome}</p>
                <p className="text-xs text-gray-500">{p.descricao}</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-polo-navy">{p.preco}</span>
                <span className="text-xs text-gray-500">{p.periodo}</span>
              </div>
            </div>
            <ul className="space-y-1.5 mb-4">
              {p.recursos.map((r, i) => (
                <li key={i} className="text-sm text-gray-700">{r}</li>
              ))}
            </ul>
            {p.botao && (
              <button onClick={solicitarUpgrade}
                className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm">
                {p.botao} →
              </button>
            )}
            {!p.botao && (
              <div className="text-center text-xs text-green-600 font-semibold py-2">
                ✅ Plano atual
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Aviso integração */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-bold mb-1">💳 Pagamento online em breve</p>
        <p>A cobrança automática via cartão está em desenvolvimento. Por enquanto, entre em contato para contratar o plano Pro.</p>
      </div>
    </Layout>
  );
}
