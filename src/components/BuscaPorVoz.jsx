import { useState, useRef, useEffect } from 'react';
import Icon from './Icons';
import { vozDisponivel, acharPorVoz, itemCerto, textoDoErroDeVoz } from '../utils/voz';

/**
 * O MICROFONE DA BUSCA (pedido do dono, 04/11/2026) — ver utils/voz.js.
 *
 * Envolve o campo de busca (`children`) e põe o microfone ao lado. A pessoa
 * toca e fala; o navegador para sozinho quando ela termina a frase.
 *  • um item só combinou → a impressão já abre, com a quantidade falada;
 *  • vários → a lista filtra e a quantidade fica para o item que ela tocar;
 *  • só parecidos → "Você quis dizer", com o botão de cada um;
 *  • nada → diz o que ouviu, para ela falar de novo ou digitar.
 *
 * ⚠️ Navegador sem reconhecimento de fala (Firefox, o navegador de dentro do
 * WhatsApp): o microfone nem aparece — um botão que não funciona é pior que
 * nenhum.
 */
export default function BuscaPorVoz({ produtos, aoBuscar, aoImprimir, children }) {
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState('');
  const [aviso, setAviso] = useState(null); // { texto, sugestoes?: [produto], quantidade? }
  const reconhecimento = useRef(null);
  // saiu da tela no meio da fala: o microfone desliga
  useEffect(() => () => reconhecimento.current?.abort?.(), []);

  if (!vozDisponivel()) return children;

  const resolver = (alternativas) => {
    const r = acharPorVoz(alternativas, produtos);
    const ouvido = alternativas[0] || '';
    const certo = itemCerto(r.achados);
    if (certo) {
      setAviso(null);
      aoImprimir(certo, r.quantidade);
      return;
    }
    // o que a pessoa falou, com acento ("filé"); a busca ignora acento
    const falado = r.falado || r.termo || ouvido;
    if (r.achados.some(a => a.nota >= 80)) {
      const n = r.achados.filter(a => a.nota >= 80).length;
      aoBuscar(falado, r.quantidade);
      setAviso({ texto: `${n} itens com "${falado}". Toque no certo${r.quantidade ? ` (${r.quantidade} etiquetas)` : ''}.` });
      return;
    }
    if (r.achados.length) {
      setAviso({
        texto: `Não achei "${falado}". Você quis dizer:`,
        sugestoes: r.achados.slice(0, 3).map(a => a.produto),
        quantidade: r.quantidade,
      });
      return;
    }
    setAviso({ texto: `Não achei "${falado}". Toque no microfone e fale de novo, ou digite.` });
  };

  const ouvir = () => {
    if (ouvindo) { reconhecimento.current?.stop?.(); return; }
    // sem internet o serviço de voz nem responde: avisa antes de tentar
    if (navigator.onLine === false) { setAviso({ texto: textoDoErroDeVoz('network') }); return; }
    const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Reconhecimento();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.continuous = false;
    rec.onresult = (ev) => {
      const ultimo = ev.results[ev.results.length - 1];
      if (!ultimo?.isFinal) { setParcial(ultimo?.[0]?.transcript || ''); return; }
      resolver(Array.from(ultimo, a => a.transcript).filter(Boolean));
    };
    rec.onerror = (ev) => {
      const texto = textoDoErroDeVoz(ev?.error);
      if (texto) setAviso({ texto });
    };
    rec.onend = () => { setOuvindo(false); setParcial(''); reconhecimento.current = null; };
    reconhecimento.current = rec;
    setAviso(null);
    setParcial('');
    setOuvindo(true);
    try { rec.start(); } catch {
      setOuvindo(false);
      reconhecimento.current = null;
      setAviso({ texto: 'Não deu para abrir o microfone. Toque de novo.' });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        <button type="button" onClick={ouvir}
          aria-label={ouvindo ? 'Parar de ouvir' : 'Buscar falando'} aria-pressed={ouvindo}
          className={`min-w-11 min-h-11 px-3 rounded-xl border flex items-center justify-center flex-shrink-0
            ${ouvindo ? 'bg-polo-navy text-polo-gold border-polo-navy animate-pulse' : 'bg-white text-polo-navy border-gray-200'}`}>
          <Icon name="microfone" size={20} />
        </button>
      </div>
      {(ouvindo || aviso) && (
        <div role="status" className="text-sm text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 space-y-2">
          {ouvindo
            ? <p>{parcial ? <>Ouvindo: <strong className="text-polo-navy">{parcial}</strong></> : 'Ouvindo… fale o nome do item.'}</p>
            : <p>{aviso.texto}</p>}
          {!ouvindo && aviso?.sugestoes?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {aviso.sugestoes.map(p => (
                <button key={p.id} type="button" onClick={() => { setAviso(null); aoImprimir(p, aviso.quantidade); }}
                  className="min-h-11 px-3 rounded-lg bg-polo-navy text-polo-gold text-sm font-bold">
                  {p.nome}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
