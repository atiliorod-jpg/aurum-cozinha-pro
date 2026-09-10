// =====================================================================
//  Testes de OPERAÇÃO — estoque, compras, produção, perdas e relatórios
//
//  ⚠️ Este arquivo nasceu de uma divisão: até 09/09/2026 os 465 testes viviam
//  num `regras.test.js` de 4.094 linhas, e achar ou acrescentar teste ali já
//  custava caro. A divisão é POR ASSUNTO, não por arquivo de origem — um teste
//  de etiqueta que atravessa `tspl.js`, `etiquetas.js` e `impressoraBLE.js`
//  continua junto dos seus, que é como se procura.
//
//  Nada de conteúdo mudou na divisão: os mesmos 465 testes, no mesmo texto.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { calcEstoquePuro } from '../estoque';
import { consumoComoSaidas, turnoAberto, consumoDoTurno } from '../turno';
import { comprasQueEntram } from '../visaoEstoque';
import { calcLotes, lotesVencendo } from '../lotes';
import { calcSugestoesMinMax } from '../sugestoes';
import { validarDataRegistro, addDias, diasAte } from '../datas';
import { rendimentoPorFornecedor, fatorCorrecaoItem, fatorCorrecaoProduto, mediaDiariaSaidas, previsaoRuptura, listaDeCompras, agruparListaPorMateriaPrima, preparacoesPorMateriaPrima, preparacoesDoItem, nomesCasam } from '../analise';
import { ingredientesParaProduzir, planejarProducao, producoesIncompletas } from '../producao';

import { statusEstoque } from '../calculos';

import { isoLocal } from '../formatters';
import { saidasPorDestinoDia, chegadasPorDia, rendimentoPorItem, producaoPorItem, somaPorUnidade, desperdicioPorDia, desperdicioPorEstoqueDia } from '../relatorios';

const P = (id, extra = {}) => ({ id, nome: id, unidade: 'kg', ativo: true, min: 0, max: 0, estoqueInicial: 0, ...extra });

describe('calcEstoquePuro — regra central do estoque', () => {
  it('soma entradas e abate saídas a partir do estoque inicial', () => {
    const r = calcEstoquePuro({
      produtos: [P('charque', { estoqueInicial: 50 })],
      entradas: [{ ts: 2, itens: [{ produtoId: 'charque', quantidade: 100 }] }],
      saidas: [{ ts: 3, itens: [{ produtoId: 'charque', quantidade: 30 }] }],
      ajustes: [], desperdicio: [],
    });
    expect(r.charque).toBe(120);
  });

  it('perda de estoque abate; perda de recebimento e aparas não', () => {
    const r = calcEstoquePuro({
      produtos: [P('charque')],
      entradas: [{ ts: 1, itens: [{ produtoId: 'charque', quantidade: 100 }] }],
      saidas: [],
      ajustes: [],
      desperdicio: [
        { ts: 2, origem: 'estoque', produtoId: 'charque', quantidade: 7 },
        { ts: 3, origem: 'recebimento', produtoId: 'charque', quantidade: 99 },
      ],
    });
    expect(r.charque).toBe(93);
  });

  // ⚠️ O BUG DO SECO. Lá `compraEntraNoEstoque` e true: a compra JA e a
  // entrada, o saldo sobe no ato. Com o seletor antigo ("Recebimento — nao
  // abate estoque"), receber 10 kg de arroz e jogar 2 fora na doca deixava o
  // sistema contando 10 kg que nao existiam — a opcao que PARECIA certa era a
  // que criava saldo fantasma. A pergunta virou "este item e controlado no
  // estoque?", e no Seco a resposta e sempre sim, entao grava origem='estoque'
  // com produtoId e o saldo fecha.
  it('Seco: perda de item do catalogo abate, mesmo tendo chegado ruim no recebimento', () => {
    const r = calcEstoquePuro({
      produtos: [P('arroz')],
      // no Seco a compra vira entrada (comprasQueEntram)
      entradas: [{ ts: 1, itens: [{ produtoId: 'arroz', quantidade: 10 }] }],
      saidas: [],
      ajustes: [],
      desperdicio: [
        // com o modelo novo isto grava origem 'estoque' + produtoId + compraId
        { ts: 2, origem: 'estoque', produtoId: 'arroz', compraId: 'c1', quantidade: 2 },
      ],
    });
    expect(r.arroz).toBe(8);   // antes ficava 10 — saldo fantasma
  });

  // O outro lado do mesmo seletor: perda de algo que NAO e controlado no
  // estoque (sobra de manipulacao, item de uso interno) entra no relatorio mas
  // nao pode mexer no saldo de produto nenhum.
  it('perda de item NAO controlado nao abate saldo de ninguem', () => {
    const r = calcEstoquePuro({
      produtos: [P('arroz')],
      entradas: [{ ts: 1, itens: [{ produtoId: 'arroz', quantidade: 10 }] }],
      saidas: [],
      ajustes: [],
      desperdicio: [
        // sem produtoId: e texto livre, so para constar
        { ts: 2, origem: 'recebimento', item: 'sobra de manipulacao', quantidade: 3 },
      ],
    });
    expect(r.arroz).toBe(10);
  });

  it('contagem física vira a nova base e ignora movimentos anteriores', () => {
    const r = calcEstoquePuro({
      produtos: [P('charque', { estoqueInicial: 10 })],
      entradas: [
        { ts: 1, itens: [{ produtoId: 'charque', quantidade: 999 }] }, // antes da contagem: ignorada
        { ts: 11, itens: [{ produtoId: 'charque', quantidade: 20 }] },
      ],
      saidas: [{ ts: 12, itens: [{ produtoId: 'charque', quantidade: 5 }] }],
      ajustes: [{ ts: 10, produtoId: 'charque', quantidade: 85 }],
      desperdicio: [],
    });
    expect(r.charque).toBe(100); // 85 + 20 − 5
  });
});

