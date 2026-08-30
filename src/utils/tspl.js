// =====================================================================
//  TSPL — a etiqueta desenhada na linguagem nativa da impressora
//
//  Por que existe: imprimir pelo diálogo do navegador passa por driver,
//  escala e paginação, e é daí que vieram TODOS os problemas que enfrentamos
//  — folhas em branco, tamanho errado, conteúdo atravessando a serrilha. Em
//  TSPL a gente manda a coordenada exata de cada texto. O que sai no papel é
//  o que está escrito aqui.
//
//  Confirmado na MDK-022: ela aceita TSPL por BLE e imprimiu.
//
//  ⚠️ COORDENADAS EM PONTOS, não em milímetros. A impressora é 203 DPI, que
//  dá 8 pontos por milímetro. Um rolo de 60x50 mm = 480 x 400 pontos. Trocar
//  de rolo muda TUDO aqui, por isso nada é número mágico solto: tudo deriva
//  de `larguraMm`/`alturaMm`.
// =====================================================================

export const PONTOS_POR_MM = 8; // 203 DPI
const mm = (v) => Math.round(v * PONTOS_POR_MM);

// Largura de caractere das fontes internas do TSPL, em pontos (multiplicador 1).
// É o que permite alinhar à direita sem adivinhar — TSPL não tem alinhamento.
const LARGURA_FONTE = { 1: 8, 2: 12, 3: 16, 4: 24, 5: 32 };
const ALTURA_FONTE  = { 1: 12, 2: 20, 3: 24, 4: 32, 5: 48 };

const larguraTexto = (txt, fonte, mul = 1) =>
  String(txt || '').length * (LARGURA_FONTE[fonte] || 12) * mul;

/** Corta o texto para caber na largura disponível, sem estourar a etiqueta. */
export function cortarParaLargura(txt, fonte, mul, pontosDisponiveis) {
  const t = String(txt || '');
  const porChar = (LARGURA_FONTE[fonte] || 12) * mul;
  const cabe = Math.floor(pontosDisponiveis / porChar);
  if (t.length <= cabe) return t;
  return cabe > 1 ? `${t.slice(0, cabe - 1)}.` : t.slice(0, cabe);
}

// ⚠️ TUDO VIRA ASCII, e isto veio da PROVA IMPRESSA, não da documentação.
// Mandamos CODEPAGE 1252 no cabeçalho — que é o correto pelo manual do TSPL —
// e a MDK-022 IGNOROU: "MANIPULAÇÃO" saiu "MANIPULA高0", "0°C" saiu "0贊" e
// "João" saiu "Jo鲷". O firmware está numa página de código asiática e não
// aceita a troca. Não dá para consertar mandando outro CODEPAGE; dá para não
// depender dele. Só existe um alfabeto que toda impressora térmica imprime
// igual, e é o ASCII de 7 bits.
//
// A etiqueta perde o acento: "MANIPULACAO", "-18C". Numa etiqueta de cozinha
// isso não atrapalha ninguém, e é muito melhor que ideograma no lugar da
// palavra. A tela continua com acento; só o papel é sem.
const TROCAS = { '°': '', 'º': '', 'ª': '', '·': '-', '–': '-', '—': '-', '“': "'", '”': "'", '’': "'" };
const paraASCII = (txt) => String(txt ?? '')
  .replace(/[°ºª·–—“”’]/g, (ch) => TROCAS[ch])
  // NFD separa a letra do acento; o acento sozinho é então descartado.
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // O que sobrar fora do ASCII (ideograma ou emoji no nome do produto) vira
  // espaço: um byte alto solto pode travar a leitura da linha inteira.
  .replace(/[^\x20-\x7e]/g, ' ');

// ⚠️ ASPAS DUPLAS QUEBRAM O COMANDO. Em TSPL o texto vai entre aspas, e uma
// aspa no meio do nome do produto ('Filé 1" espessura') encerra a string cedo
// e o resto vira comando inválido — a etiqueta sai truncada ou não sai. Vira
// aspa simples, que imprime igual e não quebra nada.
const limpar = (txt) => paraASCII(txt).replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();

