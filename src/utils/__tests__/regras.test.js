import { describe, it, expect } from 'vitest';
import { calcEstoquePuro } from '../estoque';
import { calcLotes } from '../lotes';
import { calcSugestoesMinMax } from '../sugestoes';
import { validarDataRegistro, addDias, diasAte } from '../datas';
import { rendimentoPorFornecedor, fatorCorrecaoItem, mediaDiariaSaidas, previsaoRuptura, listaDeCompras } from '../analise';

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
