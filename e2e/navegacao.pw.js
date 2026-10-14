import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir } from './apoio';

// =====================================================================
//  NAVEGAÇÃO (Lote 3 da auditoria, 14/10/2026): "Imprimir" na barra de baixo
//  do Pro, o nome da cozinha escrito no cabeçalho e a conta num menu (tocar no
//  próprio nome não sai mais da conta).
// =====================================================================

test.use({ viewport: { width: 375, height: 812 } });

test('Pro: Imprimir na barra, cozinha escrita no cabeçalho e conta num menu', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  const barra = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(barra.getByRole('link')).toHaveText([/^Início/, 'Imprimir', 'Registrar', 'Validades']);
  await expect(page.locator('header')).toContainText('Cozinha de Produção');

  await barra.getByRole('link', { name: 'Imprimir' }).click();
  await expect(page.getByRole('heading', { name: 'Imprimir etiqueta' })).toBeVisible();

  // o nome abre a conta; sair é dentro do menu
  await page.getByRole('button', { name: /^Conta de/ }).click();
  const conta = page.getByRole('dialog', { name: 'Sua conta' });
  await expect(conta).toContainText('Diretoria');
  await expect(conta.getByRole('button', { name: 'Sair da conta' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Finalização: a barra tem Fechar turno, e o cabeçalho diz que é a Finalização', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro', /^Cozinha de Finalização/);
  const barra = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(barra.getByRole('link')).toHaveText([/^Início/, 'Imprimir', 'Registrar', 'Fechar turno', 'Validades']);
  await expect(page.locator('header')).toContainText('Cozinha de Finalização');
  await abrir(page, '/administracao');
  await expect(page.locator('header')).toContainText('Administração');
  expect(erros, erros.join('\n')).toEqual([]);
});
