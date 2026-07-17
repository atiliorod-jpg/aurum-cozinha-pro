export const CATEGORIAS = [
  'BOVINOS', 'AVES', 'FRUTOS DO MAR', 'SUÍNOS', 'CAPRINOS', 'FRIOS / DIVERSOS'
];

export const PESSOAS_INICIAIS = ['Ceará', 'Priscila'];

export const DESTINOS_APARA = [
  { cod: 'STG', label: 'Strogonoff' },
  { cod: 'CHI', label: 'Carne chinesa' },
  { cod: 'HAM', label: 'Hambúrguer / Almôndega' },
  { cod: 'RCH', label: 'Recheios' },
  { cod: 'CAL', label: 'Caldos / Molhos' },
  { cod: 'SOP', label: 'Sopas / Cremes' },
  { cod: 'PET', label: 'Petiscos' },
  { cod: 'OUT', label: 'Outro' },
];

export const MOTIVOS_DESPERDICIO = [
  { cod: 'V', label: 'Vencimento' },
  { cod: 'P', label: 'Preparo incorreto' },
  { cod: 'S', label: 'Sobra de produção' },
  { cod: 'A', label: 'Avaria' },
  { cod: 'D', label: 'Devolução' },
  { cod: 'O', label: 'Outro' },
];

