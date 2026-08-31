import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';

// ⚠️ O QUE ESTE CARTÃO EVITA. A conta sobe de Etiquetas para Cozinha Pro no
// painel, longe do cliente. Do lado dele o app amanhece com telas novas e o
// estoque TODO ZERADO — o que parece perda de dado, e não é: os itens estão
// lá, com prazo e tudo; ninguém disse a QUANTIDADE ainda, porque no plano
// anterior não havia onde dizer.
//
// Ficar até a primeira contagem, e não por N dias: quem contou não precisa
// mais do aviso, e quem ainda não contou continua sem estoque para ver.
export default function BoasVindasCompleto() {
  const { prefs, setPref, produtos, entradas, ajustes } = useApp();
  const [aberto, setAberto] = useState(false);

  // ⚠️ Já começou a contar → o aviso sai sozinho, sem pedir para ninguém
  // fechar. Em EFEITO, nunca no corpo do componente: gravar pref durante o
  // render é o que faz o React re-renderizar em laço.
  const contou = entradas.length > 0 || ajustes.length > 0;
  useEffect(() => {
    if (prefs.upgradeEm && contou) setPref('upgradeEm', null);
  }, [prefs.upgradeEm, contou, setPref]);

  if (!prefs.upgradeEm || contou) return null;

  const n = produtos.filter(p => p.ativo).length;

  return (
    <div className="bg-polo-beige border border-polo-gold/40 rounded-xl px-3 pt-2.5 pb-3 mb-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-polo-navy">
          Seus {n} {n === 1 ? 'item já está' : 'itens já estão'} aqui.
        </p>
        <button onClick={() => setPref('upgradeEm', null)} aria-label="Fechar aviso"
          className="text-gray-500 text-lg font-bold leading-none min-w-11 min-h-11 flex items-center justify-center -mr-2 -mt-2">×</button>
      </div>

      <p className="text-xs text-gray-700 mt-0.5">
        Falta dizer quanto tem de cada um.
        <button type="button" onClick={() => setAberto(v => !v)}
          aria-label={aberto ? 'Fechar explicação' : 'O que é isto?'} aria-expanded={aberto}
          className="ml-1 w-4 h-4 rounded-full bg-white/80 text-gray-600 text-[10px] font-bold leading-none align-middle">
          !
        </button>
      </p>
      {aberto && (
        <p className="text-[11px] text-gray-600 mt-1.5">
          Nada se perdeu: os itens, os prazos e as etiquetas continuam como estavam.
          O que o plano novo acrescenta é a quantidade — e é dela que saem a lista de
          compras, o aviso de que está acabando e os relatórios. A primeira contagem é
          uma vez só; depois o número anda com as entradas e saídas do dia.
        </p>
      )}

      <Link to="/inventario"
        className="mt-2.5 w-full bg-polo-navy text-polo-gold font-bold text-sm py-2.5 rounded-xl
                   flex items-center justify-center active:scale-[0.99] transition-transform">
        Contar o estoque
      </Link>
    </div>
  );
}
