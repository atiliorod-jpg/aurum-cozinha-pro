import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo, continuarImprimindo } from './apoio';

// =====================================================================
//  AJUSTES DE 23/11/2026 (pedido do dono)
//  • a tela Imprimir é só etiquetar — a impressora foi para Meus itens;
//  • "Como vai sair" à vista na janela de imprimir, sem rolar, no celular;
//  • Impressas sem "válida / vencida";
//  • o texto dos métodos do item, curto.
//  (os dados do estabelecimento que sumiam: utils/prefsDaConta.js e o teste
//  ajustes2311.test.js — a demonstração não fala com o servidor)
// =====================================================================

test('Etiquetas: a tela Imprimir é só etiquetar; a impressora está em Meus itens', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await expect(page.getByRole('heading', { name: 'Imprimir etiqueta', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Etiquetar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Impressora', exact: true })).toHaveCount(0);
  await abrir(page, '/itens');
  await page.getByRole('button', { name: 'Impressora', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Impressora', pressed: true })).toBeVisible();
  await expect(page.getByText('Sua impressora', { exact: true })).toBeVisible();
  // a busca de itens não aparece na aba da impressora
  await expect(page.getByLabel('Buscar item')).toHaveCount(0);
  // a etiqueta de teste continua saindo daqui
  await page.getByRole('button', { name: 'Imprimir etiqueta de teste' }).click();
  await expect(page.getByRole('dialog').getByText(/Etiqueta de teste: serve para conferir o rolo/)).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro: a tela Imprimir também é só etiquetar, e a impressora está em Meus itens', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/etiquetas');
  await expect(page.getByRole('heading', { name: 'Imprimir etiqueta', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Impressora', exact: true })).toHaveCount(0);
  await abrir(page, '/administracao/etiqueta');
  await expect(page.getByRole('link', { name: /Impressora e rolo/ })).toHaveCount(0);
  await abrir(page, '/itens');
  await page.getByRole('button', { name: 'Impressora', exact: true }).click();
  await expect(page.getByText('Sua impressora', { exact: true })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Impressas: a lista diz o que saiu no rolo, sem "válida / vencida"', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page);
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  const janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await continuarImprimindo(page);
  await abrir(page, '/impressas');
  const linha = page.getByRole('listitem').filter({ hasText: 'Frango desfiado' }).first();
  await expect(linha).toBeVisible();
  await expect(linha).toContainText(/Validade \d{2}\/\d{2}/); // a data do papel continua
  await expect(page.getByRole('main')).not.toContainText(/Válida|Vencida|Consumida|Descartada/);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Meus itens: o texto dos métodos é curto', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/itens');
  await page.getByRole('button', { name: /^Frango desfiado/ }).click();
  const ficha = page.getByRole('dialog');
  await expect(ficha.getByText(/^Quanto dura depois de (manipulado|aberto)\?$/)).toBeVisible();
  await expect(ficha.getByText(/O principal já vem escolhido na hora de imprimir/)).toBeVisible();
  await expect(ficha.getByText(/como fica guardado e quanto dura/)).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test.describe('no celular', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

  test('a janela de imprimir mostra "Como vai sair" inteira, sem rolar e sem nada por cima', async ({ page }) => {
    const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
    await entrarComo(page);
    await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
    const previa = page.getByRole('dialog').getByRole('figure', { name: /^Como vai sair/ });
    await expect(previa).toBeVisible();
    // ⚠️ o rodapé fixo da janela (botões) cobria a prévia: confere que as
    // bordas de cima e de baixo dela são dela mesma, dentro da tela
    const aVista = await previa.evaluate((fig) => {
      const r = fig.getBoundingClientRect();
      const x = r.left + r.width / 2;
      return r.top >= 0 && r.bottom <= window.innerHeight
        && [r.top + 4, r.bottom - 4].every(y => fig.contains(document.elementFromPoint(x, y)));
    });
    expect(aVista).toBe(true);
    expect(erros, erros.join('\n')).toEqual([]);
  });
});
