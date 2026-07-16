import { hoje } from './formatters';

const num = (v) => parseFloat(v) || 0;
const DIA_MS = 86400000;

/**
 * Média diária de saídas por produto na janela recente (padrão 14 dias).
 * Diferente das sugestões de mín/máx, funciona desde os primeiros dias de uso
 * (com pelo menos 3 dias de histórico) — serve para prever ruptura.
 */
export function mediaDiariaSaidas(saidas, ref = hoje(), janelaDias = 15) {
  if (!saidas.length) return {};
  const primeira = saidas.reduce((m, s) => (s.data < m ? s.data : m), saidas[0].data);
  const diasObservados = Math.min(janelaDias, Math.round((new Date(ref) - new Date(primeira)) / DIA_MS) + 1);
  if (diasObservados < 3) return {};
  const inicio = new Date(new Date(ref).getTime() - (janelaDias - 1) * DIA_MS).toISOString().slice(0, 10);
  const tot = {};
  saidas.forEach(s => {
    if (s.data < inicio || s.data > ref) return;
    (s.itens || []).forEach(it => {
      tot[it.produtoId] = (tot[it.produtoId] || 0) + num(it.quantidade);
    });
  });
  const m = {};
  Object.entries(tot).forEach(([id, t]) => { m[id] = t / diasObservados; });
  return m;
}

/**
 * Previsão de ruptura: no ritmo atual, em quantos dias o estoque acaba.
 * Retorna só produtos com consumo e estoque positivos, ordenados pelo risco.
 */
export function previsaoRuptura(produtos, estoque, medias) {
  return produtos
    .filter(p => p.ativo && (medias[p.id] || 0) > 0 && (estoque[p.id] ?? 0) > 0)
    .map(p => ({ p, dias: (estoque[p.id] ?? 0) / medias[p.id] }))
    .sort((a, b) => a.dias - b.dias);
}

/**
 * Lista de compras automática: produtos abaixo do mínimo, com a quantidade
 * sugerida para voltar ao máximo (ou ao mínimo, quando não há máximo).
 * Quando compras/aparas/desperdicio são fornecidos, calcula o fator de correção
 * histórico e o kg bruto real a comprar.
 * brutoKg = líquido / (1-FC) / (1-coccão), onde coccão só se aplica quando
 * entradaCozida=true (produto entra no estoque já cozido, ex.: cupim, carne de sol).
 */
export function listaDeCompras(produtos, estoque, compras = [], aparas = [], desperdicio = []) {
  return produtos
    .filter(p => p.ativo && p.min > 0 && (estoque[p.id] ?? 0) < p.min)
    .map(p => {
      const atual = estoque[p.id] ?? 0;
      const alvo = p.max > p.min ? p.max : p.min;
      const liquido = Math.max(alvo - atual, 0);
      const sugerido = p.unidade === 'unid' ? Math.ceil(liquido) : Math.ceil(liquido * 2) / 2;

      // kg líquido equivalente (necessário para calcular bruto)
      const liquidoKg = p.unidade === 'kg'  ? sugerido
        : p.unidade === 'unid' && p.pesoUnidade > 0 ? Math.round(sugerido * p.pesoUnidade / 100) / 10
        : null;

      // FC: manual travado nas Configurações sempre vence; senão o automático
      // (aparas + perdas ligadas ao produto ou a uma compra dele).
      const fc = fcEfetivo(p, compras, aparas, desperdicio);
      // Cocção só entra na compra quando o produto JÁ ENTRA NO ESTOQUE COZIDO
      // (cupim porcionado, carne de sol desfiada etc.) — o cozimento acontece ANTES de entrar no estoque.
      const coccaoFator = p.entradaCozida && p.coccao > 0 ? p.coccao / 100 : 0;
      // kg bruto = líquido / (1 - FC) / (1 - coccão)
      // Cap: bruto nunca pode ser mais que 5× o líquido (combinações absurdas de FC + coccão)
      const brutoKg = liquidoKg != null
        ? Math.min(Math.ceil(liquidoKg / (1 - (fc || 0)) / (1 - coccaoFator) * 10) / 10, liquidoKg * 5)
        : null;

      // Último fornecedor que vendeu este produto (produtoId gravado na compra
      // tem prioridade; compras antigas sem id casam por nome com fronteira de palavra)
      const ultimaCompra = [...compras]
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .find(c => c.produtoId ? c.produtoId === p.id : nomesCasam(c.item, p.nome));

      return { p, atual, sugerido, liquidoKg, brutoKg, fc, fornecedor: ultimaCompra?.fornecedor || null };
    })
    .sort((a, b) => (a.atual / a.p.min) - (b.atual / b.p.min)); // mais crítico primeiro
}

