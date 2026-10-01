import { test, expect } from '@playwright/test';

// =====================================================================
//  2ª ETAPA, LOTE A (01/10/2026) — na demonstração do Cozinha Pro:
//  imprimir dá entrada no estoque → a saída manual para a Finalização leva a
//  validade → a Finalização mostra o lote em Validades.
// =====================================================================

const ruidoDeRede = /Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|supabase/i;

async function entrarNoPro(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push(`erro de JavaScript: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !ruidoDeRede.test(m.text())) erros.push(`console: ${m.text()}`);
  });
  await page.addInitScript(() => { window.open = () => null; window.print = () => {}; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver demonstração' }).click();
  await page.getByPlaceholder('Seu nome').fill('Robô de teste');
  await page.getByPlaceholder('WhatsApp com DDD').fill('81999999999');
  await page.getByRole('button', { name: /Aurum Cozinha Pro/ }).click();
  const escolha = page.getByRole('heading', { name: 'Onde você vai trabalhar?' });
  if (await escolha.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('button', { name: /^Cozinha de Produção/ }).click();
  }
  await expect(page.locator('main')).toBeVisible();
  return erros;
}

// a sessão da demonstração vive na memória: navega pelo histórico, sem recarregar
async function abrir(page, rota) {
  await page.evaluate((r) => { window.history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate')); }, rota);
  await expect(page.locator('main')).not.toBeEmpty({ timeout: 15_000 });
}

const FRANGO = 'Filé de Frango (porção)';

async function estoqueDoFrango(page) {
  await abrir(page, '/saidas');
  const linha = page.locator('main div').filter({ hasText: FRANGO }).filter({ hasText: 'Em estoque:' }).last();
  const texto = await linha.innerText();
  return Number((texto.match(/Em estoque:\s*([\d.,]+)/) || [])[1]?.replace(',', '.'));
}

test('Cozinha Pro: imprimir dá entrada e a validade chega à Finalização', async ({ page }) => {
  const erros = await entrarNoPro(page);
  const antes = await estoqueDoFrango(page);
  expect(antes).toBeGreaterThan(0);

  // 1) imprime UMA etiqueta de "4 un" pela tela Etiquetas: a janela oferece a entrada
  await abrir(page, '/etiquetas');
  await page.getByRole('button', { name: `Imprimir etiqueta de ${FRANGO}` }).click();
  const janela = page.getByRole('dialog');
  await janela.getByLabel(/Medida/).first().fill('4 un');
  await expect(janela.getByText('Dar entrada no estoque')).toBeVisible();
  await expect(janela).toContainText('4 unid');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(/Entrada lançada: 4 unid de Filé de Frango/)).toBeVisible();

  // 2) o estoque subiu 4
  expect(await estoqueDoFrango(page)).toBe(antes + 4);

  // 3) saída manual de 3 para a Finalização: o resumo diz de qual validade sai
  await page.getByRole('button', { name: 'Cozinha de Finalização', exact: true }).click();
  await page.getByRole('spinbutton', { name: `Quantidade de ${FRANGO}` }).fill('3');
  await expect(page.locator('main')).toContainText(/3 vence \d{2}\/\d{2}\/\d{4}/);
  await page.getByRole('button', { name: 'Registrar Saída' }).click();
  await expect(page.getByText(/Saída de 1 item\(ns\) registrada/)).toBeVisible();

  // 4) na Finalização, a validade chegou: aparece o lote em Validades
  await page.getByRole('button', { name: /Tocar para ir a outra área/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Cozinha de Finalização/ }).click();
  await abrir(page, '/validades');
  await page.getByRole('button', { name: 'Até 30 dias' }).click();
  await expect(page.locator('main')).toContainText(FRANGO);
  await expect(page.locator('main')).toContainText('Empanado de Filé');

  expect(erros, erros.join('\n')).toEqual([]);
});
