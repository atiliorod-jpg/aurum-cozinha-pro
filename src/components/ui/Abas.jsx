// =====================================================================
//  ABAS — a barra de 2 a 4 escolhas no topo de uma tela ("+ Nova entrada" /
//  "Histórico"). Lote 7 da auditoria (14/10/2026): eram nove cópias à mão,
//  cada uma com uma altura, uma letra e um cinza — a mesma escolha mudava de
//  cara de uma tela para a outra. Agora é uma peça só: 44 px de toque,
//  `aria-pressed` para o leitor de tela e cores com contraste.
//
//  opcoes: [[valor, texto], ...]
// =====================================================================
export default function Abas({ opcoes, valor, aoTrocar, rotulo, className = '' }) {
  return (
    <div role="group" aria-label={rotulo} className={`flex bg-white rounded-xl p-1 gap-1 ${className}`}>
      {opcoes.map(([v, texto]) => (
        <button key={v} type="button" onClick={() => aoTrocar(v)} aria-pressed={valor === v}
          className={`flex-1 min-h-11 px-2 py-2 rounded-lg text-sm font-semibold transition-colors
            ${valor === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-600'}`}>
          {texto}
        </button>
      ))}
    </div>
  );
}
