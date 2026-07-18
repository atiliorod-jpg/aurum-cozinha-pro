import { useState } from 'react';
import { useAuth } from '../store/AuthContext';

const campo = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm";
const botao = "w-full bg-polo-navy text-polo-gold font-bold py-3.5 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50";

// Campo de senha com botão mostrar/ocultar (dedo grosso no tablet erra a senha)
function CampoSenha({ valor, onChange, aria, placeholder, autoComplete, onEnter }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input type={ver ? 'text' : 'password'} autoComplete={autoComplete} aria-label={aria}
        value={valor} onChange={e => onChange(e.target.value)}
        onKeyDown={onEnter ? (e => { if (e.key === 'Enter') onEnter(); }) : undefined}
        placeholder={placeholder} className={`${campo} pr-12`} />
      <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-lg px-2 py-1">
        {ver ? '🙈' : '👁️'}
      </button>
    </div>
  );
}

// Código vindo do link direto (?convite=TOKEN) — compartilhado via WhatsApp
const conviteDaURL = (() => {
  try { return new URLSearchParams(window.location.search).get('convite') || ''; }
  catch { return ''; }
})();

export default function Login() {
  const { login, esqueceuSenha, criarPrimeiroAdmin, usarConvite, entrarDemo } = useAuth();
  const [modo, setModo] = useState(conviteDaURL ? 'convite' : 'entrar'); // entrar | convite | novo | esqueci
  const [mostraPrivacidade, setMostraPrivacidade] = useState(false);
  const [mostraTermos, setMostraTermos] = useState(false);
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');

  // campos
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [nomeRest, setNomeRest] = useState('');
  const [token, setToken] = useState(conviteDaURL);

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
    if (senha.length < 8) { setErro('A senha deve ter pelo menos 8 caracteres.'); return; }
    if (!aceitouTermos) { setErro('Confirme que leu para que serve o sistema (caixinha acima do botão).'); return; }
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
    if (senha.length < 8) { setErro('A senha deve ter pelo menos 8 caracteres.'); return; }
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
          <p className="text-white/85 text-sm mt-1">Produção interna e estoque de cozinha profissional</p>
        </div>

        <div className="bg-white rounded-2xl p-6 space-y-3 shadow-2xl">
          {/* ENTRAR */}
          {modo === 'entrar' && <>
            <h2 className="font-bold text-polo-navy">Entrar</h2>
            <input type="email" autoComplete="email" aria-label="E-mail" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" className={campo} />
            <CampoSenha valor={senha} onChange={setSenha} aria="Senha" autoComplete="current-password" placeholder="Senha" onEnter={entrar} />
            <Msg erro={erro} info={info} />
            <button onClick={entrar} disabled={carregando} className={botao}>{carregando ? 'Entrando…' : 'Entrar'}</button>
            <button onClick={() => trocar('esqueci')} className="w-full text-xs text-polo-navy/70 pt-1">Esqueci minha senha</button>
            <div className="border-t border-gray-100 pt-3 flex flex-col gap-1.5">
              <button onClick={() => trocar('convite')} className="text-xs font-semibold text-polo-navy">Tenho um código de convite →</button>
              <button onClick={() => trocar('novo')} className="text-xs text-gray-500">Cadastrar meu restaurante — <strong className="text-green-700">7 dias grátis</strong> →</button>
            </div>
            <button onClick={entrarDemo}
              className="w-full border-2 border-polo-gold text-polo-navy font-bold py-3 rounded-xl text-sm active:scale-[0.98] transition-transform">
              🎬 Ver demonstração — sem cadastro
            </button>
            <p className="text-[10px] text-gray-400 text-center -mt-1">
              Restaurante de exemplo já preenchido. Mexa à vontade: nada é salvo e tudo reseta ao sair.
            </p>
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
            <CampoSenha valor={senha} onChange={setSenha} aria="Senha (mínimo 8 caracteres)" autoComplete="new-password" placeholder="Crie uma senha (mín. 8)" />
            <Msg erro={erro} info={info} />
            <button onClick={cadastrarConvite} disabled={carregando} className={botao}>{carregando ? 'Criando…' : 'Criar conta'}</button>
            <button onClick={() => trocar('entrar')} className="w-full text-xs text-gray-500 pt-1">← Voltar</button>
          </>}

          {/* NOVO RESTAURANTE */}
          {modo === 'novo' && <>
            <h2 className="font-bold text-polo-navy">Cadastrar restaurante</h2>
            <p className="text-xs font-semibold text-green-700">✨ 7 dias grátis com tudo liberado · depois R$ 149/mês para continuar.</p>
            <p className="text-xs text-gray-500">Você será o administrador (Diretoria — acesso total).</p>
            <input type="text" aria-label="Nome do restaurante" value={nomeRest} onChange={e => setNomeRest(e.target.value)} placeholder="Nome do restaurante" className={campo} />
            <input type="text" aria-label="Seu nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" className={campo} />
            <input type="email" aria-label="Seu e-mail" value={email} onChange={e => setEmail(e.target.value)} placeholder="Seu e-mail" className={campo} />
            <CampoSenha valor={senha} onChange={setSenha} aria="Senha (mínimo 8 caracteres)" autoComplete="new-password" placeholder="Crie uma senha (mín. 8)" />
            <p className="text-[11px] text-gray-400 -mt-1">Use um e-mail que só você controla — quem tiver acesso a ele pode recuperar a senha da conta.</p>
            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={aceitouTermos} onChange={e => setAceitouTermos(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#1B2A41] flex-shrink-0" />
              <span>
                Li e entendo que este sistema é para <strong>produção e estoque interno</strong> da cozinha
                (porcionamentos e semiacabados), não para atendimento ao cliente final.{' '}
                <button type="button" onClick={() => setMostraTermos(true)} className="underline underline-offset-2 text-polo-navy font-semibold">Ler os termos</button>
              </span>
            </label>
            <Msg erro={erro} info={info} />
            <button onClick={criarRestaurante} disabled={carregando} className={botao}>{carregando ? 'Criando…' : 'Criar e entrar'}</button>
            <button onClick={() => trocar('entrar')} className="w-full text-xs text-gray-500 pt-1">← Voltar</button>
          </>}
        </div>

        <div className="flex items-center justify-center gap-4 mt-4">
          <button onClick={() => setMostraTermos(true)} className="text-[11px] text-white/70 underline underline-offset-2">
            Termos de uso e modo de uso
          </button>
          <button onClick={() => setMostraPrivacidade(true)} className="text-[11px] text-white/70 underline underline-offset-2">
            Privacidade e proteção de dados
          </button>
        </div>
      </div>

      {mostraPrivacidade && <ModalPrivacidade onFechar={() => setMostraPrivacidade(false)} />}
      {mostraTermos && <ModalTermos onFechar={() => setMostraTermos(false)} />}
    </div>
  );
}

// Termos de uso e modo de uso — deixa claro PARA QUEM é o sistema e o modelo
// de trabalho (produção interna: porções e semiacabados, nunca prato montado).
function ModalTermos({ onFechar }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 overflow-y-auto p-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="termos-titulo"
        className="bg-white rounded-2xl p-5 max-w-sm m-auto mt-10 space-y-3 text-sm text-gray-700"
        onClick={e => e.stopPropagation()}>
        <h2 id="termos-titulo" className="font-bold text-polo-navy">📋 Termos de uso e modo de uso</h2>
        <p><strong>Para quem é:</strong> cozinhas profissionais, centrais de produção e operações que
        controlam estoque e porcionamento interno da casa — pensado para o tablet da cozinha.</p>
        <p><strong>O que o sistema faz:</strong> recebimento (registro auxiliar), entradas de estoque,
        produção por ficha (baixa os ingredientes e dá entrada na porção/semiacabado), saídas para
        pontos internos (cozinha principal, outras unidades), aparas e perdas, inventário, etiquetas de validade,
        relatórios e múltiplos usuários com cargos (cozinha, gerência, diretoria).</p>
        <p><strong>O que NÃO é:</strong> não é PDV, caixa, cardápio ou pedido do cliente final,
        nem delivery de prato pronto, nem sistema financeiro/contábil.</p>
        <p><strong>Modo de uso:</strong> o estoque é organizado em <strong>itens porcionados e
        semiacabados</strong> — cada preparo (proteína porcionada, molho base, guarnição) é cadastrado
        e armazenado como um item independente, com sua própria ficha e validade. A montagem e a
        finalização dos pratos ocorrem no serviço e não fazem parte do controle deste sistema.</p>
        <p><strong>Demonstração:</strong> usa dados fictícios que ficam só no seu navegador — nada vai
        para a nuvem e tudo reseta ao sair.</p>
        <p><strong>Contas reais:</strong> cada restaurante é isolado dos demais. Detalhes de dados
        pessoais no link "Privacidade e proteção de dados".</p>
        <button onClick={onFechar} className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl">Entendi</button>
      </div>
    </div>
  );
}

