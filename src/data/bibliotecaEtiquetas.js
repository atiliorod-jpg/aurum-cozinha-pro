// =====================================================================
//  Biblioteca de itens prontos — para o cliente não cadastrar tudo do zero
//
//  Cozinha que contrata o Aurum Etiquetas tem 100+ itens para etiquetar e
//  nenhuma vontade de digitar 100 fichas. Aqui está o que quase toda cozinha
//  tem: a pessoa busca "alface", toca, e o item entra no catálogo dela já
//  com nome, categoria, unidade e o armazenamento típico preenchidos.
//
//  ⚠️ OS PRAZOS DE VALIDADE VÊM EM BRANCO, E ISSO É DECISÃO, NÃO PREGUIÇA.
//
//  Nome, categoria e unidade são fatos — não mudam de restaurante para
//  restaurante. Prazo de validade NÃO é fato: depende do processo daquela
//  cozinha, da embalagem, da temperatura real da câmara, do fornecedor e do
//  que a vigilância local exige. Um número inventado aqui viraria data
//  impressa numa etiqueta colada num pote de comida, e o erro só apareceria
//  quando alguém passasse mal ou o fiscal aparecesse.
//
//  Então preenchemos tudo que dá para preencher com honestidade, deixamos o
//  prazo vazio, e a tela avisa discretamente que falta. Quem completa é o
//  responsável técnico do estabelecimento — que é de quem essa decisão é.
//
//  Se um dia o dono quiser padronizar prazos como consultor (uma tabela dele,
//  assinada por ele), é só preencher `prazos` aqui: nada no código muda.
//
//  `armazenamentoSugerido` é só o estado que a tela já deixa escolhido — o
//  usuário troca à vontade, e ele referencia os ids de utils/armazenamento.js.
// =====================================================================

// A ORDEM importa: é a ordem em que os grupos aparecem na tela. Proteína
// primeiro porque é o que mais se etiqueta e o que mais dá problema sanitário.
export const CATEGORIAS_BIBLIOTECA = [
  'BOVINOS',
  'AVES',
  'SUÍNOS',
  'PESCADOS',
  'HORTIFRÚTI',
  'LATICÍNIOS E FRIOS',
  'MOLHOS E PREPARADOS',
  'MASSAS E PANIFICAÇÃO',
  'GRÃOS E SECOS',
  'CONGELADOS',
  'BEBIDAS',
];

const it = (nome, categoria, unidade, armazenamentoSugerido) =>
  ({ id: nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
     nome, categoria, unidade, armazenamentoSugerido, prazos: {} });