describe('calcLotes — FEFO por validade', () => {
  const entradas = [
    { ts: 1, data: '2026-06-08', itens: [{ produtoId: 'charque', quantidade: 20, validade: '2026-06-20' }] },
    { ts: 2, data: '2026-06-09', itens: [{ produtoId: 'charque', quantidade: 20, validade: '2026-06-26' }] },
  ];

  it('saída de 19 deixa 1 no lote que vence primeiro (exemplo do cliente)', () => {
    const lotes = calcLotes(entradas, [{ ts: 3, itens: [{ produtoId: 'charque', quantidade: 19 }] }], []);
    expect(lotes.charque).toHaveLength(2);
    expect(lotes.charque[0]).toMatchObject({ validade: '2026-06-20', restante: 1 });
    expect(lotes.charque[1]).toMatchObject({ validade: '2026-06-26', restante: 20 });
  });

  it('saída de 20 zera o primeiro lote, que some da lista', () => {
    const lotes = calcLotes(entradas, [{ ts: 3, itens: [{ produtoId: 'charque', quantidade: 20 }] }], []);
    expect(lotes.charque).toHaveLength(1);
    expect(lotes.charque[0].validade).toBe('2026-06-26');
  });

  it('consome em ordem de vencimento mesmo que o lote mais novo tenha entrado antes', () => {
    const invertidas = [
      { ts: 1, data: '2026-06-08', itens: [{ produtoId: 'x', quantidade: 10, validade: '2026-06-30' }] },
      { ts: 2, data: '2026-06-09', itens: [{ produtoId: 'x', quantidade: 10, validade: '2026-06-15' }] },
    ];
    const lotes = calcLotes(invertidas, [{ ts: 3, itens: [{ produtoId: 'x', quantidade: 10 }] }], []);
    expect(lotes.x).toHaveLength(1);
    expect(lotes.x[0].validade).toBe('2026-06-30'); // o que vence antes (15/06) saiu primeiro
  });

  it('perda de estoque também consome lote; perda de recebimento não', () => {
    const lotes = calcLotes(entradas, [], [
      { ts: 3, origem: 'estoque', produtoId: 'charque', quantidade: 20 },
      { ts: 4, origem: 'recebimento', produtoId: 'charque', quantidade: 5 },
    ]);
    expect(lotes.charque).toHaveLength(1);
    expect(lotes.charque[0].restante).toBe(20);
  });
});

describe('calcSugestoesMinMax — mín 3 dias / máx 6 dias', () => {
  const produtos = [P('charque')];
  const saidasEm = (dias, ref) =>
    Array.from({ length: dias }, (_, i) => ({
      data: addDias(ref, -i), itens: [{ produtoId: 'charque', quantidade: 10 }],
    }));

  it('não sugere antes de 15 dias de histórico', () => {
    expect(calcSugestoesMinMax(produtos, saidasEm(10, '2026-06-10'), '2026-06-10')).toEqual({});
  });

  it('com 15+ dias: média diária × 3 = mín, × 6 = máx', () => {
    const sug = calcSugestoesMinMax(produtos, saidasEm(30, '2026-06-10'), '2026-06-10');
    expect(sug.charque.min).toBe(30); // média 10/dia
    expect(sug.charque.max).toBe(60);
  });

  it('modo por dia da semana: consumo uniforme dá o mesmo que o modo plano', () => {
    const sug = calcSugestoesMinMax(produtos, saidasEm(30, '2026-06-10'), '2026-06-10', 3, 6, true);
    expect(sug.charque.min).toBe(30);
    expect(sug.charque.max).toBe(60);
  });

  it('modo por dia da semana: véspera de fim de semana eleva a sugestão vs. plano', () => {
    // fim de semana (sáb+dom) consome 70, demais dias 10
    const ref = '2026-06-12'; // sexta — os próximos dias caem no fim de semana
    const saidas = Array.from({ length: 30 }, (_, i) => {
      const data = addDias(ref, -i);
      const wd = new Date(data + 'T12:00:00').getDay();
      const fds = wd === 0 || wd === 6;
      return { data, itens: [{ produtoId: 'charque', quantidade: fds ? 70 : 10 }] };
    });
    const plano = calcSugestoesMinMax(produtos, saidas, ref, 3, 6, false);
    const sazonal = calcSugestoesMinMax(produtos, saidas, ref, 3, 6, true);
    // próximos 3 dias = sáb+dom+seg → muito acima da média lisa
    expect(sazonal.charque.min).toBeGreaterThan(plano.charque.min);
  });

  // Regressão: saída sem `data` devolvia min/max NaN. Como NaN nunca é igual a
  // NaN, o auto-mín/máx gravava o catálogo em todo ciclo e o produto sumia da
  // lista de compras. As guardas de janela e de histórico não seguravam porque
  // toda comparação com NaN/undefined é false.
  it('saída sem data não contamina a sugestão com NaN', () => {
    const comLixo = [...saidasEm(30, '2026-06-10'), { itens: [{ produtoId: 'charque', quantidade: 999 }] }];
    const sug = calcSugestoesMinMax(produtos, comLixo, '2026-06-10');
    expect(Number.isFinite(sug.charque.min)).toBe(true);
    expect(Number.isFinite(sug.charque.max)).toBe(true);
    // e o 999 fora de qualquer janela não pode entrar na média
    expect(sug.charque.min).toBe(30);
    expect(sug.charque.max).toBe(60);
  });

  it('a saída sem data era a primeira da lista: ainda assim não sugere NaN', () => {
    // este é o caso que quebrava de verdade — `primeira` saía undefined
    const soLixo = [{ itens: [{ produtoId: 'charque', quantidade: 999 }] }];
    expect(calcSugestoesMinMax(produtos, soLixo, '2026-06-10')).toEqual({});

    const lixoPrimeiro = [{ itens: [{ produtoId: 'charque', quantidade: 999 }] }, ...saidasEm(30, '2026-06-10')];
    const sug = calcSugestoesMinMax(produtos, lixoPrimeiro, '2026-06-10');
    expect(sug.charque.min).toBe(30);
  });

  it('data em formato inválido também é descartada', () => {
    const ruim = [...saidasEm(30, '2026-06-10'), { data: '10/06/2026', itens: [{ produtoId: 'charque', quantidade: 999 }] }];
    expect(calcSugestoesMinMax(produtos, ruim, '2026-06-10').charque.min).toBe(30);
  });
});

describe('validarDataRegistro — travas de data', () => {
  it('bloqueia data futura', () => {
    expect(validarDataRegistro('2026-06-20', '2026-06-10').ok).toBe(false);
  });
  it('aceita hoje sem confirmação', () => {
    expect(validarDataRegistro('2026-06-10', '2026-06-10')).toEqual({ ok: true });
  });
  it('pede confirmação acima de 3 dias de atraso', () => {
    const v = validarDataRegistro('2026-06-01', '2026-06-10');
    expect(v.ok).toBe(true);
    expect(v.confirmar).toBe(true);
    expect(v.dias).toBe(9);
  });
});

describe('análise de fornecedores e correção', () => {
  const compras = [
    { id: 'c1', item: 'Filé Mignon', fornecedor: 'A', quantidade: 25 },
    { id: 'c2', item: 'Filé Mignon', fornecedor: 'B', quantidade: 20 },
  ];
  const aparas = [{ compraId: 'c1', quantidade: 1.5 }, { compraId: 'c2', quantidade: 3 }];

  it('rendimento por fornecedor = 100% − correção/comprado', () => {
    const r = rendimentoPorFornecedor(compras, aparas, []);
    expect(r.find(f => f.fornecedor === 'A').rendimento).toBeCloseTo(94);
    expect(r.find(f => f.fornecedor === 'B').rendimento).toBeCloseTo(85);
  });

  it('fator de correção do item agrega todas as compras', () => {
    expect(fatorCorrecaoItem('Filé Mignon', compras, aparas, [])).toBeCloseTo(0.1); // 4,5/45
  });
});

