import { useSyncExternalStore } from 'react';

// Captura o evento de instalação (beforeinstallprompt) num único lugar do módulo,
// já no carregamento, para que tanto o balão flutuante quanto o botão em
// Configurações usem o MESMO evento. Sem isso, cada componente registraria seu
// próprio listener em useEffect e perderia o evento se ele disparasse antes.

let deferred = null;            // evento nativo guardado
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());

const isBrowser = typeof window !== 'undefined';

if (isBrowser) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export function estaInstalado() {
  if (!isBrowser) return false;
  return window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;
}

export function ehIos() {
  if (!isBrowser) return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

// Dispara a instalação nativa. Retorna 'accepted' | 'dismissed' | 'unavailable'.
export async function instalar() {
  if (!deferred) return 'unavailable';
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  if (outcome === 'accepted') { deferred = null; emit(); }
  return outcome;
}

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function getSnapshot() { return deferred ? 'sim' : 'nao'; }

// Hook React: re-renderiza quando o evento fica (in)disponível.
export function usePwaInstall() {
  const flag = useSyncExternalStore(subscribe, getSnapshot, () => 'nao');
  return {
    podeInstalar: flag === 'sim',
    instalado: estaInstalado(),
    ios: ehIos(),
    instalar,
  };
}
