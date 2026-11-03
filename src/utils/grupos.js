// =====================================================================
//  GRUPOS DO ITEM (Lote 11, parte 2, 03/11/2026 — visto no Suflex)
//
//  Antes o item tinha UM grupo (`categoria`: BOVINOS, MOLHOS...). A casa quer
//  organizar do jeito dela — "Almoço de funcionários", "Hortifrúti" — e um
//  item pode estar em mais de um: o frango desfiado é de AVES e também do
//  almoço da equipe. Agora:
//
//    • `grupos: ['AVES', 'ALMOÇO DE FUNCIONÁRIOS']` no item; o PRIMEIRO é o
//      principal;
//    • `categoria` continua gravada, igual ao principal. ⚠️ Não é enfeite: é
//      o que o estoque (Início, Entradas, Saídas, Contagem, Relatório) lê para
//      agrupar, e o que os aparelhos com versão velha leem. Item que nunca
//      passou pela ficha nova não tem `grupos`: vale a `categoria` sozinha;
//    • a lista da casa (`categorias`) é também a ORDEM dos grupos na tela.
//
//  Os nomes são em MAIÚSCULAS, como as categorias sempre foram: é assim que
//  aparecem nos cabeçalhos das listas, e "Aves" e "AVES" não podem virar dois.
// =====================================================================

import { CATEGORIAS_BIBLIOTECA } from '../data/bibliotecaEtiquetas';

/** O nome como é guardado: sem espaço sobrando, em maiúsculas. */
export const nomeDeGrupo = (txt) => String(txt ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Os grupos do item, o principal primeiro. Item antigo: só a categoria. */
export function gruposDoProduto(p) {
  if (Array.isArray(p?.grupos) && p.grupos.length) return p.grupos.filter(Boolean);
  return p?.categoria ? [p.categoria] : [];
}

/** O item com a lista nova E a categoria espelhada (ver o cabeçalho). */
export function comGrupos(produto, grupos) {
  const lista = [...new Set((grupos || []).map(nomeDeGrupo).filter(Boolean))];
  return { ...produto, grupos: lista, categoria: lista[0] || produto?.categoria || 'OUTROS' };
}

export const estaNoGrupo = (p, grupo) => gruposDoProduto(p).includes(grupo);

/**
 * A ordem dos grupos na tela: a da lista da casa. Os da biblioteca que não
 * estão nela (a casa apagou, ou conta antiga) vão para o fim — só servem para
 * ordenar item que ainda usa um deles.
 * ⚠️ Conta nova nasce com a lista da biblioteca, na ordem dela, e os grupos
 * criados entram no fim: é exatamente a ordem de antes desta versão.
 */
export const ordemDosGrupos = (categorias = []) =>
  [...categorias, ...CATEGORIAS_BIBLIOTECA.filter(c => !categorias.includes(c))];

/** Sobe (-1) ou desce (+1) um grupo na lista. */
export function moverGrupo(categorias = [], nome, delta) {
  const i = categorias.indexOf(nome);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= categorias.length) return categorias;
  const nova = [...categorias];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

/**
 * Troca o nome do grupo na lista E em todos os itens (categoria e grupos).
 * Devolve `{ erro }` quando não dá: nome vazio ou já usado por outro grupo.
 */
export function renomearGrupo(produtos = [], categorias = [], de, para) {
  const novo = nomeDeGrupo(para);
  if (!novo) return { erro: 'Dê um nome ao grupo.' };
  if (novo === de) return { produtos, categorias };
  if (categorias.includes(novo)) return { erro: `Já existe o grupo "${novo}".` };
  const troca = (g) => (g === de ? novo : g);
  return {
    categorias: categorias.map(troca),
    produtos: produtos.map(p => {
      const grupos = gruposDoProduto(p);
      if (!grupos.includes(de)) return p;
      return comGrupos(p, grupos.map(troca));
    }),
  };
}

/**
 * Tira o grupo da lista e dos itens. ⚠️ Item que ficaria SEM grupo nenhum
 * trava a remoção (`presos`): ele sumiria dos cabeçalhos e cairia em "OUTROS"
 * sem ninguém pedir. A pessoa muda esses itens de grupo antes.
 */
export function removerGrupo(produtos = [], categorias = [], nome) {
  const presos = produtos.filter(p => p.ativo !== false && gruposDoProduto(p).length === 1 && gruposDoProduto(p)[0] === nome);
  if (presos.length) return { presos };
  return {
    presos: [],
    categorias: categorias.filter(c => c !== nome),
    produtos: produtos.map(p => {
      const grupos = gruposDoProduto(p);
      if (!grupos.includes(nome)) return p;
      const restantes = grupos.filter(g => g !== nome);
      // item removido (inativo) que só tinha este grupo fica como estava
      return restantes.length ? comGrupos(p, restantes) : p;
    }),
  };
}

/** Quantos itens ATIVOS estão no grupo. */
export const itensNoGrupo = (produtos = [], nome) =>
  produtos.filter(p => p.ativo !== false && estaNoGrupo(p, nome)).length;

/** "AVES; ALMOÇO DE FUNCIONÁRIOS" — como a planilha escreve e lê. */
export const SEPARADOR_DE_GRUPOS = ';';
export const gruposDoTexto = (txt) => String(txt ?? '').split(SEPARADOR_DE_GRUPOS).map(nomeDeGrupo).filter(Boolean);
