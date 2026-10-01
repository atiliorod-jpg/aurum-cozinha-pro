import { test, expect } from '@playwright/test';

// =====================================================================
//  2ª ETAPA, LOTE B (M61, 01/10/2026) — na demonstração do Cozinha Pro:
//  a embalagem que a Produção mandou pelo QR é da Finalização (perda lá
//  desconta de lá), e com a conferência ligada a Finalização RECEBE pelo QR
//  o que a Produção não lançou, e confere o que ela mandou.
// =====================================================================

const ruidoDeRede = /Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|supabase/i;
const FRANGO = 'Filé de Frango (porção)';

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

async function abrir(page, rota) {
  await page.evaluate((r) => { window.history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate')); }, rota);
  await expect(page.locator('main')).not.toBeEmpty({ timeout: 15_000 });
}

async function irPara(page, cozinha) {
  await page.getByRole('button', { name: /Tocar para ir a outra área/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${cozinha}`) }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// imprime N etiquetas (uma linha, um código) e devolve o código impresso
async function imprimirFrango(page, copias = 1) {
  await abrir(page, '/etiquetas');
  await page.getByRole('button', { name: `Imprimir etiqueta de ${FRANGO}` }).click();
  const janela = page.getByRole('dialog');
  await janela.getByLabel(/Medida/).first().fill('1 un');
  for (let i = 1; i < copias; i++) await janela.getByRole('button', { name: /^Mais etiquetas de/ }).click();
  const codigo = (await janela.locator('.etiqueta-label').first().innerText()).match(/[A-Z0-9]{4}-[A-Z0-9]{4}/)[0];
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return codigo;
}

async function lerCodigo(page, codigo) {
  await abrir(page, '/ler');
  const fechar = page.getByRole('button', { name: 'Fechar' });
  if (await fechar.isVisible({ timeout: 1_500 }).catch(() => false)) await fechar.click();
  await page.getByLabel('Código da etiqueta').fill(codigo);
  await page.getByRole('button', { name: 'Buscar' }).click();
}

test('Cozinha Pro: a embalagem mandada pelo QR é da Finalização; perda lá desconta de lá', async ({ page }) => {
  const erros = await entrarNoPro(page);
  const codigo = await imprimirFrango(page);

  // a Produção manda pelo QR para a Finalização
  await lerCodigo(page, codigo);
  let folha = page.getByRole('dialog', { name: 'Dar baixa' });
  await folha.getByRole('button', { name: 'Cozinha de Finalização' }).click();
  await folha.getByRole('button', { name: /^Dar saída/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // na Finalização a embalagem aparece em Validades, "veio da Produção"
  await irPara(page, 'Cozinha de Finalização');
  await abrir(page, '/validades');
  await page.getByRole('button', { name: 'Até 30 dias' }).click();
  await page.getByRole('button', { name: /^Etiquetas \(/ }).click();
  await expect(page.locator('main')).toContainText('veio da Produção');

  // lida aqui: Perda e Usado DAQUI (antes: "abra a Produção")
  await lerCodigo(page, codigo);
  folha = page.getByRole('dialog', { name: 'Dar baixa' });
  await expect(folha).toContainText('veio da Produção');
  await expect(folha).not.toContainText('Abrir');
  await folha.getByRole('radio', { name: 'Perda' }).click();
  await folha.getByRole('button', { name: /^Registrar perda/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await abrir(page, '/historico');
  await expect(page.locator('main')).toContainText(/Filé de Frango.*baixa/);

  expect(erros, erros.join('\n')).toEqual([]);
});

test('Cozinha Pro: com a conferência ligada, a Finalização recebe pelo QR e confere o que veio', async ({ page }) => {
  const erros = await entrarNoPro(page);

  // a diretoria liga a conferência da Finalização
  await abrir(page, '/estoques');
  await page.getByRole('checkbox', { name: /Conferir pelo QR o que chega da Produção/ }).check();

  const naoLancado = await imprimirFrango(page);
  const mandado = await imprimirFrango(page);
  // a Produção manda só o segundo, pelo QR
  await lerCodigo(page, mandado);
  const folhaP = page.getByRole('dialog', { name: 'Dar baixa' });
  await folhaP.getByRole('button', { name: 'Cozinha de Finalização' }).click();
  await folhaP.getByRole('button', { name: /^Dar saída/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await irPara(page, 'Cozinha de Finalização');

  // o que a Produção mandou aparece "a conferir" no topo do Fechar Turno
  await abrir(page, '/fechar-turno');
  await expect(page.getByRole('region', { name: 'Antes de contar: a conferir' })).toContainText('Filé de Frango');

  // a embalagem que a Produção NÃO lançou: receber dá entrada
  await lerCodigo(page, naoLancado);
  const folha = page.getByRole('dialog', { name: 'Dar baixa' });
  await expect(folha).toContainText('A Produção ainda não deu saída desta embalagem');
  await folha.getByRole('button', { name: /^Receber aqui/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Baixas desta leitura' })).toContainText('Recebida (entrada)');

  // a mandada pelo QR: no modo "Receber", ler confere
  await page.getByRole('radio', { name: 'Receber' }).click();
  await page.getByLabel('Código da etiqueta').fill(mandado);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('region', { name: 'Baixas desta leitura' })).toContainText('Chegada conferida');
  await expect(page.getByRole('region', { name: 'A conferir' })).toHaveCount(0);

  // a entrada dada aqui aparece como recebimento da Finalização
  await abrir(page, '/historico');
  await expect(page.locator('main')).toContainText(/recebido da produção: 1 Filé de Frango/);

  expect(erros, erros.join('\n')).toEqual([]);
});
