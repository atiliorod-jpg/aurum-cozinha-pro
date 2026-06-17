import { useState } from 'react';
import { usePwaInstall } from '../lib/pwaInstall';

/**
 * Balão discreto para instalar o app na tela inicial sem App Store.
 * Usa o evento compartilhado em lib/pwaInstall (mesmo usado pelo botão em
 * Configurações). No iOS exibe instrução manual (compartilhar → Adicionar à tela).
 */
export default function PwaInstallPrompt() {
  const { podeInstalar, instalado, ios, instalar } = usePwaInstall();
  const [dispensado, setDispensado] = useState(false);
  const [iosDispensado, setIosDispensado] = useState(() => !!localStorage.getItem('pwa_ios_dica'));

  if (instalado) return null;

  // iOS: instrução manual (não tem beforeinstallprompt)
  if (ios && !iosDispensado) {
    const dispensarIos = () => { localStorage.setItem('pwa_ios_dica', '1'); setIosDispensado(true); };
    return (
      <div className="fixed bottom-20 left-3 right-3 z-40 bg-polo-navy border border-polo-gold/40 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="Aurum" className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-polo-gold font-bold text-sm">Instalar Aurum Cozinha</p>
            <p className="text-white/70 text-xs mt-1">
              Toque em <span className="text-polo-gold font-bold">⎙ Compartilhar</span> depois em{' '}
              <span className="text-polo-gold font-bold">"Adicionar à Tela de Início"</span>
            </p>
          </div>
          <button onClick={dispensarIos} aria-label="Fechar dica de instalação" className="text-white/40 text-xl leading-none px-1">×</button>
        </div>
      </div>
    );
  }

  // Android/Chrome/Edge: só aparece quando o navegador liberou a instalação
  if (!podeInstalar || dispensado) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-40 bg-polo-navy border border-polo-gold/40 rounded-2xl p-4 shadow-2xl">
      <div className="flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="Aurum" className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-polo-gold font-bold text-sm">Instalar Aurum Cozinha Pro</p>
          <p className="text-white/60 text-xs mt-0.5">Acesso rápido na tela inicial do tablet</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setDispensado(true)} className="text-white/40 text-xs px-2 py-1">Agora não</button>
          <button onClick={instalar}
            className="bg-polo-gold text-polo-navy font-bold text-xs px-4 py-2 rounded-xl whitespace-nowrap">
            Instalar
          </button>
        </div>
      </div>
    </div>
  );
}
