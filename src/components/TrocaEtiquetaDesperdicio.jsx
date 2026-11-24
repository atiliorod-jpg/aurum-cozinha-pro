import { Link } from 'react-router-dom';
import Icon from './Icons';

// =====================================================================
//  ETIQUETAS | DESPERDÍCIO (24/11/2026, decisão do dono: botões no topo)
//  Dois botões grandes no alto da tela inicial do Aurum Etiquetas. A barra de
//  baixo continua com as 3 abas; a pessoa que entrou pelo nome vale nas duas
//  telas, sem digitar a senha de novo.
// =====================================================================
const MODOS = [
  { id: 'etiquetas', para: '/', rotulo: 'Etiquetas', icone: 'etiqueta' },
  { id: 'desperdicio', para: '/desperdicio', rotulo: 'Desperdício', icone: 'perda' },
];

export default function TrocaEtiquetaDesperdicio({ atual }) {
  return (
    <nav aria-label="Etiquetas ou desperdício" className="grid grid-cols-2 gap-2">
      {MODOS.map(m => {
        const ativo = m.id === atual;
        return (
          <Link key={m.id} to={m.para} aria-current={ativo ? 'page' : undefined}
            className={`min-h-14 rounded-2xl border-[3px] font-titulo font-black uppercase tracking-wide text-base
              inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform
              ${ativo
                ? (m.id === 'desperdicio' ? 'bg-red-700 border-red-700 text-white' : 'bg-polo-navy border-polo-navy text-polo-gold')
                : 'bg-white border-polo-navy/15 text-polo-navy'}`}>
            <Icon name={m.icone} size={22} />{m.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
