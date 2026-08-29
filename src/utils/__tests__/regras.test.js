import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { calcEstoquePuro } from '../estoque';
import { consumoComoSaidas } from '../turno';
import { comprasQueEntram } from '../visaoEstoque';
import { calcLotes, lotesVencendo } from '../lotes';
import { calcSugestoesMinMax } from '../sugestoes';
import { validarDataRegistro, addDias, diasAte } from '../datas';
import { rendimentoPorFornecedor, fatorCorrecaoItem, fatorCorrecaoProduto, mediaDiariaSaidas, previsaoRuptura, listaDeCompras, agruparListaPorMateriaPrima, preparacoesPorMateriaPrima, preparacoesDoItem, nomesCasam } from '../analise';
import { ingredientesParaProduzir, planejarProducao, producoesIncompletas } from '../producao';
import { ETIQUETA_CONFIG_PADRAO, montarCamposEtiqueta, montarPayloadQR, QR_MAX_CARACTERES, gerarLoteId, lerLoteIdDoQR, statusEtiqueta, podarEtiquetas, MAX_ETIQUETAS_GUARDADAS } from '../etiquetas';
import { pode, permissoesEfetivas, PERMISSOES_PADRAO } from '../permissoes';
import { registrarFalha, ressuscitar, contarVivos, contarMortos, MAX_TENTATIVAS_OUTBOX, ehErroDefinitivo } from '../outbox';
import { statusEstoque } from '../calculos';
import { conciliarAuditoria } from '../auditoria';
import { custoUnitario, valorDoEstoque, curvaABC, custoDosRegistros, precoDaCompra } from '../financeiro';
import { listarEstoques, estoquesAtivos, acharEstoque, estabelecimentoDe, salvarEstoque, moduloUtilizavel } from '../instancias';
import { comMetas, separarMetas, fatiarPorEstoque, visaoDoEstoque } from '../visaoEstoque';
import { limparCacheLocal, pendenciasNaoSincronizadas } from '../../lib/cache';
import { MODULO_PADRAO, chaveModulo, tipoModulo, lerTipo, temRecurso, ehTipoGlobal, RECURSOS_MODULO, mesclarFixos, catalogoDe, tipoBase, ehIdInstancia, gerarIdInstancia, moduloValido, moduloPorId } from '../modulos';
import { isoLocal } from '../formatters';
import { outboxUid } from '../../lib/cache';
import { statusAssinatura, TESTE_DIAS, PLANOS, precoPlano, precoMensalEquivalente, economiaPlano } from '../assinatura';
import { produtoTem, produtoAtivo } from '../produto';
import { prazoDe, temAlgumPrazo, comEspelhoDePrazos, listarArmazenamentos } from '../armazenamento';
import { validarCNPJ, formatarCNPJ, validarTelefone, formatarTelefone, soDigitos } from '../documentos';
import { etiquetaTSPL, loteTSPL, paraBytesLatin1, cortarParaLargura, PONTOS_POR_MM } from '../tspl';
import { caminhosDeImpressao, ehCelular } from '../../lib/impressoraBLE';
import { BIBLIOTECA_ETIQUETAS, CATEGORIAS_BIBLIOTECA, buscarNaBiblioteca, agruparPorCategoria } from '../../data/bibliotecaEtiquetas';
import { crc16, montarPixBRCode } from '../pix';
import { saidasPorDestinoDia, chegadasPorDia, rendimentoPorItem, producaoPorItem, somaPorUnidade, desperdicioPorDia, desperdicioPorEstoqueDia } from '../relatorios';
import { turnoAberto, consumoDoTurno } from '../turno';

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
      hora: '10:52', armazenamento: 'congelado',
    });
    const qr = montarPayloadQR(campos);
    expect(qr).toContain('Prod: Molho misto');
    expect(qr).toContain('Manip: 10/06/2026');
    expect(qr).toContain('Val: 14/06/2026');
    // 'Rest:' saiu do QR para abrir espaço ao id de lote — o nome do
    // restaurante continua impresso em destaque na etiqueta impressa.
    expect(qr).not.toContain('Rest:');
    expect(qr.split('\n').length).toBe(4); // só as linhas com valor entram
  });

  it('QR do pior caso ainda imprime legível numa térmica de 203 DPI', async () => {
    // Este é o teste que importa de verdade: não basta o conteúdo estar certo,
    // o código PRECISA sair com módulo grande o bastante pro leitor pegar.
    // Térmica de 203 DPI = 8 pontos/mm; o QR sai com ~21mm; cada módulo precisa
    // de ~4 pontos pra ter borda limpa → no máximo 41 módulos (versão 6).
    // Texto a mais empurra a versão pra cima e o QR volta a não escanear.
    const { default: QRCode } = await import('qrcode');
    const campos = montarCamposEtiqueta({
      nome: 'EMPANADO DE FILÉ MIGNON PORCIONADO (PORÇÃO)', // pior caso realista
      dataFabricacao: '2026-06-10', diasValidade: 90, hora: '10:52',
      armazenamento: 'congelado', restauranteNome: 'Restaurante Muito Longo Ltda',
      responsavel: 'Joana da Silva Sobrinho', marca: 'Friboi', sif: '1234',
      valOriginal: '2026-12-01', medida: '1 kg',
    });
    const qr = montarPayloadQR(campos);
    expect(qr).not.toMatch(/[À-ÿ]/);       // sem acento (acento = 2 bytes no QR)
    expect(qr).not.toMatch(/\d{2}:\d{2}/); // datas sem hora
    expect(qr.length).toBeLessThanOrEqual(QR_MAX_CARACTERES);

    const { version, modules } = QRCode.create(qr, { errorCorrectionLevel: 'M' });
    expect(version).toBeLessThanOrEqual(6);
    expect(modules.size).toBeLessThanOrEqual(41);
    const pontosPorModulo = (21 / modules.size) * (203 / 25.4);
    expect(pontosPorModulo).toBeGreaterThanOrEqual(4);
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

describe('permissões por função (matriz configurável)', () => {
  const superAdmin = { eSuperAdmin: true };
  const diretoria = { cargo: 'diretoria' };
  const gerencia = { cargo: 'gerencia' };
  const cozinha = { cargo: 'cozinha' };

  it('diretoria e super-admin podem tudo, sempre', () => {
    expect(pode(superAdmin, {}, 'configurarSistema')).toBe(true);
    expect(pode(diretoria, {}, 'verRelatorio')).toBe(true);
    expect(pode(diretoria, { diretoria: { verRelatorio: false } }, 'verRelatorio')).toBe(true);
  });

  it('sem prefs, cai no padrão (cozinha operacional, gerência com gestão)', () => {
    expect(pode(cozinha, undefined, 'verRelatorio')).toBe(false);
    expect(pode(cozinha, undefined, 'removerRegistros')).toBe(false); // só gerência+ apaga por padrão
    expect(pode(gerencia, undefined, 'removerRegistros')).toBe(true);
    expect(pode(gerencia, undefined, 'configurarSistema')).toBe(true);
  });

  it('a diretoria pode conceder e retirar capacidades', () => {
    const permissoes = { cozinha: { verRelatorio: true }, gerencia: { configurarSistema: false } };
    expect(pode(cozinha, permissoes, 'verRelatorio')).toBe(true);   // concedido
    expect(pode(cozinha, permissoes, 'inventario')).toBe(false);    // não mexido → padrão
    expect(pode(gerencia, permissoes, 'configurarSistema')).toBe(false); // retirado
  });

  it('sessão nula não pode nada', () => {
    expect(pode(null, {}, 'verRelatorio')).toBe(false);
  });

  it('permissoesEfetivas completa as chaves a partir do padrão', () => {
    const ef = permissoesEfetivas({ cozinha: { verRelatorio: true } });
    expect(ef.cozinha.verRelatorio).toBe(true);
    expect(ef.cozinha.inventario).toBe(PERMISSOES_PADRAO.cozinha.inventario);
    expect(ef.gerencia).toEqual(PERMISSOES_PADRAO.gerencia);
  });
});

describe('outbox — fila morta (não retentar para sempre)', () => {
  it('marca _morto ao atingir o máximo de tentativas', () => {
    let item = { id: 'a', kind: 'registro', op: 'insert' };
    for (let i = 0; i < MAX_TENTATIVAS_OUTBOX - 1; i++) item = registrarFalha(item);
    expect(item._morto).toBe(false);
    expect(item._tentativas).toBe(MAX_TENTATIVAS_OUTBOX - 1);
    item = registrarFalha(item);
    expect(item._morto).toBe(true);
    expect(item._tentativas).toBe(MAX_TENTATIVAS_OUTBOX);
  });

  it('ressuscitar limpa _morto e _tentativas', () => {
    const morto = { id: 'a', _morto: true, _tentativas: 8 };
    const vivo = ressuscitar(morto);
    expect(vivo._morto).toBeUndefined();
    expect(vivo._tentativas).toBeUndefined();
    expect(vivo.id).toBe('a');
  });

  it('conta vivos e mortos separadamente', () => {
    const fila = [{ id: 1 }, { id: 2, _morto: true }, { id: 3 }];
    expect(contarVivos(fila)).toBe(2);
    expect(contarMortos(fila)).toBe(1);
  });
});

describe('statusAssinatura — borda do teste grátis (paridade com o SQL)', () => {
  const DIA = 86400000;
  const base = (createdAt) => ({ restauranteId: 'r1', restauranteCriadoEm: createdAt });

  // Escrito em função de TESTE_DIAS, não com número solto: a borda tem que
  // continuar sendo testada quando o prazo mudar de novo.
  it('no último dia do teste = ok', () => {
    const agora = Date.now();
    const st = statusAssinatura(base(new Date(agora - (TESTE_DIAS - 1) * DIA).toISOString()), agora);
    expect(st.ok).toBe(true);
    expect(st.tipo).toBe('teste');
  });

  it('passou do teste sem assinatura = vencido', () => {
    const agora = Date.now();
    const st = statusAssinatura(base(new Date(agora - (TESTE_DIAS + 1) * DIA).toISOString()), agora);
    expect(st.ok).toBe(false);
    expect(st.tipo).toBe('vencido');
  });

  // ⚠️ ESTE NÚMERO É ESCRITO EM DOIS LUGARES: aqui e no `interval '5 days'` de
  // restaurante_pode_escrever, recriada na MIGRAÇÃO 28. Se alguém mudar só o
  // JS, o app aprova a escrita e o banco recusa — e como o app é offline-first,
  // o lançamento entra na fila e some sem erro visível. Quebrar aqui é o aviso.
  it('TESTE_DIAS é 5 (precisa bater com o interval da migração 28)', () => {
    expect(TESTE_DIAS).toBe(5);
  });

  it('conta bloqueada não escreve mesmo com assinatura em dia', () => {
    const agora = Date.now();
    const st = statusAssinatura({ restauranteId: 'r1', bloqueado: true, assinaturaAte: new Date(agora + 30 * DIA).toISOString() }, agora);
    expect(st.ok).toBe(false);
    expect(st.tipo).toBe('bloqueado');
  });
});

describe('planos de pagamento (Pix)', () => {
  const plano = (id) => PLANOS.find(p => p.id === id);

  // ⚠️ Estes números são o que sai no BR Code do Pix. Se um deles mudar sem
  // querer, o cliente paga o valor errado e a conciliação vira manual — por
  // isso valem os dois produtos, com as contas escritas por extenso.
  // Descontos: semestral -5%, anual -10% (baixados de 10/20% em 28/08/2026).
  describe('Aurum Cozinha Pro (R$500/mês)', () => {
    it('mensal = R$500 sem desconto', () => {
      expect(precoPlano(plano('mensal'), 'completo')).toBe(500);
    });
    it('semestral = 5% off (500×6×0,95 = 2850) e mostra economia', () => {
      expect(precoPlano(plano('semestral'), 'completo')).toBe(2850);
      expect(precoMensalEquivalente(plano('semestral'), 'completo')).toBe(475);
      expect(economiaPlano(plano('semestral'), 'completo')).toBe(150);
    });
    it('anual = 10% off (500×12×0,9 = 5400)', () => {
      expect(precoPlano(plano('anual'), 'completo')).toBe(5400);
      expect(precoMensalEquivalente(plano('anual'), 'completo')).toBe(450);
      expect(economiaPlano(plano('anual'), 'completo')).toBe(600);
    });
  });

  describe('Aurum Etiquetas (R$270/mês)', () => {
    it('mensal = R$270 sem desconto', () => {
      expect(precoPlano(plano('mensal'), 'etiquetas')).toBe(270);
    });
    it('semestral = 5% off (270×6×0,95 = 1539)', () => {
      expect(precoPlano(plano('semestral'), 'etiquetas')).toBe(1539);
      expect(precoMensalEquivalente(plano('semestral'), 'etiquetas')).toBe(256.5);
      expect(economiaPlano(plano('semestral'), 'etiquetas')).toBe(81);
    });
    it('anual = 10% off (270×12×0,9 = 2916)', () => {
      expect(precoPlano(plano('anual'), 'etiquetas')).toBe(2916);
      expect(precoMensalEquivalente(plano('anual'), 'etiquetas')).toBe(243);
      expect(economiaPlano(plano('anual'), 'etiquetas')).toBe(324);
    });
  });

  // Trava os percentuais em si: se alguém mexer nos descontos, quebra aqui e
  // não só nos totais — a mensagem fica óbvia.
  it('descontos são 0%, 5% e 10%', () => {
    expect(plano('mensal').desconto).toBe(0);
    expect(plano('semestral').desconto).toBe(0.05);
    expect(plano('anual').desconto).toBe(0.10);
  });

  // Produto desconhecido ou ausente NÃO pode virar preço zero (Pix de R$0,00
  // seria aceito pelo banco e o cliente entraria de graça): cai no completo.
  it('produto ausente ou inválido cobra o preço do completo', () => {
    expect(precoPlano(plano('mensal'))).toBe(500);
    expect(precoPlano(plano('mensal'), 'xpto')).toBe(500);
    expect(precoPlano(plano('mensal'), { produto: 'etiquetas' })).toBe(270);
  });

  it('dias por plano batem com 30/180/365', () => {
    expect(plano('mensal').dias).toBe(30);
    expect(plano('semestral').dias).toBe(180);
    expect(plano('anual').dias).toBe(365);
  });
});

describe('armazenamento configurável (utils/armazenamento.js)', () => {
  // ⚠️ O grupo mais importante deste arquivo para a etiqueta: se `prazoDe`
  // errar, sai etiqueta com validade errada — ou sem validade — colada num
  // pote de comida. Cada formato de produto que existe no banco hoje tem caso.
  it('produto ANTIGO (só valCongelado/valResfriado) continua com os prazos', () => {
    const p = { id: 'picanha', valCongelado: 30, valResfriado: 3 };
    expect(prazoDe(p, 'congelado')).toBe(30);
    expect(prazoDe(p, 'resfriado')).toBe(3);
  });

  it('produto NOVO (prazos{}) usa o formato novo, inclusive estados criados pelo restaurante', () => {
    const p = { id: 'alface', prazos: { resfriado: 5, ambiente: 2 } };
    expect(prazoDe(p, 'resfriado')).toBe(5);
    expect(prazoDe(p, 'ambiente')).toBe(2);
  });

  it('com os DOIS formatos divergindo, prazos{} manda', () => {
    const p = { valCongelado: 30, valResfriado: 3, prazos: { congelado: 45 } };
    expect(prazoDe(p, 'congelado')).toBe(45);
    // o estado que prazos{} não cita continua caindo no campo antigo
    expect(prazoDe(p, 'resfriado')).toBe(3);
  });

  it('estado sem prazo devolve 0, e 0 significa "etiqueta sem vencimento"', () => {
    expect(prazoDe({ valCongelado: 30 }, 'ambiente')).toBe(0);
    expect(prazoDe(null, 'congelado')).toBe(0);
    expect(prazoDe(undefined, undefined)).toBe(0);
  });

  it('temAlgumPrazo distingue item cadastrado pela metade de item completo', () => {
    expect(temAlgumPrazo({ nome: 'Alface' })).toBe(false);
    expect(temAlgumPrazo({ prazos: { ambiente: 0 } })).toBe(false);
    expect(temAlgumPrazo({ valCongelado: 30 })).toBe(true);
    expect(temAlgumPrazo({ prazos: { ambiente: 2 } })).toBe(true);
  });

  // ⚠️ Sem o espelho, um tablet com cache antigo imprime validade ZERADA em
  // silêncio — o formato antigo é o único que ele sabe ler.
  it('ao salvar, os campos antigos são espelhados a partir de prazos{}', () => {
    const salvo = comEspelhoDePrazos({ id: 'x', nome: 'X' }, { congelado: 20, resfriado: 4, ambiente: 90 });
    expect(salvo.prazos).toEqual({ congelado: 20, resfriado: 4, ambiente: 90 });
    expect(salvo.valCongelado).toBe(20);
    expect(salvo.valResfriado).toBe(4);
  });

  it('espelho zera os campos antigos quando o estado deixa de ter prazo', () => {
    const salvo = comEspelhoDePrazos({ valCongelado: 30, valResfriado: 3 }, { ambiente: 90 });
    expect(salvo.valCongelado).toBe(0);
    expect(salvo.valResfriado).toBe(0);
    expect(prazoDe(salvo, 'ambiente')).toBe(90);
  });

  it('congelado e resfriado são repostos mesmo em prefs que já foi salva sem eles', () => {
    const lista = listarArmazenamentos({ armazenamentos: [{ id: 'ambiente', nome: 'Ambiente' }] });
    expect(lista.map(a => a.id).sort()).toEqual(['ambiente', 'congelado', 'refrigerado', 'resfriado']);
    // e voltam marcados como fixos, que é o que esconde o botão de remover
    expect(lista.find(a => a.id === 'congelado').fixo).toBe(true);
  });

  it('o restaurante pode renomear o fixo e a renomeação sobrevive', () => {
    const lista = listarArmazenamentos({
      armazenamentos: [{ id: 'congelado', nome: 'Freezer -18', faixa: '-18°C', fixo: true }],
    });
    expect(lista.find(a => a.id === 'congelado').nome).toBe('Freezer -18');
  });

  it('prefs vazia devolve os quatro estados de partida', () => {
    const esperado = ['congelado', 'refrigerado', 'resfriado', 'ambiente'];
    expect(listarArmazenamentos({}).map(a => a.id)).toEqual(esperado);
    expect(listarArmazenamentos(undefined).map(a => a.id)).toEqual(esperado);
  });

  // ⚠️ Resfriado e refrigerado sao faixas DIFERENTES e precisam coexistir:
  // 0-4°C para carne e preparado, 4-10°C para hortifruti e laticinio. Tê-los
  // fundidos num só obriga a etiquetar alface com a temperatura da picanha.
  it('resfriado e refrigerado existem como estados separados, com faixas próprias', () => {
    const lista = listarArmazenamentos({});
    const res = lista.find(a => a.id === 'resfriado');
    const ref = lista.find(a => a.id === 'refrigerado');
    // ⚠️ REFRIGERADO é o mais frio dos dois — eu tinha invertido e o dono corrigiu.
    expect(ref.faixa).toBe('0°C a 6°C');
    expect(res.faixa).toBe('6°C a 10°C');
  });
});

describe('etiqueta com armazenamento configurável', () => {
  it('a faixa de temperatura sai junto do nome quando o chamador a resolve', () => {
    const c = montarCamposEtiqueta({
      nome: 'Molho', dataFabricacao: '2026-08-24', armazenamento: 'ambiente',
      armazenamentoNome: 'Temperatura ambiente', armazenamentoFaixa: 'até 25°C',
      produto: { prazos: { ambiente: 90 } },
    });
    expect(c.armazenamentoLabel).toBe('TEMPERATURA AMBIENTE');
    expect(c.armazenamentoFaixa).toBe('até 25°C');
    expect(c.validade).toBe('2026-11-22'); // 24/08 + 90 dias
  });

  // Compatibilidade: chamada antiga (sem nome/faixa) não pode perder o rótulo.
  it('sem nome resolvido, congelado/resfriado ainda saem rotulados', () => {
    const c = montarCamposEtiqueta({ nome: 'Picanha', dataFabricacao: '2026-08-24', armazenamento: 'congelado' });
    expect(c.armazenamentoLabel).toBe('CONGELADO');
    expect(c.armazenamentoFaixa).toBe('');
  });

  it('prazo do produto continua vindo do formato antigo na montagem da etiqueta', () => {
    const c = montarCamposEtiqueta({
      nome: 'Picanha', dataFabricacao: '2026-08-24', armazenamento: 'congelado',
      produto: { valCongelado: 30, valResfriado: 3 },
    });
    expect(c.validade).toBe('2026-09-23'); // 24/08 + 30 dias
  });
});

describe('biblioteca de itens prontos', () => {
  it('não tem id repetido — id repetido faria um item sobrescrever o outro', () => {
    const ids = BIBLIOTECA_ETIQUETAS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toda categoria usada existe na ordem de exibição', () => {
    const fora = BIBLIOTECA_ETIQUETAS.filter(i => !CATEGORIAS_BIBLIOTECA.includes(i.categoria));
    expect(fora.map(i => i.nome)).toEqual([]);
  });

  it('busca ignora acento — o cozinheiro digita "acem"', () => {
    expect(buscarNaBiblioteca('acem').map(i => i.nome)).toContain('Acém');
    expect(buscarNaBiblioteca('PICANHA').length).toBeGreaterThan(1); // inteira e porção
  });

  // ⚠️ Item de despensa segue a validade do FABRICANTE: o que a cozinha
  // controla é quando abriu. Prazo inventado ali sairia impresso como data
  // de vencimento numa embalagem que não vence assim.
  it('sal, óleo e tempero saem sem prazo e com data de ABERTURA', () => {
    ['sal', 'azeite', 'vinagre', 'shoyu'].forEach(id => {
      const item = BIBLIOTECA_ETIQUETAS.find(i => i.id === id);
      expect(item, id).toBeTruthy();
      expect(item.tipoData, id).toBe('abertura');
      expect(temAlgumPrazo(item), id).toBe(false);
    });
  });

  // ⚠️ A DISTINÇÃO QUE ESTE GRUPO EXISTE PARA TRAVAR: congelado de carne CRUA
  // não é o mesmo prazo de congelado de PREPARADO da casa. A primeira versão
  // da biblioteca dava 90 dias para tudo, e isso manda picanha boa para o lixo
  // em 3 meses. Se alguém uniformizar os dois de novo, estes testes quebram.
  it('carne crua porcionada congela por MESES, não por 90 dias', () => {
    const picanha = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'picanha_porcao');
    expect(prazoDe(picanha, 'congelado')).toBe(180);   // 6 meses
    expect(prazoDe(picanha, 'refrigerado')).toBe(3);   // frio de trabalho 0-6°C
    const frango = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'peito_de_frango_porcao');
    expect(prazoDe(frango, 'congelado')).toBe(180);
  });

  it('preparado da casa fica no teto de 90 dias congelado', () => {
    const molho = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'molho_de_tomate_da_casa');
    expect(prazoDe(molho, 'congelado')).toBe(90);
    expect(prazoDe(molho, 'refrigerado')).toBe(3);
  });

  // Moída e empanado cru têm mais superfície exposta e oxidam antes.
  it('carne moída dura menos que a peça inteira', () => {
    const moida = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'carne_moida');
    const peca = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'picanha_inteira');
    expect(prazoDe(moida, 'congelado')).toBeLessThan(prazoDe(peca, 'congelado'));
    expect(prazoDe(moida, 'refrigerado')).toBe(2);
  });

  // Pescado gorduroso rancifica antes do magro — não podem ter o mesmo prazo.
  it('pescado gorduroso congela menos que o magro', () => {
    const salmao = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'salmao_em_posta');
    const tilapia = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'file_de_tilapia');
    expect(prazoDe(salmao, 'congelado')).toBeLessThan(prazoDe(tilapia, 'congelado'));
  });

  // ⚠️ Resfriado (0–4°C) e refrigerado (4–10°C) são faixas diferentes. Alface
  // na faixa da picanha e picanha na faixa da alface estão os dois errados.
  // ⚠️ REFRIGERADO (0–6°C) é o frio de TRABALHO — carne, pescado, laticínio,
  // frios e preparado. RESFRIADO (6–10°C) é a faixa mais alta, para hortifrúti
  // inteiro que sofre no frio forte (tomate estraga a textura abaixo de ~7°C).
  it('proteína e laticínio no frio de trabalho; hortifrúti sensível na faixa alta', () => {
    ['picanha_porcao', 'queijo_mussarela', 'alface'].forEach(id => {
      const i = BIBLIOTECA_ETIQUETAS.find(x => x.id === id);
      expect(prazoDe(i, 'refrigerado'), id).toBeGreaterThan(0);
    });
    const tomate = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'tomate');
    expect(tomate.armazenamentoSugerido).toBe('resfriado');
    expect(prazoDe(tomate, 'resfriado')).toBeGreaterThan(0);
  });

  // ⚠️ Sem isto o azeite saía com "CONGELADO" impresso: a impressão pegava o
  // primeiro armazenamento da lista quando o item não dizia o dele.
  it('todo item diz em qual armazenamento fica', () => {
    const sem = BIBLIOTECA_ETIQUETAS.filter(i => !i.armazenamentoSugerido);
    expect(sem.map(i => i.nome)).toEqual([]);
  });

  // ⚠️ Item que sugere um armazenamento SEM prazo naquele estado imprime
  // etiqueta SEM data de vencimento — em silêncio. Aconteceu de verdade ao
  // trocar as faixas de resfriado/refrigerado: o tomate passou a sugerir
  // 'resfriado' e o prazo dele ficou em 'refrigerado'.
  it('todo item com prazo tem prazo NO estado que ele sugere', () => {
    const ruins = BIBLIOTECA_ETIQUETAS
      .filter(i => Object.values(i.prazos || {}).some(v => v > 0))
      .filter(i => !(Number(i.prazos[i.armazenamentoSugerido]) > 0))
      .map(i => `${i.nome} sugere ${i.armazenamentoSugerido} mas o prazo está em ${Object.keys(i.prazos).join('/')}`);
    expect(ruins).toEqual([]);
  });

  // Refrigerado (0–6°C) é o frio de TRABALHO; resfriado (6–10°C) é a faixa
  // mais alta. Proteína e laticínio no primeiro, hortifrúti sensível no outro.
  it('proteína e laticínio ficam no frio de trabalho (refrigerado)', () => {
    ['picanha_porcao', 'file_de_tilapia', 'queijo_mussarela', 'leite_aberto'].forEach(id => {
      const i = BIBLIOTECA_ETIQUETAS.find(x => x.id === id);
      expect(prazoDe(i, 'refrigerado'), id).toBeGreaterThan(0);
    });
  });

  it('agrupa na ordem definida, e categoria criada pelo cliente vai para o fim', () => {
    const grupos = agruparPorCategoria([
      { nome: 'X', categoria: 'VEGANOS' },
      { nome: 'Y', categoria: 'AVES' },
      { nome: 'Z', categoria: 'BOVINOS' },
    ]);
    expect(grupos.map(([c]) => c)).toEqual(['BOVINOS', 'AVES', 'VEGANOS']);
  });
});

