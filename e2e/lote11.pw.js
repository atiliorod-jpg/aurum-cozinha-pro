import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo, continuarImprimindo } from './apoio';

// =====================================================================
//  LOTE 11, PARTE 1 (02/11/2026) — métodos de conservação, vistos no Suflex.
//  Na demonstração o "Molho de tomate da casa" tem refrigerado 3 dias e
//  congelado 90. O robô cria a pista quente de 4 h, desliga o horário do
//  refrigerado e confere o papel: data sem hora num, hora certa no outro.
// =====================================================================

test('Etiquetas: vários métodos por item, prazo em horas e horário por método', async ({ page }) => {
  // relógio fixo no começo: a conta da validade em horas fica conferível
  await page.clock.install({ time: new Date('2026-11-02T14:30:05') });
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/itens');
  await page.getByRole('button', { name: /^Molho de tomate da casa/ }).click();
  const ficha = page.getByRole('dialog');

  // o item antigo abre com os métodos que ele usa, o padrão primeiro
  const principal = ficha.getByRole('group', { name: 'Método principal' });
  await expect(principal.getByLabel('Armazenamento')).toHaveValue('refrigerado');
  await expect(principal.getByLabel('Dias')).toHaveValue('3');
  await expect(ficha.getByRole('group', { name: 'Método 2' }).getByLabel('Dias')).toHaveValue('90');
  // o refrigerado sai sem o horário
  await principal.getByRole('switch', { name: 'Mostrar horário na etiqueta' }).click();
  await expect(principal.getByText('As datas saem sem o horário.')).toBeVisible();

  // a pista quente: refrigerado de novo, com estado, prazo em horas
  await ficha.getByRole('button', { name: '+ Adicionar método' }).click();
  const quente = ficha.getByRole('group', { name: 'Método 3' });
  await quente.getByLabel('Armazenamento').selectOption('refrigerado');
  // sem estado ainda é repetido do principal: o Salvar trava
  await expect(quente.getByText(/Já existe outro método/)).toBeVisible();
  await expect(ficha.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
  await quente.getByLabel('Estado (opcional)').selectOption({ label: 'Pista quente' });
  await quente.getByLabel('Horas').fill('4');
  // prazo em horas: o horário sai sempre
  await expect(quente.getByRole('switch', { name: 'Mostrar horário na etiqueta' })).toBeDisabled();
  await expect(quente.getByRole('switch', { name: 'Mostrar horário na etiqueta' })).toHaveAttribute('aria-checked', 'true');
  // a prévia dentro da ficha
  await quente.getByRole('button', { name: 'Ver etiqueta' }).click();
  await expect(quente.locator('.etiqueta-label')).toContainText('REFRIGERADO · PISTA QUENTE');
  await expect(quente.locator('.etiqueta-label')).toContainText(/02\/11\/2026 - 18:3\d/);
  await ficha.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // a tela de imprimir mostra os prazos com o estado
  await abrir(page, '/');
  await entrarComo(page, 'Maria');
  await expect(page.locator('main')).toContainText('Refrigerado · Pista quente 4h');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Molho de tomate da casa' }).click();
  const janela = page.getByRole('dialog');
  const metodo = janela.getByLabel(/^Método de conservação/);
  // abre no principal: 3 dias, sem hora
  await expect(metodo).toHaveValue('m:refrigerado');
  await expect(janela.getByText(/Vencimento na etiqueta:/)).toContainText(/05\/11\/2026$/);
  // ⚠️ 03/11/2026: só os métodos cadastrados no item, com prazo — nada de
  // "Outro armazenamento" — e a data e os dias não se mudam na impressão
  await expect(metodo.locator('option')).toHaveCount(3);
  await expect(metodo.locator('optgroup')).toHaveCount(0);
  await expect(janela.getByLabel('Dias', { exact: true })).toHaveCount(0);
  await expect(janela.getByLabel('Horas', { exact: true })).toHaveCount(0);
  await expect(janela.getByLabel(/^Data de manipulação/)).toHaveCount(0);
  // troca para a pista quente: 4 h, com a hora certa
  await metodo.selectOption('m:m3');
  await expect(metodo.locator('option:checked')).toContainText('Pista quente');
  await expect(metodo.locator('option:checked')).toContainText('4 h');
  await expect(janela.getByText(/Vencimento na etiqueta:/)).toContainText(/02\/11\/2026 - 18:3\d/);
  await expect(janela.locator('.etiqueta-label').first()).toContainText('REFRIGERADO · PISTA QUENTE');
  await janela.getByRole('button', { name: /^Imprimir \d+ etiqueta/ }).click();
  await janela.getByRole('button', { name: 'Sim', exact: true }).click();
  await continuarImprimindo(page);

  // na lista de impressas, com a hora da validade e o estado
  await abrir(page, '/impressas');
  await expect(page.locator('main')).toContainText(/Validade 02\/11\/2026 18:3\d · Pista quente/);
  // e a reimpressão sai igual
  await page.getByRole('button', { name: 'Reimprimir etiqueta de Molho de tomate da casa' }).first().click();
  await expect(page.getByRole('dialog').locator('.etiqueta-label').first()).toContainText(/02\/11\/2026 - 18:3\d/);
  await expect(page.getByRole('dialog').locator('.etiqueta-label').first()).toContainText('PISTA QUENTE');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Etiquetas: a casa cria o estado em Administração e ele aparece na ficha', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/administracao/etiqueta');
  await expect(page.getByRole('heading', { name: 'Estados de conservação' })).toBeVisible();
  await page.getByLabel('Nome do novo estado').fill('Buffet');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).last().click();
  await expect(page.getByLabel('Nome do estado Buffet')).toBeVisible();
  await abrir(page, '/itens');
  await page.getByRole('button', { name: /^Frango desfiado/ }).click();
  await expect(page.getByRole('dialog').getByRole('group', { name: 'Método principal' })
    .getByLabel('Estado (opcional)').locator('option', { hasText: 'Buffet' })).toHaveCount(1);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Estoque Seco: salvar a ficha não troca o pote aberto para congelado', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Cozinha Pro', /^Estoque Seco/);
  await abrir(page, '/itens');
  await page.getByRole('button', { name: /^Extrato de tomate \(340g\)/ }).click();
  const ficha = page.getByRole('dialog');
  // o aberto fica em ambiente; o "congelado" é o prazo da embalagem fechada
  await expect(ficha.getByRole('group', { name: 'Método principal' }).getByLabel('Armazenamento')).toHaveValue('ambiente');
  await expect(ficha.getByRole('group', { name: 'Método 2' }).getByLabel('Dias')).toHaveValue('540');
  await ficha.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await abrir(page, '/etiquetas');
  await entrarComo(page, 'Maria');
  await page.getByRole('button', { name: 'Imprimir etiqueta de Extrato de tomate (340g)' }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.locator('.etiqueta-label').first()).toContainText('TEMPERATURA AMBIENTE');
  // sem prazo depois de aberto: a sugestão de 3 dias, explicada — e fixa
  // (depois de salvar a ficha o ambiente virou método: m:<id>, sem prazo)
  const metodo = janela.getByLabel(/^Método de conservação/);
  await expect(metodo.locator('option:checked')).toContainText(/ambiente/i);
  await expect(metodo.locator('option:checked')).toContainText('3 dias (sugestão)');
  await expect(janela.getByText(/Sem prazo cadastrado para depois de aberto/)).toBeVisible();
  await expect(janela.getByLabel('Dias', { exact: true })).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