// Resumo de privacidade (LGPD) — linguagem simples, sem juridiquês.
function ModalPrivacidade({ onFechar }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 overflow-y-auto p-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="priv-titulo"
        className="bg-white rounded-2xl p-5 max-w-sm m-auto mt-10 space-y-3 text-sm text-gray-700"
        onClick={e => e.stopPropagation()}>
        <h2 id="priv-titulo" className="font-bold text-polo-navy">🔒 Privacidade e proteção de dados</h2>
        <p><strong>Dados tratados:</strong> nome e e-mail dos usuários vinculados à conta e os registros
        operacionais do estabelecimento (estoque, produção, movimentações e trilha de auditoria).</p>
        <p><strong>Finalidade:</strong> os dados são tratados exclusivamente para a prestação do serviço
        contratado. Não há venda, cessão ou compartilhamento com terceiros para fins comerciais.</p>
        <p><strong>Armazenamento e segurança:</strong> os dados residem em infraestrutura de nuvem com
        criptografia em trânsito e isolamento por estabelecimento aplicado na camada do banco de dados —
        cada conta acessa somente os próprios registros. O acesso da equipe Aurum ocorre apenas mediante
        autorização expressa do cliente (Configurações → Sistema → Suporte remoto), limitado a 24 horas,
        no nível concedido — visualização ou edição — e revogável a qualquer momento.</p>
        <p><strong>Direitos do titular (LGPD):</strong> a conta permite exportar a íntegra dos dados a
        qualquer momento (Configurações → Sistema → Cópia de segurança). Solicitações de correção ou de
        exclusão definitiva da conta e dos dados podem ser feitas pelo canal oficial de atendimento
        (WhatsApp da Aurum) e são atendidas em até <strong>4 dias úteis</strong>.</p>
        <button onClick={onFechar} className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl">Entendi</button>
      </div>
    </div>
  );
}

function Msg({ erro, info }) {
  if (erro) return <p role="alert" className="text-xs text-red-500 font-semibold">{erro}</p>;
  if (info) return <p role="status" className="text-xs text-green-600 font-semibold">{info}</p>;
  return null;
}

// Traduz mensagens comuns do Supabase para português
function traduz(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Esse e-mail já tem conta. Use "Entrar".';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um momento e tente de novo.';
  if (m.includes('password')) return 'Senha inválida (mínimo 8 caracteres).';
  if (m.includes('network') || m.includes('fetch')) return 'Sem conexão com a internet.';
  return msg || 'Erro inesperado.';
}
