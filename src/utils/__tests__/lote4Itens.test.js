import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { controlaEstoque, ativoNoEstoque, controlaPorPadrao, normalizarUnidade } from '../itens';
import { colunasDoModelo, linhaDoItem, lerPlanilhaDeItens, mesclarItens, idDoNome } from '../planilhaItens';
import { listaDeCompras, previsaoRuptura } from '../analise';
import { lotesVencendo } from '../lotes';
import { produtosDivergentes } from '../sugestoes';
import { valorDoEstoque } from '../financeiro';
import { prazosDoProduto } from '../armazenamento';

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// =====================================================================
//  LOTE 4 DA AUDITORIA (14/10/2026) — um lugar para cada coisa.
//  Item "só etiqueta", a planilha dentro de Meus itens, e a Administração
//  em cinco grupos no lugar de Configurações + Ajustes.
// =====================================================================

describe('só etiqueta — a regra', () => {
  it('item com data de abertura nasce só etiqueta; manipulado controla', () => {
    expect(controlaEstoque({ tipoData: 'abertura' })).toBe(false);
    expect(controlaEstoque({ tipoData: 'fabricacao' })).toBe(true);
    expect(controlaEstoque({})).toBe(true); // o catálogo antigo não tinha tipoData
  });

  it('a escolha gravada na ficha vence a regra, nos dois sentidos', () => {
    expect(controlaEstoque({ tipoData: 'abertura', controlaEstoque: true })).toBe(true);
    expect(controlaEstoque({ tipoData: 'fabricacao', controlaEstoque: false })).toBe(false);
  });

  it('nas listas de estoque só entra o ativo que controla', () => {
    expect(ativoNoEstoque({ ativo: true })).toBe(true);
    expect(ativoNoEstoque({ ativo: false })).toBe(false);
    expect(ativoNoEstoque({ ativo: true, tipoData: 'abertura' })).toBe(false);
    expect(ativoNoEstoque(null)).toBe(false);
  });

  it('o padrão do item NOVO: no Seco tudo controla (a etiqueta de lá é sempre de abertura)', () => {
    expect(controlaPorPadrao('abertura')).toBe(false);
    expect(controlaPorPadrao('fabricacao')).toBe(true);
    expect(controlaPorPadrao('abertura', true)).toBe(true);
  });
});

