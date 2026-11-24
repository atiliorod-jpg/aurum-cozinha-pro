// =====================================================================
//  APARELHOS CONECTADOS (M64, 24/11/2026 — pedido do dono)
//
//  O Aurum Etiquetas inclui até 3 aparelhos conectados na mesma conta. O 4º
//  mostra o Pix do aparelho a mais e só entra quando a Aurum confirma. Quem
//  decide é o BANCO (registrar_aparelho, com a linha da conta travada): cada
//  login num aparelho é uma sessão, e o id dela vem assinado no token.
//
//  Aqui ficam o nome que o dono reconhece na lista, a decisão a partir da
//  resposta do banco (pura, com teste) e a última resposta guardada — para o
//  aparelho que espera não se soltar só porque abriu sem internet.
// =====================================================================

export const INTERVALO_APARELHO_MS = 5 * 60 * 1000;
// esperando a Aurum confirmar o Pix: confere mais vezes, para entrar logo
export const INTERVALO_ESPERANDO_MS = 30 * 1000;
const CHAVE = 'aurum_aparelho_v1';

/** "Android · Chrome", "iPhone · Safari", "Windows · Edge" — só para reconhecer na lista. */
export function nomeDoAparelho(ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '') {
  const sistema = /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) ? 'iPad'
    : /Android/i.test(ua) ? 'Android'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'Mac'
    : /CrOS/i.test(ua) ? 'Chromebook'
    : /Linux/i.test(ua) ? 'Linux' : 'Aparelho';
  const navegador = /Edg(e|A|iOS)?\//i.test(ua) ? 'Edge'
    : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
    : /CriOS|Chrome/i.test(ua) ? 'Chrome'
    : /Safari/i.test(ua) ? 'Safari' : '';
  return navegador ? `${sistema} · ${navegador}` : sistema;
}

/**
 * O que fazer com a resposta do banco: 'entrar' | 'esperar' | 'sair'.
 *
 * ⚠️ SEM RESPOSTA, ENTRA. Falha de rede, banco sem a M64 ou conta isenta não
 * tiram acesso de ninguém — a mesma regra de toda a abertura do app. O que
 * segura o aparelho que espera, mesmo sem internet, é a resposta GUARDADA.
 */
export function decidirAparelho(resp) {
  const s = resp?.situacao;
  if (s === 'aguardando') return 'esperar';
  if (s === 'removido') return 'sair';
  return 'entrar';
}

/** A última resposta deste aparelho para ESTE usuário, ou null. */
export function lerAparelhoGuardado(usuarioId) {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    return v && usuarioId && v.usuarioId === usuarioId ? v.resp : null;
  } catch { return null; }
}
export function guardarAparelho(usuarioId, resp) {
  try {
    if (!usuarioId || !resp) localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, JSON.stringify({ usuarioId, resp }));
  } catch { /* sem storage: vale a resposta da memória */ }
}

/** "hoje 14:32", "ontem 09:10", "20/11" — quando o aparelho foi visto. */
export function quandoFoiVisto(iso, agora = new Date()) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dias = Math.round((dia(agora) - dia(d)) / 86400000);
  if (dias <= 0) return `hoje ${hora}`;
  if (dias === 1) return `ontem ${hora}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
