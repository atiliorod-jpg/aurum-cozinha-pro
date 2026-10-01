import { useEffect, useRef, useState } from 'react';
import { novoFiltroDeLeitura } from '../utils/baixaEtiqueta';

/**
 * Leitor de QR pela câmera do aparelho.
 *
 * Usa a `BarcodeDetector` nativa (Chrome/Android, Edge) — zero peso. Onde ela
 * não existe (Safari/iOS, Firefox) usa o `jsQR`, carregado SÓ quando a câmera
 * abre (30/09/2026, decisão do dono: leitor contínuo também no iPhone). Sem
 * câmera nenhuma, a tela avisa e a pessoa segue pelo código digitado — o
 * leitor é atalho, nunca requisito.
 *
 * `onLer(texto)` dispara a cada código NOVO. ⚠️ O mesmo código só dispara de
 * novo depois de SAIR do quadro (01/10/2026): antes ele voltava a cada 2,5 s
 * enquanto continuasse à vista, e no modo rápido a câmera parada sobre a
 * embalagem lançava a mesma baixa duas, três vezes.
 */
const NATIVO = typeof window !== 'undefined' && 'BarcodeDetector' in window;
const TEM_CAMERA = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export default function LeitorQR({ onLer, onFechar }) {
  const videoRef = useRef(null);
  const [erro, setErro] = useState('');
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    if (!TEM_CAMERA) return undefined;
    let stream = null;
    let parar = false;
    let timer = null;
    const novo = novoFiltroDeLeitura();
    const avisar = (txt) => { if (novo(txt, Date.now())) onLer?.(txt); };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, // câmera traseira
        });
        if (parar) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        setAtivo(true);

        // um jeito de ler por quadro: o nativo, ou o jsQR sobre um canvas
        let lerQuadro;
        if (NATIVO) {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          lerQuadro = async () => (await detector.detect(v)).map(c => c.rawValue);
        } else {
          const { default: jsQR } = await import('jsqr');
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          lerQuadro = async () => {
            // o quadro reduzido (lado maior 640): o QR da etiqueta é grande o
            // bastante e o celular antigo não engasga
            const escala = Math.min(1, 640 / Math.max(v.videoWidth || 1, v.videoHeight || 1));
            const w = Math.max(1, Math.round((v.videoWidth || 0) * escala));
            const h = Math.max(1, Math.round((v.videoHeight || 0) * escala));
            if (w < 2 || h < 2) return [];
            canvas.width = w; canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            const achado = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
            return achado?.data ? [achado.data] : [];
          };
        }
        const tick = async () => {
          if (parar) return;
          try { (await lerQuadro()).forEach(avisar); } catch { /* quadro ruim — tenta no próximo */ }
          timer = setTimeout(tick, NATIVO ? 250 : 200);
        };
        tick();
      } catch (e) {
        setErro(e?.name === 'NotAllowedError'
          ? 'Permissão de câmera negada. Libere a câmera para este site nas configurações do navegador.'
          : 'Não consegui abrir a câmera neste aparelho.');
      }
    })();

    return () => {
      parar = true;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach(t => t.stop()); // solta a câmera
    };
  }, [onLer]);

  if (!TEM_CAMERA) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3">
        <p className="text-xs text-amber-800">
          Este navegador não abre a câmera. Digite o código escrito embaixo do QR da etiqueta.
        </p>
        <button onClick={onFechar} className="mt-2 text-xs font-semibold text-polo-navy underline underline-offset-2 min-h-11">
          Fechar
        </button>
      </div>
    );
  }

  return (
    <div className="bg-black rounded-xl overflow-hidden relative">
      <video ref={videoRef} muted playsInline className="w-full h-56 object-cover" />
      {/* mira: ajuda a pessoa a enquadrar a etiqueta */}
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-32 h-32 border-2 border-polo-gold rounded-xl opacity-80" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-2 flex items-center justify-between">
        <p className="text-[11px] text-white/90">
          {erro ? erro : ativo ? 'Aponte para o QR da etiqueta' : 'Abrindo a câmera…'}
        </p>
        <button onClick={onFechar} className="text-xs font-bold text-polo-gold px-2 py-1 min-h-11">Fechar</button>
      </div>
    </div>
  );
}

export { TEM_CAMERA as LEITOR_QR_SUPORTADO };
