import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo, comVozDeMentira, falar } from './apoio';

// =====================================================================
//  REGISTRO DE DESPERDÍCIO (24/11/2026, pedido do dono): o checklist do
//  Magurō dentro do Aurum Etiquetas, com a mesma base (itens, equipe).
//  • Etiquetas | Desperdício: botões no topo; a mesma pessoa vale nas duas;
//  • quantidade (kg/unid) e motivo; data, hora, turno e responsável sozinhos;
//  • "Registrar outro desperdício?" como o "Continuar imprimindo?";
//  • relatório só na Administração: soma por item, um por um, corrigir
//    (guarda o original), fora da lista → Cadastrar, apagar o período.
//  • (M66) gramas; o "Alterar" de quem anotou errado; a voz entende item,
//    quanto e motivo; a planilha baixada é ABERTA e conferida.
//  • (24/11, noite) o peso COMO NA BALANÇA: os números entram pela direita
//    (o robô digita "1500" para 1,5 kg); só kg e unid; o app mostra "300 g"
//    sozinho; sem o botão "Item fora da lista" (a busca faz); por turno e
//    por pessoa no relatório.
//  (o banco — a mesma regra — confere em scripts/pentest-desperdicio.mjs)
// =====================================================================

// `qtd` em kg vai como na balança: "1500" é 1,500 kg
async function registrar(page, { item, livre = false, qtd, unidade = 'kg', motivo, outro = '' }) {
  if (livre) {
    // o item fora da lista sai da busca (o botão do topo saiu em 24/11/2026)
    await page.getByLabel('Buscar item para descartar').fill(item);
    await page.getByRole('button', { name: `Registrar “${item}” assim mesmo` }).click();
  } else await page.getByRole('button', { name: `Descartar ${item}` }).click();
  const janela = page.getByRole('dialog', { name: livre ? 'Item fora da lista' : item });
  await expect(janela).toBeVisible();
  if (livre) await expect(janela.getByLabel('Item', { exact: true })).toHaveValue(item);
  if (unidade !== 'kg') await janela.getByRole('radio', { name: unidade, exact: true }).click();
  await janela.getByLabel('Quantidade descartada').fill(qtd);
  if (motivo) await janela.getByRole('radio', { name: motivo, exact: true }).click();
  if (outro) await janela.getByLabel('Outro motivo').fill(outro);
  await janela.getByRole('button', { name: /^Registrar descarte · / }).click();
  const pergunta = page.getByRole('dialog', { name: /^Registrar outro desperdício/ });
  await expect(pergunta).toBeVisible();
  await pergunta.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('Etiquetas | Desperdício no topo: a mesma pessoa, o registro e o "Registrar outro?"', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await entrarComo(page);
  const troca = page.getByRole('navigation', { name: 'Etiquetas ou desperdício' });
  await expect(troca.getByRole('link', { name: 'Etiquetas' })).toHaveAttribute('aria-current', 'page');
  await troca.getByRole('link', { name: 'Desperdício' }).click();
  await expect(page.getByRole('heading', { name: 'Desperdício', level: 1 })).toBeVisible();
  // a mesma pessoa, sem a senha de novo; a aba Imprimir continua acesa
  await expect(page.getByText(/Registrando como Maria/)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Imprimir' }))
    .toHaveClass(/text-polo-gold/);

  await page.getByRole('button', { name: 'Descartar Frango desfiado' }).click();
  const janela = page.getByRole('dialog', { name: 'Frango desfiado' });
  // data, hora, turno e responsável saem sozinhos
  for (const r of ['Data', 'Hora', 'Turno', 'Responsável']) await expect(janela.getByText(r, { exact: true })).toBeVisible();
  await expect(janela.getByText(/^(Manhã|Noite)$/)).toBeVisible();
  // sem quantidade e motivo, diz o que falta
  await janela.getByRole('button', { name: 'Registrar descarte', exact: true }).click();
  await expect(janela.getByRole('alert')).toContainText('A quantidade precisa ser maior que zero.');
  await janela.getByLabel('Quantidade descartada').fill('1500');
  await expect(janela.getByLabel('Quantidade descartada')).toHaveValue('1,500');
  await janela.getByRole('button', { name: 'Registrar descarte · 1,5 kg' }).click();
  await expect(janela.getByRole('alert')).toContainText('Falta o motivo do descarte.');
  await janela.getByRole('radio', { name: 'Vencido', exact: true }).click();
  await janela.getByRole('button', { name: 'Registrar descarte · 1,5 kg' }).click();
  await expect(page.getByText('Descarte registrado: Frango desfiado · 1,5 kg')).toBeVisible();
  const pergunta = page.getByRole('dialog', { name: 'Registrar outro desperdício, Maria?' });
  await expect(pergunta).toBeVisible();
  await pergunta.getByRole('button', { name: 'Continuar', exact: true }).click();
  // e volta para as etiquetas pelo mesmo topo, ainda com a Maria
  await troca.getByRole('link', { name: 'Etiquetas' }).click();
  await expect(page.getByText(/Imprimindo como Maria/)).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Administração: o relatório soma, corrige guardando o original, manda cadastrar o de fora da lista e apaga', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/desperdicio');
  await entrarComo(page);
  await registrar(page, { item: 'Frango desfiado', qtd: '1500', motivo: 'Vencido' });
  await registrar(page, { item: 'Frango desfiado', qtd: '500', motivo: 'Queimado' });
  await registrar(page, { item: 'Molho shoyu', livre: true, qtd: '2', unidade: 'unid', outro: 'Embalagem furada' });

  await abrir(page, '/administracao'); // o robô digita 1234
  await page.getByRole('link', { name: /^Relatório de desperdício/ }).click();
  await expect(page.getByRole('heading', { name: 'Relatório de desperdício', level: 1 })).toBeVisible();
  const lista = page.getByRole('main').getByRole('list').last();
  const frango = lista.getByRole('listitem').filter({ hasText: 'Frango desfiado' });
  await expect(frango).toContainText('2 kg');
  await expect(frango).toContainText('2×');
  await expect(frango).toContainText('Vencido (1,5 kg)');
  const fora = page.getByRole('region', { name: 'Registrados fora da lista' });
  await expect(fora).toContainText('Molho shoyu');

  // um por um: corrigir guarda como a pessoa registrou
  await page.getByRole('button', { name: 'Um por um', exact: true }).click();
  await page.getByRole('button', { name: 'Corrigir o registro de Molho shoyu' }).click();
  const corrigir = page.getByRole('dialog', { name: 'Corrigir registro' });
  await corrigir.getByLabel('Quantidade', { exact: true }).fill('3');
  await corrigir.getByRole('button', { name: 'Salvar correção' }).click();
  await expect(page.getByText('Corrigido', { exact: true })).toBeVisible();
  await expect(page.getByText('antes: Molho shoyu · 2 unid · Embalagem furada')).toBeVisible();

  // fora da lista → Cadastrar abre Meus itens com o nome
  await fora.getByRole('button', { name: 'Cadastrar' }).click();
  const novo = page.getByRole('dialog', { name: 'Novo item' });
  await expect(novo).toBeVisible();
  await expect(novo.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Molho shoyu');
  await page.keyboard.press('Escape');

  // apagar todos do período
  await abrir(page, '/relatorio-desperdicio');
  await page.getByRole('button', { name: 'Apagar todos deste período' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar todos' }).click();
  await expect(page.getByText('Nenhum descarte neste período.')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Administração → Desperdício: o motivo novo vira botão no registro', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/administracao/desperdicio');
  await page.getByLabel('Novo motivo').fill('Validade curta');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('Validade curta', { exact: true })).toBeVisible();
  await abrir(page, '/desperdicio');
  await entrarComo(page);
  await page.getByRole('button', { name: 'Descartar Frango desfiado' }).click();
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Validade curta' })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('gramas e o "Alterar": quem anotou errado corrige na hora, até o item; o relatório mostra', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/desperdicio');
  await entrarComo(page);
  await page.getByRole('button', { name: 'Descartar Frango desfiado' }).click();
  let janela = page.getByRole('dialog', { name: 'Frango desfiado' });
  // ⚠️ só kg e unid: 300 na balança é 0,300 kg, e o app mostra "300 g"
  await expect(janela.getByRole('radio', { name: 'g', exact: true })).toHaveCount(0);
  await janela.getByLabel('Quantidade descartada').fill('300');
  await janela.getByRole('radio', { name: 'Vencido', exact: true }).click();
  await janela.getByRole('button', { name: 'Registrar descarte · 300 g' }).click();
  // o "Registrar outro?" tem o Alterar (tocar nele para a contagem)
  await page.getByRole('dialog', { name: 'Registrar outro desperdício, Maria?' })
    .getByRole('button', { name: 'Alterar o registro' }).click();
  janela = page.getByRole('dialog', { name: 'Alterar registro' });
  await expect(janela.getByLabel('Quantidade descartada')).toHaveValue('0,300');
  await expect(janela.getByRole('radio', { name: 'kg', exact: true })).toHaveAttribute('aria-checked', 'true');
  await janela.getByLabel('Quantidade descartada').fill('350');
  await janela.getByRole('radio', { name: 'Queimado', exact: true }).click();
  await janela.getByRole('button', { name: 'Salvar alteração · 350 g' }).click();
  await expect(page.getByText('Alterado: Frango desfiado · 350 g')).toBeVisible();
  await page.getByRole('dialog', { name: 'Registrar outro desperdício, Maria?' })
    .getByRole('button', { name: 'Continuar', exact: true }).click();

  // depois do "Continuar", o último registro fica com o Alterar; dá para trocar até o item
  await expect(page.getByText('Frango desfiado · 350 g · Queimado')).toBeVisible();
  await page.getByRole('button', { name: 'Alterar o registro de Frango desfiado' }).click();
  janela = page.getByRole('dialog', { name: 'Alterar registro' });
  await janela.getByRole('button', { name: 'Trocar item' }).click();
  await janela.getByLabel('Qual é o item certo?').fill('queijo');
  await janela.getByRole('button', { name: 'Queijo mussarela', exact: true }).click();
  await janela.getByRole('button', { name: 'Salvar alteração · 350 g' }).click();
  await page.getByRole('dialog', { name: 'Registrar outro desperdício, Maria?' })
    .getByRole('button', { name: 'Continuar', exact: true }).click();
  // mais 1 kg do mesmo item: a soma junta
  await registrar(page, { item: 'Queijo mussarela', qtd: '1000', motivo: 'Vencido' });

  await abrir(page, '/administracao'); // o robô digita 1234
  await page.getByRole('link', { name: /^Relatório de desperdício/ }).click();
  const lista = page.getByRole('main').getByRole('list').last();
  await expect(lista.getByRole('listitem').filter({ hasText: 'Queijo mussarela' })).toContainText('1,35 kg');
  await page.getByRole('button', { name: 'Um por um', exact: true }).click();
  await expect(page.getByText('Alterado na hora', { exact: true })).toBeVisible();
  await expect(page.getByText('antes: Frango desfiado · 300 g · Vencido')).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('Relatório: a planilha baixada abre com as 6 abas (turno e pessoa também) e os números certos; Imprimir imprime', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/desperdicio');
  await entrarComo(page);
  await registrar(page, { item: 'Frango desfiado', qtd: '1500', motivo: 'Vencido' });
  await registrar(page, { item: 'Frango desfiado', qtd: '250', motivo: 'Vencido' });
  await registrar(page, { item: 'Picanha (porção)', qtd: '2', unidade: 'unid', motivo: 'Queimado' });
  await abrir(page, '/administracao');
  await page.getByRole('link', { name: /^Relatório de desperdício/ }).click();
  const lista = page.getByRole('main').getByRole('list').last();
  await expect(lista.getByRole('listitem').filter({ hasText: 'Frango desfiado' })).toContainText('1,75 kg');
  await page.getByRole('button', { name: 'Por grupo', exact: true }).click();
  await expect(lista.getByRole('listitem').filter({ hasText: 'AVES' })).toContainText('1,75 kg');
  await page.getByRole('button', { name: 'Por motivo', exact: true }).click();
  await expect(lista.getByRole('listitem').filter({ hasText: 'Vencido' })).toContainText('1,75 kg');
  // por turno e por pessoa (pedido do dono): peso e unidades juntos
  await page.getByRole('button', { name: 'Por turno', exact: true }).click();
  await expect(lista.getByRole('listitem').filter({ hasText: /Manhã|Noite/ })).toContainText('1,75 kg + 2 unid');
  await page.getByRole('button', { name: 'Por pessoa', exact: true }).click();
  await expect(lista.getByRole('listitem').filter({ hasText: 'Maria' })).toContainText('1,75 kg + 2 unid');

  // a planilha: baixa, abre e confere aba por aba
  const [baixada] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Planilha' }).click()]);
  expect(baixada.suggestedFilename()).toMatch(/^desperdicio_\d{4}-\d{2}-\d{2}_a_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const XLSX = await import('xlsx');
  const wb = XLSX.read(readFileSync(await baixada.path()));
  expect(wb.SheetNames).toEqual(['Soma por item', 'Por grupo', 'Por turno', 'Por pessoa', 'Por motivo', 'Um por um']);
  const aba = (nome) => XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '', blankrows: false });
  const soma = aba('Soma por item');
  const topo = soma.findIndex(l => l[0] === 'Item');
  expect(soma[topo]).toEqual(['Item', 'Total', 'Unidade', 'Vezes', 'Motivos']);
  expect(soma.slice(topo + 1)).toEqual([
    ['Frango desfiado', 1.75, 'kg', 2, 'Vencido (1,75 kg)'],
    ['Picanha (porção)', 2, 'unid', 1, 'Queimado (2 unid)'],
  ]);
  expect(aba('Por motivo')).toEqual([['Motivo', 'Total (kg)'], ['Vencido', 1.75]]);
  expect(aba('Por pessoa')).toEqual([['Pessoa', 'Peso (kg)', 'Unidades', 'Vezes'], ['Maria', 1.75, 2, 3]]);
  const turnos = aba('Por turno');
  expect(turnos[0]).toEqual(['Turno', 'Peso (kg)', 'Unidades', 'Vezes']);
  expect(turnos.slice(1).reduce((s, l) => s + l[3], 0)).toBe(3);
  const umPorUm = aba('Um por um');
  expect(umPorUm[0]).toEqual(['Data', 'Hora', 'Turno', 'Item', 'Quantidade', 'Unidade', 'Peso (kg)', 'Motivo', 'Responsável', 'Mudou depois']);
  expect(umPorUm.slice(1).map(l => l.slice(3, 9))).toEqual([
    ['Picanha (porção)', 2, 'unid', '', 'Queimado', 'Maria'],
    ['Frango desfiado', 0.25, 'kg', 0.25, 'Vencido', 'Maria'],
    ['Frango desfiado', 1.5, 'kg', 1.5, 'Vencido', 'Maria'],
  ]);

  // Imprimir chama a impressão do navegador
  await page.evaluate(() => { window.__imprimiu = 0; window.print = () => { window.__imprimiu += 1; }; });
  await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
  expect(await page.evaluate(() => window.__imprimiu)).toBe(1);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('voz: "300 gramas de frango desfiado vencido" abre a janela preenchida; o motivo também por voz', async ({ page }) => {
  await comVozDeMentira(page);
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/desperdicio');
  await entrarComo(page);
  await falar(page, { textos: ['300 gramas de frango desfiado vencido'] });
  await page.getByRole('button', { name: 'Buscar falando' }).click();
  const janela = page.getByRole('dialog', { name: 'Frango desfiado' });
  await expect(janela.getByLabel('Quantidade descartada')).toHaveValue('0,300');
  await expect(janela.getByRole('radio', { name: 'kg', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(janela.getByRole('radio', { name: 'Vencido', exact: true })).toHaveAttribute('aria-checked', 'true');
  // o microfone do motivo: o botão que combina...
  await falar(page, { textos: ['caiu no chão'] });
  await janela.getByRole('button', { name: 'Falar o motivo' }).click();
  await expect(janela.getByRole('radio', { name: 'Caiu no chão', exact: true })).toHaveAttribute('aria-checked', 'true');
  // ...ou o que foi dito, escrito
  await falar(page, { textos: ['cheiro estranho'] });
  await janela.getByRole('button', { name: 'Falar o motivo' }).click();
  await expect(janela.getByLabel('Outro motivo')).toHaveValue('Cheiro estranho');
  await janela.getByRole('button', { name: 'Registrar descarte · 300 g' }).click();
  await page.getByRole('dialog', { name: /^Registrar outro desperdício/ }).getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Frango desfiado · 300 g · Cheiro estranho')).toBeVisible();

  // o que não está na lista: o que foi falado vira o item, com a quantidade
  await falar(page, { textos: ['lasanha bolonhesa 2 kg'] });
  await page.getByRole('button', { name: 'Buscar falando' }).click();
  await page.getByRole('button', { name: 'Registrar “Lasanha bolonhesa” fora da lista' }).click();
  const livre = page.getByRole('dialog', { name: 'Item fora da lista' });
  await expect(livre.getByLabel('Item', { exact: true })).toHaveValue('Lasanha bolonhesa');
  await expect(livre.getByLabel('Quantidade descartada')).toHaveValue('2,000');
  expect(erros, erros.join('\n')).toEqual([]);
});

test('o "Alterar" é só de quem registrou: voltou pelo nome, ainda está lá; outra pessoa não vê', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/desperdicio');
  await entrarComo(page);
  await page.getByRole('button', { name: 'Descartar Queijo mussarela' }).click();
  const janela = page.getByRole('dialog', { name: 'Queijo mussarela' });
  await janela.getByLabel('Quantidade descartada').fill('2000');
  await janela.getByRole('radio', { name: 'Vencido', exact: true }).click();
  await janela.getByRole('button', { name: 'Registrar descarte · 2 kg' }).click();
  await page.getByRole('dialog', { name: 'Registrar outro desperdício, Maria?' })
    .getByRole('button', { name: 'Trocar pessoa' }).click();
  // o João não vê o "Alterar" da Maria
  await entrarComo(page, 'João');
  await expect(page.getByText(/Registrando como João/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alterar o registro de Queijo mussarela' })).toHaveCount(0);
  // a Maria volta pelo nome e o encontra
  await page.getByRole('button', { name: 'Trocar', exact: true }).click();
  await entrarComo(page, 'Maria');
  await expect(page.getByRole('button', { name: 'Alterar o registro de Queijo mussarela' })).toBeVisible();
  expect(erros, erros.join('\n')).toEqual([]);
});

test('sem equipe cadastrada, o desperdício pede o responsável, e lembra para a próxima', async ({ page }) => {
  const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
  await abrir(page, '/administracao/equipe'); // o robô digita 1234
  for (const nome of ['João', 'Maria']) {
    await page.getByRole('button', { name: `Remover ${nome}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover', exact: true }).click();
    await expect(page.getByRole('button', { name: `Remover ${nome}` })).toHaveCount(0);
  }
  await abrir(page, '/desperdicio');
  await page.getByRole('button', { name: 'Descartar Frango desfiado' }).click();
  const janela = page.getByRole('dialog', { name: 'Frango desfiado' });
  await janela.getByLabel('Quantidade descartada').fill('1500');
  await janela.getByRole('radio', { name: 'Vencido', exact: true }).click();
  // vem com o último nome lembrado (a demo lembra a Maria); sem nome, não registra
  const nome = janela.getByLabel('Responsável', { exact: true });
  await expect(nome).toHaveValue('Maria');
  await nome.fill('');
  await janela.getByRole('button', { name: 'Registrar descarte · 1,5 kg' }).click();
  await expect(janela.getByRole('alert')).toContainText('Falta o responsável.');
  await nome.fill('Carla');
  await janela.getByRole('button', { name: 'Registrar descarte · 1,5 kg' }).click();
  await expect(page.getByText('Frango desfiado · 1,5 kg · Vencido')).toBeVisible();
  // a próxima já vem com o nome
  await page.getByRole('button', { name: 'Descartar Queijo mussarela' }).click();
  await expect(page.getByRole('dialog', { name: 'Queijo mussarela' }).getByLabel('Responsável', { exact: true })).toHaveValue('Carla');
  expect(erros, erros.join('\n')).toEqual([]);
});

test.describe('no celular, com o dedo', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('o teclado da balança: 1-5-0-0 é 1,500 kg; 2 e 000 é 2,000; abaixo de 1 kg mostra os gramas', async ({ page }) => {
    const erros = await entrarNaDemo(page, 'Aurum Etiquetas');
    await abrir(page, '/desperdicio');
    await entrarComo(page);
    await page.getByRole('button', { name: 'Descartar Frango desfiado' }).click();
    const janela = page.getByRole('dialog', { name: 'Frango desfiado' });
    const teclado = page.getByRole('dialog', { name: 'Quantidade — Frango desfiado' });
    const tocar = async (...teclas) => { for (const t of teclas) await teclado.getByRole('button', { name: t, exact: true }).click(); };
    await janela.getByLabel('Quantidade descartada').click();
    // sem vírgula: no lugar dela, o 000
    await expect(teclado.getByRole('button', { name: 'Vírgula' })).toHaveCount(0);
    await tocar('1', '5', '0', '0');
    await expect(teclado.getByLabel('Valor: 1,500 kg')).toBeVisible();
    await tocar('OK');
    await expect(janela.getByRole('button', { name: 'Registrar descarte · 1,5 kg' })).toBeVisible();
    await janela.getByLabel('Quantidade descartada').click();
    await tocar('2', 'Três zeros');
    await expect(teclado.getByLabel('Valor: 2,000 kg')).toBeVisible();
    await tocar('Apagar', 'Apagar', 'Apagar', '5', '0');
    // 0,250 kg: embaixo, quanto é em gramas
    await expect(teclado.getByText('= 250 g')).toBeVisible();
    await tocar('OK');
    await expect(janela.getByRole('button', { name: 'Registrar descarte · 250 g' })).toBeVisible();
    expect(erros, erros.join('\n')).toEqual([]);
  });
});
