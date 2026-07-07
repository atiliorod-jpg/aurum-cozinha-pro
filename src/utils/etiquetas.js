// Montagem dos campos de uma etiqueta de identificação/validade.
// Serve todas as origens: entrada real, produção, reimpressão do histórico,
// impressão sob demanda do catálogo e etiquetas avulsas (itens fora do estoque).

import { addDias } from './datas';
import { fmtData } from './formatters';

// Configuração padrão da etiqueta (sobrescrita por prefs.etiquetaConfig, em Config → Sistema)
export const ETIQUETA_CONFIG_PADRAO = {
  larguraMm: 60,
  alturaMm: 40,
  incluirQR: false,
  campos: { restaurante: true, validade: true, fabricacao: true, armazenamento: true, responsavel: true },
};

// Junta a config salva nas prefs com os padrões (tolerante a chaves faltando)
export const configEtiqueta = (prefs) => ({
  ...ETIQUETA_CONFIG_PADRAO,
  ...(prefs?.etiquetaConfig || {}),
  campos: { ...ETIQUETA_CONFIG_PADRAO.campos, ...(prefs?.etiquetaConfig?.campos || {}) },
});

/**
 * Monta os campos prontos para renderizar numa etiqueta.
 *
 * - `validade` pronta (vinda de um registro real) tem prioridade;
 *   senão é calculada por `diasValidade` (avulsas) ou pelos prazos do
 *   produto conforme o armazenamento (congelado/resfriado).
 * - `tipoData` muda o rótulo da data: 'fabricacao' → "Fab.", 'abertura' → "Abertura"
 *   (etiquetas avulsas tipo "Leite aberto" usam a data de abertura da embalagem).
 */
export function montarCamposEtiqueta({
  nome,
  dataFabricacao,
  tipoData = 'fabricacao',
  armazenamento = null,
  restauranteNome = '',
  responsavel = '',
  validade = null,
  diasValidade = null,
  produto = null,
}) {
  let dias = parseFloat(diasValidade) || 0;
  if (!dias && produto && armazenamento) {
    dias = armazenamento === 'congelado' ? (produto.valCongelado || 0) : (produto.valResfriado || 0);
  }
  const validadeCalc = validade || (dias > 0 && dataFabricacao ? addDias(dataFabricacao, dias) : null);

  return {
    nome: nome || produto?.nome || '',
    tipoData,
    rotuloData: tipoData === 'abertura' ? 'Abertura' : 'Fab.',
    dataFabricacao: dataFabricacao || null,
    dataFabricacaoFmt: dataFabricacao ? fmtData(dataFabricacao) : '',
    validade: validadeCalc,
    validadeFmt: validadeCalc ? fmtData(validadeCalc) : '',
    armazenamento,
    armazenamentoLabel:
      armazenamento === 'congelado' ? '❄️ Congelado'
      : armazenamento === 'resfriado' ? '🧊 Resfriado'
      : '',
    restauranteNome: restauranteNome || '',
    responsavel: responsavel || '',
  };
}

/**
 * Payload do QR code — string pipe-delimitada, fácil de fazer parse depois
 * (ex.: um futuro leitor de conferência). Formato:
 *   restaurante|nome|dataFabricacao|validade
 */
export function montarPayloadQR(campos) {
  return [
    campos.restauranteNome,
    campos.nome,
    campos.dataFabricacao || '',
    campos.validade || '',
  ].join('|');
}
