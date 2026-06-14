import { NavLink } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { statusEstoque } from '../utils/calculos';
import Icon from './Icons';

const NAV = [
  { to: '/',              icon: 'inicio',    label: 'Início' },
  { to: '/registrar',     icon: 'registrar', label: 'Registrar' },
  { to: '/historico',     icon: 'historico', label: 'Histórico' },
  { to: '/relatorio',     icon: 'relatorio', label: 'Relatório', cargo: 'gerencia' },
  { to: '/configuracoes', icon: 'config',    label: 'Config.',   cargo: 'gerencia' },
];

export default function NavBar() {
  const { produtos, estoque, producoes } = useApp();
  const { temPermissao } = useAuth();
  const alertas = produtos.filter(p => {
    const s = statusEstoque(estoque[p.id] ?? 0, p.min, p.max);
    return s === 'critico' || s === 'zerado';
  }).length;
  // badge de produção: receitas cujo produto final está abaixo do mínimo
  const precisaProduzir = producoes.filter(r => {
    const p = produtos.find(x => x.id === r.produtoFinalId);
    return p?.ativo && p.min > 0 && (estoque[p.id] ?? 0) < p.min;
  }).length;

  const itens = NAV.filter(n => !n.cargo || temPermissao(n.cargo));

  return (
    <nav aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 z-50 bg-polo-navy/95 backdrop-blur-md border-t border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
      <div className="flex max-w-3xl mx-auto px-1">
        {itens.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center pt-1.5 pb-2 gap-1 text-[10px] font-semibold transition-all relative
               focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold rounded-lg
               ${isActive ? 'text-polo-gold' : 'text-white/60 active:text-white/80'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`px-3 py-1.5 rounded-full transition-all duration-200 flex items-center justify-center
                  ${isActive ? 'bg-polo-gold/15 ring-1 ring-polo-gold/30 scale-110' : ''}`}>
                  <Icon name={icon} size={19} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className="leading-none tracking-wide">{label}</span>
                {to === '/' && alertas > 0 && (
                  <span aria-label={`${alertas} produtos abaixo do mínimo`}
                    className="absolute top-0.5 right-1/4 bg-red-500 text-white text-[9px] rounded-full min-w-4 h-4 px-0.5 flex items-center justify-center font-bold ring-2 ring-polo-navy">
                    {alertas > 9 ? '9+' : alertas}
                  </span>
                )}
                {to === '/' && precisaProduzir > 0 && (
                  <span aria-label={`${precisaProduzir} receita(s) precisam ser produzidas`}
                    className="absolute top-0.5 left-1/4 bg-amber-500 text-white text-[9px] rounded-full min-w-4 h-4 px-0.5 flex items-center justify-center font-bold ring-2 ring-polo-navy">
                    🍲
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