/**
 * Agrupa a lista de compras pela "matéria-prima de compra" (produto.materiaPrima).
 * Vários produtos finais distintos (ex.: "camarão salada" e "camarão yakisoba")
 * que compartilham a mesma matéria-prima ("camarão") viram UMA linha só, somando
 * o bruto a comprar — mas guardam o detalhe de cada produto (itens) para expandir.
 * Produtos sem materiaPrima (ou sozinhos no grupo) saem como item normal.
 *
 * Retorna entradas com `tipo`:
 *  - 'item':  { tipo, ...entradaOriginal }                       (linha simples)
 *  - 'grupo': { tipo, materiaPrima, itens, brutoKg, liquidoKg,   (linha somada)
 *               sugerido, fornecedor, criticidade }
 */
export function agruparListaPorMateriaPrima(lista = []) {
  const grupos = new Map(); // chave normalizada -> { materiaPrima, itens: [] }
  const itens = [];

  lista.forEach(entrada => {
    const mp = (entrada.p.materiaPrima || '').trim();
    if (!mp) { itens.push({ tipo: 'item', ...entrada }); return; }
    const chave = mp.toLowerCase();
    if (!grupos.has(chave)) grupos.set(chave, { materiaPrima: mp, itens: [] });
    grupos.get(chave).itens.push(entrada);
  });

  const criticidadeItem = (e) => (e.p.min > 0 ? e.atual / e.p.min : 0);

  grupos.forEach(g => {
    if (g.itens.length === 1) { itens.push({ tipo: 'item', ...g.itens[0] }); return; }
    const somaKg = (campo) => {
      const vals = g.itens.map(i => i[campo]).filter(v => v != null);
      return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
    };
    const fornecs = [...new Set(g.itens.map(i => i.fornecedor).filter(Boolean))];
    itens.push({
      tipo: 'grupo',
      materiaPrima: g.materiaPrima,
      itens: g.itens,
      brutoKg: somaKg('brutoKg'),
      liquidoKg: somaKg('liquidoKg'),
      sugerido: g.itens.reduce((s, i) => s + (i.sugerido || 0), 0),
      fornecedor: fornecs.length === 1 ? fornecs[0] : null,
      criticidade: Math.min(...g.itens.map(criticidadeItem)),
    });
  });

  const crit = (e) => (e.tipo === 'grupo' ? e.criticidade : criticidadeItem(e));
  return itens.sort((a, b) => crit(a) - crit(b)); // mais crítico primeiro
}

/**
 * Match entre o texto livre de uma compra e o nome de um produto/matéria-prima.
 * Casa quando: são iguais (normalizados) OU o menor é prefixo/sufixo do maior
 * em FRONTEIRA DE PALAVRA ("peito" ⇢ "peito de frango"; "frango" ⇢ "peito de
 * frango"). Substring solta era falso positivo ("sal" casava "salmão").
 */
export function nomesCasam(a, b) {
  const x = (a || '').toLowerCase().trim();
  const y = (b || '').toLowerCase().trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const [menor, maior] = x.length <= y.length ? [x, y] : [y, x];
  if (menor.length < 4) return false;
  return maior.startsWith(menor + ' ') || maior.endsWith(' ' + menor);
}

// Soma de aparas + perdas associadas a cada compra (via compraId)
export function correcoesPorCompra(aparas, desperdicio) {
  const m = {};
  [...aparas, ...desperdicio].forEach(r => {
    if (r.compraId) m[r.compraId] = (m[r.compraId] || 0) + num(r.quantidade);
  });
  return m;
}

/**
 * Rendimento por fornecedor: total comprado, correção (aparas+perdas associadas)
 * e % de rendimento. Quanto maior o rendimento, melhor a matéria-prima entregue.
 */
export function rendimentoPorFornecedor(compras, aparas, desperdicio) {
  const corr = correcoesPorCompra(aparas, desperdicio);
  const porF = {};
  compras.forEach(c => {
    const f = (c.fornecedor || '').trim() || '(sem fornecedor)';
    if (!porF[f]) porF[f] = { fornecedor: f, comprado: 0, correcao: 0, n: 0 };
    porF[f].comprado += num(c.quantidade);
    porF[f].correcao += corr[c.id] || 0;
    porF[f].n++;
  });
  return Object.values(porF)
    .map(x => ({ ...x, rendimento: x.comprado > 0 ? (1 - x.correcao / x.comprado) * 100 : null }))
    .sort((a, b) => b.comprado - a.comprado);
}

/**
 * Fator de correção histórico de uma matéria-prima (proporção 0..1 de
 * aparas/perdas sobre o total comprado). null quando não há dados.
 */
export function fatorCorrecaoItem(materiaPrima, compras, aparas, desperdicio) {
  const corr = correcoesPorCompra(aparas, desperdicio);
  if (!(materiaPrima || '').trim()) return null;
  let comprado = 0, correcao = 0;
  compras.forEach(c => {
    if (nomesCasam(c.item, materiaPrima)) {
      comprado += num(c.quantidade);
      correcao += corr[c.id] || 0;
    }
  });
  if (comprado <= 0 || correcao <= 0) return null;
  return Math.min(correcao / comprado, 0.9);
}

