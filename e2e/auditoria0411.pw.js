import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo, continuarImprimindo } from './apoio';

// =====================================================================
//  AUDITORIA DE 04/11/2026 — os bugs achados, conferidos no navegador.
// =====================================================================

test.use({ viewport: { width: 390, height: 844 } });

test('Pro: trocar de tela pela barra de baixo abre a tela nova no topo', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await page.getByRole('link', { name: 'Imprimir' }).last().click();
  await entrarComo(page, 'Maria');
  await page.mouse.wheel(0, 900);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await page.getByRole('link', { name: /Validades/ }).last().click();
  await expect(page.getByRole('heading', { name: 'Validades' })).toBeVisible();
  // antes: abria rolada, com o começo da tela escondido atrás do cabeçalho
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: a reimpressão sai com o lote do fabricante do papel original', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  let janela = page.getByRole('dialog');
  await janela.getByLabel('Lote do fabricante').fill('L-2026-1104');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await continuarImprimindo(page);
  await abrir(page, '/impressas');
  await page.getByRole('button', { name: 'Reimprimir etiqueta de Frango desfiado' }).first().click();
  janela = page.getByRole('dialog');
  // antes: a etiqueta de reposição saía sem o lote — o que liga o pote ao recall
  await expect(janela.locator('.etiqueta-label').first()).toContainText('L-2026-1104');
  await expect(janela.getByLabel('Lote do fabricante')).toHaveValue('L-2026-1104');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: o nome expira com "Saiu no papel?" aberto e a próxima pessoa não é tirada', async ({ page }) => {
  await page.clock.install();
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  const janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await expect(janela.getByRole('button', { name: 'Sim', exact: true })).toBeVisible();
  // ninguém responde por mais de 1 minuto: o nome expira, a janela espera
  await page.clock.fastForward('01:10');
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  // a etiqueta saiu, mas a Maria já não estava: nada de "Continuar imprimindo?"
  await expect(page.getByRole('heading', { name: 'Quem vai imprimir?' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /^Continuar imprimindo/ })).toHaveCount(0);
  // a próxima pessoa entra e continua lá depois de 5 s (antes: era tirada)
  await page.getByRole('button', { name: 'Maria', exact: true }).click();
  await page.clock.fastForward('00:08');
  await expect(page.getByText('Imprimindo como Maria')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /^Continuar imprimindo/ })).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});
