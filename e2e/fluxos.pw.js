import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo, fecharJanelaDeImprimir, saldoDe } from './apoio';

// =====================================================================
//  REDE DE SEGURANÇA (Lote 0 da auditoria, 14/10/2026)
//
//  Cada lançamento do dia a dia, do jeito que a cozinha faz, conferido pelo
//  que muda na tela (o saldo, o Histórico). É o que permite reorganizar as
//  telas nos próximos lotes sem quebrar o que já funciona: se um destes
//  falhar, o deploy não sai.
//  Os que já tinham cenário próprio ficam onde estão: imprimir e reimprimir
//  (telas, senhaEquipe), ler o QR (baixaEtiqueta), saída para a Finalização
//  e entrada pela impressão (validadeFinalizacao), sem internet (semInternet).
// =====================================================================

test('Pro: entrada avulsa soma no saldo e aparece no Histórico', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  const item = 'Filé de Tilápia (porção)';
  const antes = await saldoDe(page, item);

  await abrir(page, '/entradas');
  await entrarComo(page, 'Maria'); // "Quem está registrando?" (Lote 2)
  await page.getByRole('spinbutton', { name: `Quantidade de ${item}` }).fill('3');
  await page.getByRole('button', { name: 'Registrar Entrada' }).click();
  // depois de registrar, o app oferece imprimir as etiquetas: "Agora não"
  await fecharJanelaDeImprimir(page);

  expect(await saldoDe(page, item)).toBe(antes + 3);
  await abrir(page, '/historico');
  await expect(page.locator('main')).toContainText(`3 ${item}`);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro: saída para outra unidade tira do saldo', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  const item = 'Picanha (porção)';
  const antes = await saldoDe(page, item);

  // saldoDe já deixou a tela de Saídas aberta
  await entrarComo(page, 'Maria');
  await page.getByRole('button', { name: 'Unidade Centro', exact: true }).click();
  await page.getByRole('spinbutton', { name: `Quantidade de ${item}` }).fill('2');
  await page.getByRole('button', { name: 'Registrar Saída' }).click();

  expect(await saldoDe(page, item)).toBe(antes - 2);
  await abrir(page, '/historico');
  await expect(page.locator('main')).toContainText(`2 ${item} → Unidade Centro`);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro: perda do estoque abate o saldo e mostra o motivo por extenso', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  const item = 'Queijo Muçarela';
  const antes = await saldoDe(page, item);

  await abrir(page, '/aparas');
  await page.getByRole('button', { name: /^Perda/ }).click();
  await entrarComo(page, 'Maria');
  await page.getByLabel('Qual item foi perdido').selectOption('queijo');
  await page.getByLabel('Quantidade').fill('0.5');
  await page.getByRole('button', { name: /Vencimento/ }).click();
  await page.getByRole('button', { name: 'Registrar Perda' }).click();

  expect(await saldoDe(page, item)).toBe(antes - 0.5);
  await abrir(page, '/historico');
  await expect(page.locator('main')).toContainText(`0,5 kg de ${item} (Vencimento · saiu do estoque)`);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro: apara registrada não mexe no saldo e vai para o Histórico', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  const antes = await saldoDe(page, 'Picanha (porção)');

  await abrir(page, '/aparas');
  await entrarComo(page, 'Maria');
  await page.getByLabel('Descrição da apara').fill('Ponta de picanha');
  await page.getByLabel('Quantidade').fill('0.3');
  await page.getByRole('button', { name: 'Registrar Apara' }).click();

  expect(await saldoDe(page, 'Picanha (porção)')).toBe(antes);
  await abrir(page, '/historico');
  await expect(page.locator('main')).toContainText('Ponta de picanha');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro: produção soma o item produzido no saldo', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  const item = 'Molho de Tomate da Casa';
  const antes = await saldoDe(page, item);

  await abrir(page, '/producao');
  await entrarComo(page, 'Maria');
  await page.getByLabel('O que você produziu?').selectOption('molho');
  await page.getByLabel('Quantidade').fill('5');
  await page.getByRole('button', { name: 'Registrar Produção' }).click();
  await fecharJanelaDeImprimir(page);

  expect(await saldoDe(page, item)).toBe(antes + 5);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro: compra registrada aparece no Histórico (e não muda o saldo da porção)', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/compras');
  await entrarComo(page, 'Maria');
  await page.getByPlaceholder('Ex: Filé Mignon, Frango Filé, Picanha...').fill('Contrafilé do robô');
  await page.getByLabel('Quantidade', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Registrar Compra' }).click();

  await abrir(page, '/historico');
  await expect(page.locator('main')).toContainText('Contrafilé do robô');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro: contagem física troca o saldo pelo valor contado', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  const item = 'Picanha (porção)';
  await abrir(page, '/inventario');
  await entrarComo(page, 'Maria');
  // o campo, não os botões − / + (que dizem "Diminuir quantidade contada de…")
  await page.getByLabel(`Quantidade contada de ${item}`, { exact: true }).fill('3');
  await page.getByRole('button', { name: /^Salvar Contagem/ }).click();
  // a confirmação explica que o contado vira a nova base
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar contagem' }).click();

  expect(await saldoDe(page, item)).toBe(3);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Finalização: fechar o turno contando a sobra', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro', /^Cozinha de Finalização/);
  await abrir(page, '/fechar-turno');
  await entrarComo(page, 'Maria');
  await page.getByLabel('Sobra de Empanado de Filé (porção)', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Fechar turno', exact: true }).click();
  await expect(page.getByText(/Turno (Almoço|Jantar) fechado/)).toBeVisible();
  // o fechamento de hoje entra na lista dos últimos turnos
  const hoje = await page.evaluate(() => new Date().toLocaleDateString('pt-BR'));
  await expect(page.locator('main')).toContainText(hoje);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: item da biblioteca e item do zero entram em Meus itens e na tela de imprimir', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');

  // da biblioteca: abre a ficha preenchida, a pessoa confere e adiciona
  await abrir(page, '/itens');
  await page.getByRole('button', { name: 'Adicionar prontos' }).click();
  await page.getByLabel('Buscar item').fill('alcatra (porção)');
  await page.getByRole('button', { name: /Alcatra \(porção\).*Adicionar/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // do zero (a busca continua preenchida ao trocar de aba: limpa antes)
  await page.getByLabel('Buscar item').fill('');
  await page.getByRole('button', { name: /Meus itens/ }).click();
  await page.getByRole('button', { name: '+ Cadastrar item do zero' }).click();
  const ficha = page.getByRole('dialog');
  await ficha.getByLabel('Nome').fill('Molho branco do robô');
  await ficha.getByLabel('Unidade').fill('L');
  await ficha.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('Molho branco do robô');

  // os dois já podem ser impressos
  await abrir(page, '/');
  await entrarComo(page, 'Maria');
  await expect(page.getByRole('button', { name: 'Imprimir etiqueta de Alcatra (porção)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimir etiqueta de Molho branco do robô' })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: a cópia de segurança baixa um arquivo da conta', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/administracao/conta');
  const baixando = page.waitForEvent('download');
  await page.getByRole('button', { name: /Baixar uma cópia/ }).click();
  const arquivo = await baixando;
  expect(arquivo.suggestedFilename()).toMatch(/^aurum-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(erros, erros.join('\n')).toEqual([]);
});