export const BIBLIOTECA_ETIQUETAS = [
  // ── BOVINOS ────────────────────────────────────────────────
  it('Picanha', 'BOVINOS', 'kg', 'congelado'),
  it('Alcatra', 'BOVINOS', 'kg', 'congelado'),
  it('Contrafilé', 'BOVINOS', 'kg', 'congelado'),
  it('Filé mignon', 'BOVINOS', 'kg', 'congelado'),
  it('Maminha', 'BOVINOS', 'kg', 'congelado'),
  it('Fraldinha', 'BOVINOS', 'kg', 'congelado'),
  it('Cupim', 'BOVINOS', 'kg', 'congelado'),
  it('Costela bovina', 'BOVINOS', 'kg', 'congelado'),
  it('Acém', 'BOVINOS', 'kg', 'congelado'),
  it('Patinho', 'BOVINOS', 'kg', 'congelado'),
  it('Coxão mole', 'BOVINOS', 'kg', 'congelado'),
  it('Carne moída', 'BOVINOS', 'kg', 'congelado'),
  it('Carne de sol', 'BOVINOS', 'kg', 'resfriado'),
  it('Charque', 'BOVINOS', 'kg', 'resfriado'),
  it('Hambúrguer bovino', 'BOVINOS', 'unid', 'congelado'),

  // ── AVES ───────────────────────────────────────────────────
  it('Peito de frango', 'AVES', 'kg', 'congelado'),
  it('Coxa e sobrecoxa', 'AVES', 'kg', 'congelado'),
  it('Filé de frango', 'AVES', 'kg', 'congelado'),
  it('Frango desfiado', 'AVES', 'kg', 'resfriado'),
  it('Asa de frango', 'AVES', 'kg', 'congelado'),
  it('Frango inteiro', 'AVES', 'unid', 'congelado'),
  it('Peito de peru', 'AVES', 'kg', 'resfriado'),

  // ── SUÍNOS ─────────────────────────────────────────────────
  it('Lombo suíno', 'SUÍNOS', 'kg', 'congelado'),
  it('Costela suína', 'SUÍNOS', 'kg', 'congelado'),
  it('Pernil', 'SUÍNOS', 'kg', 'congelado'),
  it('Bacon', 'SUÍNOS', 'kg', 'resfriado'),
  it('Linguiça calabresa', 'SUÍNOS', 'kg', 'resfriado'),
  it('Linguiça toscana', 'SUÍNOS', 'kg', 'resfriado'),
  it('Panceta', 'SUÍNOS', 'kg', 'congelado'),

  // ── PESCADOS ───────────────────────────────────────────────
  it('Filé de tilápia', 'PESCADOS', 'kg', 'congelado'),
  it('Salmão', 'PESCADOS', 'kg', 'congelado'),
  it('Camarão limpo', 'PESCADOS', 'kg', 'congelado'),
  it('Polvo', 'PESCADOS', 'kg', 'congelado'),
  it('Lula em anéis', 'PESCADOS', 'kg', 'congelado'),
  it('Bacalhau dessalgado', 'PESCADOS', 'kg', 'resfriado'),
  it('Peixe inteiro', 'PESCADOS', 'kg', 'congelado'),

  // ── HORTIFRÚTI ─────────────────────────────────────────────
  it('Alface', 'HORTIFRÚTI', 'unid', 'resfriado'),
  it('Rúcula', 'HORTIFRÚTI', 'maço', 'resfriado'),
  it('Tomate', 'HORTIFRÚTI', 'kg', 'resfriado'),
  it('Cebola', 'HORTIFRÚTI', 'kg', 'ambiente'),
  it('Alho', 'HORTIFRÚTI', 'kg', 'ambiente'),
  it('Batata', 'HORTIFRÚTI', 'kg', 'ambiente'),
  it('Cenoura', 'HORTIFRÚTI', 'kg', 'resfriado'),
  it('Pimentão', 'HORTIFRÚTI', 'kg', 'resfriado'),
  it('Abobrinha', 'HORTIFRÚTI', 'kg', 'resfriado'),
  it('Brócolis', 'HORTIFRÚTI', 'kg', 'resfriado'),
  it('Couve', 'HORTIFRÚTI', 'maço', 'resfriado'),
  it('Cheiro-verde', 'HORTIFRÚTI', 'maço', 'resfriado'),
  it('Limão', 'HORTIFRÚTI', 'kg', 'resfriado'),
  it('Abacaxi', 'HORTIFRÚTI', 'unid', 'resfriado'),
  it('Manga', 'HORTIFRÚTI', 'kg', 'resfriado'),
  it('Banana', 'HORTIFRÚTI', 'kg', 'ambiente'),
  it('Salada higienizada', 'HORTIFRÚTI', 'kg', 'resfriado'),
  it('Legumes descascados', 'HORTIFRÚTI', 'kg', 'resfriado'),

  // ── LATICÍNIOS E FRIOS ─────────────────────────────────────
  it('Queijo mussarela', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado'),
  it('Queijo prato', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado'),
  it('Queijo coalho', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado'),
  it('Queijo parmesão ralado', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado'),
  it('Requeijão', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado'),
  it('Presunto', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado'),
  it('Manteiga', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado'),
  it('Creme de leite', 'LATICÍNIOS E FRIOS', 'L', 'resfriado'),
  it('Leite aberto', 'LATICÍNIOS E FRIOS', 'L', 'resfriado'),
  it('Iogurte natural', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado'),
  it('Ovos', 'LATICÍNIOS E FRIOS', 'unid', 'resfriado'),

  // ── MOLHOS E PREPARADOS ────────────────────────────────────
  it('Molho de tomate da casa', 'MOLHOS E PREPARADOS', 'L', 'resfriado'),
  it('Molho branco', 'MOLHOS E PREPARADOS', 'L', 'resfriado'),
  it('Maionese temperada', 'MOLHOS E PREPARADOS', 'kg', 'resfriado'),
  it('Vinagrete', 'MOLHOS E PREPARADOS', 'kg', 'resfriado'),
  it('Caldo de carne', 'MOLHOS E PREPARADOS', 'L', 'congelado'),
  it('Caldo de legumes', 'MOLHOS E PREPARADOS', 'L', 'congelado'),
  it('Farofa pronta', 'MOLHOS E PREPARADOS', 'kg', 'ambiente'),
  it('Feijão cozido', 'MOLHOS E PREPARADOS', 'kg', 'resfriado'),
  it('Arroz cozido', 'MOLHOS E PREPARADOS', 'kg', 'resfriado'),
  it('Purê de batata', 'MOLHOS E PREPARADOS', 'kg', 'resfriado'),
  it('Carne desfiada temperada', 'MOLHOS E PREPARADOS', 'kg', 'congelado'),
  it('Recheio pronto', 'MOLHOS E PREPARADOS', 'kg', 'congelado'),

  // ── MASSAS E PANIFICAÇÃO ───────────────────────────────────
  it('Massa fresca', 'MASSAS E PANIFICAÇÃO', 'kg', 'resfriado'),
  it('Massa de pizza', 'MASSAS E PANIFICAÇÃO', 'unid', 'resfriado'),
  it('Pão de hambúrguer', 'MASSAS E PANIFICAÇÃO', 'unid', 'ambiente'),
  it('Pão francês', 'MASSAS E PANIFICAÇÃO', 'kg', 'ambiente'),
  it('Massa de pastel', 'MASSAS E PANIFICAÇÃO', 'kg', 'resfriado'),
  it('Bolo', 'MASSAS E PANIFICAÇÃO', 'unid', 'resfriado'),

  // ── GRÃOS E SECOS ──────────────────────────────────────────
  it('Arroz', 'GRÃOS E SECOS', 'kg', 'ambiente'),
  it('Feijão', 'GRÃOS E SECOS', 'kg', 'ambiente'),
  it('Farinha de trigo', 'GRÃOS E SECOS', 'kg', 'ambiente'),
  it('Farinha de mandioca', 'GRÃOS E SECOS', 'kg', 'ambiente'),
  it('Açúcar', 'GRÃOS E SECOS', 'kg', 'ambiente'),
  it('Sal', 'GRÃOS E SECOS', 'kg', 'ambiente'),
  it('Óleo de soja', 'GRÃOS E SECOS', 'L', 'ambiente'),
  it('Azeite', 'GRÃOS E SECOS', 'L', 'ambiente'),
  it('Macarrão seco', 'GRÃOS E SECOS', 'kg', 'ambiente'),
  it('Grão-de-bico', 'GRÃOS E SECOS', 'kg', 'ambiente'),

  // ── CONGELADOS ─────────────────────────────────────────────
  it('Batata palito congelada', 'CONGELADOS', 'kg', 'congelado'),
  it('Empanado de frango', 'CONGELADOS', 'kg', 'congelado'),
  it('Polpa de fruta', 'CONGELADOS', 'kg', 'congelado'),
  it('Pão de queijo congelado', 'CONGELADOS', 'kg', 'congelado'),
  it('Legumes congelados', 'CONGELADOS', 'kg', 'congelado'),

  // ── BEBIDAS ────────────────────────────────────────────────
  it('Suco natural', 'BEBIDAS', 'L', 'resfriado'),
  it('Polpa batida', 'BEBIDAS', 'L', 'resfriado'),
  it('Chá gelado', 'BEBIDAS', 'L', 'resfriado'),
];

/** Busca por nome, sem acento e sem caso — o cozinheiro digita "acem". */
const semAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function buscarNaBiblioteca(termo) {
  const t = semAcento(termo).trim();
  if (!t) return BIBLIOTECA_ETIQUETAS;
  return BIBLIOTECA_ETIQUETAS.filter(i =>
    semAcento(i.nome).includes(t) || semAcento(i.categoria).includes(t));
}

/**
 * Agrupa na ORDEM de CATEGORIAS_BIBLIOTECA — organização é requisito, não
 * enfeite: proteína tem que estar na ala dela. Grupo vazio não aparece.
 */
export function agruparPorCategoria(itens, ordem = CATEGORIAS_BIBLIOTECA) {
  const mapa = new Map();
  itens.forEach(i => {
    const c = i.categoria || 'OUTROS';
    if (!mapa.has(c)) mapa.set(c, []);
    mapa.get(c).push(i);
  });
  const conhecidas = ordem.filter(c => mapa.has(c)).map(c => [c, mapa.get(c)]);
  // categoria que o restaurante criou e não está na ordem padrão vai no fim,
  // em ordem alfabética — some seria pior que aparecer fora de lugar
  const extras = [...mapa.keys()].filter(c => !ordem.includes(c)).sort()
    .map(c => [c, mapa.get(c)]);
  return [...conhecidas, ...extras];
}
