import { useEffect, useRef, useState } from 'react';

/**
 * Leitor de QR pela câmera do aparelho.
 *
 * Usa a `BarcodeDetector` nativa (Chrome/Android, Edge) — zero dependência
 * nova, zero peso no bundle. Onde ela não existe (Safari/iOS até hoje, Firefox)
 * a tela avisa e a pessoa segue digitando: a contagem manual continua inteira,
 * o leitor é atalho, nunca requisito.
 *
 * `onLer(texto)` dispara a cada código NOVO — o mesmo código lido em sequência
 * é ignorado por alguns segundos, senão a câmera contaria o mesmo pote dezenas
 * de vezes enquanto a pessoa ainda está mirando.
 */
const SUPORTADO = typeof window !== 'undefined' && 'BarcodeDetector' in window;
const REPETIR_APOS_MS = 2500;

export default function LeitorQR({ onLer, onFechar }) {
  const videoRef = useRef(null);
  const [erro, setErro] = useState('');
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    if (!SUPORTADO) return;
    let stream = null;
    let parar = false;
    let timer = null;
    const ultimos = new Map();

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, // câmera traseira no tablet
        });
        if (parar) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        setAtivo(true);

        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (parar) return;
          try {
            const codigos = await detector.detect(v);
            const agora = Date.now();
            codigos.forEach(c => {
              const txt = c.rawValue;
              if (!txt) return;
              if ((ultimos.get(txt) || 0) + REPETIR_APOS_MS > agora) return; // já contado agora há pouco
              ultimos.set(txt, agora);
              onLer?.(txt);
            });
          } catch { /* quadro ruim — tenta no próximo */ }
          timer = setTimeout(tick, 250);
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

  if (!SUPORTADO) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3">
        <p className="text-xs text-amber-800">
          📷 Este navegador não lê QR pela câmera. Funciona no <strong>Chrome do Android</strong>.
          No iPhone, e em qualquer aparelho, dá para continuar digitando a contagem normalmente.
        </p>
        <button onClick={onFechar} className="mt-2 text-xs font-semibold text-polo-navy underline underline-offset-2">
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
        <button onClick={onFechar} className="text-xs font-bold text-polo-gold px-2 py-1">Fechar</button>
      </div>
    </div>
  );
}

export { SUPORTADO as LEITOR_QR_SUPORTADO };
