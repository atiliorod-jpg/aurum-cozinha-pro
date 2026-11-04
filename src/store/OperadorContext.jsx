import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useApp } from './AppContext';
import { useAuth } from './AuthContext';
import {
  temSenha as temSenhaNo, registroDe, conferirSenha, criptoDisponivel,
  estadoDaTrava, aposErro, expirou, CHAVE_TRAVAS,
} from '../utils/senhaEquipe';

// =====================================================================
//  QUEM ESTÁ IMPRIMINDO AGORA ("Quem vai imprimir?", 13/10/2026)
//
//  A pessoa entra pelo nome (e a senha, se tiver) e as etiquetas saem
//  assinadas por ela até: 1 minuto sem tocar em nada NA TELA IMPRIMIR,
//  "Trocar", reabrir o app ou sair da conta. Nos lançamentos do Pro o nome
//  não expira (decisão do dono, 04/11/2026).
//
//  ⚠️ SÓ NA MEMÓRIA. Nunca em `prefs` nem em `_prefs_device`: guardado no
//  aparelho, o nome sobreviveria a fechar o app e o próximo a pegar o
//  celular imprimiria no nome de quem saiu — que é exatamente o que a senha
//  existe para impedir.
//
//  ⚠️ CONTEXTO À PARTE, e não dentro do AppContext: o relógio de "sem uso"
//  mexe aqui a cada toque, e o AppContext re-renderiza as 34 telas que usam
//  `useApp`. Aqui só quem lê o operador (Etiquetas e a janela de imprimir).
// =====================================================================

const OperadorContext = createContext(null);

// A trava de erros fica no aparelho (por conta e nome), fora do pe::<rid>::
// — ver CHAVE_TRAVAS. Sem localStorage (aba anônima travada), vale só a
// memória: o pior caso é a espera não sobreviver a recarregar a página.
const travasNaMemoria = {};
function lerTravas() {
  try { return JSON.parse(localStorage.getItem(CHAVE_TRAVAS) || '{}') || {}; }
  catch { return travasNaMemoria; }
}
function gravarTrava(chave, trava) {
  const todas = { ...lerTravas() };
  if (trava) todas[chave] = trava; else delete todas[chave];
  // limpa as que já passaram, para a chave não crescer para sempre
  const agora = Date.now();
  for (const k of Object.keys(todas)) {
    const t = todas[k];
    if (!t || (!(Number(t.erros) > 0) && !(Number(t.ate) > agora))) delete todas[k];
  }
  try { localStorage.setItem(CHAVE_TRAVAS, JSON.stringify(todas)); }
  catch { Object.assign(travasNaMemoria, todas); }
}

