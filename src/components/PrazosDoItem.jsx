import { etiquetasDePrazo } from '../utils/coresDeConservacao';

/**
 * OS PRAZOS DO ITEM EM ETIQUETAS COLORIDAS (redesign, 25/11/2026) — ver
 * utils/coresDeConservacao.js. `max`: quantas mostrar antes do "+N" (o bloco
 * "Mais usados" é pequeno).
 */
export default function PrazosDoItem({ produto, armazenamentos, estados, max = 0 }) {
  const etiquetas = etiquetasDePrazo(produto, armazenamentos, estados);
  if (!etiquetas.length) {
    return <p className="text-sm text-polo-tinta mt-0.5">sem prazo cadastrado — etiqueta só de identificação</p>;
  }
  const mostradas = max && etiquetas.length > max ? etiquetas.slice(0, max) : etiquetas;
  return (
    <ul className="flex flex-wrap gap-1.5 mt-1" aria-label="Prazos">
      {mostradas.map(e => (
        <li key={e.chave} className={`rounded-md px-2 py-0.5 text-[13px] font-semibold leading-5 ${e.cor}`}>{e.texto}</li>
      ))}
      {mostradas.length < etiquetas.length && (
        <li className="rounded-md px-2 py-0.5 text-[13px] font-semibold leading-5 text-polo-tinta">+{etiquetas.length - mostradas.length}</li>
      )}
    </ul>
  );
}
