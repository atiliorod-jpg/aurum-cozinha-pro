import { useState, useEffect, useRef, useId, useCallback } from 'react';
import { useOperador } from '../store/OperadorContext';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { DIGITOS } from '../utils/senhaEquipe';
import { casaBusca, normalizarBusca } from '../utils/busca';
import { textoDaFalhaDeRede } from '../utils/conexao';
import { useAtualizarQuandoParado } from '../utils/atualizarApp';
import { DEMO_COM_SENHA } from '../data/demo';
import Aviso from './Aviso';
import Icon from './Icons';
import Dialogo from './Dialogo';

// =====================================================================
//  "QUEM VAI IMPRIMIR?" (13/10/2026, pedido do dono, no jeito da Suflex)
//
//  A tela de Etiquetas abre aqui: um cartão grande por nome da equipe. A
//  mesma grade aparece DENTRO da janela de imprimir quando ela é aberta por
//  outro caminho (Entradas, Produção), e nos lançamentos do Pro ("Quem está
//  registrando?").
//
//  ⚠️ DESDE 23/11/2026, NO JEITO DO MAGURŌ (pedido do dono):
//  • a senha é OBRIGATÓRIA e tem 2 números;
//  • no primeiro toque no nome ("1º acesso"), a pessoa CRIA a sua senha e
//    repete para confirmar; dali em diante, digita;
//  • esqueceu? Quem administra a conta ZERA em Administração, e ela cria
//    outra no próximo toque;
//  • cartões maiores, com a inicial; com mais de 12 nomes, busca e letras;
//  • versão nova do app: recarrega sozinho aqui, com a tela parada.
// =====================================================================

const segundos = (ms) => Math.max(1, Math.ceil(ms / 1000));
const inicialDe = (nome) => normalizarBusca(String(nome || '').trim().charAt(0)).toUpperCase() || '?';
// mais nomes que isto: aparecem a busca e as letras
export const NOMES_SEM_BUSCA = 12;
const PARADO_LIMPA_BUSCA_MS = 60_000;

// Roda `acao` depois de `ms` sem ninguém tocar na tela, enquanto `ativo`.
function useQuandoParado(ativo, ms, acao) {
  useEffect(() => {
    if (!ativo) return undefined;
    let t = setTimeout(acao, ms);
    const renovar = () => { clearTimeout(t); t = setTimeout(acao, ms); };
    window.addEventListener('pointerdown', renovar, true);
    window.addEventListener('keydown', renovar, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', renovar, true);
      window.removeEventListener('keydown', renovar, true);
    };
  }, [ativo, ms, acao]);
}