// ⚠️ DUPLA BATIDA EM TUDO, e isto veio da comparação lado a lado: a mesma
// etiqueta saiu pelo computador e pelo celular, e a do celular ficou visivelmente
// mais fina. O motivo é que pelo computador o navegador RASTERIZA a fonte da
// tela e manda como imagem, com traço cheio; em TSPL quem desenha é a fonte
// interna da impressora, que é magra de fábrica.
// Imprimir o mesmo texto duas vezes, deslocado um ponto (0,12 mm), engrossa o
// traço sem borrar — é o negrito que térmica tem. Custa o dobro de comandos, o
// que numa etiqueta inteira dá menos de meio segundo a mais no Bluetooth.
const texto = (x, y, fonte, mul, conteudo) => {
  const t = limpar(conteudo);
  const cmd = (px) => `TEXT ${px},${y},"${fonte}",0,${mul},${mul},"${t}"`;
  return [cmd(x), cmd(x + 1)];
};

/**
 * Linha de rótulo à esquerda e valor à direita, como na etiqueta da tela.
 *
 * `fonteValor` deixa o valor maior que o rótulo. É como a VALIDADE se destaca:
 * pelo TAMANHO, já que o negrito virou padrão de todo o texto e por isso
 * deixou de diferenciar qualquer coisa.
 */
/**
 * ⚠️ VALOR ENCOSTADO NA DIREITA, e todos no MESMO tamanho.
 *
 * Esta linha já foi de três jeitos e vale registrar por quê, porque as duas
 * exigências parecem brigar e não brigam:
 *   1. valores à direita, validade num corpo maior → a validade começava 72
 *      pontos antes da manipulação; terminavam juntas, mas não ficavam uma
 *      sob a outra.
 *   2. todos começando numa coluna fixa → alinhou, mas deixou um vão morto
 *      na direita da etiqueta e as datas no meio do papel.
 *   3. (aqui) todos à direita, todos do MESMO tamanho → as duas datas têm 18
 *      caracteres, então encostadas na direita ficam alinhadas nas DUAS
 *      pontas. O tamanho igual é o que faz o alinhamento à direita funcionar.
 *
 * `sublinhado` é o destaque que sobrou para a validade depois que ela perdeu o
 * corpo maior: um traço sob a DATA, não sob a linha inteira — traço de ponta a
 * ponta viraria mais um divisor, e a etiqueta já tem dois.
 */
function linhaParDeValores(y, rotulo, valor, larguraUtil, margem, fonte = 2, sublinhado = false) {
  const mul = 1;
  const cmds = [...texto(margem, y, fonte, mul, rotulo)];
  if (valor) {
    const disponivel = larguraUtil - larguraTexto(rotulo, fonte, mul) - mm(1.5);
    const v = cortarParaLargura(valor, fonte, mul, disponivel);
    const larg = larguraTexto(v, fonte, mul);
    const x = Math.max(margem, margem + larguraUtil - larg);
    cmds.push(...texto(x, y, fonte, mul, v));
    if (sublinhado) cmds.push(`BAR ${x},${y + ALTURA_FONTE[fonte] + 2},${larg},2`);
  }
  return cmds;
}

/**
 * Comandos TSPL de UMA etiqueta.
 *
 * `campos` é o mesmo objeto que `montarCamposEtiqueta` devolve — a fonte da
 * verdade é uma só, então o que sai no papel bate com o que a tela mostra.
 */
