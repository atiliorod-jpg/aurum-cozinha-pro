import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir } from './apoio';

// =====================================================================
//  LOTE 6 DA AUDITORIA (15/10/2026) — o Início diz o que fazer agora, em
//  cada cozinha; o estoque completo é a tela Estoque.
// =====================================================================

test('Produção: o Início mostra o urgente e leva ao Estoque, que filtra pela situação', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { name: 'Produzir hoje' })).toBeVisible();
  await expect(main).toContainText('Usar primeiro: lotes vencendo');
  // a lista de itens não está mais no Início
  await expect(main.getByText('Batata Palito Congelada')).toHaveCount(0);
  await main.getByRole('link', { name: /^Estoque completo/ }).click();
  await expect(page.getByRole('heading', { name: 'Estoque', level: 1 })).toBeVisible();
  await expect(main.getByText('Batata Palito Congelada')).toBeVisible();
  // os números do topo filtram
  await main.getByRole('button', { name: /Abaixo do mínimo/ }).click();
  await expect(main.getByRole('button', { name: /Abaixo do mínimo/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(main.getByText('Batata Palito Congelada')).toHaveCount(0);
  await main.getByRole('button', { name: 'Mostrar todos os itens' }).click();
  await expect(main.getByText('Batata Palito Congelada')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Finalização: sem os alarmes de mínimo da Produção, e com o fechar turno à mão (D5)', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro', /^Cozinha de Finalização/);
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: /^Fechar o turno/ })).toBeVisible();
  await expect(main).not.toContainText('Abaixo do mínimo');
  // a bolinha vermelha do Início ficava acesa para sempre
  await expect(page.getByRole('navigation').getByLabel(/abaixo do mínimo/)).toHaveCount(0);
  await abrir(page, '/estoque');
  await expect(main.getByText('Empanado de Filé (porção)')).toBeVisible();
  await expect(main).not.toContainText(/Abaixo do mínimo|Mín:/);
  // o que nunca chegou à bancada fica escondido até pedir
  await expect(main.getByText('Batata Palito Congelada')).toHaveCount(0);
  await main.getByRole('button', { name: /^Mostrar também \d+ itens sem saldo/ }).click();
  await expect(main.getByText('Batata Palito Congelada')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Produção: a calculadora mora na tela de Produção', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await expect(page.locator('main').getByText('Calculadora de produção')).toHaveCount(0);
  await abrir(page, '/producao');
  await expect(page.locator('main').getByText('Calculadora de produção')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});
