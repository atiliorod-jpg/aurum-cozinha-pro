// =====================================================================
//  SÓ O QUE MUDOU (M53, 28/09/2026) — as contas, puras, para teste.
//
//  O aparelho guarda os lançamentos e, a cada abertura, pede ao banco só as
//  linhas com `atualizado_em` a partir da última que já tem — com uma FOLGA
//  para trás (uma gravação que terminou um instante depois da leitura pode ter
//  hora um pouco anterior). O que chega repetido substitui pelo id; a linha
//  marcada como apagada sai.
// =====================================================================

/** Folga para trás, em ms: o que mudou nos 10 minutos antes da última vez vem de novo. */
export const FOLGA_MS = 10 * 60 * 1000;

/** A hora mais nova entre as linhas (ISO), ou a `anterior` se nenhuma for mais nova. */
export function horaMaisNova(linhas, anterior = null) {
  let max = anterior && !Number.isNaN(Date.parse(anterior)) ? anterior : null;
  for (const l of linhas || []) {
    const h = l?.atualizado_em;
    if (h && (!max || Date.parse(h) > Date.parse(max))) max = h;
  }
  return max;
}

/** De quando pedir: a última hora conhecida menos a folga (ou null = baixar tudo). */
export function pedirDesde(ate, folgaMs = FOLGA_MS) {
  const t = ate ? Date.parse(ate) : NaN;
  return Number.isNaN(t) ? null : new Date(t - folgaMs).toISOString();
}

/**
 * Junta o que o aparelho tinha com o que chegou. Pelo id: o que chegou
 * substitui; apagado (deleted) sai. Só aceita linhas DESTA conta.
 */
export function juntarDelta(guardadas, chegaram, rid) {
  const porId = new Map();
  for (const l of guardadas || []) if (l && l.id && (!rid || l.restaurante_id === rid)) porId.set(l.id, l);
  for (const l of chegaram || []) {
    if (!l || !l.id || (rid && l.restaurante_id !== rid)) continue;
    if (l.deleted) porId.delete(l.id);
    else porId.set(l.id, l);
  }
  return [...porId.values()];
}
