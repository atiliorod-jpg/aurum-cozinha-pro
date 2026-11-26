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

// ⚠️ REDESIGN (25/11/2026): controle segmentado de 56 px; a tela aberta em
// navy com o ícone dourado NAS DUAS (o vermelho fica só para descartar).
export default function TrocaEtiquetaDesperdicio({ atual }) {
  return (
    <nav aria-label="Etiquetas ou desperdício" className="grid grid-cols-2 gap-1.5 bg-white border-2 border-polo-linha rounded-2xl p-1.5">
      {MODOS.map(m => {
        const ativo = m.id === atual;
        return (
          <Link key={m.id} to={m.para} aria-current={ativo ? 'page' : undefined}
            className={`min-h-14 rounded-xl font-titulo font-black uppercase tracking-wide text-base
              inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform
              ${ativo ? 'bg-polo-navy text-white' : 'text-polo-navy hover:bg-polo-beige'}`}>
            <span className={ativo ? 'text-polo-gold' : ''}><Icon name={m.icone} size={22} /></span>{m.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