describe('FC por ingrediente cobre todas as preparações', () => {
  const fichas = [
    { materiaPrima: 'Filé Mignon', preparacao: 'Parmegiana', gramatura: 130 },
    { materiaPrima: 'Filé Mignon', preparacao: 'Strogonoff', gramatura: 1500 },
    { materiaPrima: 'Frango Filé', preparacao: 'Grelhado', gramatura: 150 },
  ];

  it('agrupa as preparações por matéria-prima', () => {
    const m = preparacoesPorMateriaPrima(fichas);
    expect(m.get('Filé Mignon')).toHaveLength(2);
    expect(m.get('Frango Filé')).toHaveLength(1);
  });

  it('casa o item comprado com as preparações do ingrediente (tolerante a substring)', () => {
    const preps = preparacoesDoItem('Filé Mignon', fichas);
    expect(preps.map(p => p.preparacao)).toEqual(['Parmegiana', 'Strogonoff']);
  });

  it('item sem ficha não retorna preparações', () => {
    expect(preparacoesDoItem('Picanha', fichas)).toEqual([]);
  });

  it('FC automático (aparas) entra na lista de compras e aumenta o bruto', () => {
    // compra 100kg, 20kg de apara → FC 20% → bruto = 10/(1-0,2) = 12,5
    const compras = [{ id: 'c1', item: 'Filé Mignon', quantidade: 100 }];
    const aparas = [{ compraId: 'c1', quantidade: 20 }];
    const produtos = [P('file', { nome: 'Filé Mignon', min: 10, max: 10, unidade: 'kg' })];
    const lista = listaDeCompras(produtos, { file: 0 }, compras, aparas, []);
    expect(lista[0].fc).toBeCloseTo(0.2);
    expect(lista[0].brutoKg).toBeCloseTo(12.5);
  });

  it('PERDA ligada a uma compra também conta no FC (não só apara)', () => {
    const compras = [{ id: 'c1', item: 'Filé Mignon', quantidade: 100 }];
    const aparas = [{ compraId: 'c1', quantidade: 10 }];           // 10%
    const desperdicio = [{ compraId: 'c1', quantidade: 10 }];      // + 10% de perda
    const produto = P('file', { nome: 'Filé Mignon' });
    expect(fatorCorrecaoProduto(produto, compras, aparas, desperdicio)).toBeCloseTo(0.2);
  });

  it('correção ligada por produtoId conta mesmo sem compraId', () => {
    const compras = [{ id: 'c1', item: 'Filé Mignon', quantidade: 100 }];
    const desperdicio = [{ produtoId: 'file', quantidade: 15 }];
    const produto = P('file', { nome: 'Filé Mignon' });
    expect(fatorCorrecaoProduto(produto, compras, [], desperdicio)).toBeCloseTo(0.15);
  });

  it('FC manual sempre vence — ignora o cálculo automático por nome', () => {
    const compras = [{ id: 'c1', item: 'Filé Mignon', quantidade: 100 }];
    const aparas = [{ compraId: 'c1', quantidade: 30 }]; // automático daria 30%
    // produto trava FC manual em 5% mesmo com aparas que dariam 30%
    const produtos = [P('file', { nome: 'Filé Mignon', min: 10, max: 10, unidade: 'kg', fcManual: true, fcMedio: 0.05 })];
    const lista = listaDeCompras(produtos, { file: 0 }, compras, aparas, []);
    expect(lista[0].fc).toBe(0.05);
  });
});

describe('agruparListaPorMateriaPrima — unifica matéria-prima na compra', () => {
  // duas linhas de compra que compartilham a matéria-prima "Camarão"
  const lista = [
    { p: { id: 's', nome: 'Camarão Salada', min: 10, materiaPrima: 'Camarão' }, atual: 2, sugerido: 8, brutoKg: 10, liquidoKg: 8, fc: 0.2, fornecedor: 'A' },
    { p: { id: 'y', nome: 'Camarão Yakisoba', min: 10, materiaPrima: 'camarão' }, atual: 5, sugerido: 5, brutoKg: 6, liquidoKg: 5, fc: 0.16, fornecedor: 'A' },
    { p: { id: 'f', nome: 'Filé', min: 10, materiaPrima: '' }, atual: 1, sugerido: 9, brutoKg: 11, liquidoKg: 9, fc: 0.18, fornecedor: 'B' },
  ];

  it('soma o bruto dos produtos da mesma matéria-prima numa linha só', () => {
    const r = agruparListaPorMateriaPrima(lista);
    const grupo = r.find(e => e.tipo === 'grupo');
    expect(grupo.materiaPrima).toBe('Camarão');
    expect(grupo.brutoKg).toBeCloseTo(16); // 10 + 6
    expect(grupo.itens).toHaveLength(2);    // detalhe preservado
    expect(grupo.fornecedor).toBe('A');     // fornecedor único
  });

  it('produto sem matéria-prima continua linha própria (item)', () => {
    const r = agruparListaPorMateriaPrima(lista);
    const file = r.find(e => e.tipo === 'item' && e.p.id === 'f');
    expect(file).toBeTruthy();
    expect(file.brutoKg).toBe(11);
  });

  it('matéria-prima com um só produto não vira grupo', () => {
    const r = agruparListaPorMateriaPrima([
      { p: { id: 'x', nome: 'Picanha', min: 10, materiaPrima: 'Picanha' }, atual: 1, sugerido: 9, brutoKg: 9, liquidoKg: 9, fc: 0, fornecedor: null },
    ]);
    expect(r[0].tipo).toBe('item');
  });
});

describe('previsão de ruptura e lista de compras', () => {
  it('média diária precisa de ao menos 3 dias de histórico', () => {
    const umDia = [{ data: '2026-06-10', itens: [{ produtoId: 'x', quantidade: 10 }] }];
    expect(mediaDiariaSaidas(umDia, '2026-06-10')).toEqual({});
  });

  it('prevê em quantos dias o estoque acaba no ritmo atual', () => {
    const saidas = [0, 1, 2, 3, 4].map(i => ({
      data: addDias('2026-06-10', -i), itens: [{ produtoId: 'x', quantidade: 10 }],
    }));
    const medias = mediaDiariaSaidas(saidas, '2026-06-10'); // 10/dia
    const risco = previsaoRuptura([P('x')], { x: 25 }, medias);
    expect(risco[0].dias).toBeCloseTo(2.5);
  });

  it('lista de compras sugere repor até o máximo, mais crítico primeiro', () => {
    const produtos = [
      P('a', { min: 10, max: 20, nome: 'A' }),
      P('b', { min: 10, max: 20, nome: 'B' }),
      P('c', { min: 10, max: 20, nome: 'C' }),
    ];
    const lista = listaDeCompras(produtos, { a: 8, b: 0, c: 15 });
    expect(lista.map(x => x.p.id)).toEqual(['b', 'a']); // c está acima do mín, fora da lista
    expect(lista[0].sugerido).toBe(20); // b: 20 − 0
    expect(lista[1].sugerido).toBe(12); // a: 20 − 8
  });
});

