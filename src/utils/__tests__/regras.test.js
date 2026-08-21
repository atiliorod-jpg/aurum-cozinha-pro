import { describe, it, expect, beforeEach } from 'vitest';
import { calcEstoquePuro } from '../estoque';
import { consumoComoSaidas } from '../turno';
import { comprasQueEntram } from '../visaoEstoque';
import { calcLotes, lotesVencendo } from '../lotes';
import { calcSugestoesMinMax } from '../sugestoes';
import { validarDataRegistro, addDias, diasAte } from '../datas';
import { rendimentoPorFornecedor, fatorCorrecaoItem, fatorCorrecaoProduto, mediaDiariaSaidas, previsaoRuptura, listaDeCompras, agruparListaPorMateriaPrima, preparacoesPorMateriaPrima, preparacoesDoItem, nomesCasam } from '../analise';
import { ingredientesParaProduzir, planejarProducao, producoesIncompletas } from '../producao';
import { montarCamposEtiqueta, montarPayloadQR, QR_MAX_CARACTERES, gerarLoteId, lerLoteIdDoQR, statusEtiqueta, podarEtiquetas, MAX_ETIQUETAS_GUARDADAS } from '../etiquetas';
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
import { crc16, montarPixBRCode } from '../pix';
import { saidasPorDestinoDia, chegadasPorDia, rendimentoPorItem, producaoPorItem } from '../relatorios';
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

describe('statusAssinatura — borda dos 7 dias de teste (paridade com o SQL)', () => {
  const DIA = 86400000;
  const base = (createdAt) => ({ restauranteId: 'r1', restauranteCriadoEm: createdAt });

  it('dentro do teste (6 dias) = ok', () => {
    const agora = Date.now();
    const st = statusAssinatura(base(new Date(agora - 6 * DIA).toISOString()), agora);
    expect(st.ok).toBe(true);
    expect(st.tipo).toBe('teste');
  });

  it('passou dos 7 dias sem assinatura = vencido', () => {
    const agora = Date.now();
    const st = statusAssinatura(base(new Date(agora - 8 * DIA).toISOString()), agora);
    expect(st.ok).toBe(false);
    expect(st.tipo).toBe('vencido');
  });

  it('TESTE_DIAS é 7 (precisa bater com migration10)', () => {
    expect(TESTE_DIAS).toBe(7);
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

  it('mensal = R$149 sem desconto', () => {
    expect(precoPlano(plano('mensal'))).toBe(149);
  });
  it('semestral = 10% off (804,60) e mostra economia', () => {
    expect(precoPlano(plano('semestral'))).toBe(804.60);
    expect(precoMensalEquivalente(plano('semestral'))).toBe(134.10);
    expect(economiaPlano(plano('semestral'))).toBe(89.40);
  });
  it('anual = 20% off (1430,40)', () => {
    expect(precoPlano(plano('anual'))).toBe(1430.40);
    expect(precoMensalEquivalente(plano('anual'))).toBe(119.20);
    expect(economiaPlano(plano('anual'))).toBe(357.60);
  });
  it('dias por plano batem com 30/180/365', () => {
    expect(plano('mensal').dias).toBe(30);
    expect(plano('semestral').dias).toBe(180);
    expect(plano('anual').dias).toBe(365);
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
    expect(moduloPorId('finalizacao#b3nq').icone).toBe('🍳');
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
