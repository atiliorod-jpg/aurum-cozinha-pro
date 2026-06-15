import { useState, useEffect } from 'react';

/**
 * Detecta o evento beforeinstallprompt (Chrome/Edge/Android) e exibe
 * um botão discreto para instalar o app na tela inicial sem App Store.
 * No iOS exibe instruções manuais (compartilhar → Adicionar à tela).
 */
export default function PwaInstallPrompt() {
  const [prompt, setPrompt] = useState(null);      // evento nativo
  const [mostrar, setMostrar] = useState(false);   // botão visível
  const [ios, setIos] = useState(false);           // instrução manual iOS
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    // Já está instalado como PWA standalone — não mostrar
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone) return; // iOS PWA

    // iOS não tem beforeinstallprompt — instrução manual
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (isIos) {
      // Só mostrar se ainda não foi descartado hoje
      const visto = localStorage.getItem('pwa_ios_dica');
      if (!visto) setIos(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      setMostrar(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalado(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const instalar = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalado(true);
    setMostrar(false);
  };

  const dispensarIos = () => {
    localStorage.setItem('pwa_ios_dica', '1');
    setIos(false);
  };

  if (instalado || (!mostrar && !ios)) return null;

  // iOS: instrução manual
  if (ios) {
    return (
      <div className="fixed bottom-20 left-3 right-3 z-40 bg-polo-navy border border-polo-gold/40 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <img src={`${import.meta.env.BASE_URL}logo-aurum.png`} alt="Aurum" className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-polo-gold font-bold text-sm">Instalar Aurum Cozinha</p>
            <p className="text-white/70 text-xs mt-1">
              Toque em <span className="text-polo-gold font-bold">⎙ Compartilhar</span> depois em{' '}
              <span className="text-polo-gold font-bold">"Adicionar à Tela de Início"</span>
            </p>
          </div>
          <button onClick={dispensarIos} className="text-white/40 text-xl leading-none px-1">×</button>
        </div>
      </div>
    );
  }

  // Android/Chrome/Edge
  return (
    <div className="fixed bottom-20 left-3 right-3 z-40 bg-polo-navy border border-polo-gold/40 rounded-2xl p-4 shadow-2xl">
      <div className="flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}logo-aurum.png`} alt="Aurum" className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-polo-gold font-bold text-sm">Instalar Aurum Cozinha Pro</p>
          <p className="text-white/60 text-xs mt-0.5">Acesso rápido na tela inicial do tablet</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMostrar(false)} className="text-white/40 text-xs px-2 py-1">Agora não</button>
          <button onClick={instalar}
            className="bg-polo-gold text-polo-navy font-bold text-xs px-4 py-2 rounded-xl whitespace-nowrap">
            Instalar
          </button>
        </div>
      </div>
    </div>
  );
}
