// Dados do MODO DEMONSTRAÇÃO — 100% locais (nunca tocam o Supabase).
// Gerados em relação ao dia atual para o Dashboard/Relatório parecerem vivos.
//
// MODELO DO PRODUTO (importante): este app é de PRODUÇÃO INTERNA da casa —
// porcionamentos e semiacabados. "Parmegiana" no estoque = EMPANADO (porção);
// o molho é OUTRO item semiacabado; a montagem final acontece na hora de
// servir e fica fora do sistema. A demo precisa ensinar exatamente isso.

import { hoje } from '../utils/formatters';
import { addDias } from '../utils/datas';
import { SECO_BASE, SECO_CATEGORIAS } from './seco';
import { MODULO_PADRAO } from '../utils/modulos';

const d = (n) => addDias(hoje(), -n); // n dias atrás
const ts = (n, h = 10) => Date.now() - n * 86400000 - (24 - h) * 3600000;

const P = (id, nome, categoria, unidade, extra = {}) => ({
  id, nome, categoria, unidade, ativo: true,
  estoqueInicial: 0, min: 0, max: 0, valCongelado: 0, valResfriado: 0, ...extra,
});

/**
 * Seed da demonstração POR MÓDULO.
 *
 * Antes esta função ignorava o módulo e devolvia sempre o estoque da produção,
 * e o ramo demo do AppContext gravava em chaves CRUAS ('produtos', 'compras')
 * sem passar por k()/kc(). Duas consequências: o Estoque Seco da demo exibia
 * picanha e filé mignon — que não são mantimento nenhum — e o que o visitante
 * lançava "no Seco" reaparecia na "Produção", porque os três módulos dividiam
 * a mesma chave de cache.
 */
export function gerarDemoSeed(modulo = MODULO_PADRAO) {
  if (modulo === 'seco') return seedSeco();
  if (modulo === 'finalizacao') return seedFinalizacao();
  return seedProducao();
}