describe('datas auxiliares', () => {
  it('addDias e diasAte são consistentes', () => {
    expect(addDias('2026-06-10', 12)).toBe('2026-06-22');
    expect(diasAte('2026-06-22', '2026-06-10')).toBe(12);
  });
});

describe('produção — receita escala pelo rendimento', () => {
  const receita = { rendimentoBase: 10, ingredientes: [{ produtoId: 'charque', quantidade: 5 }, { produtoId: 'agua', quantidade: 2 }] };

  it('escala os ingredientes pela quantidade-alvo', () => {
    const ing = ingredientesParaProduzir(receita, 20); // dobro do rendimento base
    expect(ing.find(i => i.produtoId === 'charque').quantidade).toBe(10);
    expect(ing.find(i => i.produtoId === 'agua').quantidade).toBe(4);
  });

  it('aponta o que falta quando o estoque é insuficiente', () => {
    const plano = planejarProducao(receita, 10, { charque: 3, agua: 5 });
    const ch = plano.itens.find(i => i.produtoId === 'charque');
    expect(ch.falta).toBe(2);          // precisa 5, tem 3
    expect(ch.suficiente).toBe(false);
    expect(plano.faltaAlgum).toBe(true);
  });
});

describe('nomesCasam — match de compra × produto sem falso positivo', () => {
  it('casa igual, prefixo e sufixo em fronteira de palavra', () => {
    expect(nomesCasam('Filé Mignon', 'filé mignon')).toBe(true);
    expect(nomesCasam('Peito', 'Peito de Frango')).toBe(true);   // prefixo
    expect(nomesCasam('Frango', 'Peito de Frango')).toBe(true);  // sufixo
  });

  it('NÃO casa substring solta nem nomes curtos', () => {
    expect(nomesCasam('sal', 'Salmão')).toBe(false);          // <4 chars
    expect(nomesCasam('salsa', 'Salsão')).toBe(false);        // substring sem fronteira
    expect(nomesCasam('Filé Mignon', 'Filé de Tilápia')).toBe(false);
  });
});

describe('produtoId na compra blinda o FC contra ambiguidade de nome', () => {
  it('compra com produtoId só conta para AQUELE produto', () => {
    const mignon = P('mignon', { nome: 'Filé Mignon' });
    const compras = [
      { id: 'c1', produtoId: 'mignon', item: 'Filé', quantidade: 10 }, // id vence o nome ambíguo
      { id: 'c2', produtoId: 'tilapia', item: 'Filé', quantidade: 99 },
    ];
    const aparas = [{ id: 'a1', compraId: 'c1', quantidade: 2 }];
    expect(fatorCorrecaoProduto(mignon, compras, aparas, [])).toBeCloseTo(0.2);
  });
});

describe('producoesIncompletas — saída interna órfã (ingrediente baixado sem produto)', () => {
  const antiga = Date.now() - 60 * 60 * 1000; // 1h atrás (passou da carência)

  it('detecta saída de produção sem a entrada do par', () => {
    const saidas = [{ id: 's1', ts: antiga, destino: 'producao', producaoId: 'p1', itens: [] }];
    expect(producoesIncompletas([], saidas)).toHaveLength(1);
  });

  it('par completo e entrada sem saída (receita só monitorados) NÃO alertam', () => {
    const entradas = [{ id: 'e1', ts: antiga, producaoId: 'p1' }, { id: 'e2', ts: antiga, producaoId: 'p2' }];
    const saidas = [{ id: 's1', ts: antiga, destino: 'producao', producaoId: 'p1' }];
    expect(producoesIncompletas(entradas, saidas)).toHaveLength(0);
  });

  it('par recém-criado (sync em curso) não alerta', () => {
    const saidas = [{ id: 's1', ts: Date.now(), destino: 'producao', producaoId: 'p1' }];
    expect(producoesIncompletas([], saidas)).toHaveLength(0);
  });
});

describe('lotesVencendo — reconciliado com o estoque calculado', () => {
  const diasFake = () => 2; // todo lote "vence em 2 dias" no teste

  it('produto zerado por contagem física não gera alerta fantasma', () => {
    const produtos = [P('charque', { valCongelado: 10 })];
    const entradas = [{ ts: 1, data: '2026-06-01', armazenamento: 'congelado',
      itens: [{ produtoId: 'charque', quantidade: 20, validade: '2026-06-12' }] }];
    const lotes = calcLotes(entradas, [], [], produtos);
    // sem contagem: lote aparece como vencendo
    expect(lotesVencendo(lotes, produtos, { charque: 20 }, diasFake)).toHaveLength(1);
    // contagem física zerou o produto → o alerta do lote some junto
    expect(lotesVencendo(lotes, produtos, { charque: 0 }, diasFake)).toHaveLength(0);
  });

  it('produto inativo também não alerta', () => {
    const produtos = [P('charque', { ativo: false })];
    const lotes = { charque: [{ validade: '2026-06-12', restante: 5 }] };
    expect(lotesVencendo(lotes, produtos, { charque: 5 }, diasFake)).toHaveLength(0);
  });
});

describe('relatórios — saídas por destino/dia e chegadas por dia', () => {
  const produtos = [{ id: 'file', nome: 'Filé' }, { id: 'frango', nome: 'Frango' }];
  const locais = [{ id: 'centro', nome: 'Unidade Centro' }, { id: 'praia', nome: 'Unidade Praia' }];
  const saidas = [
    { destino: 'centro', data: '2026-07-10', itens: [{ produtoId: 'file', quantidade: 3 }] },
    { destino: 'centro', data: '2026-07-11', itens: [{ produtoId: 'file', quantidade: 2 }, { produtoId: 'frango', quantidade: 5 }] },
    { destino: 'praia', data: '2026-07-10', itens: [{ produtoId: 'frango', quantidade: 4 }] },
    { destino: 'producao', data: '2026-07-10', itens: [{ produtoId: 'file', quantidade: 9 }] }, // interna: ignorar
  ];

  it('agrupa por destino sem misturar e ignora saída interna de produção', () => {
    const r = saidasPorDestinoDia(saidas, produtos, locais);
    expect(r.map(d => d.destinoNome)).toEqual(['Unidade Centro', 'Unidade Praia']);
    const centro = r.find(d => d.destinoId === 'centro');
    expect(centro.dias.length).toBe(2);
    // total do filé no Centro = 3 + 2 = 5 (não conta a saída de produção)
    expect(centro.totalPorItem.find(i => i.produtoId === 'file').quantidade).toBe(5);
    const praia = r.find(d => d.destinoId === 'praia');
    expect(praia.totalPorItem.find(i => i.produtoId === 'frango').quantidade).toBe(4);
  });

  it('chegadasPorDia soma o peso só dos itens em kg', () => {
    const compras = [
      { data: '2026-07-10', item: 'Filé Mignon', quantidade: 10, unidade: 'kg', fornecedor: 'Fri A' },
      { data: '2026-07-10', item: 'Tempero', quantidade: 3, unidade: 'unid' },
      { data: '2026-07-11', item: 'Frango', quantidade: 8, unidade: 'kg' },
    ];
    const r = chegadasPorDia(compras);
    expect(r.length).toBe(2);
    const dia10 = r.find(d => d.data === '2026-07-10');
    expect(dia10.pesoKg).toBe(10);       // só o filé (kg); o tempero (unid) não entra no peso
    expect(dia10.itens.length).toBe(2);
  });
});