// ── Parte 2: grupos da casa (03/11/2026) ──
test('Etiquetas: a casa cria o grupo, põe o item em dois grupos e filtra na hora de imprimir', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/itens');
  await page.getByRole('button', { name: 'Organizar grupos' }).click();
  let janela = page.getByRole('dialog');
  await janela.getByLabel('Nome do novo grupo').fill('Almoço de funcionários');
  await janela.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(janela.getByText('ALMOÇO DE FUNCIONÁRIOS', { exact: true })).toBeVisible();
  // BOVINOS só tem a picanha: não dá para apagar
  await janela.getByRole('button', { name: 'Remover o grupo BOVINOS' }).click();
  await expect(page.getByText(/1 item só está no grupo "BOVINOS"/)).toBeVisible();
  await janela.getByRole('button', { name: 'Pronto' }).click();

  // o frango vai também para o almoço
  await page.getByRole('button', { name: /^Frango desfiado/ }).click();
  const ficha = page.getByRole('dialog');
  await ficha.getByRole('button', { name: 'Escolher grupos' }).click();
  const almoco = ficha.getByRole('button', { name: 'ALMOÇO DE FUNCIONÁRIOS' });
  await expect(almoco).toHaveAttribute('aria-pressed', 'false');
  await almoco.click();
  await expect(almoco).toHaveAttribute('aria-pressed', 'true');
  await expect(ficha.getByLabel('Grupo principal')).toHaveValue('AVES');
  await ficha.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('também em ALMOÇO DE FUNCIONÁRIOS');

  // na tela de imprimir, o botão do grupo filtra; a busca acha pelo grupo
  await abrir(page, '/');
  await entrarComo(page, 'Maria');
  const filtros = page.getByRole('group', { name: 'Grupo' });
  await filtros.getByRole('button', { name: 'ALMOÇO DE FUNCIONÁRIOS' }).click();
  await expect(page.getByRole('button', { name: 'Imprimir etiqueta de Frango desfiado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimir etiqueta de Picanha (porção)' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'ALMOÇO DE FUNCIONÁRIOS' })).toBeVisible();
  await filtros.getByRole('button', { name: 'Todos' }).click();
  await expect(page.getByRole('button', { name: 'Imprimir etiqueta de Picanha (porção)' })).toBeVisible();

  // renomear troca no item também
  await abrir(page, '/itens');
  await page.getByRole('button', { name: 'Organizar grupos' }).click();
  janela = page.getByRole('dialog');
  await janela.getByRole('button', { name: 'Renomear o grupo ALMOÇO DE FUNCIONÁRIOS' }).click();
  await janela.getByLabel('Novo nome do grupo ALMOÇO DE FUNCIONÁRIOS').fill('Almoço da equipe');
  await janela.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(janela.getByText('ALMOÇO DA EQUIPE', { exact: true })).toBeVisible();
  // e sobe para o topo da lista
  for (let i = 0; i < 20; i++) {
    const subir = janela.getByRole('button', { name: 'Subir o grupo ALMOÇO DA EQUIPE' });
    if (await subir.isDisabled()) break;
    await subir.click();
  }
  await janela.getByRole('button', { name: 'Pronto' }).click();
  await expect(page.locator('main')).toContainText('também em ALMOÇO DA EQUIPE');
  expect(erros, erros.join('\n')).toEqual([]);
});

// ── 03/11/2026: na impressão só se preenche quantidade, medida e lote ──
test('Etiquetas: item com um método só mostra o método escrito, sem lista para escolher', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page, 'Maria');
  // o queijo só tem refrigerado cadastrado: não aparece congelado nem ambiente
  await page.getByRole('button', { name: 'Imprimir etiqueta de Queijo mussarela' }).click();
  const janela = page.getByRole('dialog');
  await expect(janela.getByRole('combobox')).toHaveCount(0);
  await expect(janela.getByText(/^Método de conservação/)).toBeVisible();
  await expect(janela).toContainText(/Refrigerado.* · 3 dias/);
  // o que se preenche: quantidade, medida e lote
  await expect(janela.getByLabel(/^Medida/)).toBeVisible();
  await expect(janela.getByLabel('Lote do fabricante')).toBeVisible();
  await expect(janela.getByLabel('Dias', { exact: true })).toHaveCount(0);
  await expect(janela.getByLabel(/^Data de/)).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});
