import { useState } from 'react';
import { useAuth } from '../store/AuthContext';

// Tela mostrada quando a pessoa clica no link de "esqueci minha senha" do e-mail,
// ou quando escolhe trocar a senha estando logada.
export default function NovaSenha({ aoConcluir, titulo = 'Criar nova senha' }) {
  const { atualizarSenha } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');
  const [carregando, setCarregando] = useState(false);

  const salvar = async () => {
    setErro(''); setInfo('');
    if (senha.length < 8) { setErro('A senha deve ter pelo menos 8 caracteres.'); return; }
    if (senha !== confirma) { setErro('As senhas não conferem.'); return; }
    setCarregando(true);
    const err = await atualizarSenha(senha);
    setCarregando(false);
    if (err) { setErro(err); return; }
    setInfo('Senha alterada com sucesso!');
    setSenha(''); setConfirma('');
    if (aoConcluir) setTimeout(aoConcluir, 900);
  };

  return (
    <div className="min-h-screen bg-polo-navy flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={`${import.meta.env.BASE_URL}logo-aurum.png`} alt="Aurum"
            className="w-24 h-24 mx-auto rounded-3xl ring-1 ring-polo-gold/30 shadow-2xl object-cover mb-4" />
          <h1 className="text-xl font-bold text-polo-gold">{titulo}</h1>
        </div>
        <div className="bg-white rounded-2xl p-6 space-y-3 shadow-2xl">
          <input type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)}
            placeholder="Nova senha (mín. 8)" aria-label="Nova senha (mínimo 8 caracteres)" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" />
          <input type="password" autoComplete="new-password" value={confirma} onChange={e => setConfirma(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') salvar(); }}
            placeholder="Confirme a nova senha" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" />
          {erro && <p className="text-xs text-red-500 font-semibold">{erro}</p>}
          {info && <p className="text-xs text-green-600 font-semibold">{info}</p>}
          <button onClick={salvar} disabled={carregando}
            className="w-full bg-polo-navy text-polo-gold font-bold py-3.5 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50">
            {carregando ? 'Salvando…' : 'Salvar senha'}
          </button>
          {aoConcluir && (
            <button onClick={aoConcluir} className="w-full text-xs text-gray-500 pt-1">Cancelar</button>
          )}
        </div>
      </div>
    </div>
  );
}