describe('rendimentoPorItem — chegou, aparas, perdas e rendimento %', () => {
  const compras = [
    { id: 'c1', item: 'Filé Mignon', quantidade: 10, unidade: 'kg' },
    { id: 'c2', item: 'Filé Mignon', quantidade: 10, unidade: 'kg' },
    { id: 'c3', item: 'Frango', quantidade: 5, unidade: 'kg' },
  ];
  const aparas = [
    { compraId: 'c1', quantidade: 1.5 },   // apara ligada à 1ª compra de filé
    { quantidade: 9 },                     // apara solta (sem compraId) — não conta
  ];
  const desperdicio = [
    { compraId: 'c2', quantidade: 0.5 },   // perda ligada à 2ª compra de filé
  ];

  it('agrupa por item e calcula rendimento pelas correções ligadas à compra', () => {
    const r = rendimentoPorItem(compras, aparas, desperdicio);
    const file = r.find(x => x.item === 'Filé Mignon');
    expect(file.comprado).toBe(20);        // 10 + 10
    expect(file.aparas).toBe(1.5);
    expect(file.perdas).toBe(0.5);
    // rendimento = 100 − (1.5 + 0.5)/20 = 90%
    expect(Math.round(file.rendimento)).toBe(90);
    const frango = r.find(x => x.item === 'Frango');
    expect(frango.rendimento).toBe(100);   // sem correções
  });

  // 2 cx de tomate com 3 kg de apara davam "-50%" em vermelho, com cara de
  // numero certo. Nao da para dividir kg por caixa sem saber o peso da caixa.
  it('nao inventa rendimento quando a apara esta em unidade que nao soma com a compra', () => {
    const r = rendimentoPorItem(
      [{ id: 'c9', item: 'Tomate', quantidade: 2, unidade: 'cx' }],
      [{ compraId: 'c9', quantidade: 3, unidade: 'kg' }],
      []);
    expect(r[0].rendimento).toBe(null);
    expect(r[0].avisoUnidade).toBe(true);
    expect(r[0].incompativel).toBe(3);
    expect(r[0].aparas).toBe(0);           // nao entrou na conta
  });

  it('o mesmo item comprado em unidades diferentes vira DUAS linhas', () => {
    const r = rendimentoPorItem([
      { id: 'k1', item: 'Tomate', quantidade: 10, unidade: 'kg' },
      { id: 'k2', item: 'Tomate', quantidade: 2, unidade: 'cx' },
    ], [], []);
    expect(r).toHaveLength(2);
    expect(r.map(x => x.unidade).sort()).toEqual(['cx', 'kg']);
  });

  it('converte g para kg em vez de somar 500 com 10', () => {
    const r = rendimentoPorItem(
      [{ id: 'c8', item: 'Alho', quantidade: 10, unidade: 'kg' }],
      [{ compraId: 'c8', quantidade: 500, unidade: 'g' }],
      []);
    expect(r[0].aparas).toBe(0.5);
    expect(r[0].rendimento).toBe(95);
  });

  // Registro antigo nao tinha o campo `unidade`. Trata-la como incompativel
  // apagaria o rendimento de todo o historico ja gravado.
  it('correcao SEM unidade assume a unidade da compra', () => {
    const r = rendimentoPorItem(
      [{ id: 'c7', item: 'File', quantidade: 10, unidade: 'kg' }],
      [{ compraId: 'c7', quantidade: 1 }],
      []);
    expect(r[0].aparas).toBe(1);
    expect(r[0].avisoUnidade).toBe(false);
    expect(r[0].rendimento).toBe(90);
  });
});

// A perda no recebimento nao tem produtoId (OrigemCorrecao limpa o campo), entao
// caía fora dos dois ramos de custoDosRegistros: nao somava e nem contava como
// "sem custo". O card imprimia "R$ 0,00 · nada registrado" num mes em que a
// cozinha jogou 40 kg fora.

describe('desperdicioPorDia — quanto se perdeu em cada dia', () => {
  const compras = [{ id: 'c1', item: 'File Mignon', fornecedor: 'Boi Bom' }];
  const aparas = [
    { id: 'a1', data: '2026-08-20', quantidade: 2, unidade: 'kg', compraId: 'c1' },
    { id: 'a2', data: '2026-08-18', quantidade: 1, unidade: 'kg' },
  ];
  const perdas = [
    { id: 'p1', data: '2026-08-20', quantidade: 3, unidade: 'unid', motivo: 'D1' },
    { id: 'p2', data: '2026-08-20', quantidade: 0.5, unidade: 'kg' },
  ];

  it('agrupa por dia, do mais recente para o mais antigo', () => {
    const r = desperdicioPorDia(aparas, perdas, compras);
    expect(r.map(d => d.data)).toEqual(['2026-08-20', '2026-08-18']);
  });

  it('quebra o total do dia por unidade, sem somar kg com unid', () => {
    const [dia20] = desperdicioPorDia(aparas, perdas, compras);
    expect(dia20.totalAparas).toEqual({ kg: 2 });
    expect(dia20.totalPerdas).toEqual({ unid: 3, kg: 0.5 });
  });

  it('leva o item e o fornecedor da compra associada', () => {
    const [dia20] = desperdicioPorDia(aparas, perdas, compras);
    expect(dia20.aparas[0].compraItem).toBe('File Mignon');
    expect(dia20.aparas[0].compraFornecedor).toBe('Boi Bom');
    const [, dia18] = desperdicioPorDia(aparas, perdas, compras);
    expect(dia18.aparas[0].compraItem).toBe(null);   // sem compraId
  });

  it('dia sem lancamento nao aparece', () => {
    expect(desperdicioPorDia([], [], []).length).toBe(0);
  });
});

// R6: comparar o desperdicio de DUAS cozinhas. O relatorio mostrava um estoque
// por vez, entao o dono tinha que ler, trocar no seletor, ler de novo e
// comparar de cabeca — e o PDF saia de um estoque so.

