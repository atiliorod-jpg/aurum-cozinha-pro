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

// Identidade estável de cada item da fila. Sem isso o flush (que é assíncrono)
// só sabe remover itens por POSIÇÃO — e um registro salvo no meio de um flush
// era sobrescrito e perdido para sempre. Ver flush() em store/AppContext.
let seq = 0;
export const outboxUid = () => `${Date.now().toString(36)}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const outboxAdd = (rid, item) => {
  const fila = outboxGet(rid);
  fila.push({ ...item, _uid: outboxUid(), _enfileiradoEm: Date.now() });
  outboxSet(rid, fila);
};

// Garante _uid em itens antigos (enfileirados antes desta versão) — chamado
// pelo flush antes de qualquer await, para que a remoção seja sempre por id.
export const outboxGarantirUids = (rid) => {
  const fila = outboxGet(rid);
  if (fila.every(i => i._uid)) return fila;
  const comUid = fila.map(i => (i._uid ? i : { ...i, _uid: outboxUid() }));
  outboxSet(rid, comUid);
  return comUid;
};

export const outboxClear = (rid) => outboxSet(rid, []);

// Badge de "sincronizando": conta só os itens VIVOS (os mortos aparecem numa
// lista separada de erro permanente — ver utils/outbox e Configurações).
export const outboxCount = (rid) => contarVivos(outboxGet(rid));
export const outboxMortos = (rid) => outboxGet(rid).filter(i => i._morto);
export const outboxMortosCount = (rid) => contarMortos(outboxGet(rid));
