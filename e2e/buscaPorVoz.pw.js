import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo } from './apoio';

// =====================================================================
//  BUSCA POR VOZ (04/11/2026) — o robô não tem microfone: um reconhecimento
//  de fala de mentira devolve a frase combinada (window.__fala) quando o app
//  liga o microfone, do mesmo jeito que o navegador devolve.
// =====================================================================

test.use({ viewport: { width: 390, height: 844 } });

async function comVozDeMentira(page) {
  await page.addInitScript(() => {
    class ReconhecimentoDeMentira {
      start() {
        const fala = window.__fala || {};
        setTimeout(() => {
          if (fala.erro) { this.onerror?.({ error: fala.erro }); this.onend?.(); return; }
          // `partes`: a frase com pausa — o navegador fecha cada parte à parte
          const partes = fala.partes || [fala.textos || []];
          const results = partes.map(versoes => Object.assign(versoes.map(t => ({ transcript: t })), { isFinal: true }));
          this.onresult?.({ results });
          this.onend?.();
        }, 30);
      }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    window.SpeechRecognition = ReconhecimentoDeMentira;
  });
}
const falar = (page, fala) => page.evaluate((f) => { window.__fala = f; }, fala);

test('Etiquetas: "três etiquetas de frango desfiada" abre a impressão do frango com 3', async ({ page }) => {
  await comVozDeMentira(page);
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  // o reconhecimento errou o gênero: ainda assim acha o item
  await falar(page, { textos: ['três etiquetas de frango desfiada'] });
  await page.getByRole('button', { name: 'Buscar falando' }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.locator('.etiqueta-label').first()).toContainText('Frango desfiado');
  await expect(janela.getByLabel('Quantidade de etiquetas de Frango desfiado')).toHaveValue('3');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: o que não existe é dito, e o erro de rede pede para digitar', async ({ page }) => {
  await comVozDeMentira(page);
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  await falar(page, { textos: ['lasanha bolonhesa'] });
  await page.getByRole('button', { name: 'Buscar falando' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Não achei "lasanha bolonhesa"' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await falar(page, { erro: 'network' });
  await page.getByRole('button', { name: 'Buscar falando' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'precisa de internet' })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro: com dois itens parecidos a lista filtra, e a quantidade falada vai para o escolhido', async ({ page }) => {
  await comVozDeMentira(page);
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/etiquetas');
  await entrarComo(page, 'Maria');
  await falar(page, { textos: ['três etiquetas de filé'] });
  await page.getByRole('button', { name: 'Buscar falando' }).click();
  // a busca mostra o que foi falado, com acento
  await expect(page.getByLabel('Buscar produto')).toHaveValue('filé');
  await expect(page.getByRole('status').filter({ hasText: /\d+ itens com "filé"/ })).toBeVisible();
  await page.getByRole('button', { name: 'Imprimir etiqueta de Filé de Frango (porção)' }).click();
  await expect(page.getByRole('dialog').getByLabel('Quantidade de etiquetas de Filé de Frango (porção)')).toHaveValue('3');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('navegador sem reconhecimento de fala: o microfone não aparece', async ({ page }) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
  });
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  await expect(page.getByLabel('Buscar produto')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buscar falando' })).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

// ── o minuto sem uso só na tela Imprimir (decisão do dono, 04/11/2026) ──
test('Pro: o nome não expira nos lançamentos; tocar em Imprimir depois de 1 minuto parado volta para os nomes', async ({ page }) => {
  await page.clock.install();
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/entradas');
  await page.getByRole('spinbutton', { name: 'Quantidade de Filé de Frango (porção)' }).fill('1');
  await page.getByRole('button', { name: 'Maria', exact: true }).click();
  await expect(page.getByText('Registrando como Maria')).toBeVisible();
  await page.clock.fastForward('02:00');
  await expect(page.getByText('Registrando como Maria')).toBeVisible();
  // o aparelho ficou parado: quem toca em Imprimir escolhe o nome
  await page.getByRole('link', { name: 'Imprimir' }).last().click();
  await expect(page.getByRole('heading', { name: 'Quem vai imprimir?' })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro: quem está mexendo nos lançamentos chega na tela Imprimir com o próprio nome', async ({ page }) => {
  await page.clock.install();
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/entradas');
  await page.getByRole('spinbutton', { name: 'Quantidade de Filé de Frango (porção)' }).fill('1');
  await page.getByRole('button', { name: 'Maria', exact: true }).click();
  await page.clock.fastForward('00:40');
  await page.getByLabel('Buscar produto').click();
  await page.clock.fastForward('00:40');
  await page.getByRole('link', { name: 'Imprimir' }).last().click();
  await expect(page.getByText('Imprimindo como Maria')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

// ── o método pela voz (05/11/2026) ──
test('Etiquetas: "frango desfiado congelado" abre a impressão já em Congelado', async ({ page }) => {
  await comVozDeMentira(page);
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  await falar(page, { textos: ['frango desfiado congelado'] });
  await page.getByRole('button', { name: 'Buscar falando' }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.getByLabel(/^Método de conservação/)).toHaveValue('m:congelado');
  await expect(janela.locator('.etiqueta-label').first()).toContainText('CONGELADO');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: método que o item não tem não abre a janela, e a tela mostra os dele', async ({ page }) => {
  await comVozDeMentira(page);
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  // o queijo só tem refrigerado
  await falar(page, { textos: ['duas etiquetas de queijo mussarela congelado'] });
  await page.getByRole('button', { name: 'Buscar falando' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Queijo mussarela não tem Congelado cadastrado' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refrigerado · 3 dias' }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.locator('.etiqueta-label').first()).toContainText('Queijo mussarela');
  await expect(janela.locator('.etiqueta-label').first()).toContainText('REFRIGERADO');
  // a quantidade falada vai junto
  await expect(janela.getByLabel('Quantidade de etiquetas de Queijo mussarela')).toHaveValue('2');
  expect(erros, erros.join('\n')).toEqual([]);
});

// ── 05/11/2026, no celular do dono: quantidade e método juntos ──
test('Etiquetas: quantidade e método em qualquer ordem, mesmo com pausa no meio', async ({ page }) => {
  await comVozDeMentira(page);
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  // "frango desfiado, três etiquetas… congelado" — a pausa fecha a primeira parte
  await falar(page, { partes: [['frango desfiado, três etiquetas'], ['congelado']] });
  await page.getByRole('button', { name: 'Buscar falando' }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.getByLabel(/^Método de conservação/)).toHaveValue('m:congelado');
  await expect(janela.getByLabel('Quantidade de etiquetas de Frango desfiado')).toHaveValue('3');
  // ao fechar, fica escrito o que foi ouvido
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status').filter({ hasText: 'Ouvi: "frango desfiado, três etiquetas congelado"' })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: a frase repetida pelo Chrome do Android ainda acha o item', async ({ page }) => {
  await comVozDeMentira(page);
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  await falar(page, { textos: ['frango desfiadofrango desfiadofrango desfiado'] });
  await page.getByRole('button', { name: 'Buscar falando' }).click();
  await expect(page.getByRole('dialog').locator('.etiqueta-label').first()).toContainText('Frango desfiado');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status').filter({ hasText: 'Ouvi: "frango desfiado".' })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

