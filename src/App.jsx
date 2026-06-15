import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import { AppProvider } from './store/AppContext';
import { UIProvider } from './store/UIContext';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import PwaInstallPrompt from './components/PwaInstallPrompt';
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
import Relatorio from './pages/Relatorio';
import Auditoria from './pages/Auditoria';
import Pagamento from './pages/Pagamento';
import Configuracoes from './pages/Configuracoes';
import Admin from './pages/Admin';

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

// Faixa fixa de aviso quando o super-admin está vendo os dados de um cliente
function BannerSuporte({ nome, onSair }) {
  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-3 shadow-md">
      <p className="text-xs font-semibold min-w-0 truncate">
        🛠️ Modo suporte — vendo <strong>{nome || 'cliente'}</strong> (somente leitura)
      </p>
      <button onClick={onSair}
        className="bg-amber-950 text-amber-50 font-bold text-xs px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0">
        Sair do modo suporte
      </button>
    </div>
  );
}

function Rotas() {
  const { sessao, carregando, logout, recuperando, impersonando, sairImpersonacao } = useAuth();

  if (carregando) return <Splash />;
  // Veio do link de recuperação de senha → tela de nova senha (tem prioridade)
  if (recuperando) return <NovaSenha />;
  if (!sessao) return <Login />;

  // Conta autenticada mas sem perfil/cargo (cadastro interrompido)
  if (!sessao.cargo) {
    return (
      <div className="min-h-screen bg-polo-navy flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-polo-gold font-bold text-lg">Cadastro incompleto</p>
        <p className="text-white/60 text-sm max-w-xs">
          Sua conta foi criada mas ainda não está vinculada a um restaurante. Saia e entre novamente, ou peça um novo convite à diretoria.
        </p>
        <button onClick={logout} className="bg-polo-gold text-polo-navy font-bold px-6 py-2.5 rounded-xl">Sair</button>
      </div>
    );
  }

  return (
    <>
      {impersonando && <BannerSuporte nome={impersonando.restauranteNome} onSair={sairImpersonacao} />}
      <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/registrar" element={<Registrar />} />
      <Route path="/historico" element={<Historico />} />
      <Route path="/compras" element={<Compras />} />
      <Route path="/entradas" element={<Entradas />} />
      <Route path="/saidas" element={<Saidas />} />
      <Route path="/producao" element={<Producao />} />
      <Route path="/aparas" element={<AparasPerdas />} />
      <Route path="/desperdicio" element={<Navigate to="/aparas" replace />} />
      <Route path="/fichas" element={<Navigate to="/compras" replace />} />
      <Route path="/inventario" element={<Restrito><Inventario /></Restrito>} />
      <Route path="/relatorio" element={<Restrito><Relatorio /></Restrito>} />
      <Route path="/auditoria" element={<Restrito><Auditoria /></Restrito>} />
      <Route path="/pagamento" element={<Restrito><Pagamento /></Restrito>} />
      <Route path="/configuracoes" element={<Restrito><Configuracoes /></Restrito>} />
      <Route path="/admin" element={sessao?.eSuperAdmin ? <Admin /> : <Navigate to="/" replace />} />
      </Routes>
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
            <PwaUpdatePrompt />
            <PwaInstallPrompt />
          </AppProvider>
        </AuthProvider>
      </UIProvider>
    </BrowserRouter>
  );
}