export function OperadorProvider({ children }) {
  const { pessoas, senhasEquipe, rid } = useApp();
  const { sessao } = useAuth() || {};
  // ⚠️ O operador vale para ESTA conta e ESTE usuário. Trocou de conta (ou
  // saiu e entrou outro), o nome não passa para o lado de lá — sem efeito
  // nenhum: o estado guarda de quem ele é, e a leitura confere.
  const dono = rid ? `${rid}::${sessao?.usuarioId || ''}` : '';
  const [estado, setEstado] = useState({ dono: '', nome: '' });
  const ultimoUsoRef = useRef(0);
  const comEquipe = (pessoas || []).length > 0;
  // nome removido da equipe (pelo dono, em outro aparelho) deixa de assinar
  const operador = estado.dono === dono && dono && (pessoas || []).includes(estado.nome) ? estado.nome : '';
  const operadorRef = useRef(operador);
  operadorRef.current = operador; // eslint-disable-line react-hooks/refs

  const sair = useCallback(() => setEstado({ dono: '', nome: '' }), []);
  // ⚠️ QUANTAS VEZES O NOME EXPIROU POR FALTA DE USO (03/11/2026). "Trocar"
  // também zera o operador, mas só a expiração faz a tela Imprimir voltar
  // para os nomes e fechar a janela de impressão — quem toca em "Trocar"
  // dentro da janela quer escolher outro nome ali mesmo, não perder o que
  // digitou. Um contador, e não um sim/não, para cada expiração ser vista.
  const [expiracoes, setExpiracoes] = useState(0);
  const expirar = useCallback(() => { sair(); setExpiracoes(n => n + 1); }, [sair]);

  // ⚠️ O MINUTO SEM USO SÓ CONTA NA TELA IMPRIMIR (decisão do dono,
  // 04/11/2026): "nas telas de lançamento não precisa, só na de impressão".
  // A tela avisa que está aberta (useTelaDeImprimir) e só então o relógio
  // vale. O toque anterior fica guardado para a CHEGADA nela — ver abaixo.
  const telasDeImprimirRef = useRef(0);
  const usoAnteriorRef = useRef(0);

  // ── 1 minuto sem uso ───────────────────────────────────────────────
  // ⚠️ Confere a expiração ANTES de renovar: um toque depois de 2 minutos
  // parado não pode "salvar" o nome — ele volta para a lista.
  useEffect(() => {
    if (!operador) return undefined;
    ultimoUsoRef.current = Date.now();
    usoAnteriorRef.current = 0;
    const conferir = () => {
      if (operadorRef.current && telasDeImprimirRef.current > 0 && expirou(ultimoUsoRef.current, Date.now())) {
        expirar(); return true;
      }
      return false;
    };
    const aoUsar = () => {
      if (conferir()) return;
      usoAnteriorRef.current = ultimoUsoRef.current;
      ultimoUsoRef.current = Date.now();
    };
    const aoVoltar = () => { if (document.visibilityState === 'visible') conferir(); };
    // fase de CAPTURA: um botão que para a propagação não esconde o toque
    window.addEventListener('pointerdown', aoUsar, true);
    window.addEventListener('keydown', aoUsar, true);
    document.addEventListener('visibilitychange', aoVoltar);
    // de 5 em 5 s: com 1 minuto de limite, conferir a cada 15 s deixaria o
    // nome valendo até 75 s
    const relogio = setInterval(conferir, 5_000);
    return () => {
      window.removeEventListener('pointerdown', aoUsar, true);
      window.removeEventListener('keydown', aoUsar, true);
      document.removeEventListener('visibilitychange', aoVoltar);
      clearInterval(relogio);
    };
  }, [operador, expirar]);

  // A tela Imprimir abriu. ⚠️ QUEM CHEGA NELA DEPOIS DE 1 MINUTO PARADO em
  // outra tela também volta para os nomes: senão bastava o próximo tocar em
  // Imprimir, vindo de Entradas, para imprimir no nome de quem saiu. O toque
  // que trouxe até aqui já renovou o relógio, então vale a pausa ANTES dele.
  const abrirTelaDeImprimir = useCallback(() => {
    telasDeImprimirRef.current += 1;
    if (operadorRef.current && usoAnteriorRef.current
        && expirou(usoAnteriorRef.current, ultimoUsoRef.current)) expirar();
    return () => { telasDeImprimirRef.current -= 1; };
  }, [expirar]);

  const temSenha = useCallback((nome) => temSenhaNo(senhasEquipe, nome), [senhasEquipe]);

  const chaveTrava = useCallback((nome) => `${rid || ''}::${nome}`, [rid]);
  const travaDe = useCallback((nome, agora = Date.now()) => estadoDaTrava(lerTravas()[chaveTrava(nome)], agora), [chaveTrava]);

  // Sem senha: o toque no nome basta. COM senha, recusa — só tentarSenha entra.
  const entrar = useCallback((nome) => {
    if (!dono || !(pessoas || []).includes(nome) || temSenhaNo(senhasEquipe, nome)) return false;
    ultimoUsoRef.current = Date.now();
    setEstado({ dono, nome });
    return true;
  }, [dono, pessoas, senhasEquipe]);

  const tentarSenha = useCallback(async (nome, pin) => {
    if (!dono || !(pessoas || []).includes(nome)) return { ok: false, travado: false, restam: 0 };
    const chave = chaveTrava(nome);
    const inicio = Date.now();
    const antes = estadoDaTrava(lerTravas()[chave], inicio);
    // `em`: a hora desta tentativa, para a tela acertar a contagem da espera
    if (antes.travado) return { ok: false, em: inicio, ...antes };
    // navegador sem cripto (fora do https): não conta como erro da pessoa
    if (!criptoDisponivel()) return { ok: false, semCripto: true, travado: false, restam: antes.restam, em: inicio };
    const ok = await conferirSenha(pin, registroDe(senhasEquipe, nome));
    if (ok) {
      gravarTrava(chave, null);
      ultimoUsoRef.current = Date.now();
      setEstado({ dono, nome });
      return { ok: true };
    }
    const fim = Date.now();
    const nova = aposErro(lerTravas()[chave], fim);
    gravarTrava(chave, nova);
    return { ok: false, em: fim, ...estadoDaTrava(nova, fim) };
  }, [dono, pessoas, senhasEquipe, chaveTrava]);

  const valor = useMemo(() => ({
    operador, comEquipe, temSenha, entrar, tentarSenha, trocar: sair, travaDe, expiracoes, abrirTelaDeImprimir,
  }), [operador, comEquipe, temSenha, entrar, tentarSenha, sair, travaDe, expiracoes, abrirTelaDeImprimir]);

  return <OperadorContext.Provider value={valor}>{children}</OperadorContext.Provider>;
}

export const useOperador = () => useContext(OperadorContext);

/** A tela Imprimir chama ao abrir: o minuto sem uso passa a valer enquanto ela estiver aberta. */
export function useTelaDeImprimir() {
  const abrir = useContext(OperadorContext)?.abrirTelaDeImprimir;
  useEffect(() => abrir?.(), [abrir]);
}

// ── Lote 2 da auditoria (14/10/2026): a MESMA pessoa assina os lançamentos ──
// O nome que vai no lançamento e se ainda falta escolher. `manual` é o valor
// do seletor antigo (ResponsavelSelect) — só vale com a equipe vazia.
export function useQuemRegistra(manual) {
  const { operador, comEquipe } = useOperador();
  if (comEquipe) return { nome: operador || '', falta: !operador, comEquipe };
  return { nome: String(manual || '').trim(), falta: false, comEquipe };
}

export const AVISO_FALTA_QUEM = 'Para registrar, toque no seu nome em “Quem está registrando?”.';
