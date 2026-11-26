import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Layout from './Layout';
import Aviso from './Aviso';
import Icon from './Icons';
import Dialogo from './Dialogo';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import {
  MIN_DIGITOS_ADM, MAX_DIGITOS_ADM, MINUTOS_PARADA_ADM, SENHA_DA_DEMO, textoDaRecusa, senhaAdmValida,
} from '../utils/senhaAdministracao';

// =====================================================================
//  A SENHA DA ADMINISTRAÇÃO NA TELA (23/11/2026, jeito do Magurō)
//
//  A Administração e os relatórios mostram ESTA tela até alguém digitar a
//  senha — em qualquer aparelho, o celular do dono também (Meus itens ficou
//  livre em 24/11/2026, pedido do dono). Ela tem
//  de 4 a 8 números (o dono quis poder usar mais que 4), então o teclado
//  tem a tecla Entrar em vez de conferir sozinho no último número.
//  O porquê do resto está em utils/senhaAdministracao.js.
// =====================================================================

/** O teclado grande, para senha de tamanho livre (entre `min` e `max` números). */
export function TecladoVariavel({
  titulo, subtitulo = '', rotuloCampo, min = MIN_DIGITOS_ADM, max = MAX_DIGITOS_ADM,
  textoBotao = 'Entrar', aoEnviar, aviso = '', avisoTom = 'neutro', rodape = null, cadeado = false,
}) {
  const [pin, setPin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const campoRef = useRef(null);
  const vivo = useRef(true);
  // ⚠️ LIGA DE NOVO AO MONTAR (auditoria 24/11/2026): só desligar na saída
  // deixava `vivo` falso para sempre no modo de desenvolvimento (o React monta,
  // desmonta e monta de novo) — senha errada travava em "Conferindo…"
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  // ⚠️ SÓ COM MOUSE: no celular, focar o campo abriria o teclado do sistema
  // por cima deste. No computador, dá para digitar os números direto.
  useEffect(() => {
    try { if (window.matchMedia?.('(pointer: fine)').matches) campoRef.current?.focus(); } catch { /* sem matchMedia */ }
  }, []);

  const mudar = (novo) => {
    if (enviando) return;
    setPin(String(novo).replace(/\D/g, '').slice(0, max));
    setErro('');
  };
  const enviar = async () => {
    if (enviando || pin.length < min) return;
    setEnviando(true);
    let msg;
    try { msg = (await aoEnviar(pin)) || ''; }
    catch (e) { msg = e?.message || 'Algo deu errado. Tente de novo.'; }
    // deu certo: quem chamou troca de tela (este teclado some)
    if (!vivo.current) return;
    setEnviando(false);
    setPin('');
    setErro(msg);
  };

  // ⚠️ REDESIGN (25/11/2026): teclas de 72 px (64 no celular), borda na cor de
  // linha; "Apagar" tracejado; "Entrar" desligado em bege escuro legível. As
  // bolinhas acompanham o que foi digitado (a senha tem de 4 a 8 números).
  const numero = 'h-16 sm:h-[4.5rem] text-3xl rounded-2xl font-black bg-white border-2 border-polo-linha text-polo-navy active:scale-95 transition-transform disabled:opacity-40';
  const acao = 'h-16 sm:h-[4.5rem] rounded-2xl font-bold text-base active:scale-95 transition-transform';
  const pontos = Math.max(min, pin.length);

  return (
    <div className="space-y-4">
      <div className={cadeado ? 'text-center' : ''}>
        {cadeado && (
          <span aria-hidden="true" className="mx-auto mb-2 w-16 h-16 rounded-full bg-polo-navy text-polo-gold flex items-center justify-center">
            <Icon name="cadeado" size={28} />
          </span>
        )}
        <h2 className="text-lg sm:text-xl font-titulo font-black uppercase tracking-wide text-polo-navy leading-tight">{titulo}</h2>
        {subtitulo && <p className="text-sm text-polo-tinta mt-1">{subtitulo}</p>}
      </div>
      {/* o campo de verdade, escondido: leitor de tela e teclado físico (Enter envia) */}
      <input aria-label={rotuloCampo} ref={campoRef} type="password" inputMode="numeric" autoComplete="off"
        maxLength={max} value={pin} disabled={enviando} className="sr-only"
        onChange={e => mudar(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } }} />
      <div className="flex justify-center gap-3 min-h-5" aria-hidden="true">
        {Array.from({ length: pontos }, (_, i) => (
          <span key={i} className={`w-5 h-5 rounded-full border-[3px] border-polo-navy ${i < pin.length ? 'bg-polo-navy' : 'bg-white'}`} />
        ))}
      </div>
      {enviando && <p className="text-center text-sm text-gray-600">Conferindo…</p>}
      {aviso && <Aviso tom={avisoTom}>{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-sm mx-auto">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} type="button" onClick={() => mudar(pin + d)} disabled={enviando || pin.length >= max} className={numero}>{d}</button>
        ))}
        <button type="button" onClick={() => mudar(pin.slice(0, -1))} disabled={enviando || !pin}
          className={`${acao} bg-white border-2 border-dashed border-polo-linha text-polo-navy disabled:opacity-40`}>Apagar</button>
        <button type="button" onClick={() => mudar(pin + '0')} disabled={enviando || pin.length >= max} className={numero}>0</button>
        <button type="button" onClick={enviar} disabled={enviando || pin.length < min}
          className={`${acao} font-black bg-polo-navy text-polo-gold disabled:bg-polo-desligado disabled:text-polo-desligado-tinta`}>{textoBotao}</button>
      </div>
      {rodape}
    </div>
  );
}

