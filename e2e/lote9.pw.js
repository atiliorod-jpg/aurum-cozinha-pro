import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir } from './apoio';

// =====================================================================
//  LOTE 9 DA AUDITORIA (D9, 15/10/2026) — a demonstração como vitrine:
//  custos com valor, relatório de etiquetas com dados e a faixa amarela sem
//  cobrir o cabeçalho.
// =====================================================================

test('demonstração: custos com valor e relatório de etiquetas com dados', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/financeiro');
  await expect(page.locator('main')).toContainText(/R\$\s?[1-9]/);
  await abrir(page, '/relatorio-etiquetas');
  await expect(page.getByText(/os dias anteriores são de exemplo/)).toBeVisible();
  await expect(page.locator('main')).not.toContainText('não existe na demonstração');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('demonstração: ao rolar, a faixa amarela não cobre o cabeçalho', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 });
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/estoque');
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(300);
  const faixa = await page.getByText('Demonstração — dados de exemplo').boundingBox();
  const titulo = await page.getByRole('heading', { name: 'Estoque', level: 1 }).boundingBox();
  // o título continua visível, logo abaixo da faixa
  expect(titulo.y).toBeGreaterThanOrEqual(faixa.y + faixa.height - 1);
  await expect(page.getByRole('button', { name: /^Conta de/ })).toBeInViewport();
  expect(erros, erros.join('\n')).toEqual([]);
});
