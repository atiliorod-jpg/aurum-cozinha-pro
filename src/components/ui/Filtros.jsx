// =====================================================================
//  FILTROS EM PÍLULA — a fila rolável de categorias ("Todos", "PROTEÍNAS"…)
//  em cima das listas. Lote 7 da auditoria (14/10/2026): eram dez cópias à
//  mão, algumas com 30 px de altura e sem dizer ao leitor de tela qual estava
//  marcada. Uma peça: 44 px, `aria-pressed`, contraste.
//
//  opcoes: ['A', 'B'] ou [[valor, texto], ...]. `todos` (texto) põe a
//  primeira pílula, de valor '' — passe null para não ter.
// =====================================================================
export default function Filtros({ opcoes, valor, aoTrocar, rotulo, todos = 'Todos', ativo = 'navy', className = '' }) {
  const lista = (opcoes || []).map(o => (Array.isArray(o) ? o : [o, o]));
  const corAtiva = ativo === 'dourado' ? 'bg-polo-gold text-polo-navy' : 'bg-polo-navy text-polo-gold';
  const pilula = (v, texto) => (
    <button key={v === '' ? '__todos' : v} type="button" onClick={() => aoTrocar(v)} aria-pressed={valor === v}
      className={`whitespace-nowrap min-h-11 px-4 rounded-full text-xs font-semibold flex-shrink-0 transition-colors
        ${valor === v ? corAtiva : 'bg-white text-gray-700 border border-gray-200'}`}>
      {texto}
    </button>
  );
  return (
    <div role="group" aria-label={rotulo} className={`flex gap-2 overflow-x-auto pb-1 scrollbar-hide ${className}`}>
      {todos != null && pilula('', todos)}
      {lista.map(([v, texto]) => pilula(v, texto))}
    </div>
  );
}
