// =====================================================================
//  Biblioteca de itens prontos — para o cliente não cadastrar tudo do zero
//
//  Cozinha que contrata o Aurum Etiquetas tem 100+ itens para etiquetar e
//  nenhuma vontade de digitar 100 fichas. Aqui está o que quase toda cozinha
//  tem: a pessoa busca "picanha", escolhe entre inteira e porção, confere os
//  dados na tela de cadastro e salva.
//
//  ── SOBRE OS PRAZOS ────────────────────────────────────────────────
//  Os prazos abaixo são SUGESTÃO DE PARTIDA, tirados da tabela de tempo ×
//  temperatura mais usada no serviço de alimentação brasileiro (Portaria CVS
//  5/2013 — SP):
//     • pescado resfriado a 2°C .......... 3 dias
//     • carne bovina/suína/ave a 4°C ..... 3 dias
//     • carne moída e empanado cru ....... 2 dias
//     • frios e embutidos fatiados ....... 3 dias
//     • pós-cocção (exceto pescado) ...... 3 dias
//     • pescado pós-cocção ............... 1 dia
//     • congelados a -18°C ............... até 90 dias
//
//  ⚠️ DUAS RESSALVAS QUE O RESPONSÁVEL TÉCNICO PRECISA SABER:
//
//  1) A CVS 5/2013 foi SUBSTITUÍDA pela CVS 3/2026, que passa a valer em
//     04/10/2026. A norma nova manda seguir a recomendação do FABRICANTE no
//     rótulo — ou seja, o prazo do produto específico passa a ter prioridade
//     sobre qualquer tabela geral, esta inclusive.
//
//  2) Prazo de validade de alimento manipulado depende do processo daquela
//     cozinha, da embalagem e da temperatura real da câmara. Nenhum número
//     aqui substitui a validação do estabelecimento. Por isso o app abre a
//     ficha do item ANTES de adicionar: é onde o prazo é conferido.
//
//  Itens de despensa (sal, açúcar, óleo, vinagre, tempero seco) saem com
//  prazo ZERO de propósito: para eles a validade é a do fabricante, impressa
//  na embalagem, e o que a cozinha controla é a DATA DE ABERTURA — por isso
//  vêm com `tipoData: 'abertura'`. Inventar um prazo genérico ali seria pior
//  que não ter nenhum.
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
  'TEMPEROS E CONDIMENTOS',
  'MASSAS E PANIFICAÇÃO',
  'GRÃOS E SECOS',
  'CONGELADOS',
  'BEBIDAS',
  'DOCES E SOBREMESAS',
];

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * @param nome        como aparece na etiqueta
 * @param categoria   grupo (ver CATEGORIAS_BIBLIOTECA)
 * @param unidade     kg | unid | L | maço | porção
 * @param armaz       armazenamento sugerido: congelado | resfriado | ambiente
 * @param prazos      dias por armazenamento — {} quando é prazo do fabricante
 * @param tipoData    'fabricacao' (manipulação) | 'abertura' (produto aberto)
 */
const it = (nome, categoria, unidade, armaz, prazos = {}, tipoData = 'fabricacao') =>
  ({ id: slug(nome), nome, categoria, unidade, armazenamentoSugerido: armaz, prazos, tipoData });

// Atalhos dos prazos da tabela, para o dado ficar legível e mudar num lugar só
const CARNE      = { congelado: 90, resfriado: 3 };
const MOIDA      = { congelado: 90, resfriado: 2 };  // moída e empanado cru
const PESCADO    = { congelado: 90, resfriado: 3 };
const FRIOS      = { resfriado: 3 };
const COZIDO     = { congelado: 90, resfriado: 3 };  // pós-cocção
const FOLHOSA    = { resfriado: 3 };
const HORTI      = { resfriado: 5 };
const ABERTO     = {};                                // segue o fabricante

