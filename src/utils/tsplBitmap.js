// =====================================================================
//  Texto desenhado como IMAGEM, para o celular usar a mesma letra do
//  computador
//
//  ⚠️ POR QUE EXISTE. Pelo computador o navegador RASTERIZA a fonte da tela e
//  manda a etiqueta como imagem — letra cheia, bonita, a mesma que se vê na
//  prévia. Pelo Bluetooth quem desenha é a fonte INTERNA da impressora, que é
//  quadradona e magra de fábrica. O dono comparou os dois no papel e apontou o
//  nome do item: o do computador ficou melhor.
//
//  A única forma de ter a mesma letra pelo Bluetooth é mandar PIXEL, não
//  texto. É o que este arquivo prepara.
//
//  ⚠️ SÓ O NOME DO PRODUTO, e isto é orçamento de tempo, não preguiça. A
//  etiqueta inteira em 60x50 mm a 203 DPI dá 480x400 pontos = 24.000 bytes.
//  O BLE aqui manda 20 bytes por escrita (ver lib/impressoraBLE.js — acima
//  disso o firmware barato quebra), o que daria 1.200 escritas e algo entre 10
//  e 40 segundos por etiqueta. Inviável numa bancada. Só o nome sai por volta
//  de 3.500 bytes: ~175 escritas, uns 2 a 4 segundos. É onde o ganho aparece e
//  o custo cabe.
//
//  ⚠️ NO TSPL, BIT 1 É BRANCO E BIT 0 É PRETO — invertido do que quase todo
//  mundo assume. Trocar isso imprime um retângulo preto com a letra vazada, e
//  o teste disso sai em etiqueta de verdade, não na tela.
// =====================================================================

import QRCode from 'qrcode';

/** Um pixel é tinta? Acima do limiar é claro demais e vira branco. */
const ehTinta = (cinza, alfa, limiar) => alfa > 128 && cinza < limiar;

/**
 * Pixels → bytes do comando BITMAP do TSPL.
 *
 * `pixels` é o `data` de um ImageData (RGBA em sequência). Devolve os dados
 * como STRING de caracteres 0-255: é o que `paraBytesLatin1` (utils/tspl.js)
 * converte byte a byte, sem passar por UTF-8. Assim o binário viaja junto do
 * resto dos comandos, sem um caminho de envio separado.
 *
 * Função PURA para ter teste sem canvas e sem impressora.
 */
export function bitmapTSPL(pixels, largura, altura, limiar = 160) {
  const bytesPorLinha = Math.ceil(largura / 8);
  const saida = new Array(bytesPorLinha * altura);
  let n = 0;
  for (let y = 0; y < altura; y++) {
    for (let bx = 0; bx < bytesPorLinha; bx++) {
      // ⚠️ Começa em 0xFF (tudo BRANCO) e vai apagando o bit de cada ponto que
      // tem tinta. É a polaridade invertida do TSPL, escrita de forma que ela
      // não dependa de ninguém lembrar dela lá na frente.
      let byte = 0xff;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x >= largura) break;          // sobra do último byte fica branca
        const i = (y * largura + x) * 4;
        const cinza = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000;
        if (ehTinta(cinza, pixels[i + 3], limiar)) byte &= ~(1 << (7 - bit)) & 0xff;
      }
      saida[n++] = String.fromCharCode(byte);
    }
  }
  return { bytesPorLinha, altura, dados: saida.join('') };
}

/**
 * O comando pronto. `modo` 0 = OVERWRITE (apaga o que estiver embaixo).
 *
 * ⚠️ Os dados vão COLADOS na vírgula, sem quebra de linha no meio: o firmware
 * lê exatamente `bytesPorLinha * altura` bytes a partir dali. Por isso um 0x0D
 * ou 0x0A dentro da imagem não confunde o parser — ele não está procurando
 * fim de linha, está contando bytes.
 */
/**
 * O QR da etiqueta como BITMAP do TSPL (30/09/2026, baixa pela etiqueta).
 *
 * ⚠️ BITMAP E NÃO O COMANDO `QRCODE`. A MDK-022 é clone de firmware TSC, e
 * não há como saber pelo app se ela entende `QRCODE` — um comando que ela
 * não conhece sai como etiqueta sem o código, sem erro nenhum. O BITMAP ela
 * já imprime todo dia (é o nome do produto), então o QR vai pelo mesmo
 * caminho: os módulos desenhados ponto a ponto.
 *
 * `pontos` por módulo: 4 é o mínimo para a borda sair limpa numa térmica de
 * 203 DPI (ver o QR da etiqueta do computador). `margem` em módulos: a zona
 * de silêncio que a câmera precisa para achar a borda — o resto dela é o
 * papel em branco em volta.
 *
 * O endereço do pote (42 caracteres, modo alfanumérico) dá a versão 3: 29
 * módulos → (29 + 2) × 4 = 124 pontos = 15,5 mm, uns 2 KB pelo Bluetooth.
 */
export function bitmapDoQR(texto, pontos = 4, margem = 1) {
  if (!texto) return null;
  let qr;
  try { qr = QRCode.create(texto, { errorCorrectionLevel: 'M' }); } catch { return null; }
  const n = qr.modules.size;
  const lado = (n + 2 * margem) * pontos;
  const bytesPorLinha = Math.ceil(lado / 8);
  const saida = new Array(bytesPorLinha * lado);
  let k = 0;
  for (let y = 0; y < lado; y++) {
    const my = Math.floor(y / pontos) - margem;
    for (let bx = 0; bx < bytesPorLinha; bx++) {
      // tudo BRANCO (bit 1) e apaga o bit de cada ponto preto — a polaridade
      // invertida do TSPL, como em `bitmapTSPL`
      let byte = 0xff;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x >= lado) break;
        const mx = Math.floor(x / pontos) - margem;
        if (mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.get(my, mx)) byte &= ~(1 << (7 - bit)) & 0xff;
      }
      saida[k++] = String.fromCharCode(byte);
    }
  }
  return { bytesPorLinha, altura: lado, largura: lado, modulos: n, dados: saida.join('') };
}

export const comandoBITMAP = (x, y, bmp, modo = 0) =>
  `BITMAP ${x},${y},${bmp.bytesPorLinha},${bmp.altura},${modo},${bmp.dados}`;
