// Montagem dos campos da etiqueta profissional de validade (padrão Aurum).
// Serve todas as origens: entrada real, produção, reimpressão do histórico,
// impressão sob demanda do catálogo e etiquetas avulsas (itens fora do estoque).

import { addDias } from './datas';
import { fmtData } from './formatters';
import { prazoDe } from './armazenamento';

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
  loteId = null,
  // ⚠️ Nome e faixa do estado de armazenamento entram COMO PARÂMETRO, já
  // resolvidos pelo chamador a partir de prefs (ver utils/armazenamento.js).
  // Passar `prefs` para dentro deste util acoplaria uma função pura ao estado
  // do app e tiraria dela o que a torna testável. Quando não vêm, o
  // comportamento antigo (congelado/resfriado) continua valendo — é o que
  // mantém funcionando qualquer chamada vinda de cache ou rascunho velho.
  armazenamentoNome = '',
  armazenamentoFaixa = '',
}) {
  let dias = parseFloat(diasValidade) || 0;
  if (!dias && produto && armazenamento) {
    dias = prazoDe(produto, armazenamento);
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
    // Nome resolvido pelo chamador; sem ele, o par fixo de sempre.
    armazenamentoLabel:
      armazenamentoNome ? armazenamentoNome.toUpperCase()
      : armazenamento === 'congelado' ? 'CONGELADO'
      : armazenamento === 'resfriado' ? 'RESFRIADO'
      : '',
    // Faixa de temperatura ("-18°C a -12°C") — sai ao lado do nome na etiqueta.
    // Vazia quando o restaurante não preencheu: a linha continua válida só com
    // o nome, e imprimir uma faixa inventada seria pior que não imprimir.
    armazenamentoFaixa: armazenamentoFaixa || '',
    medida: medida || '',
    marca: marca || '',
    sif: sif || '',
    restauranteNome: restauranteNome || '',
    responsavel: responsavel || '',
    hora: hora || '',
    loteId: loteId || null,
  };
}

// ── Ciclo de vida da etiqueta impressa ────────────────────────
// Enquanto a etiqueta não é contada nem descartada ela está VÁLIDA; passou da
// data, VENCIDA; contada numa conferência, ainda em uso; consumida/descartada,
// encerrada. É isso que permite responder "este pote ainda está na prateleira?".
export const STATUS_ETIQUETA = {
  valida: { label: 'Válida', cor: 'text-green-700 bg-green-100' },
  vencida: { label: 'Vencida', cor: 'text-red-700 bg-red-100' },
  consumida: { label: 'Consumida', cor: 'text-gray-600 bg-gray-100' },
  descartada: { label: 'Descartada', cor: 'text-orange-700 bg-orange-100' },
};

/** Status efetivo: o vencimento é derivado da data, não precisa ser gravado. */
export function statusEtiqueta(etq, hojeISO) {
  if (!etq) return 'valida';
  if (etq.status === 'consumida' || etq.status === 'descartada') return etq.status;
  if (etq.validade && etq.validade < hojeISO) return 'vencida';
  return 'valida';
}

/**
 * Etiquetas velhas não podem crescer para sempre no catálogo. Mantém as que
 * ainda importam: tudo que não foi encerrado, mais o histórico recente.
 */
export const MAX_ETIQUETAS_GUARDADAS = 4000;

