// Montagem dos campos da etiqueta profissional de validade (padrão Aurum).
// Serve todas as origens: entrada real, produção, reimpressão do histórico,
// impressão sob demanda do catálogo e etiquetas avulsas (itens fora do estoque).

import { addDias } from './datas';
import { fmtData } from './formatters';

// Configuração padrão da etiqueta (sobrescrita por prefs.etiquetaConfig, em Config → Sistema)
export const ETIQUETA_CONFIG_PADRAO = {
  larguraMm: 60,
  alturaMm: 40,
  incluirQR: false,
  campos: {
    restaurante: true, validade: true, fabricacao: true, armazenamento: true,
    responsavel: true, valOriginal: true, marca: true, sif: true, estabelecimento: true,
  },
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
 * - `tipoData` muda o rótulo da data: 'fabricacao' → "MANIPULAÇÃO",
 *   'abertura' → "ABERTURA" (itens tipo "Leite aberto").
 * - `hora` (HH:MM) é a hora da impressão — aparece junto das datas de
 *   manipulação/validade, como nas etiquetas profissionais.
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
  medida = '',
  valOriginal = null,
  marca = '',
  sif = '',
  hora = '',
}) {
  let dias = parseFloat(diasValidade) || 0;
  if (!dias && produto && armazenamento) {
    dias = armazenamento === 'congelado' ? (produto.valCongelado || 0) : (produto.valResfriado || 0);
  }
  const validadeCalc = validade || (dias > 0 && dataFabricacao ? addDias(dataFabricacao, dias) : null);
  const comHora = (dataFmt) => dataFmt && hora ? `${dataFmt} - ${hora}` : dataFmt;

  return {
    nome: nome || produto?.nome || '',
    tipoData,
    rotuloData: tipoData === 'abertura' ? 'ABERTURA' : 'MANIPULAÇÃO',
    dataFabricacao: dataFabricacao || null,
    dataFabricacaoFmt: dataFabricacao ? comHora(fmtData(dataFabricacao)) : '',
    validade: validadeCalc,
    validadeFmt: validadeCalc ? comHora(fmtData(validadeCalc)) : '',
    valOriginal: valOriginal || null,
    valOriginalFmt: valOriginal ? fmtData(valOriginal) : '',
    armazenamento,
    armazenamentoLabel:
      armazenamento === 'congelado' ? 'CONGELADO'
      : armazenamento === 'resfriado' ? 'RESFRIADO'
      : '',
    medida: medida || '',
    marca: marca || '',
    sif: sif || '',
    restauranteNome: restauranteNome || '',
    responsavel: responsavel || '',
    hora: hora || '',
  };
}

/**
 * Conteúdo do QR code — texto legível linha a linha ("Chave: valor").
 * Quem escanear com a câmera do celular vê a ficha da etiqueta na hora;
 * um sistema futuro consegue fazer parse pelas chaves.
 */
export function montarPayloadQR(campos, { estabelecimento = null } = {}) {
  const linhas = [
    campos.restauranteNome ? `Restaurante: ${campos.restauranteNome}` : null,
    `Produto: ${campos.nome}`,
    campos.medida ? `Medida: ${campos.medida}` : null,
    campos.armazenamentoLabel ? `Armazenamento: ${campos.armazenamentoLabel}` : null,
    campos.valOriginalFmt ? `Val. original: ${campos.valOriginalFmt}` : null,
    campos.dataFabricacaoFmt ? `${campos.rotuloData === 'ABERTURA' ? 'Abertura' : 'Manipulacao'}: ${campos.dataFabricacaoFmt}` : null,
    campos.validadeFmt ? `Validade: ${campos.validadeFmt}` : null,
    campos.marca ? `Marca/Forn: ${campos.marca}` : null,
    campos.sif ? `SIF: ${campos.sif}` : null,
    campos.responsavel ? `Resp: ${campos.responsavel}` : null,
    estabelecimento?.cnpj ? `CNPJ: ${estabelecimento.cnpj}` : null,
  ];
  return linhas.filter(Boolean).join('\n');
}
