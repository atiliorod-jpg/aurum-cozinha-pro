// Cálculos de custo do estoque. Funções PURAS — sem React, sem rede.
//
// De onde vem o custo: do documento `precos`, protegido pela migração 20 (a
// linha não sai do servidor para quem não tem `verFinanceiro`). Cada entrada é
// gravada na COMPRA, com a unidade em que a compra foi feita:
//
//   precos = { <produtoId>: { custo, unidade, em, fornecedor } }
//
// ⚠️ O PONTO DELICADO É A UNIDADE. A compra é registrada na unidade do
// fornecedor (kg de picanha) e o estoque na unidade de uso (porção). Multiplicar
// um pelo outro sem conferir produz um número errado com cara de certo — que é
// o pior tipo de erro num relatório financeiro, porque ninguém desconfia.
// Por isso `custoUnitario` devolve null quando não dá para converter, e quem
// soma precisa dizer na tela o que ficou de fora.

/** Converte o custo da unidade da COMPRA para a unidade do ESTOQUE. */
export function custoUnitario(produto, registro) {
  if (!produto || !registro) return null;
  const custo = Number(registro.custo);
  if (!Number.isFinite(custo) || custo <= 0) return null;

  const daCompra = String(registro.unidade || '').trim().toLowerCase();
  const doEstoque = String(produto.unidade || '').trim().toLowerCase();
  if (!daCompra || !doEstoque) return null;

  if (daCompra === doEstoque) return custo;

  // Único caso convertível com o que o catálogo já guarda: comprado a granel
  // (kg) e estocado por peça, com o peso da peça cadastrado em gramas.
  const peso = Number(produto.pesoUnidade);
  if (daCompra === 'kg' && doEstoque === 'unid' && Number.isFinite(peso) && peso > 0) {
    return custo * (peso / 1000);
  }
  if (daCompra === 'unid' && doEstoque === 'kg' && Number.isFinite(peso) && peso > 0) {
    return custo / (peso / 1000);
  }

  // Litro x quilo exigiria densidade, que o app não guarda. Devolver um número
  // aqui seria inventar dado.
  return null;
}

const arred2 = (n) => Math.round(n * 100) / 100;

/**
 * Quanto há parado na prateleira, em R$.
 *
 * Devolve TAMBÉM o que não deu para calcular (`semCusto`) — um total que
 * esconde os itens sem preço mente por omissão, e é justamente onde mora o
 * dinheiro que ninguém está vendo.
 */
export function valorDoEstoque(produtos, estoque, precos) {
  const itens = [];
  const semCusto = [];
  let total = 0;
  const porCategoria = {};

  (produtos || []).forEach(p => {
    if (!p || p.ativo === false) return;
    const qtd = Number(estoque?.[p.id]) || 0;
    const unit = custoUnitario(p, precos?.[p.id]);
    if (unit == null) {
      // Só interessa avisar sobre o que EXISTE na prateleira: item zerado sem
      // preço é ruído, e uma lista cheia de ruído deixa de ser lida.
      if (qtd > 0) semCusto.push({ id: p.id, nome: p.nome, quantidade: qtd, unidade: p.unidade });
      return;
    }
    const valor = arred2(qtd * unit);
    total += valor;
    const cat = p.categoria || 'SEM CATEGORIA';
    porCategoria[cat] = arred2((porCategoria[cat] || 0) + valor);
    itens.push({ id: p.id, nome: p.nome, categoria: cat, quantidade: qtd, unidade: p.unidade, custoUnit: unit, valor });
  });

  itens.sort((a, b) => b.valor - a.valor);
  return { total: arred2(total), porCategoria, itens, semCusto };
}

/**
 * Curva ABC — onde o dinheiro está concentrado.
 *
 * A = os itens que somam os primeiros 80% do valor; B = até 95%; C = o resto.
 * Serve para decidir onde apertar o controle: contar A toda semana e C uma vez
 * por mês costuma render mais do que contar tudo com a mesma frequência.
 *
 * A classificação é pelo ACUMULADO: o item que CRUZA a fronteira ainda entra na
 * classe de baixo. Sem isso, um item sozinho com 85% do valor cairia em B e a
 * classe A ficaria vazia — a curva diria o contrário do que o dinheiro diz.
 */
