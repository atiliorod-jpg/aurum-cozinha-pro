import { defineConfig } from '@playwright/test';

// =====================================================================
//  O ROBÔ QUE ABRE O APP (23/09/2026, pedido do dono)
//
//  Os testes do vitest leem o CÓDIGO — o projeto não tem jsdom — e nenhum
//  deles abre uma tela de verdade. Uma tela que quebra ao abrir (hook fora de
//  ordem, variável usada antes de existir) passava por tudo e chegava ao
//  cliente. Este robô abre o app JÁ COMPILADO num navegador de verdade, entra
//  na demonstração dos dois planos e visita cada tela. Roda a cada
//  publicação (.github/workflows/deploy.yml): falhou, não publica.
//
//  Local: `npm run robo` (usa o Edge já instalado no Windows — nada para
//  baixar). No GitHub: o Chromium que o próprio Playwright instala.
// =====================================================================

const PORTA = 4179;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.pw.js',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: `http://localhost:${PORTA}`,
    channel: process.env.CI ? undefined : 'msedge',
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npx vite preview --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