export function podarEtiquetas(lista = [], hojeISO, diasHistorico = 120) {
  const menos = (dias) => new Date(new Date(hojeISO).getTime() - dias * 86400000).toISOString().slice(0, 10);
  const limiteHistorico = menos(diasHistorico);
  const limiteVencida = menos(30);

  const mantidas = lista.filter(e => {
    const st = statusEtiqueta(e, hojeISO);
    // ainda pode estar na prateleira → fica
    if (st === 'valida') return true;
    // vencida NÃO fica para sempre: 30 dias depois do vencimento aquele pote
    // certamente já saiu. Sem este corte nada era podado de verdade — o
    // catálogo crescia sem limite e acabaria estourando a cota do localStorage.
    if (st === 'vencida') return (e.validade || '') >= limiteVencida;
    // encerrada (consumida/descartada) → só o histórico recente
    return (e.impressoEm || '') >= limiteHistorico;
  });

  // Rede de segurança: mesmo com as regras acima, um volume anormal não pode
  // inchar o documento. Mantém as mais recentes.
  if (mantidas.length <= MAX_ETIQUETAS_GUARDADAS) return mantidas;
  return [...mantidas]
    .sort((a, b) => (b.impressoEm || '').localeCompare(a.impressoEm || ''))
    .slice(0, MAX_ETIQUETAS_GUARDADAS);
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

/**
 * ID curto e único da ETIQUETA FÍSICA (o lote daquele pote).
 * Cada cópia impressa ganha o seu — é o que permite contar apontando a câmera
 * e saber exatamente qual pote foi contado, não só "quantos".
 *
 * ⚠️ Duas etiquetas com o mesmo id fariam a leitura contar o pote errado, então
 * o id NÃO pode depender só de sorte. A primeira versão usava 4 do relógio + 2
 * aleatórios e colidia de verdade: 400 ids geraram só 371 distintos (2 chars
 * base36 = 1296 combinações; o paradoxo do aniversário come isso rapidinho).
 * A correção foi relógio + CONTADOR + aleatório — mas o contador dava a volta
 * em 1296, e um lote grande impresso de uma vez ultrapassa isso DENTRO DO MESMO
 * MILISSEGUNDO: a partir daí a unicidade voltava a depender dos 2 chars
 * aleatórios. Medido: ~1 colisão a cada 2.000 ids, e era isso que fazia o teste
 * "ids de lote não repetem" falhar de forma intermitente (~1 em 6 execuções) —
 * um teste piscando que denunciava um defeito real, não um teste ruim.
 *
 * Agora os mesmos 8 caracteres são repartidos como t(3) + contador(3) + rand(2):
 *   • contador 46.656 → cobre qualquer impressão real sem dar a volta
 *   • relógio 3 chars → janela de ~46s, que só precisa desempatar as voltas
 *     do contador (agora rarissímas)
 *   • aleatório 2 chars → continua separando APARELHOS diferentes, inalterado
 * Medido depois: 0 colisões em 100.000 ids, inclusive 20.000 seguidos.
 * O tamanho não muda, então o orçamento apertado do QR fica intacto.
 */
let seqLote = 0;
export const gerarLoteId = () => {
  const t = Date.now().toString(36).slice(-3);
  const c = (seqLote = (seqLote + 1) % 46656).toString(36).padStart(3, '0');
  const r = Math.random().toString(36).slice(2, 4).padEnd(2, '0');
  return `${t}${c}${r}`.toLowerCase();
};

export function montarPayloadQR(campos) {
  // Orçamento apertado de propósito — ver o bloco acima sobre pontos/módulo.
  // O nome do RESTAURANTE saiu daqui quando o id de lote entrou: ele já aparece
  // em destaque na etiqueta impressa, e quem escaneia está dentro da própria
  // cozinha. Trocar 22 caracteres de redundância pelo id foi o que manteve o
  // código na versão 6 (41 módulos, 4,3 pontos/módulo).
  const linhas = [
    `Prod: ${corta(campos.nome, 26)}`,
    campos.dataFabricacao ? `${campos.rotuloData === 'ABERTURA' ? 'Abert' : 'Manip'}: ${fmtData(campos.dataFabricacao)}` : null,
    campos.validade ? `Val: ${fmtData(campos.validade)}` : null,
    campos.responsavel ? `Resp: ${corta(campos.responsavel, 12)}` : null,
    campos.loteId ? `L: ${campos.loteId}` : null,
  ];
  return linhas.filter(Boolean).join('\n');
}

/** Lê de volta o id de lote de um QR escaneado. */
export function lerLoteIdDoQR(texto) {
  const m = String(texto || '').match(/^L:\s*([a-z0-9]{4,12})$/im);
  return m ? m[1].toLowerCase() : null;
}