describe('produto contratado (utils/produto.js)', () => {
  it('etiquetas compra etiqueta e validade, mas não estoque nem financeiro', () => {
    expect(produtoTem('etiquetas', 'etiquetas')).toBe(true);
    expect(produtoTem('etiquetas', 'validadesEtiqueta')).toBe(true);
    expect(produtoTem('etiquetas', 'estoque')).toBe(false);
    expect(produtoTem('etiquetas', 'financeiro')).toBe(false);
    expect(produtoTem('etiquetas', 'administracao')).toBe(false);
  });

  it('completo compra tudo', () => {
    expect(produtoTem('completo', 'estoque')).toBe(true);
    expect(produtoTem('completo', 'etiquetas')).toBe(true);
    expect(produtoTem('completo', 'financeiro')).toBe(true);
  });

  // ⚠️ Mesma trava do temRecurso: um `!== false` aqui abriria tela paga para
  // quem não comprou, por causa de um nome de recurso digitado errado.
  it('recurso inexistente é FALSE, nunca "liga sozinho"', () => {
    expect(produtoTem('etiquetas', 'recursoQueNaoExiste')).toBe(false);
    expect(produtoTem('completo', 'recursoQueNaoExiste')).toBe(false);
  });

  it('produto desconhecido cai no completo (banco sem a migração 27)', () => {
    expect(produtoTem(undefined, 'estoque')).toBe(true);
    expect(produtoTem('xpto', 'estoque')).toBe(true);
  });

  it('sessão sem produto vale como completo', () => {
    expect(produtoAtivo({ restauranteId: 'r1' })).toBe('completo');
    expect(produtoAtivo({ restauranteId: 'r1', produto: 'etiquetas' })).toBe('etiquetas');
  });

  // ⚠️ Sem isto o suporte abre o app inteiro dentro de uma conta de etiquetas,
  // vê o estoque vazio (o cliente nunca lançou nada) e diagnostica um problema
  // que não existe.
  it('no modo suporte, o produto do CLIENTE manda sobre o do super-admin', () => {
    const superAdmin = { eSuperAdmin: true }; // sem restauranteId, sem produto
    expect(produtoAtivo(superAdmin, { produto: 'etiquetas' })).toBe('etiquetas');
    expect(produtoAtivo(superAdmin, null)).toBe('completo');
  });
});

