import { useState, useEffect, useRef } from 'react';
import { useOperador } from '../store/OperadorContext';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { DIGITOS } from '../utils/senhaEquipe';
import { DEMO_COM_SENHA } from '../data/demo';
import Aviso from './Aviso';
import Icon from './Icons';

// =====================================================================
//  "QUEM VAI IMPRIMIR?" (13/10/2026, pedido do dono, no jeito da Suflex)
//
//  A tela de Etiquetas abre aqui: um botão grande por nome da equipe. Quem
//  não tem senha entra com um toque; quem tem vê o teclado de 4 números. A
//  mesma grade aparece DENTRO da janela de imprimir quando ela é aberta por
//  outro caminho (Entradas, Produção) sem ninguém escolhido.
// =====================================================================

const segundos = (ms) => Math.max(1, Math.ceil(ms / 1000));

// O teclado de 4 números. Confere sozinho no 4º número — sem botão "OK",
// que seria um toque a mais a cada etiqueta.
export function TecladoSenha({ nome, aoVoltar }) {
  const { tentarSenha, travaDe } = useOperador();
  const { sessao } = useAuth();
  const [pin, setPin] = useState('');
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState('');
  // ⚠️ O RELÓGIO É ESTADO, não Date.now() no desenho: a contagem da espera
  // repinta a cada segundo, e depois de cada tentativa ele é acertado (com
  // um relógio velho, a trava recém-criada pareceria longa demais e seria
  // descartada pela proteção contra relógio adulterado).
  const [agora, setAgora] = useState(() => Date.now());
  const campoRef = useRef(null);
  const trava = travaDe(nome, agora);

  useEffect(() => {
    if (!trava.travado) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [trava.travado]);

  // ⚠️ SÓ COM MOUSE: no celular, focar o campo abriria o teclado do sistema
  // por cima do teclado grande desta tela. No computador, o foco deixa
  // digitar os números direto.
  useEffect(() => {
    try { if (window.matchMedia?.('(pointer: fine)').matches) campoRef.current?.focus(); } catch { /* sem matchMedia */ }
  }, []);

  const conferir = async (completo) => {
    setConferindo(true);
    const r = await tentarSenha(nome, completo);
    setConferindo(false);
    if (r.ok) return; // a tela troca sozinha: o operador mudou
    setPin('');
    // a hora vem da tentativa (o relógio do desenho é estado — ver `agora`)
    if (r.em) setAgora(r.em);
    if (r.semCripto) { setErro('Este aparelho não consegue conferir a senha. Abra o app pelo endereço com https.'); return; }
    if (r.travado) { setErro(''); return; }
    setErro(`Senha errada. ${r.restam === 1 ? 'Resta 1 tentativa' : `Restam ${r.restam} tentativas`} antes de esperar 1 minuto.`);
  };

  const digitar = (d) => {
    if (conferindo || trava.travado) return;
    const novo = (pin + d).replace(/\D/g, '').slice(0, DIGITOS);
    setPin(novo);
    setErro('');
    if (novo.length === DIGITOS) conferir(novo);
  };
  const apagar = () => { if (!conferindo) setPin(p => p.slice(0, -1)); };
  const limpar = () => { if (!conferindo) setPin(''); };

  const bloqueado = conferindo || trava.travado;
  const tecla = 'min-h-14 rounded-xl font-bold active:scale-95 transition-transform disabled:opacity-40';
  const numero = `${tecla} text-xl bg-white border-2 border-polo-navy/15 text-polo-navy`;
  const acao = `${tecla} text-sm bg-gray-100 text-gray-700`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-polo-navy">Senha de {nome}</p>
        <button type="button" onClick={aoVoltar}
          className="min-h-11 px-3 rounded-lg text-xs font-semibold text-polo-navy border border-gray-200 bg-white">
          Voltar aos nomes
        </button>
      </div>
      {/* o campo de verdade, escondido: leitor de tela e teclado físico */}
      <input aria-label={`Senha de ${nome}`} ref={campoRef} type="password" inputMode="numeric" autoComplete="off"
        maxLength={DIGITOS} value={pin} disabled={bloqueado} className="sr-only"
        onChange={e => {
          const v = e.target.value.replace(/\D/g, '').slice(0, DIGITOS);
          setPin(v); setErro('');
          if (v.length === DIGITOS) conferir(v);
        }} />
      <div className="flex justify-center gap-3" aria-hidden="true">
        {Array.from({ length: DIGITOS }, (_, i) => (
          <span key={i} className={`w-4 h-4 rounded-full border-2 border-polo-navy ${i < pin.length ? 'bg-polo-navy' : ''}`} />
        ))}
      </div>
      {conferindo && <p className="text-center text-xs text-gray-600">Conferindo…</p>}
      {trava.travado && (
        <Aviso tom="atencao">Muitas tentativas erradas. Espere {segundos(trava.esperaMs)} segundos para tentar de novo.</Aviso>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} type="button" onClick={() => digitar(d)} disabled={bloqueado} className={numero}>{d}</button>
        ))}
        <button type="button" onClick={limpar} disabled={bloqueado} className={acao}>Limpar</button>
        <button type="button" onClick={() => digitar('0')} disabled={bloqueado} className={numero}>0</button>
        <button type="button" onClick={apagar} disabled={bloqueado} className={acao}>Apagar</button>
      </div>
      {/* ⚠️ SÓ NA DEMONSTRAÇÃO: numa conta de verdade, a senha é do dono e
          da pessoa, e a tela nunca dá dica. */}
      {sessao?.demo && nome === DEMO_COM_SENHA.nome && (
        <p className="text-center text-xs text-gray-600">Na demonstração, a senha de {nome} é {DEMO_COM_SENHA.senha}.</p>
      )}
      <p className="text-center text-xs text-gray-600">Esqueceu a senha? Quem administra a conta troca em Administração.</p>
    </div>
  );
}

