// Dados do MODO DEMONSTRAÇÃO — 100% locais (nunca tocam o Supabase).
// Gerados em relação ao dia atual para o Dashboard/Relatório parecerem vivos.

import { hoje } from '../utils/formatters';
import { addDias } from '../utils/datas';

const d = (n) => addDias(hoje(), -n); // n dias atrás
const ts = (n, h = 10) => Date.now() - n * 86400000 - (24 - h) * 3600000;

const P = (id, nome, categoria, unidade, extra = {}) => ({
  id, nome, categoria, unidade, ativo: true,
  estoqueInicial: 0, min: 0, max: 0, valCongelado: 0, valResfriado: 0, ...extra,
});

export function gerarDemoSeed() {
  const produtos = [
    P('file', 'Filé Mignon', 'PROTEÍNAS', 'kg', { min: 10, max: 20, valCongelado: 30, valResfriado: 3, marca: 'Swift', sif: '358' }),
    P('frango', 'Peito de Frango', 'PROTEÍNAS', 'kg', { min: 15, max: 30, valCongelado: 30, valResfriado: 2, marca: 'Sadia', sif: '124' }),
    P('charque', 'Charque', 'PROTEÍNAS', 'kg', { min: 8, max: 16, valCongelado: 45, valResfriado: 5 }),
    P('tilapia', 'Filé de Tilápia', 'PROTEÍNAS', 'kg', { min: 6, max: 12, valCongelado: 25, valResfriado: 2 }),
    P('molho', 'Molho de Tomate da Casa', 'PRODUZIDOS', 'L', { min: 5, max: 15, valCongelado: 20, valResfriado: 4 }),
    P('parmegiana', 'Parmegiana Montada', 'PRODUZIDOS', 'unid', { min: 20, max: 60, valCongelado: 15, valResfriado: 2, pesoUnidade: 150 }),
    P('queijo', 'Queijo Muçarela', 'FRIOS', 'kg', { min: 4, max: 10, valResfriado: 12, marca: 'Tirolez' }),
    P('batata', 'Batata Palito Congelada', 'CONGELADOS', 'kg', { min: 10, max: 25, valCongelado: 90 }),
  ];
  const categorias = ['PROTEÍNAS', 'PRODUZIDOS', 'FRIOS', 'CONGELADOS'];
  const pessoas = ['Maria', 'João'];
  const locais = [{ id: 'salao', nome: 'Salão' }, { id: 'delivery', nome: 'Delivery' }];
  const producoes = [{
    id: 'rec_parm', nome: 'Parmegiana Montada', produtoFinalId: 'parmegiana',
    rendimentoBase: 20, armazenamento: 'congelado',
    ingredientes: [
      { abate: true, produtoId: 'file', quantidade: 3 },
      { abate: true, produtoId: 'molho', quantidade: 2 },
      { abate: true, produtoId: 'queijo', quantidade: 1 },
      { abate: false, nome: 'Farinha panko', unidade: 'kg', quantidade: 0.6 },
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
  const saida = (n, itens, destino = 'salao') => ({
    id: `demo_s${n}_${destino}_${itens[0].produtoId}`, ts: ts(n, 16), data: d(n), hora: '16:00',
    responsavel: 'João', destino, itens,
  });

  const entradas = [
    entrada(6, [{ produtoId: 'file', quantidade: 18 }, { produtoId: 'frango', quantidade: 25 }]),
    entrada(5, [{ produtoId: 'queijo', quantidade: 8 }, { produtoId: 'batata', quantidade: 20 }]),
    entrada(4, [{ produtoId: 'charque', quantidade: 12 }, { produtoId: 'tilapia', quantidade: 10 }]),
    // produção de ontem: molho + parmegianas (entrada do produto final + saída interna)
    { id: 'demo_prod_molho', ts: ts(1, 11), data: d(1), hora: '11:00', responsavel: 'Maria', armazenamento: 'resfriado',
      producaoId: 'demo_pid1', obs: 'Produção: Molho de Tomate da Casa',
      monitorados: [{ nome: 'Tomate pelado', unidade: 'kg', quantidade: 8 }],
      itens: [{ produtoId: 'molho', quantidade: 10, validade: addDias(d(1), 4) }] },
    { id: 'demo_prod_parm', ts: ts(1, 14), data: d(1), hora: '14:00', responsavel: 'Maria', armazenamento: 'congelado',
      producaoId: 'demo_pid2', obs: 'Produção: Parmegiana Montada',
      monitorados: [{ nome: 'Farinha panko', unidade: 'kg', quantidade: 1.2 }],
      itens: [{ produtoId: 'parmegiana', quantidade: 40, validade: addDias(d(1), 15) }] },
  ];
  const saidas = [
    saida(4, [{ produtoId: 'frango', quantidade: 5 }]),
    saida(3, [{ produtoId: 'file', quantidade: 4 }, { produtoId: 'batata', quantidade: 6 }]),
    saida(2, [{ produtoId: 'frango', quantidade: 6 }], 'delivery'),
    saida(1, [{ produtoId: 'parmegiana', quantidade: 12 }]),
    saida(0, [{ produtoId: 'parmegiana', quantidade: 8 }], 'delivery'),
    // saída interna da produção de parmegiana (consumo dos ingredientes)
    { id: 'demo_s_prod', ts: ts(1, 14), data: d(1), hora: '14:00', responsavel: 'Maria', destino: 'producao', producaoId: 'demo_pid2',
      itens: [{ produtoId: 'file', quantidade: 6 }, { produtoId: 'molho', quantidade: 4 }, { produtoId: 'queijo', quantidade: 2 }] },
  ];
  const compras = [
    { id: 'demo_c1', ts: ts(6, 8), data: d(6), hora: '08:20', item: 'Filé Mignon', quantidade: 20, unidade: 'kg', fornecedor: 'Frigorífico Bom Corte', responsavel: 'Maria' },
    { id: 'demo_c2', ts: ts(4, 8), data: d(4), hora: '08:40', item: 'Charque', quantidade: 12, unidade: 'kg', fornecedor: 'Distribuidora Sertão', responsavel: 'Maria' },
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
      prefs: { responsavel: 'Maria', turno: 'Manhã', destino: 'salao', guia: true },
    },
    registros: { compras, entradas, saidas, aparas, desperdicio, ajustes: [], auditoria: [] },
  };
}
