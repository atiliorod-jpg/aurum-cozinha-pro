// Relatórios "por destino" e "chegadas por dia" — funções puras, testáveis.
// Base para os relatórios de movimentação sem misturar destinos e para o
// controle diário do que chega (peso). Servem também de fundação para os
// relatórios futuros (quinzenal/mensal por item, rendimento x aparas).

// Saídas agrupadas por DESTINO e, dentro de cada destino, por DIA.
// Ignora as saídas internas de produção (destino 'producao'), que não são
// transferência para uma unidade. Não mistura destinos: cada um é um bloco.
export function saidasPorDestinoDia(saidas, produtos, locais) {
  const nomeProd = (id) => (produtos.find(p => p.id === id)?.nome) || id;
  const nomeDest = (id) => (locais.find(l => l.id === id)?.nome) || id;
  const porDestino = new Map();

  for (const s of saidas) {
    if (!s.destino || s.destino === 'producao') continue;
    if (!porDestino.has(s.destino)) porDestino.set(s.destino, new Map()); // data -> (produtoId -> qtd)
    const dias = porDestino.get(s.destino);
    const dia = s.data || '—';
    if (!dias.has(dia)) dias.set(dia, new Map());
    const itens = dias.get(dia);
    for (const it of (s.itens || [])) {
      itens.set(it.produtoId, (itens.get(it.produtoId) || 0) + (Number(it.quantidade) || 0));
    }
  }

  return [...porDestino.entries()].map(([destino, dias]) => {
    const totalPorItem = new Map();
    const diasArr = [...dias.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // dia mais recente primeiro
      .map(([data, itensMap]) => {
        const itens = [...itensMap.entries()].map(([pid, q]) => {
          totalPorItem.set(pid, (totalPorItem.get(pid) || 0) + q);
          return { produtoId: pid, nome: nomeProd(pid), quantidade: q };
        }).sort((a, b) => b.quantidade - a.quantidade);
        return { data, itens };
      });
    return {
      destinoId: destino,
      destinoNome: nomeDest(destino),
      dias: diasArr,
      totalPorItem: [...totalPorItem.entries()]
        .map(([pid, q]) => ({ produtoId: pid, nome: nomeProd(pid), quantidade: q }))
        .sort((a, b) => b.quantidade - a.quantidade),
    };
  }).sort((a, b) => a.destinoNome.localeCompare(b.destinoNome));
}

// Rendimento POR ITEM (matéria-prima) no período: quanto chegou, quanto virou
// apara e perda associada (ligadas à compra por compraId) e o rendimento %.
// Mesma régua do rendimento por fornecedor, só que agrupado por item.
export function rendimentoPorItem(compras, aparas, desperdicio) {
  const num = (v) => Number(v) || 0;
  const aparaPorCompra = {}, perdaPorCompra = {};
  (aparas || []).forEach(a => { if (a.compraId) aparaPorCompra[a.compraId] = (aparaPorCompra[a.compraId] || 0) + num(a.quantidade); });
  (desperdicio || []).forEach(d => { if (d.compraId) perdaPorCompra[d.compraId] = (perdaPorCompra[d.compraId] || 0) + num(d.quantidade); });

  const porItem = {};
  (compras || []).forEach(c => {
    const nome = (c.item || '').trim() || '(sem nome)';
    const chave = nome.toLowerCase();
    if (!porItem[chave]) porItem[chave] = { item: nome, unidade: c.unidade || '', comprado: 0, aparas: 0, perdas: 0, n: 0 };
    const g = porItem[chave];
    g.comprado += num(c.quantidade);
    g.aparas += aparaPorCompra[c.id] || 0;
    g.perdas += perdaPorCompra[c.id] || 0;
    g.n++;
  });

  return Object.values(porItem).map(g => {
    const correcao = g.aparas + g.perdas;
    return { ...g, correcao, rendimento: g.comprado > 0 ? (1 - correcao / g.comprado) * 100 : null };
  }).sort((a, b) => b.comprado - a.comprado);
}

// Produção POR ITEM no período: soma o que foi produzido de cada produto final
// (entradas geradas por uma produção). Base do "quanto produzi de cada item".
export function producaoPorItem(entradas, produtos) {
  const nomeProd = (id) => (produtos.find(p => p.id === id)?.nome) || id;
  const unProd = (id) => (produtos.find(p => p.id === id)?.unidade) || '';
  const m = {};
  (entradas || []).filter(e => e.producaoId).forEach(e => {
    (e.itens || []).forEach(it => {
      m[it.produtoId] = (m[it.produtoId] || 0) + (Number(it.quantidade) || 0);
    });
  });
  return Object.entries(m)
    .map(([pid, q]) => ({ produtoId: pid, nome: nomeProd(pid), unidade: unProd(pid), quantidade: q }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

// Chegadas (compras) agrupadas por DIA, com o peso total em kg do dia.
// Serve para o controle diário do que chegou em cada data do calendário.
export function chegadasPorDia(compras) {
  const porDia = new Map(); // data -> { itens: [], pesoKg }
  for (const c of compras) {
    const dia = c.data || '—';
    if (!porDia.has(dia)) porDia.set(dia, { itens: [], pesoKg: 0 });
    const reg = porDia.get(dia);
    reg.itens.push({ item: c.item, quantidade: Number(c.quantidade) || 0, unidade: c.unidade, fornecedor: c.fornecedor || '' });
    if (c.unidade === 'kg') reg.pesoKg += Number(c.quantidade) || 0;
  }
  return [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // dia mais recente primeiro
    .map(([data, reg]) => ({ data, itens: reg.itens, pesoKg: reg.pesoKg }));
}
