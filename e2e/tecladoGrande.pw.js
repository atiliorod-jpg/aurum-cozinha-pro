import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo } from './apoio';

// =====================================================================
//  O TECLADO NUMÉRICO GRANDE (23/11/2026, jeito do Magurō)
//
//  COM O DEDO (celular e tablet), tocar na quantidade de um lançamento abre
//  o teclado grande — sem o teclado pequeno do sistema. No computador o
//  campo continua digitável (os outros cenários do robô usam assim).
//  Aqui o robô finge ser um celular de tela de toque.
// =====================================================================

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const tocarTeclas = async (teclado, teclas) => {
  for (const t of teclas) await teclado.getByRole('button', { name: t === ',' ? 'Vírgula' : t, exact: true }).click();
};

test('Pro, Entradas: com o dedo, a quantidade abre o teclado grande', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/entradas');
  const campo = page.getByRole('spinbutton', { name: 'Quantidade de Filé de Frango (porção)' });
  // com o dedo o campo não chama o teclado do sistema
  await expect(campo).toHaveAttribute('inputmode', 'none');
  await campo.click();
  const teclado = page.getByRole('dialog', { name: 'Quantidade de Filé de Frango (porção)' });
  await expect(teclado).toBeVisible();
  await tocarTeclas(teclado, ['2', ',', '5', 'OK']);
  await expect(teclado).toHaveCount(0);
  await expect(campo).toHaveValue('2.5');
  // o − e o + continuam somando de um em um
  await page.getByRole('button', { name: 'Aumentar quantidade de Filé de Frango (porção)' }).click();
  await expect(campo).toHaveValue('3.5');
  // "Limpar" deixa o campo vazio
  await campo.click();
  await teclado.getByRole('button', { name: 'Limpar', exact: true }).click();
  await expect(campo).toHaveValue('');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro, Produção: a quantidade pelo teclado grande, com a unidade do item', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/producao');
  await entrarComo(page, 'Maria');
  await page.getByLabel('O que você produziu?').selectOption('molho');
  await page.getByRole('spinbutton', { name: 'Quantidade' }).click();
  const teclado = page.getByRole('dialog', { name: /^Quantidade de Molho/ });
  await expect(teclado).toBeVisible();
  await expect(teclado.getByRole('status', { name: /Valor/ }).or(teclado.locator('output'))).toContainText('L');
  await tocarTeclas(teclado, ['5', 'OK']);
  await expect(page.getByRole('spinbutton', { name: 'Quantidade' })).toHaveValue('5');
  expect(erros, erros.join('\n')).toEqual([]);
});