export const BIBLIOTECA_ETIQUETAS = [
  // ── BOVINOS ────────────────────────────────────────────────
  it('Picanha inteira', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Picanha (porção)', 'BOVINOS', 'unid', 'congelado', CARNE),
  it('Alcatra inteira', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Alcatra (porção)', 'BOVINOS', 'unid', 'congelado', CARNE),
  it('Contrafilé inteiro', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Contrafilé (porção)', 'BOVINOS', 'unid', 'congelado', CARNE),
  it('Filé mignon inteiro', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Filé mignon (medalhão)', 'BOVINOS', 'unid', 'congelado', CARNE),
  it('Maminha', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Fraldinha', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Cupim', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Cupim (espetinho)', 'BOVINOS', 'unid', 'congelado', CARNE),
  it('Costela bovina', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Acém', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Patinho', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Coxão mole', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Coxão duro', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Músculo', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Carne moída', 'BOVINOS', 'kg', 'congelado', MOIDA),
  it('Carne em cubos', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Tiras para strogonoff', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Carne de sol', 'BOVINOS', 'kg', 'resfriado', CARNE),
  it('Charque', 'BOVINOS', 'kg', 'resfriado', CARNE),
  it('Hambúrguer bovino', 'BOVINOS', 'unid', 'congelado', MOIDA),
  it('Empanado de filé (porção)', 'BOVINOS', 'unid', 'congelado', MOIDA),
  it('Bife rolê', 'BOVINOS', 'unid', 'resfriado', MOIDA),
  it('Fígado bovino', 'BOVINOS', 'kg', 'congelado', CARNE),
  it('Rabada', 'BOVINOS', 'kg', 'congelado', CARNE),

  // ── AVES ───────────────────────────────────────────────────
  it('Frango inteiro', 'AVES', 'unid', 'congelado', CARNE),
  it('Peito de frango inteiro', 'AVES', 'kg', 'congelado', CARNE),
  it('Peito de frango (porção)', 'AVES', 'unid', 'congelado', CARNE),
  it('Filé de frango', 'AVES', 'kg', 'congelado', CARNE),
  it('Coxa e sobrecoxa', 'AVES', 'kg', 'congelado', CARNE),
  it('Asa de frango', 'AVES', 'kg', 'congelado', CARNE),
  it('Coxinha da asa', 'AVES', 'kg', 'congelado', CARNE),
  it('Frango desfiado', 'AVES', 'kg', 'resfriado', COZIDO),
  it('Frango em cubos', 'AVES', 'kg', 'congelado', CARNE),
  it('Frango empanado', 'AVES', 'kg', 'congelado', MOIDA),
  it('Peito de peru fatiado', 'AVES', 'kg', 'resfriado', FRIOS),
  it('Coração de frango', 'AVES', 'kg', 'congelado', CARNE),
  it('Ovo de codorna cozido', 'AVES', 'unid', 'resfriado', COZIDO),

  // ── SUÍNOS ─────────────────────────────────────────────────
  it('Lombo suíno inteiro', 'SUÍNOS', 'kg', 'congelado', CARNE),
  it('Lombo suíno (porção)', 'SUÍNOS', 'unid', 'congelado', CARNE),
  it('Costela suína', 'SUÍNOS', 'kg', 'congelado', CARNE),
  it('Pernil', 'SUÍNOS', 'kg', 'congelado', CARNE),
  it('Bisteca suína', 'SUÍNOS', 'kg', 'congelado', CARNE),
  it('Panceta', 'SUÍNOS', 'kg', 'congelado', CARNE),
  it('Bacon em cubos', 'SUÍNOS', 'kg', 'resfriado', FRIOS),
  it('Bacon fatiado', 'SUÍNOS', 'kg', 'resfriado', FRIOS),
  it('Linguiça calabresa', 'SUÍNOS', 'kg', 'resfriado', FRIOS),
  it('Linguiça toscana', 'SUÍNOS', 'kg', 'resfriado', FRIOS),
  it('Paio', 'SUÍNOS', 'kg', 'resfriado', FRIOS),
  it('Costelinha temperada', 'SUÍNOS', 'kg', 'congelado', CARNE),
  it('Pururuca / torresmo', 'SUÍNOS', 'kg', 'ambiente', { ambiente: 2 }),

  // ── PESCADOS ───────────────────────────────────────────────
  it('Filé de tilápia', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Salmão em posta', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Salmão em cubos', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Camarão limpo', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Camarão com casca', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Polvo', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Lula em anéis', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Bacalhau dessalgado', 'PESCADOS', 'kg', 'resfriado', PESCADO),
  it('Peixe inteiro limpo', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Filé de pescada', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Atum em posta', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Marisco / vôngole', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Pescado cozido', 'PESCADOS', 'kg', 'resfriado', { resfriado: 1 }),

  // ── HORTIFRÚTI ─────────────────────────────────────────────
  it('Alface', 'HORTIFRÚTI', 'unid', 'resfriado', FOLHOSA),
  it('Alface higienizada', 'HORTIFRÚTI', 'kg', 'resfriado', FOLHOSA),
  it('Rúcula', 'HORTIFRÚTI', 'maço', 'resfriado', FOLHOSA),
  it('Agrião', 'HORTIFRÚTI', 'maço', 'resfriado', FOLHOSA),
  it('Couve', 'HORTIFRÚTI', 'maço', 'resfriado', FOLHOSA),
  it('Couve fatiada', 'HORTIFRÚTI', 'kg', 'resfriado', FOLHOSA),
  it('Repolho', 'HORTIFRÚTI', 'unid', 'resfriado', HORTI),
  it('Tomate', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Tomate picado', 'HORTIFRÚTI', 'kg', 'resfriado', FOLHOSA),
  it('Cebola', 'HORTIFRÚTI', 'kg', 'ambiente', { ambiente: 30 }),
  it('Cebola picada', 'HORTIFRÚTI', 'kg', 'resfriado', FOLHOSA),
  it('Alho', 'HORTIFRÚTI', 'kg', 'ambiente', { ambiente: 30 }),
  it('Alho descascado', 'HORTIFRÚTI', 'kg', 'resfriado', FOLHOSA),
  it('Batata', 'HORTIFRÚTI', 'kg', 'ambiente', { ambiente: 15 }),
  it('Batata descascada', 'HORTIFRÚTI', 'kg', 'resfriado', { resfriado: 2 }),
  it('Cenoura', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Cenoura ralada', 'HORTIFRÚTI', 'kg', 'resfriado', FOLHOSA),
  it('Pimentão', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Abobrinha', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Berinjela', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Brócolis', 'HORTIFRÚTI', 'kg', 'resfriado', FOLHOSA),
  it('Couve-flor', 'HORTIFRÚTI', 'kg', 'resfriado', FOLHOSA),
  it('Cheiro-verde', 'HORTIFRÚTI', 'maço', 'resfriado', FOLHOSA),
  it('Manjericão', 'HORTIFRÚTI', 'maço', 'resfriado', FOLHOSA),
  it('Limão', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Abacaxi', 'HORTIFRÚTI', 'unid', 'resfriado', HORTI),
  it('Abacaxi picado', 'HORTIFRÚTI', 'kg', 'resfriado', { resfriado: 2 }),
  it('Manga', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Banana', 'HORTIFRÚTI', 'kg', 'ambiente', { ambiente: 5 }),
  it('Mamão', 'HORTIFRÚTI', 'unid', 'resfriado', HORTI),
  it('Melancia picada', 'HORTIFRÚTI', 'kg', 'resfriado', { resfriado: 2 }),
  it('Salada higienizada', 'HORTIFRÚTI', 'kg', 'resfriado', FOLHOSA),
  it('Legumes descascados', 'HORTIFRÚTI', 'kg', 'resfriado', { resfriado: 2 }),
  it('Milho verde', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),

  // ── LATICÍNIOS E FRIOS ─────────────────────────────────────
  it('Queijo mussarela', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', FRIOS, 'abertura'),
  it('Queijo mussarela fatiado', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', FRIOS),
  it('Queijo prato', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', FRIOS, 'abertura'),
  it('Queijo coalho', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', FRIOS, 'abertura'),
  it('Queijo parmesão ralado', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', FRIOS, 'abertura'),
  it('Queijo minas', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', FRIOS, 'abertura'),
  it('Requeijão', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', ABERTO, 'abertura'),
  it('Cream cheese', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', ABERTO, 'abertura'),
  it('Presunto', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', FRIOS, 'abertura'),
  it('Presunto fatiado', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', FRIOS),
  it('Mortadela', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', FRIOS, 'abertura'),
  it('Salame', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', FRIOS, 'abertura'),
  it('Manteiga', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', ABERTO, 'abertura'),
  it('Margarina', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', ABERTO, 'abertura'),
  it('Creme de leite', 'LATICÍNIOS E FRIOS', 'L', 'resfriado', { resfriado: 3 }, 'abertura'),
  it('Leite condensado', 'LATICÍNIOS E FRIOS', 'L', 'resfriado', { resfriado: 3 }, 'abertura'),
  it('Leite aberto', 'LATICÍNIOS E FRIOS', 'L', 'resfriado', { resfriado: 3 }, 'abertura'),
  it('Iogurte natural', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', ABERTO, 'abertura'),
  it('Ovos', 'LATICÍNIOS E FRIOS', 'unid', 'resfriado', ABERTO),
  it('Nata', 'LATICÍNIOS E FRIOS', 'kg', 'resfriado', { resfriado: 3 }, 'abertura'),

  // ── MOLHOS E PREPARADOS (da casa) ──────────────────────────
  it('Molho de tomate da casa', 'MOLHOS E PREPARADOS', 'L', 'resfriado', COZIDO),
  it('Molho branco', 'MOLHOS E PREPARADOS', 'L', 'resfriado', COZIDO),
  it('Molho barbecue da casa', 'MOLHOS E PREPARADOS', 'L', 'resfriado', COZIDO),
  it('Molho de alho', 'MOLHOS E PREPARADOS', 'kg', 'resfriado', { resfriado: 3 }),
  it('Maionese temperada', 'MOLHOS E PREPARADOS', 'kg', 'resfriado', { resfriado: 2 }),
  it('Vinagrete', 'MOLHOS E PREPARADOS', 'kg', 'resfriado', { resfriado: 2 }),
  it('Chimichurri', 'MOLHOS E PREPARADOS', 'kg', 'resfriado', { resfriado: 3 }),
  it('Caldo de carne', 'MOLHOS E PREPARADOS', 'L', 'congelado', COZIDO),
  it('Caldo de legumes', 'MOLHOS E PREPARADOS', 'L', 'congelado', COZIDO),
  it('Caldo de frango', 'MOLHOS E PREPARADOS', 'L', 'congelado', COZIDO),
  it('Feijão cozido', 'MOLHOS E PREPARADOS', 'kg', 'resfriado', COZIDO),
  it('Arroz cozido', 'MOLHOS E PREPARADOS', 'kg', 'resfriado', COZIDO),
  it('Purê de batata', 'MOLHOS E PREPARADOS', 'kg', 'resfriado', COZIDO),
  it('Farofa pronta', 'MOLHOS E PREPARADOS', 'kg', 'ambiente', { ambiente: 2, resfriado: 3 }),
  it('Carne desfiada temperada', 'MOLHOS E PREPARADOS', 'kg', 'congelado', COZIDO),
  it('Recheio pronto', 'MOLHOS E PREPARADOS', 'kg', 'congelado', COZIDO),
  it('Legumes refogados', 'MOLHOS E PREPARADOS', 'kg', 'resfriado', COZIDO),
  it('Massa de bolinho', 'MOLHOS E PREPARADOS', 'kg', 'resfriado', { resfriado: 2 }),
  it('Marinada / tempero líquido', 'MOLHOS E PREPARADOS', 'L', 'resfriado', { resfriado: 3 }),

  // ── TEMPEROS E CONDIMENTOS (prazo do fabricante) ───────────
  // Todos com tipoData 'abertura': o que a cozinha controla aqui é QUANDO
  // ABRIU. O vencimento de fábrica vai no campo "Val. original" da etiqueta.
  it('Sal', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Sal grosso', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Pimenta-do-reino', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Colorau / urucum', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Páprica', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Cominho', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Orégano', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Alecrim seco', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Louro', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Canela', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Noz-moscada', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Curry', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Açafrão / cúrcuma', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Tempero pronto', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Caldo em pó', 'TEMPEROS E CONDIMENTOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Óleo de soja', 'TEMPEROS E CONDIMENTOS', 'L', 'ambiente', ABERTO, 'abertura'),
  it('Azeite', 'TEMPEROS E CONDIMENTOS', 'L', 'ambiente', ABERTO, 'abertura'),
  it('Óleo de fritura em uso', 'TEMPEROS E CONDIMENTOS', 'L', 'ambiente', { ambiente: 1 }),
  it('Vinagre', 'TEMPEROS E CONDIMENTOS', 'L', 'ambiente', ABERTO, 'abertura'),
  it('Vinagre balsâmico', 'TEMPEROS E CONDIMENTOS', 'L', 'ambiente', ABERTO, 'abertura'),
  it('Shoyu', 'TEMPEROS E CONDIMENTOS', 'L', 'ambiente', ABERTO, 'abertura'),
  it('Molho inglês', 'TEMPEROS E CONDIMENTOS', 'L', 'ambiente', ABERTO, 'abertura'),
  it('Pimenta em molho', 'TEMPEROS E CONDIMENTOS', 'L', 'ambiente', ABERTO, 'abertura'),
  it('Ketchup', 'TEMPEROS E CONDIMENTOS', 'kg', 'resfriado', ABERTO, 'abertura'),
  it('Mostarda', 'TEMPEROS E CONDIMENTOS', 'kg', 'resfriado', ABERTO, 'abertura'),
  it('Maionese industrializada', 'TEMPEROS E CONDIMENTOS', 'kg', 'resfriado', ABERTO, 'abertura'),
  it('Extrato de tomate', 'TEMPEROS E CONDIMENTOS', 'kg', 'resfriado', { resfriado: 3 }, 'abertura'),
  it('Azeitona', 'TEMPEROS E CONDIMENTOS', 'kg', 'resfriado', ABERTO, 'abertura'),
  it('Palmito', 'TEMPEROS E CONDIMENTOS', 'kg', 'resfriado', { resfriado: 3 }, 'abertura'),
  it('Milho em conserva', 'TEMPEROS E CONDIMENTOS', 'kg', 'resfriado', { resfriado: 2 }, 'abertura'),
  it('Ervilha em conserva', 'TEMPEROS E CONDIMENTOS', 'kg', 'resfriado', { resfriado: 2 }, 'abertura'),

  // ── MASSAS E PANIFICAÇÃO ───────────────────────────────────
  it('Massa fresca', 'MASSAS E PANIFICAÇÃO', 'kg', 'resfriado', { resfriado: 3 }),
  it('Massa de pizza', 'MASSAS E PANIFICAÇÃO', 'unid', 'resfriado', { resfriado: 2, congelado: 30 }),
  it('Massa de pastel', 'MASSAS E PANIFICAÇÃO', 'kg', 'resfriado', { resfriado: 3 }),
  it('Massa de lasanha', 'MASSAS E PANIFICAÇÃO', 'kg', 'resfriado', { resfriado: 3 }),
  it('Pão de hambúrguer', 'MASSAS E PANIFICAÇÃO', 'unid', 'ambiente', { ambiente: 3 }),
  it('Pão francês', 'MASSAS E PANIFICAÇÃO', 'kg', 'ambiente', { ambiente: 1 }),
  it('Pão de forma', 'MASSAS E PANIFICAÇÃO', 'unid', 'ambiente', { ambiente: 5 }, 'abertura'),
  it('Torrada / crouton', 'MASSAS E PANIFICAÇÃO', 'kg', 'ambiente', { ambiente: 7 }),
  it('Bolo', 'MASSAS E PANIFICAÇÃO', 'unid', 'resfriado', { resfriado: 3 }),
  it('Massa de bolo crua', 'MASSAS E PANIFICAÇÃO', 'kg', 'resfriado', { resfriado: 1 }),

  // ── GRÃOS E SECOS (prazo do fabricante) ────────────────────
  it('Arroz', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Feijão', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Grão-de-bico', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Lentilha', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Farinha de trigo', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Farinha de mandioca', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Farinha de rosca', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Fubá', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Amido de milho', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Açúcar', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Macarrão seco', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Aveia', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Fermento', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Leite em pó', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Castanha / nozes', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Coco ralado', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),

  // ── CONGELADOS (industrializados) ──────────────────────────
  it('Batata palito congelada', 'CONGELADOS', 'kg', 'congelado', ABERTO, 'abertura'),
  it('Empanado de frango congelado', 'CONGELADOS', 'kg', 'congelado', ABERTO, 'abertura'),
  it('Polpa de fruta', 'CONGELADOS', 'kg', 'congelado', ABERTO, 'abertura'),
  it('Pão de queijo congelado', 'CONGELADOS', 'kg', 'congelado', ABERTO, 'abertura'),
  it('Legumes congelados', 'CONGELADOS', 'kg', 'congelado', ABERTO, 'abertura'),
  it('Salgado congelado', 'CONGELADOS', 'unid', 'congelado', ABERTO, 'abertura'),
  it('Sorvete', 'CONGELADOS', 'L', 'congelado', ABERTO, 'abertura'),

  // ── BEBIDAS ────────────────────────────────────────────────
  it('Suco natural', 'BEBIDAS', 'L', 'resfriado', { resfriado: 1 }),
  it('Polpa batida', 'BEBIDAS', 'L', 'resfriado', { resfriado: 1 }),
  it('Chá gelado', 'BEBIDAS', 'L', 'resfriado', { resfriado: 2 }),
  it('Limonada', 'BEBIDAS', 'L', 'resfriado', { resfriado: 1 }),
  it('Caldo de cana', 'BEBIDAS', 'L', 'resfriado', { resfriado: 1 }),
  it('Xarope / calda', 'BEBIDAS', 'L', 'resfriado', { resfriado: 15 }),

  // ── DOCES E SOBREMESAS ─────────────────────────────────────
  it('Pudim', 'DOCES E SOBREMESAS', 'unid', 'resfriado', { resfriado: 3 }),
  it('Mousse', 'DOCES E SOBREMESAS', 'kg', 'resfriado', { resfriado: 3 }),
  it('Doce de leite', 'DOCES E SOBREMESAS', 'kg', 'resfriado', ABERTO, 'abertura'),
  it('Brigadeiro / recheio doce', 'DOCES E SOBREMESAS', 'kg', 'resfriado', { resfriado: 3 }),
  it('Calda de chocolate', 'DOCES E SOBREMESAS', 'L', 'resfriado', { resfriado: 7 }),
  it('Fruta em calda', 'DOCES E SOBREMESAS', 'kg', 'resfriado', { resfriado: 5 }, 'abertura'),
  it('Chantilly montado', 'DOCES E SOBREMESAS', 'kg', 'resfriado', { resfriado: 1 }),
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
 * Agrupa na ORDEM de `ordem` — organização é requisito, não enfeite: proteína
 * tem que estar na ala dela. Grupo vazio não aparece; categoria que o
 * restaurante criou e não está na ordem vai no fim, em ordem alfabética
 * (sumir seria pior que aparecer fora de lugar).
 */
export function agruparPorCategoria(itens, ordem = CATEGORIAS_BIBLIOTECA) {
  const mapa = new Map();
  itens.forEach(i => {
    const c = i.categoria || 'OUTROS';
    if (!mapa.has(c)) mapa.set(c, []);
    mapa.get(c).push(i);
  });
  const conhecidas = ordem.filter(c => mapa.has(c)).map(c => [c, mapa.get(c)]);
  const extras = [...mapa.keys()].filter(c => !ordem.includes(c)).sort()
    .map(c => [c, mapa.get(c)]);
  return [...conhecidas, ...extras];
}
