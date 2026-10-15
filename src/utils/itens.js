// =====================================================================
//  ITEM QUE SÓ SERVE PARA ETIQUETA (Lote 4 da auditoria, 14/10/2026)
//
//  Leite aberto, molho do dia, azeite aberto: a cozinha etiqueta o pote, mas
//  não controla quanto tem. No Pro esses itens entravam em Entradas, Saídas,
//  Contagem e no Início com saldo zero e situação "—" — barulho na tela de
//  quem conta estoque.
//
//  Decisão do dono: item com DATA DE ABERTURA nasce "só etiqueta"; dá para
//  mudar item a item na ficha (Meus itens). A regra mora aqui, num lugar só.
//
//  ⚠️ O CATÁLOGO CONTINUA INTEIRO. `produtos` (AppContext) é a lista que se
//  grava; filtrar ela e gravar de volta APAGARIA os itens só de etiqueta. As
//  telas de estoque filtram na leitura, com `ativoNoEstoque`.
//
//  ⚠️ NO ESTOQUE SECO a etiqueta é SEMPRE de abertura (o pacote lacrado já vem
//  etiquetado pelo fabricante) e mesmo assim o item é de estoque. Por isso a
//  ficha, no Seco, nasce controlando estoque — e grava a escolha explícita
//  (`controlaEstoque: true`), que vale mais que a regra do tipo de data.
// =====================================================================

export const controlaEstoque = (p) =>
  (p?.controlaEstoque ?? (p?.tipoData !== 'abertura')) !== false;

// ativo e controlado: o que aparece nas listas de estoque
export const ativoNoEstoque = (p) => !!p?.ativo && controlaEstoque(p);

/**
 * O padrão da chave "Controla estoque" num item NOVO.
 * `abertoPorPadrao`: a cozinha imprime etiqueta de abertura em tudo (Seco).
 */
export const controlaPorPadrao = (tipoData, abertoPorPadrao = false) =>
  abertoPorPadrao || tipoData !== 'abertura';

// ⚠️ A UNIDADE É COMPARADA COMO TEXTO no app inteiro: peso por unidade, o
// limiar de alerta e a lista de compras só reconhecem 'kg' e 'unid'. Digitado
// à mão, "Kg", "un" e "unidade" viravam unidades diferentes em silêncio — o
// item contado por peça perdia a conversão para kg na lista de compras.
const GRAFIAS = {
  kg: 'kg', kilo: 'kg', kilos: 'kg', quilo: 'kg', quilos: 'kg',
  g: 'g', gr: 'g', grama: 'g', gramas: 'g',
  l: 'L', litro: 'L', litros: 'L', lt: 'L',
  ml: 'mL',
  un: 'unid', 'un.': 'unid', und: 'unid', unid: 'unid', 'unid.': 'unid',
  unidade: 'unid', unidades: 'unid', uni: 'unid',
};

export const UNIDADES_COMUNS = ['kg', 'g', 'L', 'mL', 'unid'];

/** Grafia única da unidade; o que não é conhecido fica como foi digitado. */
export function normalizarUnidade(u) {
  const t = String(u ?? '').trim();
  if (!t) return 'unid';
  return GRAFIAS[t.toLowerCase()] || t;
}
