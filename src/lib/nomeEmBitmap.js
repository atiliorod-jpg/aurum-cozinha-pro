import { bitmapTSPL } from '../utils/tsplBitmap';
import { medidasDoNome, corpoDoNomeMm, PONTOS_POR_MM } from '../utils/tspl';

const FAMILIA = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

// ⚠️ PISO DE 2,4 mm, e é o número que este próprio app já mediu no papel:
// numa térmica, letra menor que isso perde o traço (ver o rodapé em
// `EtiquetaLabel`, components/EtiquetaPrint.jsx). O laço de encolher descia
// até 8 px — 1 mm —, e um nome de palavra única comprida saía com 1,5 mm,
// ilegível, onde a fonte interna simplesmente cortava com ".". Abaixo do piso
// não se encolhe mais: corta-se, como a fonte interna sempre fez.
const PISO_PX = Math.round(2.4 * PONTOS_POR_MM);

/**
 * O nome do produto desenhado com a LETRA DA TELA, pronto para o TSPL.
 *
 * ⚠️ Vive em `lib/` e não em `utils/` porque precisa de `canvas` — é código de
 * navegador, e `utils/` é onde mora o que roda também no teste (este projeto
 * não tem jsdom; os testes daqui simulam o canvas).
 *
 * ⚠️ A QUEBRA DE LINHA AQUI É PELA LARGURA REAL DA FONTE, medida no canvas —
 * não pela métrica da impressora. É metade do ganho: a fonte interna é de
 * largura FIXA (12 pontos por caractere na fonte 2), e a da tela é
 * proporcional, então no mesmo espaço cabe bem mais texto. Nome que a fonte
 * interna cortaria com "." costuma caber inteiro aqui.
 *
 * Devolve `null` sempre que qualquer coisa faltar — sem canvas, sem nome, sem
 * contexto 2D. Quem chama cai de volta na fonte interna, que continua
 * funcionando: isto é um caminho a mais, nunca uma dependência.
 */