describe('desperdicioPorEstoqueDia — comparacao entre cozinhas', () => {
  const visoes = {
    producao: {
      aparas: [{ id: 'a1', data: '2026-08-20', quantidade: 2, unidade: 'kg' }],
      desperdicio: [{ id: 'p1', data: '2026-08-20', quantidade: 1, unidade: 'kg' }],
    },
    'producao#ab12': {
      aparas: [],
      desperdicio: [{ id: 'p2', data: '2026-08-19', quantidade: 4, unidade: 'unid' }],
    },
  };

  it('uma coluna por estoque, uma linha por dia', () => {
    const r = desperdicioPorEstoqueDia(visoes, ['producao', 'producao#ab12']);
    expect(r.colunas).toEqual(['producao', 'producao#ab12']);
    expect(r.linhas.map(l => l.data)).toEqual(['2026-08-20', '2026-08-19']);
  });

  it('nao mistura o desperdicio de um restaurante com o do outro', () => {
    const r = desperdicioPorEstoqueDia(visoes, ['producao', 'producao#ab12']);
    const dia20 = r.linhas.find(l => l.data === '2026-08-20');
    expect(dia20.celulas[0].aparas).toEqual({ kg: 2 });
    expect(dia20.celulas[1].aparas).toEqual({});     // a instancia nao teve apara
    const dia19 = r.linhas.find(l => l.data === '2026-08-19');
    expect(dia19.celulas[0].perdas).toEqual({});
    expect(dia19.celulas[1].perdas).toEqual({ unid: 4 });
  });

  it('o total do periodo tambem e por estoque e por unidade', () => {
    const r = desperdicioPorEstoqueDia(visoes, ['producao', 'producao#ab12']);
    expect(r.totais[0].perdas).toEqual({ kg: 1 });
    expect(r.totais[1].perdas).toEqual({ unid: 4 });
  });

  it('respeita o filtro de periodo recebido', () => {
    const soDia19 = (lista) => lista.filter(r => r.data === '2026-08-19');
    const r = desperdicioPorEstoqueDia(visoes, ['producao', 'producao#ab12'], soDia19);
    expect(r.linhas.map(l => l.data)).toEqual(['2026-08-19']);
    expect(r.totais[0].aparas).toEqual({});
  });
});

describe('somaPorUnidade — nunca um numero so', () => {
  it('quebra por unidade em vez de somar kg com unid', () => {
    expect(somaPorUnidade([
      { quantidade: 10, unidade: 'kg' },
      { quantidade: 3, unidade: 'unid' },
      { quantidade: 2.5, unidade: 'kg' },
    ])).toEqual({ kg: 12.5, unid: 3 });
  });

  it('g entra como kg', () => {
    expect(somaPorUnidade([
      { quantidade: 1, unidade: 'kg' },
      { quantidade: 250, unidade: 'g' },
    ])).toEqual({ kg: 1.25 });
  });
});

// Somava `quantidade` de TODAS as compras do fornecedor, misturando itens e
// unidades: 10 kg de file + 5 cx de tomate + 30 unid de ovo viravam
// "comprado = 45", e a correcao em kg era dividida por esse 45.

describe('rendimentoPorFornecedor — media ponderada por item, nao soma bruta', () => {
  it('nao mistura itens nem unidades do mesmo fornecedor', () => {
    const r = rendimentoPorFornecedor(
      [
        { id: 'a1', fornecedor: 'Boi Bom', item: 'File',   quantidade: 10, unidade: 'kg' },
        { id: 'a2', fornecedor: 'Boi Bom', item: 'Tomate', quantidade: 2,  unidade: 'cx' },
      ],
      [{ compraId: 'a1', quantidade: 1, unidade: 'kg' }],
      []);
    const f = r.find(x => x.fornecedor === 'Boi Bom');
    // so o file entra na conta: 100 - 1/10 = 90%. O tomate em cx fica de fora.
    expect(Math.round(f.rendimento)).toBe(90);
    expect(f.itensNaConta).toBe(1);
    expect(f.itensDeFora).toBe(1);   // o tomate em cx ficou de fora
    expect(f.unidades.sort()).toEqual(['cx', 'kg']);
  });
});

describe('producaoPorItem — soma o produzido por produto final', () => {
  const produtos = [P('molho'), P('empanado', { nome: 'Empanado de filé' })];
  const entradas = [
    { producaoId: 'p1', itens: [{ produtoId: 'molho', quantidade: 3 }] },
    { producaoId: 'p2', itens: [{ produtoId: 'molho', quantidade: 2 }, { produtoId: 'empanado', quantidade: 12 }] },
    { itens: [{ produtoId: 'molho', quantidade: 99 }] }, // entrada avulsa (sem producaoId) — ignora
  ];
  it('soma só as entradas de produção, por produto', () => {
    const r = producaoPorItem(entradas, produtos);
    expect(r.find(x => x.produtoId === 'molho').quantidade).toBe(5);
    expect(r.find(x => x.produtoId === 'empanado').quantidade).toBe(12);
    expect(r[0].quantidade).toBeGreaterThanOrEqual(r[1].quantidade); // ordenado desc
  });
});

describe('statusEstoque — teto não definido', () => {
  it('produto com mínimo preenchido e máximo em branco (0) não vira EXCESSO', () => {
    // Configuracoes.jsx salva `max: parseFloat('') || 0` — máximo vazio vira 0.
    // Antes desta guarda, tudo acima de zero era lido como excesso e o produto
    // nunca aparecia como OK no painel.
    expect(statusEstoque(25, 20, 0)).toBe('ok');
    expect(statusEstoque(100, 20, 0)).toBe('ok');
    expect(statusEstoque(5, 20, 0)).toBe('critico'); // abaixo do mínimo continua valendo
    expect(statusEstoque(0, 20, 0)).toBe('zerado');
  });
  it('com máximo definido, o excesso continua sendo detectado', () => {
    expect(statusEstoque(70, 20, 60)).toBe('excesso');
    expect(statusEstoque(25, 20, 60)).toBe('ok');
  });
  it('sem mínimo nem máximo continua sem meta', () => {
    expect(statusEstoque(10, 0, 0)).toBe('sem-meta');
  });
});

describe('datas de cobrança — sem pular um dia por causa do fuso', () => {
  it('isoLocal usa o dia LOCAL, não o dia UTC', () => {
    // Fim de teste às 23h de 28/07 em Brasília = 29/07 02:00 UTC.
    // toISOString().slice(0,10) devolvia "2026-07-29" e a tela prometia um dia
    // a mais do que o cliente realmente tinha de acesso.
    const fim = new Date('2026-07-29T02:00:00Z');
    const utc = fim.toISOString().slice(0, 10);
    const local = isoLocal(fim);
    if (fim.getTimezoneOffset() > 0) {
      // fuso a oeste de Greenwich (Brasil): o dia local fica ANTES do dia UTC
      expect(local).not.toBe(utc);
      expect(local).toBe('2026-07-28');
    }
    // invariante que vale em qualquer fuso: isoLocal casa com a data local real
    expect(local).toBe(`${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`);
  });
});

