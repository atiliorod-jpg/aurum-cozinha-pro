import { bitmapTSPL } from '../utils/tsplBitmap';
import { medidasDoNome, corpoDoNomeMm, PONTOS_POR_MM } from '../utils/tspl';

/**
 * O nome do produto desenhado com a LETRA DA TELA, pronto para o TSPL.
 *
 * ⚠️ Vive em `lib/` e não em `utils/` porque precisa de `canvas` — é código de
 * navegador, e `utils/` é onde mora o que roda também no teste (este projeto
 * não tem jsdom).
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
  const nome = (campos?.nome || '').toUpperCase().trim();
  if (!nome) return null;

  const caixa = medidasDoNome(campos, config, linhasDeNome, true);
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
  const familia = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

  // ⚠️ O TAMANHO É O MESMO QUE A ETIQUETA DO COMPUTADOR USA, e isso é o pedido
  // inteiro: o dono comparou os dois papéis e preferiu a letra do computador.
  // Copiar a regra dele (3,9 mm, caindo para 3,2 mm em nome comprido — ver
  // `EtiquetaLabel` em components/EtiquetaPrint.jsx) é o que faz as duas
  // impressões saírem iguais. Perseguir "preencher a caixa" daria OUTRA letra,
  // maior que a do computador, que é justamente o que não foi pedido.
  //
  // ⚠️ Duas tentativas anteriores erraram por medir a régua errada: "86% da
  // altura da linha" saiu pequeno (a maiúscula é ~2/3 do corpo), e medir 'MÁQ'
  // deixou o ACENTO mandar no tamanho — o Á sozinho tirava 3 pontos de corpo
  // de todo nome, mesmo dos que não têm acento nenhum. Agora a régua é o
  // PRÓPRIO NOME.
  let tamanho = Math.max(8, Math.round(corpoDoNomeMm(nome) * PONTOS_POR_MM));

  const cabe = () => {
    ctx.font = `800 ${tamanho}px ${familia}`;
    const m = ctx.measureText(nome);
    const alto = (m.actualBoundingBoxAscent || tamanho * 0.72) + (m.actualBoundingBoxDescent || 0);
    // largura vale para o total: com duas linhas, o nome se reparte entre elas
    return alto <= alturaLinha && m.width <= caixa.largura * maxLinhas;
  };
  // Encolhe só se não couber — nome comprido perde corpo antes de perder letra.
  while (tamanho > 8 && !cabe()) tamanho -= 1;
  ctx.font = `800 ${tamanho}px ${familia}`;

  // ⚠️ Linha de base pela subida MEDIDA, não pelo topo da caixa: com
  // `textBaseline: 'top'` o navegador usa a métrica do corpo (que reserva
  // espaço para acento e descida mesmo quando não há nenhum), e a letra ficava
  // flutuando com uma folga que uma etiqueta de 50 mm não tem para dar.
  const subida = ctx.measureText(nome).actualBoundingBoxAscent || tamanho * 0.72;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';

  // Quebra pelas palavras, medindo de verdade.
  const palavras = nome.split(/\s+/);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(tentativa).width <= caixa.largura || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = p;
      if (linhas.length === maxLinhas) break;
    }
  }
  if (linhas.length < maxLinhas && atual) linhas.push(atual);

  // Sobrou texto que não coube nas linhas disponíveis: corta a última com o
  // mesmo "." que a fonte interna usa, para o papel não mentir que acabou ali.
  const usadas = linhas.slice(0, maxLinhas);
  if (usadas.length && usadas.join(' ') !== nome) {
    // Não coube nas linhas disponíveis. A última passa a mostrar TUDO que
    // sobrou, encurtado até caber, com o mesmo "." que a fonte interna usa —
    // o papel não pode dar a entender que o nome acabou ali.
    const anteriores = usadas.slice(0, -1).join(' ');
    let resto = nome.slice(anteriores.length).trim();
    while (resto.length > 1 && ctx.measureText(`${resto}.`).width > caixa.largura) {
      resto = resto.slice(0, -1);
    }
    usadas[usadas.length - 1] = `${resto}.`;
  }

  // ⚠️ Desenha pela LINHA DE BASE, deslocada pela subida medida — não pelo
  // topo da caixa. Com `textBaseline: 'top'` o navegador usa a métrica do
  // corpo (que inclui espaço para acento e descida), e a maiúscula ficava
  // flutuando com uma folga que não existe numa etiqueta de 50 mm.
  usadas.forEach((l, i) => ctx.fillText(l, 0, Math.round(i * alturaLinha + subida)));

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
  };
}