// ── O teclado de números (senha) ──────────────────────────────────────
// Confere sozinho no último número — sem botão "OK", que seria um toque a
// mais a cada etiqueta. `aoCompletar(pin)` devolve a mensagem de erro (ou
// nada, quando deu certo ou a tela mudou de fase).
export function TecladoSenha({
  titulo, subtitulo = '', rotuloCampo, digitos = DIGITOS, aoCompletar, aoVoltar,
  bloqueado = false, aviso = '', avisoTom = 'atencao', rodape = null, compacto = false,
  textoOcupado = 'Conferindo…',
}) {
  const [pin, setPin] = useState('');
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState('');
  const campoRef = useRef(null);

  // ⚠️ SÓ COM MOUSE: no celular, focar o campo abriria o teclado do sistema
  // por cima do teclado grande desta tela. No computador, o foco deixa
  // digitar os números direto.
  useEffect(() => {
    try { if (window.matchMedia?.('(pointer: fine)').matches) campoRef.current?.focus(); } catch { /* sem matchMedia */ }
  }, []);

  const completar = async (completo) => {
    setConferindo(true);
    let msg;
    try { msg = (await aoCompletar(completo)) || ''; }
    catch (e) { msg = e?.message || 'Algo deu errado. Tente de novo.'; }
    setConferindo(false);
    setPin('');
    setErro(msg);
  };

  const travado = conferindo || bloqueado;
  const mudar = (novo) => {
    if (travado) return;
    const v = novo.replace(/\D/g, '').slice(0, digitos);
    setPin(v);
    setErro('');
    if (v.length === digitos) completar(v);
  };
  const apagar = () => { if (!travado) setPin(p => p.slice(0, -1)); };
  const limpar = () => { if (!travado) setPin(''); };

  const tecla = `${compacto ? 'h-14 text-2xl' : 'h-16 text-3xl'} rounded-2xl font-black active:scale-95 transition-transform disabled:opacity-40`;
  const numero = `${tecla} bg-white border-[3px] border-polo-navy/15 text-polo-navy`;
  const acao = `${compacto ? 'h-14' : 'h-16'} rounded-2xl font-bold text-base bg-gray-100 text-gray-700 active:scale-95 transition-transform disabled:opacity-40`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`${compacto ? 'text-base' : 'text-lg sm:text-xl'} font-titulo font-black uppercase tracking-wide text-polo-navy leading-tight break-words`}>{titulo}</h3>
          {subtitulo && <p className="text-sm text-gray-600 mt-1">{subtitulo}</p>}
        </div>
        <button type="button" onClick={aoVoltar}
          className="min-h-12 px-4 rounded-xl text-sm font-bold text-polo-navy border-[3px] border-polo-navy/15 bg-white flex-shrink-0">
          Voltar aos nomes
        </button>
      </div>
      {/* o campo de verdade, escondido: leitor de tela e teclado físico */}
      <input aria-label={rotuloCampo} ref={campoRef} type="password" inputMode="numeric" autoComplete="off"
        maxLength={digitos} value={pin} disabled={travado} className="sr-only"
        onChange={e => mudar(e.target.value)} />
      <div className="flex justify-center gap-4" aria-hidden="true">
        {Array.from({ length: digitos }, (_, i) => (
          <span key={i} className={`w-5 h-5 rounded-full border-[3px] border-polo-navy ${i < pin.length ? 'bg-polo-navy' : 'bg-white'}`} />
        ))}
      </div>
      {conferindo && <p className="text-center text-sm text-gray-600">{textoOcupado}</p>}
      {aviso && <Aviso tom={avisoTom}>{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-sm mx-auto">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} type="button" onClick={() => mudar(pin + d)} disabled={travado} className={numero}>{d}</button>
        ))}
        <button type="button" onClick={limpar} disabled={travado} className={acao}>Limpar</button>
        <button type="button" onClick={() => mudar(pin + '0')} disabled={travado} className={numero}>0</button>
        <button type="button" onClick={apagar} disabled={travado} className={acao}>Apagar</button>
      </div>
      {rodape}
    </div>
  );
}