// A grade de nomes. `dentroDaJanela` deixa o texto mais curto (a janela de
// imprimir já tem muita coisa).
export default function QuemImprime({ dentroDaJanela = false }) {
  const { pessoas } = useApp();
  const { entrar, temSenha } = useOperador();
  const [comSenha, setComSenha] = useState('');

  if (comSenha && pessoas.includes(comSenha)) {
    return (
      <section aria-label="Senha" className={dentroDaJanela ? 'border-2 border-polo-navy/20 rounded-xl p-3' : 'bg-white rounded-xl p-4'}>
        <TecladoSenha nome={comSenha} aoVoltar={() => setComSenha('')} />
      </section>
    );
  }

  const tocar = (nome) => {
    if (temSenha(nome)) setComSenha(nome);
    else entrar(nome);
  };

  return (
    <section aria-labelledby="quem-imprime-titulo"
      className={dentroDaJanela ? 'border-2 border-polo-navy/20 rounded-xl p-3 space-y-2' : 'space-y-3'}>
      <div className={dentroDaJanela ? '' : 'px-1'}>
        <h2 id="quem-imprime-titulo" className={`${dentroDaJanela ? 'text-sm' : 'text-base'} font-bold text-polo-navy`}>Quem vai imprimir?</h2>
        <p className="text-xs text-gray-600 mt-0.5">
          {dentroDaJanela
            ? 'Toque no seu nome para assinar estas etiquetas.'
            : 'Toque no seu nome. A etiqueta sai assinada por você.'}
        </p>
      </div>
      <div className={`grid gap-2 ${dentroDaJanela ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {pessoas.map(p => (
          <button key={p} type="button" onClick={() => tocar(p)}
            className={`${dentroDaJanela ? 'min-h-12' : 'min-h-16'} bg-white border-2 border-polo-navy/15 rounded-xl px-3 py-2
                       text-left active:scale-95 transition-transform flex items-center justify-between gap-2`}>
            <span className="text-sm font-bold text-polo-navy leading-tight line-clamp-2 break-words min-w-0">{p}</span>
            {temSenha(p) && (
              <span className="flex-shrink-0 text-polo-navy/70">
                <Icon name="cadeado" size={16} />
                <span className="sr-only"> (com senha)</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

// "Imprimindo como Maria · Trocar" — acima da busca, na tela de Etiquetas.
export function FaixaOperador() {
  const { operador, trocar } = useOperador();
  if (!operador) return null;
  return (
    <div className="flex items-center justify-between gap-2 bg-polo-navy text-white rounded-xl pl-4 pr-1.5 py-1.5">
      <p className="text-sm min-w-0 truncate">Imprimindo como <strong className="text-polo-gold">{operador}</strong></p>
      <button type="button" onClick={trocar}
        className="min-h-11 px-4 rounded-lg bg-white/10 text-white text-xs font-bold flex-shrink-0">
        Trocar
      </button>
    </div>
  );
}
