// Controle de lotes por validade (FEFO — vence primeiro, sai primeiro).
//
// Cada item de entrada com validade vira um lote. As saídas e perdas de
// estoque consomem os lotes em ordem de vencimento, na ordem em que os
// eventos aconteceram. Assim, "20 charques venc. 20/06 + 20 venc. 26/06"
// com uma saída de 19 deixa 1 no lote de 20/06 e 20 no de 26/06 — e uma
// saída de 20 zera o primeiro lote sozinha.

const num = (v) => parseFloat(v) || 0;

export function calcLotes(entradas, saidas, desperdicio, produtos = []) {
  const eventos = [];

  entradas.forEach(e => {
    (e.itens || []).forEach(it => {
      if (!it.validade) return;
      eventos.push({
        ts: e.ts || 0, tipo: 'in', produtoId: it.produtoId,
        qtd: num(it.quantidade), validade: it.validade,
        dataEntrada: e.data, armazenamento: e.armazenamento,
      });
    });
  });
  saidas.forEach(s => {
    (s.itens || []).forEach(it => {
      eventos.push({ ts: s.ts || 0, tipo: 'out', produtoId: it.produtoId, qtd: num(it.quantidade) });
    });
  });
  desperdicio.forEach(d => {
    if (d.origem === 'estoque' && d.produtoId) {
      eventos.push({ ts: d.ts || 0, tipo: 'out', produtoId: d.produtoId, qtd: num(d.quantidade) });
    }
  });

  eventos.sort((a, b) => a.ts - b.ts);

  const lotes = {}; // produtoId -> [{ validade, restante, original, dataEntrada, armazenamento }]
  eventos.forEach(ev => {
    const arr = (lotes[ev.produtoId] = lotes[ev.produtoId] || []);
    if (ev.tipo === 'in') {
      arr.push({
        validade: ev.validade, restante: ev.qtd, original: ev.qtd,
        dataEntrada: ev.dataEntrada, armazenamento: ev.armazenamento,
      });
      arr.sort((a, b) => a.validade.localeCompare(b.validade));
    } else {
      // consome FEFO: primeiro o lote que vence antes
      let q = ev.qtd;
      for (const l of arr) {
        if (q <= 0) break;
        const tira = Math.min(l.restante, q);
        l.restante -= tira;
        q -= tira;
      }
    }
  });

  const prodMap = {};
  produtos.forEach(p => { prodMap[p.id] = p; });

  Object.keys(lotes).forEach(k => {
    const threshold = prodMap[k]?.unidade === 'unid' ? 1 : 0.001;
    lotes[k] = lotes[k].filter(l => l.restante >= threshold);
  });
  return lotes;
}

// Lotes "vencendo" para alertas de UI, reconciliados com o ESTOQUE CALCULADO.
// calcLotes não enxerga a contagem física (ajustes) — após um inventário que
// zera um produto, o lote antigo continuaria "vencendo" e o operador leria
// como erro do sistema. Aqui o alerta só sai se o estoque atual for positivo.
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