// Compras que correspondem a um produto: produtoId gravado na compra tem
// prioridade absoluta; sem id, casa por nome com fronteira de palavra.
function comprasDoProduto(produto, compras) {
  if (!produto?.id) return [];
  return compras.filter(c => c.produtoId ? c.produtoId === produto.id : nomesCasam(c.item, produto.nome));
}

/**
 * Fator de correção de um PRODUTO (matéria-prima). Diferente de fatorCorrecaoItem,
 * conta as correções ligadas explicitamente ao produto (produtoId) OU a qualquer
 * compra dele (compraId) — incluindo APARAS *e* PERDAS associadas a uma compra.
 * Retorna proporção 0..1, ou null quando não há base de cálculo.
 */
export function fatorCorrecaoProduto(produto, compras = [], aparas = [], desperdicio = []) {
  if (!produto) return null;
  const comprasP = comprasDoProduto(produto, compras);
  const comprado = comprasP.reduce((s, c) => s + num(c.quantidade), 0);
  if (comprado <= 0) return null;
  const idsCompras = new Set(comprasP.map(c => c.id));
  // ligado = aponta para este produto (produtoId) ou para uma compra dele (compraId)
  const ligado = (r) => r.produtoId === produto.id || (r.compraId && idsCompras.has(r.compraId));
  let correcao = 0;
  aparas.forEach(a => { if (ligado(a)) correcao += num(a.quantidade); });
  desperdicio.forEach(d => { if (ligado(d)) correcao += num(d.quantidade); });
  if (correcao <= 0) return null;
  return Math.min(correcao / comprado, 0.9);
}

// FC efetivo de um produto: manual (travado) vence; senão o automático (aparas+perdas).
export function fcEfetivo(produto, compras = [], aparas = [], desperdicio = []) {
  if (produto?.fcManual) return produto.fcMedio || 0;
  return fatorCorrecaoProduto(produto, compras, aparas, desperdicio) || 0;
}

// Agrupa as preparações (fichas técnicas) por matéria-prima.
// Ex.: "Filé Mignon" → [Parmegiana, Strogonoff, Filé com Fritas…].
// Serve para mostrar que UM fator de correção do ingrediente cobre TODAS
// as preparações que o usam — não é preciso um FC por preparação.
export function preparacoesPorMateriaPrima(fichas = []) {
  const m = new Map();
  fichas.forEach(f => {
    const key = (f.materiaPrima || '').trim();
    if (!key || !f.preparacao) return;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push({ preparacao: f.preparacao, gramatura: f.gramatura });
  });
  return m;
}

// Encontra as preparações que usam um ingrediente, casando o nome digitado
// (item comprado) com a matéria-prima das fichas (fronteira de palavra).
export function preparacoesDoItem(item, fichas = []) {
  if (!(item || '').trim()) return [];
  return fichas
    .filter(f => nomesCasam(f.materiaPrima, item))
    .map(f => ({ preparacao: f.preparacao, gramatura: f.gramatura, materiaPrima: f.materiaPrima }));
}

// Série diária de saídas no período. Cada ponto tem `total` + um entry por destino id.
// Saídas internas (destino='producao') não entram no total.
export function saidasPorDia(saidas, inicio, fim) {
  const porDia = {};
  saidas.forEach(s => {
    if (s.data < inicio || s.data > fim) return;
    if (s.destino === 'producao') return;
    if (!porDia[s.data]) porDia[s.data] = { total: 0 };
    const qty = (s.itens || []).reduce((t, i) => t + num(i.quantidade), 0);
    porDia[s.data].total += qty;
    if (s.destino) porDia[s.data][s.destino] = (porDia[s.data][s.destino] || 0) + qty;
  });
  return Object.entries(porDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, v]) => ({ data, ...v }));
}

// Top produtos por saída no período, com qtd por destino
// (as colunas por destino saem das chaves do próprio resultado).
export function topProdutosSaida(produtos, saidasFiltradas, limite = 8) {
  const tot = {};
  saidasFiltradas.forEach(s => {
    if (s.destino === 'producao') return;
    (s.itens || []).forEach(i => {
      if (!tot[i.produtoId]) tot[i.produtoId] = { total: 0 };
      tot[i.produtoId].total += num(i.quantidade);
      if (s.destino) tot[i.produtoId][s.destino] = (tot[i.produtoId][s.destino] || 0) + num(i.quantidade);
    });
  });
  return Object.entries(tot)
    .map(([id, v]) => {
      const p = produtos.find(x => x.id === id);
      return { nome: p?.nome || id, unidade: p?.unidade || '', ...v };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limite);
}

// Agrupa registros por um campo (ex.: motivo da perda, destino da apara)
export function somaPorCampo(registros, campo) {
  const m = {};
  registros.forEach(r => {
    const k = r[campo] || '?';
    m[k] = (m[k] || 0) + num(r.quantidade);
  });
  return Object.entries(m).map(([cod, valor]) => ({ cod, valor })).sort((a, b) => b.valor - a.valor);
}