function seedProducao() {
  const produtos = [
    // O estoque da casa é em PORÇÕES/UNIDADES (já porcionadas). A matéria-prima
    // a granel (filé cru, queijo, batata) fica em kg — é a exceção.
    P('picanha', 'Picanha (porção)', 'PROTEÍNAS', 'unid', { min: 20, max: 60, valCongelado: 30, valResfriado: 3, pesoUnidade: 180 }),
    P('frango', 'Filé de Frango (porção)', 'PROTEÍNAS', 'unid', { min: 20, max: 50, valCongelado: 30, valResfriado: 2, pesoUnidade: 150, marca: 'Sadia', sif: '124' }),
    P('tilapia', 'Filé de Tilápia (porção)', 'PROTEÍNAS', 'unid', { min: 15, max: 40, valCongelado: 25, valResfriado: 2, pesoUnidade: 140 }),
    // Matéria-prima crua a granel (kg) — é porcionada/produzida aqui
    P('file', 'Filé Mignon (cru, kg)', 'PROTEÍNAS', 'kg', { min: 8, max: 18, valCongelado: 30, valResfriado: 3 }),
    P('queijo', 'Queijo Muçarela', 'FRIOS', 'kg', { min: 4, max: 10, valResfriado: 12, marca: 'Tirolez' }),
    P('batata', 'Batata Palito Congelada', 'CONGELADOS', 'kg', { min: 10, max: 25, valCongelado: 90 }),
    // Semiacabados produzidos pela casa (porção/base — NUNCA prato montado)
    P('molho', 'Molho de Tomate da Casa', 'PRODUZIDOS', 'L', { min: 5, max: 15, valCongelado: 20, valResfriado: 4 }),
    P('empanado', 'Empanado de Filé (porção)', 'PRODUZIDOS', 'unid', { min: 20, max: 60, valCongelado: 15, valResfriado: 2, pesoUnidade: 150 }),
  ];
  const categorias = ['PROTEÍNAS', 'PRODUZIDOS', 'FRIOS', 'CONGELADOS'];
  const pessoas = ['Maria', 'João'];
  // Destinos de saída = transferência INTERNA (cozinha principal / outras unidades)
  const locais = [{ id: 'cozinha', nome: 'Cozinha principal' }, { id: 'unidade_centro', nome: 'Unidade Centro' }];
  const producoes = [{
    id: 'rec_empanado', nome: 'Empanado de Filé (porcionamento)', produtoFinalId: 'empanado',
    rendimentoBase: 20, armazenamento: 'congelado',
    // porcionamento: abate só a proteína controlada; secos apenas monitorados.
    // SEM molho e SEM queijo — a montagem final não é armazenada.
    ingredientes: [
      { abate: true, produtoId: 'file', quantidade: 3 },
      { abate: false, nome: 'Farinha panko', unidade: 'kg', quantidade: 0.6 },
      { abate: false, nome: 'Ovos', unidade: 'unid', quantidade: 8 },
    ],
  }, {
    id: 'rec_molho', nome: 'Molho de Tomate da Casa', produtoFinalId: 'molho',
    rendimentoBase: 10, armazenamento: 'resfriado',
    ingredientes: [{ abate: false, nome: 'Tomate pelado', unidade: 'kg', quantidade: 8 }],
  }];

  const entrada = (n, itens, extra = {}) => ({
    id: `demo_e${n}_${itens[0].produtoId}`, ts: ts(n), data: d(n), hora: '09:30',
    responsavel: 'Maria', armazenamento: 'congelado',
    itens: itens.map(i => ({ ...i, validade: addDias(d(n), 20) })), ...extra,
  });
  const saida = (n, itens, destino = 'cozinha') => ({
    id: `demo_s${n}_${destino}_${itens[0].produtoId}`, ts: ts(n, 16), data: d(n), hora: '16:00',
    responsavel: 'João', destino, itens,
  });

  const entradas = [
    // filé cru (kg) para produzir; porções de frango já porcionadas (entrada avulsa)
    entrada(6, [{ produtoId: 'file', quantidade: 15 }, { produtoId: 'frango', quantidade: 25 }]),
    entrada(5, [{ produtoId: 'queijo', quantidade: 8 }, { produtoId: 'batata', quantidade: 20 }]),
    // porcionamento puro (cortado e embalado, sem receita): picanha e tilápia em porções
    entrada(4, [{ produtoId: 'picanha', quantidade: 30 }, { produtoId: 'tilapia', quantidade: 20 }]),
    // produção de ontem: molho base + porcionamento do empanado (itens SEPARADOS)
    { id: 'demo_prod_molho', ts: ts(1, 11), data: d(1), hora: '11:00', responsavel: 'Maria', armazenamento: 'resfriado',
      producaoId: 'demo_pid1', obs: 'Produção: Molho de Tomate da Casa (semiacabado)',
      monitorados: [{ nome: 'Tomate pelado', unidade: 'kg', quantidade: 8 }],
      itens: [{ produtoId: 'molho', quantidade: 10, validade: addDias(d(1), 4) }] },
    { id: 'demo_prod_empanado', ts: ts(1, 14), data: d(1), hora: '14:00', responsavel: 'Maria', armazenamento: 'congelado',
      producaoId: 'demo_pid2', obs: 'Produção: Empanado de Filé (porcionamento)',
      monitorados: [{ nome: 'Farinha panko', unidade: 'kg', quantidade: 1.2 }, { nome: 'Ovos', unidade: 'unid', quantidade: 16 }],
      itens: [{ produtoId: 'empanado', quantidade: 40, validade: addDias(d(1), 15) }] },
  ];
  const saidas = [
    saida(4, [{ produtoId: 'frango', quantidade: 5 }]),
    saida(3, [{ produtoId: 'picanha', quantidade: 10 }, { produtoId: 'batata', quantidade: 6 }]),
    saida(2, [{ produtoId: 'frango', quantidade: 6 }], 'unidade_centro'),
    saida(1, [{ produtoId: 'empanado', quantidade: 12 }]),
    saida(0, [{ produtoId: 'empanado', quantidade: 8 }, { produtoId: 'picanha', quantidade: 8 }], 'unidade_centro'),
    // saída interna da produção do empanado (consumo do ingrediente controlado)
    { id: 'demo_s_prod', ts: ts(1, 14), data: d(1), hora: '14:00', responsavel: 'Maria', destino: 'producao', producaoId: 'demo_pid2',
      itens: [{ produtoId: 'file', quantidade: 6 }] },
  ];
  const compras = [
    { id: 'demo_c1', ts: ts(6, 8), data: d(6), hora: '08:20', item: 'Filé Mignon', quantidade: 20, unidade: 'kg', fornecedor: 'Frigorífico Bom Corte', responsavel: 'Maria', produtoId: 'file' },
    { id: 'demo_c2', ts: ts(4, 8), data: d(4), hora: '08:40', item: 'Picanha', quantidade: 18, unidade: 'kg', fornecedor: 'Distribuidora Sertão', responsavel: 'Maria', produtoId: 'picanha' },
  ];
  const aparas = [
    { id: 'demo_a1', ts: ts(6, 9), data: d(6), hora: '09:50', turno: 'Manhã', item: 'Filé Mignon', quantidade: 1.4, unidade: 'kg', destino: 'STG', responsavel: 'Maria', compraId: 'demo_c1', produtoId: 'file' },
  ];
  const desperdicio = [
    { id: 'demo_p1', ts: ts(2, 17), data: d(2), hora: '17:10', turno: 'Tarde', item: 'Queijo Muçarela', quantidade: 0.5, unidade: 'kg', motivo: 'V', origem: 'estoque', produtoId: 'queijo', responsavel: 'João' },
  ];

  return {
    catalogos: {
      produtos, categorias, pessoas, locais, producoes,
      destinos: [{ cod: 'STG', label: 'Strogonoff' }, { cod: 'HAM', label: 'Hambúrguer' }, { cod: 'OUT', label: 'Outro' }],
      fichas: [], listaManual: [],
      etiquetasAvulsas: [{ id: 'demo_etq1', nome: 'Leite aberto', tipoData: 'abertura', diasValidade: 3 }],
      prefs: { responsavel: 'Maria', turno: 'Manhã', destino: 'cozinha', guia: true },
    },
    registros: { compras, entradas, saidas, aparas, desperdicio, ajustes: [], auditoria: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────
//  ESTOQUE SECO — mantimento, não proteína.
//  Reusa SECO_BASE (o catálogo real do módulo) em vez de inventar itens:
//  o visitante vê exatamente o que veria numa conta nova.
//  Sem apara: no seco não existe aproveitamento de corte, só perda.
// ─────────────────────────────────────────────────────────────────────
function seedSeco() {
  const entrada = (n, itens) => ({
    id: `demoSeco_e${n}_${itens[0].produtoId}`, ts: ts(n), data: d(n), hora: '08:40',
    responsavel: 'Maria', itens,
  });
  const saida = (n, itens, destino = 'cozinha') => ({
    id: `demoSeco_s${n}_${itens[0].produtoId}`, ts: ts(n, 15), data: d(n), hora: '15:00',
    responsavel: 'João', destino, itens,
  });

  return {
    catalogos: {
      produtos: SECO_BASE,
      categorias: SECO_CATEGORIAS,
      pessoas: ['Maria', 'João'],
      // No seco a saída é REQUISIÇÃO: quem pediu o mantimento.
      locais: [{ id: 'cozinha', nome: 'Cozinha principal' }, { id: 'salao', nome: 'Salão / Bar' }],
      producoes: [],
      destinos: [{ cod: 'OUT', label: 'Outro' }],
      fichas: [], listaManual: [],
      etiquetasAvulsas: [],
      prefs: { responsavel: 'Maria', turno: 'Manhã', destino: 'cozinha', guia: true },
    },
    registros: {
      compras: [
        { id: 'demoSeco_c1', ts: ts(7, 8), data: d(7), hora: '08:10', item: 'Arroz tipo 1 (5kg)', quantidade: 12, unidade: 'unid', fornecedor: 'Atacado São José', responsavel: 'Maria', produtoId: 'seco_arroz' },
        { id: 'demoSeco_c2', ts: ts(7, 8), data: d(7), hora: '08:15', item: 'Óleo de soja (900ml)', quantidade: 24, unidade: 'unid', fornecedor: 'Atacado São José', responsavel: 'Maria', produtoId: 'seco_oleo' },
      ],
      entradas: [
        entrada(7, [{ produtoId: 'seco_arroz', quantidade: 12 }, { produtoId: 'seco_oleo', quantidade: 24 }]),
        entrada(5, [{ produtoId: 'seco_feijao', quantidade: 20 }, { produtoId: 'seco_extrato', quantidade: 30 }]),
        entrada(3, [{ produtoId: 'seco_marmita', quantidade: 400 }, { produtoId: 'seco_sal', quantidade: 6 }]),
      ],
      saidas: [
        saida(4, [{ produtoId: 'seco_arroz', quantidade: 3 }, { produtoId: 'seco_feijao', quantidade: 5 }]),
        saida(2, [{ produtoId: 'seco_oleo', quantidade: 6 }, { produtoId: 'seco_extrato', quantidade: 8 }]),
        saida(0, [{ produtoId: 'seco_marmita', quantidade: 120 }], 'salao'),
      ],
      aparas: [],
      desperdicio: [
        { id: 'demoSeco_p1', ts: ts(1, 16), data: d(1), hora: '16:20', turno: 'Tarde', item: 'Extrato de tomate (340g)', quantidade: 2, unidade: 'unid', motivo: 'V', origem: 'estoque', produtoId: 'seco_extrato', responsavel: 'João' },
      ],
      ajustes: [
        { id: 'demoSeco_aj1', ts: ts(1, 18), data: d(1), hora: '18:00', responsavel: 'Maria', produtoId: 'seco_feijao', quantidade: 14, inventarioId: 'demoSeco_inv1' },
      ],
      auditoria: [],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
//  COZINHA DE FINALIZAÇÃO — não compra nem porciona: RECEBE da produção
//  e fecha o turno contando a sobra. O catálogo é o da produção (mesmos
//  ids dos dois lados), como catalogoDe() define.
//  Os `recebimentos` são derivados das saídas da produção com destino
//  'finalizacao' — o ramo demo não passa pela ponte, então já entregamos
//  as saídas com esse destino para a tela ter o que mostrar.
// ─────────────────────────────────────────────────────────────────────
function seedFinalizacao() {
  const base = seedProducao();
  const recebe = (n, itens) => ({
    id: `demoFin_r${n}_${itens[0].produtoId}`, ts: ts(n, 9), data: d(n), hora: '09:10',
    responsavel: 'Maria', destino: 'finalizacao', itens,
  });

  return {
    catalogos: {
      ...base.catalogos,
      producoes: [],            // não porciona aqui
      fichas: [],
      listaManual: [],
      prefs: { responsavel: 'João', turno: 'Noite', destino: '', guia: true },
    },
    registros: {
      compras: [], entradas: [], saidas: [], aparas: [],
      // o que estragou na bancada durante o serviço
      desperdicio: [
        { id: 'demoFin_p1', ts: ts(1, 22), data: d(1), hora: '22:10', turno: 'Noite', item: 'Molho de Tomate da Casa', quantidade: 1.5, unidade: 'L', motivo: 'V', origem: 'estoque', produtoId: 'molho', responsavel: 'João' },
      ],
      // contagem da sobra no fim do turno
      ajustes: [
        { id: 'demoFin_aj1', ts: ts(1, 23), data: d(1), hora: '23:30', responsavel: 'João', produtoId: 'empanado', quantidade: 9, inventarioId: 'demoFin_turno1' },
      ],
      auditoria: [],
      recebimentos: [
        recebe(2, [{ produtoId: 'empanado', quantidade: 20 }, { produtoId: 'molho', quantidade: 6 }]),
        recebe(1, [{ produtoId: 'picanha', quantidade: 12 }, { produtoId: 'frango', quantidade: 10 }]),
        recebe(0, [{ produtoId: 'empanado', quantidade: 15 }]),
      ],
    },
  };
}
