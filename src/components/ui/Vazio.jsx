// =====================================================================
//  LISTA VAZIA QUE DIZ O QUE FAZER. Lote 7 da auditoria (14/10/2026): cada
//  tela escrevia o seu "Nenhum… ainda." em cinza, sem caminho. Esta peça põe
//  a frase e, quando houver, a ação (um botão ou link passado em `acao`).
// =====================================================================
export default function Vazio({ texto, detalhe, acao, className = '' }) {
  return (
    <div className={`text-center py-10 px-4 ${className}`}>
      <p className="text-sm text-gray-700">{texto}</p>
      {detalhe && <p className="text-xs text-gray-600 mt-1">{detalhe}</p>}
      {acao && <div className="mt-3 flex justify-center">{acao}</div>}
    </div>
  );
}
