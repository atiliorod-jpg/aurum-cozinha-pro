import { test, expect } from '@playwright/test';

// =====================================================================
//  "QUEM VAI IMPRIMIR?" (13/10/2026) — na demonstração (nada vai ao banco):
//  Maria entra só tocando no nome; João tem a senha 1234. A etiqueta sai
//  assinada por quem entrou; reimprimir mantém quem assinou o original; 5
//  erros fazem esperar; outros caminhos de impressão perguntam o nome; o
//  dono cria a senha em Administração; 5 minutos parado volta aos nomes.
// =====================================================================

const ruidoDeRede = /Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|supabase/i;

async function entrarNaDemo(page, plano) {
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
  await page.getByRole('button', { name: new RegExp(plano) }).click();
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

const nomes = (page) => page.getByRole('heading', { name: 'Quem vai imprimir?' });

async function digitarSenha(page, numeros) {
  for (const d of numeros) await page.getByRole('button', { name: d, exact: true }).click();
}

test('Etiquetas: Maria entra sem senha, João só com a senha certa, e a reimpressão mantém Maria', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');

  // a tela começa pelos nomes, e a busca não aparece antes
  await expect(nomes(page)).toBeVisible();
  await expect(page.getByLabel('Buscar produto')).toHaveCount(0);

  // Maria: um toque e já busca; a etiqueta sai com RESP. Maria
  await page.getByRole('button', { name: 'Maria', exact: true }).click();
  await expect(page.getByText('Imprimindo como Maria')).toBeVisible();
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  let janela = page.getByRole('dialog');
  await expect(janela.locator('.etiqueta-label').first()).toContainText('Maria');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Trocar → João tem senha: errada avisa quantas restam; 1234 entra
  await page.getByRole('button', { name: 'Trocar', exact: true }).click();
  await expect(nomes(page)).toBeVisible();
  await page.getByRole('button', { name: /^João/ }).click();
  await expect(page.getByText('Senha de João', { exact: true })).toBeVisible();
  await expect(page.getByText(/a senha de João é 1234/)).toBeVisible(); // só na demonstração
  await digitarSenha(page, '9999');
  await expect(page.getByText(/Restam 4 tentativas/)).toBeVisible();
  await digitarSenha(page, '1234');
  await expect(page.getByText('Imprimindo como João')).toBeVisible();

  // reimprimir a etiqueta da Maria, com João na vez: continua assinada por Maria
  await abrir(page, '/impressas');
  await page.getByRole('button', { name: 'Reimprimir etiqueta de Frango desfiado' }).first().click();
  janela = page.getByRole('dialog');
  await expect(janela.getByText('Assinatura da etiqueta original:')).toBeVisible();
  await expect(janela.locator('.etiqueta-label').first()).toContainText('Maria');
  await expect(janela.locator('.etiqueta-label').first()).not.toContainText('João');

  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: 5 senhas erradas fazem o aparelho esperar 1 minuto', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await page.getByRole('button', { name: /^João/ }).click();
  for (let i = 0; i < 4; i++) await digitarSenha(page, '0000');
  await expect(page.getByText(/Resta 1 tentativa/)).toBeVisible();
  await digitarSenha(page, '0000');
  await expect(page.getByText(/Espere \d+ segundos/)).toBeVisible();
  // durante a espera, nem a senha certa entra
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled();
  // voltar aos nomes e tocar de novo não zera a espera
  await page.getByRole('button', { name: 'Voltar aos nomes' }).click();
  await page.getByRole('button', { name: /^João/ }).click();
  await expect(page.getByText(/Espere \d+ segundos/)).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

// ⚠️ LOTE 2 DA AUDITORIA (14/10/2026): a MESMA pessoa assina o lançamento e a
// etiqueta. O formulário pergunta o nome antes de registrar; a janela de
// imprimir que abre em seguida já vem assinada.
test('Cozinha Pro: o lançamento pergunta quem está registrando, e a etiqueta sai no mesmo nome', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/entradas');
  await page.getByRole('spinbutton', { name: 'Quantidade de Filé de Frango (porção)' }).fill('2');
  // ninguém escolhido: o formulário pergunta, e o botão espera
  await expect(page.getByRole('heading', { name: 'Quem está registrando?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar Entrada' })).toBeDisabled();
  await page.getByRole('button', { name: 'Maria', exact: true }).click();
  await expect(page.getByText('Registrando como Maria')).toBeVisible();
  await page.getByRole('button', { name: 'Registrar Entrada' }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.getByText('Assina: Maria')).toBeVisible();
  await expect(janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ })).toBeEnabled();
  await page.keyboard.press('Escape');
  // o Histórico guarda quem registrou
  await abrir(page, '/historico');
  await expect(page.locator('main div').filter({ hasText: /^2 Filé de Frango \(porção\)/ }).first()).toContainText('Maria');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Cozinha Pro: quem tem senha digita no próprio formulário', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/aparas');
  await page.getByRole('button', { name: /^João/ }).click();
  for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('Registrando como João')).toBeVisible();
  // e vale nas outras telas enquanto ele usa o aparelho
  await abrir(page, '/saidas');
  await expect(page.getByText('Registrando como João')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Cozinha Pro: se o nome expira com a janela de imprimir aberta, ela pergunta de novo', async ({ page }) => {
  await page.clock.install();
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/entradas');
  await page.getByRole('spinbutton', { name: 'Quantidade de Filé de Frango (porção)' }).fill('1');
  await page.getByRole('button', { name: 'Maria', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar Entrada' }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.getByText('Assina: Maria')).toBeVisible();
  await page.clock.fastForward('05:30');
  await expect(janela.getByRole('heading', { name: 'Quem vai imprimir?' })).toBeVisible();
  await expect(janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ })).toBeDisabled();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: o dono cria a senha da Maria em Administração', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/administracao/equipe');
  await page.getByRole('button', { name: 'Criar senha de Maria' }).click();
  await page.getByLabel('Nova senha de Maria').fill('0512');
  await page.getByLabel('Repita a senha de Maria').fill('0513');
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(page.getByText(/não são iguais/)).toBeVisible();
  await page.getByLabel('Repita a senha de Maria').fill('0512');
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(page.getByRole('button', { name: 'Trocar senha de Maria' })).toBeVisible();

  // agora Maria também pede senha
  await abrir(page, '/etiquetas');
  await page.getByRole('button', { name: /^Maria/ }).click();
  await expect(page.getByText('Senha de Maria', { exact: true })).toBeVisible();
  await digitarSenha(page, '0512');
  await expect(page.getByText('Imprimindo como Maria')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: 5 minutos sem uso volta para os nomes', async ({ page }) => {
  await page.clock.install();
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await page.getByRole('button', { name: 'Maria', exact: true }).click();
  await expect(page.getByText('Imprimindo como Maria')).toBeVisible();
  await page.clock.fastForward('04:00');
  await expect(page.getByText('Imprimindo como Maria')).toBeVisible();
  await page.clock.fastForward('01:30');
  await expect(nomes(page)).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});
