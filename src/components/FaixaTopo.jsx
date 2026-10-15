import { useLayoutEffect, useRef } from 'react';

// =====================================================================
//  FAIXA FIXA NO TOPO (demonstração, modo suporte) — Lote 9, D9, 15/10/2026
//
//  A faixa e o cabeçalho das telas eram os dois `sticky top-0`: ao rolar, a
//  faixa (por cima) cobria o título e o botão da conta. Agora a faixa publica
//  a própria altura em `--faixa-topo`, e o cabeçalho (Layout) gruda logo
//  abaixo dela. Sem faixa, a variável não existe e o cabeçalho volta ao topo.
// =====================================================================
export default function FaixaTopo({ className = '', children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const raiz = document.documentElement;
    const medir = () => raiz.style.setProperty('--faixa-topo', `${el.offsetHeight}px`);
    medir();
    // o texto pode quebrar ao girar o aparelho: a altura acompanha
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); raiz.style.removeProperty('--faixa-topo'); };
  }, []);
  return (
    <div ref={ref} className={`sticky top-0 z-50 print:hidden ${className}`}>
      {children}
    </div>
  );
}
