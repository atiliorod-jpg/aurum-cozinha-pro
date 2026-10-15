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
  '/', '/etiquetas', '/itens', '/impressas', '/relatorio-etiquetas', '/pagamento', '/novidades',
  // a Administração em grupos (Lote 4); /ajustes é o endereço antigo
  '/administracao', '/administracao/casa', '/administracao/etiqueta', '/administracao/equipe',
  '/administracao/conta', '/ajustes',
];
const TELAS_PRO = [
  '/', '/estoque', '/registrar', '/historico', '/compras', '/entradas', '/saidas', '/producao', '/aparas',
  '/etiquetas', '/validades', '/fechar-turno', '/itens', '/desperdicio', '/fichas', '/inventario',
  '/relatorio', '/relatorio-etiquetas', '/impressas', '/auditoria', '/administracao', '/financeiro',
  '/estoques', '/balanco', '/pagamento', '/novidades',
  '/administracao/casa', '/administracao/etiqueta', '/administracao/equipe', '/administracao/estoque',
  '/administracao/conta', '/configuracoes', '/configuracoes?secao=acessos',
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

// ⚠️ "QUEM VAI IMPRIMIR?" (13/10/2026): com a equipe cadastrada, a tela de
// Etiquetas começa pelos nomes. Na demonstração, Maria entra sem senha.
async function entrarComo(page, nome = 'Maria') {
  await expect(page.getByRole('heading', { name: 'Quem vai imprimir?' })).toBeVisible();
  await page.getByRole('button', { name: nome, exact: true }).click();
  await expect(page.getByText(`Imprimindo como ${nome}`)).toBeVisible();
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
  await entrarComo(page);
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  const janela = page.getByRole('dialog');
  // a etiqueta sai assinada por quem entrou pelo nome
  await expect(janela.getByText('Assina: Maria')).toBeVisible();
  // ⚠️ o plano Etiquetas não tem estoque nem leitor de QR (achado do dono,
  // 14/10/2026): nem "Dar entrada no estoque", nem o código embaixo do QR
  await expect(janela.locator('.etiqueta-label').first()).toContainText('Frango desfiado');
  await expect(janela.getByText('Dar entrada no estoque')).toHaveCount(0);
  await expect(janela.locator('.etiqueta-label').first()).not.toContainText(/[A-Z0-9]{4}-[A-Z0-9]{4}/);
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
  await entrarComo(page);
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

// ⚠️ O ETIQUETAS É UM RECORTE DO PRO (regra do dono): quem assina o Pro tem de
// imprimir, achar sem acento e ver na aba Impressas exatamente como no
// Etiquetas — o mesmo caminho, agora pela Cozinha de Produção do Pro.
test('plano Pro: imprimir, buscar sem acento e ver na aba Impressas, como no Etiquetas', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrirTela(page, '/etiquetas');
  await entrarComo(page);
  await page.getByLabel('Buscar produto').fill('porcao');
  await expect(page.getByText('Picanha (porção)').first()).toBeVisible();
  await page.getByLabel('Buscar produto').fill('');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Molho de Tomate da Casa' }).click();
  const janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await abrirTela(page, '/impressas');
  await expect(page.getByText('Molho de Tomate da Casa').first()).toBeVisible();
  await abrirTela(page, '/validades');
  expect(erros, erros.join('\n')).toEqual([]);
});

// Estoque Seco (28/09/2026): o pacote ABERTO ganha etiqueta de abertura, com
// temperatura ambiente como padrão — a única coisa do Etiquetas que o Pro
// ainda não fazia.
test('plano Pro, Estoque Seco: etiqueta de abertura, ambiente como padrão, e vai para Impressas', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(`erro de JavaScript: ${e.message}`));
  await page.addInitScript(() => { window.open = () => null; window.print = () => {}; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver demonstração' }).click();
  await page.getByPlaceholder('Seu nome').fill('Robô de teste');
  await page.getByPlaceholder('WhatsApp com DDD').fill('81999999999');
  await page.getByRole('button', { name: /Aurum Cozinha Pro/ }).click();
  await page.getByRole('button', { name: /^Estoque Seco/ }).click();
  await abrirTela(page, '/etiquetas');
  await entrarComo(page);
  await page.getByRole('button', { name: 'Imprimir etiqueta de Extrato de tomate (340g)' }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.getByText('Data de abertura').first()).toBeVisible();
  await expect(janela.getByRole('combobox').filter({ hasText: /ambiente/i }).first()).toHaveValue('ambiente');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await abrirTela(page, '/impressas');
  await expect(page.getByText('Extrato de tomate (340g)').first()).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

// ⚠️ AUDITORIA DE 14/10/2026 (lote 1): números com vírgula e nomes no lugar
// dos códigos internos. O Relatório da demonstração mostrava "empanado" e
// "unidade_centro", e o Início, "7.50 kg".
test('plano Pro: números com vírgula e relatório com nomes, não códigos', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  // a lista com os saldos saiu do Início para a tela Estoque (Lote 6)
  await abrirTela(page, '/estoque');
  await expect(page.locator('main')).toContainText('7,5 kg');
  await expect(page.locator('main')).not.toContainText('7.50 kg');
  await abrirTela(page, '/relatorio');
  await expect(page.locator('main')).toContainText('Empanado de Filé (porção)');
  await expect(page.locator('main')).toContainText('Unidade Centro');
  await expect(page.locator('main')).not.toContainText('unidade_centro');
  await expect(page.locator('main')).not.toContainText(/V — Vencimento/);
  expect(erros, erros.join('\n')).toEqual([]);
});
