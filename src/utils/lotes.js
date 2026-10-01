// Controle de lotes por validade (FEFO — vence primeiro, sai primeiro).
//
// ⚠️ BAIXA PELA ETIQUETA (M59, 30/09/2026): a saída ou a perda lançada pela
// leitura do QR sabe a VALIDADE da embalagem que saiu (`validade` no item).
// Ela abate primeiro o lote dessa validade — senão o estoque tiraria o que
// vence antes e as datas da prateleira deixariam de bater com as do sistema.
// Sem lote daquela validade (etiqueta impressa com outra data), o resto cai no
// FEFO de sempre. Lançamento sem validade continua só FEFO.
//
// ⚠️ A VALIDADE CHEGA À FINALIZAÇÃO (2ª etapa, 01/10/2026):
//  • A saída MANUAL para uma Finalização grava em `porValidade` de quais
//    lotes ela saiu (os que vencem primeiro — a mesma sugestão "← pegar
//    deste" da tela). Do lado de lá, cada parte vira um lote com a data certa.
//  • CONTAGEM ACERTA OS LOTES. O Inventário e o Fechar Turno dizem quanto
//    sobrou de verdade; se os lotes somam mais, o excesso sai dos que vencem
//    PRIMEIRO (decisão do dono: a regra é "o que vence primeiro sai
//    primeiro", então o que ficou é o mais novo). Sem isto a Finalização —
//    que só consome pela contagem — mostraria para sempre tudo o que já
//    recebeu, e a Produção guardava o "lote fantasma" depois do Inventário.
//
// Cada item de entrada com validade vira um lote. As saídas e perdas de
// estoque consomem os lotes em ordem de vencimento, na ordem em que os
// eventos aconteceram. Assim, "20 charques venc. 20/06 + 20 venc. 26/06"
// com uma saída de 19 deixa 1 no lote de 20/06 e 20 no de 26/06 — e uma
// saída de 20 zera o primeiro lote sozinha.

import { ordemTs } from './estoque';

const num = (v) => parseFloat(v) || 0;
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Parte uma quantidade pelos lotes que vencem primeiro — o que a tela de
 * Saídas já sugere com "← pegar deste". Devolve só as partes que têm lote;
 * o que passar dos lotes fica sem validade conhecida (não se inventa data).
 */
export function partirPorValidade(quantidade, lotesDoProduto = []) {
  let resto = r3(num(quantidade));
  const porVal = new Map();
  const ordenados = [...(lotesDoProduto || [])]
    .filter(l => l && l.validade && num(l.restante) > 0)
    .sort((a, b) => a.validade.localeCompare(b.validade));
  for (const l of ordenados) {
    if (resto <= 0) break;
    const q = r3(Math.min(num(l.restante), resto));
    if (q <= 0) continue;
    const ant = porVal.get(l.validade);
    porVal.set(l.validade, {
      validade: l.validade,
      quantidade: r3((ant?.quantidade || 0) + q),
      ...(ant?.armazenamento || l.armazenamento ? { armazenamento: ant?.armazenamento || l.armazenamento } : {}),
    });
    resto = r3(resto - q);
  }
  return [...porVal.values()];
}

/** As partes com validade de um item, e o que sobra sem validade conhecida. */
export function partesDoItem(it) {
  const q = r3(num(it?.quantidade));
  if (Array.isArray(it?.porValidade) && it.porValidade.length) {
    let soma = 0;
    const partes = [];
    for (const p of it.porValidade) {
      const pq = r3(Math.min(num(p?.quantidade), q - soma));
      if (!p?.validade || pq <= 0) continue;
      partes.push({ validade: p.validade, qtd: pq, armazenamento: p.armazenamento });
      soma = r3(soma + pq);
    }
    return { partes, semValidade: r3(Math.max(0, q - soma)) };
  }
  if (it?.validade) return { partes: [{ validade: it.validade, qtd: q }], semValidade: 0 };
  return { partes: [], semValidade: q };
}

/** As contagens nas duas formas (Inventário na raiz, Fechar Turno em itens[]). */
function contagensDe(ajustes) {
  const out = [];
  (ajustes || []).forEach(aj => {
    if (!aj) return;
    const ts = ordemTs(aj);
    if (Array.isArray(aj.itens) && aj.itens.length) {
      aj.itens.forEach(i => { if (i?.produtoId) out.push({ ts, produtoId: i.produtoId, qtd: num(i.quantidade) }); });
    } else if (aj.produtoId) {
      out.push({ ts, produtoId: aj.produtoId, qtd: num(aj.quantidade) });
    }
  });
  return out;
}

// tira `qtd` dos lotes: primeiro os da validade pedida, depois FEFO
function tirar(arr, qtd, validade) {
  let q = qtd;
  if (validade) {
    for (const l of arr) {
      if (q <= 0) break;
      if (l.validade !== validade) continue;
      const t = Math.min(l.restante, q);
      l.restante = r3(l.restante - t);
      q = r3(q - t);
    }
  }
  for (const l of arr) {
    if (q <= 0) break;
    const t = Math.min(l.restante, q);
    l.restante = r3(l.restante - t);
    q = r3(q - t);
  }
}

