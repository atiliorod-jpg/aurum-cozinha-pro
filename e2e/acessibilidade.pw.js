import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo, medirAcessibilidade } from './apoio';

// =====================================================================
//  TOQUE, CONTRASTE E TAMANHO DE LETRA — EM TODAS AS TELAS (Lote 0, 14/10)
//
//  A auditoria mediu 243 alvos de toque menores que 44 px, 46 textos sem
//  contraste e 170 letras menores que 12 px, e o Lote 1 zerou os três. Este
//  teste é o que impede de voltar: ele percorre as telas dos dois planos (e as
//  janelas mais usadas) no tamanho de celular e reprova se aparecer um só.
//  Na cozinha o dedo está de luva ou molhado e o celular fica longe.
// =====================================================================

test.use({ viewport: { width: 375, height: 812 } });

async function percorrer(page, rotas, resultado, prefixo) {
  for (const rota of rotas) {
    await abrir(page, rota);
    await page.waitForTimeout(300);
    resultado[`${prefixo} ${rota}`] = await medirAcessibilidade(page);
  }
}

function conferir(resultado) {
  for (const [onde, r] of Object.entries(resultado)) {
    expect.soft(r.pequenos, `${onde}: toque menor que 44 px`).toEqual([]);
    expect.soft(r.contraste, `${onde}: texto sem contraste`).toEqual([]);
    expect.soft(r.letrasPequenas, `${onde}: letra menor que 12 px`).toEqual([]);
  }
}

test('plano Etiquetas: telas e janelas', async ({ page }) => {
  await entrarNaDemo(page, 'Aurum Etiquetas');
  const r = {};
  // a tela de nomes e o teclado da senha
  r['nomes'] = await medirAcessibilidade(page);
  await page.getByRole('button', { name: /^João/ }).click();
  r['teclado da senha'] = await medirAcessibilidade(page);
  await page.getByRole('button', { name: 'Voltar aos nomes' }).click();
  await entrarComo(page, 'Maria');
  await percorrer(page, ['/', '/itens', '/impressas', '/relatorio-etiquetas', '/ajustes', '/pagamento', '/novidades'], r, 'etiquetas');
  // a janela de imprimir — a mais usada do app
  await abrir(page, '/');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  r['janela de imprimir'] = await medirAcessibilidade(page, ['[role=dialog]']);
  conferir(r);
});

test('plano Pro, Produção: telas e janelas', async ({ page }) => {
  await entrarNaDemo(page, 'Aurum Cozinha Pro');
  const r = {};
  await percorrer(page, [
    '/', '/registrar', '/historico', '/compras', '/entradas', '/saidas', '/producao', '/aparas',
    '/etiquetas', '/validades', '/itens', '/inventario', '/relatorio', '/relatorio-etiquetas', '/impressas',
    '/auditoria', '/administracao', '/financeiro', '/estoques', '/balanco', '/configuracoes',
    '/configuracoes?secao=receitas', '/configuracoes?secao=acessos', '/configuracoes?secao=sistema',
    '/ler', '/pagamento',
  ], r, 'pro');
  // a matriz de acessos de um cargo (fica fechada até tocar em "acessos")
  await abrir(page, '/configuracoes?secao=acessos');
  await page.getByRole('button', { name: 'acessos', exact: true }).first().click();
  r['matriz de acessos aberta'] = await medirAcessibilidade(page);
  // a janela de imprimir do Pro pedindo o nome (aberta pela Entrada)
  await abrir(page, '/entradas');
  await page.getByRole('spinbutton', { name: 'Quantidade de Filé de Frango (porção)' }).fill('1');
  await page.getByRole('button', { name: 'Registrar Entrada' }).click();
  r['janela de imprimir pedindo o nome'] = await medirAcessibilidade(page, ['[role=dialog]']);
  await page.keyboard.press('Escape');
  // a troca de área e a Ajuda
  await page.getByRole('button', { name: /Tocar para ir a outra área/ }).click();
  r['janela de trocar de área'] = await medirAcessibilidade(page, ['[role=dialog]']);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Enviar problema ou sugestão|^Ajuda/ }).first().click();
  r['janela de ajuda'] = await medirAcessibilidade(page, ['[role=dialog]']);
  conferir(r);
});

test('plano Pro, Finalização e Estoque Seco', async ({ page, browser }) => {
  await entrarNaDemo(page, 'Aurum Cozinha Pro', /^Cozinha de Finalização/);
  const r = {};
  await percorrer(page, ['/', '/registrar', '/fechar-turno', '/validades', '/historico'], r, 'finalização');
  const seco = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await entrarNaDemo(seco, 'Aurum Cozinha Pro', /^Estoque Seco/);
  await percorrer(seco, ['/', '/registrar', '/saidas', '/entradas', '/aparas', '/etiquetas', '/inventario'], r, 'seco');
  await seco.close();
  conferir(r);
});
