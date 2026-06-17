import { useState } from 'react';
import { useAuth } from '../store/AuthContext';

const campo = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm";
const botao = "w-full bg-polo-navy text-polo-gold font-bold py-3.5 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50";

export default function Login() {
  const { login, esqueceuSenha, criarPrimeiroAdmin, usarConvite } = useAuth();
  const [modo, setModo] = useState('entrar'); // entrar | convite | novo | esqueci
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');

  // campos
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [nomeRest, setNomeRest] = useState('');
  const [token, setToken] = useState('');

  const limpar = () => { setErro(''); setInfo(''); };
  const trocar = (m) => { limpar(); setSenha(''); setModo(m); };

  const entrar = async () => {
    limpar();
    if (!email || !senha) { setErro('Preencha e-mail e senha.'); return; }
    setCarregando(true);
    const err = await login(email.trim(), senha);
    setCarregando(false);
    if (err) setErro(traduz(err));
  };

  const recuperar = async () => {
    limpar();
    if (!email) { setErro('Digite seu e-mail.'); return; }
    setCarregando(true);
    const err = await esqueceuSenha(email.trim());
    setCarregando(false);
    if (err) setErro(traduz(err));
    else setInfo('Enviamos um link de recuperação para o seu e-mail. Confira a caixa de entrada (e o spam).');
  };

  const criarRestaurante = async () => {
    limpar();
    if (nome.trim().length < 2) { setErro('Digite seu nome.'); return; }
    if (!nomeRest.trim()) { setErro('Digite o nome do restaurante.'); return; }
    if (!/.+@.+\..+/.test(email)) { setErro('Digite um e-mail válido.'); return; }
    if (senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return; }
    setCarregando(true);
    const err = await criarPrimeiroAdmin({ nome: nome.trim(), email: email.trim(), senha, nomeRestaurante: nomeRest.trim() });
    setCarregando(false);
    if (err) setErro(traduz(err));
  };

  const cadastrarConvite = async () => {
    limpar();
    if (!token.trim()) { setErro('Digite o código de convite.'); return; }
    if (nome.trim().length < 2) { setErro('Digite seu nome.'); return; }
    if (!/.+@.+\..+/.test(email)) { setErro('Digite um e-mail válido.'); return; }
    if (senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return; }
    setCarregando(true);
    const err = await usarConvite({ token: token.trim().toLowerCase(), nome: nome.trim(), email: email.trim(), senha });
    setCarregando(false);
    if (err) setErro(traduz(err));
  };

  return (
    <div className="min-h-screen bg-polo-navy flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={`${import.meta.env.BASE_URL}logo-aurum.png`} alt="Aurum Serviços Gastronômicos"
            className="w-32 h-32 mx-auto rounded-3xl ring-1 ring-polo-gold/30 shadow-2xl object-cover mb-5" />
          <h1 className="text-2xl font-bold text-polo-gold">Aurum Cozinha Pro</h1>
          <p className="text-white/85 text-sm mt-1">Controle de produção na nuvem</p>
        </div>

        <div className="bg-white rounded-2xl p-6 space-y-3 shadow-2xl">
          {/* ENTRAR */}
          {modo === 'entrar' && <>
            <h2 className="font-bold text-polo-navy">Entrar</h2>
            <input type="email" autoComplete="email" aria-label="E-mail" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" className={campo} />
            <input type="password" autoComplete="current-password" aria-label="Senha" value={senha} onChange={e => setSenha(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') entrar(); }} placeholder="Senha" className={campo} />
            <Msg erro={erro} info={info} />
            <button onClick={entrar} disabled={carregando} className={botao}>{carregando ? 'Entrando…' : 'Entrar'}</button>
            <button onClick={() => trocar('esqueci')} className="w-full text-xs text-polo-navy/70 pt-1">Esqueci minha senha</button>
            <div className="border-t border-gray-100 pt-3 flex flex-col gap-1.5">
              <button onClick={() => trocar('convite')} className="text-xs font-semibold text-polo-navy">Tenho um código de convite →</button>
              <button onClick={() => trocar('novo')} className="text-xs text-gray-500">Cadastrar meu restaurante →</button>
            </div>
          </>}

          {/* ESQUECI SENHA */}
          {modo === 'esqueci' && <>
            <h2 className="font-bold text-polo-navy">Recuperar senha</h2>
            <p className="text-xs text-gray-500">Digite seu e-mail e enviaremos um link para criar uma nova senha.</p>
            <input type="email" aria-label="E-mail" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" className={campo} />
            <Msg erro={erro} info={info} />
            <button onClick={recuperar} disabled={carregando} className={botao}>{carregando ? 'Enviando…' : 'Enviar link'}</button>
            <button onClick={() => trocar('entrar')} className="w-full text-xs text-gray-500 pt-1">← Voltar</button>
          </>}

          {/* CONVITE */}
          {modo === 'convite' && <>
            <h2 className="font-bold text-polo-navy">Cadastro com convite</h2>
            <p className="text-xs text-gray-500">Use o código que a diretoria do seu restaurante te passou.</p>
            <input type="text" aria-label="Código de convite" value={token} onChange={e => setToken(e.target.value)} placeholder="Código de convite"
              className={`${campo} tracking-widest text-center font-bold`} />
            <input type="text" aria-label="Seu nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" className={campo} />
            <input type="email" aria-label="Seu e-mail" value={email} onChange={e => setEmail(e.target.value)} placeholder="Seu e-mail" className={campo} />
            <input type="password" aria-label="Senha (mínimo 6 caracteres)" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Crie uma senha (mín. 6)" className={campo} />
            <Msg erro={erro} info={info} />
            <button onClick={cadastrarConvite} disabled={carregando} className={botao}>{carregando ? 'Criando…' : 'Criar conta'}</button>
            <button onClick={() => trocar('entrar')} className="w-full text-xs text-gray-500 pt-1">← Voltar</button>
          </>}

          {/* NOVO RESTAURANTE */}
          {modo === 'novo' && <>
            <h2 className="font-bold text-polo-navy">Cadastrar restaurante</h2>
            <p className="text-xs text-gray-500">Você será o administrador (Diretoria — acesso total).</p>
            <input type="text" aria-label="Nome do restaurante" value={nomeRest} onChange={e => setNomeRest(e.target.value)} placeholder="Nome do restaurante" className={campo} />
            <input type="text" aria-label="Seu nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" className={campo} />
            <input type="email" aria-label="Seu e-mail" value={email} onChange={e => setEmail(e.target.value)} placeholder="Seu e-mail" className={campo} />
            <input type="password" aria-label="Senha (mínimo 6 caracteres)" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Crie uma senha (mín. 6)" className={campo} />
            <Msg erro={erro} info={info} />
            <button onClick={criarRestaurante} disabled={carregando} className={botao}>{carregando ? 'Criando…' : 'Criar e entrar'}</button>
            <button onClick={() => trocar('entrar')} className="w-full text-xs text-gray-500 pt-1">← Voltar</button>
          </>}
        </div>
      </div>
    </div>
  );
}

function Msg({ erro, info }) {
  if (erro) return <p className="text-xs text-red-500 font-semibold">{erro}</p>;
  if (info) return <p className="text-xs text-green-600 font-semibold">{info}</p>;
  return null;
}

// Traduz mensagens comuns do Supabase para português
function traduz(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Esse e-mail já tem conta. Use "Entrar".';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um momento e tente de novo.';
  if (m.includes('password')) return 'Senha inválida (mínimo 6 caracteres).';
  if (m.includes('network') || m.includes('fetch')) return 'Sem conexão com a internet.';
  return msg || 'Erro inesperado.';
}
