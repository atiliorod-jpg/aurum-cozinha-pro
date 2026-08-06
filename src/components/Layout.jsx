import { useState } from 'react';
import { Link } from 'react-router-dom';
import NavBar from './NavBar';
import Icon from './Icons';
import GuideTour from './GuideTour';
import BotaoFeedback from './BotaoFeedback';
import { useAuth } from '../store/AuthContext';
import { useApp } from '../store/AppContext';
import { moduloPorId } from '../utils/modulos';
import SeletorModulo from './SeletorModulo';
import { useUI } from '../store/UIContext';
import { pode } from '../utils/permissoes';

const LOGO = `${import.meta.env.BASE_URL}logo-aurum.png`;

export default function Layout({ title, children, actions }) {
  const { sessao, logout } = useAuth();
  const { pendencias, online, modulo, permissoes } = useApp();
  const mod = moduloPorId(modulo);
  const [trocandoModulo, setTrocandoModulo] = useState(false);
  const { confirm } = useUI();

  // Nome de exibição: o super-admin não tem perfil (nome null) → "Administrador".
  const nomeExibicao = sessao?.nome || (sessao?.eSuperAdmin ? 'Administrador' : 'sua conta');

  const sair = async () => {
    const ok = await confirm({ titulo: 'Sair', mensagem: `Encerrar a sessão de ${nomeExibicao}?`, confirmar: 'Sair' });
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
        {/* Estoque aberto — toque para trocar (produção ⇄ seco) */}
        <button onClick={() => setTrocandoModulo(true)}
          aria-label={`Estoque aberto: ${mod.label}. Tocar para trocar de estoque`}
          className="flex items-center gap-1 bg-white/10 rounded-full px-2.5 py-1 flex-shrink-0 mx-1">
          <span aria-hidden="true">{mod.icone}</span>
          <span className="text-[10px] font-semibold text-white/90 hidden sm:inline">{mod.label}</span>
          <span className="text-white/50 text-[9px]" aria-hidden="true">▾</span>
        </button>
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
              <BotaoFeedback />
              {pode(sessao, permissoes, 'verAuditoria') && (
                <Link to="/auditoria" aria-label="Trilha de auditoria — quem mexeu em quê" title="Trilha de auditoria — quem mexeu em quê"
                  className="flex flex-col items-center gap-0.5 text-polo-gold active:scale-90 transition-transform
                             focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold rounded-lg">
                  <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><Icon name="historico" size={17} /></span>
                  <span className="text-[8px] leading-none font-semibold text-white/70">Auditoria</span>
                </Link>
              )}
              <button onClick={sair} aria-label={`${nomeExibicao} — sair`} title={`${nomeExibicao} — sair`}
                className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold rounded-lg">
                <span className="flex items-center gap-1.5 bg-white/10 rounded-full pl-2.5 pr-3 py-1.5">
                  <span className="w-5 h-5 rounded-full bg-polo-gold text-polo-navy text-[10px] font-bold flex items-center justify-center">
                    {nomeExibicao.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-[10px] font-semibold text-white/90 max-w-16 truncate">{nomeExibicao.split(' ')[0]}</span>
                </span>
                <span className="text-[8px] leading-none font-semibold text-white/70">Sair</span>
              </button>
            </div>
          )}
        </div>
      </header>
      {/* marca d'água Aurum — decorativa, atrás do conteúdo */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none flex items-center justify-center print:hidden">
        <img src={LOGO} alt="" className="w-72 h-72 opacity-[0.05] rounded-full" />
      </div>
      {trocandoModulo && (
        <div className="fixed inset-0 bg-black/50 z-[130] flex items-center justify-center p-4 print:hidden"
          onClick={e => { if (e.target === e.currentTarget) setTrocandoModulo(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="troca-mod" className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-start justify-between">
              <h2 id="troca-mod" className="font-bold text-polo-navy">Trocar de estoque</h2>
              <button onClick={() => setTrocandoModulo(false)} aria-label="Fechar"
                className="text-gray-400 text-2xl leading-none px-1 -mt-1">×</button>
            </div>
            <SeletorModulo aoEscolher={() => setTrocandoModulo(false)} />
            <p className="text-[11px] text-gray-400">
              Cada estoque tem produtos e registros próprios. A escolha fica guardada neste aparelho.
            </p>
          </div>
        </div>
      )}
      <main className="flex-1 p-4 max-w-2xl lg:max-w-4xl mx-auto w-full relative">
        <GuideTour />
        {children}
      </main>
      <NavBar />
    </div>
  );
}
