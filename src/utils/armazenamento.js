// =====================================================================
//  Estados de armazenamento — configuráveis pelo restaurante
//
//  Antes disto existiam DOIS estados cravados no código (congelado e
//  resfriado) e o prazo de validade morava em dois campos fixos do produto
//  (valCongelado/valResfriado). Cozinha real tem mais: temperatura ambiente
//  para o que não vai à câmara, e faixas diferentes conforme o que o
//  estabelecimento controla.
//
//  ⚠️ AS FAIXAS SÃO PONTO DE PARTIDA, NÃO VERDADE ABSOLUTA. Quem confere é o
//  responsável técnico do estabelecimento: a temperatura correta depende do
//  produto, do processo e do que a vigilância local exige. Por isso elas são
//  editáveis e a tela de Configurações diz isso em voz alta — número errado
//  impresso numa etiqueta colada num pote é problema sanitário, não bug de
//  software.
//
//  Onde mora: `prefs.armazenamentos`. Não é documento novo de propósito —
//  `prefs` já é da CONTA (não do módulo) e já guarda etiquetaConfig e
//  estabelecimento. Câmara fria é do estabelecimento, não do estoque.
// =====================================================================

import { mesclarFixos } from './modulos';

// ⚠️ 'congelado' e 'resfriado' são FIXOS e os ids NÃO PODEM MUDAR NUNCA.
// Essas duas strings já estão gravadas, cruas, em registros[].armazenamento,
// em producoes[], em etiquetasImpressas e no histórico de toda conta que já
// usou o app. Renomear qualquer um dos dois cegaria esse histórico em
// silêncio: a etiqueta antiga passaria a não achar o estado dela e sairia sem
// rótulo. O `fixo: true` é o que impede a tela de oferecer o botão de remover;
// nome e faixa continuam editáveis, porque são só apresentação.
export const ARMAZENAMENTOS_PADRAO = [
  { id: 'congelado', nome: 'Congelado',            faixa: '-18°C a -12°C', fixo: true },
  { id: 'resfriado', nome: 'Resfriado',            faixa: '0°C a 4°C',     fixo: true },
  { id: 'ambiente',  nome: 'Temperatura ambiente', faixa: 'até 25°C' },
];

// Limite de caracteres da faixa. NÃO é frescura de layout: a etiqueta tem
// altura fixa com overflow:hidden, e a linha de armazenamento sai em 2.7mm —
// um texto longo empurra o rodapé (estabelecimento + QR + lote) para fora do
// papel, exatamente como já acontecia com nome de produto comprido.
export const MAX_FAIXA = 14;

/**
 * Lista efetiva: o que o restaurante salvou, com os fixos garantidos.
 *
 * ⚠️ Quando NÃO existe lista salva, devolve os três padrões inteiros — e não
 * só os fixos. `mesclarFixos` sozinho repõe apenas o que está marcado como
 * fixo, então uma conta nova receberia congelado e resfriado e ficaria SEM
 * "temperatura ambiente", que é exatamente o estado que motivou tornar isto
 * configurável. Um teste pegou isso.
 *
 * Já quem tem lista salva passa pelo mesclarFixos e só recebe de volta os
 * obrigatórios: se o restaurante apagou 'ambiente' de propósito, ele não pode
 * ressuscitar a cada abertura do app.
 */
export const listarArmazenamentos = (prefs) => {
  const salvos = prefs?.armazenamentos;
  if (!Array.isArray(salvos) || salvos.length === 0) return ARMAZENAMENTOS_PADRAO;
  return mesclarFixos(salvos, ARMAZENAMENTOS_PADRAO);
};

/** Só os utilizáveis hoje (um estado pode ser desligado sem ser apagado). */
export const armazenamentosAtivos = (prefs) =>
  listarArmazenamentos(prefs).filter(a => a.ativo !== false);

export const acharArmazenamento = (prefs, id) =>
  listarArmazenamentos(prefs).find(a => a.id === id) || null;

/** "CONGELADO" — o rótulo em caixa alta que sai impresso. */
export const rotuloArmazenamento = (a) => (a?.nome || '').toUpperCase();

/**
 * Prazos de validade do produto, POR ESTADO.
 *
 * ⚠️ ADAPTADOR DE LEITURA — nunca reescreve nada, e é isto que faz a mudança
 * não quebrar dado existente. Produto antigo tem só valCongelado/valResfriado;
 * produto novo tem `prazos{}`. O novo formato tem prioridade quando existe, e
 * o antigo continua sendo lido para sempre.
 *
 * Não existe varredura de migração em massa do catálogo, e isso é decisão:
 * reescrever centenas de produtos de uma vez, com a fila offline e o
 * separarMetas no caminho, é onde catálogo se perde. A conversão acontece
 * sozinha, item a item, na primeira vez que cada produto é SALVO.
 */
export function prazosDoProduto(p) {
  return {
    congelado: Number(p?.valCongelado) || 0,
    resfriado: Number(p?.valResfriado) || 0,
    ...(p?.prazos || {}),
  };
}

export const prazoDe = (produto, armazId) => Number(prazosDoProduto(produto)[armazId]) || 0;

/** O produto tem prazo em algum estado? (usado no aviso de cadastro incompleto) */
export const temAlgumPrazo = (produto) =>
  Object.values(prazosDoProduto(produto)).some(v => Number(v) > 0);

/**
 * Espelha `prazos` nos campos antigos ao SALVAR.
 *
 * ⚠️ DUAL-WRITE, e não é opcional. O app é offline-first: um tablet que ficou
 * dois dias sem abrir tem o `produtos` antigo no localStorage e continua
 * imprimindo etiqueta. Sem o espelho, aquele aparelho imprimiria validade
 * ZERADA em silêncio — etiqueta sem vencimento, colada no pote. Custa duas
 * linhas e cobre também deploy revertido e importação por planilha.
 */
export function comEspelhoDePrazos(produto, prazos) {
  const limpos = Object.fromEntries(
    Object.entries(prazos || {}).map(([k, v]) => [k, Number(v) || 0])
  );
  return {
    ...produto,
    prazos: limpos,
    valCongelado: limpos.congelado || 0,
    valResfriado: limpos.resfriado || 0,
  };
}
