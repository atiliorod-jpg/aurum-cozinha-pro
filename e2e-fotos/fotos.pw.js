import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo } from '../e2e/apoio';

// Uma foto por tela, no tamanho de celular, com o relógio parado (a
// demonstração é montada a partir de "hoje" e mostra horas).
const DIA = new Date('2026-10-14T10:00:00');

async function fotografar(page, nome, opcoes = {}) {
  await page.waitForTimeout(300);
  // soft: compara TODAS as telas, em vez de parar na primeira diferente
  await expect.soft(page).toHaveScreenshot(`${nome}.png`, { fullPage: true, ...opcoes });
}

async function percorrer(page, prefixo, rotas) {
  for (const rota of rotas) {
    await abrir(page, rota);
    await fotografar(page, `${prefixo}${rota.replace(/[/?=]/g, '_') || '_inicio'}`);
  }
}

test('plano Etiquetas', async ({ page }) => {
  await page.clock.setFixedTime(DIA);
  await entrarNaDemo(page, 'Aurum Etiquetas');
  await fotografar(page, 'etq_nomes');
  await entrarComo(page, 'Maria');
  await percorrer(page, 'etq', ['/', '/itens', '/impressas', '/ajustes', '/pagamento']);
  await abrir(page, '/');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  // o código do QR é sorteado a cada etiqueta: fica de fora da comparação
  await fotografar(page, 'etq_janela_imprimir', { fullPage: false, mask: [page.locator('.etiqueta-label')] });
});

test('plano Pro, Produção', async ({ page }) => {
  await page.clock.setFixedTime(DIA);
  await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await percorrer(page, 'pro', [
    '/', '/registrar', '/historico', '/compras', '/entradas', '/saidas', '/producao', '/aparas',
    '/etiquetas', '/validades', '/itens', '/inventario', '/relatorio', '/impressas', '/administracao',
    '/financeiro', '/estoques', '/configuracoes', '/configuracoes?secao=sistema', '/configuracoes?secao=acessos',
  ]);
});

test('plano Pro, Finalização', async ({ page }) => {
  await page.clock.setFixedTime(DIA);
  await entrarNaDemo(page, 'Aurum Cozinha Pro', /^Cozinha de Finalização/);
  await percorrer(page, 'fin', ['/', '/registrar', '/fechar-turno', '/validades']);
});
