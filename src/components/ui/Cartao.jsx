import { useId } from 'react';

// =====================================================================
//  CARTÃO DE SEÇÃO — fundo branco, título e uma linha de explicação. Lote 7
//  da auditoria (14/10/2026): as Configurações tinham dois estilos de título
//  misturados (MAIÚSCULO pequeno e negrito normal) e cada cartão escrito à
//  mão. Esta é a forma única; as telas de Administração passam a usá-la
//  conforme forem reorganizadas (Lote 4).
// =====================================================================
export default function Cartao({ titulo, descricao, children, perigo = false, className = '' }) {
  const id = useId();
  return (
    <section aria-labelledby={titulo ? id : undefined}
      className={`rounded-xl p-4 mb-4 space-y-3 border ${perigo ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'} ${className}`}>
      {titulo && (
        <div>
          <h2 id={id} className={`text-sm font-bold ${perigo ? 'text-red-800' : 'text-polo-navy'}`}>{titulo}</h2>
          {descricao && <p className="text-xs text-gray-600 mt-0.5">{descricao}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