export const PRODUTOS_INICIAIS = [
  // BOVINOS
  { id: 'charque', nome: 'Charque', categoria: 'BOVINOS', unidade: 'kg', min: 70, max: 140, ativo: true },
  { id: 'cupim', nome: 'Cupim', categoria: 'BOVINOS', unidade: 'kg', min: 50, max: 100, ativo: true },
  { id: 'cupim_espeto', nome: 'Cupim (espetinho)', categoria: 'BOVINOS', unidade: 'unid', min: 0, max: 0, ativo: true },
  { id: 'file_medalh', nome: 'Filé medalhão', categoria: 'BOVINOS', unidade: 'unid', pesoUnidade: 150, min: 10, max: 20, ativo: true },
  { id: 'file_parm', nome: 'Empanado de filé (porção)', categoria: 'BOVINOS', unidade: 'unid', pesoUnidade: 130, min: 175, max: 350, ativo: true },
  { id: 'file_petisco', nome: 'Filé petisco', categoria: 'BOVINOS', unidade: 'unid', pesoUnidade: 300, min: 30, max: 60, ativo: true },
  { id: 'file_refeicao', nome: 'Filé refeição', categoria: 'BOVINOS', unidade: 'unid', pesoUnidade: 150, min: 90, max: 180, ativo: true },
  { id: 'file_yaki', nome: 'Filé Yakisoba', categoria: 'BOVINOS', unidade: 'kg', min: 5, max: 10, ativo: true },
  { id: 'maminha_arg', nome: 'Maminha argentina', categoria: 'BOVINOS', unidade: 'kg', min: 100, max: 200, ativo: true },
  { id: 'picanha_arg', nome: 'Picanha argentina', categoria: 'BOVINOS', unidade: 'kg', min: 80, max: 160, ativo: true },
  { id: 'sol_arrum', nome: 'Sol Arrumadinho', categoria: 'BOVINOS', unidade: 'kg', min: 20, max: 40, ativo: true },
  { id: 'sol_bife', nome: 'Carne de sol BIFE', categoria: 'BOVINOS', unidade: 'kg', min: 0, max: 0, ativo: true },
  { id: 'sol_desfiada', nome: 'Sol Desfiada', categoria: 'BOVINOS', unidade: 'kg', min: 75, max: 150, ativo: true },
  { id: 'sol_nata', nome: 'Sol na Nata', categoria: 'BOVINOS', unidade: 'kg', min: 3, max: 5, ativo: true },
  // AVES
  { id: 'frango_grel', nome: 'Frango grelhado', categoria: 'AVES', unidade: 'unid', pesoUnidade: 150, min: 45, max: 90, ativo: true },
  { id: 'frango_medal', nome: 'Frango medalhão', categoria: 'AVES', unidade: 'unid', pesoUnidade: 150, min: 5, max: 10, ativo: true },
  { id: 'frango_parm', nome: 'Empanado de frango (porção)', categoria: 'AVES', unidade: 'unid', pesoUnidade: 150, min: 200, max: 400, ativo: true },
  { id: 'frango_pet', nome: 'Frango petisco', categoria: 'AVES', unidade: 'unid', pesoUnidade: 300, min: 40, max: 80, ativo: true },
  { id: 'frango_espeto', nome: 'Frango espetinho', categoria: 'AVES', unidade: 'unid', min: 0, max: 0, ativo: true },
  { id: 'frango_xadrez', nome: 'Frango xadrez', categoria: 'AVES', unidade: 'kg', min: 8, max: 15, ativo: true },
  { id: 'frango_yaki', nome: 'Frango Yakisoba', categoria: 'AVES', unidade: 'kg', min: 5, max: 10, ativo: true },
  // FRUTOS DO MAR
  { id: 'bacalhau_desf', nome: 'Bacalhau desfiado', categoria: 'FRUTOS DO MAR', unidade: 'kg', min: 15, max: 30, ativo: true },
  { id: 'camarao_alho', nome: 'Camarão alho e óleo', categoria: 'FRUTOS DO MAR', unidade: 'kg', min: 15, max: 30, ativo: true },
  { id: 'camarao_emp', nome: 'Camarão empanado', categoria: 'FRUTOS DO MAR', unidade: 'kg', min: 5, max: 10, ativo: true },
  { id: 'camarao_3q', nome: 'Camarão três queijos', categoria: 'FRUTOS DO MAR', unidade: 'kg', min: 25, max: 50, ativo: true },
  { id: 'camarao_yaki', nome: 'Camarão Yakisoba', categoria: 'FRUTOS DO MAR', unidade: 'kg', min: 5, max: 10, ativo: true },
  { id: 'salmao', nome: 'Salmão', categoria: 'FRUTOS DO MAR', unidade: 'kg', min: 3, max: 5, ativo: true },
  { id: 'tilapia_file', nome: 'Tilápia filé', categoria: 'FRUTOS DO MAR', unidade: 'unid', pesoUnidade: 200, min: 30, max: 60, ativo: true },
  { id: 'tilapia_grande', nome: 'Tilápia grande', categoria: 'FRUTOS DO MAR', unidade: 'kg', min: 10, max: 20, ativo: true },
  // SUÍNOS
  { id: 'costelinha_pet', nome: 'Costelinha petisco', categoria: 'SUÍNOS', unidade: 'kg', min: 3, max: 5, ativo: true },
  { id: 'costelinha_su', nome: 'Costelinha suína', categoria: 'SUÍNOS', unidade: 'kg', min: 8, max: 15, ativo: true },
  { id: 'picanha_su', nome: 'Picanha suína', categoria: 'SUÍNOS', unidade: 'kg', min: 15, max: 30, ativo: true },
  // CAPRINOS
  { id: 'bode_ref', nome: 'Bode refeição', categoria: 'CAPRINOS', unidade: 'kg', min: 10, max: 20, ativo: true },
  { id: 'bodezinho', nome: 'Bodezinho (petisco)', categoria: 'CAPRINOS', unidade: 'kg', min: 3, max: 5, ativo: true },
  // FRIOS / DIVERSOS
  { id: 'mucarela', nome: 'Muçarela', categoria: 'FRIOS / DIVERSOS', unidade: 'kg', min: 0, max: 0, ativo: true },
  { id: 'queijo', nome: 'Queijo', categoria: 'FRIOS / DIVERSOS', unidade: 'kg', min: 0, max: 0, ativo: true },
  { id: 'calabresa', nome: 'Calabresa', categoria: 'FRIOS / DIVERSOS', unidade: 'kg', min: 15, max: 30, ativo: true },
  { id: 'pao_alho', nome: 'Pão de alho', categoria: 'FRIOS / DIVERSOS', unidade: 'unid', min: 5, max: 10, ativo: true },
  { id: 'tripa', nome: 'Tripa', categoria: 'FRIOS / DIVERSOS', unidade: 'kg', min: 45, max: 90, ativo: true },
  { id: 'macarrao_yaki', nome: 'Macarrão Yakisoba', categoria: 'FRIOS / DIVERSOS', unidade: 'kg', min: 5, max: 10, ativo: true },
  { id: 'verduras_yaki', nome: 'Verduras Yakisoba', categoria: 'FRIOS / DIVERSOS', unidade: 'kg', min: 5, max: 10, ativo: true },
];

// ── Base "de fábrica" (o que um restaurante NOVO recebe ao se cadastrar) ──
// Enxuta e genérica, com poucos exemplos para o cliente entender o padrão e
// editar. A montagem completa do Polo fica em data/presetPolo.js (importável).
export const CATEGORIAS_BASE = ['PROTEÍNAS', 'PRODUZIDOS', 'DIVERSOS'];

export const PESSOAS_BASE = [];

export const PRODUTOS_BASE = [
  { id: 'ex_proteina', nome: 'Filé (exemplo — edite ou apague)', categoria: 'PROTEÍNAS', unidade: 'kg', min: 0, max: 0, ativo: true },
  { id: 'ex_produzido', nome: 'Molho da casa (exemplo — produzido)', categoria: 'PRODUZIDOS', unidade: 'L', min: 0, max: 0, ativo: true },
];