// ── Senha de UM nome: digitar, ou criar no primeiro acesso ─────────────
function SenhaDoNome({ nome, aoVoltar, compacto }) {
  const { tentarSenha, criarSenha, travaDe, temSenha, digitosDaSenha } = useOperador();
  const { sessao } = useAuth();
  const [fase, setFase] = useState(() => (temSenha(nome) ? 'senha' : 'criar1'));
  const [primeira, setPrimeira] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  // ⚠️ O RELÓGIO É ESTADO, não Date.now() no desenho: a contagem da espera
  // repinta a cada segundo, e depois de cada tentativa ele é acertado (com
  // um relógio velho, a trava recém-criada pareceria longa demais e seria
  // descartada pela proteção contra relógio adulterado).
  const [agora, setAgora] = useState(() => Date.now());

  // ⚠️ A SENHA PODE MUDAR POR FORA enquanto a pessoa está aqui: o dono zerou
  // em outro aparelho, ou alguém criou a senha deste nome primeiro. A tela
  // acompanha sem efeito nenhum: o modo é DERIVADO do que vale agora.
  const tem = temSenha(nome);
  let modo = fase;
  let avisoDoModo = aviso;
  if (!salvando && fase === 'senha' && !tem) {
    modo = 'criar1'; avisoDoModo = 'A senha deste nome foi zerada. Crie uma nova.';
  } else if (!salvando && fase !== 'senha' && tem) {
    modo = 'senha'; avisoDoModo = 'Este nome já tem senha. Digite a senha.';
  }

  const trava = travaDe(nome, agora);
  const travado = modo === 'senha' && trava.travado;
  useEffect(() => {
    if (!travado) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [travado]);

  const conferir = async (pin) => {
    const r = await tentarSenha(nome, pin);
    if (r.ok) return ''; // a tela troca sozinha: o operador mudou
    // a hora vem da tentativa (o relógio do desenho é estado — ver `agora`)
    if (r.em) setAgora(r.em);
    if (r.semCripto) return 'Este aparelho não consegue conferir a senha. Abra o app pelo endereço com https.';
    if (r.travado) return '';
    return `Senha errada. ${r.restam === 1 ? 'Resta 1 tentativa' : `Restam ${r.restam} tentativas`} antes de esperar 15 segundos.`;
  };

  const guardarPrimeira = async (pin) => { setPrimeira(pin); setAviso(''); setFase('criar2'); return ''; };

  const confirmar = async (pin) => {
    if (pin !== primeira) {
      setPrimeira(''); setAviso('As duas não ficaram iguais. Crie de novo.'); setFase('criar1');
      return '';
    }
    setSalvando(true);
    const r = await criarSenha(nome, pin);
    if (r.ok) return ''; // entrou: a tela troca sozinha
    setSalvando(false);
    setPrimeira('');
    if (r.temSenha) { setAviso('Este nome já tem senha. Digite a senha.'); setFase('senha'); return ''; }
    let msg;
    if (r.semRede) msg = `A senha não foi criada. ${await textoDaFalhaDeRede()}`;
    else if (r.semCripto) msg = 'Este aparelho não consegue guardar senha. Abra o app pelo endereço com https.';
    else if (r.soLeitura) msg = 'No modo suporte não dá para criar senha.';
    else msg = r.erro || 'Não foi possível criar a senha. Tente de novo.';
    setAviso(msg); setFase('criar1');
    return '';
  };

  const comum = { aoVoltar, compacto };
  if (modo === 'senha') {
    return (
      <TecladoSenha key="senha" {...comum} titulo={`Senha de ${nome}`} rotuloCampo={`Senha de ${nome}`}
        digitos={digitosDaSenha(nome)} aoCompletar={conferir} bloqueado={travado}
        aviso={travado ? `Muitas tentativas erradas. Espere ${segundos(trava.esperaMs)} segundos para tentar de novo.` : avisoDoModo}
        rodape={(
          <div className="space-y-1">
            {/* ⚠️ SÓ NA DEMONSTRAÇÃO: numa conta de verdade, a senha é só da
                pessoa, e a tela nunca dá dica. */}
            {sessao?.demo && nome === DEMO_COM_SENHA.nome && (
              <p className="text-center text-sm text-gray-600">Na demonstração, a senha de {nome} é {DEMO_COM_SENHA.senha}.</p>
            )}
            <p className="text-center text-sm text-gray-600">
              Esqueceu a senha? Quem administra a conta zera em Administração, e você cria outra.
            </p>
          </div>
        )} />
    );
  }
  if (modo === 'criar1') {
    return (
      <TecladoSenha key={`criar1-${avisoDoModo}`} {...comum} titulo={`Crie sua senha, ${nome}`}
        subtitulo={`${DIGITOS} números. Não conte para ninguém.`} rotuloCampo={`Nova senha de ${nome}`}
        aoCompletar={guardarPrimeira} aviso={avisoDoModo} avisoTom="atencao" />
    );
  }
  return (
    <TecladoSenha key="criar2" {...comum} titulo="Repita a senha"
      subtitulo={`Digite os mesmos ${DIGITOS} números de novo.`} rotuloCampo={`Repita a senha de ${nome}`}
      aoCompletar={confirmar} textoOcupado="Guardando a senha…" />
  );
}

// ── O cartão de um nome ───────────────────────────────────────────────
// ⚠️ O NOME DO BOTÃO É SÓ O NOME DA PESSOA (aria-label): "1º acesso" e "com
// senha" vão como descrição. É o que o leitor de tela fala primeiro — e o
// que o robô procura.
// ⚠️ O status fica EMBAIXO do nome, não ao lado: no Magurō, com ele ao lado,
// o nome quebrava letra por letra num celular de 375 px.
function CartaoNome({ nome, comSenha, compacto, aoTocar }) {
  const idStatus = useId();
  return (
    <button type="button" onClick={aoTocar} aria-label={nome} aria-describedby={idStatus}
      className={`${compacto ? 'min-h-16' : 'min-h-[80px] sm:min-h-[88px]'} w-full bg-white rounded-2xl border-[3px]
                  border-polo-navy/15 hover:border-polo-gold shadow-sm px-3 py-2 flex items-center gap-3 text-left
                  active:scale-[0.97] transition-transform`}>
      <span aria-hidden="true"
        className={`${compacto ? 'w-10 h-10 text-lg' : 'w-11 h-11 sm:w-12 sm:h-12 text-xl'} flex-shrink-0 rounded-full
                    bg-polo-navy text-polo-gold font-black flex items-center justify-center`}>
        {inicialDe(nome)}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block ${compacto ? 'text-base' : 'text-base sm:text-xl'} font-bold text-polo-navy leading-tight break-words hyphens-auto`}>
          {nome}
        </span>
        {/* ⚠️ Quem tem senha mostra SÓ O CADEADO (como no Magurō): "com senha"
            escrito quebrava em duas linhas no celular. O leitor de tela ouve
            "com senha" do mesmo jeito. */}
        <span id={idStatus}
          className={`mt-1 inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold rounded-full
                      ${comSenha ? 'text-polo-navy/70' : 'bg-amber-100 text-amber-900 px-2 py-0.5'}`}>
          {comSenha ? <><Icon name="cadeado" size={14} /><span className="sr-only">com senha</span></> : '1º acesso'}
        </span>
      </span>
    </button>
  );
}

// A grade de nomes. `dentroDaJanela` deixa tudo mais compacto (a janela de
// imprimir já tem muita coisa). `titulo` e `texto` trocam a pergunta — os
// formulários de lançamento perguntam "Quem está registrando?" (Lote 2).
export default function QuemImprime({ dentroDaJanela = false, titulo = 'Quem vai imprimir?', texto = '' }) {
  const { pessoas } = useApp();
  const { temSenha } = useOperador();
  const { sessao } = useAuth();
  const [escolhido, setEscolhido] = useState('');
  const [busca, setBusca] = useState('');
  const [letra, setLetra] = useState('');
  const idTitulo = useId();

  const naGrade = !(escolhido && pessoas.includes(escolhido));
  const limparBusca = useCallback(() => { setBusca(''); setLetra(''); }, []);
  // 1 minuto parado com a busca aberta → a lista volta inteira para o próximo
  useQuandoParado(naGrade && !!(busca || letra), PARADO_LIMPA_BUSCA_MS, limparBusca);
  // versão nova do app: recarrega aqui, parado (ninguém digitando senha)
  useAtualizarQuandoParado(naGrade && !dentroDaJanela && !sessao?.demo);

  if (!naGrade) {
    return (
      <section aria-label="Senha"
        className={dentroDaJanela ? 'border-2 border-polo-navy/20 rounded-2xl p-3' : 'bg-white rounded-3xl p-4 sm:p-6 shadow-sm max-w-lg mx-auto'}>
        <SenhaDoNome nome={escolhido} aoVoltar={() => setEscolhido('')} compacto={dentroDaJanela} />
      </section>
    );
  }

  const muitos = pessoas.length > NOMES_SEM_BUSCA;
  const letras = [...new Set(pessoas.map(inicialDe))].filter(l => /^[A-Z0-9]$/.test(l)).sort();
  const visiveis = pessoas.filter(p => (busca.trim() ? casaBusca(busca, p) : !letra || inicialDe(p) === letra));
  const chip = (valor, rotulo) => (
    <button key={valor || 'todos'} type="button" aria-pressed={letra === valor}
      onClick={() => { setLetra(valor); setBusca(''); }}
      className={`min-h-11 min-w-11 px-3 rounded-xl font-black text-base border-[3px]
                  ${letra === valor ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'bg-white text-polo-navy border-polo-navy/15'}`}>
      {rotulo}
    </button>
  );

  return (
    <section aria-labelledby={idTitulo}
      className={dentroDaJanela ? 'border-2 border-polo-navy/20 rounded-2xl p-3 space-y-3' : 'space-y-4'}>
      <div className={dentroDaJanela ? '' : 'px-1'}>
        <h2 id={idTitulo} className={`${dentroDaJanela ? 'text-base' : 'text-xl sm:text-2xl'} font-titulo font-black uppercase tracking-wide text-polo-navy`}>{titulo}</h2>
        <p className={`${dentroDaJanela ? 'text-xs' : 'text-sm'} text-gray-600 mt-0.5`}>
          {texto || (dentroDaJanela
            ? 'Toque no seu nome para assinar estas etiquetas.'
            : 'Toque no seu nome. A etiqueta sai assinada por você.')}
        </p>
      </div>
      {muitos && (
        <div className="space-y-2">
          <input type="search" aria-label="Procurar seu nome" placeholder="Procurar seu nome" value={busca}
            onChange={e => { setBusca(e.target.value); setLetra(''); }}
            className="w-full min-h-14 border-[3px] border-polo-navy/15 rounded-2xl px-4 text-lg bg-white" />
          {letras.length > 1 && (
            <div role="group" aria-label="Letra inicial do nome" className="flex flex-wrap gap-2">
              {chip('', 'Todos')}
              {letras.map(l => chip(l, l))}
            </div>
          )}
        </div>
      )}
      {visiveis.length === 0 && pessoas.length > 0 && (
        <div className="bg-white rounded-2xl border-[3px] border-dashed border-polo-navy/20 p-4 flex flex-wrap items-center gap-3">
          <p className="text-base text-gray-700 flex-1 min-w-0">Nenhum nome com “{busca.trim() || letra}”.</p>
          <button type="button" onClick={limparBusca}
            className="min-h-12 px-4 rounded-xl bg-polo-navy text-polo-gold font-bold text-sm">
            Ver todos os nomes
          </button>
        </div>
      )}
      <div className={`grid gap-2 sm:gap-3 ${dentroDaJanela ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
        {visiveis.map(p => (
          <CartaoNome key={p} nome={p} comSenha={temSenha(p)} compacto={dentroDaJanela} aoTocar={() => setEscolhido(p)} />
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
    <div className="flex items-center justify-between gap-2 bg-polo-navy text-white rounded-2xl pl-4 pr-1.5 py-1.5">
      <p className="text-base min-w-0 truncate">Imprimindo como <strong className="text-polo-gold">{operador}</strong></p>
      <button type="button" onClick={trocar}
        className="min-h-12 px-4 rounded-xl bg-white/10 text-white text-sm font-bold flex-shrink-0">
        Trocar
      </button>
    </div>
  );
}

// ── "Continuar imprimindo?" (pedido do dono, 03/11/2026, visto na Suflex) ──
// A etiqueta saiu pela tela Imprimir: 5 segundos para dizer que continua.
// Sem resposta, o aparelho volta para os nomes — quem pega o celular depois
// não imprime no nome de quem acabou de sair.
// ⚠️ O "×" e o Esc contam como continuar: quem fechou está ali.
export const SEGUNDOS_PARA_CONTINUAR = 5;

export function ContinuarImprimindo({ nome, aoContinuar, aoTrocar }) {
  const [restam, setRestam] = useState(SEGUNDOS_PARA_CONTINUAR);
  useEffect(() => {
    if (restam <= 0) { aoTrocar(); return undefined; }
    const t = setTimeout(() => setRestam(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [restam, aoTrocar]);
  return (
    <Dialogo aoFechar={aoContinuar} titulo={`Continuar imprimindo, ${nome}?`}
      forma="caixa" largura="sm" camada={110} classeCaixa="space-y-3">
      <p className="text-sm text-gray-700">Volta para os nomes em {restam} s.</p>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden" aria-hidden="true">
        <div className="h-full bg-polo-gold transition-[width] duration-1000 ease-linear"
          style={{ width: `${(Math.max(0, restam - 1) / SEGUNDOS_PARA_CONTINUAR) * 100}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={aoContinuar} autoFocus
          className="min-h-12 rounded-xl bg-polo-navy text-polo-gold font-bold text-base">
          Continuar
        </button>
        <button type="button" onClick={aoTrocar}
          className="min-h-12 rounded-xl border-[3px] border-polo-navy/20 bg-white text-polo-navy font-bold text-base">
          Trocar pessoa
        </button>
      </div>
    </Dialogo>
  );
}
