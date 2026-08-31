import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { PRODUTOS, TESTE_DIAS } from '../utils/assinatura';
import { validarCNPJ, formatarCNPJ, validarTelefone, formatarTelefone, soDigitos, UFS } from '../utils/documentos';
import { traduzErroAuth as traduz } from '../utils/erros';
import { TERMOS_VERSAO } from './Termos';

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


// Produto do link direto (?produto=etiquetas) — mesmo mecanismo do convite.
// É o link que o dono manda no WhatsApp depois da visita comercial: o cliente
// cai já na demonstração do plano certo, em vez de ver o app inteiro e depois
// descobrir que comprou outra coisa.
const produtoDaURL = (() => {
  try {
    const p = new URLSearchParams(window.location.search).get('produto') || '';
    return p === 'etiquetas' ? 'etiquetas' : '';
  } catch { return ''; }
})();

export default function Login() {
  const { login, esqueceuSenha, criarPrimeiroAdmin, reenviarConfirmacao, entrarDemo, erroDoLink } = useAuth();
  const [modo, setModo] = useState('entrar'); // entrar | novo | esqueci
  const [aceitouTermos, setAceitouTermos] = useState(false);
  // Produto escolhido no cadastro. O padrao e o ETIQUETAS: e o produto de
  // entrada, e quem quer o completo escolhe conscientemente. O link direto
  // (?produto=etiquetas) so confirma o padrao; quem chega sem parametro ve os
  // dois cartoes do mesmo jeito.
  // ⚠️ Nunca nasce no plano que ainda não se vende: um `?produto=completo` na
  // URL levaria ao cadastro com um plano que o próprio botão não oferece, e o
  // cadastro criaria a conta nele.
  const [produto, setProduto] = useState(
    PRODUTOS[produtoDaURL]?.emBreve || !produtoDaURL ? 'etiquetas' : produtoDaURL);
  const [carregando, setCarregando] = useState(false);
  // ⚠️ Link de e-mail que falhou (expirado, já usado) começa mostrado. Sem
  // isto o app abria a tela de entrada limpa, como se nada tivesse acontecido,
  // e a pessoa ficava clicando no mesmo link velho sem entender por que "não
  // faz nada".
  const [erro, setErro] = useState(erroDoLink || '');
  const [info, setInfo] = useState('');

  // campos
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [nomeRest, setNomeRest] = useState('');
  // Dados do estabelecimento (passo 1 do cadastro)
  const [cnpj, setCnpj] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('PE');
  // ⚠️ Um formulario de 8 campos numa tela so e onde se desiste. Passo 1 = o
  // ESTABELECIMENTO, passo 2 = o ACESSO. Sao decisoes de natureza diferente.
  const [passo, setPasso] = useState(1);
  // E-mail aguardando confirmação. Quando preenchido, a tela vira "confirme
  // seu e-mail" — não é erro, é o fluxo normal com a confirmação ligada.
  const [aguardandoEmail, setAguardandoEmail] = useState('');
  const [reenviando, setReenviando] = useState(false);
  // Captura de contato antes da demonstração
  const [querDemo, setQuerDemo] = useState(false);
  const [demoNome, setDemoNome] = useState('');
  const [demoFone, setDemoFone] = useState('');

  const limpar = () => { setErro(''); setInfo(''); };
  const trocar = (m) => { limpar(); setSenha(''); setPasso(1); setModo(m); };

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
    // ⚠️ Barra aqui pelo TAMANHO, não pela validade: quem digitou 12 dígitos
    // merece saber disso no campo, e não gastar uma das cinco tentativas.
    if (cnpj.replace(/\D/g, '').length !== 14) { setErro('Digite o CNPJ do restaurante (14 dígitos).'); return; }
    setCarregando(true);
    const err = await esqueceuSenha(email.trim(), cnpj);
    setCarregando(false);
    if (err) setErro(traduz(err));
    else setInfo('Enviamos um link para o seu e-mail. Confira a caixa de entrada e também o spam.');
  };

  // Passo 1 → 2. Barra aqui em vez de deixar descobrir no fim: quem digita
  // CNPJ errado tem que ver o erro no campo, não depois de criar a senha.
  const avancarPasso = () => {
    limpar();
    if (!nomeRest.trim()) { setErro('Digite o nome do restaurante.'); return; }
    if (!validarCNPJ(cnpj)) { setErro('CNPJ inválido. Confira os números.'); return; }
    if (!validarTelefone(whatsapp)) { setErro('WhatsApp inválido. Use DDD + número.'); return; }
    if (!cidade.trim()) { setErro('Digite a cidade.'); return; }
    setPasso(2);
  };

  const criarRestaurante = async () => {
    limpar();
    if (nome.trim().length < 2) { setErro('Digite seu nome.'); return; }
    if (!/.+@.+\..+/.test(email)) { setErro('Digite um e-mail válido.'); return; }
    if (senha.length < 8) { setErro('A senha deve ter pelo menos 8 caracteres.'); return; }
    if (!aceitouTermos) { setErro('Marque a confirmação acima para continuar.'); return; }
    setCarregando(true);
    const err = await criarPrimeiroAdmin({
      nome: nome.trim(), email: email.trim(), senha,
      nomeRestaurante: nomeRest.trim(), produto,
      // só dígitos: é assim que o banco guarda, e é o que faz o índice único
      // de CNPJ funcionar de verdade
      cnpj: soDigitos(cnpj), whatsapp: soDigitos(whatsapp),
      cidade: cidade.trim(), uf,
      termosVersao: TERMOS_VERSAO,
    });
    setCarregando(false);
    // ⚠️ Objeto (não string) = confirmação de e-mail ligada e o signUp não
    // devolveu sessão. NÃO é erro: a conta foi criada e falta só confirmar.
    if (err && typeof err === 'object' && err.confirmarEmail) {
      setAguardandoEmail(email.trim());
      return;
    }
    if (err) setErro(traduz(err));
  };

  // Abre a demonstração e avisa o dono pelo WhatsApp, na mesma ação.
  const abrirDemo = (produtoId) => {
    limpar();
    if (demoNome.trim().length < 2) { setErro('Digite seu nome.'); return; }
    if (!validarTelefone(demoFone)) { setErro('WhatsApp inválido. Use DDD + número.'); return; }
    const msg = encodeURIComponent(
      `Olá! Sou ${demoNome.trim()} e estou vendo a demonstração do ${PRODUTOS[produtoId].label}. ` +
      `Meu WhatsApp: ${demoFone}`);
    // ⚠️ Abre o WhatsApp ANTES de entrar na demo, ainda dentro do gesto do
    // toque: navegador de celular bloqueia window.open disparado depois. Se
    // ainda assim bloquear, a demo abre do mesmo jeito — o lead é bônus, não
    // pode virar barreira para conhecer o produto.
    try { window.open(`https://wa.me/5581998184489?text=${msg}`, '_blank', 'noopener,noreferrer'); } catch { /* bloqueado */ }
    entrarDemo(produtoId);
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
            {/* ⚠️ type="text", NÃO "email". Com type="email" o próprio navegador
                recusa um usuário como "chef.suacasa" antes de o app ver — e a
                pessoa travava numa mensagem do Chrome, não do sistema.
                autoComplete="username" cobre os dois casos.
                ⚠️ E SEM TEXTO DE APOIO ENTRE OS CAMPOS: o bloco usa espaçamento
                uniforme, então um parágrafo no meio ganhava a mesma folga de um
                campo e afastava a senha — parecia defeito de tela. */}
            <input type="text" autoComplete="username" aria-label="E-mail ou usuário"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="E-mail ou usuário" className={campo} />
            <CampoSenha valor={senha} onChange={setSenha} aria="Senha" autoComplete="current-password" placeholder="Senha" onEnter={entrar} />
            <Msg erro={erro} info={info} />
            <button onClick={entrar} disabled={carregando} className={botao}>{carregando ? 'Entrando…' : 'Entrar'}</button>
            <button onClick={() => trocar('esqueci')} className="w-full text-xs text-polo-navy/70 pt-1">Esqueci minha senha</button>
            <div className="border-t border-gray-100 pt-3 flex flex-col gap-1.5">
              
              <button onClick={() => trocar('novo')} className="text-xs text-gray-500">Cadastrar meu restaurante — <strong className="text-green-700">{TESTE_DIAS} dias grátis</strong> →</button>
            </div>
            {/* ⚠️ A DEMO PASSA A PEDIR CONTATO. Antes era aberta e quem
                olhava e ia embora não deixava rastro nenhum. Dois campos, sem
                verificação, e a demonstração abre em seguida — o contato chega
                pelo WhatsApp, que é o canal onde o dono já fecha venda.

                Não grava em tabela de propósito: a demo é pré-login, a escrita
                seria feita pelo papel `anon`, e isso exigiria a primeira RPC
                anônima além de convite_valido — que `auditar-supabase.mjs`
                recusa de propósito. Abrir essa porta por um lead criaria vetor
                de spam e enfraqueceria uma trava que custou duas migrações. */}
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide text-center">
                Conhecer o sistema
              </p>

              {!querDemo ? (
                <button onClick={() => { limpar(); setQuerDemo(true); }}
                  className="w-full border-2 border-polo-gold text-polo-navy font-bold py-3 rounded-xl text-sm active:scale-[0.98] transition-transform">
                  Ver demonstração
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-gray-600">
                    Só para sabermos com quem falamos — a demonstração abre em seguida.
                  </p>
                  <input type="text" aria-label="Seu nome" value={demoNome}
                    onChange={e => setDemoNome(e.target.value)}
                    placeholder="Seu nome" className={campo} />
                  <input type="tel" inputMode="numeric" aria-label="Seu WhatsApp" value={demoFone}
                    onChange={e => setDemoFone(formatarTelefone(e.target.value))}
                    placeholder="WhatsApp com DDD" className={campo} />
                  {/* ⚠️ A DEMONSTRAÇÃO ABRE OS DOIS, inclusive o que ainda não se
                      vende: ver funcionando é o que faz alguém esperar por ele.
                      O selo evita a promessa de que já dá para assinar. */}
                  {Object.values(PRODUTOS).map(p => (
                    <button key={p.id} onClick={() => abrirDemo(p.id)}
                      className="w-full text-left rounded-xl p-3 border-2 border-gray-200 active:scale-[0.99] transition-transform">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-polo-navy">{p.label}</span>
                        <span className="text-xs font-bold text-polo-navy flex-shrink-0">
                          {p.emBreve
                            ? <span className="text-gray-600 bg-gray-200 rounded-full px-2 py-0.5">em breve</span>
                            : <>R$ {p.precoMes}<span className="font-normal text-gray-500">/mês</span></>}
                        </span>
                      </span>
                      <span className="block text-[11px] text-gray-600 mt-0.5">{p.resumo}</span>
                    </button>
                  ))}
                  <Msg erro={erro} info={info} />
                  <button onClick={() => { limpar(); setQuerDemo(false); }}
                    className="w-full text-xs text-gray-500">Cancelar</button>
                </div>
              )}
              <p className="text-[11px] text-gray-600 text-center">
                Restaurante de exemplo. Nada é salvo: os dados voltam ao início quando você sair.
              </p>
            </div>
          </>}

          {/* ESQUECI SENHA */}
          {modo === 'esqueci' && <>
            <h2 className="font-bold text-polo-navy">Recuperar senha</h2>
            <p className="text-xs text-gray-500">
              Confirme os dois dados do cadastro. O link vai para o e-mail do responsável pelo restaurante.
            </p>
            <input type="email" aria-label="E-mail" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" className={campo} />
            <input type="text" inputMode="numeric" aria-label="CNPJ do restaurante" value={cnpj}
              onChange={e => setCnpj(formatarCNPJ(e.target.value))}
              placeholder="CNPJ do restaurante" className={campo} />
            {/* ⚠️ Quem tem conta de equipe precisa saber AQUI que este caminho
                não é dele — o endereço interno dessas contas não tem caixa de
                entrada, e o link nunca chegaria. */}
            <p className="text-[11px] text-white/60 -mt-1">
              Conta de funcionário não recupera por aqui: quem troca a senha dela é o dono, em Administração.
            </p>
            <Msg erro={erro} info={info} />
            <button onClick={recuperar} disabled={carregando} className={botao}>{carregando ? 'Enviando…' : 'Enviar link'}</button>
            <button onClick={() => trocar('entrar')} className="w-full text-xs text-gray-500 pt-1">← Voltar</button>
          </>}

          {/* ⚠️ O CADASTRO POR CÓDIGO DE CONVITE SAIU DAQUI. Quem coloca gente
              para dentro agora é o dono, em Administração → Contas da equipe:
              ele cria o acesso e entrega. O convite obrigava cada pessoa a ter
              e-mail próprio e escolher a própria senha — e deixava o dono sem
              como socorrer quem esquecesse. Link antigo com ?convite= cai na
              tela de entrada normal, que é o que existe. */}

          {/* CONFIRME SEU E-MAIL — some quando a confirmação está desligada,
              porque aí o signUp devolve sessão e a pessoa já entra. */}
          {modo === 'novo' && aguardandoEmail && <>
            <h2 className="font-bold text-polo-navy">Confirme seu e-mail</h2>
            <p className="text-sm text-gray-700">
              Mandamos um link para <strong className="text-polo-navy">{aguardandoEmail}</strong>.
              Toque nele para ativar a conta e entrar.
            </p>
            <p className="text-[11px] text-gray-600">
              Não chegou em alguns minutos? Confira o <strong>spam</strong> ou a aba de promoções.
            </p>
            <Msg erro={erro} info={info} />
            <button disabled={reenviando} className={botao}
              onClick={async () => {
                limpar(); setReenviando(true);
                const e = await reenviarConfirmacao(aguardandoEmail);
                setReenviando(false);
                if (e) setErro(traduz(e));
                else setInfo('Link reenviado. Confira sua caixa de entrada.');
              }}>
              {reenviando ? 'Reenviando…' : 'Reenviar link'}
            </button>
            <button onClick={() => { setAguardandoEmail(''); trocar('entrar'); }}
              className="w-full text-xs text-gray-500 pt-1">Já confirmei — ir para o login</button>
          </>}

          {/* NOVO RESTAURANTE */}
          {modo === 'novo' && !aguardandoEmail && <>
            <h2 className="font-bold text-polo-navy">Cadastrar restaurante</h2>

            {/* ⚠️ A escolha do produto vem ANTES dos campos, e é decisão do
                cliente — não algo que se descobre no dia 8. Nascer tudo como
                etiquetas quebraria quem quer o completo; nascer tudo completo
                e rebaixar depois é pior: a pessoa passa o teste conhecendo
                telas que vai perder, e isso é a sensação de produto capado. */}
            <div className="space-y-2">
              {/* ⚠️ O COMPLETO APARECE MAS NÃO SE ESCOLHE. Ele existe e funciona,
                  mas está em teste — vender agora é assumir suporte de um app
                  que ainda vai mudar de forma. Escondê-lo seria pior: quem já
                  ouviu falar acharia que sumiu, e some também a chance de dizer
                  "já já tem". Fica visível, cinza, com "em breve". */}
              {Object.values(PRODUTOS).map(p => {
                const sel = produto === p.id;
                if (p.emBreve) {
                  return (
                    <div key={p.id} aria-disabled="true"
                      className="w-full text-left rounded-xl p-3 border-2 border-gray-200 bg-gray-50 opacity-70">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-gray-600">{p.label}</span>
                        <span className="text-[11px] font-bold text-gray-600 bg-gray-200 rounded-full px-2 py-0.5 flex-shrink-0">
                          em breve
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 mt-0.5">{p.resumo}</p>
                    </div>
                  );
                }
                return (
                  <button key={p.id} type="button" onClick={() => setProduto(p.id)}
                    aria-pressed={sel}
                    className={`w-full text-left rounded-xl p-3 border-2 transition-colors
                      ${sel ? 'border-polo-gold bg-polo-beige' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-polo-navy">{p.label}</span>
                      <span className="text-sm font-bold text-polo-navy flex-shrink-0">R$ {p.precoMes}<span className="text-[11px] font-normal text-gray-500">/mês</span></span>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5">{p.resumo}</p>
                  </button>
                );
              })}
            </div>

            {/* Sem "com tudo liberado" no plano menor: ali seria promessa falsa. */}
            <p className="text-xs font-semibold text-green-700">
              {TESTE_DIAS} dias grátis{produto === 'completo' ? ' com tudo liberado' : ''} · depois R$ {PRODUTOS[produto].precoMes}/mês para continuar.
            </p>
            <p className="text-[11px] text-gray-600 -mt-1">
              Dá para trocar de plano depois — é só falar com a equipe. Nada do que você cadastrar se perde.
            </p>
            {/* Onde estou nos dois passos */}
            <div className="flex items-center gap-2 pt-1">
              {[1, 2].map(n => (
                <div key={n} className={`h-1.5 flex-1 rounded-full transition-colors
                  ${passo >= n ? 'bg-polo-gold' : 'bg-gray-200'}`} />
              ))}
              <span className="text-[11px] text-gray-500 flex-shrink-0">{passo} de 2</span>
            </div>

            {passo === 1 ? <>
              <p className="text-xs font-semibold text-polo-navy">Sobre o restaurante</p>
              <input type="text" aria-label="Nome do restaurante" value={nomeRest}
                onChange={e => setNomeRest(e.target.value)}
                placeholder="Nome do restaurante" className={campo} />

              {/* ⚠️ O CNPJ é a trava do teste grátis (índice único, migração
                  28) e alimenta o rodapé da etiqueta. Máscara enquanto digita
                  para o número ficar conferível a olho. */}
              <input type="text" inputMode="numeric" aria-label="CNPJ" value={cnpj}
                onChange={e => setCnpj(formatarCNPJ(e.target.value))}
                placeholder="CNPJ (00.000.000/0001-00)" className={campo} />

              <input type="tel" inputMode="numeric" aria-label="WhatsApp" value={whatsapp}
                onChange={e => setWhatsapp(formatarTelefone(e.target.value))}
                placeholder="WhatsApp com DDD" className={campo} />
              <p className="text-[11px] text-gray-600 -mt-1">
                É por aqui que a equipe confirma o pagamento e ativa a assinatura.
              </p>

              {/* ⚠️ A LARGURA VEM DO `style`, NÃO DE UMA CLASSE, e isso é o
                  conserto de um defeito visível: `campo` já traz `w-full`, e
                  somar `w-24` não sobrescreve — o Tailwind decide pela ORDEM em
                  que gera o CSS, e ali `w-full` vence. Resultado medido no
                  navegador: o campo de cidade ficava com 34 px e o seletor de
                  estado com 294. Era impossível digitar a cidade.
                  `minWidth: 0` é a outra metade: item de flex não encolhe
                  abaixo do conteúdo sem isso, e a linha voltaria a estourar. */}
              <div className="flex gap-2">
                <input type="text" aria-label="Cidade" value={cidade}
                  onChange={e => setCidade(e.target.value)}
                  placeholder="Cidade" className={campo} style={{ flex: '1 1 auto', minWidth: 0 }} />
                <select aria-label="Estado" value={uf} onChange={e => setUf(e.target.value)}
                  className={`${campo} bg-white`} style={{ flex: '0 0 5.5rem', width: '5.5rem' }}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <p className="text-[11px] text-gray-600 -mt-1">
                A norma sanitária muda de estado para estado — é o que nos deixa orientar você
                com a regra que vale aí.
              </p>

              <Msg erro={erro} info={info} />
              <button onClick={avancarPasso} className={botao}>Continuar</button>
            </> : <>
              <p className="text-xs font-semibold text-polo-navy">Seu acesso</p>
              <p className="text-[11px] text-gray-600 -mt-1">
                Você será o administrador (Diretoria — acesso total).
              </p>
              <input type="text" aria-label="Seu nome" value={nome}
                onChange={e => setNome(e.target.value)} placeholder="Seu nome" className={campo} />
              <input type="email" aria-label="Seu e-mail" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="Seu e-mail" className={campo} />
              <CampoSenha valor={senha} onChange={setSenha} aria="Senha (mínimo 8 caracteres)"
                autoComplete="new-password" placeholder="Crie uma senha (mín. 8)" />
              <p className="text-[11px] text-gray-600 -mt-1">
                Use um e-mail que só você controla — quem tiver acesso a ele pode recuperar a senha.
              </p>
              <label className="flex items-start gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={aceitouTermos}
                  onChange={e => setAceitouTermos(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-[#1B2A41] flex-shrink-0" />
                <span>
                  {/* ⚠️ ABRE EM OUTRA ABA, e não é preferência: com <Link> o
                      React Router troca de rota, esta tela é DESMONTADA e todo
                      o cadastro digitado — restaurante, CNPJ, WhatsApp, cidade,
                      nome, e-mail, senha — se perde. Quem foi conferir o que
                      estava aceitando voltava para um formulário em branco.
                      Justo quem lê os termos era punido por lê-los. */}
                  Li e aceito os{' '}
                  <a href={`${import.meta.env.BASE_URL}termos`} target="_blank" rel="noopener noreferrer"
                    className="underline underline-offset-2 text-polo-navy font-semibold">
                    Termos de Uso
                  </a>{' '}
                  (versão {TERMOS_VERSAO}), incluindo que o sistema imprime a etiqueta com os dados
                  que eu cadastrar e <strong>não substitui a definição de validade pelo responsável
                  técnico</strong> do meu estabelecimento.
                </span>
              </label>
              <Msg erro={erro} info={info} />
              <button onClick={criarRestaurante} disabled={carregando} className={botao}>
                {carregando ? 'Criando…' : 'Criar e entrar'}
              </button>
              <button onClick={() => { limpar(); setPasso(1); }}
                className="w-full text-xs text-gray-500 pt-1">← Voltar aos dados do restaurante</button>
            </>}

            <button onClick={() => trocar('entrar')} className="w-full text-xs text-gray-500 pt-1">← Voltar</button>
          </>}
        </div>

        <div className="flex items-center justify-center gap-4 mt-4">
          {/* Um link só: a privacidade virou a Parte II do mesmo documento. */}
          <Link to="/termos" className="text-[11px] text-white/70 underline underline-offset-2">
            Termos de uso e privacidade
          </Link>
        </div>
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

