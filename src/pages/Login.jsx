import { useState } from 'react';
import { useAuth, CARGOS } from '../store/AuthContext';

export default function Login() {
  const { usuarios, criarUsuario, login } = useAuth();
  const primeiroAcesso = usuarios.length === 0;

  const [usuarioId, setUsuarioId] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  // primeiro acesso
  const [nome, setNome] = useState('');
  const [novoPin, setNovoPin] = useState('');
  const [confirmaPin, setConfirmaPin] = useState('');

  const entrar = () => {
    setErro('');
    if (!usuarioId) { setErro('Selecione quem está entrando.'); return; }
    if (!login(usuarioId, pin)) { setErro('PIN incorreto.'); setPin(''); }
  };

  const criarAdmin = () => {
    setErro('');
    if (nome.trim().length < 2) { setErro('Digite seu nome.'); return; }
    if (!/^\d{4,6}$/.test(novoPin)) { setErro('O PIN deve ter de 4 a 6 números.'); return; }
    if (novoPin !== confirmaPin) { setErro('Os PINs não conferem.'); return; }
    const u = criarUsuario(nome, novoPin, 'diretoria');
    login(u.id, novoPin);
  };

  return (
    <div className="min-h-screen bg-polo-navy flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={`${import.meta.env.BASE_URL}logo-aurum.png`} alt="Aurum Serviços Gastronômicos"
            className="w-40 h-40 mx-auto rounded-3xl ring-1 ring-polo-gold/30 shadow-2xl object-cover mb-5" />
          <h1 className="text-2xl font-bold text-polo-gold">Polo Estoque</h1>
          <p className="text-white/50 text-sm mt-1">Controle de produção — Polo Central & Beer</p>
        </div>

        <div className="bg-white rounded-2xl p-6 space-y-4 shadow-2xl">
          {primeiroAcesso ? (
            <>
              <div>
                <h2 className="font-bold text-polo-navy">Primeiro acesso</h2>
                <p className="text-xs text-gray-500 mt-0.5">Crie o usuário administrador (Diretoria — acesso total).</p>
              </div>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" />
              <input type="password" inputMode="numeric" value={novoPin} onChange={e => setNovoPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Crie um PIN (4 a 6 números)"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm tracking-widest" />
              <input type="password" inputMode="numeric" value={confirmaPin} onChange={e => setConfirmaPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Confirme o PIN"
                onKeyDown={e => { if (e.key === 'Enter') criarAdmin(); }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm tracking-widest" />
              {erro && <p className="text-xs text-red-500 font-semibold">{erro}</p>}
              <button onClick={criarAdmin}
                className="w-full bg-polo-navy text-polo-gold font-bold py-3.5 rounded-xl active:scale-[0.98] transition-transform">
                Criar e entrar
              </button>
            </>
          ) : (
            <>
              <h2 className="font-bold text-polo-navy">Quem está entrando?</h2>
              <div className="grid grid-cols-2 gap-2">
                {usuarios.map(u => (
                  <button key={u.id} onClick={() => { setUsuarioId(u.id); setErro(''); }}
                    className={`p-3 rounded-xl border-2 text-left transition-all
                      ${usuarioId === u.id ? 'border-polo-gold bg-polo-navy text-white' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                    <div className="font-semibold text-sm truncate">{u.nome}</div>
                    <div className={`text-[10px] ${usuarioId === u.id ? 'text-polo-gold' : 'text-gray-400'}`}>
                      {CARGOS.find(c => c.id === u.cargo)?.label}
                    </div>
                  </button>
                ))}
              </div>
              <input type="password" inputMode="numeric" value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') entrar(); }}
                placeholder="PIN"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-lg tracking-[0.5em]" />
              {erro && <p className="text-xs text-red-500 font-semibold text-center">{erro}</p>}
              <button onClick={entrar}
                className="w-full bg-polo-navy text-polo-gold font-bold py-3.5 rounded-xl active:scale-[0.98] transition-transform">
                Entrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
