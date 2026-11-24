import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { entrarNaDemo, entrarComo, digitarSenhaAdm, continuarImprimindo } from './apoio';

// =====================================================================
//  RELATÓRIO DE ETIQUETAS — a planilha ABERTA e conferida (auditoria de
//  24/11/2026, pedido do dono: "verifique se o relatório está funcionando,
//  planilha etc."). Até aqui o robô não baixava esta planilha: um erro na
//  montagem das abas passaria calado. A demonstração monta os dias de antes;
//  a etiqueta impressa no teste entra de verdade.
// =====================================================================

test('Relatório de etiquetas: a planilha baixada abre com as 5 abas e o mesmo total da tela; imprimir', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page);
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  const janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await continuarImprimindo(page);
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Administração' }).click();
  await digitarSenhaAdm(page);
  await page.getByRole('link', { name: /^Relatório de etiquetas/ }).click();
  await expect(page.getByRole('heading', { name: 'Relatório de etiquetas', level: 1 })).toBeVisible();
  const cartao = page.getByText('Etiquetas impressas', { exact: true }).locator('xpath=..');
  const totalNaTela = Number((await cartao.locator('p').first().textContent()).trim());
  expect(totalNaTela).toBeGreaterThan(0);

  const [baixada] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar planilha' }).click()]);
  expect(baixada.suggestedFilename()).toMatch(/^etiquetas_\d{4}-\d{2}-\d{2}_a_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const XLSX = await import('xlsx');
  const wb = XLSX.read(readFileSync(await baixada.path()));
  expect(wb.SheetNames).toEqual(['Resumo', 'Por dia', 'Por semana', 'Por item', 'Por responsável']);
  const aba = (nome) => XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '', blankrows: false });
  expect(aba('Resumo')[1]).toEqual(['Etiquetas impressas', totalNaTela]);
  const soma = (linhas) => linhas.slice(1).reduce((s, l) => s + Number(l[l.length - 1] || 0), 0);
  // as abas fecham com o total: por dia, por semana, por item e por responsável
  for (const nome of ['Por dia', 'Por semana', 'Por item', 'Por responsável']) expect(soma(aba(nome)), nome).toBe(totalNaTela);
  expect(aba('Por item').some(l => l[0] === 'Frango desfiado')).toBe(true);

  await page.evaluate(() => { window.__imprimiu = 0; window.print = () => { window.__imprimiu += 1; }; });
  await page.getByRole('button', { name: 'Imprimir ou PDF' }).click();
  expect(await page.evaluate(() => window.__imprimiu)).toBe(1);
  expect(erros, erros.join('\n')).toEqual([]);
});
