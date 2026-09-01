// Montagem dos campos da etiqueta profissional de validade (padrão Aurum).
// Serve todas as origens: entrada real, produção, reimpressão do histórico,
// impressão sob demanda do catálogo e etiquetas avulsas (itens fora do estoque).

import { addDias } from './datas';
import { fmtData } from './formatters';
import { prazoDe } from './armazenamento';

// Configuração padrão da etiqueta (sobrescrita por prefs.etiquetaConfig, em Config → Sistema)
// ⚠️ TAMANHO ÚNICO, 60 x 50 mm, e isto é decisão de produto, não limitação.
// O sistema é vendido junto com a impressora (Tomate MDK-022) e o rolo 60x50,
// que é o mais comum de etiqueta de validade no mercado brasileiro. Deixar o
// tamanho aberto criava uma classe inteira de problema que só aparece no
// papel: app dizendo 60x50, driver dizendo outra coisa, e a etiqueta saindo
// deslocada sem nenhuma mensagem de erro. Ninguém na cozinha tem como
// diagnosticar isso. Um número só, dos dois lados, e o defeito deixa de existir.
//
// ⚠️ O GERADOR TSPL CONTINUA PARAMETRIZADO de propósito (tem teste com 40x30):
// travar é escolha da interface, não do desenho. No dia em que entrar outro
// modelo de impressora, muda aqui e o resto acompanha.
export const LARGURA_ETIQUETA_MM = 60;
export const ALTURA_ETIQUETA_MM = 50;

export const ETIQUETA_CONFIG_PADRAO = {
  larguraMm: LARGURA_ETIQUETA_MM,
  alturaMm: ALTURA_ETIQUETA_MM,
  incluirQR: false,
  campos: {
    restaurante: true, validade: true, fabricacao: true, armazenamento: true,
    responsavel: true, marca: true, sif: true, estabelecimento: true,
    // ⚠️ LOTE DO FABRICANTE — o número impresso na caixa que veio do
    // fornecedor, NÃO o id interno do QR (esse é `loteId`, outra coisa). É o
    // que liga o pote na câmara ao recall do frigorífico: sem ele, "lote X foi
    // recolhido" não tem como ser respondido depois de porcionar.
    // Nasce ligado, mas só sai no papel quando alguém preenche.
    lote: true,
    // ⚠️ DESLIGADO por padrão. É a validade impressa na embalagem do
    // fabricante — não muda o vencimento da etiqueta, e mais um campo para a
    // equipe preencher a cada impressão. Quem precisa de rastreio de lote liga
    // em Configurações e ganha junto o alerta de validade estourada.
    valOriginal: false,
  },
  // ⚠️ DESLIGADO por padrão, e ligável pelo dono. Veio de um erro real dele:
  // imprimiu um lote inteiro, só viu depois que o RESP. saiu em branco e teve
  // que refazer — rolo gasto e trabalho repetido. Onde a etiqueta é documento
  // sanitário, o responsável não é opcional; onde é só identificação, exigir
  // atrapalharia. Por isso é escolha da casa, não regra nossa.
  exigirResponsavel: false,
};

