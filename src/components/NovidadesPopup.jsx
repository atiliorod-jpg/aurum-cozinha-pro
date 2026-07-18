import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { APP_VERSAO, NOVIDADES } from '../data/novidades';

// Aviso "O que há de novo" — aparece UMA vez quando o cliente abre uma versão
// mais nova do que a última que ele viu (guardada no localStorage). Para reler,
// a lista completa fica em Configurações → Novidades.
const CHAVE = 'aurum_versao_vista';

export default function NovidadesPopup() {
  const { sessao } = useAuth();
  const ultimoRelease = NOVIDADES[0];
  const [vistoEm, setVistoEm] = useState(() => {
    try { return localStorage.getItem(CHAVE); } catch { return null; }
  });

  // não mostra na demo, sem sessão, sem release, ou se já viu esta versão
  if (!sessao || sessao.demo || !ultimoRelease || vistoEm === APP_VERSAO) return null;

  const fechar = () => {
    try { localStorage.setItem(CHAVE, APP_VERSAO); } catch { /* sem storage */ }
    setVistoEm(APP_VERSAO);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-3 print:hidden"
      onClick={fechar}>
      <div role="dialog" aria-modal="true" aria-label="Novidades do app"
        className="bg-white text-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-polo-navy">✨ O que há de novo</h2>
          <button onClick={fechar} aria-label="Fechar" className="text-gray-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">{ultimoRelease.titulo} · {ultimoRelease.data}</p>
        <ul className="space-y-2">
          {ultimoRelease.itens.map((it, i) => (
            <li key={i} className="text-sm text-gray-700 flex gap-2">
              <span className="text-polo-gold flex-shrink-0">•</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-4">
          <Link to="/novidades" onClick={fechar}
            className="flex-1 text-center border border-polo-navy text-polo-navy font-bold py-2.5 rounded-xl text-sm">
            Ver todas
          </Link>
          <button onClick={fechar}
            className="flex-1 bg-polo-navy text-polo-gold font-bold py-2.5 rounded-xl text-sm">
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
