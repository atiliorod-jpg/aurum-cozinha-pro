import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// =====================================================================
//  FOTOS DE COMPARAÇÃO (Lote 0 da auditoria, 14/10/2026)
//
//  Ferramenta de quem mexe nas telas, não teste do deploy. Antes de um lote
//  visual: `npm run fotos:base` guarda como cada tela está. Depois:
//  `npm run fotos` compara e, onde mudou, deixa a imagem da diferença em
//  test-results — é assim que se confere que a mudança foi só a pretendida.
//
//  ⚠️ FORA DO DEPLOY DE PROPÓSITO: a fonte do Windows (Edge) e a do servidor
//  do GitHub (Chromium no Linux) desenham diferente, e a foto de um nunca
//  bateria com a do outro. As fotos-base ficam só neste computador
//  (e2e-fotos/__fotos__, no .gitignore).
// =====================================================================

export default defineConfig({
  ...base,
  testDir: 'e2e-fotos',
  testMatch: '**/*.pw.js',
  retries: 0,
  snapshotPathTemplate: '{testDir}/__fotos__/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' } },
  use: { ...base.use, viewport: { width: 375, height: 812 } },
});
