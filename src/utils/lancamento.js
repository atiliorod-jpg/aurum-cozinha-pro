// =====================================================================
//  RESUMO DO LANÇAMENTO (Lote 5 da auditoria, 14/10/2026)
//
//  O pé de todo formulário de lançamento diz, antes do toque, o que vai ser
//  gravado: "3 itens · 12 unid + 2,5 kg → Unidade Centro". Antes cada tela
//  tinha (ou não) uma caixa "Itens a registrar" no fim da rolagem, longe do
//  botão — que em umas telas ficava no topo e em outras no fim (U3).
//
//  ⚠️ NUNCA SOMA UNIDADES DIFERENTES: 10 kg de filé + 3 unid de pão viravam
//  "13" no relatório antigo. Aqui cada unidade tem a sua parcela.
// =====================================================================

import { fmtNum, plural } from './formatters';

/** "12 unid + 2,5 kg" — a soma de cada unidade, na ordem em que aparecem. */
export function resumoDeQuantidades(linhas = []) {
  const por = new Map();
  for (const { quantidade, unidade } of linhas) {
    const q = Number(String(quantidade ?? '').replace(',', '.'));
    if (!(q > 0)) continue;
    const u = (unidade || '').trim();
    por.set(u, (por.get(u) || 0) + q);
  }
  return [...por].map(([u, q]) => (u ? `${fmtNum(q)} ${u}` : fmtNum(q))).join(' + ');
}

/**
 * "3 itens · 12 unid + 2,5 kg → Unidade Centro". Vazio quando nada foi
 * preenchido (o pé mostra então o que falta, não um resumo de zero).
 */
export function resumoDoLancamento(linhas = [], destino = '') {
  const preenchidas = linhas.filter(l => Number(String(l.quantidade ?? '').replace(',', '.')) > 0);
  if (!preenchidas.length) return '';
  const texto = `${plural(preenchidas.length, 'item', 'itens')} · ${resumoDeQuantidades(preenchidas)}`;
  return destino ? `${texto} → ${destino}` : texto;
}
