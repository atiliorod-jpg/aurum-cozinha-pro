/**
 * Gera icon-192.png e icon-512.png a partir do SVG usando sharp ou canvas.
 * Rode: node scripts/gerar-icones.mjs
 *
 * Se não tiver sharp: npm install --save-dev sharp
 */
import { readFileSync, writeFileSync } from 'fs';
import { createCanvas, loadImage } from 'canvas';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dir, '..', 'public');

async function gerarIconePNG(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Fundo navy com bordas arredondadas
  const r = size * 0.188; // raio ~96 em 512
  ctx.fillStyle = '#1B2A41';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Ícone tipo "A" em gold
  const cx = size / 2;
  const cy = size / 2;
  const s = size / 512;

  ctx.fillStyle = '#C9A24B';

  // Triângulo principal (o "A")
  ctx.beginPath();
  ctx.moveTo(cx, cy - 130 * s);
  ctx.lineTo(cx - 85 * s, cy + 60 * s);
  ctx.lineTo(cx - 50 * s, cy + 60 * s);
  ctx.lineTo(cx, cy - 20 * s);
  ctx.lineTo(cx + 50 * s, cy + 60 * s);
  ctx.lineTo(cx + 85 * s, cy + 60 * s);
  ctx.closePath();
  ctx.fill();

  // Barra horizontal
  ctx.fillRect(cx - 55 * s, cy + 20 * s, 110 * s, 20 * s);

  // Base
  ctx.globalAlpha = 0.7;
  ctx.fillRect(cx - 70 * s, cy + 60 * s, 140 * s, 22 * s);
  ctx.globalAlpha = 1;

  // Texto AURUM
  const fontSize = Math.round(68 * s);
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.fillStyle = '#C9A24B';
  ctx.textAlign = 'center';
  ctx.globalAlpha = 1;
  ctx.fillText('AURUM', cx, size * 0.84);

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(publicDir, `icon-${size}.png`);
  writeFileSync(outPath, buffer);
  console.log(`✅ Gerado: ${outPath}`);
}

try {
  await gerarIconePNG(192);
  await gerarIconePNG(512);
  console.log('\n✅ Ícones gerados com sucesso!');
} catch (e) {
  console.error('❌ Erro:', e.message);
  console.error('   Instale: npm install --save-dev canvas');
}
