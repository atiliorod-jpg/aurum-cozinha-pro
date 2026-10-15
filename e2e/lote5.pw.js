import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo } from './apoio';

// =====================================================================
//  LOTE 5 DA AUDITORIA (14/10/2026) — todo lançamento com a mesma forma:
//  data e quem no topo, itens no meio, e no pé (fixo) o resumo e o botão.
// =====================================================================

test('Cozinha Pro: o pé da Entrada diz o que vai ser gravado antes do toque', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/entradas');
  await entrarComo(page, 'Maria');
  await page.getByRole('button', { name: 'Aumentar quantidade de Filé de Frango (porção)' }).click();
  await page.getByRole('button', { name: 'Aumentar quantidade de Filé de Frango (porção)' }).click();
  await page.getByRole('spinbutton', { name: 'Quantidade de Picanha (porção)' }).fill('3');
  await expect(page.getByText('2 itens · 5 unid → Congelado')).toBeVisible();
  // o botão fica no pé, visível sem rolar a lista
  await expect(page.getByRole('button', { name: 'Registrar Entrada' })).toBeInViewport();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Finalização: fechar o turno sem contar nada pede confirmação', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro', /^Cozinha de Finalização/);
  await abrir(page, '/fechar-turno');
  await entrarComo(page, 'Maria');
  await expect(page.getByText(/^Sobra contada em 0 de \d+ itens · consumo /)).toBeVisible();
  await page.getByRole('button', { name: 'Fechar turno', exact: true }).click();
  const aviso = page.getByRole('dialog');
  await expect(aviso.getByText('Nenhuma sobra contada')).toBeVisible();
  await aviso.getByRole('button', { name: 'Cancelar' }).click();
  // nada foi fechado
  await expect(page.getByText(/Turno (Almoço|Jantar) fechado/)).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Cozinha Pro: apara e perda sem códigos — o destino e o motivo por extenso', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/aparas');
  await entrarComo(page, 'Maria');
  await expect(page.getByText('Para onde vai a apara')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Strogonoff', exact: true })).toBeVisible();
  await expect(page.getByText(/STG —/)).toHaveCount(0);
  await page.getByLabel('Descrição da apara').fill('Ponta de picanha');
  await page.getByLabel('Quantidade').fill('0.3');
  await expect(page.getByText('Apara · Ponta de picanha · 0,3 kg → Strogonoff')).toBeVisible();

  await page.getByRole('button', { name: /^Perda/ }).click();
  await expect(page.getByRole('button', { name: 'Vencimento', exact: true })).toBeVisible();
  await expect(page.getByText(/V — Vencimento/)).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});
