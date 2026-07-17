import { Link } from 'react-router-dom';
import NavBar from './NavBar';
import Icon from './Icons';
import GuideTour from './GuideTour';
import { useAuth } from '../store/AuthContext';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { pode } from '../utils/permissoes';

const LOGO = `${import.meta.env.BASE_URL}logo-aurum.png`;

export default function Layout({ title, children, actions }) {
  const { sessao, logout } = useAuth();
  const { pendencias, online, prefs } = useApp();
  const { confirm } = useUI();

  const sair = async () => {
    const ok = await confirm({ titulo: 'Sair', mensagem: `Encerrar a sessão de ${sessao?.nome}?`, confirmar: 'Sair' });
    if (ok) logout();
  };

  return (
    <div className="min-h-screen flex flex-col bg-polo-beige pb-24">
      <header className="bg-gradient-to-r from-polo-navy via-polo-navy to-[#24375456] bg-polo-navy text-white px-4 py-2.5 flex items-center justify-between sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={LOGO} alt="Aurum Serviços Gastronômicos"
            className="w-9 h-9 rounded-xl ring-1 ring-polo-gold/40 object-cover flex-shrink-0" />
          <div className="min-w-0 leading-tight">
            <h1 className="text-base font-bold text-polo-gold tracking-wide truncate">{title}</h1>
            {sessao?.restauranteNome && (
              <p className="text-[10px] text-white/80 truncate">{sessao.restauranteNome}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Status de sincronização: avisa quando há dados ainda não enviados ou sem internet */}
          {(pendencias > 0 || !online) && (
            <span
              role="status"
              aria-label={!online ? `Sem internet, ${pendencias} alteração(ões) pendente(s)` : `${pendencias} alteração(ões) aguardando sincronização`}
              title={!online ? 'Sem internet — as alterações sobem quando reconectar' : 'Alterações aguardando sincronização'}
              className="flex items-center gap-1 bg-amber-400/90 text-polo-navy text-[10px] font-bold rounded-full px-2 py-1">
              {!online ? '⚡ offline' : '⏳'}{pendencias > 0 && ` ${pendencias}`}
            </span>
          )}
          {actions}
          {sessao && (
            <div className="flex items-center gap-1.5">
              {pode(sessao, prefs?.permissoes, 'verAuditoria') && (
                <Link to="/auditoria" aria-label="Histórico de mudanças" title="Histórico de mudanças"
                  className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-polo-gold active:scale-90 transition-transform
                             focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
                  <Icon name="historico" size={17} />
                </Link>
              )}
              <button onClick={sair} aria-label={`Sessão de ${sessao.nome || 'usuário'} — sair`} title={`${sessao.nome || 'usuário'} — sair`}
                className="flex items-center gap-1.5 bg-white/10 rounded-full pl-2.5 pr-3 py-1.5 active:scale-95 transition-transform
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
                <span className="w-5 h-5 rounded-full bg-polo-gold text-polo-navy text-[10px] font-bold flex items-center justify-center">
                  {(sessao.nome || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="text-[10px] font-semibold text-white/90 max-w-16 truncate">{(sessao.nome || 'usuário').split(' ')[0]}</span>
              </button>
            </div>
          )}
        </div>
      </header>
      {/* marca d'água Aurum — decorativa, atrás do conteúdo */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none flex items-center justify-center print:hidden">
        <img src={LOGO} alt="" className="w-72 h-72 opacity-[0.05] rounded-full" />
      </div>
      <main className="flex-1 p-4 max-w-2xl lg:max-w-4xl mx-auto w-full relative">
        <GuideTour />
        {children}
      </main>
      <NavBar />
    </div>
  );
}
