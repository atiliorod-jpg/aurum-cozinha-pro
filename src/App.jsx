import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import { statusAssinatura } from './utils/assinatura';
import { pode, podeAbrirConfig } from './utils/permissoes';
import { AppProvider, useApp } from './store/AppContext';
import { UIProvider, useUI } from './store/UIContext';
import { fmtData } from './utils/formatters';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import EtiquetaPrint from './components/EtiquetaPrint';
import AvisoVencimento from './components/AvisoVencimento';
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
// Páginas pesadas carregam sob demanda (code-split): primeiro load menor no tablet
const Relatorio = lazy(() => import('./pages/Relatorio'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const Admin = lazy(() => import('./pages/Admin'));

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
  const { sessao, carregando, logout, recuperando, impersonando, sairImpersonacao, derrubado, limparDerrubado, temPermissao } = useAuth();
  const { toast } = useUI();
  const { prefs } = useApp();
  // Capacidade configurável (matriz de permissões da diretoria) — diretoria e
  // super-admin sempre podem; cozinha/gerência seguem prefs.permissoes.
  const can = (cap) => pode(sessao, prefs?.permissoes, cap);

  // Boas-vindas (flag gravada no cadastro/aceite de convite, antes da sessão montar)
  useEffect(() => {
    if (!sessao?.restauranteId || sessao.demo) return;
    let flag = null;
    try { flag = sessionStorage.getItem('aurum_boasvindas'); sessionStorage.removeItem('aurum_boasvindas'); } catch { /* sem storage */ }
    if (flag === 'novo') {
      const st = statusAssinatura(sessao);
      toast(`🎉 Bem-vindo ao Aurum Cozinha Pro! Teste grátis com tudo liberado até ${st.ate ? fmtData(new Date(st.ate).toISOString().slice(0, 10)) : 'o fim dos 7 dias'}.`, 'sucesso', { duracao: 8000 });
    } else if (flag === 'convite') {
      toast(`👋 Você entrou no restaurante ${sessao.restauranteNome || ''} como ${sessao.cargo}. Bom trabalho!`, 'sucesso', { duracao: 7000 });
    }
  }, [sessao, toast]);

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

  // Conta autenticada mas sem perfil/cargo (cadastro interrompido).
  // Super-admin é exceção: acessa o painel mesmo sem restaurante próprio.
  if (!sessao.cargo && !sessao.eSuperAdmin) {
    return (
      <div className="min-h-screen bg-polo-navy flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-polo-gold font-bold text-lg">Cadastro incompleto</p>
        <p className="text-white/80 text-sm max-w-xs">
          Sua conta foi criada mas ainda não está vinculada a um restaurante. Saia e entre novamente, ou peça um novo convite à diretoria.
        </p>
        <button onClick={logout} className="bg-polo-gold text-polo-navy font-bold px-6 py-2.5 rounded-xl">Sair</button>
      </div>
    );
  }

  // Plano único + teste de 7 dias: vencido → bloqueio visual (dados preservados).
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

  return (
    <>
      {impersonando && <BannerSuporte nome={impersonando.restauranteNome} podeMexer={impersonando.podeMexer} onSair={sairImpersonacao} />}
      {/* Faixa do modo demonstração — lembra o visitante que nada é salvo */}
      {sessao?.demo && (
        <div className="sticky top-0 z-50 px-4 py-2 flex items-center justify-between gap-3 shadow-md bg-polo-gold text-polo-navy print:hidden">
          <p className="text-xs font-semibold min-w-0 truncate">🎬 Demonstração — dados de exemplo, nada é salvo</p>
          <button onClick={logout}
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
      <Routes>
      <Route path="/" element={
        sessao?.eSuperAdmin && !sessao.restauranteId && !impersonando
          ? <Navigate to="/admin" replace />
          : <Dashboard />
      } />
      <Route path="/registrar" element={<Registrar />} />
      <Route path="/historico" element={<Historico />} />
      <Route path="/compras" element={<Compras />} />
      <Route path="/entradas" element={<Entradas />} />
      <Route path="/saidas" element={<Saidas />} />
      <Route path="/producao" element={<Producao />} />
      <Route path="/aparas" element={<AparasPerdas />} />
      <Route path="/etiquetas" element={<Etiquetas />} />
      <Route path="/desperdicio" element={<Navigate to="/aparas" replace />} />
      <Route path="/fichas" element={<Navigate to="/compras" replace />} />
      <Route path="/inventario" element={can('inventario') ? <Inventario /> : <Navigate to="/" replace />} />
      <Route path="/relatorio" element={can('verRelatorio') ? <Relatorio /> : <Navigate to="/" replace />} />
      <Route path="/auditoria" element={can('verAuditoria') ? <Auditoria /> : <Navigate to="/" replace />} />
      <Route path="/pagamento" element={<Restrito><Pagamento /></Restrito>} />
      <Route path="/configuracoes" element={podeAbrirConfig(sessao, prefs?.permissoes) ? <Configuracoes /> : <Navigate to="/" replace />} />
      <Route path="/admin" element={sessao?.eSuperAdmin ? <Admin /> : <Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <AvisoVencimento />
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