export function etiquetaTSPL(campos, config, opcoes = {}) {
  const { larguraMm = 60, alturaMm = 50 } = config || {};
  const c = config?.campos || {};
  const copias = Math.max(1, parseInt(opcoes.copias) || 1);

  const L = mm(larguraMm);
  const A = mm(alturaMm);
  const margem = mm(2.5);
  const util = L - margem * 2;

  const linhas = [
    `SIZE ${larguraMm} mm,${alturaMm} mm`,
    // GAP é o espaço entre uma etiqueta e a próxima no rolo. Sem ele a
    // impressora não acha a serrilha e o conteúdo escorrega para a etiqueta
    // seguinte — foi exatamente o defeito do começo, agora pelo outro caminho.
    `GAP ${opcoes.gapMm ?? 2} mm,0 mm`,
    'DIRECTION 1',
    'CLS',
    // Continua sendo o pedido certo, mas NÃO confiamos nele: a MDK-022 ignora
    // e imprime na página asiática dela. Quem garante o texto é o paraASCII.
    'CODEPAGE 1252',
  ];

  let y = mm(2);

  // ── Nome do produto ──────────────────────────────────────────
  // Fonte grande, mas cai um degrau em nome comprido: é melhor um pouco menor
  // e legível do que cortado no meio.
  const nome = (campos.nome || '').toUpperCase();
  const espacoNome = campos.medida ? util * 0.72 : util;
  // ⚠️ A FONTE SAI DA LARGURA QUE SOBROU, nunca de um limite de letras. Antes
  // era "mais de 18 caracteres, diminui" — e "CORACAO A MODA", com 14, saía
  // cortado em "CORACAO A MO." porque ao lado tinha uma medida comendo espaço.
  // Contar letra ignora o tamanho da letra. Aqui vai da maior para a menor e
  // fica na primeira que couber; cortar é o último recurso.
  const fonteNome = [4, 3, 2].find(f => larguraTexto(nome, f, 1) <= espacoNome) || 2;
  linhas.push(...texto(margem, y, fonteNome, 1, cortarParaLargura(nome, fonteNome, 1, espacoNome)));
  if (campos.medida) {
    const m = cortarParaLargura(campos.medida, 3, 1, util * 0.26);
    linhas.push(...texto(margem + util - larguraTexto(m, 3, 1), y, 3, 1, m));
  }
  y += ALTURA_FONTE[fonteNome] + mm(1);

  linhas.push(`BAR ${margem},${y},${util},2`);
  y += mm(1.5);

  // ── Armazenamento (nome + faixa de temperatura) ──────────────
  if (c.armazenamento !== false && campos.armazenamentoLabel) {
    const arm = campos.armazenamentoFaixa
      ? `${campos.armazenamentoLabel} ${campos.armazenamentoFaixa}`
      : campos.armazenamentoLabel;
    linhas.push(...texto(margem, y, 2, 1, cortarParaLargura(arm, 2, 1, util)));
    y += ALTURA_FONTE[2] + mm(0.6);
  }

  // ── Datas e dados ────────────────────────────────────────────
  const linha = (rotulo, valor, { sublinhado = false } = {}) => {
    if (!valor) return;
    linhas.push(...linhaParDeValores(y, rotulo, valor, util, margem, 2, sublinhado));
    // ⚠️ Folga a mais quando há sublinhado, senão o traço da validade encosta
    // no rótulo da linha de baixo e vira sujeira.
    y += ALTURA_FONTE[2] + (sublinhado ? mm(1.2) : mm(0.5));
  };

  if (c.valOriginal !== false) linha('VAL. ORIG.:', campos.valOriginalFmt);
  if (c.fabricacao !== false) linha(`${campos.rotuloData}:`, campos.dataFabricacaoFmt);

  // ⚠️ VALIDADE EM LINHA PRÓPRIA, e não é escolha estética.
  // Em fonte grande, "VALIDADE:" + "25/02/2027 - 10:00" dá 432 pontos numa
  // etiqueta com 440 de área útil — não cabe por 4 pontos, e a data saía
  // cortada em "25/02/2027 - 10:." Perder a hora no campo que a equipe mais
  // olha, para ganhar uma linha, é troca ruim. Rótulo pequeno em cima, data
  // grande embaixo: é como a etiqueta profissional faz, e a data cabe inteira.
  // ⚠️ MESMA LINHA DA MANIPULAÇÃO, alinhada à direita, com a data UM TAMANHO
  // MAIOR. Já esteve sozinha embaixo para dar destaque, e no papel ficou pior:
  // a data descolava da coluna e a linha parecia órfã. Ler as duas datas uma
  // sob a outra é o que a equipe faz na geladeira, e comparar só funciona
  // alinhado. O destaque tinha que sair do negrito quando o negrito virou
  // padrão de tudo — então virou tamanho, que é o que se enxerga de longe.
  if (c.validade !== false) linha('VALIDADE:', campos.validadeFmt, { sublinhado: true });
  if (c.marca !== false) linha('MARCA:', campos.marca);
  if (c.sif !== false) linha('SIF:', campos.sif);
  if (c.responsavel !== false) linha('RESP.:', campos.responsavel);

  // ── Rodapé: quem produziu ────────────────────────────────────
  // ⚠️ Tem que bater com a prévia da tela. A primeira versão imprimia só o
  // NOME e deixava CNPJ e endereço de fora: a tela mostrava quatro linhas e o
  // papel saía com uma. Fora a diferença incomodar, o endereço de quem
  // manipulou é o que a fiscalização procura quando a etiqueta viaja com o
  // alimento (RDC 216 — identificação do estabelecimento).
  const est = config?.estabelecimento || {};
  const rodape = [];
  if (c.restaurante !== false && campos.restauranteNome) {
    rodape.push(campos.restauranteNome.toUpperCase());
  }
  if (c.estabelecimento !== false) {
    if (est.cnpj) rodape.push(`CNPJ: ${est.cnpj}`);
    if (est.endereco) rodape.push(est.endereco);
    // CEP e cidade juntos: são a mesma informação para quem lê, e uma linha a
    // menos no rodapé é uma linha a mais para o produto.
    const local = [est.cidade, est.cep].filter(Boolean).join('  ');
    if (local) rodape.push(local);
  }
  if (rodape.length) {
    // ⚠️ FONTE 2, NÃO A 1, e o motivo saiu impresso: com a fonte 1 as quatro
    // linhas do rodapé saíram UMA POR CIMA DA OUTRA, ilegíveis. A altura real
    // da fonte no firmware é bem maior que a da tabela do manual — o mesmo
    // engano que já tinha encavalado a validade. Fonte 2 é a menor cujo
    // tamanho eu conferi no papel, então é ela que manda no cálculo.
    // ⚠️ Um efeito colateral disso: a linha só cabe ~36 caracteres. Por isso o
    // CNPJ ganhou linha própria — junto com o CEP ele estourava e a etiqueta
    // saía com o CNPJ cortado, que é justo o dado que identifica a cozinha.
    const alturaLinha = ALTURA_FONTE[2] + mm(1);
    let yRodape = A - mm(2) - rodape.length * alturaLinha;
    linhas.push(`BAR ${margem},${yRodape - mm(1.2)},${util},2`);
    for (const l of rodape) {
      linhas.push(...texto(margem, yRodape, 2, 1, cortarParaLargura(l, 2, 1, util)));
      yRodape += alturaLinha;
    }
  }

  // ⚠️ CÓPIAS SÃO NATIVAS: `PRINT 1,N` manda a impressora repetir. Não é o app
  // que envia N vezes — menos tráfego e sem risco de sair uma a menos se a
  // conexão oscilar no meio.
  linhas.push(`PRINT 1,${copias}`);

  return linhas.join('\r\n') + '\r\n';
}

/** Vários itens numa tacada: cada bloco é uma etiqueta completa. */
export const loteTSPL = (etiquetas, config) =>
  etiquetas.map(({ campos, copias }) => etiquetaTSPL(campos, config, { copias })).join('');

/**
 * Texto → bytes Windows-1252.
 *
 * Depois do `paraASCII` já não sobra nada acima de 127, então isto é rede de
 * segurança — mas ela precisa existir: `TextEncoder` só faz UTF-8, e em UTF-8
 * um "Ç" que escapasse viraria DOIS bytes, lidos como dois caracteres
 * estranhos. Acima de 255 vira "?", nunca byte inválido: um byte solto pode
 * travar a impressão inteira por causa de um caractere.
 */
export function paraBytesLatin1(txt) {
  const s = String(txt ?? '');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const cod = s.charCodeAt(i);
    out[i] = cod <= 0xff ? cod : 0x3f; // '?'
  }
  return out;
}
