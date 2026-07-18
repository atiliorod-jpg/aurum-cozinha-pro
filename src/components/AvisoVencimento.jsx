import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { statusAssinatura } from '../utils/assinatura';

// Faixa discreta no canto quando faltam <=3 dias para vencer (teste ou assinatura).
// Fica no cantinho, tem X para dispensar (por hoje) e não cobre a barra de navegação.
// Como o "dispensar" é por DIA, o aviso volta no dia seguinte com menos dias — assim
// vai lembrando conforme o prazo se esgota.
const CHAVE = 'aurum_aviso_venc';
const hojeStr = () => new Date().toISOString().slice(0, 10);

export default function AvisoVencimento() {
  const { sessao } = useAuth();
  const [dispensadoEm, setDispensadoEm] = useState(() => {
    try { return localStorage.getItem(CHAVE); } catch { return null; }
  });

  if (!sessao?.restauranteId || sessao.demo || sessao.eSuperAdmin) return null;

  // eslint-disable-next-line react-hooks/purity -- a contagem depende da hora atual; recalcular por render é o desejado
  const agora = Date.now();
  const st = statusAssinatura(sessao, agora);
  // vencido já mostra a tela de bloqueio; aqui só avisamos quando está PERTO de vencer
  if (st.tipo !== 'teste' && st.tipo !== 'assinatura') return null;
  const dias = st.tipo === 'teste'
    ? st.diasRestantes
    : Math.ceil((st.ate - agora) / 86400000);
  if (dias == null || dias < 0 || dias > 3) return null;
  if (dispensadoEm === hojeStr()) return null;

  const dispensar = () => {
    try { localStorage.setItem(CHAVE, hojeStr()); } catch { /* sem storage */ }
    setDispensadoEm(hojeStr());
  };

  const quando = dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`;

  return (
    <div className="fixed bottom-20 right-3 z-40 max-w-[15rem] print:hidden">
      <div className="relative bg-white border border-polo-gold shadow-lg rounded-xl p-3 pr-8">
        <button onClick={dispensar} aria-label="Dispensar aviso"
          className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center text-gray-400 rounded-full hover:bg-gray-100">✕</button>
        <p className="text-xs font-bold text-polo-navy">
          {st.tipo === 'teste' ? '⏳ Seu teste ' : '💳 Sua assinatura '}{quando}
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
          Pague por Pix com <strong>24h de antecedência</strong> para não ficar sem o sistema.
        </p>
        <Link to="/pagamento" onClick={dispensar}
          className="block text-center bg-polo-navy text-polo-gold text-xs font-bold py-2 rounded-lg">
          Ver planos e pagar
        </Link>
      </div>
    </div>
  );
}