describe('só etiqueta — some das contas do estoque', () => {
  const P = (id, extra = {}) => ({ id, nome: id, unidade: 'kg', ativo: true, min: 5, max: 10, ...extra });
  const leite = P('leite', { tipoData: 'abertura' });
  const file = P('file');
  const estoque = { leite: 1, file: 1 };

  it('lista de compras e ruptura', () => {
    expect(listaDeCompras([leite, file], estoque).map(x => x.p.id)).toEqual(['file']);
    expect(previsaoRuptura([leite, file], estoque, { leite: 1, file: 1 }).map(x => x.p.id)).toEqual(['file']);
  });

  it('lotes vencendo, mín/máx divergente e valor parado', () => {
    const lotes = { leite: [{ validade: '2026-10-15', restante: 1 }], file: [{ validade: '2026-10-15', restante: 1 }] };
    const vencendo = lotesVencendo(lotes, [leite, file], estoque, () => 1);
    expect(vencendo.map(x => x.p.id)).toEqual(['file']);
    const sug = { leite: { min: 1, max: 2 }, file: { min: 1, max: 2 } };
    expect(produtosDivergentes([leite, file], sug).map(p => p.id)).toEqual(['file']);
    const precos = { leite: { custo: 10, unidade: 'kg' }, file: { custo: 10, unidade: 'kg' } };
    expect(valorDoEstoque([leite, file], estoque, precos).itens.map(i => i.id)).toEqual(['file']);
  });

  it('as telas de estoque filtram com a regra — e a gravação continua com a lista inteira', () => {
    for (const tela of ['Entradas', 'Saidas', 'Inventario', 'Relatorio', 'Validades']) {
      expect(ler(`../../pages/${tela}.jsx`), tela).toMatch(/ativoNoEstoque/);
    }
    const dash = ler('../../pages/Dashboard.jsx');
    expect(dash).toMatch(/const produtosAtivos = produtos\.filter\(ativoNoEstoque\);/);
    // aplicar a sugestão de mín/máx grava sobre `produtos`, nunca sobre o filtro
    expect(dash).toMatch(/const next = produtos\.map\(p => \{/);
    expect(ler('../../components/NavBar.jsx')).toMatch(/if \(!ativoNoEstoque\(p\)\) return false;/);
  });
});

describe('unidade com grafia única', () => {
  it('as grafias comuns viram kg, g, L, mL e unid', () => {
    expect(['Kg', 'KG', 'quilo'].map(normalizarUnidade)).toEqual(['kg', 'kg', 'kg']);
    expect(['un', 'UND', 'unidade', 'Unid.'].map(normalizarUnidade)).toEqual(['unid', 'unid', 'unid', 'unid']);
    expect(['l', 'litros', 'ml'].map(normalizarUnidade)).toEqual(['L', 'L', 'mL']);
  });
  it('o que não é conhecido fica como foi digitado; vazio vira unid', () => {
    expect(normalizarUnidade('maço')).toBe('maço');
    expect(normalizarUnidade('  ')).toBe('unid');
  });
});

describe('planilha de itens', () => {
  const armaz = [
    { id: 'congelado', nome: 'Congelado' }, { id: 'refrigerado', nome: 'Refrigerado' },
    { id: 'resfriado', nome: 'Resfriado' }, { id: 'ambiente', nome: 'Temperatura ambiente' },
  ];

  it('o modelo do plano Etiquetas não pergunta estoque; o do Pro pergunta', () => {
    const etq = colunasDoModelo({ armazenamentos: armaz }).map(c => c.t);
    const pro = colunasDoModelo({ armazenamentos: armaz, comEstoque: true }).map(c => c.t);
    expect(etq).not.toContain('Mínimo');
    expect(etq).toContain('Prazo Temperatura ambiente (dias)');
    expect(pro).toEqual(expect.arrayContaining(['Controla estoque (sim/não)', 'Mínimo', 'Máximo', 'Perda na cocção (%)']));
  });

  it('baixar e importar de volta não muda nada (ida e volta)', () => {
    const cols = colunasDoModelo({ armazenamentos: armaz, comEstoque: true });
    const itens = [
      { id: 'a', nome: 'Azeite', categoria: 'TEMPEROS', unidade: 'L', tipoData: 'abertura', prazos: { ambiente: 30 }, ativo: true, min: 0, max: 0 },
      { id: 'b', nome: 'Picanha', categoria: 'BOVINOS', unidade: 'unid', tipoData: 'fabricacao', prazos: { congelado: 180, refrigerado: 3 }, ativo: true, min: 20, max: 60, pesoUnidade: 180 },
    ];
    const rows = [['título'], cols.map(c => c.g), cols.map(c => c.t), ...itens.map(p => linhaDoItem(p, cols))];
    const { itens: lidos, erro } = lerPlanilhaDeItens(rows, { armazenamentos: armaz });
    expect(erro).toBeNull();
    const r = mesclarItens(itens, lidos, { comEstoque: true });
    expect(r.criados).toBe(0);
    expect(r.atualizados).toBe(2);
    const [az, pi] = r.produtos;
    expect(az.controlaEstoque).toBe(false);
    expect(prazosDoProduto(az).ambiente).toBe(30);
    expect(pi.min).toBe(20);
    expect(prazosDoProduto(pi)).toMatchObject({ congelado: 180, refrigerado: 3 });
  });

  it('coluna que não existe NÃO zera o valor do item', () => {
    const atual = [{ id: 'x', nome: 'Filé', categoria: 'BOVINOS', unidade: 'kg', min: 8, max: 18, ativo: true }];
    const { itens } = lerPlanilhaDeItens([['Nome', 'Marca/Fornecedor'], ['filé', 'Swift']]);
    const r = mesclarItens(atual, itens);
    expect(r.produtos[0]).toMatchObject({ min: 8, max: 18, unidade: 'kg', categoria: 'BOVINOS', marca: 'Swift' });
  });

  it('o prazo vai para `prazos`, o campo que vence na leitura (antes ia para valCongelado e não valia)', () => {
    const atual = [{ id: 'x', nome: 'Molho', prazos: { congelado: 30 }, valCongelado: 30, ativo: true }];
    const { itens } = lerPlanilhaDeItens([['Nome', 'Validade congelado (dias)'], ['Molho', 60]]);
    const r = mesclarItens(atual, itens);
    expect(prazosDoProduto(r.produtos[0]).congelado).toBe(60);
    expect(r.produtos[0].valCongelado).toBe(60);
  });

  it('dois itens com o mesmo nome continuam dois (a mescla antiga apagava um)', () => {
    const atual = [
      { id: 'm1', nome: 'Molho', ativo: true }, { id: 'm2', nome: 'Molho', ativo: true },
      { id: 'z', nome: 'Zimbro', ativo: true },
    ];
    const { itens } = lerPlanilhaDeItens([['Nome', 'Marca'], ['Molho', 'A'], ['Molho', 'B']]);
    const r = mesclarItens(atual, itens);
    expect(r.produtos.map(p => [p.id, p.marca])).toEqual([['m1', 'A'], ['m2', 'B'], ['z', undefined]]);
  });

  it('nome de item removido devolve o item à lista', () => {
    const atual = [{ id: 'x', nome: 'Picanha', ativo: false }];
    const { itens } = lerPlanilhaDeItens([['Nome'], ['PICANHA']]);
    expect(mesclarItens(atual, itens).produtos[0]).toMatchObject({ id: 'x', ativo: true });
  });

  it('item novo: id pelo nome, grupo padrão, e no Pro a escolha de estoque gravada', () => {
    const { itens } = lerPlanilhaDeItens([['Nome', 'Unidade', 'Data na etiqueta (manipulação/abertura)', 'Prazo Temperatura ambiente (dias)'],
      ['Shoyu', 'lt', 'abertura', 90]], { armazenamentos: armaz });
    const r = mesclarItens([{ id: 'item_shoyu', nome: 'Outro', ativo: true }], itens, { comEstoque: true, grupoPadrao: 'TEMPEROS' });
    const novo = r.produtos[1];
    expect(novo).toMatchObject({ id: 'item_shoyu_2', unidade: 'L', categoria: 'TEMPEROS', tipoData: 'abertura', controlaEstoque: false, armazenamentoPadrao: 'ambiente', ativo: true });
    // no Seco o mesmo item nasce controlando estoque
    const seco = mesclarItens([], itens, { comEstoque: true, abertoPorPadrao: true }).produtos[0];
    expect(seco.controlaEstoque).toBe(true);
    // no plano Etiquetas não grava a escolha (a conta não tem estoque)
    expect(mesclarItens([], itens).produtos[0]).not.toHaveProperty('controlaEstoque');
  });

  it('"Congelado" não casa com "Ultracongelado", e sem a coluna Nome a leitura recusa', () => {
    const { itens } = lerPlanilhaDeItens([['Nome', 'Prazo Ultracongelado (dias)'], ['X', 9]], { armazenamentos: armaz });
    expect(itens[0]).not.toHaveProperty('prazosLidos');
    expect(lerPlanilhaDeItens([['Item', 'Grupo'], ['a', 'b']]).erro).toMatch(/coluna "Nome"/);
  });

  it('idDoNome tira acento e evita colisão', () => {
    expect(idDoNome('Pão de Açúcar')).toBe('item_pao_de_acucar');
    expect(idDoNome('Molho', [{ id: 'item_molho' }, { id: 'item_molho_2' }])).toBe('item_molho_3');
  });
});

describe('Administração em cinco grupos', () => {
  const app = ler('../../App.jsx');

  it('Configurações e Ajustes deixaram de existir; os endereços antigos levam para o lugar novo', () => {
    expect(existsSync(new URL('../../pages/Configuracoes.jsx', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../../pages/etiquetas/Ajustes.jsx', import.meta.url))).toBe(false);
    expect(app).toMatch(/<Route path="\/ajustes" {4}element=\{<Navigate to="\/administracao" replace \/>\} \/>/);
    expect(app).toMatch(/\{ produtos: '\/itens', receitas: '\/administracao\/estoque', acessos: '\/administracao\/equipe' \}\[secao\]/);
  });

  it('os mesmos grupos nos dois planos; o Estoque só no Pro', () => {
    const regras = ler('../../store/acessosAdmin.js');
    for (const g of ['casa', 'etiqueta', 'equipe', 'estoque', 'conta']) expect(regras).toMatch(new RegExp(`id: '${g}'`));
    expect(regras).toMatch(/receitas: !soEtiq && /);
    expect(regras).toMatch(/ajustesEstoque: !soEtiq && sistema,/);
  });

  it('o que é da conta dona continua só dela (e o suporte remoto e o "apagar tudo" fecharam no Pro)', () => {
    const regras = ler('../../store/acessosAdmin.js');
    expect(regras).toMatch(/contas: soEtiq \? dono : gerente,/);
    expect(regras).toMatch(/cargos: dono,/);
    expect(regras).toMatch(/suporte: dono,/);
    expect(regras).toMatch(/zonaPerigo: !soEtiq && dono,/);
  });

  it('a planilha mora em Meus itens; Configurações → Produtos não tem mais porta', () => {
    expect(ler('../../pages/etiquetas/Itens.jsx')).toMatch(/<PlanilhaDeItens soEtiq=\{soEtiq\}/);
    expect(ler('../../pages/Administracao.jsx')).not.toMatch(/configuracoes/);
    expect(ler('../../pages/Producao.jsx')).toMatch(/to="\/administracao\/estoque"/);
  });

  it('contas da equipe: uma lista só, senha de 8, botões de 44 px e o erro do banco aparece', () => {
    const c = ler('../../components/config/CartoesConfig.jsx');
    const contas = c.slice(c.indexOf('export function CartaoContas'), c.indexOf('export function CartaoCargos'));
    expect(contas).not.toMatch(/placeholder="[^"]*mín\. 6/);
    expect(contas).toMatch(/Nova senha \(mín\. 8\)/);
    expect(contas).not.toMatch(/mostrarLista/);
    expect(contas).toMatch(/const erro = await desativarUsuario\(u\.id\);\s*if \(erro\) \{ toast\(erro, 'erro'\); return; \}/);
    expect(contas).not.toMatch(/px-2 py-1/);
  });
});