describe('Pix BR Code', () => {
  it('CRC16-CCITT-FALSE de "123456789" = 29B1', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
  it('monta um BR Code válido, com o CRC no fim conferindo', () => {
    const code = montarPixBRCode({ chave: 'teste@aurum.app', nome: 'Aurum Gastronomia', cidade: 'Recife', valor: 149, txid: 'MENSAL' });
    expect(code.startsWith('000201')).toBe(true);          // formato
    expect(code.includes('5406149.00')).toBe(true);         // valor 149,00
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4));   // CRC bate
  });
  it('sem chave, retorna string vazia (cai no fallback WhatsApp)', () => {
    expect(montarPixBRCode({ chave: '', valor: 149 })).toBe('');
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
describe('custoDosRegistros — perda de recebimento nao some mais', () => {
  const prods = [{ id: 'file', nome: 'File', unidade: 'kg' }];

  it('custeia a perda de recebimento pela compra associada', () => {
    const r = custoDosRegistros(
      [{ data: '2026-08-02', quantidade: 2, unidade: 'kg', compraId: 'c1', origem: 'recebimento' }],
      prods, {},
      { compras: [{ id: 'c1', quantidade: 10, unidade: 'kg', valorTotal: 500 }] });
    expect(r.total).toBe(100);      // 2 kg x (500/10)
    expect(r.semCusto).toBe(0);
  });

  it('sem compra associada, ao menos CONTA em vez de sumir', () => {
    const r = custoDosRegistros(
      [{ data: '2026-08-02', quantidade: 2, origem: 'recebimento' }], prods, {}, {});
    expect(r.total).toBe(0);
    expect(r.semCusto).toBe(1);
  });

  it('nao inventa custo quando a unidade da perda difere da compra', () => {
    const r = custoDosRegistros(
      [{ data: '2026-08-02', quantidade: 3, unidade: 'kg', compraId: 'c2' }],
      prods, {},
      { compras: [{ id: 'c2', quantidade: 2, unidade: 'cx', valorTotal: 200 }] });
    expect(r.total).toBe(0);
    expect(r.semCusto).toBe(1);
  });
});

// O pedido do dono: "que fique claro em um relatorio os desperdicios e aparas
// DIARIOS de cada cozinha". O relatorio tinha "por dia" para saidas e chegadas,
// mas apara e perda so apareciam como total do periodo em dois donuts.
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

describe('outbox — identidade estável dos itens', () => {
  it('outboxUid não repete em chamadas seguidas no mesmo milissegundo', () => {
    const ids = Array.from({ length: 500 }, () => outboxUid());
    expect(new Set(ids).size).toBe(500);
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

describe('módulos — namespacing sem migração', () => {
  it('o módulo PADRÃO mantém exatamente as chaves e tipos de hoje', () => {
    // Esta é a garantia de que nenhum restaurante que já usa o app precisa
    // converter dado: no módulo de produção tudo continua onde sempre esteve.
    for (const chave of ['produtos', 'categorias', 'entradas', 'saidas', 'prefs']) {
      expect(chaveModulo(MODULO_PADRAO, chave)).toBe(chave);
    }
    for (const tipo of ['entrada', 'saida', 'compra', 'apara', 'perda', 'ajuste']) {
      expect(tipoModulo(MODULO_PADRAO, tipo)).toBe(tipo);
    }
  });

  it('módulo novo isola por prefixo', () => {
    expect(chaveModulo('seco', 'produtos')).toBe('seco::produtos');
    expect(tipoModulo('seco', 'entrada')).toBe('seco:entrada');
  });

  it('lerTipo devolve o módulo e o tipo de volta', () => {
    expect(lerTipo('seco:entrada')).toEqual({ modulo: 'seco', tipo: 'entrada' });
    expect(lerTipo('entrada')).toEqual({ modulo: MODULO_PADRAO, tipo: 'entrada' });
  });

  it('registro antigo sem prefixo cai na produção (compatibilidade)', () => {
    // um registro gravado antes do multi-módulo não pode sumir da tela
    expect(lerTipo('saida').modulo).toBe(MODULO_PADRAO);
    // prefixo desconhecido (dado estranho) também não some: vai para produção
    expect(lerTipo('xpto:entrada')).toEqual({ modulo: MODULO_PADRAO, tipo: 'xpto:entrada' });
  });

  // Regressão: o destino fixo "Cozinha de Finalização" só era semeado quando o
  // documento `locais` NÃO existia. Toda conta criada antes dele já tinha o
  // documento salvo, então o destino nunca aparecia e a ponte entre as duas
  // cozinhas ficava inalcançável pela tela.
  describe('mesclarFixos — repõe o destino fixo em conta já criada', () => {
    const PADRAO = [{ id: 'finalizacao', nome: 'Cozinha de Finalização', fixo: true }, { id: 'salao', nome: 'Salão' }];

    it('acrescenta o fixo que falta sem mexer no que o restaurante criou', () => {
      const salvos = [{ id: 'salao', nome: 'Salão' }, { id: 'delivery', nome: 'Delivery' }];
      const r = mesclarFixos(salvos, PADRAO);
      expect(r.map(x => x.id)).toEqual(['salao', 'delivery', 'finalizacao']);
      expect(r.find(x => x.id === 'finalizacao').fixo).toBe(true);
    });

    it('preserva o nome se o restaurante renomeou o destino fixo', () => {
      const salvos = [{ id: 'finalizacao', nome: 'Praça quente' }];
      expect(mesclarFixos(salvos, PADRAO)[0].nome).toBe('Praça quente');
    });

    it('remarca como fixo o item que perdeu a marca (senão a tela deixa remover)', () => {
      const salvos = [{ id: 'finalizacao', nome: 'Cozinha de Finalização' }];
      expect(mesclarFixos(salvos, PADRAO)[0].fixo).toBe(true);
    });

    it('nada a repor devolve a MESMA referência — senão a hidratação grava a cada abertura', () => {
      const salvos = [{ id: 'finalizacao', nome: 'Cozinha de Finalização', fixo: true }, { id: 'salao', nome: 'Salão' }];
      expect(mesclarFixos(salvos, PADRAO)).toBe(salvos);
    });

    it('aguenta lista ausente ou corrompida', () => {
      expect(mesclarFixos(undefined, PADRAO).map(x => x.id)).toEqual(['finalizacao']);
      expect(mesclarFixos(null, PADRAO)).toHaveLength(1);
    });
  });

  it('a finalização lê o catálogo da produção (mesmo id dos dois lados)', () => {
    // se isto mudar, a ponte entre as cozinhas para de casar os produtos
    expect(catalogoDe('finalizacao')).toBe(MODULO_PADRAO);
    expect(chaveModulo(catalogoDe('finalizacao'), 'produtos')).toBe('produtos');
    expect(chaveModulo(catalogoDe('seco'), 'produtos')).toBe('seco::produtos');
  });

  it('ida e volta: gravar e ler devolve o mesmo módulo', () => {
    for (const mod of ['producao', 'seco']) {
      for (const tipo of ['entrada', 'saida', 'ajuste']) {
        expect(lerTipo(tipoModulo(mod, tipo))).toEqual({ modulo: mod, tipo });
      }
    }
  });

  it('estoque seco não tem receita nem apara; produção tem tudo', () => {
    expect(temRecurso('seco', 'receitas')).toBe(false);
    expect(temRecurso('seco', 'producao')).toBe(false);
    expect(temRecurso('seco', 'aparas')).toBe(false);
    expect(temRecurso('seco', 'inventario')).toBe(true);
    expect(temRecurso('producao', 'receitas')).toBe(true);
    expect(temRecurso('producao', 'aparas')).toBe(true);
  });

  // No seco a COMPRA JA E A ENTRADA: você compra 12 pacotes de arroz e eles SAO
  // o item do estoque. Ter duas telas para o mesmo ato fazia a pessoa registrar
  // a compra e o saldo nao mexer. Na Producao seguem separadas, porque la sao
  // atos diferentes (compra o cru, porciona depois).
  it('no seco a compra dá entrada; na produção não', () => {
    expect(temRecurso('seco', 'compraEntraNoEstoque')).toBe(true);
    expect(temRecurso('seco', 'entradas')).toBe(false);
    expect(temRecurso('producao', 'compraEntraNoEstoque')).toBe(false);
    expect(temRecurso('producao', 'entradas')).toBe(true);
  });

  it('seco usa a validade DO PRODUTOR, não um prazo calculado', () => {
    expect(temRecurso('seco', 'validadeDoProdutor')).toBe(true);
    expect(temRecurso('producao', 'validadeDoProdutor')).toBe(false);
  });

  it('seco não gera etiqueta: o mantimento chega lacrado e já etiquetado', () => {
    expect(temRecurso('seco', 'etiquetas')).toBe(false);
    expect(temRecurso('producao', 'etiquetas')).toBe(true);
    expect(temRecurso('finalizacao', 'etiquetas')).toBe(true);
  });

  it('a auditoria fica fora do namespace (é do restaurante, não do módulo)', () => {
    expect(ehTipoGlobal('auditoria')).toBe(true);
    expect(ehTipoGlobal('entrada')).toBe(false);
  });
});

describe('outbox — erro definitivo não fica retentando', () => {
  it('violação de constraint morre na 1ª tentativa (não gasta 8 retries)', () => {
    // Cenário real: módulo novo cujo tipo ainda não foi liberado na migração 17.
    // Retentar não vai mudar a resposta do banco — o usuário precisa saber logo.
    const item = registrarFalha({ kind: 'registro', _ultimoErro: 'new row for relation "registros" violates check constraint "registros_tipo_check"' });
    expect(item._morto).toBe(true);
    expect(item._tentativas).toBe(1);
  });

  it('erro de rede continua retentando até o limite', () => {
    let item = { kind: 'registro', _ultimoErro: 'Failed to fetch' };
    for (let i = 1; i < MAX_TENTATIVAS_OUTBOX; i++) {
      item = registrarFalha({ ...item, _ultimoErro: 'Failed to fetch' });
      expect(item._morto).toBe(false);
    }
    item = registrarFalha({ ...item, _ultimoErro: 'Failed to fetch' });
    expect(item._morto).toBe(true); // só morre no limite
  });

  it('reconhece os erros que nunca passam num retry', () => {
    expect(ehErroDefinitivo('violates check constraint')).toBe(true);
    expect(ehErroDefinitivo('violates foreign key constraint')).toBe(true);
    expect(ehErroDefinitivo('timeout')).toBe(false);
    expect(ehErroDefinitivo(undefined)).toBe(false);
  });
});

describe('módulos — despensa não tem câmara fria', () => {
  it('produção distingue congelado/resfriado; seco não', () => {
    expect(temRecurso('producao', 'armazenamento')).toBe(true);
    expect(temRecurso('seco', 'armazenamento')).toBe(false);
  });

  it('no seco a validade sai do prazo único de prateleira', () => {
    // Sem câmara fria o prazo do fabricante fica em valCongelado (campo único
    // na tela "Prazo de prateleira"). A etiqueta precisa usá-lo mesmo sem
    // rótulo de armazenamento — antes disso ela saía SEM validade.
    const campos = montarCamposEtiqueta({
      nome: 'Arroz tipo 1', dataFabricacao: '2026-08-05',
      diasValidade: 365, armazenamento: null,
    });
    expect(campos.validade).toBe('2027-08-05');
    expect(campos.armazenamentoLabel).toBe(''); // sem CONGELADO/RESFRIADO na etiqueta
  });

  it('item de despensa sem prazo (descartável) não ganha validade', () => {
    const campos = montarCamposEtiqueta({
      nome: 'Guardanapo', dataFabricacao: '2026-08-05', diasValidade: 0, armazenamento: null,
    });
    expect(campos.validade).toBeNull();
    expect(campos.validadeFmt).toBe('');
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

describe('etiqueta com id de lote (leitura por QR)', () => {
  it('id de lote entra no QR e volta na leitura', () => {
    const campos = montarCamposEtiqueta({
      nome: 'Molho da casa', dataFabricacao: '2026-08-05', diasValidade: 5,
      responsavel: 'Joana', loteId: 'k3f9x2',
    });
    const qr = montarPayloadQR(campos);
    expect(qr).toContain('L: k3f9x2');
    expect(lerLoteIdDoQR(qr)).toBe('k3f9x2');
  });

  it('QR sem id de lote (etiqueta antiga) não quebra a leitura', () => {
    const qr = montarPayloadQR(montarCamposEtiqueta({ nome: 'Molho', dataFabricacao: '2026-08-05', diasValidade: 5 }));
    expect(lerLoteIdDoQR(qr)).toBeNull();
  });

  it('texto de QR alheio não é confundido com etiqueta nossa', () => {
    expect(lerLoteIdDoQR('https://exemplo.com')).toBeNull();
    expect(lerLoteIdDoQR('')).toBeNull();
  });

  it('ids de lote não repetem nem em lote grande', () => {
    // Regressão: a 1ª versão colidia (371 únicos em 400) e a leitura contaria
    // o pote errado. 2000 é bem acima de qualquer impressão real.
    const ids = Array.from({ length: 2000 }, () => gerarLoteId());
    expect(new Set(ids).size).toBe(2000);
  });

  it('COM id de lote o QR continua na versão 6 (limite de legibilidade)', async () => {
    // O id só pôde entrar porque o nome do restaurante saiu. Este teste trava
    // isso: se alguém devolver o Rest: ao payload, o QR passa de 41 módulos e
    // volta a não escanear na térmica.
    const { default: QRCode } = await import('qrcode');
    const campos = montarCamposEtiqueta({
      nome: 'EMPANADO DE FILÉ MIGNON PORCIONADO (PORÇÃO)',
      dataFabricacao: '2026-08-05', diasValidade: 90, hora: '10:52',
      responsavel: 'Joana da Silva Sobrinho', restauranteNome: 'Restaurante Muito Longo Ltda',
      loteId: 'k3f9x2',
    });
    const qr = montarPayloadQR(campos);
    expect(qr).not.toContain('Rest:');
    expect(qr.length).toBeLessThanOrEqual(QR_MAX_CARACTERES);
    const { version, modules } = QRCode.create(qr, { errorCorrectionLevel: 'M' });
    expect(version).toBeLessThanOrEqual(6);
    expect((22 / modules.size) * (203 / 25.4)).toBeGreaterThanOrEqual(4);
  });
});

describe('ciclo de vida da etiqueta', () => {
  const hj = '2026-08-05';
  it('vencida é derivada da data, não precisa ser gravada', () => {
    expect(statusEtiqueta({ validade: '2026-08-01' }, hj)).toBe('vencida');
    expect(statusEtiqueta({ validade: '2026-08-10' }, hj)).toBe('valida');
    expect(statusEtiqueta({ validade: null }, hj)).toBe('valida');
  });

  it('consumida/descartada têm prioridade sobre o vencimento', () => {
    expect(statusEtiqueta({ validade: '2026-08-01', status: 'consumida' }, hj)).toBe('consumida');
    expect(statusEtiqueta({ validade: '2026-08-01', status: 'descartada' }, hj)).toBe('descartada');
  });

  it('poda mantém o que ainda pode estar na prateleira', () => {
    const lista = [
      { id: 'a', validade: '2026-09-01', impressoEm: '2026-01-01' },   // válida, antiga: FICA
      { id: 'b', validade: '2026-08-01', impressoEm: '2026-01-01' },   // venceu há 4 dias: FICA
      { id: 'c', status: 'consumida', impressoEm: '2026-08-01' },      // encerrada recente: FICA
      { id: 'd', status: 'consumida', impressoEm: '2025-01-01' },      // encerrada antiga: SAI
    ];
    const ids = podarEtiquetas(lista, hj).map(e => e.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('vencida velha SAI — senão o catálogo cresce para sempre', () => {
    // Regressão: a 1ª versão devolvia true para toda vencida, então nada era
    // podado de fato e o documento crescia sem limite até estourar a cota do
    // localStorage (que falha em silêncio e derruba o modo offline inteiro).
    const lista = [
      { id: 'recem', validade: '2026-07-20', impressoEm: '2026-07-01' }, // venceu há 16d: FICA
      { id: 'velha', validade: '2026-01-10', impressoEm: '2026-01-01' }, // venceu há 7 meses: SAI
    ];
    expect(podarEtiquetas(lista, hj).map(e => e.id)).toEqual(['recem']);
  });

  it('teto de segurança limita o total guardado', () => {
    const muitas = Array.from({ length: MAX_ETIQUETAS_GUARDADAS + 500 }, (_, i) => ({
      id: `e${i}`, validade: '2026-12-01', impressoEm: '2026-08-01',
    }));
    expect(podarEtiquetas(muitas, hj).length).toBe(MAX_ETIQUETAS_GUARDADAS);
  });
});

describe('módulos — regressões da auditoria', () => {
  it('recurso não declarado NÃO liga a tela sozinho', () => {
    // Regressão: com `!== false`, 'fecharTurno' (só da finalização) aparecia na
    // Produção e no Seco, levando a uma tela que dizia "nada recebido" para sempre.
    expect(temRecurso('producao', 'fecharTurno')).toBe(false);
    expect(temRecurso('seco', 'fecharTurno')).toBe(false);
    expect(temRecurso('finalizacao', 'fecharTurno')).toBe(true);
    // nome inexistente/errado também não pode ligar nada
    expect(temRecurso('producao', 'recursoQueNaoExiste')).toBe(false);
  });

  it('todo módulo declara todos os recursos usados (sem default implícito)', () => {
    const chaves = new Set();
    Object.values(RECURSOS_MODULO).forEach(r => Object.keys(r).forEach(c => chaves.add(c)));
    Object.entries(RECURSOS_MODULO).forEach(([mod, r]) => {
      chaves.forEach(c => {
        expect(typeof r[c], `módulo "${mod}" não declara o recurso "${c}"`).toBe('boolean');
      });
    });
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
describe('conciliarAuditoria — otimista local x definitiva do banco', () => {
  const L = (acao, ts, detalhe = '') => ({ id: `${ts}_abcd`, ts, acao, detalhe });
  const S = (acao, ts, detalhe = '') => ({ id: 'a1b2c3d4e5f60718', ts, acao, detalhe });

  it('descarta a local que já chegou do banco', () => {
    const servidor = [S('registrou entrada', 1000)];
    const locais = [L('registrou entrada', 1200)];
    expect(conciliarAuditoria(servidor, locais)).toEqual([]);
  });

  it('mantém a local que ainda não subiu (fila offline)', () => {
    const servidor = [S('registrou entrada', 1000)];
    const locais = [L('registrou saída', 1200)];
    expect(conciliarAuditoria(servidor, locais)).toHaveLength(1);
  });

  it('detalhe diferente não é a mesma linha', () => {
    const servidor = [S('registrou perda', 1000, 'Filé 2kg')];
    expect(conciliarAuditoria(servidor, [L('registrou perda', 1000, 'Charque 5kg')])).toHaveLength(1);
  });

  it('casa 1 para 1: duas ações idênticas de verdade continuam aparecendo duas vezes', () => {
    const servidor = [S('registrou entrada', 1000)];
    const locais = [L('registrou entrada', 1000), L('registrou entrada', 1050)];
    expect(conciliarAuditoria(servidor, locais)).toHaveLength(1);
  });

  it('fora da janela de tempo não casa (ação repetida dias depois é outra linha)', () => {
    const servidor = [S('registrou entrada', 1000)];
    expect(conciliarAuditoria(servidor, [L('registrou entrada', 1000 + 5 * 60000)])).toHaveLength(1);
  });

  it('listas vazias ou ausentes não quebram', () => {
    expect(conciliarAuditoria([], [L('x', 1)])).toHaveLength(1);
    expect(conciliarAuditoria(undefined, undefined)).toEqual([]);
  });
});

// ⚠️ SEGURANÇA. O logout de uma conta real não apagava NADA do cache: num
// tablet de cozinha, compartilhado por definição, o próximo usuário lia
// produtos, custos e histórico pelo DevTools. Estes testes travam as duas
// metades da regra — apagar o dado, e NÃO apagar trabalho não sincronizado.
describe('limparCacheLocal — logout não pode deixar dado no aparelho', () => {
  // O código de produção usa `Object.keys(localStorage)`, e no localStorage REAL
  // isso devolve as chaves guardadas. Num objeto comum devolveria os métodos —
  // por isso os métodos entram como NÃO enumeráveis e os dados ficam como
  // propriedades próprias. Mock que não imita isso passa sem testar nada.
  let store;
  beforeEach(() => {
    store = {};
    Object.defineProperties(store, {
      getItem:    { value: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null) },
      setItem:    { value: (k, v) => { store[k] = String(v); } },
      removeItem: { value: (k) => { delete store[k]; } },
    });
    globalThis.localStorage = store;
  });

  const semir = (k, v) => { store[k] = JSON.stringify(v); };

  it('apaga os dados de conta de TODOS os restaurantes do aparelho', () => {
    semir('pe::rest_a::produtos', [{ id: 'x' }]);
    semir('pe::rest_a::entradas', [{ id: 'e1' }]);
    semir('pe::rest_b::produtos', [{ id: 'y' }]);   // outra conta que usou o mesmo tablet
    semir('pe::rest_a::auditoria', [{ acao: 'x' }]);
    limparCacheLocal();
    expect(Object.keys(store)).toEqual([]);
  });

  it('preserva a preferência do APARELHO (senão o tablet esquece o estoque aberto)', () => {
    store['pe::modulo'] = 'seco';
    semir('pe::rest_a::produtos', [{ id: 'x' }]);
    limparCacheLocal();
    expect(store['pe::modulo']).toBe('seco');
    expect(store['pe::rest_a::produtos']).toBeUndefined();
  });

  it('NÃO apaga fila com item vivo — seria destruir lançamento que não subiu', () => {
    semir('pe::rest_a::_outbox', [{ _uid: '1', kind: 'registro' }]);
    semir('pe::rest_a::produtos', [{ id: 'x' }]);
    limparCacheLocal();
    expect(store['pe::rest_a::_outbox']).toBeDefined();  // trabalho preservado
    expect(store['pe::rest_a::produtos']).toBeUndefined(); // dado apagado
  });

  it('fila só com item MORTO pode sair: já falhou em definitivo, não é trabalho a salvar', () => {
    semir('pe::rest_a::_outbox', [{ _uid: '1', _morto: true }]);
    limparCacheLocal();
    expect(store['pe::rest_a::_outbox']).toBeUndefined();
  });

  it('pendenciasNaoSincronizadas conta os vivos de todas as contas', () => {
    semir('pe::rest_a::_outbox', [{ _uid: '1' }, { _uid: '2', _morto: true }]);
    semir('pe::rest_b::_outbox', [{ _uid: '3' }]);
    expect(pendenciasNaoSincronizadas()).toBe(2); // 2 vivos; o morto não conta
  });
});

// O risco numero um de um relatorio financeiro e dar um numero ERRADO com cara
// de certo — ninguem desconfia de um total. A armadilha aqui e a unidade: a
// compra e na unidade do fornecedor (kg de picanha) e o estoque na unidade de
// uso (porcao). Estes testes travam a conversao e, principalmente, travam o
// comportamento de RECUSAR quando nao da para converter.
describe('financeiro — custo por unidade', () => {
  const P = (extra) => ({ id: 'x', nome: 'X', unidade: 'kg', ativo: true, ...extra });

  it('mesma unidade: usa o custo direto', () => {
    expect(custoUnitario(P({ unidade: 'kg' }), { custo: 78.9, unidade: 'kg' })).toBe(78.9);
  });

  it('comprado em kg, estocado por peca: converte pelo peso da peca', () => {
    const r = custoUnitario(P({ unidade: 'unid', pesoUnidade: 180 }), { custo: 60, unidade: 'kg' });
    expect(r).toBeCloseTo(10.8, 5);
  });

  it('comprado por peca, estocado em kg: converte no sentido inverso', () => {
    const r = custoUnitario(P({ unidade: 'kg', pesoUnidade: 500 }), { custo: 12, unidade: 'unid' });
    expect(r).toBeCloseTo(24, 5);
  });

  it('RECUSA converter sem o peso da peca — melhor sem numero que com numero errado', () => {
    expect(custoUnitario(P({ unidade: 'unid', pesoUnidade: 0 }), { custo: 60, unidade: 'kg' })).toBeNull();
  });

  it('RECUSA litro x quilo: exigiria densidade, que o app nao guarda', () => {
    expect(custoUnitario(P({ unidade: 'L' }), { custo: 8, unidade: 'kg' })).toBeNull();
  });

  it('custo ausente, zero ou negativo nao vira valor', () => {
    expect(custoUnitario(P(), null)).toBeNull();
    expect(custoUnitario(P(), { custo: 0, unidade: 'kg' })).toBeNull();
    expect(custoUnitario(P(), { custo: -5, unidade: 'kg' })).toBeNull();
  });
});

describe('financeiro — valor do estoque', () => {
  const produtos = [
    { id: 'file', nome: 'File', categoria: 'PROTEINAS', unidade: 'kg', ativo: true },
    { id: 'queijo', nome: 'Queijo', categoria: 'FRIOS', unidade: 'kg', ativo: true },
    { id: 'oleo', nome: 'Oleo', categoria: 'SECOS', unidade: 'L', ativo: true },
  ];
  const estoque = { file: 10, queijo: 4, oleo: 6 };
  const precos = { file: { custo: 80, unidade: 'kg' }, queijo: { custo: 40, unidade: 'kg' } };

  it('soma so o que da para calcular', () => {
    const r = valorDoEstoque(produtos, estoque, precos);
    expect(r.total).toBe(960);
    expect(r.porCategoria['PROTEINAS']).toBe(800);
    expect(r.porCategoria['FRIOS']).toBe(160);
  });

  it('DENUNCIA o que ficou de fora — total que esconde item mente por omissao', () => {
    const r = valorDoEstoque(produtos, estoque, precos);
    expect(r.semCusto.map(i => i.id)).toEqual(['oleo']);
  });

  it('item zerado sem preco nao vira ruido na lista de pendencias', () => {
    const r = valorDoEstoque(produtos, { file: 10, queijo: 4, oleo: 0 }, precos);
    expect(r.semCusto).toEqual([]);
  });

  it('produto inativo fica de fora', () => {
    const r = valorDoEstoque(
      [...produtos, { id: 'z', nome: 'Z', unidade: 'kg', ativo: false }],
      { ...estoque, z: 100 },
      { ...precos, z: { custo: 10, unidade: 'kg' } });
    expect(r.itens.some(i => i.id === 'z')).toBe(false);
  });

  it('lista sai ordenada do mais caro para o mais barato', () => {
    const r = valorDoEstoque(produtos, estoque, precos);
    expect(r.itens.map(i => i.id)).toEqual(['file', 'queijo']);
  });
});

describe('financeiro — curva ABC', () => {
  it('classifica pelo acumulado: quem CRUZA a fronteira ainda e da classe de baixo', () => {
    const r = curvaABC([{ id: 'a', valor: 85 }, { id: 'b', valor: 10 }, { id: 'c', valor: 5 }]);
    expect(r.find(i => i.id === 'a').classe).toBe('A');
    expect(r.find(i => i.id === 'b').classe).toBe('B');
    expect(r.find(i => i.id === 'c').classe).toBe('C');
  });

  it('percentual acumulado fecha em 100', () => {
    const r = curvaABC([{ id: 'a', valor: 50 }, { id: 'b', valor: 30 }, { id: 'c', valor: 20 }]);
    expect(r[r.length - 1].pctAcumulado).toBe(100);
  });

  it('lista vazia ou sem valor nao quebra', () => {
    expect(curvaABC([])).toEqual([]);
    expect(curvaABC([{ id: 'a', valor: 0 }])).toEqual([]);
  });
});

describe('financeiro — custo do que saiu e do que estragou', () => {
  const produtos = [{ id: 'file', nome: 'File', unidade: 'kg', ativo: true }];
  const precos = { file: { custo: 80, unidade: 'kg' } };

  it('soma lancamento com lista de itens (saida/producao)', () => {
    const r = custoDosRegistros([{ data: '2026-08-10', itens: [{ produtoId: 'file', quantidade: 2 }] }], produtos, precos);
    expect(r.total).toBe(160);
  });

  it('soma lancamento com produtoId na raiz (perda/apara)', () => {
    const r = custoDosRegistros([{ data: '2026-08-10', produtoId: 'file', quantidade: 1.5 }], produtos, precos);
    expect(r.total).toBe(120);
  });

  it('respeita a janela de datas', () => {
    const regs = [
      { data: '2026-08-01', produtoId: 'file', quantidade: 1 },
      { data: '2026-08-20', produtoId: 'file', quantidade: 1 },
    ];
    expect(custoDosRegistros(regs, produtos, precos, { de: '2026-08-10' }).total).toBe(80);
  });

  it('conta quantos ficaram sem custo em vez de somar zero em silencio', () => {
    const r = custoDosRegistros([{ produtoId: 'desconhecido', quantidade: 3 }], produtos, precos);
    expect(r.total).toBe(0);
    expect(r.semCusto).toBe(1);
  });
});

describe('financeiro — preco vindo da compra (ultima compra manda)', () => {
  it('divide o valor pago pela quantidade e guarda de quando e', () => {
    const r = precoDaCompra({ produtoId: 'file', quantidade: 20, valorTotal: 1578, unidade: 'kg', data: '2026-08-21', fornecedor: 'Bom Corte' });
    expect(r.custo).toBe(78.9);
    expect(r.unidade).toBe('kg');
    expect(r.em).toBe('2026-08-21');
    expect(r.fornecedor).toBe('Bom Corte');
  });

  it('compra sem produto vinculado nao gera preco (nao da para saber de quem e)', () => {
    expect(precoDaCompra({ quantidade: 20, valorTotal: 1578 })).toBeNull();
  });

  it('sem valor ou com quantidade zero nao gera preco', () => {
    expect(precoDaCompra({ produtoId: 'file', quantidade: 20 })).toBeNull();
    expect(precoDaCompra({ produtoId: 'file', quantidade: 0, valorTotal: 100 })).toBeNull();
  });
});

// Varios estoques do MESMO tipo na mesma conta (Estoque Seco do Restaurante X e
// do Y). O que estes testes travam e a REGRA QUE EVITA MIGRACAO: a instancia
// raiz mantem o id de sempre, e o separador '#' nao atrapalha o lerTipo, que
// corta no primeiro ':'.
describe('instancias — varios estoques do mesmo tipo', () => {
  it('tipoBase tira o sufixo, e id sem sufixo continua igual', () => {
    expect(tipoBase('seco#x7k2')).toBe('seco');
    expect(tipoBase('seco')).toBe('seco');
    expect(tipoBase('producao')).toBe('producao');
    expect(tipoBase(undefined)).toBe('');
  });

  it('lerTipo devolve a instancia inteira — o "#" nao confunde o corte no ":"', () => {
    expect(lerTipo('seco#x7k2:entrada')).toEqual({ modulo: 'seco#x7k2', tipo: 'entrada' });
    expect(lerTipo('finalizacao#b3nq:perda')).toEqual({ modulo: 'finalizacao#b3nq', tipo: 'perda' });
  });

  it('a chave e o tipo do banco levam a instancia', () => {
    expect(chaveModulo('seco#x7k2', 'produtos')).toBe('seco#x7k2::produtos');
    expect(tipoModulo('seco#x7k2', 'entrada')).toBe('seco#x7k2:entrada');
  });

  it('a instancia RAIZ nao muda nada — e o que dispensa migracao de dados', () => {
    expect(chaveModulo('seco', 'produtos')).toBe('seco::produtos');
    expect(tipoModulo('producao', 'entrada')).toBe('entrada');
    expect(chaveModulo(MODULO_PADRAO, 'produtos')).toBe('produtos');
  });

  it('CATALOGO e por TIPO: toda instancia de seco le o mesmo catalogo', () => {
    // e o que torna o balanco consolidado possivel — somar por produtoId so
    // funciona porque o id e o mesmo dos dois lados
    expect(catalogoDe('seco#x7k2')).toBe('seco');
    expect(catalogoDe('seco#b9dd')).toBe('seco');
    expect(chaveModulo(catalogoDe('seco#x7k2'), 'produtos')).toBe('seco::produtos');
  });

  it('toda finalizacao — inclusive instancia nova — le o catalogo da producao', () => {
    expect(catalogoDe('finalizacao')).toBe(MODULO_PADRAO);
    expect(catalogoDe('finalizacao#b3nq')).toBe(MODULO_PADRAO);
    expect(chaveModulo(catalogoDe('finalizacao#b3nq'), 'produtos')).toBe('produtos');
  });

  it('mas o SALDO e separado: a chave de lancamento leva a instancia', () => {
    // catalogo igual, estoque diferente — que e exatamente o pedido do dono
    expect(chaveModulo('seco#x7k2', 'entradas')).toBe('seco#x7k2::entradas');
    expect(chaveModulo('seco#b9dd', 'entradas')).toBe('seco#b9dd::entradas');
  });

  it('recursos vem do TIPO: instancia nova herda tudo sem configurar', () => {
    expect(temRecurso('seco#x7k2', 'receitas')).toBe(false);
    expect(temRecurso('seco#x7k2', 'entradas')).toBe(false);   // no seco a compra ja da entrada
    expect(temRecurso('finalizacao#b3nq', 'fecharTurno')).toBe(true);
    expect(temRecurso('finalizacao#b3nq', 'compras')).toBe(false);
  });

  it('moduloPorId acha o rotulo do tipo mesmo com sufixo', () => {
    expect(moduloPorId('seco#x7k2').label).toBe('Estoque Seco');
    // ícone e NOME de desenho SVG, nao emoji: emoji renderiza diferente em cada
    // aparelho e nao aceita a cor da marca.
    expect(moduloPorId('finalizacao#b3nq').icone).toBe('frigideira');
  });

  // ⚠️ O TESTE MAIS IMPORTANTE DESTE BLOCO.
  // Se moduloValido consultasse o REGISTRO de instancias em vez do FORMATO,
  // arquivar uma instancia faria lerTipo cair no fallback "prefixo desconhecido
  // = dado antigo" e despejar o estoque daquele restaurante DENTRO DA PRODUCAO,
  // sem erro nenhum.
  it('validacao e por FORMATO — id de instancia arquivada nao vira dado da producao', () => {
    expect(moduloValido('seco#x7k2')).toBe(true);
    expect(lerTipo('seco#x7k2:entrada').modulo).toBe('seco#x7k2');
  });

  it('formato invalido NAO passa — senao qualquer lixo viraria estoque', () => {
    expect(moduloValido('seco#x')).toBe(false);        // curto demais
    expect(moduloValido('seco#X7K2')).toBe(false);     // maiuscula
    expect(moduloValido('xpto#x7k2')).toBe(false);     // tipo inexistente
    expect(moduloValido('seco#x7k2z')).toBe(false);    // longo demais
    expect(ehIdInstancia('seco')).toBe(false);         // raiz nao e instancia
  });

  it('prefixo desconhecido continua caindo na producao (compatibilidade)', () => {
    expect(lerTipo('xpto:entrada')).toEqual({ modulo: MODULO_PADRAO, tipo: 'xpto:entrada' });
  });

  it('gerarIdInstancia produz id valido e nao repete o que ja existe', () => {
    const existentes = [];
    for (let i = 0; i < 200; i++) {
      const id = gerarIdInstancia('seco', existentes);
      expect(ehIdInstancia(id)).toBe(true);
      expect(tipoBase(id)).toBe('seco');
      existentes.push({ id });
    }
    expect(new Set(existentes.map(x => x.id)).size).toBe(200);
  });

  it('gerarIdInstancia recusa tipo inexistente em vez de criar estoque fantasma', () => {
    expect(() => gerarIdInstancia('xpto')).toThrow();
  });

  it('o alfabeto do id evita caracteres que se confundem ao ler em voz alta', () => {
    const ids = Array.from({ length: 300 }, () => gerarIdInstancia('seco'));
    const sufixos = ids.map(i => i.split('#')[1]).join('');
    expect(/[ilo01]/.test(sufixos)).toBe(false);
  });

  it('ida e volta sobrevive para instancia, como ja sobrevivia para modulo', () => {
    for (const mod of ['producao', 'seco', 'seco#x7k2', 'finalizacao#b3nq']) {
      for (const tipo of ['entrada', 'saida', 'ajuste', 'perda']) {
        expect(lerTipo(tipoModulo(mod, tipo))).toEqual({ modulo: mod, tipo });
      }
    }
  });
});

describe('registro de estoques — os tres de sempre + os que o dono criar', () => {
  it('sem documento nenhum, devolve exatamente os tres originais', () => {
    // conta que nunca criou instancia nao pode ter nada para migrar
    const l = listarEstoques(undefined);
    expect(l.map(e => e.id)).toEqual(['producao', 'finalizacao', 'seco']);
    expect(l.every(e => e.raiz)).toBe(true);
    expect(l[0].nome).toBe('Cozinha de Producao'.replace('Producao', 'Produção'));
  });

  it('agrupa cada instancia logo abaixo da raiz do tipo dela', () => {
    const doc = { itens: [
      { id: 'seco#x7k2', nome: 'Seco do X', criadoEm: 2 },
      { id: 'seco#b9dd', nome: 'Seco do Y', criadoEm: 1 },
      { id: 'finalizacao#b3nq', nome: 'Final do Y', criadoEm: 3 },
    ] };
    const l = listarEstoques(doc);
    expect(l.map(e => e.id)).toEqual([
      'producao',
      'finalizacao', 'finalizacao#b3nq',
      'seco', 'seco#b9dd', 'seco#x7k2',   // ordem de criacao dentro do tipo
    ]);
  });

  it('ignora id invalido no documento em vez de criar estoque fantasma', () => {
    const l = listarEstoques({ itens: [{ id: 'xpto#zzzz' }, { id: 'seco#XX11' }, null] });
    expect(l.map(e => e.id)).toEqual(['producao', 'finalizacao', 'seco']);
  });

  it('a RAIZ nunca fica arquivada, mesmo se o documento disser que sim', () => {
    // ela e o destino de queda quando uma instancia some, e onde moram os dados
    // de quem usa o app desde antes das instancias
    const l = listarEstoques({ itens: [{ id: 'seco', arquivado: true }] });
    expect(l.find(e => e.id === 'seco').arquivado).toBe(false);
  });

  it('instancia sem nome ganha um rotulo legivel em vez de ficar em branco', () => {
    const l = listarEstoques({ itens: [{ id: 'seco#x7k2' }] });
    expect(l.find(e => e.id === 'seco#x7k2').nome).toBe('Estoque Seco (x7k2)');
  });

  it('arquivado sai do seletor mas continua na lista completa', () => {
    const l = listarEstoques({ itens: [{ id: 'seco#x7k2', nome: 'X', arquivado: true }] });
    expect(l.some(e => e.id === 'seco#x7k2')).toBe(true);
    expect(estoquesAtivos(l).some(e => e.id === 'seco#x7k2')).toBe(false);
  });
});

// A etiqueta e IMPRESSA e vai para o pote: sair com o nome do outro restaurante
// e erro visivel na frente do cliente.
describe('nome do estabelecimento na etiqueta — opcional, com queda', () => {
  it('usa o nome do ESTOQUE quando o dono preencheu', () => {
    expect(estabelecimentoDe({ estabelecimento: 'Restaurante Y' }, 'Conta Matriz')).toBe('Restaurante Y');
  });

  it('cai para o nome da CONTA quando o estoque nao tem — quem tem uma casa so nao preenche nada', () => {
    expect(estabelecimentoDe({ estabelecimento: '' }, 'Restaurante X')).toBe('Restaurante X');
    expect(estabelecimentoDe({}, 'Restaurante X')).toBe('Restaurante X');
    expect(estabelecimentoDe(null, 'Restaurante X')).toBe('Restaurante X');
  });

  it('espaco em branco nao conta como nome preenchido', () => {
    expect(estabelecimentoDe({ estabelecimento: '   ' }, 'Restaurante X')).toBe('Restaurante X');
  });

  it('sem nenhum dos dois, devolve vazio em vez de "undefined" impresso', () => {
    expect(estabelecimentoDe({}, '')).toBe('');
    expect(estabelecimentoDe(undefined, undefined)).toBe('');
  });
});

describe('salvarEstoque — cria, renomeia e arquiva', () => {
  it('cria a instancia nova preservando as que ja existiam', () => {
    const doc = { itens: [{ id: 'seco#x7k2', nome: 'X' }] };
    const d2 = salvarEstoque(doc, { id: 'seco#b9dd', nome: 'Y', criadoEm: 7 });
    expect(d2.itens.map(i => i.id).sort()).toEqual(['seco#b9dd', 'seco#x7k2']);
  });

  it('renomear NAO mexe no id — senao todo lancamento gravado ficaria orfao', () => {
    const doc = salvarEstoque({ itens: [{ id: 'seco#x7k2', nome: 'Antigo', criadoEm: 5 }] },
                              { id: 'seco#x7k2', nome: 'Novo' });
    const i = doc.itens[0];
    expect(i.id).toBe('seco#x7k2');
    expect(i.nome).toBe('Novo');
    expect(i.criadoEm).toBe(5);   // data de criacao preservada
  });

  it('arquivar mantem a linha no documento (o historico precisa dela)', () => {
    const doc = salvarEstoque({ itens: [{ id: 'seco#x7k2', nome: 'X' }] },
                              { id: 'seco#x7k2', arquivado: true });
    expect(doc.itens[0].arquivado).toBe(true);
    expect(doc.itens[0].nome).toBe('X');
  });

  it('personalizar a RAIZ grava; limpar a personalizacao tira a linha do documento', () => {
    const comNome = salvarEstoque({}, { id: 'seco', estabelecimento: 'Restaurante X' });
    expect(comNome.itens).toHaveLength(1);
    const semNome = salvarEstoque(comNome, { id: 'seco', estabelecimento: '', nome: '' });
    expect(semNome.itens).toHaveLength(0);   // volta ao padrao do codigo
  });
});

// O id do estoque aberto fica no APARELHO, nao na conta.
describe('moduloUtilizavel — tablet que abre um estoque que nao existe mais', () => {
  const lista = listarEstoques({ itens: [
    { id: 'seco#x7k2', nome: 'X' },
    { id: 'seco#morto', nome: 'Antigo', arquivado: true },
  ] });

  it('estoque valido continua valendo', () => {
    expect(moduloUtilizavel(lista, 'seco#x7k2')).toBe('seco#x7k2');
  });

  it('ARQUIVADO cai na raiz do tipo — senao a pessoa opera um estoque que ninguem ve', () => {
    expect(moduloUtilizavel(lista, 'seco#morto')).toBe('seco');
  });

  it('id que nao existe no registro cai na raiz do tipo', () => {
    // acontece com tablet levado de uma unidade para outra
    expect(moduloUtilizavel(lista, 'seco#nada')).toBe('seco');
  });

  it('raiz sempre serve', () => {
    expect(moduloUtilizavel(lista, 'producao')).toBe('producao');
  });
});

describe('acharEstoque — nunca devolve nada', () => {
  const lista = listarEstoques({ itens: [{ id: 'seco#x7k2', nome: 'X' }] });
  it('acha pelo id', () => {
    expect(acharEstoque(lista, 'seco#x7k2').nome).toBe('X');
  });
  it('id desconhecido cai na raiz do tipo em vez de devolver undefined', () => {
    expect(acharEstoque(lista, 'seco#nada').id).toBe('seco');
  });
});

// FASE 3 — cada estoque tem o SEU min/max para o MESMO produto do catalogo
// compartilhado. Era o pedido explicito do dono: "as quantidades de cada
// estoque de cada item e unica, ate para ter o controle de min e max".
describe('metas por estoque — mesmo produto, alvos diferentes', () => {
  const catalogo = [
    { id: 'arroz',  nome: 'Arroz',  unidade: 'unid', min: 4, max: 12, ativo: true },
    { id: 'feijao', nome: 'Feijao', unidade: 'unid', min: 6, max: 20, ativo: true },
  ];

  it('sem meta nenhuma, devolve o catalogo INTACTO (mesma referencia)', () => {
    // identidade importa: se mudasse, todo useMemo que depende de `produtos`
    // invalidaria a cada render — perceptivel num tablet barato
    expect(comMetas(catalogo, {})).toBe(catalogo);
    expect(comMetas(catalogo, null)).toBe(catalogo);
  });

  it('a meta do estoque sobrepoe o min/max do catalogo', () => {
    const r = comMetas(catalogo, { arroz: { min: 20, max: 50 } });
    expect(r.find(p => p.id === 'arroz').min).toBe(20);
    expect(r.find(p => p.id === 'arroz').max).toBe(50);
  });

  it('o que NAO e min/max continua vindo do catalogo compartilhado', () => {
    const r = comMetas(catalogo, { arroz: { min: 20, max: 50 } });
    const arroz = r.find(p => p.id === 'arroz');
    expect(arroz.nome).toBe('Arroz');       // nome e compartilhado
    expect(arroz.unidade).toBe('unid');
  });

  it('produto sem meta fica com o objeto ORIGINAL, nao uma copia', () => {
    const r = comMetas(catalogo, { arroz: { min: 20, max: 50 } });
    expect(r.find(p => p.id === 'feijao')).toBe(catalogo[1]);
  });

  it('meta igual a do catalogo nao cria objeto novo', () => {
    expect(comMetas(catalogo, { arroz: { min: 4, max: 12 } })).toBe(catalogo);
  });

  it('meta com valor invalido cai para o do catalogo em vez de virar NaN', () => {
    const r = comMetas(catalogo, { arroz: { min: 'abc', max: null } });
    expect(r.find(p => p.id === 'arroz').min).toBe(4);
    expect(r.find(p => p.id === 'arroz').max).toBe(12);
  });
});

describe('separarMetas — a gravacao vai para o lugar certo sozinha', () => {
  // O dadosRef do AppContext nao expunha produtosCat nem metas, entao a chamada
  // real era separarMetas(undefined, lista, undefined): devolvia sempre
  // { catalogo: <lista COM min/max dentro>, metas: null }, o documento `metas`
  // nunca era gravado, e o minimo de um restaurante ia para a chave
  // compartilhada por tipo, por cima do outro. Nada disso dava erro na tela.
  it('recusa a chamada sem catalogo em vez de mandar o min/max para o lugar errado', () => {
    expect(() => separarMetas(undefined, [{ id: 'arroz', min: 20, max: 40 }], undefined))
      .toThrow(/catálogo atual não foi passado/);
  });

  const catalogo = [
    { id: 'arroz', nome: 'Arroz', unidade: 'unid', min: 4, max: 12, ativo: true },
  ];

  it('mudar SO o min/max grava em metas e NAO toca no catalogo', () => {
    // e o que impede o min do Restaurante Y de sobrescrever o do X
    const nova = [{ ...catalogo[0], min: 20, max: 50 }];
    const r = separarMetas(catalogo, nova, {});
    expect(r.metas).toEqual({ arroz: { min: 20, max: 50 } });
    expect(r.catalogo).toBeNull();
  });

  it('mudar o NOME grava no catalogo e nao inventa meta', () => {
    const nova = [{ ...catalogo[0], nome: 'Arroz tipo 1' }];
    const r = separarMetas(catalogo, nova, {});
    expect(r.catalogo[0].nome).toBe('Arroz tipo 1');
    expect(r.metas).toBeNull();
  });

  it('mudar os dois de uma vez separa cada um para o seu lado', () => {
    const nova = [{ ...catalogo[0], nome: 'Arroz tipo 1', min: 20, max: 50 }];
    const r = separarMetas(catalogo, nova, {});
    expect(r.catalogo[0].nome).toBe('Arroz tipo 1');
    expect(r.catalogo[0].min).toBe(4);        // catalogo preserva o min original
    expect(r.metas.arroz).toEqual({ min: 20, max: 50 });
  });

  it('produto NOVO entra no catalogo com o min/max que veio', () => {
    // catalogo e compartilhado: item recem-criado precisa nascer igual em todos
    const nova = [...catalogo, { id: 'sal', nome: 'Sal', unidade: 'kg', min: 2, max: 8, ativo: true }];
    const r = separarMetas(catalogo, nova, {});
    expect(r.catalogo).toHaveLength(2);
    expect(r.catalogo[1].min).toBe(2);
  });

  it('nada mudou = nada e gravado (nao suja o documento a toa)', () => {
    const r = separarMetas(catalogo, [{ ...catalogo[0] }], {});
    expect(r.catalogo).toBeNull();
    expect(r.metas).toBeNull();
  });

  it('voltar a meta para o valor do catalogo continua sendo uma meta explicita', () => {
    const r = separarMetas(catalogo, [{ ...catalogo[0], min: 4, max: 12 }], { arroz: { min: 20, max: 50 } });
    expect(r.metas.arroz).toEqual({ min: 4, max: 12 });
  });
});

// A Administracao precisa mostrar o relatorio do Estoque Seco enquanto a cozinha
// segue com a Producao aberta. Antes o cartao trocava o estoque ATIVO — clicar
// num relatorio mudava onde a equipe ia lancar.
describe('visao de um estoque sem trocar o que esta aberto', () => {
  const linha = (id, tipo, dados) => ({ id, tipo, ts: 1, dados, deleted: false });
  const conv = (l) => ({ id: l.id, ts: l.ts, ...l.dados });

  const linhas = [
    linha('a', 'seco:entrada',       { data: '2026-08-01', itens: [{ produtoId: 'arroz', quantidade: 100 }] }),
    linha('b', 'seco#x7k2:entrada',  { data: '2026-08-01', itens: [{ produtoId: 'arroz', quantidade: 7 }] }),
    linha('c', 'seco#x7k2:saida',    { data: '2026-08-02', itens: [{ produtoId: 'arroz', quantidade: 2 }], destino: 'cozinha' }),
    linha('d', 'auditoria',          { acao: 'x' }),
  ];

  it('cada estoque recebe so os lancamentos dele', () => {
    const f = fatiarPorEstoque(linhas, ['seco', 'seco#x7k2'], conv);
    expect(f['seco'].entradas.map(r => r.id)).toEqual(['a']);
    expect(f['seco#x7k2'].entradas.map(r => r.id)).toEqual(['b']);
    expect(f['seco#x7k2'].saidas.map(r => r.id)).toEqual(['c']);
  });

  it('auditoria e da CONTA e nao entra em estoque nenhum', () => {
    const f = fatiarPorEstoque(linhas, ['seco', 'seco#x7k2'], conv);
    const tudo = [...f['seco'].entradas, ...f['seco'].saidas, ...f['seco'].compras];
    expect(tudo.some(r => r.id === 'd')).toBe(false);
  });

  it('a saida da producao vira RECEBIMENTO da finalizacao destinataria', () => {
    const comPonte = [
      linha('e', 'saida', { data: '2026-08-01', destino: 'finalizacao#b3nq', itens: [{ produtoId: 'molho', quantidade: 5 }] }),
      linha('f', 'saida', { data: '2026-08-01', destino: 'finalizacao', itens: [{ produtoId: 'molho', quantidade: 9 }] }),
    ];
    const f = fatiarPorEstoque(comPonte, ['finalizacao', 'finalizacao#b3nq'], conv);
    expect(f['finalizacao#b3nq'].recebimentos.map(r => r.id)).toEqual(['e']);
    expect(f['finalizacao'].recebimentos.map(r => r.id)).toEqual(['f']);
  });

  // A ponte aceitava QUALQUER destino que fosse id de estoque. A baixa de
  // ingrediente da receita grava destino 'producao' (Producao.jsx), que sempre
  // existe, entao ela voltava como recebimento do proprio estoque e anulava a
  // saida: a Administracao mostrava 20 kg onde a operacao mostrava 15.
  it('saida INTERNA de receita nao vira recebimento do proprio estoque', () => {
    const internas = [
      linha('g', 'entrada', { data: '2026-08-01', itens: [{ produtoId: 'file', quantidade: 20 }] }),
      linha('h', 'saida',   { data: '2026-08-02', destino: 'producao', itens: [{ produtoId: 'file', quantidade: 5 }] }),
    ];
    const f = fatiarPorEstoque(internas, ['producao', 'finalizacao'], conv);
    expect(f['producao'].recebimentos).toEqual([]);
    expect(f['producao'].saidas.map(r => r.id)).toEqual(['h']);

    const docs = { produtos: [{ id: 'file', nome: 'File', unidade: 'kg', min: 0, max: 0, ativo: true }] };
    const v = visaoDoEstoque({ id: 'producao', docs, registrosFatiados: f, aplicarMetas: comMetas });
    expect(v.estoque.file).toBe(15);   // 20 entraram, 5 sairam para a receita
  });

  // Com instancias era pior: a saida interna de 'producao#ab12' tem destino
  // 'producao' (a raiz), entao o ingrediente de um restaurante era somado como
  // recebimento no estoque de OUTRO.
  it('saida interna de uma INSTANCIA nao credita a raiz do mesmo tipo', () => {
    const f = fatiarPorEstoque(
      [linha('i', 'producao#ab12:saida', { data: '2026-08-02', destino: 'producao', itens: [{ produtoId: 'file', quantidade: 5 }] })],
      ['producao', 'producao#ab12'], conv);
    expect(f['producao'].recebimentos).toEqual([]);
    expect(f['producao#ab12'].saidas.map(r => r.id)).toEqual(['i']);
  });

  // O Relatorio lia categorias/locais/destinos do estoque ABERTO, nao do que
  // estava sendo VISTO. Com a Producao aberta e o relatorio mostrando o Seco, a
  // tabela iterava PROTEINAS/PRODUZIDOS/DIVERSOS contra produtos do Seco
  // (GRAOS, ENLATADOS...) — intersecao zero, corpo da tabela EM BRANCO, e o
  // relatorio dizia na pratica que nada se moveu no periodo.
  it('a visao carrega os catalogos de apoio DO ESTOQUE VISTO', () => {
    const docs = {
      'seco::categorias': ['GRAOS E FARINACEOS', 'ENLATADOS'],
      'seco::locais': [{ id: 'despensa', nome: 'Despensa' }],
      'seco::destinos': [{ cod: 'D1', label: 'Doacao' }],
      categorias: ['PROTEINAS', 'PRODUZIDOS'],   // catalogo da PRODUCAO
    };
    const f = fatiarPorEstoque([], ['seco'], conv);
    const v = visaoDoEstoque({ id: 'seco', docs, registrosFatiados: f, aplicarMetas: comMetas });
    expect(v.categorias).toEqual(['GRAOS E FARINACEOS', 'ENLATADOS']);
    expect(v.locais[0].nome).toBe('Despensa');
    expect(v.destinos[0].label).toBe('Doacao');
  });

  it('sem documento proprio, cai para o padrao DO TIPO e nao para o do aberto', () => {
    const f = fatiarPorEstoque([], ['seco'], conv);
    const v = visaoDoEstoque({
      id: 'seco',
      docs: { categorias: ['PROTEINAS'] },        // so a Producao tem doc
      registrosFatiados: f,
      padroes: { categorias: ['GRAOS E FARINACEOS'], locais: [], destinos: [] },
      aplicarMetas: comMetas,
    });
    expect(v.categorias).toEqual(['GRAOS E FARINACEOS']);
  });

  it('SALDO separado com CATALOGO compartilhado — o pedido do dono', () => {
    const docs = {
      'seco::produtos': [{ id: 'arroz', nome: 'Arroz', unidade: 'unid', min: 4, max: 12, ativo: true }],
      'seco#x7k2::metas': { arroz: { min: 20, max: 50 } },
    };
    const f = fatiarPorEstoque(linhas, ['seco', 'seco#x7k2'], conv);
    const raiz = visaoDoEstoque({ id: 'seco', docs, registrosFatiados: f, aplicarMetas: comMetas });
    const inst = visaoDoEstoque({ id: 'seco#x7k2', docs, registrosFatiados: f, aplicarMetas: comMetas });

    expect(raiz.estoque.arroz).toBe(100);        // saldos diferentes
    expect(inst.estoque.arroz).toBe(5);          // 7 entraram, 2 sairam
    expect(raiz.produtos[0].nome).toBe('Arroz'); // mesmo cadastro
    expect(inst.produtos[0].nome).toBe('Arroz');
    expect(raiz.produtos[0].min).toBe(4);        // metas diferentes
    expect(inst.produtos[0].min).toBe(20);
  });
});

// Dois defeitos que faziam o numero da Cozinha de Finalizacao dar errado — o
// dono relatou "o consumo e o que sobra esta dando errado" e os dois estavam
// silenciosos: nenhum erro, so numero torto.
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

describe('CNPJ e telefone (utils/documentos.js)', () => {
  // ⚠️ O CNPJ e a trava contra criar conta nova toda semana para renovar o
  // teste gratis. Se validarCNPJ afrouxar, a trava inteira cai junto.
  it('aceita CNPJ com digito verificador correto, com e sem mascara', () => {
    expect(validarCNPJ('11222333000181')).toBe(true);
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true);
  });

  it('recusa digito verificador errado', () => {
    expect(validarCNPJ('11222333000182')).toBe(false);
    expect(validarCNPJ('11222333000191')).toBe(false);
  });

  // ⚠️ 00000000000000 e 11111111111111 PASSAM no modulo 11. Sem a checagem de
  // digitos repetidos, catorze vezes o mesmo numero viraria CNPJ valido.
  it('recusa todos os digitos iguais, que passam no modulo 11', () => {
    expect(validarCNPJ('00000000000000')).toBe(false);
    expect(validarCNPJ('11111111111111')).toBe(false);
    expect(validarCNPJ('99999999999999')).toBe(false);
  });

  it('recusa tamanho errado, vazio e lixo', () => {
    expect(validarCNPJ('1122233300018')).toBe(false);
    expect(validarCNPJ('112223330001812')).toBe(false);
    expect(validarCNPJ('')).toBe(false);
    expect(validarCNPJ(null)).toBe(false);
    expect(validarCNPJ('abcdefghijklmn')).toBe(false);
  });

  it('mascara o CNPJ progressivamente enquanto digita', () => {
    expect(formatarCNPJ('11')).toBe('11');
    expect(formatarCNPJ('11222')).toBe('11.222');
    expect(formatarCNPJ('11222333')).toBe('11.222.333');
    expect(formatarCNPJ('112223330001')).toBe('11.222.333/0001');
    expect(formatarCNPJ('11222333000181')).toBe('11.222.333/0001-81');
    // nao deixa passar de 14 digitos
    expect(formatarCNPJ('112223330001819999')).toBe('11.222.333/0001-81');
  });

  it('telefone aceita fixo (10) e celular (11) com DDD valido', () => {
    expect(validarTelefone('8133334444')).toBe(true);
    expect(validarTelefone('81998184489')).toBe(true);
    expect(validarTelefone('(81) 99818-4489')).toBe(true);
  });

  // ⚠️ E por este numero que o dono ativa a assinatura (Pix + WhatsApp).
  // DDD invalido ou celular sem o 9 significa nao conseguir falar com o cliente.
  it('telefone recusa DDD invalido, celular sem o 9 e tamanho errado', () => {
    expect(validarTelefone('0133334444')).toBe(false);
    expect(validarTelefone('81888184489')).toBe(false);
    expect(validarTelefone('813333444')).toBe(false);
    expect(validarTelefone('')).toBe(false);
  });

  it('mascara o telefone conforme fixo ou celular', () => {
    expect(formatarTelefone('81')).toBe('(81');
    expect(formatarTelefone('8133334444')).toBe('(81) 3333-4444');
    expect(formatarTelefone('81998184489')).toBe('(81) 99818-4489');
  });

  it('soDigitos limpa qualquer formatacao', () => {
    expect(soDigitos('11.222.333/0001-81')).toBe('11222333000181');
    expect(soDigitos('(81) 99818-4489')).toBe('81998184489');
    expect(soDigitos(null)).toBe('');
  });
});

describe('validade que passa da do fornecedor', () => {
  // ⚠️ O erro que este campo existe para pegar: porcionar um produto cuja
  // embalagem vence ANTES do prazo da casa faz a etiqueta imprimir validade
  // maior que a do fabricante. Grave e invisivel — ninguem confere de cabeca.
  const monta = (valOriginal, dias) => montarCamposEtiqueta({
    nome: 'Frango', dataFabricacao: '2026-08-29', armazenamento: 'congelado',
    diasValidade: dias, valOriginal,
  });

  it('avisa quando o prazo da casa ultrapassa a validade do fornecedor', () => {
    const c = monta('2026-10-01', 180);        // 29/08 + 180d = muito depois
    expect(c.validade > '2026-10-01').toBe(true);
    expect(c.passaDoFornecedor).toBe(true);
  });

  it('não avisa quando cabe dentro da validade do fornecedor', () => {
    expect(monta('2027-12-31', 180).passaDoFornecedor).toBe(false);
  });

  // Mesma data não é estouro: vence junto, o que é legítimo.
  it('não avisa quando as duas datas são iguais', () => {
    const c = monta('2026-09-28', 30);          // 29/08 + 30d = 28/09
    expect(c.validade).toBe('2026-09-28');
    expect(c.passaDoFornecedor).toBe(false);
  });

  it('sem val. original preenchida, nunca avisa', () => {
    expect(monta(null, 180).passaDoFornecedor).toBe(false);
    expect(monta('', 180).passaDoFornecedor).toBe(false);
  });

  // Sem prazo não há data calculada para comparar.
  it('sem prazo em dias, nunca avisa', () => {
    expect(monta('2026-09-01', 0).passaDoFornecedor).toBe(false);
  });

  // ⚠️ Desligado por padrão: é mais um campo para a equipe preencher a cada
  // impressão, e o dono decidiu que quem precisa liga em Configurações.
  it('Val. original nasce DESLIGADA na configuração padrão', () => {
    expect(ETIQUETA_CONFIG_PADRAO.campos.valOriginal).toBe(false);
    // as demais continuam ligadas
    expect(ETIQUETA_CONFIG_PADRAO.campos.validade).toBe(true);
    expect(ETIQUETA_CONFIG_PADRAO.campos.armazenamento).toBe(true);
  });
});

describe('Qual caminho de impressão aparece em cada aparelho', () => {
  // `navigator` e somente-leitura no ambiente de teste; trocar precisa passar
  // por defineProperty.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const fingir = (nav) =>
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  afterEach(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); });

  // ⚠️ A REGRA E CONTRAINTUITIVA: o botao que SOME no celular e justamente o
  // que a pessoa conhece. No Android a janela de impressao precisa de um app
  // de terceiro no meio e entrega etiqueta pior — oferecer os dois so convida
  // para o caminho ruim.
  it('celular com Bluetooth vê só a impressão direta', () => {
    fingir({ bluetooth: {}, userAgentData: { mobile: true }, userAgent: '' });
    expect(caminhosDeImpressao()).toEqual({ direto: true, dialogo: false });
  });

  it('iPhone vê só a janela de impressão, que é a única saída que resta', () => {
    fingir({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari', maxTouchPoints: 5 });
    expect(caminhosDeImpressao()).toEqual({ direto: false, dialogo: true });
  });

  // Navegador dentro do WhatsApp/Instagram: e celular e nao tem bluetooth.
  it('navegador embutido em outro app cai no mesmo caso do iPhone', () => {
    fingir({ userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit', maxTouchPoints: 5 });
    expect(caminhosDeImpressao()).toEqual({ direto: false, dialogo: true });
  });

  it('no computador os dois aparecem', () => {
    fingir({ bluetooth: {}, userAgentData: { mobile: false }, userAgent: 'Windows NT 10.0', maxTouchPoints: 0 });
    expect(caminhosDeImpressao()).toEqual({ direto: true, dialogo: true });
  });

  // ⚠️ iPad moderno se anuncia como Mac. Sem o teste de toque ele seria tratado
  // como computador e ganharia um botao de impressao direta que nunca funciona.
  it('iPad fingindo ser Mac ainda é celular', () => {
    fingir({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', maxTouchPoints: 5 });
    expect(ehCelular()).toBe(true);
  });
});

describe('TSPL — a etiqueta na linguagem da impressora', () => {
  const SEP = String.fromCharCode(13) + String.fromCharCode(10);
  const config = { larguraMm: 60, alturaMm: 50, campos: {} };
  const campos = {
    nome: 'Picanha', medida: '150 g',
    rotuloData: 'MANIPULACAO', dataFabricacaoFmt: '29/08/2026 - 10:00',
    validadeFmt: '25/02/2027 - 10:00', responsavel: 'Maria',
    armazenamentoLabel: 'CONGELADO', armazenamentoFaixa: '-18°C',
    restauranteNome: 'Restaurante Teste',
  };

  it('abre com o tamanho do rolo e fecha mandando imprimir', () => {
    const t = etiquetaTSPL(campos, config);
    expect(t).toContain('SIZE 60 mm,50 mm');
    expect(t).toContain('GAP 2 mm,0 mm');
    expect(t).toContain('CLS');
    expect(t.trim().endsWith('PRINT 1,1')).toBe(true);
  });

  // ⚠️ Copias sao NATIVAS do TSPL. Se o app mandasse N vezes, uma oscilacao no
  // meio da conexao deixaria sair menos etiqueta do que a pessoa pediu.
  it('pede as cópias à impressora, não repete o envio', () => {
    const t = etiquetaTSPL(campos, config, { copias: 5 });
    expect(t).toContain('PRINT 1,5');
    expect(t.match(/PRINT /g)).toHaveLength(1);
    expect(t.match(/SIZE /g)).toHaveLength(1);
  });

  it('leva os dados que a etiqueta mostra', () => {
    const t = etiquetaTSPL(campos, config);
    expect(t).toContain('PICANHA');
    expect(t).toContain('150 g');
    expect(t).toContain('CONGELADO -18C'); // sem o grau: ver o teste de ASCII
    expect(t).toContain('25/02/2027 - 10:00');
    expect(t).toContain('Maria');
  });

  // ⚠️ ESTE TESTE VEIO DE UMA ETIQUETA IMPRESSA DE VERDADE. Mandamos CODEPAGE
  // 1252, que e o correto pelo manual, e a MDK-022 ignorou: "MANIPULACAO" com
  // cedilha saiu "MANIPULA高0", "0°C" saiu "0贊", "Joao" com til saiu "Jo鲷".
  // O firmware esta numa pagina de codigo asiatica. Nenhum acento pode chegar
  // no papel, por nenhum caminho — nome de produto, responsavel ou endereco.
  it('nada acima do ASCII chega na impressora', () => {
    const t = etiquetaTSPL({
      ...campos,
      nome: 'Coração à moda',
      responsavel: 'João',
      armazenamentoLabel: 'REFRIGERADO', armazenamentoFaixa: '0°C a 6°C',
      restauranteNome: 'Açaí & Cia',
    }, { ...config, estabelecimento: { cidade: 'Jaboatão dos Guararapes' } });

    const forasteiro = [...t].find(ch => ch.charCodeAt(0) > 126);
    expect(forasteiro).toBeUndefined();
    expect(t).toContain('CORACAO A MODA');
    expect(t).toContain('Joao');
    expect(t).toContain('0C a 6C');
    expect(t).toContain('Jaboatao dos Guararapes');
  });

  // ⚠️ Nome de 14 letras com medida ao lado saia cortado ("CORACAO A MO.")
  // porque a fonte era escolhida contando LETRAS, e contar letra ignora o
  // tamanho da letra.
  it('o nome diminui de fonte antes de ser cortado', () => {
    const t = etiquetaTSPL({ ...campos, nome: 'Coracao a moda' }, config);
    const linha = t.split(SEP).find(x => x.includes('CORACAO'));
    expect(linha).toContain('CORACAO A MODA');
    expect(linha).not.toContain('.');
  });

  // ⚠️ AS DUAS DATAS NA MESMA COLUNA. A validade ja ficou sozinha embaixo, em
  // fonte maior, para dar destaque — e no papel a data descolava da coluna e a
  // linha parecia orfa. Comparar manipulacao com validade e o que a equipe faz
  // na geladeira, e comparar so funciona alinhado.
  it('validade e manipulação saem alinhadas, uma sob a outra', () => {
    const t = etiquetaTSPL(campos, config).split(SEP).filter(x => x.startsWith('TEXT'));
    const achar = (trecho) => {
      const l = t.find(x => x.includes(trecho));
      return { x: parseInt(l.split(',')[0].replace('TEXT ', '')), y: parseInt(l.split(',')[1]) };
    };
    const dManip = achar('29/08/2026');
    const dVal = achar('25/02/2027');
    expect(dVal.x).toBe(dManip.x);            // mesma coluna
    expect(dVal.y).toBeGreaterThan(dManip.y); // logo abaixo
    expect(dVal.y - dManip.y).toBeLessThanOrEqual(30);
    expect(achar('VALIDADE:').y).toBe(dVal.y); // rotulo junto da data, nao acima
  });

  // ⚠️ Termica nao tem comando de negrito com fonte interna. A dupla batida
  // (mesmo texto, um ponto ao lado) e como se faz — e a validade e o campo que
  // precisa saltar aos olhos dentro de uma camara fria.
  it('a validade sai em negrito, e só ela', () => {
    const t = etiquetaTSPL(campos, config);
    expect(t.split(SEP).filter(x => x.includes('25/02/2027'))).toHaveLength(2);
    expect(t.split(SEP).filter(x => x.includes('29/08/2026'))).toHaveLength(1);
  });

  // ⚠️ SAIU IMPRESSO ASSIM: as quatro linhas do rodape uma POR CIMA da outra,
  // ilegiveis. A altura real da fonte no firmware e maior que a da tabela do
  // manual. Cada linha precisa de passo maior que a altura da fonte que usa.
  it('as linhas do rodapé não se encavalam', () => {
    const t = etiquetaTSPL(campos, { ...config, estabelecimento: {
      cnpj: '12.345.678/0001-90', cep: '54.430-350',
      endereco: 'Av. Anibal Ribeiro, 1210', cidade: 'Jaboatao dos Guararapes' } });
    const rodape = t.split(SEP).filter(x => x.startsWith('TEXT'))
      .map(x => ({ y: parseInt(x.split(',')[1]), fonte: parseInt(x.split('"')[1]) }))
      .filter(x => x.y > 200);
    expect(rodape.length).toBe(4);
    for (let i = 1; i < rodape.length; i++) {
      expect(rodape[i].y - rodape[i - 1].y).toBeGreaterThan(20); // > altura da fonte 2
      expect(rodape[i].fonte).toBeGreaterThanOrEqual(2);         // nunca a fonte 1
    }
  });

  // ⚠️ Com fonte 2 cabem ~36 caracteres na linha. O CNPJ ganhou linha propria
  // porque junto com o CEP estourava e saia CORTADO — justo o dado que
  // identifica a cozinha para a fiscalizacao.
  it('nada do rodapé passa da largura da etiqueta', () => {
    const t = etiquetaTSPL(campos, { ...config, estabelecimento: {
      cnpj: '12.345.678/0001-90', cep: '54.430-350',
      endereco: 'Avenida Anibal Ribeiro Varejao, 1210', cidade: 'Jaboatao dos Guararapes' } });
    const LARG = { 1: 8, 2: 12, 3: 16, 4: 24 };
    for (const l of t.split(SEP).filter(x => x.startsWith('TEXT'))) {
      const partes = l.split('"');
      const conteudo = partes[partes.length - 2];
      const x = parseInt(l.split(',')[0].replace('TEXT ', ''));
      expect(x + conteudo.length * LARG[parseInt(partes[1])]).toBeLessThanOrEqual(60 * PONTOS_POR_MM);
    }
    expect(t).toContain('CNPJ: 12.345.678/0001-90'); // inteiro, sem corte
  });

  // ⚠️ A primeira versao imprimia so o NOME do restaurante e deixava CNPJ e
  // endereco de fora, enquanto a previa da tela mostrava as quatro linhas. O
  // endereco de quem manipulou e o que a fiscalizacao procura.
  it('o rodapé leva o estabelecimento inteiro, como na tela', () => {
    const est = { cnpj: '12.345.678/0001-90', cep: '54.430-350',
      endereco: 'Av. Anibal Ribeiro, 1210', cidade: 'Jaboatao' };
    const t = etiquetaTSPL(campos, { ...config, estabelecimento: est });
    expect(t).toContain('RESTAURANTE TESTE');
    expect(t).toContain('CNPJ: 12.345.678/0001-90');
    expect(t).toContain('Av. Anibal Ribeiro, 1210');
    expect(t).toContain('Jaboatao');

    // ancorado embaixo: uma linha a mais nao empurra nada para fora do papel
    const ys = t.split(SEP).filter(x => x.startsWith('TEXT'))
      .map(x => parseInt(x.split(',')[1]));
    expect(Math.max(...ys)).toBeLessThan(50 * PONTOS_POR_MM);
  });

  // ⚠️ Aspa dupla ENCERRA a string do comando TSPL. Um nome como
  // 'File 1" espessura' cortaria o comando ao meio e a etiqueta sairia
  // truncada — ou nao sairia.
  it('aspas no nome do produto não quebram o comando', () => {
    const t = etiquetaTSPL({ ...campos, nome: 'File 1" grosso' }, config);
    const linhaNome = t.split(SEP).find(l => l.includes('FILE'));
    // uma abertura e um fechamento de fonte + uma abertura e um fechamento de
    // conteudo = 4 aspas exatas na linha
    expect((linhaNome.match(/"/g) || []).length).toBe(4);
  });

  it('campo desligado na configuração não vai para o papel', () => {
    const semResp = etiquetaTSPL(campos, { ...config, campos: { responsavel: false } });
    expect(semResp).not.toContain('Maria');
    expect(semResp).not.toContain('RESP.:');
  });

  it('valor vazio não gera linha', () => {
    const t = etiquetaTSPL({ ...campos, responsavel: '', marca: '' }, config);
    expect(t).not.toContain('RESP.:');
    expect(t).not.toContain('MARCA:');
  });

  // ⚠️ Coordenadas sao em PONTOS, e a impressora e 203 DPI = 8 pontos/mm.
  // Confundir com milimetro poe tudo no canto da etiqueta.
  it('converte milímetro em ponto a 203 DPI', () => {
    expect(PONTOS_POR_MM).toBe(8);
    const t = etiquetaTSPL(campos, { ...config, larguraMm: 60, alturaMm: 50 });
    // a barra separadora usa a largura util (60mm - 2x2,5mm de margem = 55mm)
    expect(t).toContain(`,${55 * 8},2`);
  });

  it('rolo de outro tamanho move tudo junto', () => {
    const t = etiquetaTSPL(campos, { ...config, larguraMm: 40, alturaMm: 30 });
    expect(t).toContain('SIZE 40 mm,30 mm');
    expect(t).toContain(`,${35 * 8},2`);
  });

  it('nome comprido é cortado em vez de estourar a etiqueta', () => {
    const t = etiquetaTSPL({ ...campos, nome: 'FILE MIGNON PORCIONADO ARGENTINO PREMIUM 180G' }, config);
    const linha = t.split(SEP).find(l => l.includes('FILE MIGNON'));
    const conteudo = linha.match(/"([^"]*)"$/)[1];
    expect(conteudo.length).toBeLessThan(45);
    expect(conteudo.endsWith('.')).toBe(true);
  });

  it('lote manda um bloco completo por item', () => {
    const t = loteTSPL([
      { campos, copias: 2 },
      { campos: { ...campos, nome: 'Alface' }, copias: 1 },
    ], config);
    expect(t.match(/SIZE /g)).toHaveLength(2);
    expect(t).toContain('PRINT 1,2');
    expect(t).toContain('PRINT 1,1');
    expect(t).toContain('ALFACE');
  });

  // ⚠️ TextEncoder faria UTF-8, e ali o "Ç" vira DOIS bytes — a impressora
  // leria dois caracteres estranhos. Com CODEPAGE 1252 cada acento e UM byte.
  it('acento sai como um byte só (Windows-1252), não dois', () => {
    expect(etiquetaTSPL(campos, config)).toContain('CODEPAGE 1252');
    const b = paraBytesLatin1('MANIPULAÇÃO');
    expect(b.length).toBe('MANIPULAÇÃO'.length);
    expect(b[8]).toBe(0xc7); // Ç
    expect(new TextEncoder().encode('MANIPULAÇÃO').length).toBeGreaterThan(b.length);
  });

  it('caractere fora da tabela vira "?" em vez de byte inválido', () => {
    const b = paraBytesLatin1('A😀B');
    expect(Array.from(b).every(x => x <= 0xff)).toBe(true);
    expect(b[0]).toBe(65);
  });

  it('cortarParaLargura respeita a largura disponível', () => {
    // fonte 2 = 12 pontos por caractere; 120 pontos = 10 caracteres
    expect(cortarParaLargura('ABCDEFGHIJKLM', 2, 1, 120)).toHaveLength(10);
    expect(cortarParaLargura('ABC', 2, 1, 120)).toBe('ABC');
  });
});
