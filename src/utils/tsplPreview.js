// =====================================================================
//  Ler de volta o TSPL que já foi gerado, para a prévia DESENHAR o papel
//
//  ⚠️ POR QUE ISTO EXISTE. A mesma etiqueta era desenhada DUAS VEZES, por dois
//  códigos diferentes: HTML/CSS na tela e TSPL na impressora. Nada garantia que
//  concordassem — a única garantia era alguém lembrar de mexer nos dois. E não
//  lembrou: o nome saía inteiro na tela e cortado no papel, o endereço perdia o
//  bairro só no rolo, e o rodapé agrupava CNPJ e CEP de um jeito na tela e de
//  outro no papel. Três defeitos, uma causa só.
//
//  Aqui a prévia deixa de ser uma OPINIÃO sobre o papel e passa a ser uma
//  LEITURA dele: o mesmo texto TSPL que vai para a impressora é interpretado e
//  desenhado. Campo novo no gerador aparece na prévia sem ninguém tocar na
//  tela; texto que o gerador cortar aparece cortado.
//
//  ⚠️ ISTO NÃO GERA NADA E NÃO MUDA NADA DO QUE É IMPRESSO. Só lê. O gerador
//  (`utils/tspl.js`) está intocado, e o caminho do diálogo do navegador
//  continua imprimindo o MESMO HTML de sempre — ver EtiquetaPrint.jsx.
//
//  ⚠️ Limite honesto: a fonte da tela nunca vai ser a fonte interna da
//  impressora, então o desenho da LETRA continua sendo aproximação. O que passa
//  a ser exato é a GEOMETRIA — posição, largura ocupada e quebra —, que é de
//  onde vinham os defeitos.
// =====================================================================

import { LARGURA_FONTE, ALTURA_FONTE, PONTOS_POR_MM } from './tspl';

/**
 * TSPL → o que desenhar, em PONTOS da impressora (203 DPI, 8 pontos/mm).
 *
 * Lê só o que marca tinta: `TEXT` e `BAR`. `CLS`, `GAP`, `DIRECTION` e
 * `CODEPAGE` são preparo da impressora e não desenham nada.
 *
 * ⚠️ PARA NO PRIMEIRO `PRINT`. Um lote (`loteTSPL`) emenda várias etiquetas no
 * mesmo texto; a prévia mostra UMA. Sem esta parada, a segunda etiqueta seria
 * desenhada por cima da primeira, nas mesmas coordenadas.
 */
export function interpretarTSPL(texto) {
  let larguraMm = 60;
  let alturaMm = 50;
  const desenho = [];

  for (const bruta of String(texto ?? '').split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;

    if (/^PRINT\b/i.test(linha)) break;

    const tamanho = linha.match(/^SIZE\s+([\d.]+)\s*mm\s*,\s*([\d.]+)\s*mm$/i);
    if (tamanho) {
      larguraMm = parseFloat(tamanho[1]);
      alturaMm = parseFloat(tamanho[2]);
      continue;
    }

    const barra = linha.match(/^BAR\s+(-?\d+)\s*,\s*(-?\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/i);
    if (barra) {
      desenho.push({
        tipo: 'barra',
        x: +barra[1], y: +barra[2], largura: +barra[3], altura: +barra[4],
      });
      continue;
    }

    // TEXT x,y,"fonte",rotacao,mulX,mulY,"conteúdo"
    // ⚠️ O conteúdo é ganancioso até a ÚLTIMA aspa da linha: ele pode conter
    // vírgula ("Av. Aguiar, 1234"), e um casamento preguiçoso cortaria ali.
    const texto1 = linha.match(
      /^TEXT\s+(-?\d+)\s*,\s*(-?\d+)\s*,\s*"([^"]*)"\s*,\s*(-?\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"(.*)"$/i,
    );
    if (texto1) {
      const conteudo = texto1[7];
      if (!conteudo) continue; // texto vazio não marca tinta
      desenho.push({
        tipo: 'texto',
        x: +texto1[1], y: +texto1[2],
        fonte: texto1[3],
        rotacao: +texto1[4],
        mulX: +texto1[5], mulY: +texto1[6],
        conteudo,
      });
    }
  }

  return { larguraMm, alturaMm, desenho };
}

/** Largura que ESTE texto ocupa no papel, na métrica da impressora. */
export const larguraDoTexto = (d) =>
  (d.conteudo || '').length * (LARGURA_FONTE[d.fonte] || 12) * (d.mulX || 1);

/** Altura da caixa da letra, na métrica da impressora. */
export const alturaDoTexto = (d) => (ALTURA_FONTE[d.fonte] || 20) * (d.mulY || 1);

/** Tamanho do papel em pontos — é o viewBox do desenho. */
export const papelEmPontos = ({ larguraMm, alturaMm }) => ({
  largura: Math.round(larguraMm * PONTOS_POR_MM),
  altura: Math.round(alturaMm * PONTOS_POR_MM),
});