describe('fechamento de turno da Finalização', () => {
  const produtos = [P('molho', { unidade: 'L' }), P('empanado', { unidade: 'unid' })];

  it('turno novo: disponível = recebido (não há sobra anterior)', () => {
    const t = turnoAberto({
      produtos,
      recebimentos: [{ ts: 10, itens: [{ produtoId: 'molho', quantidade: 12 }] }],
      perdas: [], fechamentos: [],
    });
    expect(t.linhas).toHaveLength(1);
    expect(t.linhas[0]).toMatchObject({ abertura: 0, recebido: 12, perdido: 0, disponivel: 12 });
  });

  it('consumo sai da diferença: recebeu 12, sobrou 3 → consumiu 9', () => {
    const t = turnoAberto({ produtos, recebimentos: [{ ts: 10, itens: [{ produtoId: 'molho', quantidade: 12 }] }], perdas: [], fechamentos: [] });
    const c = consumoDoTurno(t.linhas, { molho: 3 });
    expect(c[0].consumo).toBe(9);
    expect(c[0].inconsistente).toBe(false);
  });

  it('perda entra na conta e NÃO vira consumo', () => {
    // recebeu 12, perdeu 2 (estragou), sobrou 3 → consumo real 7, não 9
    const t = turnoAberto({
      produtos,
      recebimentos: [{ ts: 10, itens: [{ produtoId: 'molho', quantidade: 12 }] }],
      perdas: [{ ts: 11, produtoId: 'molho', quantidade: 2 }],
      fechamentos: [],
    });
    expect(t.linhas[0].disponivel).toBe(10);
    expect(consumoDoTurno(t.linhas, { molho: 3 })[0].consumo).toBe(7);
  });

  it('a sobra de um turno é a abertura do turno seguinte', () => {
    const fechamentos = [{ ts: 100, data: '2026-08-05', itens: [{ produtoId: 'molho', quantidade: 3 }] }];
    const t = turnoAberto({
      produtos, fechamentos, perdas: [],
      recebimentos: [
        { ts: 50, itens: [{ produtoId: 'molho', quantidade: 12 }] },  // turno ANTERIOR: ignorado
        { ts: 150, itens: [{ produtoId: 'molho', quantidade: 8 }] },  // turno atual
      ],
    });
    expect(t.linhas[0]).toMatchObject({ abertura: 3, recebido: 8, disponivel: 11 });
  });

  it('dois turnos no mesmo dia contam separado', () => {
    const almoco = { ts: 100, data: '2026-08-05', itens: [{ produtoId: 'molho', quantidade: 5 }] };
    const t = turnoAberto({
      produtos, fechamentos: [almoco], perdas: [],
      recebimentos: [{ ts: 120, itens: [{ produtoId: 'molho', quantidade: 6 }] }],
    });
    // jantar abre com a sobra do almoço (5) + o que chegou depois (6)
    expect(t.linhas[0].disponivel).toBe(11);
    expect(consumoDoTurno(t.linhas, { molho: 2 })[0].consumo).toBe(9);
  });

  it('sobra maior que o disponível é sinalizada, não escondida', () => {
    // contaram 20 mas só havia 12: falta registro em algum lugar — a tela avisa
    const t = turnoAberto({ produtos, recebimentos: [{ ts: 10, itens: [{ produtoId: 'molho', quantidade: 12 }] }], perdas: [], fechamentos: [] });
    const c = consumoDoTurno(t.linhas, { molho: 20 });
    expect(c[0].consumo).toBe(-8);
    expect(c[0].inconsistente).toBe(true);
  });

  it('item que não sobrou nada zera, sem virar negativo', () => {
    const t = turnoAberto({ produtos, recebimentos: [{ ts: 10, itens: [{ produtoId: 'empanado', quantidade: 20 }] }], perdas: [], fechamentos: [] });
    const c = consumoDoTurno(t.linhas, {}); // ninguém digitou nada = sobrou 0
    expect(c[0].consumo).toBe(20);
    expect(c[0].inconsistente).toBe(false);
  });
});

describe('mediaDiariaSaidas — média por PRODUTO, não do restaurante', () => {
  it('produto novo não é diluído pelo histórico da casa', () => {
    // Regressão: a casa tem 60 dias de uso e cadastra "Camarão", que vende
    // 10/dia por 3 dias. Antes o divisor era o histórico do restaurante (15),
    // dando média 2/dia — previsão de ruptura 5× otimista e mín/máx baixo.
    const ref = '2026-06-30';
    const saidas = [];
    for (let i = 0; i < 60; i++) saidas.push({ data: addDias(ref, -i), itens: [{ produtoId: 'antigo', quantidade: 1 }] });
    for (let i = 0; i < 3; i++) saidas.push({ data: addDias(ref, -i), itens: [{ produtoId: 'novo', quantidade: 10 }] });
    const m = mediaDiariaSaidas(saidas, ref);
    expect(m.novo).toBeCloseTo(10, 5);
    expect(m.antigo).toBeCloseTo(1, 5);
  });

  it('item com menos de 3 dias de saída fica de fora (pouca base)', () => {
    const ref = '2026-06-30';
    const saidas = [
      { data: ref, itens: [{ produtoId: 'estreante', quantidade: 8 }] },
      { data: addDias(ref, -1), itens: [{ produtoId: 'estreante', quantidade: 8 }] },
    ];
    expect(mediaDiariaSaidas(saidas, ref).estreante).toBeUndefined();
  });
});

// Regressão: a linha otimista da auditoria (id gerado no aparelho) nunca casava
// com a definitiva (id gerado pelo banco na RPC da migração 18), então cada ação
// aparecia duas vezes — e o merge duplicado era gravado no cache, sobrevivendo
// ao recarregar.

