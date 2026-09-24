// =====================================================================
//  ETIQUETAS IMPRESSAS EM LINHAS (M49, 24/09/2026) — as regras puras
//
//  A lista de impressas de cada cozinha deixou de ser UM documento regravado
//  inteiro a cada etiqueta (0,6 a 1,5 MB depois de um mês, mandado aos outros
//  aparelhos a cada toque) e virou a tabela `etiquetas`, uma linha por
//  etiqueta. Imprimir manda só as novas; o tempo real manda só a linha que
//  mudou. Ver src/lib/migration49_etiquetas_em_linhas.sql.
//
//  O documento antigo FICA, só para leitura: aparelho com a versão velha do
//  app que ainda grave nele tem as etiquetas absorvidas (mesmo
//  `registrar_etiquetas`, que ignora id repetido).
// =====================================================================

import { podarEtiquetas } from './etiquetas';

/** O documento antigo da lista de impressas, de qualquer cozinha. */
export const ehChaveImpressas = (chave) =>
  chave === 'etiquetasImpressas' || String(chave || '').endsWith('::etiquetasImpressas');

/** A cozinha dona de um documento antigo: 'etiquetasImpressas' é a Produção raiz. */
export const cozinhaDaChaveImpressas = (chave) =>
  (chave === 'etiquetasImpressas' ? 'producao' : String(chave || '').split('::')[0]);

/** A linha do banco vira a etiqueta que as telas conhecem. */
export const linhaParaEtiqueta = (linha) => ({
  ...((linha && typeof linha.dados === 'object' && linha.dados) || {}),
  id: linha?.id,
  status: linha?.status || 'valida',
});

const diasAntes = (hojeISO, dias) =>
  new Date(Date.parse(`${hojeISO}T12:00:00Z`) - dias * 86400000).toISOString().slice(0, 10);

/**
 * Que linhas a tela precisa: as impressas nos últimos 120 dias, ou com
 * vencimento de 30 dias atrás em diante (congelado de 6 meses ainda na
 * câmara). É o mesmo recorte de `podarEtiquetas` — o banco guarda mais, a
 * tela recebe só o que usa.
 */
export function janelaDaLista(hojeISO) {
  return { impressasDesde: diasAntes(hojeISO, 120), vencidasDesde: diasAntes(hojeISO, 30) };
}

/**
 * Etiquetas do documento ANTIGO que ainda não viraram linha (aparelho com a
 * versão velha do app gravou depois da M49). Só as que a tela ainda mostraria.
 */
export function etiquetasDoDocumentoAntigo(dadosDoDocumento, idsConhecidos, hojeISO) {
  const lista = Array.isArray(dadosDoDocumento) ? dadosDoDocumento : [];
  const conhecidos = idsConhecidos instanceof Set ? idsConhecidos : new Set(idsConhecidos || []);
  const vistos = new Set();
  const novas = lista.filter(e => {
    if (!e || !e.id || conhecidos.has(e.id) || vistos.has(e.id)) return false;
    vistos.add(e.id);
    return true;
  });
  return podarEtiquetas(novas, hojeISO);
}

/** Acrescenta à lista SEM repetir id (imprimir de novo na mesma janela usa o mesmo QR). */
export function juntarNaLista(lista, novas, hojeISO) {
  const atual = Array.isArray(lista) ? lista : [];
  const ids = new Set(atual.map(e => e?.id));
  const somar = (novas || []).filter(e => e && e.id && !ids.has(e.id) && ids.add(e.id));
  return podarEtiquetas([...atual, ...somar], hojeISO);
}

/** A linha que chegou pelo tempo real, aplicada à lista (nova, alterada ou apagada). */
export function aplicarLinhaNaLista(lista, linha) {
  const atual = Array.isArray(lista) ? lista : [];
  if (!linha || !linha.id) return atual;
  const sem = atual.filter(e => e?.id !== linha.id);
  if (linha.apagada_em) return sem.length === atual.length ? atual : sem;
  const etq = linhaParaEtiqueta(linha);
  const i = atual.findIndex(e => e?.id === linha.id);
  if (i < 0) return [...atual, etq];
  const copia = [...atual];
  copia[i] = etq;
  return copia;
}

/** Em lotes do tamanho que a função do banco aceita. */
export function emLotes(lista, tamanho = 400) {
  const saida = [];
  for (let i = 0; i < (lista || []).length; i += tamanho) saida.push(lista.slice(i, i + tamanho));
  return saida;
}
