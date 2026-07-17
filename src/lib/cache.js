// Cache offline em localStorage, isolado por restaurante.
// Permite o app funcionar sem internet e sincronizar ao reconectar.

import { contarVivos, contarMortos } from '../utils/outbox';

const ns = (rid, chave) => `pe::${rid}::${chave}`;

export const cacheGet = (rid, chave, fallback) => {
  if (!rid) return fallback;
  try {
    const s = localStorage.getItem(ns(rid, chave));
    return s ? JSON.parse(s) : fallback;
  } catch { return fallback; }
};

export const cacheSet = (rid, chave, valor) => {
  if (!rid) return;
  try { localStorage.setItem(ns(rid, chave), JSON.stringify(valor)); } catch { /* cota cheia/modo privado — ignora */ }
};

// ── Outbox: operações pendentes quando offline ───────────────
// Cada item: { id, kind:'registro'|'doc', op:'insert'|'delete'|'upsert', payload }
// Avisa a UI (badge de pendências) sempre que a fila muda.
const avisaOutbox = () => { try { window.dispatchEvent(new Event('outbox-mudou')); } catch { /* sem window (SSR/teste) — ignora */ } };

export const outboxGet = (rid) => cacheGet(rid, '_outbox', []);
export const outboxSet = (rid, fila) => { cacheSet(rid, '_outbox', fila); avisaOutbox(); };

export const outboxAdd = (rid, item) => {
  const fila = outboxGet(rid);
  fila.push({ ...item, _enfileiradoEm: Date.now() });
  outboxSet(rid, fila);
};

export const outboxClear = (rid) => outboxSet(rid, []);

// Badge de "sincronizando": conta só os itens VIVOS (os mortos aparecem numa
// lista separada de erro permanente — ver utils/outbox e Configurações).
export const outboxCount = (rid) => contarVivos(outboxGet(rid));
export const outboxMortos = (rid) => outboxGet(rid).filter(i => i._morto);
export const outboxMortosCount = (rid) => contarMortos(outboxGet(rid));
