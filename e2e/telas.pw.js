import { test, expect } from '@playwright/test';

// =====================================================================
//  O robô entra na DEMONSTRAÇÃO (nada vai ao banco) e abre cada tela dos dois
//  planos. Reprova se: a tela mostra "Esta tela travou" (a barreira de erro),
//  o navegador acusa erro de JavaScript, ou a tela abre vazia.
//
//  ⚠️ A sessão da demonstração vive SÓ NA MEMÓRIA — recarregar a página a
//  perderia. Por isso a navegação é pelo histórico do navegador (o mesmo que
//  um toque num link faz), nunca por `page.goto` depois de entrar.
// =====================================================================

// As rotas de cada ramo do App.jsx. Se nascer tela nova, ela entra aqui.
const TELAS_ETIQUETAS = [
  '/', '/etiquetas', '/itens', '/impressas', '/relatorio-etiquetas', '/ajustes', '/pagamento', '/novidades',
];
const TELAS_PRO = [
  '/', '/registrar', '/historico', '/compras', '/entradas', '/saidas', '/producao', '/aparas',
  '/etiquetas', '/validades', '/fechar-turno', '/itens', '/desperdicio', '/fichas', '/inventario',
  '/relatorio', '/relatorio-etiquetas', '/impressas', '/auditoria', '/administracao', '/financeiro',
  '/estoques', '/balanco', '/pagamento', '/configuracoes', '/novidades',
];

// Rede que falha no ambiente de teste não é defeito do app (a demonstração
// nem fala com o banco); erro de JavaScript é.
const ruidoDeRede = /Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|supabase/i;

async function entrarNaDemo(page, plano) {
  const erros = [];
  page.on('pageerror', (e) => erros.push(`erro de JavaScript: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !ruidoDeRede.test(m.text())) erros.push(`console: ${m.text()}`);
  });
  // a demonstração abre o WhatsApp da Aurum para avisar do visitante — no
  // robô, não; e a janela de impressão do navegador travaria o teste
  await page.addInitScript(() => { window.open = () => null; window.print = () => {}; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver demonstração' }).click();
  await page.getByPlaceholder('Seu nome').fill('Robô de teste');
  await page.getByPlaceholder('WhatsApp com DDD').fill('81999999999');
  await page.getByRole('button', { name: new RegExp(plano) }).click();
  // o Pro pergunta primeiro onde o aparelho vai trabalhar
  const escolha = page.getByRole('heading', { name: 'Onde você vai trabalhar?' });
  if (await escolha.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('button', { name: /^Cozinha de Produção/ }).click();
  }
  await expect(page.locator('main')).toBeVisible();
  return erros;
}

async function abrirTela(page, rota) {
  await page.evaluate((r) => {
    window.history.pushState({}, '', r);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, rota);
  // telas carregadas sob demanda: espera o conteúdo aparecer
  await expect(page.locator('main')).not.toBeEmpty({ timeout: 15_000 });
  await expect(page.getByText('Esta tela travou')).toHaveCount(0);
}

test('plano Etiquetas: todas as telas abrem sem travar', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await expect(page.getByRole('button', { name: 'Etiquetar' })).toBeVisible();
  for (const rota of TELAS_ETIQUETAS) {
    await test.step(rota, () => abrirTela(page, rota));
  }
  expect(erros, erros.join('\n')).toEqual([]);
});

test('plano Etiquetas: imprimir pelo computador e ver na aba Impressas', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  const janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  // o computador pergunta se saiu no papel; "Sim" conta e fecha
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await abrirTela(page, '/impressas');
  await expect(page.getByText('Frango desfiado').first()).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('plano Etiquetas: a busca acha sem acento', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await page.getByLabel('Buscar produto').fill('porcao');
  await expect(page.getByText('Picanha (porção)')).toBeVisible();
  await expect(page.getByText('Frango desfiado')).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('plano Pro: todas as telas abrem sem travar', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  for (const rota of TELAS_PRO) {
    await test.step(rota, () => abrirTela(page, rota));
  }
  expect(erros, erros.join('\n')).toEqual([]);
});
