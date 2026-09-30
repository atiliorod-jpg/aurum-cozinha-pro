import { test, expect } from '@playwright/test';

// =====================================================================
//  BAIXA PELA ETIQUETA (M59, 30/09/2026) — o caminho inteiro, na
//  demonstração do Cozinha Pro (nada vai ao banco):
//  imprime com QR → acha o código → dá saída pelo código digitado →
//  desfaz → dá de novo → a mesma embalagem não sai duas vezes.
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

async function codigosNaValidade(page) {
  await abrir(page, '/validades');
  await page.getByRole('button', { name: 'Até 30 dias' }).click();
  await page.getByRole('button', { name: /^Etiquetas \(/ }).click();
  const texto = await page.locator('main').innerText();
  return [...texto.matchAll(/código ([A-Z0-9]{4}-[A-Z0-9]{4})/g)].map(m => m[1]);
}

async function lerCodigo(page, codigo) {
  await abrir(page, '/ler');
  // no robô não há câmera: fecha o leitor e digita
  const fechar = page.getByRole('button', { name: 'Fechar' });
  if (await fechar.isVisible({ timeout: 1_500 }).catch(() => false)) await fechar.click();
  await page.getByLabel('Código da etiqueta').fill(codigo);
  await page.getByRole('button', { name: 'Buscar' }).click();
}

test('Cozinha Pro: etiqueta com QR, saída pelo código, desfazer e sem baixa dupla', async ({ page }) => {
  const erros = await entrarNoPro(page);

  // 1) imprime 2 etiquetas do mesmo item, com medida (a saída sabe quanto sai)
  await abrir(page, '/etiquetas');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Filé de Frango (porção)' }).click();
  const janela = page.getByRole('dialog');
  await janela.getByLabel(/Medida/).first().fill('1 kg');
  await janela.getByRole('button', { name: /^Mais etiquetas de/ }).click();
  // a etiqueta do Pro sai com o código escrito embaixo do QR
  await expect(janela.locator('.etiqueta-label').first()).toContainText(/[A-Z0-9]{4}-[A-Z0-9]{4}/);
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const antes = await codigosNaValidade(page);
  expect(antes.length).toBeGreaterThanOrEqual(2);
  const codigo = antes[0];

  // 2) lê pelo código: a folha abre e a saída vai para a Finalização
  await lerCodigo(page, codigo);
  const folha = page.getByRole('dialog', { name: 'Dar baixa' });
  await expect(folha).toContainText(codigo);
  await expect(folha.getByRole('radio', { name: 'Saída' })).toBeVisible();
  // o item é contado em unidades: cada embalagem vale 1
  await expect(folha).toContainText('Sai do estoque: 1 unid');
  await folha.getByRole('button', { name: /^Dar saída/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Baixas desta leitura' })).toContainText('Filé de Frango');

  // 3) desfazer devolve a embalagem
  await page.getByRole('button', { name: 'Desfazer' }).first().click();
  expect(await codigosNaValidade(page)).toContain(codigo);

  // 4) dá de novo, e a mesma embalagem não sai duas vezes
  await lerCodigo(page, codigo);
  await page.getByRole('dialog', { name: 'Dar baixa' }).getByRole('button', { name: /^Dar saída/ }).click();
  expect(await codigosNaValidade(page)).not.toContain(codigo);
  await lerCodigo(page, codigo);
  await expect(page.getByRole('dialog', { name: 'Dar baixa' })).toContainText('já saiu');

  // 5) a saída entrou no estoque com a validade da embalagem
  await abrir(page, '/saidas');
  await page.getByRole('button', { name: /Histórico/ }).click();
  await expect(page.locator('main')).toContainText('Filé de Frango');

  expect(erros, erros.join('\n')).toEqual([]);
});

test('Cozinha Pro: código que não é do Aurum não abre nada', async ({ page }) => {
  const erros = await entrarNoPro(page);
  await lerCodigo(page, 'https://exemplo.com');
  await expect(page.getByText('Esse código não é de uma etiqueta do Aurum.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});