describe('estoque da Finalizacao — recebimento e fechamento de turno', () => {
  const produtos = [{ id: 'empanado', nome: 'Empanado', unidade: 'unid', estoqueInicial: 0 }];
  const recebimento = { id: 'r1', ts: 100, itens: [{ produtoId: 'empanado', quantidade: 20 }] };

  it('o FECHAMENTO DE TURNO vale como contagem, mesmo gravando em itens[]', () => {
    // A contagem do inventario tem produtoId na RAIZ; a do fechamento vem em
    // itens[]. Lendo so a forma da raiz, aj.produtoId era undefined e a
    // contagem inteira era descartada em silencio: a bancada contava 5 de sobra
    // e o estoque continuava mostrando os 20 recebidos.
    const fechamento = { id: 'f1', ts: 200, itens: [{ produtoId: 'empanado', quantidade: 5, consumo: 15 }] };
    const r = calcEstoquePuro({ produtos, entradas: [recebimento], saidas: [], ajustes: [fechamento], desperdicio: [] });
    expect(r.empanado).toBe(5);
  });

  it('a contagem por PRODUTO (inventario) continua funcionando', () => {
    const inv = { id: 'i1', ts: 200, produtoId: 'empanado', quantidade: 7 };
    const r = calcEstoquePuro({ produtos, entradas: [recebimento], saidas: [], ajustes: [inv], desperdicio: [] });
    expect(r.empanado).toBe(7);
  });

  it('as duas formas convivem: vale a contagem MAIS RECENTE', () => {
    const inv =        { id: 'i1', ts: 200, produtoId: 'empanado', quantidade: 7 };
    const fechamento = { id: 'f1', ts: 300, itens: [{ produtoId: 'empanado', quantidade: 3 }] };
    const r = calcEstoquePuro({ produtos, entradas: [recebimento], saidas: [], ajustes: [inv, fechamento], desperdicio: [] });
    expect(r.empanado).toBe(3);
  });

  it('entrada DEPOIS da contagem volta a somar; antes dela, nao', () => {
    const fechamento = { id: 'f1', ts: 200, itens: [{ produtoId: 'empanado', quantidade: 5 }] };
    const depois = { id: 'r2', ts: 300, itens: [{ produtoId: 'empanado', quantidade: 4 }] };
    const r = calcEstoquePuro({ produtos, entradas: [recebimento, depois], saidas: [], ajustes: [fechamento], desperdicio: [] });
    expect(r.empanado).toBe(9);   // 5 contados + 4 que chegaram depois
  });

  it('ajuste de produto inexistente nao quebra nem cria item fantasma', () => {
    const lixo = { id: 'x', ts: 200, itens: [{ produtoId: 'nao_existe', quantidade: 99 }] };
    const r = calcEstoquePuro({ produtos, entradas: [recebimento], saidas: [], ajustes: [lixo], desperdicio: [] });
    expect(r.empanado).toBe(20);
    expect(r.nao_existe).toBeUndefined();
  });
});

// A Cozinha de Finalizacao nao tem tela de saida: o consumo dela nasce do
// fechamento de turno. Converter para o formato de saida e o que permite
// reaproveitar media diaria, previsao de ruptura e sugestao de min/max sem
// duplicar nenhuma dessas contas — que e onde duas implementacoes da mesma
// regra comecam a divergir.

describe('consumo da Finalizacao vira saida (para media e min/max)', () => {
  it('converte o consumo apurado de cada fechamento', () => {
    const fech = [{ id: 'f1', ts: 1, data: '2026-08-20', itens: [
      { produtoId: 'empanado', quantidade: 5, consumo: 15 },
      { produtoId: 'molho', quantidade: 2, consumo: 4 },
    ] }];
    const r = consumoComoSaidas(fech);
    expect(r).toHaveLength(1);
    expect(r[0].data).toBe('2026-08-20');
    expect(r[0].itens).toEqual([
      { produtoId: 'empanado', quantidade: 15 },
      { produtoId: 'molho', quantidade: 4 },
    ]);
  });

  it('DESCARTA consumo negativo — sobrou mais do que entrou', () => {
    // acontece com recebimento nao registrado ou contagem anterior baixa;
    // somar isso puxaria a media para baixo e o app sugeriria minimo menor do
    // que a casa precisa
    const fech = [{ id: 'f1', data: '2026-08-20', itens: [
      { produtoId: 'a', quantidade: 9, consumo: -3 },
      { produtoId: 'b', quantidade: 1, consumo: 6 },
    ] }];
    const r = consumoComoSaidas(fech);
    expect(r[0].itens).toEqual([{ produtoId: 'b', quantidade: 6 }]);
  });

  it('fechamento sem consumo nenhum nao vira saida vazia', () => {
    const fech = [{ id: 'f1', data: '2026-08-20', itens: [{ produtoId: 'a', quantidade: 5, consumo: 0 }] }];
    expect(consumoComoSaidas(fech)).toEqual([]);
  });

  it('lista vazia ou malformada nao quebra', () => {
    expect(consumoComoSaidas([])).toEqual([]);
    expect(consumoComoSaidas(undefined)).toEqual([]);
    expect(consumoComoSaidas([{ id: 'x' }, null])).toEqual([]);
  });
});

// No Estoque Seco a COMPRA JA E A ENTRADA: voce compra 12 pacotes de arroz e
// eles SAO o item do estoque. O dono testou e o saldo nao mexia.

describe('compra que da entrada (so no Estoque Seco)', () => {
  const compra = { id: 'c1', ts: 10, data: '2026-08-21', produtoId: 'seco_arroz', quantidade: 12, validade: '2027-06-30' };

  it('no seco a compra vira entrada, com a validade do produtor', () => {
    const r = comprasQueEntram('seco', [compra]);
    expect(r).toHaveLength(1);
    expect(r[0].itens).toEqual([{ produtoId: 'seco_arroz', quantidade: 12, validade: '2027-06-30' }]);
  });

  it('vale tambem para INSTANCIA de seco', () => {
    expect(comprasQueEntram('seco#x7k2', [compra])).toHaveLength(1);
  });

  it('na PRODUCAO nao entra — la a compra e do cru e quem entra e a porcao', () => {
    // somar as duas contaria o mesmo insumo duas vezes
    expect(comprasQueEntram('producao', [compra])).toEqual([]);
    expect(comprasQueEntram('finalizacao', [compra])).toEqual([]);
  });

  it('compra SEM produto vinculado nao entra — nao ha a quem somar', () => {
    expect(comprasQueEntram('seco', [{ id: 'c2', quantidade: 5, item: 'texto livre' }])).toEqual([]);
  });

  it('quantidade zero ou negativa nao vira entrada', () => {
    expect(comprasQueEntram('seco', [{ ...compra, quantidade: 0 }])).toEqual([]);
    expect(comprasQueEntram('seco', [{ ...compra, quantidade: -3 }])).toEqual([]);
  });

  it('sem validade digitada, entra normalmente e so nao alerta vencimento', () => {
    const semVal = comprasQueEntram('seco', [{ ...compra, validade: '' }]);
    expect(semVal[0].itens[0].validade).toBeUndefined();
    expect(semVal[0].itens[0].quantidade).toBe(12);
  });

  it('a compra somada de fato aparece no saldo do seco', () => {
    const produtos = [{ id: 'seco_arroz', nome: 'Arroz', unidade: 'unid', estoqueInicial: 0 }];
    const r = calcEstoquePuro({
      produtos,
      entradas: comprasQueEntram('seco', [compra]),
      saidas: [], ajustes: [], desperdicio: [],
    });
    expect(r.seco_arroz).toBe(12);
  });
});
