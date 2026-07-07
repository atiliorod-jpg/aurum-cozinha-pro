import { describe, it, expect } from 'vitest';
import { calcEstoquePuro } from '../estoque';
import { calcLotes } from '../lotes';
import { calcSugestoesMinMax } from '../sugestoes';
import { validarDataRegistro, addDias, diasAte } from '../datas';
import { rendimentoPorFornecedor, fatorCorrecaoItem, fatorCorrecaoProduto, mediaDiariaSaidas, previsaoRuptura, listaDeCompras, agruparListaPorMateriaPrima, preparacoesPorMateriaPrima, preparacoesDoItem } from '../analise';
import { ingredientesParaProduzir, planejarProducao } from '../producao';
import { montarCamposEtiqueta, montarPayloadQR } from '../etiquetas';

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

describe('etiquetas — montagem dos campos', () => {
  it('calcula a validade pelos prazos do produto conforme o armazenamento', () => {
    const campos = montarCamposEtiqueta({
      produto: P('charque', { valCongelado: 10, valResfriado: 3 }),
      dataFabricacao: '2026-06-10', armazenamento: 'congelado',
      restauranteNome: 'Polo', responsavel: 'Ceará',
    });
    expect(campos.validade).toBe('2026-06-20');
    expect(campos.validadeFmt).toBe('20/06/2026');
    expect(campos.dataFabricacaoFmt).toBe('10/06/2026');
    expect(campos.rotuloData).toBe('MANIPULAÇÃO');
  });

  it('hora da impressão entra junto das datas de manipulação e validade', () => {
    const campos = montarCamposEtiqueta({
      nome: 'Patinho moído', dataFabricacao: '2026-06-10', diasValidade: 2, hora: '12:59',
    });
    expect(campos.dataFabricacaoFmt).toBe('10/06/2026 - 12:59');
    expect(campos.validadeFmt).toBe('12/06/2026 - 12:59');
  });

  it('validade pronta (de registro real) tem prioridade sobre o cálculo', () => {
    const campos = montarCamposEtiqueta({
      produto: P('charque', { valCongelado: 10 }),
      dataFabricacao: '2026-06-10', armazenamento: 'congelado',
      validade: '2026-06-15', // veio da entrada registrada
    });
    expect(campos.validade).toBe('2026-06-15');
  });

  it('avulsa usa diasValidade e o rótulo de abertura; sem prazo não gera validade', () => {
    const aberta = montarCamposEtiqueta({
      nome: 'Leite aberto', tipoData: 'abertura',
      dataFabricacao: '2026-06-10', diasValidade: 5,
    });
    expect(aberta.rotuloData).toBe('ABERTURA');
    expect(aberta.validade).toBe('2026-06-15');

    const semPrazo = montarCamposEtiqueta({ nome: 'Tempero da casa', dataFabricacao: '2026-06-10', diasValidade: 0 });
    expect(semPrazo.validade).toBeNull();
    expect(semPrazo.validadeFmt).toBe('');
  });

  it('payload do QR é uma ficha legível linha a linha (Chave: valor)', () => {
    const campos = montarCamposEtiqueta({
      nome: 'Molho misto', dataFabricacao: '2026-06-10', diasValidade: 4, restauranteNome: 'Polo', responsavel: 'Ceará',
    });
    const qr = montarPayloadQR(campos, { idEtiqueta: '#T1A2B0', estabelecimento: { cnpj: '12.345.678/0001-00' } });
    expect(qr).toContain('Restaurante: Polo');
    expect(qr).toContain('Produto: Molho misto');
    expect(qr).toContain('Manipulacao: 10/06/2026');
    expect(qr).toContain('Validade: 14/06/2026');
    expect(qr).toContain('Resp: Ceará');
    expect(qr).toContain('CNPJ: 12.345.678/0001-00');
    expect(qr).toContain('Etiqueta: #T1A2B0');
    expect(qr.split('\n').length).toBe(7); // só as linhas com valor entram
  });
});
