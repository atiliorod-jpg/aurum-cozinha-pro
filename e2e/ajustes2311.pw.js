import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo, continuarImprimindo, digitarSenhaAdm } from './apoio';

// =====================================================================
//  AJUSTES DE 23/11/2026 (pedido do dono)
//  • a tela Imprimir é só etiquetar — a impressora foi para Meus itens;
//  • a janela de imprimir cabe INTEIRA na tela, sem rolar (a prévia encolhe
//    o necessário) — "Como vai sair" no topo foi tentado e desfeito;
//  • Impressas saiu da barra: é a aba Impressas do Relatório de etiquetas,
//    na Administração, e sem "válida / vencida";
//  • o texto dos métodos do item, curto.
//  (os dados do estabelecimento que sumiam: utils/prefsDaConta.js e o teste
//  ajustes2311.test.js — a demonstração não fala com o servidor)
// =====================================================================

// O celular Android de verdade: Bluetooth no navegador → a janela mostra
// "Conectar impressora e imprimir" (o robô roda num Edge de computador).
function androidComBluetooth() {
  Object.defineProperty(navigator, 'userAgentData', { get: () => ({ mobile: true, brands: [], platform: 'Android' }), configurable: true });
  const ble = {
    getAvailability: async () => true, getDevices: async () => [],
    requestDevice: async () => { const e = new Error('nenhuma'); e.name = 'NotFoundError'; throw e; },
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(navigator, 'bluetooth', { get: () => ble, configurable: true });
}

// A janela de imprimir não rola: tudo à vista de uma vez. Devolve o zoom da prévia.
async function janelaSemRolar(page) {
  const janela = page.getByRole('dialog');
  await expect(janela.getByRole('figure', { name: /^Como vai sair/ })).toBeVisible();
  // o ajuste da prévia acontece no quadro seguinte ao desenho da janela
  await expect.poll(() => page.evaluate(() => {
    const fundo = document.querySelector('[role="dialog"]').parentElement;
    return fundo.scrollHeight - fundo.clientHeight;
  })).toBeLessThanOrEqual(1);
  return page.evaluate(() => parseFloat(document.querySelector('figure [style*="zoom"]')?.style.zoom || '1'));
}

test('Etiquetas: a barra tem Imprimir, Meus itens e Administração; a tela Imprimir é só etiquetar', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await expect(page.getByRole('heading', { name: 'Imprimir etiqueta', level: 1 })).toBeVisible();
  const barra = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(barra.getByRole('link')).toHaveText(['Imprimir', 'Meus itens', 'Administração']);
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
  // a lista de impressas não tem mais porta no menu de registrar
  await abrir(page, '/registrar');
  await expect(page.getByRole('link', { name: /Etiquetas impressas/ })).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Impressas: o relatório (com o Apagar) mora em Administração → Relatório de etiquetas, sem "válida / vencida"', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page);
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  const janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await continuarImprimindo(page);
  // pela barra: Administração (pede a senha) → Relatório de etiquetas → Impressas
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Administração' }).click();
  await digitarSenhaAdm(page);
  await page.getByRole('link', { name: /^Relatório de etiquetas/ }).click();
  await expect(page.getByRole('heading', { name: 'Relatório de etiquetas', level: 1 })).toBeVisible();
  // a aba Administração continua acesa dentro do relatório
  await expect(page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Administração' }))
    .toHaveClass(/text-polo-gold/);
  await page.getByRole('button', { name: 'Impressas', exact: true }).click();
  const linha = page.getByRole('listitem').filter({ hasText: 'Frango desfiado' }).first();
  await expect(linha).toBeVisible();
  await expect(linha).toContainText(/Validade \d{2}\/\d{2}/); // a data do papel continua
  await expect(page.getByRole('main')).not.toContainText(/Válida|Vencida|Consumida|Descartada/);
  await expect(linha.getByRole('button', { name: 'Reimprimir etiqueta de Frango desfiado' })).toBeVisible();
  // com a Administração aberta, o Apagar (é da conta dona)
  await expect(linha.getByRole('button', { name: 'Apagar etiqueta de Frango desfiado' })).toBeVisible();
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

// ── a janela de imprimir inteira na tela, sem rolar ─────────────────────
for (const [largura, altura, minimo] of [[360, 740, 0.75], [412, 915, 1]]) {
  test.describe(`Android ${largura}×${altura}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: largura, height: altura } });

    test('a janela de imprimir cabe inteira, sem rolar, com os botões à vista', async ({ page }) => {
      await page.addInitScript(androidComBluetooth);
      const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
      await entrarComo(page);
      await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
      const zoom = await janelaSemRolar(page);
      expect(zoom).toBeGreaterThanOrEqual(minimo);
      const janela = page.getByRole('dialog');
      await expect(janela.getByRole('button', { name: 'Conectar impressora e imprimir' })).toBeInViewport();
      await expect(janela.getByRole('button', { name: 'Fechar', exact: true }).last()).toBeInViewport();
      await expect(janela.getByText(/^Validade:/)).toBeInViewport();
      expect(erros, erros.join('\n')).toEqual([]);
    });
  });
}

test('computador: a janela de imprimir também cabe sem rolar', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page);
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  expect(await janelaSemRolar(page)).toBeGreaterThanOrEqual(0.75);
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Imprimir \d+ etiqueta/ })).toBeInViewport();
  expect(erros, erros.join('\n')).toEqual([]);
});
