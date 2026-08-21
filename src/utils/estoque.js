// Cálculo de estoque puro (testável): base = estoqueInicial do produto,
// sobrescrita pela contagem física mais recente; depois soma entradas e
// abate saídas e perdas de origem 'estoque'. Aparas nunca abatem.

// IDs são `Date.now().toString(36)_random`, então o fallback precisa ler base36
// (não base10) para recuperar o timestamp de registros antigos sem `ts`.
const ordemTs = (r) => {
  if (r.ts) return r.ts;
  if (typeof r.id === 'string') {
    const v = parseInt(r.id.split('_')[0], 36);
    if (!Number.isNaN(v)) return v;
  }
  return 0;
};

export function calcEstoquePuro({ produtos, entradas, saidas, ajustes, desperdicio }) {
  const estoque = {};
  const baseTs = {};

  produtos.forEach(p => {
    estoque[p.id] = parseFloat(p.estoqueInicial) || 0;
    baseTs[p.id] = 0;
  });

  // ⚠️ DUAS FORMAS de contagem convivem, e ignorar uma delas some com o número:
  //   • Inventário (Produção/Seco): um ajuste POR PRODUTO, com produtoId e
  //     quantidade na raiz.
  //   • Fechamento de turno (Finalização): UM ajuste com vários itens[], onde
  //     `quantidade` é a SOBRA contada na bancada.
  // A versão anterior só lia a forma da raiz. Para o fechamento de turno,
  // `aj.produtoId` era undefined, a condição falhava e a contagem inteira era
  // descartada EM SILÊNCIO — a bancada contava a sobra e o estoque continuava
  // mostrando tudo o que havia recebido, sem nunca abater o consumo.
  const contagens = [];
  (ajustes || []).forEach(aj => {
    const t = ordemTs(aj);
    if (Array.isArray(aj.itens) && aj.itens.length) {
      aj.itens.forEach(i => contagens.push({ produtoId: i.produtoId, quantidade: i.quantidade, t }));
    } else if (aj.produtoId) {
      contagens.push({ produtoId: aj.produtoId, quantidade: aj.quantidade, t });
    }
  });
  contagens.sort((a, b) => a.t - b.t).forEach(c => {
    if (estoque[c.produtoId] !== undefined) {
      estoque[c.produtoId] = parseFloat(c.quantidade) || 0;
      baseTs[c.produtoId] = c.t;
    }
  });

  entradas.forEach(e => {
    const t = ordemTs(e);
    (e.itens || []).forEach(item => {
      if (estoque[item.produtoId] !== undefined && t > baseTs[item.produtoId]) {
        estoque[item.produtoId] += parseFloat(item.quantidade) || 0;
      }
    });
  });

  saidas.forEach(s => {
    const t = ordemTs(s);
    (s.itens || []).forEach(item => {
      if (estoque[item.produtoId] !== undefined && t > baseTs[item.produtoId]) {
        estoque[item.produtoId] -= parseFloat(item.quantidade) || 0;
      }
    });
  });

  desperdicio.forEach(r => {
    const t = ordemTs(r);
    if (r.origem === 'estoque' && r.produtoId && estoque[r.produtoId] !== undefined && t > baseTs[r.produtoId]) {
      estoque[r.produtoId] -= parseFloat(r.quantidade) || 0;
    }
  });

  return estoque;
}
