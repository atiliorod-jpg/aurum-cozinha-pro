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

// ⚠️ ASPAS DUPLAS QUEBRAM O COMANDO. Em TSPL o texto vai entre aspas, e uma
// aspa no meio do nome do produto ('Filé 1" espessura') encerra a string cedo
// e o resto vira comando inválido — a etiqueta sai truncada ou não sai. Vira
// aspa simples, que imprime igual e não quebra nada.
const limpar = (txt) => String(txt ?? '').replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();

const texto = (x, y, fonte, mul, conteudo) =>
  `TEXT ${x},${y},"${fonte}",0,${mul},${mul},"${limpar(conteudo)}"`;

/** Linha de rótulo à esquerda e valor à direita, como na etiqueta da tela. */
function linhaParDeValores(y, rotulo, valor, larguraUtil, margem, fonte = 2, mul = 1) {
  const cmds = [texto(margem, y, fonte, mul, rotulo)];
  if (valor) {
    // ⚠️ O espaço do valor é o que SOBRA depois do rótulo, não um percentual
    // fixo. Com percentual, "VALIDADE: 25/02/2027 - 10:00" em fonte grande
    // saía cortado como "25/02/2027 - 10:." — perdendo a hora justamente no
    // campo que a equipe mais olha. Um teste pegou.
    const disponivel = larguraUtil - larguraTexto(rotulo, fonte, mul) - mm(1.5);
    const v = cortarParaLargura(valor, fonte, mul, disponivel);
    const x = margem + larguraUtil - larguraTexto(v, fonte, mul);
    cmds.push(texto(Math.max(margem, x), y, fonte, mul, v));
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
    // ⚠️ Acento só sai com a página de código certa. 1252 é a Latin-1 do
    // Windows, que a maioria das térmicas TSPL entende — e o texto tem que ir
    // codificado nela também (ver paraBytesLatin1).
    'CODEPAGE 1252',
  ];

  let y = mm(2);

  // ── Nome do produto ──────────────────────────────────────────
  // Fonte grande, mas cai um degrau em nome comprido: é melhor um pouco menor
  // e legível do que cortado no meio.
  const nome = (campos.nome || '').toUpperCase();
  const fonteNome = nome.length > 18 ? 3 : 4;
  const espacoNome = campos.medida ? util * 0.72 : util;
  linhas.push(texto(margem, y, fonteNome, 1, cortarParaLargura(nome, fonteNome, 1, espacoNome)));
  if (campos.medida) {
    const m = cortarParaLargura(campos.medida, 3, 1, util * 0.26);
    linhas.push(texto(margem + util - larguraTexto(m, 3, 1), y, 3, 1, m));
  }
  y += ALTURA_FONTE[fonteNome] + mm(1);

  linhas.push(`BAR ${margem},${y},${util},2`);
  y += mm(1.5);

  // ── Armazenamento (nome + faixa de temperatura) ──────────────
  if (c.armazenamento !== false && campos.armazenamentoLabel) {
    const arm = campos.armazenamentoFaixa
      ? `${campos.armazenamentoLabel} ${campos.armazenamentoFaixa}`
      : campos.armazenamentoLabel;
    linhas.push(texto(margem, y, 2, 1, cortarParaLargura(arm, 2, 1, util)));
    y += ALTURA_FONTE[2] + mm(0.6);
  }

  // ── Datas e dados ────────────────────────────────────────────
  const linha = (rotulo, valor, fonte = 2, mul = 1) => {
    if (!valor) return;
    linhas.push(...linhaParDeValores(y, rotulo, valor, util, margem, fonte, mul));
    y += ALTURA_FONTE[fonte] * mul + mm(0.5);
  };

  if (c.valOriginal !== false) linha('VAL. ORIG.:', campos.valOriginalFmt);
  if (c.fabricacao !== false) linha(`${campos.rotuloData}:`, campos.dataFabricacaoFmt);

  // ⚠️ VALIDADE EM LINHA PRÓPRIA, e não é escolha estética.
  // Em fonte grande, "VALIDADE:" + "25/02/2027 - 10:00" dá 432 pontos numa
  // etiqueta com 440 de área útil — não cabe por 4 pontos, e a data saía
  // cortada em "25/02/2027 - 10:." Perder a hora no campo que a equipe mais
  // olha, para ganhar uma linha, é troca ruim. Rótulo pequeno em cima, data
  // grande embaixo: é como a etiqueta profissional faz, e a data cabe inteira.
  if (c.validade !== false && campos.validadeFmt) {
    linhas.push(texto(margem, y, 1, 1, 'VALIDADE'));
    y += ALTURA_FONTE[1] + mm(0.4);
    linhas.push(texto(margem, y, 3, 1, cortarParaLargura(campos.validadeFmt, 3, 1, util)));
    y += ALTURA_FONTE[3] + mm(0.8);
  }
  if (c.marca !== false) linha('MARCA:', campos.marca);
  if (c.sif !== false) linha('SIF:', campos.sif);
  if (c.responsavel !== false) linha('RESP.:', campos.responsavel);

  // ── Rodapé: quem produziu ────────────────────────────────────
  if (c.restaurante !== false && campos.restauranteNome) {
    const yRodape = A - mm(6);
    linhas.push(`BAR ${margem},${yRodape - mm(1.5)},${util},2`);
    linhas.push(texto(margem, yRodape, 1, 1,
      cortarParaLargura(campos.restauranteNome.toUpperCase(), 1, 1, util)));
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
 * ⚠️ `TextEncoder` só faz UTF-8, e em UTF-8 o "Ç" vira DOIS bytes — a
 * impressora leria como dois caracteres estranhos. Com CODEPAGE 1252 no
 * cabeçalho, cada caractere acentuado precisa sair como UM byte. Acima de 255
 * não há equivalente: vira "?" em vez de byte inválido, que travaria a
 * impressão inteira por causa de um caractere.
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
