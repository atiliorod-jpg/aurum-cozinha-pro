import { useEffect, useRef, useState } from 'react';
import { juntarAlternativas, textoDoErroDeVoz } from '../utils/voz';

/**
 * O MICROFONE (a busca por voz e, desde 24/11/2026, o motivo do desperdício).
 * A pessoa toca e fala UMA frase; o navegador para sozinho quando ela termina
 * (ou num segundo toque). Ver utils/voz.js.
 *  • `aoOuvir(alternativas)`: as versões do que ouviu, a melhor primeiro;
 *  • `aoAvisar(texto | null)`: o problema já em português (sem internet,
 *    microfone bloqueado...); null limpa o aviso ao começar a ouvir.
 * Devolve { ouvindo, parcial (o que já ouviu), ouvir (liga ou desliga) }.
 * ⚠️ Saiu da tela no meio da fala: o microfone desliga e nada acontece depois.
 */
export function useMicrofone({ aoOuvir, aoAvisar }) {
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState('');
  const reconhecimento = useRef(null);
  const naTela = useRef(true);
  // as funções de quem usa mudam a cada render; o microfone chama a de agora
  const retornos = useRef({ aoOuvir, aoAvisar });
  useEffect(() => { retornos.current = { aoOuvir, aoAvisar }; });
  useEffect(() => {
    naTela.current = true;
    return () => { naTela.current = false; reconhecimento.current?.abort?.(); };
  }, []);

  const ouvir = () => {
    if (ouvindo) { reconhecimento.current?.stop?.(); return; }
    // sem internet o serviço de voz nem responde: avisa antes de tentar
    if (navigator.onLine === false) { retornos.current.aoAvisar(textoDoErroDeVoz('network')); return; }
    const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Reconhecimento) return;
    const rec = new Reconhecimento();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    // ⚠️ UMA FRASE SÓ, NÃO CONTÍNUO (05/11/2026, no celular do dono). A
    // escuta contínua foi tentada para aguentar pausas, mas o Chrome do
    // Android devolve nela a frase repetida e grudada ("bolinho de
    // costelabolinho de costela…") e nada mais casava. A frase vai num
    // fôlego; a ordem das palavras é livre (ver utils/voz.js).
    rec.continuous = false;
    let resultados = [];
    rec.onresult = (ev) => {
      resultados = Array.from(ev.results || []);
      setParcial(juntarAlternativas(resultados)[0] || '');
    };
    rec.onerror = (ev) => {
      const texto = textoDoErroDeVoz(ev?.error);
      if (texto) retornos.current.aoAvisar(texto);
    };
    rec.onend = () => {
      setOuvindo(false);
      setParcial('');
      reconhecimento.current = null;
      const alternativas = juntarAlternativas(resultados);
      resultados = [];
      if (naTela.current && alternativas.length) retornos.current.aoOuvir(alternativas);
    };
    reconhecimento.current = rec;
    retornos.current.aoAvisar(null);
    setParcial('');
    setOuvindo(true);
    try { rec.start(); } catch {
      setOuvindo(false);
      reconhecimento.current = null;
      retornos.current.aoAvisar('Não deu para abrir o microfone. Toque de novo.');
    }
  };

  return { ouvindo, parcial, ouvir };
}
