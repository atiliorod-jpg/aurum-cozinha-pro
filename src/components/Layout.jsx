import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from './NavBar';
import GuideTour from './GuideTour';
import BotaoFeedback from './BotaoFeedback';
import { useAuth } from '../store/AuthContext';
import { useApp } from '../store/AppContext';
import SeletorModulo from './SeletorModulo';
import { useUI } from '../store/UIContext';

const LOGO = `${import.meta.env.BASE_URL}logo-aurum.png`;

/**
 * `area`:
 *   'estoque' (padrão) — barra de operação no rodapé
 *   'admin'            — sem barra no rodapé; só o seletor do cabeçalho
 *
 * O seletor do cabeçalho é o ÚNICO caminho entre as áreas, e por isso aparece
 * nas duas. A barra de operação continua fora da Administração: ela leva para
 * Registrar/Validades, que são de dentro de um estoque, e um toque ali tirava
 * a pessoa da área em que ela acabou de entrar.
 */
export default function Layout({ title, children, actions, area = 'estoque' }) {
  const { sessao, logout } = useAuth();
  const { pendencias, online, estoqueAtual } = useApp();
  const navigate = useNavigate();
  const emAdmin = area === 'admin';
  // Onde a pessoa está agora. Num estoque é o nome da INSTÂNCIA, não o rótulo
  // do tipo: com dois restaurantes na conta, "Estoque Seco" sozinho não diz de
  // qual casa é, e o cabeçalho é onde se confere isso antes de lançar.
  const mod = emAdmin
    ? { icone: '⚙️', label: 'Administração' }
    : { icone: estoqueAtual?.icone || '📦', label: estoqueAtual?.nome || 'Estoque' };
  const [trocandoModulo, setTrocandoModulo] = useState(false);
  const { confirm } = useUI();

  // Nome de exibição: o super-admin não tem perfil (nome null) → "Administrador".
  const nomeExibicao = sessao?.nome || (sessao?.eSuperAdmin ? 'Administrador' : 'sua conta');

  const sair = async () => {
    // O logout agora LIMPA o cache local do aparelho (era vazamento em tablet
    // compartilhado). A fila pendente é preservada, mas quem sai precisa saber
    // que tem lançamento sem subir — neste app a tela mostra sucesso mesmo
    // quando o servidor recusou, então a pessoa não tem outro jeito de saber.
    const mensagem = pendencias > 0
      ? `Encerrar a sessão de ${nomeExibicao}?

⚠️ Há ${pendencias} lançamento(s) que ainda não subiram para a nuvem. Eles ficam guardados neste aparelho e sobem no próximo login com internet — mas só NESTE aparelho.

Se der para esperar, conecte antes de sair.`
      : `Encerrar a sessão de ${nomeExibicao}?

Os dados em cache neste aparelho serão apagados (o próximo usuário não vê nada da sua conta).`;
    const ok = await confirm({
      titulo: 'Sair',
      mensagem,
      perigo: pendencias > 0,
      confirmar: pendencias > 0 ? 'Sair mesmo assim' : 'Sair',
    });
    if (ok) logout();
  };

  return (
    <div className={`min-h-screen flex flex-col bg-polo-beige ${emAdmin ? 'pb-6' : 'pb-24'}`}>
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
        {/* Onde estou — toque para ir a outra área. Aparece também na
            Administração: é a única saída de lá desde que a barra do rodapé
            saiu, e num PWA em tablet não existe botão de voltar do navegador. */}
        <button onClick={() => setTrocandoModulo(true)}
          aria-label={`Você está em ${mod.label}. Tocar para ir a outra área`}
          className="flex items-center gap-1 bg-white/10 rounded-full px-2.5 py-1 flex-shrink-0 mx-1
                     min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
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
              {/* A Auditoria saiu daqui: virou cartão dentro de Administração,
                  junto do resto que é da CONTA (equipe, assinatura, relatórios).
                  No cabeçalho ela competia por espaço com o seletor de estoque e
                  o status de sincronização num tablet, e ninguém consulta trilha
                  de auditoria no meio do serviço — é gesto de gestão. */}
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
              {/* "Trocar de estoque" era o nome errado: a lista tem as cozinhas
                  E a Administração, que não é estoque. */}
              <h2 id="troca-mod" className="font-bold text-polo-navy">Ir para</h2>
              <button onClick={() => setTrocandoModulo(false)} aria-label="Fechar"
                className="text-gray-400 text-2xl leading-none px-1 -mt-1 min-w-11 min-h-11">×</button>
            </div>
            <SeletorModulo aoEscolher={(id) => {
              setTrocandoModulo(false);
              // Na Administração, escolher uma cozinha precisa LEVAR até ela:
              // trocar o estoque aberto sem navegar deixava a pessoa parada na
              // mesma tela de gestão, achando que o toque não funcionou.
              if (emAdmin && id !== 'administracao') navigate('/');
            }} />
            <p className="text-[11px] text-gray-400">A escolha fica guardada neste aparelho.</p>
          </div>
        </div>
      )}
      <main className="flex-1 p-4 max-w-2xl lg:max-w-4xl mx-auto w-full relative">
        {/* O guia ensina o FLUXO DO TURNO (produção → saídas → etiquetas →
            aparas) e todos os seus atalhos entram num estoque. Rodando na
            Administração, ele oferecia quatro links que jogavam a pessoa
            dentro de uma cozinha a partir de uma tela de gestão. */}
        {!emAdmin && <GuideTour />}
        {children}
      </main>
      {/* Só a operação tem barra. A da Administração tinha dois itens — "Início"
          e "Voltar ao estoque" — e o segundo era destino repetido do seletor do
          cabeçalho. Tirando ele sobrava uma aba sozinha ocupando a largura toda,
          que lê como tela quebrada; então a barra inteira saiu. */}
      {!emAdmin && <NavBar />}
    </div>
  );
}
