import { useEffect } from 'react';
import Icon from './Icons';
import { ligarAtualizacao, useVersaoNovaPronta } from '../utils/atualizarApp';

// =====================================================================
//  "APP ATUALIZADO" — a versão nova já assumiu; falta recarregar a tela.
//  Na tela dos nomes, o app recarrega sozinho depois de 30 s parado (ver
//  utils/atualizarApp.js). Nas outras telas, quem está usando decide a hora
//  — nunca no meio de um lançamento.
// =====================================================================
export default function PwaUpdatePrompt() {
  useEffect(() => { ligarAtualizacao(); }, []);
  const pronta = useVersaoNovaPronta();
  if (!pronta) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pointer-events-none">
      <div className="max-w-md mx-auto bg-polo-navy text-white rounded-2xl shadow-2xl border border-polo-gold/40 px-4 py-3 flex items-center gap-3 pointer-events-auto">
        <span className="flex-shrink-0" aria-hidden="true"><Icon name="atualizar" size={22} /></span>
        <p className="text-sm flex-1 leading-tight">
          <strong className="block text-polo-gold">App atualizado!</strong>
          Toque para recarregar e ver as novidades.
        </p>
        <button type="button" onClick={() => window.location.reload()}
          className="min-h-11 bg-polo-gold text-polo-navy font-bold text-sm px-4 rounded-xl flex-shrink-0 active:opacity-80">
          Recarregar
        </button>
      </div>
    </div>
  );
}
