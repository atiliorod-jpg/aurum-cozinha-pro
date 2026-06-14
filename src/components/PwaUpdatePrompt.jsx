import { useEffect, useState } from 'react';

export default function PwaUpdatePrompt() {
  const [atualizado, setAtualizado] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Só mostra banner em atualização (não na primeira instalação)
    if (!navigator.serviceWorker.controller) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      setAtualizado(true);
    });
  }, []);

  if (!atualizado) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pointer-events-none">
      <div className="max-w-md mx-auto bg-polo-navy text-white rounded-xl shadow-2xl border border-polo-gold/40 px-4 py-3 flex items-center gap-3 pointer-events-auto">
        <span className="text-xl flex-shrink-0">🔄</span>
        <p className="text-sm flex-1 leading-tight">
          <strong className="block text-polo-gold">App atualizado!</strong>
          Toque para recarregar e ver as novidades.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-polo-gold text-polo-navy font-bold text-xs px-3 py-1.5 rounded-lg flex-shrink-0 active:opacity-80"
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}
