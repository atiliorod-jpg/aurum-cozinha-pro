import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo, trocarDeTela, continuarImprimindo, digitarSenhaAdm, telaTravada } from './apoio';

// =====================================================================
//  A SENHA DA ADMINISTRAÇÃO (23/11/2026, jeito do Magurō — pedido do dono)
//  • a Administração e os relatórios pedem a senha (4 a 8 números; na
//    demonstração, 1234) — em qualquer aparelho. Meus itens é livre (24/11);
//  • fecha no cadeado dourado do cabeçalho, ou sozinha com 3 minutos parada;
//  • REIMPRIMIR é livre: o link discreto na tela Imprimir, só as de hoje.
//  (o banco — M62 — confere a mesma coisa: scripts/pentest-administracao.mjs)
// =====================================================================

const barra = (page) => page.getByRole('navigation', { name: 'Navegação principal' });
const tela = (page) => page.locator('main');

test('Etiquetas: Meus itens é livre; a Administração pede a senha; com ela abre; o cadeado fecha', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  // as três abas aparecem para todos, como a engrenagem do Magurō
  await expect(barra(page).getByRole('link')).toHaveText(['Imprimir', 'Meus itens', 'Administração']);
  // Meus itens sem senha desde 24/11/2026 (pedido do dono)
  await barra(page).getByRole('link', { name: 'Meus itens' }).click();
  await expect(tela(page).getByRole('button', { name: 'Meus itens (4)' })).toBeVisible();
  await expect(telaTravada(page)).toHaveCount(0);
  await barra(page).getByRole('link', { name: 'Administração' }).click();
  await expect(telaTravada(page)).toBeAttached();
  await expect(tela(page).getByText('Na demonstração, a senha é 1234.')).toBeVisible();
  // menos de 4 números: o Entrar não libera
  for (const d of '123') await tela(page).getByRole('button', { name: d, exact: true }).click();
  await expect(tela(page).getByRole('button', { name: 'Entrar', exact: true })).toBeDisabled();
  for (let i = 0; i < 3; i++) await tela(page).getByRole('button', { name: 'Apagar', exact: true }).click();
  // errada
  await digitarSenhaAdm(page, '9999');
  await expect(tela(page).getByText('Senha errada. Restam 4 tentativas antes de esperar.')).toBeVisible();
  // certa: a Administração abre ali mesmo, com o cadeado dourado no cabeçalho
  await digitarSenhaAdm(page);
  await expect(page.getByRole('heading', { name: 'Administração', level: 1 })).toBeVisible();
  await expect(telaTravada(page)).toHaveCount(0);
  const cadeado = page.getByRole('button', { name: 'Fechar a Administração' });
  await expect(cadeado).toBeVisible();
  // o cadeado fecha na hora: a tela trava ali mesmo
  await cadeado.click();
  await expect(telaTravada(page)).toBeAttached();
  await expect(cadeado).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('a Administração fecha sozinha com 3 minutos sem ninguém tocar', async ({ page }) => {
  await page.clock.install();
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/administracao'); // o robô digita 1234
  await expect(page.getByRole('button', { name: 'Fechar a Administração' })).toBeVisible();
  await page.clock.fastForward('02:30');
  await expect(telaTravada(page)).toHaveCount(0);
  await page.clock.fastForward('00:40');
  await expect(telaTravada(page)).toBeAttached();
  await expect(page.getByRole('button', { name: 'Fechar a Administração' })).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('reimprimir é livre: o link da tela Imprimir abre a lista de hoje, sem senha e sem Apagar', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page);
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  const janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await continuarImprimindo(page);
  await tela(page).getByRole('link', { name: 'Reimprimir' }).click();
  await expect(page.getByRole('heading', { name: 'Reimprimir etiqueta', level: 1 })).toBeVisible();
  await expect(telaTravada(page)).toHaveCount(0);
  await expect(tela(page).getByText('Só as de hoje. De outro dia, imprima uma nova.')).toBeVisible();
  // sem os totais (são do relatório) e sem Apagar (é da Administração)
  await expect(tela(page).getByText('Este mês')).toHaveCount(0);
  const linha = page.getByRole('listitem').filter({ hasText: 'Frango desfiado' }).first();
  await expect(linha.getByRole('button', { name: /^Apagar/ })).toHaveCount(0);
  await linha.getByRole('button', { name: 'Reimprimir etiqueta de Frango desfiado' }).click();
  await expect(page.getByRole('dialog').getByText('Assinatura da etiqueta original:')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('trocar a senha da Administração: a nova vale, a velha não', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/administracao/equipe');
  await page.getByRole('button', { name: 'Trocar a senha da Administração' }).click();
  const janela = page.getByRole('dialog', { name: 'Senha da Administração' });
  const teclar = async (numeros, botao) => {
    for (const d of numeros) await janela.getByRole('button', { name: d, exact: true }).click();
    await janela.getByRole('button', { name: botao, exact: true }).click();
  };
  await teclar('567890', 'Continuar');
  await teclar('567890', 'Salvar');
  await expect(page.getByText('Senha da Administração trocada. Vale em todos os aparelhos.')).toBeVisible();
  await expect(janela).toHaveCount(0);
  await page.getByRole('button', { name: 'Fechar a Administração' }).click();
  await expect(telaTravada(page)).toBeAttached();
  await digitarSenhaAdm(page, '1234');
  await expect(tela(page).getByText(/^Senha errada/)).toBeVisible();
  await digitarSenhaAdm(page, '567890');
  await expect(telaTravada(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Equipe', level: 1 })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Pro: a Administração e a Contagem pedem a senha; as telas da cozinha, não', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await trocarDeTela(page, '/entradas');
  await expect(telaTravada(page)).toHaveCount(0);
  await trocarDeTela(page, '/administracao');
  await expect(telaTravada(page)).toBeAttached();
  // o cartão da Contagem aparece no Registrar, e a tela pede a senha
  await trocarDeTela(page, '/registrar');
  await tela(page).getByRole('link', { name: /Contagem física/ }).click();
  await expect(telaTravada(page)).toBeAttached();
  await digitarSenhaAdm(page);
  await expect(telaTravada(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Contagem', level: 1 })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});
