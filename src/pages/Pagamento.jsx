import { useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../store/AuthContext';
import { statusAssinatura, PRECO_MES } from '../utils/assinatura';
import { fmtData } from '../utils/formatters';

const WPP_NUMERO = '5581998184489';
const STRIPE_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK || '';

const RECURSOS = [
  '✅ Controle de estoque completo (FEFO, mín/máx automático)',
  '✅ Entradas, saídas, produção e receitas',
  '✅ Etiquetas de validade com impressão',
  '✅ Aparas, perdas e rendimento por fornecedor',
  '✅ Lista de compras automática',
  '✅ Relatórios + exportação Excel',
  '✅ Até 3 usuários com cargos',
  '✅ Funciona offline e sincroniza na nuvem',
  '✅ Suporte da equipe Aurum',
];

const dataISO = (ts) => new Date(ts).toISOString().slice(0, 10);

export default function Pagamento() {
  const { sessao } = useAuth();
  const [carregando, setCarregando] = useState(false);
  const st = statusAssinatura(sessao);

  const assinar = () => {
    if (STRIPE_LINK) {
      // Passa o id do restaurante pro Stripe (client_reference_id). É assim que o
      // webhook sabe QUAL restaurante pagou e ativa a assinatura certa sozinho.
      // É um UUID, não um dado pessoal — seguro na URL.
      let destino = STRIPE_LINK;
      if (sessao?.restauranteId) {
        try {
          const u = new URL(STRIPE_LINK);
          u.searchParams.set('client_reference_id', sessao.restauranteId);
          destino = u.toString();
        } catch { /* link malformado — abre como está */ }
      }
      window.open(destino, '_blank', 'noopener,noreferrer');
      return;
    }
    setCarregando(true);
    const msg = encodeURIComponent(`Olá! Quero assinar o Aurum Cozinha Pro (R$${PRECO_MES}/mês) para o restaurante ${sessao?.restauranteNome || ''}.`);
    window.open(`https://wa.me/${WPP_NUMERO}?text=${msg}`, '_blank', 'noopener,noreferrer');
    setTimeout(() => setCarregando(false), 1500);
  };

  return (
    <Layout title="Assinatura">
      {/* Situação atual */}
      <div className={`rounded-2xl p-5 mb-6 flex items-center gap-4
        ${st.tipo === 'vencido' ? 'bg-red-700' : 'bg-polo-navy'}`}>
        <div className="w-14 h-14 bg-polo-gold/20 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
          {st.tipo === 'assinatura' ? '✅' : st.tipo === 'teste' ? '⏳' : st.tipo === 'vencido' ? '⚠️' : '🏪'}
        </div>
        <div>
          <p className="text-xs text-white/80 uppercase tracking-wide">Situação</p>
          <p className="text-polo-gold font-bold text-xl">
            {st.tipo === 'assinatura' ? 'Assinatura ativa'
              : st.tipo === 'teste' ? `Período de teste — ${st.diasRestantes} dia(s)`
              : st.tipo === 'vencido' ? 'Teste encerrado'
              : 'Conta administrativa'}
          </p>
          <p className="text-white/80 text-xs mt-0.5">
            {st.tipo === 'assinatura' ? `Válida até ${fmtData(dataISO(st.ate))}`
              : st.tipo === 'teste' ? `Teste grátis até ${fmtData(dataISO(st.ate))} — depois, assine para continuar`
              : st.tipo === 'vencido' ? 'Assine para voltar a usar o sistema'
              : 'Sem cobrança para esta conta'}
          </p>
        </div>
      </div>

      {/* Plano único */}
      <div className="border-2 border-polo-gold bg-polo-beige rounded-2xl p-5 mb-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-bold text-polo-navy text-lg">Aurum Cozinha Pro</p>
            <p className="text-xs text-gray-500">Plano único — tudo incluído</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-polo-navy">R$ {PRECO_MES}</span>
            <span className="text-xs text-gray-500">/mês</span>
          </div>
        </div>
        <ul className="space-y-1.5 mb-4">
          {RECURSOS.map((r, i) => <li key={i} className="text-sm text-gray-700">{r}</li>)}
        </ul>
        <button onClick={assinar} disabled={carregando}
          className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm disabled:opacity-60">
          {carregando ? 'Abrindo…' : STRIPE_LINK ? '💳 Assinar agora' : '💬 Assinar pelo WhatsApp →'}
        </button>
      </div>

      {/* Como funciona a ativação */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-bold mb-1">ℹ️ Como funciona a ativação</p>
        <p>Todo restaurante novo tem <strong>7 dias de teste grátis</strong> com tudo liberado.
        Após o pagamento, a equipe Aurum ativa a assinatura na sua conta em até 24h úteis
        e você recebe a confirmação pelo WhatsApp cadastrado.</p>
      </div>
    </Layout>
  );
}
