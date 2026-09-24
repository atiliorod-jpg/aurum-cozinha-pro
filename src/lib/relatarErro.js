// =====================================================================
//  OS ERROS DOS APARELHOS CHEGAM NO PAINEL (M50, 24/09/2026)
//
//  Antes, a tela que travava no cliente só ficava registrada no aparelho
//  dele; a Aurum sabia se ele reclamasse. Agora cada erro vai para
//  `erros_app` (só o super-admin lê) e aparece no painel.
//
//  ⚠️ NUNCA ATRAPALHA O APP: tudo aqui é silencioso e sem espera. Falhou o
//  envio (sem internet)? Guarda até 10 no aparelho e manda quando a internet
//  voltar. O banco ainda limita a 30 por pessoa por hora e soma repetidos.
//
//  ⚠️ RUÍDO NÃO É ERRO: rede caindo ("Failed to fetch"), extensão do
//  navegador e o aviso inofensivo do ResizeObserver ficam de fora — senão o
//  painel encheria de coisa que não é defeito do app.
// =====================================================================

import { supabase } from './supabase';
import { ehRuido } from '../utils/errosApp';

const CHAVE_PENDENTES = 'pe::_erros'; // do aparelho (2 partes): sobrevive ao "Sair"
const MAX_PENDENTES = 10;
const MAX_POR_SESSAO = 25;

let enviadosNestaSessao = 0;
const vistos = new Map(); // tipo+mensagem → quando (não repete o mesmo em 1 minuto)

function lerPendentes() {
  try { return JSON.parse(localStorage.getItem(CHAVE_PENDENTES) || '[]'); } catch { return []; }
}
function gravarPendentes(lista) {
  try { localStorage.setItem(CHAVE_PENDENTES, JSON.stringify(lista.slice(-MAX_PENDENTES))); } catch { /* sem storage */ }
}

async function enviar(e) {
  const { data, error } = await supabase.rpc('registrar_erro', {
    p_tipo: e.tipo, p_mensagem: e.mensagem, p_onde: e.onde || null, p_tela: e.tela || null,
    p_versao: e.versao || null, p_navegador: e.navegador || null,
  });
  // sem sessão o banco devolve false: não adianta guardar para depois
  if (error) throw error;
  return data;
}

/**
 * Manda um erro para o painel. `tipo`: 'tela' | 'js' | 'promessa' | 'fila'.
 */
export function relatarErro({ tipo = 'js', mensagem, onde = '', tela } = {}) {
  try {
    const msg = String(mensagem || '').slice(0, 500);
    if (!msg || ehRuido(msg, onde)) return;
    const chave = `${tipo}|${msg}`;
    const agora = Date.now();
    if (vistos.has(chave) && agora - vistos.get(chave) < 60000) return;
    vistos.set(chave, agora);
    if (enviadosNestaSessao >= MAX_POR_SESSAO) return;
    enviadosNestaSessao += 1;
    const erro = {
      tipo, mensagem: msg, onde: String(onde || '').slice(0, 800),
      tela: tela || (typeof window !== 'undefined' ? window.location.pathname : ''),
      versao: import.meta.env.VITE_VERSAO_APP || 'desenvolvimento',
      navegador: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      quando: new Date().toISOString(),
    };
    enviar(erro).catch(() => gravarPendentes([...lerPendentes(), erro]));
  } catch { /* relatar erro nunca pode virar outro erro */ }
}

/** Manda o que ficou guardado sem internet. Chamado ao entrar e ao voltar a internet. */
export async function enviarPendentes() {
  const pendentes = lerPendentes();
  if (!pendentes.length) return;
  gravarPendentes([]);
  const sobra = [];
  for (const e of pendentes) {
    // a mensagem vai IGUAL: assim soma no mesmo grupo do painel
    try { await enviar(e); }
    catch { sobra.push(e); }
  }
  if (sobra.length) gravarPendentes(sobra);
}

/** Liga os ouvintes globais do navegador — uma vez, no main.jsx. */
export function ouvirErrosGlobais() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev) => {
    relatarErro({
      tipo: 'js',
      mensagem: ev?.message || String(ev?.error || ''),
      onde: ev?.filename ? `${ev.filename}:${ev.lineno || 0}` : (ev?.error?.stack || '').split('\n').slice(0, 3).join(' | '),
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev?.reason;
    relatarErro({
      tipo: 'promessa',
      mensagem: r?.message || String(r || ''),
      onde: (r?.stack || '').split('\n').slice(0, 3).join(' | '),
    });
  });
  window.addEventListener('online', () => { enviarPendentes(); });
}
