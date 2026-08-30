import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import { statusAssinatura, TESTE_DIAS } from './utils/assinatura';
import SeletorModulo from './components/SeletorModulo';
import { temRecurso } from './utils/modulos';
import { pode, podeAbrirConfig, podeAbrirAdministracao } from './utils/permissoes';
import { AppProvider, useApp } from './store/AppContext';
import { UIProvider, useUI } from './store/UIContext';
import { fmtData, isoLocal } from './utils/formatters';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import EtiquetaPrint from './components/EtiquetaPrint';
import AvisoVencimento from './components/AvisoVencimento';
import NovidadesPopup from './components/NovidadesPopup';
import Login from './pages/Login';
import NovaSenha from './pages/NovaSenha';
import Dashboard from './pages/Dashboard';
import Registrar from './pages/Registrar';
import Historico from './pages/Historico';
import Compras from './pages/Compras';
import Entradas from './pages/Entradas';
import Saidas from './pages/Saidas';
import Producao from './pages/Producao';
import Inventario from './pages/Inventario';
import AparasPerdas from './pages/AparasPerdas';
import Auditoria from './pages/Auditoria';
import Pagamento from './pages/Pagamento';
import Etiquetas from './pages/Etiquetas';
import FecharTurno from './pages/FecharTurno';
import Validades from './pages/Validades';
import Novidades from './pages/Novidades';
import Termos from './pages/Termos';
import Itens from './pages/etiquetas/Itens';
import EtiquetasAjustes from './pages/etiquetas/Ajustes';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from './utils/produto';
// Páginas pesadas carregam sob demanda (code-split): primeiro load menor no tablet
const Relatorio = lazy(() => import('./pages/Relatorio'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const Admin = lazy(() => import('./pages/Admin'));
const Administracao = lazy(() => import('./pages/Administracao'));
const Financeiro = lazy(() => import('./pages/Financeiro'));
const Estoques = lazy(() => import('./pages/Estoques'));
const Balanco = lazy(() => import('./pages/Balanco'));

// Rota restrita a um cargo mínimo (gerencia/diretoria)
function Restrito({ cargo = 'gerencia', children }) {
  const { temPermissao } = useAuth();
  return temPermissao(cargo) ? children : <Navigate to="/" replace />;
}

// Tela de carregamento (enquanto verifica a sessão na nuvem)
function Splash({ texto = 'Carregando…' }) {
  return (
    <div className="min-h-screen bg-polo-navy flex flex-col items-center justify-center gap-5 p-6">
      <img src={`${import.meta.env.BASE_URL}logo-aurum.png`} alt="Aurum"
        className="w-24 h-24 rounded-2xl ring-1 ring-polo-gold/30 object-cover animate-pulse" />
      <p className="text-white/90 text-sm">{texto}</p>
    </div>
  );
}

// Faixa fixa de aviso quando o super-admin está vendo os dados de um cliente.
// Âmbar = somente leitura; vermelha = cliente autorizou EDITAR (24h).
function BannerSuporte({ nome, podeMexer, onSair }) {
  return (
    <div className={`sticky top-0 z-50 px-4 py-2 flex items-center justify-between gap-3 shadow-md
      ${podeMexer ? 'bg-red-600 text-red-50' : 'bg-amber-500 text-amber-950'}`}>
      <p className="text-xs font-semibold min-w-0 truncate">
        🛠️ Modo suporte — <strong>{nome || 'cliente'}</strong> {podeMexer ? '(EDITANDO a conta do cliente)' : '(somente leitura)'}
      </p>
      <button onClick={onSair}
        className={`font-bold text-xs px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0
          ${podeMexer ? 'bg-red-950 text-red-50' : 'bg-amber-950 text-amber-50'}`}>
        Sair do modo suporte
      </button>
    </div>
  );
}

// Tela cheia quando teste/assinatura venceram OU a conta foi suspensa —
// só a página Assinatura fica acessível (dados sempre preservados)
function BloqueioAssinatura({ podeAssinar, bloqueado, onSair }) {
  return (
    <div className="min-h-screen bg-polo-navy flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-4xl">{bloqueado ? '🔒' : '⏳'}</p>
      <p className="text-polo-gold font-bold text-lg">{bloqueado ? 'Conta suspensa' : 'Seu período de teste terminou'}</p>
      <p className="text-white/80 text-sm max-w-xs">
        {bloqueado
          ? 'O acesso desta conta foi suspenso pela administração. Os seus dados estão guardados e seguros — fale com o suporte Aurum para reativar.'
          : 'Os seus dados estão guardados e seguros. Assine o plano para continuar usando o sistema exatamente de onde parou.'}
      </p>
      {podeAssinar ? (
        <Link to="/pagamento" className="bg-polo-gold text-polo-navy font-bold px-6 py-2.5 rounded-xl">
          💳 Ver plano e assinar
        </Link>
      ) : (
        <p className="text-white/80 text-xs max-w-xs">Peça à diretoria/gerência do restaurante para assinar em Configurações → Assinatura.</p>
      )}
      <button onClick={onSair} className="text-white/70 text-xs underline underline-offset-2">Sair da conta</button>
    </div>
  );
}

function Rotas() {
  const { sessao, carregando, logout, recuperando, impersonando, sairImpersonacao, derrubado, limparDerrubado, temPermissao, cadastroPendenteErro } = useAuth();
  // marca de que este aparelho já escolheu o estoque de trabalho
  const [escolheuModulo, setEscolheuModulo] = useState(() => {
    try { return !!localStorage.getItem('pe::modulo'); } catch { return true; }
  });
  const { toast } = useUI();
  const { pathname } = useLocation();
  const { modulo, permissoes } = useApp();
  // Produto EFETIVO: no modo suporte manda o do cliente, não o do super-admin
  // (que não tem restaurante e cairia em 'completo').
  const soEtiquetas = ehSoEtiquetas(produtoAtivo(sessao, impersonando));
  // Capacidade configurável (matriz de permissões da diretoria) — diretoria e
  // super-admin sempre podem; cozinha/gerência seguem permissoes.
  const can = (cap) => pode(sessao, permissoes, cap);

  // Boas-vindas (flag gravada no cadastro/aceite de convite, antes da sessão montar)
  useEffect(() => {
    if (!sessao?.restauranteId || sessao.demo) return;
    let flag = null;
    try { flag = sessionStorage.getItem('aurum_boasvindas'); sessionStorage.removeItem('aurum_boasvindas'); } catch { /* sem storage */ }
    if (flag === 'novo') {
      const st = statusAssinatura(sessao);
      // isoLocal, não toISOString: em Brasília o fim do teste caía no dia
      // seguinte na tela e o cliente contava com um dia que não tinha.
      toast(`🎉 Bem-vindo ao Aurum Cozinha Pro! Teste grátis com tudo liberado até ${st.ate ? fmtData(isoLocal(new Date(st.ate))) : `o fim dos ${TESTE_DIAS} dias`}.`, 'sucesso', { duracao: 8000 });
    } else if (flag === 'convite') {
      toast(`👋 Você entrou no restaurante ${sessao.restauranteNome || ''} como ${sessao.cargo}. Bom trabalho!`, 'sucesso', { duracao: 7000 });
    }
  }, [sessao, toast]);

  // ⚠️ /termos é PÚBLICA e vem ANTES de tudo: precisa abrir sem login, para
  // quem ainda está decidindo, e sem depender de sessão carregada. Também abre
  // logada, para o cliente reler o que aceitou. Um contrato que só existe
  // dentro do app depois de entrar não serve como contrato.
  if (pathname.endsWith('/termos')) return <Termos />;

  if (carregando) return <Splash />;
  // Veio do link de recuperação de senha → tela de nova senha (tem prioridade)
  if (recuperando) return <NovaSenha />;
  // A conta foi aberta em outro aparelho (sessão única) → avisa e volta ao login
  if (derrubado) {
    return (
      <div className="min-h-screen bg-polo-navy flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-4xl">📱</p>
        <p className="text-polo-gold font-bold text-lg">Conta aberta em outro aparelho</p>
        <p className="text-white/80 text-sm max-w-xs">
          Sua conta foi acessada em outro dispositivo. Por segurança, cada conta fica conectada em apenas um aparelho por vez.
        </p>
        <button onClick={limparDerrubado} className="bg-polo-gold text-polo-navy font-bold px-6 py-2.5 rounded-xl">
          Entrar novamente
        </button>
      </div>
    );
  }
  if (!sessao) return <Login />;

  // Acesso revogado: some do app com explicação, em vez de deixar a pessoa
  // navegando numa conta que o banco recusa em toda operação.
  if (sessao.desativado) {
    return (
      <div className="min-h-screen bg-polo-navy flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-4xl">🔒</p>
        <p className="text-polo-gold font-bold text-lg">Acesso desativado</p>
        <p className="text-white/80 text-sm max-w-xs">
          O seu acesso a este restaurante foi desativado pela gerência. Fale com a diretoria
          se precisar voltar a usar o sistema.
        </p>
        <button onClick={logout} className="bg-polo-gold text-polo-navy font-bold px-6 py-2.5 rounded-xl">
          Sair
        </button>
      </div>
    );
  }

  // Conta autenticada mas sem perfil/cargo (cadastro interrompido).
  // Super-admin é exceção: acessa o painel mesmo sem restaurante próprio.
  if (!sessao.cargo && !sessao.eSuperAdmin) {
    // ⚠️ Com a confirmação de e-mail ligada, o restaurante é criado quando a
    // pessoa volta do link — e essa criação pode falhar (o CNPJ pode ter sido
    // tomado no intervalo). Antes esta tela dizia sempre "peça um convite à
    // diretoria", que para quem acabou de se cadastrar não quer dizer nada.
    // Agora, quando há motivo conhecido, ele é mostrado.
    const motivo = cadastroPendenteErro || '';
    const cnpjTomado = /cnpj/i.test(motivo);
    return (
      <div className="min-h-screen bg-polo-navy flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-polo-gold font-bold text-lg">
          {motivo ? 'Não consegui criar o restaurante' : 'Cadastro incompleto'}
        </p>
        <p className="text-white/80 text-sm max-w-xs">
          {cnpjTomado
            ? 'Já existe uma conta usando este CNPJ. Se o restaurante é seu, entre com a conta que já existe; se foi engano, fale com o suporte Aurum pelo WhatsApp.'
            : motivo
              ? `${motivo} Sua conta de acesso está criada — fale com o suporte Aurum pelo WhatsApp que resolvemos sem você perder nada.`
              : 'Sua conta foi criada mas ainda não está vinculada a um restaurante. Saia e entre novamente, ou peça um novo convite à diretoria.'}
        </p>
        <button onClick={logout} className="bg-polo-gold text-polo-navy font-bold px-6 py-2.5 rounded-xl">Sair</button>
      </div>
    );
  }

  // Teste de TESTE_DIAS dias: vencido → bloqueio visual (dados preservados).
  // Superadmin/impersonação/demo são isentos (statusAssinatura resolve).
  const plano = impersonando ? { ok: true, tipo: 'isento' } : statusAssinatura(sessao);
  if (!plano.ok) {
    const bloqueado = plano.tipo === 'bloqueado';
    // conta suspensa: nem a página de assinatura resolve (reativação é com o suporte)
    if (bloqueado) return <BloqueioAssinatura bloqueado podeAssinar={false} onSair={logout} />;
    return (
      <Routes>
        <Route path="/pagamento" element={temPermissao('gerencia') ? <Pagamento /> : <BloqueioAssinatura podeAssinar={false} onSair={logout} />} />
        <Route path="*" element={<BloqueioAssinatura podeAssinar={temPermissao('gerencia')} onSair={logout} />} />
      </Routes>
    );
  }

  // Primeiro acesso NESTE aparelho: pergunta em qual estoque a pessoa trabalha.
  // Depois disso a escolha fica lembrada (e dá para trocar pelo cabeçalho).
  // ⚠️ No plano Etiquetas não existe escolha: há um contexto só. Perguntar
  // "onde você vai trabalhar?" para quem comprou só etiquetas é pedir uma
  // decisão que não existe — e ainda arriscaria o aparelho ficar apontado para
  // um estoque que aquela conta não usa.
  // ⚠️ O SUPER-ADMIN NÃO TEM COZINHA. A conta existe para operar o negócio —
  // planos, assinaturas, suporte, restauração — e nada disso passa por
  // "onde você vai trabalhar?". Pior: com um estoque próprio escolhido, o
  // painel vira mais uma tela dentro de uma cozinha vazia, e quem atende passa
  // a olhar para números que não são de cliente nenhum.
  // As telas de cozinha continuam existindo para ele: aparecem no MODO
  // SUPORTE, dentro da conta do cliente, com os dados do cliente — que é o
  // único lugar onde elas dizem alguma coisa. E há o botão de demonstração no
  // painel, para ver como o app se comporta na entrada.
  const superAdminSemCliente = sessao?.eSuperAdmin && !impersonando;
  if (!escolheuModulo && !soEtiquetas && !superAdminSemCliente) {
    return <SeletorModulo comoTela aoEscolher={() => setEscolheuModulo(true)} />;
  }

  return (
    <>
      {impersonando && <BannerSuporte nome={impersonando.restauranteNome} podeMexer={impersonando.podeMexer} onSair={sairImpersonacao} />}
      {/* Faixa do modo demonstração — lembra o visitante que nada é salvo */}
      {sessao?.demo && (
        <div className="sticky top-0 z-50 px-4 py-2 flex items-center justify-between gap-3 shadow-md bg-polo-gold text-polo-navy print:hidden">
          <p className="text-xs font-semibold min-w-0 truncate">Demonstração — dados de exemplo, nada é salvo</p>
          {/* ⚠️ RECARREGA quando a demonstração foi aberta pelo painel. O
              logout do modo demonstração zera a sessão em memória, mas a do
              Supabase continua viva — sem o reload o super-admin caía na tela
              de login com a conta ainda logada por baixo. Recarregando, o app
              relê a sessão e volta sozinho para o painel. */}
          <button onClick={async () => {
            let doPainel = false;
            try {
              doPainel = sessionStorage.getItem('aurum_demo_do_painel') === '1';
              sessionStorage.removeItem('aurum_demo_do_painel');
            } catch { /* sem storage */ }
            await logout();
            if (doPainel) window.location.reload();
          }}
            className="font-bold text-xs px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0 bg-polo-navy text-polo-gold">
            Sair da demo
          </button>
        </div>
      )}
      {/* Faixa do período de teste (some quando a assinatura é ativada) */}
      {plano.tipo === 'teste' && (
        <Link to="/pagamento" className="block bg-polo-gold text-polo-navy text-center text-xs font-bold px-4 py-1.5 print:hidden">
          ⏳ Período de teste — {plano.diasRestantes} dia(s) restante(s). Toque para assinar.
        </Link>
      )}
      <Suspense fallback={<Splash texto="Abrindo…" />}>
      {/* ⚠️ ÁRVORE DE ROTAS PRÓPRIA para o plano Aurum Etiquetas.
          É um `if` no topo, e NÃO `produtoTem` espalhado em 25 <Route>. Além
          de ruidoso, o gate por rota faria a experiência parecer "o app
          completo com telas escondidas" — exatamente o que o dono vetou ao
          pedir "um sistema bem estruturado apenas de etiquetas".
          Tudo que não está aqui cai no Início: link antigo, favorito ou URL
          digitada não podem abrir tela de um produto que a conta não comprou. */}
      {soEtiquetas ? (
        <Routes>
          {/* ⚠️ `/` É a tela de imprimir. Não existe "Início" separado: eram a
              mesma coisa, e num app cuja função é imprimir etiqueta a tela de
              abertura é a de imprimir.
              ⚠️ NÃO existe /validades aqui. Este produto imprime a data na
              etiqueta; ele não acompanha o que está vencendo — isso é o Aurum
              Cozinha Pro. /etiquetas continua atendendo por compatibilidade
              (link antigo, favorito) e leva para o mesmo lugar. */}
          <Route path="/"           element={<Etiquetas />} />
          <Route path="/etiquetas"  element={<Navigate to="/" replace />} />
          <Route path="/itens"      element={can('gerenciarProdutos') ? <Itens /> : <Navigate to="/" replace />} />
          {/* ⚠️ Estava SEM TRAVA: qualquer pessoa logada — inclusive o
              cozinheiro que entrou por convite — mudava temperatura, tamanho
              de etiqueta, dados do estabelecimento, suporte remoto e
              assinatura. No app completo a tela equivalente é protegida; aqui
              tinha passado. `Restrito` é o mesmo helper de /pagamento, e
              temPermissao deixa o super-admin entrar (o suporte precisa). */}
          <Route path="/ajustes"    element={<Restrito cargo="diretoria"><EtiquetasAjustes /></Restrito>} />
          <Route path="/pagamento"  element={<Restrito><Pagamento /></Restrito>} />
          {/* ⚠️ O PAINEL PRECISA EXISTIR AQUI TAMBÉM. Esta tabela de rotas
              manda `*` para `/`, então sem esta linha o /admin simplesmente
              não existia no plano Etiquetas — e um super-admin cuja própria
              conta estivesse neste produto ficava TRANCADO FORA do painel, sem
              caminho de volta pela interface. A saída seria mexer no banco. */}
          <Route path="/admin"      element={sessao?.eSuperAdmin ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="/novidades"  element={<Novidades />} />
          <Route path="*"           element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
      /* key={modulo}: trocar de estoque REMONTA as páginas. Sem isto o estado
          local sobrevive — a contagem digitada na Produção continuava na tela
          do Seco e podia ser salva com produtos que não existem lá. */
      <Routes key={modulo}>
      {/* ⚠️ `!sessao.restauranteId` SAIU da condição. Ela existia de quando o
          super-admin nunca tinha restaurante próprio; hoje, se ele tiver um
          (por teste, por engano, por ter sido dono antes), o app o largava
          numa cozinha em vez do painel — e o painel virava uma URL que só quem
          soubesse alcançava. */}
      <Route path="/" element={
        sessao?.eSuperAdmin && !impersonando
          ? <Navigate to="/admin" replace />
          : <Dashboard />
      } />
      <Route path="/registrar" element={<Registrar />} />
      <Route path="/historico" element={<Historico />} />
      {/* Estas três estavam declaradas em RECURSOS_MODULO mas o gate nunca era
          aplicado: por URL direta abriam na Finalização, que não compra, não dá
          entrada avulsa e não faz saída (ela recebe da Produção e fecha turno).
          Vale escrever o motivo porque o defeito era invisível pela navegação —
          o hub Registrar já escondia os cards, então só aparecia por link
          antigo, favorito ou histórico do navegador. */}
      <Route path="/compras" element={temRecurso(modulo, 'compras') ? <Compras /> : <Navigate to="/registrar" replace />} />
      <Route path="/entradas" element={temRecurso(modulo, 'entradas') ? <Entradas /> : <Navigate to="/registrar" replace />} />
      <Route path="/saidas" element={temRecurso(modulo, 'saidas') ? <Saidas /> : <Navigate to="/registrar" replace />} />
      {/* Produção não existe fora da cozinha de produção. Já a tela de
          Apara/Perda abre em qualquer módulo que registre PERDA — sem ela, o
          que estraga no seco/finalização não tinha onde ser lançado e virava
          "consumo" no fechamento de turno. */}
      <Route path="/producao" element={temRecurso(modulo, 'producao') ? <Producao /> : <Navigate to="/registrar" replace />} />
      <Route path="/aparas" element={temRecurso(modulo, 'perdas') ? <AparasPerdas /> : <Navigate to="/registrar" replace />} />
      {/* Etiquetas não existem no Estoque Seco: o mantimento chega LACRADO e
          já etiquetado pelo fabricante. A rota não tinha gate nenhum, então
          abria por URL direta mesmo com o card escondido. */}
      <Route path="/etiquetas" element={temRecurso(modulo, 'etiquetas') ? <Etiquetas /> : <Navigate to="/registrar" replace />} />
      <Route path="/validades" element={<Validades />} />
      {/* fechamento de turno só existe na Cozinha de Finalização */}
      <Route path="/fechar-turno" element={temRecurso(modulo, 'fecharTurno') ? <FecharTurno /> : <Navigate to="/" replace />} />
      <Route path="/novidades" element={<Novidades />} />
      {/* Cadastro enxuto de itens (plano Aurum Etiquetas). Gate por
          gerenciarProdutos, a mesma capacidade que protege Config → Produtos —
          senão o cozinheiro editaria o catálogo por aqui, que é o buraco que
          esse tipo de tela nova costuma abrir. */}
      <Route path="/itens" element={can('gerenciarProdutos') ? <Itens /> : <Navigate to="/" replace />} />
      <Route path="/desperdicio" element={<Navigate to="/aparas" replace />} />
      <Route path="/fichas" element={<Navigate to="/compras" replace />} />
      {/* Contagem física NÃO existe na Finalização: lá o número de fechamento
          vem de Fechar Turno. Antes esta rota olhava só a permissão, então
          bastava o atalho de Configurações para gravar um ajuste que entrava
          no cálculo do turno e corrompia a sobra apurada. */}
      <Route path="/inventario" element={temRecurso(modulo, 'inventario') && can('inventario') ? <Inventario /> : <Navigate to="/" replace />} />
      <Route path="/relatorio" element={can('verRelatorio') ? <Relatorio /> : <Navigate to="/" replace />} />
      <Route path="/auditoria" element={can('verAuditoria') ? <Auditoria /> : <Navigate to="/" replace />} />
      {/* Administração é SEÇÃO, não estoque: tem rota própria e não mexe no
          módulo aberto. A regra de acesso vem de podeAbrirAdministracao — a
          MESMA que a barra inferior e o seletor usam, para não divergirem. */}
      <Route path="/administracao" element={
        podeAbrirAdministracao(sessao, permissoes) ? <Administracao /> : <Navigate to="/" replace />} />
      {/* A rota existe para quem tem a capacidade; a própria tela explica o
          bloqueio para quem chega sem ela (o servidor já não manda os custos). */}
      <Route path="/financeiro" element={can('verFinanceiro') ? <Financeiro /> : <Navigate to="/administracao" replace />} />
      {/* Criar/renomear/arquivar estoque muda o que TODA a equipe enxerga — a
          tela explica o bloqueio, e a migração 22 recusa a escrita de quem não
          for diretoria (não é trava de tela). */}
      <Route path="/estoques" element={podeAbrirAdministracao(sessao, permissoes) ? <Estoques /> : <Navigate to="/" replace />} />
      <Route path="/balanco" element={can('verRelatorio') ? <Balanco /> : <Navigate to="/administracao" replace />} />
      <Route path="/pagamento" element={<Restrito><Pagamento /></Restrito>} />
      <Route path="/configuracoes" element={podeAbrirConfig(sessao, permissoes) ? <Configuracoes /> : <Navigate to="/" replace />} />
      <Route path="/admin" element={sessao?.eSuperAdmin ? <Admin /> : <Navigate to="/" replace />} />
      {/* Sem isto, qualquer URL desconhecida renderizava TELA BRANCA — nenhuma
          rota casava e nada era desenhado. Acontece com link antigo, favorito
          de uma rota que mudou de nome, ou erro de digitação. Cai no Início,
          que sempre existe em todos os módulos. */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      )}
      </Suspense>
      <AvisoVencimento />
      <NovidadesPopup />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <UIProvider>
        <AuthProvider>
          <AppProvider>
            <Rotas />
            <EtiquetaPrint />
            <PwaUpdatePrompt />
            <PwaInstallPrompt />
          </AppProvider>
        </AuthProvider>
      </UIProvider>
    </BrowserRouter>
  );
}