// Junta a config salva nas prefs com os padrões (tolerante a chaves faltando)
export const configEtiqueta = (prefs) => ({
  ...ETIQUETA_CONFIG_PADRAO,
  ...(prefs?.etiquetaConfig || {}),
  // ⚠️ O TAMANHO VEM DEPOIS do que está salvo, e é de propósito: contas que
  // chegaram a salvar outra medida quando o campo existia voltam para 60x50
  // sozinhas. Se ficasse antes, o valor antigo continuaria mandando e a pessoa
  // não teria mais onde mexer para consertar.
  larguraMm: LARGURA_ETIQUETA_MM,
  alturaMm: ALTURA_ETIQUETA_MM,
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
  lote = '',
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
  // ⚠️ O ERRO QUE ESTE CAMPO EXISTE PARA PEGAR: porcionar um produto cuja
  // embalagem vence antes do prazo da casa faz a etiqueta imprimir uma validade
  // MAIOR que a do fabricante. Grave e invisível — ninguém confere de cabeça.
  // Comparação de strings ISO (AAAA-MM-DD), que é o formato dos dois lados.
  const passaDoFornecedor = !!(valOriginal && validadeCalc && validadeCalc > valOriginal);
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
    passaDoFornecedor,
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
    lote: lote || '',
    // ⚠️ SIF E LOTE DIVIDEM UMA LINHA na etiqueta, e não é economia à toa: com
    // val. original + marca + SIF + lote em linhas próprias o corpo passava por
    // cima do rodapé por 0,6 mm — o RESP. imprimia em cima do nome da casa.
    // São os dois números do fornecedor e andam juntos na prática. Sozinho,
    // cada um ocupa a linha inteira, com o rótulo só dele.
    sifLoteRotulo: sif && lote ? 'SIF / LOTE:' : sif ? 'SIF:' : lote ? 'LOTE:' : '',
    sifLoteValor: [sif, lote].filter(Boolean).join(' · '),
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

// ── Medida impressa na etiqueta ───────────────────────────────
// ⚠️ `medidaPadrao` é TEXTO LIVRE ("1 kg", "500 mL", "150 g") e `gramatura` é
// o numérico em gramas do app completo. Existiam os dois com regras
// diferentes: o cadastro do plano Etiquetas só aceitava gramas, enquanto a
// tela de impressão aceitava "1 kg" — então havia medida que a impressão
// mostrava e o cadastro não conseguia gerar. Aqui os dois viram um só.
export const medidaDoProduto = (p) =>
  (p?.medidaPadrao || '').trim() || (p?.gramatura > 0 ? `${p.gramatura} g` : '');

// "150 g" -> 150 · "1 kg" -> 1000 · "500 mL" -> 0 (não é peso, não vira grama)
export const gramasDeMedida = (txt) => {
  const m = String(txt || '').trim().toLowerCase().replace(',', '.').match(/^([\d.]+)\s*(kg|g)?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  return m[2] === 'kg' ? Math.round(n * 1000) : Math.round(n);
};

// ── Prazo digitado na hora de imprimir ────────────────────────
//
// ⚠️ O CAMPO NÃO TINHA TETO, e isso saía impresso em papel colado no pote.
// Digitando 18000 a etiqueta vencia em 12/12/2075, sem um aviso sequer. O dedo
// que erra e digita 1800 no lugar de 180 é o caso real, e ninguém confere uma
// data de cinco anos à frente porque ninguém espera que ela exista.
//
// ⚠️ E O AVISO NÃO INVENTA NÚMERO SANITÁRIO. A régua é o prazo que a PRÓPRIA
// CASA cadastrou para aquele item naquele armazenamento: pular de 180 para
// 1800 é dez vezes o que o responsável técnico validou. Chutar aqui um "máximo
// saudável" seria a Aurum assinando prazo de alimento, que não é o nosso
// papel — quem valida processo é o estabelecimento.
export const DIAS_VALIDADE_MAX = 365;

/** Corta o que a pessoa digitou no teto. Devolve texto, como o input espera. */
export function limitarDias(valor) {
  const txt = String(valor ?? '');
  if (txt === '') return '';
  const n = parseInt(txt, 10);
  if (!Number.isFinite(n)) return '';
  if (n < 0) return '0';
  return String(Math.min(n, DIAS_VALIDADE_MAX));
}

/**
 * Aviso quando o prazo digitado destoa do cadastrado. `null` = está tudo bem.
 * Três vezes o cadastrado é o corte: cobre o erro de digitação (um zero a
 * mais) sem incomodar quem legitimamente estende um lote.
 */
export function avisoDePrazo(digitado, doCadastro) {
  const n = parseInt(digitado, 10);
  const base = parseInt(doCadastro, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= DIAS_VALIDADE_MAX) return `${DIAS_VALIDADE_MAX} dias é o máximo. Confira o prazo.`;
  if (!Number.isFinite(base) || base <= 0) return null;
  if (n > base * 3) return `Bem acima do prazo cadastrado (${base} dias). Confira.`;
  return null;
}

// ── Produto aberto sem prazo cadastrado ───────────────────────
//
// ⚠️ SUGESTÃO, NÃO REGRA DA AURUM. Quando a embalagem foi só ABERTA (não
// manipulada) e ninguém cadastrou prazo, o item saía sem validade nenhuma — e
// "leite aberto" sem data é exatamente a etiqueta que não serve para nada.
//
// O número 3 é o limite usual para produto aberto sob refrigeração, e é o que
// as referências técnicas usam quando o fabricante NÃO informa. A ordem certa
// continua sendo a do rótulo: quem tem a informação do fabricante digita por
// cima, e é isso que a tela pede. Por isso é sugestão preenchida e visível,
// nunca um valor imposto em silêncio.
//
// ⚠️ Só vale para `tipoData: 'abertura'`. Alimento MANIPULADO depende do
// processo daquela cozinha — ali chutar três dias seria inventar prazo.
export const DIAS_SUGERIDOS_ABERTURA = 3;

/** Prazo de partida do item na hora de imprimir. 0 = não temos o que sugerir. */
export function diasIniciaisDaEtiqueta(item) {
  const doCadastro = item?.diasValidade != null
    ? item.diasValidade
    : (item?.prazos?.[item?.armazenamento]
       ?? item?.prazos?.congelado
       ?? item?.diasCongelado
       ?? 0);
  if (Number(doCadastro) > 0) return Number(doCadastro);
  if (item?.tipoData === 'abertura') return DIAS_SUGERIDOS_ABERTURA;
  return 0;
}

/** A sugestão está sendo usada? É o que faz a explicação aparecer na tela. */
export const usandoSugestaoDeAbertura = (item, diasNoCampo) =>
  item?.tipoData === 'abertura'
  && Number(diasNoCampo) === DIAS_SUGERIDOS_ABERTURA
  && !(Number(item?.diasValidade) > 0)
  && !(Number(item?.prazos?.[item?.armazenamento]) > 0);


// ── O armazenamento que a pessoa usou da última vez ───────────
//
// ⚠️ A DOR QUE ISTO RESOLVE, contada pelo dono: ele estava etiquetando filé
// para RESFRIADO e, a cada item, o modal abria em CONGELADO — o padrão do
// cadastro. Trocar o seletor uma vez é nada; trocar a cada pote, no meio do
// serviço, é o atrito que faz a pessoa largar o app e voltar para a caneta.
//
// ⚠️ POR ITEM E SÓ NESTE APARELHO. Não mexe no cadastro de propósito: uma
// impressão avulsa não pode redefinir para a casa inteira o lugar onde o filé
// mora — quem faz isso é o responsável, em Meus itens, uma vez. E fica no
// aparelho porque é hábito de quem está imprimindo, não regra do restaurante:
// a cozinha e o estoque seco usam estados diferentes no mesmo item.
//
// ⚠️ GRAVA NA IMPRESSÃO, nunca ao trocar o seletor. Abrir o modal, olhar o
// congelado e desistir não é um hábito — é uma olhada.

/** Guarda o estado usado em cada item. `idsValidos` poda item já apagado. */
export function lembrarArmazenamentos(memoria, itens, idsValidos = null) {
  const novo = { ...(memoria || {}) };
  for (const it of itens || []) {
    if (it?.produtoId && it?.armazenamento) novo[it.produtoId] = it.armazenamento;
  }
  if (Array.isArray(idsValidos)) {
    const vivos = new Set(idsValidos);
    for (const id of Object.keys(novo)) if (!vivos.has(id)) delete novo[id];
  }
  return novo;
}

/**
 * Com que estado o modal abre para este item.
 *
 * ⚠️ A memória só vale se o estado AINDA EXISTE e se o item tem prazo nele.
 * Sem essa checagem, desligar "resfriado" nas configurações deixaria itens
 * abrindo num estado que sumiu da lista — e a etiqueta sairia sem validade,
 * calada. O cadastro é sempre o plano B.
 */
export function armazenamentoInicial(produto, memoria, estadosAtivos, prazos = null) {
  const ids = (estadosAtivos || []).map(a => a?.id ?? a);
  const lembrado = memoria?.[produto?.id];
  const temPrazo = (id) => !prazos || Number(prazos[id]) > 0;
  if (lembrado && ids.includes(lembrado) && temPrazo(lembrado)) return lembrado;
  return produto?.armazenamentoPadrao || ids[0] || 'congelado';
}