export function nomeEmBitmap(campos, config, linhasDeNome = 1) {
  if (typeof document === 'undefined') return null;
  // ⚠️ ESPAÇO NORMALIZADO ANTES DE TUDO. "File  Mignon" (dois espaços, um TAB,
  // um espaço inquebrável colado de mensagem) ganhava um "." no fim: a
  // conferência "coube tudo?" comparava o nome remontado com UM espaço contra
  // o original com dois. Saía "FILE  MIGNON." — cara de nome cortado num nome
  // que cabia inteiro.
  const nome = String(campos?.nome || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!nome) return null;

  const caixa = medidasDoNome({ ...campos, nome }, config, linhasDeNome, true);
  if (!caixa.largura || !caixa.altura) return null;

  let cv;
  try { cv = document.createElement('canvas'); } catch { return null; }
  cv.width = caixa.largura;
  cv.height = caixa.altura;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Fundo branco: o papel. O bitmap do TSPL não tem transparência.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, caixa.largura, caixa.altura);

  // ⚠️ As linhas são as que a CAIXA reservou, não o teto que foi pedido —
  // senão o canvas quebraria em duas um nome cuja caixa tem espaço para uma
  // só, e a segunda linha sairia por baixo do corte.
  const maxLinhas = Math.max(1, caixa.linhas.length);
  const alturaLinha = caixa.altura / maxLinhas;

  // ⚠️ O TAMANHO É O MESMO QUE A ETIQUETA DO COMPUTADOR USA, e isso é o pedido
  // inteiro: o dono comparou os dois papéis e preferiu a letra do computador.
  // `corpoDoNomeMm` é a regra dele, num lugar só. Perseguir "preencher a
  // caixa" daria OUTRA letra, maior que a do computador.
  //
  // ⚠️ Duas tentativas anteriores erraram por medir a régua errada: "86% da
  // altura da linha" saiu pequeno (a maiúscula é ~2/3 do corpo), e medir 'MÁQ'
  // deixou o ACENTO mandar no tamanho de todo nome, até dos sem acento. A
  // régua é o PRÓPRIO NOME.
  let tamanho = Math.max(PISO_PX, Math.round(corpoDoNomeMm(nome) * PONTOS_POR_MM));
  const usarFonte = () => { ctx.font = `800 ${tamanho}px ${FAMILIA}`; };
  const cabe = () => {
    usarFonte();
    const m = ctx.measureText(nome);
    const alto = (m.actualBoundingBoxAscent || tamanho * 0.72) + (m.actualBoundingBoxDescent || 0);
    // largura vale para o total: com duas linhas, o nome se reparte entre elas
    return alto <= alturaLinha && m.width <= caixa.largura * maxLinhas;
  };
  // Encolhe só se não couber, e só até o piso — dali para baixo, corta.
  while (tamanho > PISO_PX && !cabe()) tamanho -= 1;
  usarFonte();

  // ⚠️ Linha de base pela subida MEDIDA, não pelo topo da caixa: com
  // `textBaseline: 'top'` o navegador usa a métrica do corpo (que reserva
  // espaço para acento e descida mesmo quando não há nenhum), e a letra ficava
  // flutuando com uma folga que uma etiqueta de 50 mm não tem para dar.
  const subida = ctx.measureText(nome).actualBoundingBoxAscent || tamanho * 0.72;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';

  const cabeNaLinha = (t) => ctx.measureText(t).width <= caixa.largura;
  const encurtar = (t) => {
    let r = t;
    while (r.length > 1 && !cabeNaLinha(`${r}.`)) r = r.slice(0, -1);
    return `${r}.`;
  };

  // Quebra pelas palavras, medindo de verdade. Palavra que sozinha já não cabe
  // fica numa linha só dela — e é cortada abaixo.
  const todas = [];
  let atual = '';
  for (const p of nome.split(' ')) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (atual && !cabeNaLinha(tentativa)) { todas.push(atual); atual = p; } else { atual = tentativa; }
  }
  if (atual) todas.push(atual);

  // Sobrou linha além das que a caixa tem: a última recebe TODO o resto.
  const usadas = todas.length > maxLinhas
    ? [...todas.slice(0, maxLinhas - 1), todas.slice(maxLinhas - 1).join(' ')]
    : todas;

  // ⚠️ TODA LINHA QUE NÃO CABE É CORTADA COM ".", não só a última. A versão
  // anterior só olhava "sobrou texto?" — e uma palavra única maior que a caixa
  // não sobra: ela entra inteira na linha e é desenhada além da borda. Medido:
  // 561 pontos de texto numa caixa de 440, cortado no meio de uma letra, sem
  // o ponto que avisa que o nome continuava.
  const linhas = usadas.map((l) => (cabeNaLinha(l) ? l : encurtar(l)));

  linhas.forEach((l, i) => ctx.fillText(l, 0, Math.round(i * alturaLinha + subida)));

  let pixels;
  try {
    pixels = ctx.getImageData(0, 0, caixa.largura, caixa.altura).data;
  } catch {
    return null; // canvas "sujo" ou bloqueado — cai na fonte interna
  }

  return {
    bitmap: bitmapTSPL(pixels, caixa.largura, caixa.altura),
    // A prévia desenha ESTA imagem, não uma recriação dela: é o mesmo pixel
    // que vai para a impressora.
    imagem: cv.toDataURL('image/png'),
    caixa,
    linhas,
    tamanho,
  };
}

/**
 * Os DOIS desenhos do nome — em uma linha e em duas.
 *
 * ⚠️ É o que devolve à escalada de níveis (`melhorDesenho`, utils/tspl.js) o
 * degrau "nome volta a uma linha". Com um desenho só, a altura do nome ficava
 * cravada e a etiqueta cheia com nome longo estourava o rodapé. Quem escolhe
 * qual dos dois vai para o papel é a escalada, via `nomeBitmaps`.
 *
 * Para nome curto os dois são iguais (a caixa de duas linhas reserva uma só).
 */
export function bitmapsDoNome(campos, config) {
  const um = nomeEmBitmap(campos, config, 1);
  if (!um) return null;
  const dois = nomeEmBitmap(campos, config, 2) || um;
  return {
    bitmaps: { 1: um.bitmap, 2: dois.bitmap },
    imagens: { 1: um, 2: dois },
  };
}
