// Catálogo inicial do módulo Estoque Seco.
//
// São só EXEMPLOS para a tela não abrir vazia — o dono edita/apaga, igual aos
// produtos de exemplo da produção. Sem custo/preço de propósito: o app não
// controla CMV em módulo nenhum (decisão do dono, mantida aqui por coerência).
//
// `valCongelado`/`valResfriado` continuam existindo porque o motor de validade
// é o mesmo; no seco o que vale é `valCongelado` como "prazo de prateleira em
// dias" (ex.: arroz 365). Item sem prazo (0) simplesmente não gera alerta.

export const SECO_CATEGORIAS = ['GRÃOS E FARINÁCEOS', 'ENLATADOS E CONSERVAS', 'TEMPEROS', 'DESCARTÁVEIS', 'LIMPEZA', 'BEBIDAS'];

const item = (id, nome, categoria, unidade, min, max, dias) => ({
  id, nome, categoria, unidade, ativo: true,
  estoqueInicial: 0, min, max,
  valCongelado: dias, valResfriado: 0,
  pesoUnidade: 0, gramatura: 0, coccao: 0, entradaCozida: false,
  marca: '', sif: '',
});

export const SECO_BASE = [
  item('seco_arroz',      'Arroz tipo 1 (5kg)',        'GRÃOS E FARINÁCEOS',     'unid', 4,  12, 365),
  item('seco_feijao',     'Feijão carioca (1kg)',      'GRÃOS E FARINÁCEOS',     'unid', 6,  20, 300),
  item('seco_farinha',    'Farinha de trigo (1kg)',    'GRÃOS E FARINÁCEOS',     'unid', 4,  15, 180),
  item('seco_oleo',       'Óleo de soja (900ml)',      'GRÃOS E FARINÁCEOS',     'unid', 6,  24, 365),
  item('seco_milho',      'Milho verde (lata)',        'ENLATADOS E CONSERVAS',  'unid', 6,  24, 730),
  item('seco_extrato',    'Extrato de tomate (340g)',  'ENLATADOS E CONSERVAS',  'unid', 8,  30, 540),
  item('seco_sal',        'Sal refinado (1kg)',        'TEMPEROS',               'unid', 2,  8,  730),
  item('seco_pimenta',    'Pimenta-do-reino moída',    'TEMPEROS',               'kg',   0.5, 2, 365),
  item('seco_marmita',    'Embalagem marmita 750ml',   'DESCARTÁVEIS',           'unid', 100, 500, 0),
  item('seco_guardanapo', 'Guardanapo (pacote)',       'DESCARTÁVEIS',           'unid', 10, 40, 0),
  item('seco_detergente', 'Detergente neutro (5L)',    'LIMPEZA',                'unid', 2,  8,  0),
  item('seco_agua',       'Água mineral 500ml (fardo)', 'BEBIDAS',               'unid', 5,  20, 180),
];