/**
 * Lotes vivos por produto.
 * `ajustes` (opcional): as contagens — acertam os lotes ao que foi contado.
 * No mesmo instante, entradas e saídas vêm ANTES da contagem (a contagem é
 * a fotografia do que já tinha acontecido — o mesmo `t > baseTs` do estoque).
 */
export function calcLotes(entradas, saidas, desperdicio, produtos = [], ajustes = []) {
  const eventos = [];
  let seq = 0;

  (entradas || []).forEach(e => {
    const ts = ordemTs(e);
    (e.itens || []).forEach(it => {
      partesDoItem(it).partes.forEach(p => eventos.push({
        ts, ordem: 0, seq: seq++, tipo: 'in', produtoId: it.produtoId, qtd: p.qtd, validade: p.validade,
        dataEntrada: e.data, armazenamento: p.armazenamento || it.armazenamento || e.armazenamento,
      }));
    });
  });
  (saidas || []).forEach(s => {
    const ts = ordemTs(s);
    (s.itens || []).forEach(it => {
      const { partes, semValidade } = partesDoItem(it);
      partes.forEach(p => eventos.push({ ts, ordem: 0, seq: seq++, tipo: 'out', produtoId: it.produtoId, qtd: p.qtd, validade: p.validade }));
      if (semValidade > 0) eventos.push({ ts, ordem: 0, seq: seq++, tipo: 'out', produtoId: it.produtoId, qtd: semValidade, validade: null });
    });
  });
  (desperdicio || []).forEach(d => {
    if (d.origem === 'estoque' && d.produtoId) {
      eventos.push({ ts: ordemTs(d), ordem: 0, seq: seq++, tipo: 'out', produtoId: d.produtoId, qtd: num(d.quantidade), validade: d.validade || null });
    }
  });
  contagensDe(ajustes).forEach(c => eventos.push({ ...c, ordem: 1, seq: seq++, tipo: 'conta' }));

  eventos.sort((a, b) => a.ts - b.ts || a.ordem - b.ordem || a.seq - b.seq);

  const lotes = {}; // produtoId -> [{ validade, restante, original, dataEntrada, armazenamento }]
  eventos.forEach(ev => {
    let arr = lotes[ev.produtoId];
    if (ev.tipo === 'in') {
      if (!arr) arr = lotes[ev.produtoId] = [];
      if (!(ev.qtd > 0)) return;
      const novo = {
        validade: ev.validade, restante: ev.qtd, original: ev.qtd,
        dataEntrada: ev.dataEntrada, armazenamento: ev.armazenamento,
      };
      // entra já no lugar (ordem de vencimento; empate fica na ordem de chegada)
      const i = arr.findIndex(l => l.validade.localeCompare(novo.validade) > 0);
      if (i < 0) arr.push(novo); else arr.splice(i, 0, novo);
      return;
    }
    if (!arr || !arr.length) return;
    if (ev.tipo === 'out') {
      tirar(arr, ev.qtd, ev.validade);
    } else {
      // contagem: o que sobrou é o mais novo — o excesso sai dos que vencem primeiro
      const total = r3(arr.reduce((s, l) => s + l.restante, 0));
      if (total > ev.qtd) tirar(arr, r3(total - Math.max(0, ev.qtd)), null);
    }
    lotes[ev.produtoId] = arr.filter(l => l.restante > 0);
  });

  const prodMap = {};
  produtos.forEach(p => { prodMap[p.id] = p; });

  Object.keys(lotes).forEach(k => {
    const threshold = prodMap[k]?.unidade === 'unid' ? 1 : 0.001;
    lotes[k] = lotes[k].filter(l => l.restante >= threshold);
  });
  return lotes;
}

/**
 * Quanto do estoque NÃO tem validade conhecida (chegou por saída antiga, sem
 * lote, ou entrou sem data). A tela mostra "X sem validade conhecida" em vez
 * de fingir que tudo tem data.
 */
export function semValidadeConhecida(estoqueDoProduto, lotesDoProduto = [], unidade = '') {
  const comLote = (lotesDoProduto || []).reduce((s, l) => s + num(l.restante), 0);
  const resto = r3(num(estoqueDoProduto) - comLote);
  const limiar = unidade === 'unid' ? 1 : 0.001;
  return resto >= limiar ? resto : 0;
}

// Lotes "vencendo" para alertas de UI, reconciliados com o ESTOQUE CALCULADO.
// Segunda trava, além da contagem que calcLotes já acerta: o produto zerado
// (inventário que zera, estoque inicial negativo) não gera alerta fantasma.
// Aqui o alerta só sai se o estoque atual for positivo.
export function lotesVencendo(lotes, produtos, estoque, diasAteFn, limiteDias = 5) {
  const lista = [];
  produtos.forEach(p => {
    if (!p.ativo) return;
    const limiar = p.unidade === 'unid' ? 1 : 0.001;
    if ((estoque[p.id] ?? 0) < limiar) return; // zerado (ex.: por contagem) → sem alerta fantasma
    (lotes[p.id] || []).forEach(l => {
      const dias = diasAteFn(l.validade);
      if (dias <= limiteDias) lista.push({ p, lote: l, dias });
    });
  });
  return lista.sort((a, b) => a.dias - b.dias);
}
