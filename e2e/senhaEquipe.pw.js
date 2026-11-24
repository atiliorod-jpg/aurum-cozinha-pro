import { test, expect } from '@playwright/test';
import { continuarImprimindo, entrarComo, digitarNumeros, trocarDeTela, liberarSeTravada, SENHA_DO_ROBO } from './apoio';

// =====================================================================
//  "QUEM VAI IMPRIMIR?" (13/10/2026; jeito do Magurō desde 23/11/2026) —
//  na demonstração (nada vai ao banco): a senha é obrigatória e tem 2
//  números. Maria é "1º acesso" e cria a dela; João já tem a 12. A etiqueta
//  sai assinada por quem entrou; reimprimir mantém quem assinou o original;
//  5 erros fazem esperar; outros caminhos de impressão perguntam o nome; o
//  dono só ZERA a senha em Administração; 1 minuto parado volta aos nomes.
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
  await trocarDeTela(page, rota);
  await liberarSeTravada(page); // a senha da Administração (1234 na demonstração)
}

const nomes = (page) => page.getByRole('heading', { name: 'Quem vai imprimir?' });
const cartao = (page, nome) => page.getByRole('button', { name: nome, exact: true });

test('Etiquetas: Maria cria a senha no 1º acesso, João só com a senha certa, e a reimpressão mantém Maria', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');

  // a tela começa pelos nomes, e a busca não aparece antes
  await expect(nomes(page)).toBeVisible();
  await expect(page.getByLabel('Buscar produto')).toHaveCount(0);
  await expect(cartao(page, 'Maria')).toHaveAccessibleDescription('1º acesso');
  await expect(cartao(page, 'João')).toHaveAccessibleDescription('com senha');

  // Maria: cria a senha (2 números, duas vezes); errar a repetição recomeça
  await cartao(page, 'Maria').click();
  await expect(page.getByRole('heading', { name: 'Crie sua senha, Maria' })).toBeVisible();
  await digitarNumeros(page, '24');
  await expect(page.getByRole('heading', { name: 'Repita a senha' })).toBeVisible();
  await digitarNumeros(page, '25');
  await expect(page.getByText('As duas não ficaram iguais. Crie de novo.')).toBeVisible();
  await digitarNumeros(page, SENHA_DO_ROBO);
  await digitarNumeros(page, SENHA_DO_ROBO);
  await expect(page.getByText('Imprimindo como Maria')).toBeVisible();

  // a etiqueta sai com RESP. Maria
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  let janela = page.getByRole('dialog');
  await expect(janela.locator('.etiqueta-label').first()).toContainText('Maria');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await continuarImprimindo(page);

  // Trocar → Maria agora tem senha; João: errada avisa quantas restam; 12 entra
  await page.getByRole('button', { name: 'Trocar', exact: true }).click();
  await expect(nomes(page)).toBeVisible();
  await expect(cartao(page, 'Maria')).toHaveAccessibleDescription('com senha');
  await cartao(page, 'João').click();
  await expect(page.getByRole('heading', { name: 'Senha de João' })).toBeVisible();
  await expect(page.getByText(/a senha de João é 12\./)).toBeVisible(); // só na demonstração
  await digitarNumeros(page, '99');
  await expect(page.getByText(/Restam 4 tentativas/)).toBeVisible();
  await digitarNumeros(page, '12');
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

// era 1 minuto; o dono pediu 15 segundos em 23/11/2026, como no Magurō
test('Etiquetas: 5 senhas erradas fazem o aparelho esperar 15 segundos', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await cartao(page, 'João').click();
  for (let i = 0; i < 4; i++) await digitarNumeros(page, '00');
  await expect(page.getByText(/Resta 1 tentativa/)).toBeVisible();
  await digitarNumeros(page, '00');
  await expect(page.getByText(/Espere \d+ segundos/)).toBeVisible();
  // durante a espera, nem a senha certa entra
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled();
  // voltar aos nomes e tocar de novo não zera a espera
  await page.getByRole('button', { name: 'Voltar aos nomes' }).click();
  await cartao(page, 'João').click();
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
  // 1º acesso da Maria, dentro do próprio formulário
  await entrarComo(page, 'Maria');
  await expect(page.getByText('Registrando como Maria')).toBeVisible();
  // o que foi digitado antes da senha continua lá
  await expect(page.getByRole('spinbutton', { name: 'Quantidade de Filé de Frango (porção)' })).toHaveValue('2');
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
  await cartao(page, 'João').click();
  await digitarNumeros(page, '12');
  await expect(page.getByText('Registrando como João')).toBeVisible();
  // e vale nas outras telas enquanto ele usa o aparelho
  await abrir(page, '/saidas');
  await expect(page.getByText('Registrando como João')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

// ⚠️ 04/11/2026: o minuto sem uso só vale na tela Imprimir — aberta por
// Entradas, a janela continua assinada por quem estava (decisão do dono)
test('Cozinha Pro: aberta por Entradas, a janela de imprimir não perde o nome no minuto sem uso', async ({ page }) => {
  await page.clock.install();
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro');
  await abrir(page, '/entradas');
  await page.getByRole('spinbutton', { name: 'Quantidade de Filé de Frango (porção)' }).fill('1');
  await entrarComo(page, 'Maria');
  await page.getByRole('button', { name: 'Registrar Entrada' }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.getByText('Assina: Maria')).toBeVisible();
  await page.clock.fastForward('01:10');
  await expect(janela.getByText('Assina: Maria')).toBeVisible();
  await expect(janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ })).toBeEnabled();
  expect(erros, erros.join('\n')).toEqual([]);
});

// ⚠️ 23/11/2026: o dono não cria nem troca senha de ninguém — só ZERA, e a
// pessoa cria outra no próximo toque no nome
test('Etiquetas: o dono zera a senha do João, e ele cria outra no próximo toque', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/administracao/equipe');
  // quem ainda não tem senha não tem o que zerar
  await expect(page.getByRole('button', { name: 'Zerar senha de Maria' })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Zerar senha de João' }).click();
  const pergunta = page.getByRole('dialog');
  await expect(pergunta).toContainText('Zerar a senha de João?');
  await pergunta.getByRole('button', { name: 'Zerar senha', exact: true }).click();
  await expect(page.getByText(/Senha de João zerada/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zerar senha de João' })).toHaveCount(0);

  // na tela de nomes, João é "1º acesso" de novo e cria a dele
  await abrir(page, '/etiquetas');
  await expect(cartao(page, 'João')).toHaveAccessibleDescription('1º acesso');
  await cartao(page, 'João').click();
  await expect(page.getByRole('heading', { name: 'Crie sua senha, João' })).toBeVisible();
  await digitarNumeros(page, '3131');
  await expect(page.getByText('Imprimindo como João')).toBeVisible();
  // e a senha velha (12) não entra mais
  await page.getByRole('button', { name: 'Trocar', exact: true }).click();
  await cartao(page, 'João').click();
  await digitarNumeros(page, '12');
  await expect(page.getByText(/Senha errada/)).toBeVisible();
  await digitarNumeros(page, '31');
  await expect(page.getByText('Imprimindo como João')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

// ⚠️ No Magurō, o nome quebrava letra por letra num celular de 375 px: o
// "1º acesso" ficava AO LADO do nome e roubava a largura dele.
test('Etiquetas: num celular, o nome cabe inteiro no cartão', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/administracao/equipe');
  await page.getByLabel('Nome da pessoa').fill('Maximiliano Albuquerque');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await abrir(page, '/etiquetas');
  await expect(nomes(page)).toBeVisible();
  const larguras = await page.getByRole('region', { name: 'Quem vai imprimir?' }).locator('button[aria-describedby]').evaluateAll(bs => bs.map(b => {
    const nome = b.querySelector('span.flex-1 > span');
    return { nome: b.getAttribute('aria-label'), largura: nome.getBoundingClientRect().width, altura: b.getBoundingClientRect().height };
  }));
  expect(larguras.length).toBe(3);
  for (const l of larguras) {
    expect(l.largura, `${l.nome}: o nome tem ${Math.round(l.largura)} px`).toBeGreaterThan(70);
    expect(l.altura, `${l.nome}: o cartão tem ${Math.round(l.altura)} px`).toBeGreaterThanOrEqual(76);
  }
  // nenhuma rolagem para o lado
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(erros, erros.join('\n')).toEqual([]);
});

// eram 5 minutos; o dono pediu 1 em 03/11/2026, como na Suflex
test('Etiquetas: 1 minuto sem uso volta para os nomes', async ({ page }) => {
  await page.clock.install();
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  await expect(page.getByText('Imprimindo como Maria')).toBeVisible();
  await page.clock.fastForward('00:40');
  await expect(page.getByText('Imprimindo como Maria')).toBeVisible();
  await page.clock.fastForward('00:30');
  await expect(nomes(page)).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: 1 minuto parado com a janela aberta, ela fecha e a tela recomeça nos nomes', async ({ page }) => {
  await page.clock.install();
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  await page.getByLabel('Buscar produto').fill('frango');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.fastForward('01:10');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(nomes(page)).toBeVisible();
  // a próxima pessoa começa do zero: sem a busca de quem saiu
  await entrarComo(page, 'Maria');
  await expect(page.getByLabel('Buscar produto')).toHaveValue('');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: depois de imprimir pergunta se continua; sem resposta em 5 s volta para os nomes', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  let janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  const pergunta = page.getByRole('dialog', { name: 'Continuar imprimindo, Maria?' });
  await expect(pergunta).toBeVisible();
  await expect(pergunta).toContainText(/Volta para os nomes em \d s/);
  // ninguém responde: em 5 s, os nomes de novo
  await expect(nomes(page)).toBeVisible({ timeout: 10_000 });
  await expect(pergunta).toHaveCount(0);

  // "Continuar" segue como a mesma pessoa
  await entrarComo(page, 'Maria');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await continuarImprimindo(page);
  await expect(page.getByText('Imprimindo como Maria')).toBeVisible();
  // e "Trocar pessoa" volta para os nomes na hora
  await page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' }).click();
  janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await page.getByRole('dialog', { name: 'Continuar imprimindo, Maria?' })
    .getByRole('button', { name: 'Trocar pessoa' }).click();
  await expect(nomes(page)).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});
