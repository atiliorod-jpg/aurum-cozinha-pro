import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import { entrarNaDemo, abrir, entrarComo } from './apoio';

// =====================================================================
//  LOTE 4 DA AUDITORIA (14/10/2026) — um lugar para cada coisa.
//  • a ficha do item é uma só (Meus itens), e item com data de abertura nasce
//    "só etiqueta": imprime, mas não entra nas contas do estoque;
//  • a planilha mora dentro de Meus itens;
//  • a Administração tem cinco grupos, os mesmos nos dois planos.
// =====================================================================

test('Cozinha Pro: item de abertura nasce só etiqueta — imprime, mas fica fora do estoque', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/itens');
  await page.getByRole('button', { name: 'Adicionar prontos' }).click();
  await page.getByLabel('Buscar item').fill('azeite');
  await page.getByRole('button', { name: /^Azeite\b.*Adicionar/ }).click();
  const ficha = page.getByRole('dialog');
  // a chave vem desligada sozinha: o item é de abertura
  await expect(ficha.getByRole('switch', { name: 'Controla estoque' })).toHaveAttribute('aria-checked', 'false');
  await expect(ficha.getByText(/Só etiqueta: não entra nas contas do estoque/)).toBeVisible();
  await ficha.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // na lista ele se anuncia
  await page.getByLabel('Buscar item').fill('');
  await page.getByRole('button', { name: /Meus itens/ }).click();
  await expect(page.getByRole('button', { name: /^Azeite.*só etiqueta/ })).toBeVisible();

  // não aparece para dar entrada, nem no Início...
  await abrir(page, '/entradas');
  await expect(page.getByRole('spinbutton', { name: 'Quantidade de Filé de Frango (porção)' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Quantidade de Azeite' })).toHaveCount(0);
  await abrir(page, '/');
  await expect(page.locator('main')).not.toContainText('Azeite');
  // ...mas imprime
  await abrir(page, '/etiquetas');
  await entrarComo(page, 'Maria');
  await expect(page.getByRole('button', { name: 'Imprimir etiqueta de Azeite' })).toBeVisible();

  // e ligar a chave traz o item para o estoque
  await abrir(page, '/itens');
  await page.getByRole('button', { name: /^Azeite/ }).click();
  await page.getByRole('dialog').getByRole('switch', { name: 'Controla estoque' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Azeite.*só etiqueta/ })).toHaveCount(0);
  await abrir(page, '/entradas');
  await expect(page.getByRole('spinbutton', { name: 'Quantidade de Azeite' })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Cozinha Pro: a ficha guarda o que era de Configurações → Produtos (mínimo, cocção, subgrupo)', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/itens');
  await page.getByRole('button', { name: /^Filé Mignon \(cru, kg\)/ }).click();
  const ficha = page.getByRole('dialog');
  await ficha.getByText('Quantidade, mínimo e máximo').click();
  await expect(ficha.getByLabel('Mínimo', { exact: true })).toHaveValue('8');
  await ficha.getByLabel('Máximo', { exact: true }).fill('20');
  await ficha.getByLabel('Subgrupo (opcional)').fill('Bovinos');
  await ficha.getByText('Cocção e fator de correção').click();
  await ficha.getByRole('switch', { name: 'Entra no estoque já cozido' }).click();
  await ficha.getByLabel('Perda na cocção (%)').fill('30');
  await ficha.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // reabre: está tudo lá
  await page.getByRole('button', { name: /^Filé Mignon \(cru, kg\)/ }).click();
  await expect(ficha.getByText('mínimo 8 · máximo 20')).toBeVisible();
  await expect(ficha.getByText('entra cozido, perde 30%')).toBeVisible();
  // e o Início ganhou o subgrupo novo no filtro da categoria
  await page.keyboard.press('Escape');
  await abrir(page, '/');
  await page.getByRole('button', { name: 'PROTEÍNAS', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bovinos', exact: true })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: a planilha de Meus itens baixa os itens da conta e importa de volta', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/itens');
  await page.getByRole('button', { name: 'Planilha', exact: true }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.getByText(/Ela vem com os seus 4 itens/)).toBeVisible();
  const baixando = page.waitForEvent('download');
  await janela.getByRole('button', { name: 'Baixar planilha' }).click();
  expect((await baixando).suggestedFilename()).toBe('meus_itens.xlsx');

  // uma linha nova e uma que atualiza um item que já existe
  const ws = XLSX.utils.aoa_to_sheet([
    ['Nome *', 'Grupo *', 'Unidade * (kg/g/L/mL/unid)', 'Marca/Fornecedor'],
    ['Creme do robô', 'MOLHOS E PREPARADOS', 'kg', ''],
    ['Frango desfiado', 'AVES', 'kg', 'Granja Robô'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Itens');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  await page.getByLabel('Arquivo da planilha').setInputFiles({
    name: 'itens.xlsx', buffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(page.getByText('Planilha importada: 1 novo, 1 atualizado.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Creme do robô/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Frango desfiado.*Granja Robô/ })).toBeVisible();
  // o item que não estava na planilha continua lá
  await expect(page.getByRole('button', { name: /^Picanha \(porção\)/ })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Cozinha Pro: a Administração tem cinco grupos, e o endereço antigo de Configurações leva ao lugar novo', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/administracao');
  for (const g of ['A casa', 'Etiqueta', 'Equipe', 'Estoque', 'Conta']) {
    await expect(page.getByRole('link', { name: new RegExp(`^${g}\\b`) })).toBeVisible();
  }
  await page.getByRole('link', { name: /^Estoque\b/ }).click();
  await expect(page.getByRole('heading', { name: 'Estoque', level: 1 })).toBeVisible();
  await expect(page.getByText(/Valem para Cozinha de Produção/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Receitas de produção' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mínimo e máximo automáticos' })).toBeVisible();
  // a seta do cabeçalho volta para o hub
  await page.getByRole('button', { name: 'Voltar para a Administração' }).click();
  await expect(page.getByRole('heading', { name: 'Administração', level: 1 })).toBeVisible();

  // favorito antigo: Configurações → Acessos cai em Equipe
  await abrir(page, '/configuracoes?secao=acessos');
  await expect(page.getByRole('heading', { name: 'Equipe', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contas da equipe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nomes da equipe' })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: a Administração é a mesma, sem o grupo Estoque, e a barra continua embaixo', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/ajustes'); // o endereço antigo
  await expect(page.getByRole('heading', { name: 'Administração', level: 1 })).toBeVisible();
  for (const g of ['A casa', 'Etiqueta', 'Equipe', 'Conta']) {
    await expect(page.getByRole('link', { name: new RegExp(`^${g}\\b`) })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: /^Estoque\b/ })).toHaveCount(0);
  await page.getByRole('link', { name: /^Etiqueta\b/ }).click();
  await expect(page.getByRole('heading', { name: 'Armazenamento' })).toBeVisible();
  // a barra do plano Etiquetas fica, com a aba Administração acesa
  await expect(page.getByRole('navigation').getByRole('link', { name: /Administração/ })).toHaveClass(/text-polo-gold/);
  await page.getByRole('link', { name: /Impressora e rolo/ }).click();
  await expect(page.getByRole('button', { name: 'Impressora', pressed: true })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});
