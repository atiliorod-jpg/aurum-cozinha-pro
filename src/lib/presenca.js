// =====================================================================
//  PRESENÇA (M58): o aparelho avisa que o app está aberto
//
//  Um sinal ao abrir, outro a cada 2 minutos enquanto a tela está VISÍVEL, e
//  um ao voltar (aba que volta ao foco, internet que volta). Aba escondida não
//  dá sinal: app esquecido aberto no bolso não é "alguém usando".
//
//  ⚠️ FALHA CALADA, de propósito. Isto é estatística da Aurum, não dado do
//  cliente: sem internet, sem a migração ou com erro no banco, o app segue
//  igual e o painel só mostra "visto há mais tempo".
// =====================================================================

import { supabase } from './supabase';

export const INTERVALO_PRESENCA_MS = 2 * 60 * 1000;

const aparelho = () => {
  try { return window.matchMedia('(pointer: coarse)').matches ? 'celular' : 'computador'; }
  catch { return null; }
};

/** Começa a dar sinal; devolve a função que para. */
export function iniciarPresenca() {
  let ultimo = 0;
  const sinal = () => {
    if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
    // o foco e a rede podem voltar juntos: um sinal só
    if (Date.now() - ultimo < 30 * 1000) return;
    ultimo = Date.now();
    Promise.resolve(supabase.rpc('marcar_presenca', { p_aparelho: aparelho() })).catch(() => {});
  };
  sinal();
  const relogio = setInterval(sinal, INTERVALO_PRESENCA_MS);
  document.addEventListener('visibilitychange', sinal);
  window.addEventListener('online', sinal);
  return () => {
    clearInterval(relogio);
    document.removeEventListener('visibilitychange', sinal);
    window.removeEventListener('online', sinal);
  };
}
