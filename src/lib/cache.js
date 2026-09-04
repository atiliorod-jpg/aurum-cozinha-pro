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

// ── Limpeza no logout ────────────────────────────────────────
//
// ⚠️ SEGURANÇA. Até aqui o logout só apagava as chaves da DEMO
// (`pe::demo::*`). Numa conta real não apagava NADA: produtos, entradas,
// saídas, histórico e a trilha de auditoria ficavam no aparelho depois que a
// pessoa saía. Num tablet de cozinha — que é compartilhado por definição — o
// próximo usuário lia tudo pelo DevTools sem precisar de senha. Pior no modo
// suporte: os dados do CLIENTE ficavam no aparelho do super-admin.
//
// Formato das chaves: `pe::<rid>::<chave>` (dados) e `pe::<algo>` (preferência
// do APARELHO, ex.: `pe::modulo`). Só as de três partes são dados de conta —
// as de duas partes ficam, senão o tablet esquece em qual estoque estava.

const ehChaveDeDados = (k) => {
  const p = String(k).split('::');
  return p[0] === 'pe' && p.length >= 3;
};

/** Itens da fila que o servidor ainda NÃO recebeu, somando todas as contas. */
export function pendenciasNaoSincronizadas() {
  let total = 0;
  try {
    Object.keys(localStorage).forEach(k => {
      const p = k.split('::');
      if (p[0] !== 'pe' || p.slice(2).join('::') !== '_outbox') return;
      total += contarVivos(cacheGet(p[1], '_outbox', []));
    });
  } catch { /* storage indisponível */ }
  return total;
}

// ⚠️ SOBREVIVE AO LOGOUT, e isto foi um defeito relatado pelo dono: ele saía da
// conta e, ao voltar, o RESPONSÁVEL da etiqueta tinha sumido — e com ele o
// último armazenamento usado, o turno e o destino. Os quatro moram nesta chave
// (`PREFS_APARELHO` em store/AppContext.jsx) e a limpeza levava tudo junto.
//
// Por que preservar não fura a regra do tablet compartilhado: a limpeza existe
// para o próximo usuário não alcançar PRODUTOS, CUSTOS e HISTÓRICO da conta
// anterior. Isto aqui é a memória de um punhado de campos de formulário —
// primeiro nome de quem assina, estado de conservação, turno —, guardada sob o
// id daquele restaurante, que a conta seguinte nem lê. O que sai da mesa é
// dado do negócio; o que fica é conveniência de preenchimento.
//
// ⚠️ Se um dia entrar algo sensível em PREFS_APARELHO, esta isenção precisa ser
// revista JUNTO — é por isso que a lista mora num lugar só e é nomeada aqui.
const CHAVE_PREFS_APARELHO = '_prefs_device';

/**
 * Apaga o cache local de TODAS as contas neste aparelho.
 *
 * `preservarOutbox` (padrão) mantém as filas que ainda têm item vivo: é
 * trabalho que o servidor não recebeu, e apagá-lo no logout seria destruir
 * lançamento — justamente num app cuja tela mostra sucesso mesmo quando o
 * servidor recusou. Quem chama deve AVISAR antes quando houver pendência.
 *
 * Devolve quantas chaves saíram (útil para teste e para log).
 */
export function limparCacheLocal({ preservarOutbox = true } = {}) {
  let removidas = 0;
  try {
    Object.keys(localStorage).filter(ehChaveDeDados).forEach(k => {
      const p = k.split('::');
      const chave = p.slice(2).join('::');
      if (preservarOutbox && chave === '_outbox' && contarVivos(cacheGet(p[1], '_outbox', [])) > 0) return;
      if (chave === CHAVE_PREFS_APARELHO) return;
      localStorage.removeItem(k);
      removidas++;
    });
  } catch { /* storage indisponível */ }
  return removidas;
}
