// =====================================================================
//  ETIQUETAS IMPRESSAS COM VÁRIOS APARELHOS — juntar, nunca substituir
//
//  A lista de impressas é UM documento por cozinha, regravado inteiro a cada
//  etiqueta, com controle de versão (migração 8). Quando dois aparelhos
//  gravam em cima da mesma versão, o banco recusa o segundo ("conflito").
//
//  ⚠️ O DEFEITO (23/09/2026): no conflito o app trocava a lista do aparelho
//  pela do servidor. O caso comum com dois aparelhos: o A entra no descanso de
//  tela, o B imprime, o A acorda e imprime → conflito → a etiqueta que o A
//  acabou de imprimir SUMIA da aba Impressas, e aparecia "Outro aparelho
//  alterou este catálogo. Refaça sua alteração". A pessoa reimprimia: pote
//  com etiqueta em dobro, contada duas vezes no relatório. O mesmo acontecia
//  num aparelho só, imprimindo duas vezes em menos de um segundo.
//
//  A saída: cada aparelho guarda as SUAS mudanças ainda não confirmadas pelo
//  servidor ("pendências": etiquetas novas ou alteradas, e as apagadas). No
//  conflito, a lista do servidor recebe essas pendências por cima e é gravada
//  de novo. Etiqueta apagada em outro aparelho não ressuscita, porque só entra
//  o que ESTE aparelho mudou.
//
//  Funções PURAS (o projeto não tem jsdom) — o AppContext só as chama.
// =====================================================================

/** Chave da lista de impressas de qualquer cozinha ('etiquetasImpressas' ou 'seco::etiquetasImpressas'). */
export const ehChaveImpressas = (chave) =>
  chave === 'etiquetasImpressas' || String(chave || '').endsWith('::etiquetasImpressas');

/** Onde as pendências de uma chave ficam guardadas no aparelho. */
export const chavePendencias = (chave) => `_pend::${chave}`;

export const PENDENCIAS_VAZIAS = Object.freeze({ up: {}, rm: [] });

export const semPendencias = (pend) =>
  !pend || (Object.keys(pend.up || {}).length === 0 && (pend.rm || []).length === 0);

// Comparação que não depende da ordem das chaves: o banco (JSONB) devolve os
// campos em outra ordem, e sem isto toda etiqueta pareceria "alterada".
function estavel(v) {
  if (Array.isArray(v)) return `[${v.map(estavel).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${estavel(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}
export const iguais = (a, b) => estavel(a) === estavel(b);

const porId = (lista) => {
  const m = new Map();
  for (const e of Array.isArray(lista) ? lista : []) if (e && e.id != null) m.set(String(e.id), e);
  return m;
};

/**
 * O que ESTE aparelho mudou ao trocar `anterior` por `nova`: etiquetas novas
 * ou alteradas (`up`) e ids que saíram (`rm`).
 */
export function diferencaImpressas(anterior, nova) {
  const antes = porId(anterior);
  const depois = porId(nova);
  const up = [];
  for (const [id, e] of depois) {
    const velha = antes.get(id);
    if (!velha || !iguais(velha, e)) up.push(e);
  }
  const rm = [...antes.keys()].filter(id => !depois.has(id));
  return { up, rm };
}

/** Soma uma diferença às pendências que já estavam guardadas. */
export function acumularPendencias(pend, { up = [], rm = [] }) {
  const base = pend || PENDENCIAS_VAZIAS;
  const novoUp = { ...(base.up || {}) };
  const novoRm = new Set(base.rm || []);
  for (const e of up) { novoUp[String(e.id)] = e; novoRm.delete(String(e.id)); }
  for (const id of rm) { delete novoUp[String(id)]; novoRm.add(String(id)); }
  return { up: novoUp, rm: [...novoRm] };
}

/**
 * A lista do servidor com as mudanças deste aparelho por cima.
 *
 * Ordem: a do servidor (alterada no lugar), e as etiquetas que o servidor
 * ainda não conhece no fim — como o app sempre acrescentou. Sem pendência,
 * devolve a MESMA lista (o chamador usa isso para saber se precisa regravar).
 */
export function aplicarPendencias(servidor, pend) {
  const lista = Array.isArray(servidor) ? servidor : [];
  if (semPendencias(pend)) return lista;
  const rm = new Set((pend.rm || []).map(String));
  const up = pend.up || {};
  const noServidor = new Set();
  const resultado = [];
  for (const e of lista) {
    if (!e || e.id == null) { resultado.push(e); continue; }
    const id = String(e.id);
    noServidor.add(id);
    if (rm.has(id)) continue;
    resultado.push(Object.prototype.hasOwnProperty.call(up, id) ? up[id] : e);
  }
  for (const [id, e] of Object.entries(up)) {
    if (!noServidor.has(id) && !rm.has(id)) resultado.push(e);
  }
  return resultado;
}

/**
 * Tira das pendências o que o servidor já tem: a gravação de `enviado` deu
 * certo. Só sai a pendência IGUAL ao que foi enviado — uma etiqueta alterada
 * de novo depois do envio continua pendente.
 */
export function limparConfirmadas(pend, enviado) {
  if (semPendencias(pend)) return pend || PENDENCIAS_VAZIAS;
  const enviados = porId(enviado);
  const up = {};
  for (const [id, e] of Object.entries(pend.up || {})) {
    if (!enviados.has(id) || !iguais(enviados.get(id), e)) up[id] = e;
  }
  const rm = (pend.rm || []).filter(id => enviados.has(id));
  return { up, rm };
}

/**
 * Plano B, para item da fila offline gravado ANTES desta versão (sem
 * pendências guardadas): junta as duas listas sem apagar nada. O servidor
 * vale para quem está nos dois; o que só este aparelho tem entra no fim.
 */
export function unirImpressas(servidor, local) {
  const lista = Array.isArray(servidor) ? servidor : [];
  const ids = new Set(lista.filter(e => e && e.id != null).map(e => String(e.id)));
  const soAqui = (Array.isArray(local) ? local : []).filter(e => e && e.id != null && !ids.has(String(e.id)));
  return soAqui.length ? [...lista, ...soAqui] : lista;
}