export function curvaABC(itens) {
  const lista = [...(itens || [])].filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = lista.reduce((s, i) => s + i.valor, 0);
  if (!total) return [];
  let acumulado = 0;
  return lista.map(i => {
    const antes = acumulado;
    acumulado += i.valor;
    const pctAcumulado = (acumulado / total) * 100;
    const classe = antes / total < 0.8 ? 'A' : (antes / total < 0.95 ? 'B' : 'C');
    return { ...i, pct: arred2((i.valor / total) * 100), pctAcumulado: arred2(pctAcumulado), classe };
  });
}

/**
 * Quanto custou o que saiu/estragou num período.
 *
 * `registros` são lançamentos com `itens: [{produtoId, quantidade}]` (saídas,
 * produção) OU com `produtoId`/`quantidade` na raiz (perdas, aparas) — as duas
 * formas convivem na base desde antes do multi-módulo.
 */
export function custoDosRegistros(registros, produtos, precos, { de, ate, compras } = {}) {
  const porId = new Map((produtos || []).map(p => [p.id, p]));
  const porCompra = new Map((compras || []).filter(c => c && c.id).map(c => [c.id, c]));
  let total = 0;
  const porProduto = {};
  let semCusto = 0;

  const somar = (produtoId, quantidade) => {
    const p = porId.get(produtoId);
    const unit = custoUnitario(p, precos?.[produtoId]);
    const qtd = Number(quantidade) || 0;
    if (!p || unit == null || qtd <= 0) { if (qtd > 0) semCusto++; return; }
    const valor = arred2(qtd * unit);
    total += valor;
    porProduto[produtoId] = arred2((porProduto[produtoId] || 0) + valor);
  };

  (registros || []).forEach(r => {
    if (!r) return;
    if (de && r.data && r.data < de) return;
    if (ate && r.data && r.data > ate) return;
    if (Array.isArray(r.itens) && r.itens.length) r.itens.forEach(i => somar(i.produtoId, i.quantidade));
    else if (r.produtoId) somar(r.produtoId, r.quantidade);
    else {
      // Perda no RECEBIMENTO nunca tem produtoId: OrigemCorrecao limpa o campo
      // e o formulário troca o seletor de produto pelo de COMPRA. Ela caía fora
      // dos dois ramos acima — não somava e nem contava como "sem custo" — e o
      // card do Financeiro imprimia "R$ 0,00 · nada registrado" num mês em que
      // a cozinha jogou 40 kg de matéria-prima fora no recebimento.
      const qtd = Number(r.quantidade) || 0;
      if (qtd <= 0) return;
      const c = r.compraId ? porCompra.get(r.compraId) : null;
      const qtdCompra = Number(c?.quantidade);
      const valorCompra = Number(c?.valorTotal);
      // Só custeia quando a unidade da perda BATE com a da compra: o custo da
      // compra é por caixa, e dividir kg por ele daria valor inventado. Unidade
      // ausente assume a da compra (registro antigo não tinha o campo).
      const mesmaUnidade = !r.unidade || !c?.unidade
        || String(r.unidade).toLowerCase() === String(c.unidade).toLowerCase();
      if (!c || !mesmaUnidade || !(qtdCompra > 0) || !(valorCompra > 0)) { semCusto++; return; }
      total += arred2(qtd * (valorCompra / qtdCompra));
      // sem produtoId não há a quem atribuir na curva ABC — entra só no total
    }
  });

  return { total: arred2(total), porProduto, semCusto };
}

/**
 * Registro de preço a partir de uma compra.
 *
 * "Última compra" (decisão do dono): o custo mais recente manda. Guarda a data
 * e o fornecedor para a tela poder mostrar DE QUANDO é o número — um custo de
 * seis meses atrás apresentado sem data é pior que custo nenhum, porque parece
 * atual.
 */
export function precoDaCompra(compra) {
  const qtd = Number(compra?.quantidade);
  const valor = Number(compra?.valorTotal);
  if (!compra?.produtoId || !Number.isFinite(qtd) || qtd <= 0) return null;
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return {
    custo: arred2(valor / qtd),
    unidade: compra.unidade || '',
    em: compra.data || '',
    fornecedor: compra.fornecedor || '',
  };
}
