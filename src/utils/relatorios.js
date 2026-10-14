// Relatórios "por destino" e "chegadas por dia" — funções puras, testáveis.
// Base para os relatórios de movimentação sem misturar destinos e para o
// controle diário do que chega (peso). Servem também de fundação para os
// relatórios futuros (quinzenal/mensal por item, rendimento x aparas).

// Saídas agrupadas por DESTINO e, dentro de cada destino, por DIA.
// Ignora as saídas internas de produção (destino 'producao'), que não são
// transferência para uma unidade. Não mistura destinos: cada um é um bloco.
import { nomeProduto, nomeDestino } from './calculos';

export function saidasPorDestinoDia(saidas, produtos, locais) {
  const nomeProd = (id) => nomeProduto(produtos, id);
  const nomeDest = (id) => nomeDestino(locais, id);
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

// ── Unidades ────────────────────────────────────────────────────────────────
// A compra aceita kg, unid e cx; a apara/perda aceita kg, unid e g. Somar as
// três numa conta só produzia número inventado: 2 cx de tomate com 3 kg de
// apara davam "−50% de rendimento" em vermelho, com cara de número certo.
//
// Aqui g vira kg e ml vira L (conversões exatas). cx NÃO converte para kg: não
// existe peso por caixa cadastrado, e chutar um seria inventar o dado que a
// conta deveria medir.
const EQUIV = { g: 'kg', kg: 'kg', ml: 'l', l: 'l', un: 'unid', unid: 'unid', cx: 'cx' };
export const unidadeBase = (u) => EQUIV[String(u || '').toLowerCase()] || String(u || '').toLowerCase();
export const quantidadeBase = (q, u) => {
  const n = Number(q) || 0;
  const bruto = String(u || '').toLowerCase();
  return (bruto === 'g' || bruto === 'ml') ? n / 1000 : n;
};

/**
 * Soma quantidades QUEBRADAS POR UNIDADE: { kg: 12.5, unid: 3 }.
 *
 * Existe porque somar 10 kg de filé com 3 unid de pão e imprimir "13" é o tipo
 * de número que o dono mostra ao cliente dele.
 */
export function somaPorUnidade(registros) {
  const out = {};
  (registros || []).forEach(r => {
    if (!r) return;
    const u = unidadeBase(r.unidade) || '—';
    out[u] = (out[u] || 0) + quantidadeBase(r.quantidade, r.unidade);
  });
  return out;
}

// Rendimento POR ITEM (matéria-prima) no período: quanto chegou, quanto virou
// apara e perda associada (ligadas à compra por compraId) e o rendimento %.
//
// Agrupa por ITEM + UNIDADE, e só soma a correção cuja unidade bate com a da
// compra. O que não bate vira `incompativel` e zera o rendimento (null) em vez
// de virar porcentagem — mesma postura de custoUnitario em financeiro.js, que
// devolve null em vez de inventar conversão.
export function rendimentoPorItem(compras, aparas, desperdicio) {
  const porCompra = {};   // compraId -> { aparas: {un: qtd}, perdas: {un: qtd} }
  const acumular = (lista, campo) => (lista || []).forEach(r => {
    if (!r || !r.compraId) return;
    if (!porCompra[r.compraId]) porCompra[r.compraId] = { aparas: {}, perdas: {} };
    const alvo = porCompra[r.compraId][campo];
    const u = unidadeBase(r.unidade);
    alvo[u] = (alvo[u] || 0) + quantidadeBase(r.quantidade, r.unidade);
  });
  acumular(aparas, 'aparas');
  acumular(desperdicio, 'perdas');

  const porItem = {};
  (compras || []).forEach(c => {
    const nome = (c.item || '').trim() || '(sem nome)';
    const un = unidadeBase(c.unidade);
    // chave sem separador exotico: um NUL literal aqui fazia o git tratar o
    // arquivo inteiro como BINARIO (sem diff, sem blame). JSON.stringify de um
    // par nao colide com nome de produto nenhum.
    const chave = JSON.stringify([nome.toLowerCase(), un]);
    if (!porItem[chave]) porItem[chave] = { item: nome, unidade: c.unidade || '', comprado: 0, aparas: 0, perdas: 0, incompativel: 0, n: 0 };
    const g = porItem[chave];
    g.comprado += quantidadeBase(c.quantidade, c.unidade);
    const corr = porCompra[c.id];
    if (corr) {
      // Unidade AUSENTE não é incompatível — é desconhecida, e o registro
      // antigo não tinha o campo. Assume a unidade da compra: tratá-la como
      // incompatível apagaria o rendimento de todo histórico já gravado. Só
      // unidade explicitamente DIFERENTE fica de fora da conta.
      const combina = (u) => u === un || u === '';
      for (const [u, q] of Object.entries(corr.aparas)) { if (combina(u)) g.aparas += q; else g.incompativel += q; }
      for (const [u, q] of Object.entries(corr.perdas)) { if (combina(u)) g.perdas += q; else g.incompativel += q; }
    }
    g.n++;
  });

  return Object.values(porItem).map(g => {
    const correcao = g.aparas + g.perdas;
    return {
      ...g,
      correcao,
      avisoUnidade: g.incompativel > 0,
      // sem rendimento quando há correção em unidade que não soma com a compra:
      // um número errado com cara de certo é pior que um traço
      rendimento: (g.incompativel > 0 || !(g.comprado > 0)) ? null : (1 - correcao / g.comprado) * 100,
    };
  }).sort((a, b) => b.comprado - a.comprado);
}

// Produção POR ITEM no período: soma o que foi produzido de cada produto final
// (entradas geradas por uma produção). Base do "quanto produzi de cada item".
export function producaoPorItem(entradas, produtos) {
  const nomeProd = (id) => nomeProduto(produtos, id);
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

/**
 * Desperdício e apara DIA A DIA.
 *
 * O relatório já tinha "por dia" para saídas e chegadas, mas apara e perda só
 * apareciam como total do período em dois donuts — não havia como responder
 * "quanto se perdeu na terça", que é a pergunta do controle diário.
 *
 * Quando a apara/perda está ligada a uma compra (`compraId`), o item e o
 * fornecedor daquela compra viajam junto: é o que liga o desperdício ao
 * recebimento que o causou.
 *
 * Devolve do dia mais recente para o mais antigo. Dia sem lançamento não
 * aparece. Quantidade SEMPRE quebrada por unidade — ver somaPorUnidade.
 */
export function desperdicioPorDia(aparas, desperdicio, compras) {
  const porCompra = new Map((compras || []).filter(c => c && c.id).map(c => [c.id, c]));
  const dias = new Map();   // data -> { aparas: [], perdas: [] }

  const juntar = (lista, campo) => (lista || []).forEach(r => {
    if (!r) return;
    const dia = r.data || '—';
    if (!dias.has(dia)) dias.set(dia, { aparas: [], perdas: [] });
    const c = r.compraId ? porCompra.get(r.compraId) : null;
    dias.get(dia)[campo].push({
      ...r,
      compraItem: c?.item || null,
      compraFornecedor: c?.fornecedor || null,
    });
  });
  juntar(aparas, 'aparas');
  juntar(desperdicio, 'perdas');

  return [...dias.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([data, r]) => ({
      data,
      aparas: r.aparas,
      perdas: r.perdas,
      totalAparas: somaPorUnidade(r.aparas),
      totalPerdas: somaPorUnidade(r.perdas),
    }));
}

/**
 * Desperdício por ESTOQUE e por DIA — a comparação entre cozinhas.
 *
 * `visoes` é o mapa que a Administração já tem na memória (visoesPorEstoque),
 * então isto não custa uma requisição: os lançamentos já vêm fatiados por
 * instância pelo `tipo` do registro.
 *
 * Linhas = dias; colunas = estoques. A célula guarda a quantidade POR UNIDADE,
 * nunca um número único — somar kg com unid numa matriz de comparação repetiria
 * o erro que os cards tinham.
 */
export function desperdicioPorEstoqueDia(visoes, ids, filtrar) {
  const colunas = (ids || []).filter(id => visoes?.[id]);
  const porDia = new Map();  // data -> { [estoqueId]: { aparas, perdas } }

  colunas.forEach(id => {
    const v = visoes[id];
    const ap = filtrar ? filtrar(v.aparas || []) : (v.aparas || []);
    const pe = filtrar ? filtrar(v.desperdicio || []) : (v.desperdicio || []);
    [...ap, ...pe].forEach(r => {
      const dia = r?.data || '—';
      if (!porDia.has(dia)) porDia.set(dia, {});
      if (!porDia.get(dia)[id]) porDia.get(dia)[id] = { aparas: [], perdas: [] };
    });
    ap.forEach(r => porDia.get(r?.data || '—')[id].aparas.push(r));
    pe.forEach(r => porDia.get(r?.data || '—')[id].perdas.push(r));
  });

  const linhas = [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([data, porEstoque]) => ({
      data,
      celulas: colunas.map(id => ({
        estoqueId: id,
        aparas: somaPorUnidade(porEstoque[id]?.aparas || []),
        perdas: somaPorUnidade(porEstoque[id]?.perdas || []),
      })),
    }));

  // Totais do período por estoque — o rodapé da matriz
  const totais = colunas.map(id => {
    const v = visoes[id];
    const ap = filtrar ? filtrar(v.aparas || []) : (v.aparas || []);
    const pe = filtrar ? filtrar(v.desperdicio || []) : (v.desperdicio || []);
    return { estoqueId: id, aparas: somaPorUnidade(ap), perdas: somaPorUnidade(pe) };
  });

  return { colunas, linhas, totais };
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
