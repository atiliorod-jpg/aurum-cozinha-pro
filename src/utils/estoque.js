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

  [...ajustes].sort((a, b) => ordemTs(a) - ordemTs(b)).forEach(aj => {
    if (estoque[aj.produtoId] !== undefined) {
      estoque[aj.produtoId] = parseFloat(aj.quantidade) || 0;
      baseTs[aj.produtoId] = ordemTs(aj);
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
