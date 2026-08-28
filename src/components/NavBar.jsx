import { NavLink } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { statusEstoque } from '../utils/calculos';
import { pode, podeAbrirConfig } from '../utils/permissoes';
import { temRecurso } from '../utils/modulos';
import Icon from './Icons';

const NAV = [
  { to: '/',              icon: 'inicio',    label: 'Início' },
  { to: '/registrar',     icon: 'registrar', label: 'Registrar' },
  // Fechar Turno é a AÇÃO CENTRAL da Finalização e estava enterrada na última
  // seção do hub Registrar, enquanto a barra mostrava Relatório — que lá é
  // quase vazio. Aparece só onde o recurso existe, então Produção e Seco não
  // ganham um botão que não faz nada.
  { to: '/fechar-turno',  icon: 'registrar', label: 'Fechar turno', recurso: 'fecharTurno' },
  // "O que vence hoje" é a pergunta mais repetida de uma cozinha — merece a
  // barra, não um card dentro de Registrar. O histórico geral saiu daqui: cada
  // tela já tem a aba "Histórico" dela, e ele continua no hub Registrar.
  { to: '/validades',     icon: 'validade',  label: 'Validades' },
  // Relatório e Configurações SAÍRAM da barra: moram só na Administração.
  // Os dois são gesto de GESTÃO, não de operação, e ocupavam dois dos cinco
  // lugares da barra num tablet que a cozinha usa de mão suja. Quem opera
  // precisa de Início, Registrar, Validades e (na finalização) Fechar turno.
  //
  // A Administração TAMBÉM não entra aqui: a porta dela é o seletor de estoque,
  // uma só. Repetir o mesmo destino na barra de todos os três estoques polui a
  // navegação e faz parecer que são telas diferentes — é o mesmo defeito que
  // "Validades" tinha, aparecendo na barra e como card no hub.
];

// A Administração NÃO tem barra — o Layout nem chama este componente lá.
// Ela tinha dois itens: "Início", que repetia o cartão do próprio hub, e
// "Voltar ao estoque", que repetia o seletor do cabeçalho. Um destino, um
// caminho: o seletor do cabeçalho é a porta entre as áreas, nos dois sentidos.

// Barra do plano AURUM ETIQUETAS. É uma lista própria, não o NAV acima
// filtrado: neste produto não existe estoque para "Registrar", e a
// Administração não existe — então Ajustes precisa de porta, senão as
// Configurações ficam inalcançáveis (o mesmo defeito que o Layout já
// documenta sobre tela sem caminho de volta).
const NAV_ETIQUETAS = [
  { to: '/',           icon: 'inicio',   label: 'Início' },
  { to: '/etiquetas',  icon: 'etiqueta', label: 'Imprimir' },
  { to: '/itens',      icon: 'caixa',    label: 'Itens' },
  { to: '/validades',  icon: 'validade', label: 'Validades' },
  { to: '/ajustes',    icon: 'config',   label: 'Ajustes' },
];

export default function NavBar({ soEtiquetas = false }) {
  const { produtos, estoque, producoes, permissoes, modulo, etiquetasImpressas } = useApp();
  const { sessao } = useAuth();
  // ⚠️ Os badges de estoque ficam FORA do ramo de etiquetas: além de serem
  // sempre 0 lá (não há entrada nem saída), rodavam dois .filter sobre o
  // catálogo inteiro a cada render, de graça.
  const alertas = soEtiquetas ? 0 : produtos.filter(p => {
    const s = statusEstoque(estoque[p.id] ?? 0, p.min, p.max);
    return s === 'critico' || s === 'zerado';
  }).length;
  // badge de produção: receitas cujo produto final está abaixo do mínimo
  const precisaProduzir = soEtiquetas ? 0 : producoes.filter(r => {
    const p = produtos.find(x => x.id === r.produtoFinalId);
    return p?.ativo && p.min > 0 && (estoque[p.id] ?? 0) < p.min;
  }).length;

  // O que importa aqui é o que vence hoje — a pergunta que a cozinha faz.
  const hojeISO = new Date().toISOString().slice(0, 10);
  const vencendo = soEtiquetas
    ? (etiquetasImpressas || []).filter(e => e.status === 'valida' && e.validade && e.validade <= hojeISO).length
    : 0;

  if (soEtiquetas) {
    return (
      <BarraNav itens={NAV_ETIQUETAS} badges={{
        '/validades': vencendo > 0 && {
          lado: 'direita', cor: 'bg-red-500',
          texto: vencendo > 9 ? '9+' : String(vencendo),
          rotulo: `${vencendo} etiqueta(s) vencidas ou vencendo hoje`,
        },
      }} />
    );
  }

  const itens = NAV.filter(n => {
    // recurso do módulo primeiro: não adianta ter permissão para uma tela que
    // não existe no estoque aberto
    if (n.recurso && !temRecurso(modulo, n.recurso)) return false;
    if (n.semRecurso && temRecurso(modulo, n.semRecurso)) return false;
    if (!n.cap) return true;
    if (n.cap === 'config') return podeAbrirConfig(sessao, permissoes);
    return pode(sessao, permissoes, n.cap);
  });

  return (
    <BarraNav itens={itens} badges={{
      '/': [
        alertas > 0 && { lado: 'direita', texto: alertas > 9 ? '9+' : String(alertas), cor: 'bg-red-500',
          rotulo: `${alertas} produtos abaixo do mínimo` },
        precisaProduzir > 0 && { lado: 'esquerda', icone: 'producao', cor: 'bg-amber-700',
          rotulo: `${precisaProduzir} receita(s) precisam ser produzidas` },
      ].filter(Boolean),
    }} />
  );
}

// A marcação da barra, uma vez só. As duas variantes (app completo e plano
// etiquetas) usam esta — duas cópias divergiriam, que é o defeito já
// registrado nas abas de Configurações.
function BarraNav({ itens, badges = {} }) {
  const listaDe = (to) => {
    const b = badges[to];
    if (!b) return [];
    return Array.isArray(b) ? b.filter(Boolean) : [b].filter(Boolean);
  };
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
              `flex-1 flex flex-col items-center justify-center pt-1.5 pb-2 gap-1 text-[11px] font-semibold transition-all relative
               focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold rounded-lg
               ${isActive ? 'text-polo-gold' : 'text-white/90 active:text-white'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`px-3 py-1.5 rounded-full transition-all duration-200 flex items-center justify-center
                  ${isActive ? 'bg-polo-gold/15 ring-1 ring-polo-gold/30 scale-110' : ''}`}>
                  <Icon name={icon} size={19} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className="leading-none tracking-wide">{label}</span>
                {listaDe(to).map((b, i) => (
                  <span key={i} aria-label={b.rotulo}
                    className={`absolute top-0.5 ${b.lado === 'esquerda' ? 'left-1/4' : 'right-1/4'} ${b.cor || 'bg-red-500'}
                      text-white text-[11px] rounded-full min-w-5 h-5 px-1 flex items-center justify-center font-bold ring-2 ring-polo-navy`}>
                    {b.icone ? <Icon name={b.icone} size={11} strokeWidth={2.5} /> : b.texto}
                  </span>
                ))}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
