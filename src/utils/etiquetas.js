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

// Acento vira 2 bytes no QR (UTF-8) e empurra a versão do código para cima.
// Como o texto acentuado já está impresso em tamanho grande na etiqueta, o QR
// usa a versão sem acento só para caber em menos módulos.
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const corta = (s, n) => { const t = semAcento(s).trim(); return t.length > n ? `${t.slice(0, n - 1)}.` : t; };

/**
 * Conteúdo do QR code — texto legível linha a linha ("Chave: valor").
 * Quem escanear com a câmera do celular vê a ficha da etiqueta na hora.
 *
 * ⚠️ PAYLOAD CURTO DE PROPÓSITO — é o que decide se o QR IMPRESSO escaneia.
 * O QR sai com ~20mm numa impressora térmica de 203 DPI (8 pontos/mm). Cada
 * "módulo" (quadradinho) precisa de ~4 pontos da impressora para sair com a
 * borda limpa; abaixo disso o leitor não pega, por mais correto que o
 * conteúdo esteja. Como o número de módulos cresce com o tamanho do texto:
 *
 *   11 campos, com acento e hora (212 ch) → versão 9-10, 53-57 módulos → 2,2 ❌
 *   5 campos, sem acento e sem hora (~100 ch) → versão 6, 41 módulos → 4,1-4,7 ✅
 *
 * Por isso aqui ficam só os campos que alguém precisaria LER na hora, e as
 * datas vão SEM hora. Armazenamento, hora, marca, SIF, CNPJ, medida e validade
 * do fornecedor continuam impressos na etiqueta em texto — só não entram no
 * QR, que não tem espaço físico para eles. Mexer nesta lista (ou nos limites
 * do `corta`) muda direto a legibilidade do código impresso.
 */
export const QR_MAX_CARACTERES = 106;

export function montarPayloadQR(campos) {
  // Os limites abaixo somam, no PIOR caso, exatamente QR_MAX_CARACTERES:
  // rótulos (30) + duas datas (20) + 4 quebras de linha + 26 + 12 + 14 = 106.
  const linhas = [
    `Prod: ${corta(campos.nome, 26)}`,
    campos.dataFabricacao ? `${campos.rotuloData === 'ABERTURA' ? 'Abert' : 'Manip'}: ${fmtData(campos.dataFabricacao)}` : null,
    campos.validade ? `Val: ${fmtData(campos.validade)}` : null,
    campos.responsavel ? `Resp: ${corta(campos.responsavel, 12)}` : null,
    campos.restauranteNome ? `Rest: ${corta(campos.restauranteNome, 14)}` : null,
  ];
  return linhas.filter(Boolean).join('\n');
}
