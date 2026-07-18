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
