import { corStatus } from '../../utils/calculos';

// =====================================================================
//  SELO DE SITUAÇÃO DO ESTOQUE ("Abaixo do mínimo", "Normal"…). As cores e
//  as palavras vêm de `corStatus` (utils/calculos), num lugar só — a tela
//  nunca escreve a sua. Lote 7 da auditoria (14/10/2026).
// =====================================================================
export default function Selo({ status, className = '' }) {
  const c = corStatus(status);
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${c.badge} ${className}`}>
      {c.label}
    </span>
  );
}