/**
 * A tela travada: pede a senha da Administração. Também cria a primeira senha
 * e resolve o "esqueci" — os dois pela senha do LOGIN da conta dona.
 */
export default function SenhaDaAdministracao() {
  const { sessao, abrirAdministracao, temSenhaAdministracao, confirmarSenhaDoLogin, definirSenhaAdministracao } = useAuth();
  const demo = !!sessao?.demo;
  const [fase, setFase] = useState(() => (temSenhaAdministracao === false ? 'login' : 'senha')); // senha | login | criar1 | criar2
  const [primeira, setPrimeira] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  const [conferindo, setConferindo] = useState(false);
  const [erroLogin, setErroLogin] = useState('');
  // a conta não tinha senha e o servidor só contou agora
  const semSenha = temSenhaAdministracao === false;
  const faseVista = fase === 'senha' && semSenha ? 'login' : fase;

  const entrar = async (pin) => {
    const r = await abrirAdministracao(pin);
    if (r?.ok) return '';
    if (r?.motivo === 'sem_senha') { setFase('login'); return ''; }
    return textoDaRecusa(r);
  };

  const confirmarLogin = async (e) => {
    e.preventDefault();
    if (!senhaLogin || conferindo) return;
    setConferindo(true);
    const erro = await confirmarSenhaDoLogin(senhaLogin);
    setConferindo(false);
    setSenhaLogin('');
    if (erro) { setErroLogin(erro); return; }
    setErroLogin('');
    setFase('criar1');
  };

  if (faseVista === 'login') {
    return (
      <div className="cartao space-y-3">
        <h2 className="text-lg font-titulo font-black uppercase tracking-wide text-polo-navy">
          {semSenha ? 'Criar a senha da Administração' : 'Esqueci a senha da Administração'}
        </h2>
        <p className="text-sm text-gray-700">
          {semSenha
            ? 'Esta conta ainda não tem senha da Administração. Para criar, confirme a senha do login — a que se usa para entrar no app.'
            : 'Para criar uma senha nova, confirme a senha do login desta conta — a que se usa para entrar no app.'}
        </p>
        <form onSubmit={confirmarLogin} className="space-y-3">
          <div>
            <label htmlFor="adm-senha-login" className="rotulo">Senha do login</label>
            <input id="adm-senha-login" type="password" autoComplete="current-password" value={senhaLogin}
              onChange={e => { setSenhaLogin(e.target.value); setErroLogin(''); }} className="campo" disabled={demo} />
          </div>
          {erroLogin && <Aviso tom="erro">{erroLogin}</Aviso>}
          <div className="flex gap-3">
            {!semSenha && (
              <button type="button" onClick={() => { setFase('senha'); setErroLogin(''); }}
                className="flex-1 min-h-14 border-2 border-polo-navy/20 bg-white text-polo-navy font-bold text-base rounded-2xl">
                Voltar
              </button>
            )}
            <button type="submit" disabled={!senhaLogin || conferindo || demo}
              className="flex-[1.4] min-h-14 bg-polo-navy text-polo-gold font-black text-base rounded-2xl disabled:opacity-40">
              {conferindo ? 'Conferindo…' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (faseVista === 'criar1' || faseVista === 'criar2') {
    return (
      <div className="cartao">
        <TecladoVariavel key={faseVista}
          titulo={faseVista === 'criar1' ? 'Crie a senha da Administração' : 'Repita a senha'}
          subtitulo={faseVista === 'criar1' ? `De ${MIN_DIGITOS_ADM} a ${MAX_DIGITOS_ADM} números. Ela abre a Administração em qualquer aparelho.` : ''}
          rotuloCampo={faseVista === 'criar1' ? 'Senha nova da Administração' : 'Repita a senha nova da Administração'}
          textoBotao={faseVista === 'criar1' ? 'Continuar' : 'Salvar'}
          aoEnviar={async (pin) => {
            if (faseVista === 'criar1') { setPrimeira(pin); setFase('criar2'); return ''; }
            if (pin !== primeira) { setPrimeira(''); setFase('criar1'); return 'As duas não ficaram iguais. Crie de novo.'; }
            const erro = await definirSenhaAdministracao(pin);
            if (erro) return erro;
            const r = await abrirAdministracao(pin);
            return r?.ok ? '' : textoDaRecusa(r);
          }} />
      </div>
    );
  }

  return (
    <div className="cartao max-w-md mx-auto">
      <TecladoVariavel cadeado
        titulo="Senha da Administração"
        subtitulo={`Fecha sozinha com ${MINUTOS_PARADA_ADM} minutos sem uso.`}
        rotuloCampo="Senha da Administração"
        aviso={demo ? `Na demonstração, a senha é ${SENHA_DA_DEMO}.` : ''}
        aoEnviar={entrar}
        rodape={!demo && (
          <button type="button" onClick={() => setFase('login')}
            className="w-full min-h-12 text-sm font-bold text-polo-navy underline underline-offset-2">
            Esqueci a senha
          </button>
        )} />
    </div>
  );
}

/**
 * Para as rotas da Administração: com a senha dada (`liberado`), a tela; sem
 * ela, a senha. Banco sem a M62 (sem senha nenhuma): volta ao início, como
 * a trava antiga fazia.
 */
export function ComSenha({ liberado, titulo = 'Administração', children }) {
  const { administracaoComSenha } = useAuth();
  if (liberado) return children;
  if (!administracaoComSenha) return <Navigate to="/" replace />;
  return (
    <Layout title={titulo}>
      <SenhaDaAdministracao />
    </Layout>
  );
}

/** Administração → Equipe: trocar a senha da Administração (com ela aberta). */
export function CartaoSenhaDaAdministracao() {
  const { sessao, administracaoComSenha, definirSenhaAdministracao } = useAuth();
  const { toast } = useUI();
  const [fase, setFase] = useState(null); // null | 'nova' | 'repetir'
  const [nova, setNova] = useState('');
  if (!administracaoComSenha) return null; // banco sem a M62: não há senha para trocar
  const fechar = () => { setFase(null); setNova(''); };
  return (
    <div className="cartao space-y-3">
      <div>
        <h2 className="text-sm font-bold text-polo-navy">Senha da Administração</h2>
        <p className="text-xs text-gray-600 mt-0.5">
          De {MIN_DIGITOS_ADM} a {MAX_DIGITOS_ADM} números. Abre a Administração em qualquer aparelho e fecha
          sozinha com {MINUTOS_PARADA_ADM} minutos sem uso.
        </p>
        {sessao?.demo && (
          <p className="text-xs text-gray-600 mt-1">Na demonstração ela começa {SENHA_DA_DEMO} e vale só neste aparelho.</p>
        )}
      </div>
      <button type="button" onClick={() => setFase('nova')}
        className="w-full min-h-12 rounded-xl border-2 border-polo-navy/20 bg-white text-sm font-bold text-polo-navy">
        Trocar a senha da Administração
      </button>
      {fase && (
        <Dialogo titulo="Senha da Administração" aoFechar={fechar} forma="caixa" largura="sm" respiro="p5">
          <TecladoVariavel key={fase}
            titulo={fase === 'nova' ? 'Digite a senha nova' : 'Repita a senha nova'}
            subtitulo={fase === 'nova' ? `De ${MIN_DIGITOS_ADM} a ${MAX_DIGITOS_ADM} números.` : ''}
            rotuloCampo={fase === 'nova' ? 'Senha nova da Administração' : 'Repita a senha nova da Administração'}
            textoBotao={fase === 'nova' ? 'Continuar' : 'Salvar'}
            aoEnviar={async (pin) => {
              if (fase === 'nova') {
                if (!senhaAdmValida(pin)) return `De ${MIN_DIGITOS_ADM} a ${MAX_DIGITOS_ADM} números.`;
                setNova(pin); setFase('repetir'); return '';
              }
              if (pin !== nova) { setNova(''); setFase('nova'); return 'As duas não ficaram iguais. Digite de novo.'; }
              const erro = await definirSenhaAdministracao(pin);
              if (erro) return erro;
              fechar();
              toast('Senha da Administração trocada. Vale em todos os aparelhos.', 'sucesso');
              return '';
            }} />
        </Dialogo>
      )}
    </div>
  );
}
