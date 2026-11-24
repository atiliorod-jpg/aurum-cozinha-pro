import { test, expect } from '@playwright/test';
import { entrarNaDemo, abrir, entrarComo } from './apoio';

// =====================================================================
//  REGISTRO DE DESPERDÍCIO (24/11/2026, pedido do dono): o checklist do
//  Magurō dentro do Aurum Etiquetas, com a mesma base (itens, equipe).
//  • Etiquetas | Desperdício: botões no topo; a mesma pessoa vale nas duas;
//  • quantidade (kg/unid) e motivo; data, hora, turno e responsável sozinhos;
//  • "Registrar outro desperdício?" como o "Continuar imprimindo?";
//  • relatório só na Administração: soma por item, um por um, corrigir
//    (guarda o original), fora da lista → Cadastrar, apagar o período.
//  (o banco — a mesma regra — confere em scripts/pentest-desperdicio.mjs)
// =====================================================================

async function registrar(page, { item, livre = false, qtd, unidade = 'kg', motivo, outro = '' }) {
  if (livre) await page.getByRole('button', { name: 'Item fora da lista' }).click();
  else await page.getByRole('button', { name: `Descartar ${item}` }).click();
  const janela = page.getByRole('dialog', { name: livre ? 'Item fora da lista' : item });
  await expect(janela).toBeVisible();
  if (livre) await janela.getByLabel('Item', { exact: true }).fill(item);
  if (unidade === 'unid') await janela.getByRole('radio', { name: 'unid', exact: true }).click();
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
  await janela.getByLabel('Quantidade descartada').fill('1.5');
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
  await registrar(page, { item: 'Frango desfiado', qtd: '1.5', motivo: 'Vencido' });
  await registrar(page, { item: 'Frango desfiado', qtd: '0.5', motivo: 'Queimado' });
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
