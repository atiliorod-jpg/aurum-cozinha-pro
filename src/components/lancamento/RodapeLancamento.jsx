// =====================================================================
//  O PÉ DE TODO LANÇAMENTO (Lote 5 da auditoria, 14/10/2026)
//
//  Entrada, Saída, Apara, Perda, Produção, Compra, Contagem e Fechar turno
//  terminam do mesmo jeito: o resumo do que vai ser gravado e o botão, FIXOS
//  no pé da tela, logo acima da barra.
//
//  ⚠️ O QUE ISTO CONSERTA (U3): o botão ficava no TOPO em Entradas, Saídas,
//  Perdas e Fechar turno, e no FIM em Produção e Compras. A pessoa procurava o
//  botão a cada tela — e no Fechar turno ele vinha antes da contagem, que é o
//  contrário da ordem do trabalho (contar, depois fechar).
//
//  ⚠️ `sticky`, não `fixed`: o pé ocupa o lugar dele no fim da página, então o
//  último item da lista nunca fica escondido atrás dele. `bottom-16` é a altura
//  da barra de navegação (fixa, ~62 px).
// =====================================================================

export default function RodapeLancamento({
  resumo = '', rotulo, aoTocar, desativado = false, falta = '', ocupado = false, rotuloOcupado = 'Registrando…',
}) {
  return (
    <div className="sticky bottom-16 z-30 -mx-4 px-4 pt-2 pb-3 mt-2 bg-polo-beige/95 backdrop-blur border-t border-polo-gold/40 print:hidden">
      {/* o resumo muda a cada item digitado: o leitor de tela anuncia sem a
          pessoa precisar sair da lista para conferir */}
      <p aria-live="polite" className={`text-sm font-semibold text-polo-navy mb-2 break-words ${resumo ? '' : 'sr-only'}`}>
        {resumo}
      </p>
      {/* o botão apagado diz o que falta (28/09/2026) */}
      {!ocupado && falta && <p role="status" className="text-xs text-gray-700 mb-2">{falta}</p>}
      <button type="button" onClick={aoTocar} disabled={desativado || ocupado}
        className="w-full bg-polo-navy text-polo-gold font-bold py-4 rounded-xl text-base
                   disabled:opacity-40 active:scale-[0.98] transition-transform">
        {ocupado ? rotuloOcupado : rotulo}
      </button>
    </div>
  );
}
