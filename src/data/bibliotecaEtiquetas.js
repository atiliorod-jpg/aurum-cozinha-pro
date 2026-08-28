// =====================================================================
//  Biblioteca de itens prontos — para o cliente não cadastrar tudo do zero
//
//  Cozinha que contrata o Aurum Etiquetas tem 100+ itens para etiquetar e
//  nenhuma vontade de digitar 100 fichas. Aqui está o que quase toda cozinha
//  tem: a pessoa busca "picanha", escolhe entre inteira e porção, confere os
//  dados na tela de cadastro e salva.
//
//  ── SOBRE OS PRAZOS ────────────────────────────────────────────────
//  Os prazos abaixo são SUGESTÃO DE PARTIDA. Duas referências, e elas
//  respondem perguntas diferentes:
//
//  REFRIGERADO (0–6°C, o frio de trabalho) — tabela de tempo × temperatura do
//  serviço de alimentação (Portaria CVS 5/2013, SP; ela chama esta faixa de
//  "resfriado", mas o vocabulário do app segue o do dono — o que vai impresso
//  na etiqueta é a FAIXA em °C, que é o que o fiscal confere):
//     • pescado a 2°C .................... 3 dias
//     • carne bovina/suína/ave a 4°C ..... 3 dias
//     • carne moída e empanado cru ....... 2 dias
//     • frios e embutidos fatiados ....... 3 dias
//     • pós-cocção (exceto pescado) ...... 3 dias
//     • pescado pós-cocção ............... 1 dia
//
//  CONGELADO a -18°C — aqui a matéria-prima CRUA e o PREPARADO da casa não
//  seguem a mesma régua, e confundir os dois joga comida boa fora:
//     • preparado da casa (molho, caldo, cozido) ... até 90 dias
//     • carne bovina crua .......................... 4 a 12 meses
//     • suína crua ................................. ~6 meses
//     • aves cruas ................................. até 12 meses
//     • pescado magro / gorduroso .................. ~6 / ~3 meses
//  Usei o lado CONSERVADOR de cada faixa (ver constantes abaixo).
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
//  ── ITENS ABERTOS (tipoData: 'abertura') ───────────────────────────
//  Produto de embalagem tem DOIS prazos, e eles não se confundem:
//     • o do fabricante, impresso na embalagem → vai no campo "Val. original"
//     • o de DEPOIS DE ABERTO ("consumir em 3 dias após aberto") → é o prazo
//       daqui, e é ele que gera a data de vencimento da etiqueta
//  Leite, creme de leite, requeijão, conservas e afins já vêm com esse prazo
//  preenchido. Sal, açúcar, farinha e tempero seco vêm com ZERO porque não
//  passam a vencer por terem sido abertos — ali a validade é só a do
//  fabricante, e inventar um prazo seria pior que não ter nenhum.
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
 * @param armaz       sugerido: congelado | resfriado | refrigerado | ambiente
 * @param prazos      dias por armazenamento — {} quando é prazo do fabricante
 * @param tipoData    'fabricacao' (manipulação) | 'abertura' (produto aberto)
 */
const it = (nome, categoria, unidade, armaz, prazos = {}, tipoData = 'fabricacao') =>
  ({ id: slug(nome), nome, categoria, unidade, armazenamentoSugerido: armaz, prazos, tipoData });

// ⚠️ A DISTINÇÃO QUE MAIS ERRA NA PRÁTICA: congelado de matéria-prima CRUA não
// é a mesma coisa que congelado de PREPARADO da casa.
//
//   • Preparado (molho, caldo, carne cozida, recheio) → até 90 dias a -18°C.
//     É o teto da tabela de alimento preparado, e faz sentido: já passou por
//     manipulação e cocção.
//   • Matéria-prima crua porcionada (picanha, peito de frango, lombo) → a
//     referência de congelamento é de MESES, não de 90 dias. Bovina 4 a 12
//     meses, suína ~6, aves até 12, pescado magro ~6 e gorduroso ~3.
//
// A primeira versão desta biblioteca aplicava 90 dias para tudo, e o dono
// apontou: picanha congelada durar 3 meses é jogar comida boa fora. Corrigido
// com valores CONSERVADORES dentro de cada faixa — quem sobe é o responsável
// técnico da casa, com o processo dele na mão.
const MESES = (n) => n * 30;

const CARNE_CRUA  = { congelado: MESES(6), refrigerado: 3 };   // bovina, suína, ave porcionada
const MOIDA       = { congelado: MESES(3), refrigerado: 2 };   // moída/empanado: mais superfície, oxida antes
const PESCADO     = { congelado: MESES(6), refrigerado: 3 };   // magro (tilápia, pescada)
const PESCADO_GOR = { congelado: MESES(3), refrigerado: 3 };   // gorduroso (salmão, atum) — a gordura rancifica
const FRIOS       = { refrigerado: 3 };
const COZIDO      = { congelado: 90, refrigerado: 3 };         // PREPARADO da casa — o teto de 90 dias
const FOLHOSA     = { refrigerado: 3 };
const HORTI       = { resfriado: 5 };   // hortifruti inteiro: sofre no frio forte
const ABERTO      = {};                                      // segue o fabricante

export const BIBLIOTECA_ETIQUETAS = [
  // ── BOVINOS ────────────────────────────────────────────────
  it('Picanha inteira', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Picanha (porção)', 'BOVINOS', 'unid', 'congelado', CARNE_CRUA),
  it('Alcatra inteira', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Alcatra (porção)', 'BOVINOS', 'unid', 'congelado', CARNE_CRUA),
  it('Contrafilé inteiro', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Contrafilé (porção)', 'BOVINOS', 'unid', 'congelado', CARNE_CRUA),
  it('Filé mignon inteiro', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Filé mignon (medalhão)', 'BOVINOS', 'unid', 'congelado', CARNE_CRUA),
  it('Maminha', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Fraldinha', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Cupim', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Cupim (espetinho)', 'BOVINOS', 'unid', 'congelado', CARNE_CRUA),
  it('Costela bovina', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Acém', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Patinho', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Coxão mole', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Coxão duro', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Músculo', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Carne moída', 'BOVINOS', 'kg', 'congelado', MOIDA),
  it('Carne em cubos', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Tiras para strogonoff', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Carne de sol', 'BOVINOS', 'kg', 'refrigerado', CARNE_CRUA),
  it('Charque', 'BOVINOS', 'kg', 'refrigerado', CARNE_CRUA),
  it('Hambúrguer bovino', 'BOVINOS', 'unid', 'congelado', MOIDA),
  it('Empanado de filé (porção)', 'BOVINOS', 'unid', 'congelado', MOIDA),
  it('Bife rolê', 'BOVINOS', 'unid', 'refrigerado', MOIDA),
  it('Fígado bovino', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Rabada', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),

  // ── AVES ───────────────────────────────────────────────────
  it('Frango inteiro', 'AVES', 'unid', 'congelado', CARNE_CRUA),
  it('Peito de frango inteiro', 'AVES', 'kg', 'congelado', CARNE_CRUA),
  it('Peito de frango (porção)', 'AVES', 'unid', 'congelado', CARNE_CRUA),
  it('Filé de frango', 'AVES', 'kg', 'congelado', CARNE_CRUA),
  it('Coxa e sobrecoxa', 'AVES', 'kg', 'congelado', CARNE_CRUA),
  it('Asa de frango', 'AVES', 'kg', 'congelado', CARNE_CRUA),
  it('Coxinha da asa', 'AVES', 'kg', 'congelado', CARNE_CRUA),
  it('Frango desfiado', 'AVES', 'kg', 'refrigerado', COZIDO),
  it('Frango em cubos', 'AVES', 'kg', 'congelado', CARNE_CRUA),
  it('Frango empanado', 'AVES', 'kg', 'congelado', MOIDA),
  it('Peito de peru fatiado', 'AVES', 'kg', 'refrigerado', FRIOS),
  it('Coração de frango', 'AVES', 'kg', 'congelado', CARNE_CRUA),
  it('Ovo de codorna cozido', 'AVES', 'unid', 'refrigerado', COZIDO),

  // ── SUÍNOS ─────────────────────────────────────────────────
  it('Lombo suíno inteiro', 'SUÍNOS', 'kg', 'congelado', CARNE_CRUA),
  it('Lombo suíno (porção)', 'SUÍNOS', 'unid', 'congelado', CARNE_CRUA),
  it('Costela suína', 'SUÍNOS', 'kg', 'congelado', CARNE_CRUA),
  it('Pernil', 'SUÍNOS', 'kg', 'congelado', CARNE_CRUA),
  it('Bisteca suína', 'SUÍNOS', 'kg', 'congelado', CARNE_CRUA),
  it('Panceta', 'SUÍNOS', 'kg', 'congelado', CARNE_CRUA),
  it('Bacon em cubos', 'SUÍNOS', 'kg', 'refrigerado', FRIOS),
  it('Bacon fatiado', 'SUÍNOS', 'kg', 'refrigerado', FRIOS),
  it('Linguiça calabresa', 'SUÍNOS', 'kg', 'refrigerado', FRIOS),
  it('Linguiça toscana', 'SUÍNOS', 'kg', 'refrigerado', FRIOS),
  it('Paio', 'SUÍNOS', 'kg', 'refrigerado', FRIOS),
  it('Costelinha temperada', 'SUÍNOS', 'kg', 'congelado', CARNE_CRUA),
  it('Pururuca / torresmo', 'SUÍNOS', 'kg', 'ambiente', { ambiente: 2 }),

  // ── PESCADOS ───────────────────────────────────────────────
  it('Filé de tilápia', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Salmão em posta', 'PESCADOS', 'kg', 'congelado', PESCADO_GOR),
  it('Salmão em cubos', 'PESCADOS', 'kg', 'congelado', PESCADO_GOR),
  it('Camarão limpo', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Camarão com casca', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Polvo', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Lula em anéis', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Bacalhau dessalgado', 'PESCADOS', 'kg', 'refrigerado', PESCADO),
  it('Peixe inteiro limpo', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Filé de pescada', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Atum em posta', 'PESCADOS', 'kg', 'congelado', PESCADO_GOR),
  it('Marisco / vôngole', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Pescado cozido', 'PESCADOS', 'kg', 'refrigerado', { refrigerado: 1 }),

  // ── HORTIFRÚTI ─────────────────────────────────────────────
  it('Alface', 'HORTIFRÚTI', 'unid', 'refrigerado', FOLHOSA),
  it('Alface higienizada', 'HORTIFRÚTI', 'kg', 'refrigerado', FOLHOSA),
  it('Rúcula', 'HORTIFRÚTI', 'maço', 'refrigerado', FOLHOSA),
  it('Agrião', 'HORTIFRÚTI', 'maço', 'refrigerado', FOLHOSA),
  it('Couve', 'HORTIFRÚTI', 'maço', 'refrigerado', FOLHOSA),
  it('Couve fatiada', 'HORTIFRÚTI', 'kg', 'refrigerado', FOLHOSA),
  it('Repolho', 'HORTIFRÚTI', 'unid', 'resfriado', HORTI),
  it('Tomate', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Tomate picado', 'HORTIFRÚTI', 'kg', 'refrigerado', FOLHOSA),
  it('Cebola', 'HORTIFRÚTI', 'kg', 'ambiente', { ambiente: 30 }),
  it('Cebola picada', 'HORTIFRÚTI', 'kg', 'refrigerado', FOLHOSA),
  it('Alho', 'HORTIFRÚTI', 'kg', 'ambiente', { ambiente: 30 }),
  it('Alho descascado', 'HORTIFRÚTI', 'kg', 'refrigerado', FOLHOSA),
  it('Batata', 'HORTIFRÚTI', 'kg', 'ambiente', { ambiente: 15 }),
  it('Batata descascada', 'HORTIFRÚTI', 'kg', 'refrigerado', { refrigerado: 2 }),
  it('Cenoura', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Cenoura ralada', 'HORTIFRÚTI', 'kg', 'refrigerado', FOLHOSA),
  it('Pimentão', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Abobrinha', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Berinjela', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Brócolis', 'HORTIFRÚTI', 'kg', 'refrigerado', FOLHOSA),
  it('Couve-flor', 'HORTIFRÚTI', 'kg', 'refrigerado', FOLHOSA),
  it('Cheiro-verde', 'HORTIFRÚTI', 'maço', 'refrigerado', FOLHOSA),
  it('Manjericão', 'HORTIFRÚTI', 'maço', 'refrigerado', FOLHOSA),
  it('Limão', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Abacaxi', 'HORTIFRÚTI', 'unid', 'resfriado', HORTI),
  it('Abacaxi picado', 'HORTIFRÚTI', 'kg', 'refrigerado', { refrigerado: 2 }),
  it('Manga', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Banana', 'HORTIFRÚTI', 'kg', 'ambiente', { ambiente: 5 }),
  it('Mamão', 'HORTIFRÚTI', 'unid', 'resfriado', HORTI),
  it('Melancia picada', 'HORTIFRÚTI', 'kg', 'refrigerado', { refrigerado: 2 }),
  it('Salada higienizada', 'HORTIFRÚTI', 'kg', 'refrigerado', FOLHOSA),
  it('Legumes descascados', 'HORTIFRÚTI', 'kg', 'refrigerado', { refrigerado: 2 }),
  it('Milho verde', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),

  // ── LATICÍNIOS E FRIOS ─────────────────────────────────────
  it('Queijo mussarela', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('Queijo mussarela fatiado', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS),
  it('Queijo prato', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('Queijo coalho', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('Queijo parmesão ralado', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('Queijo minas', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('Requeijão', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', ABERTO, 'abertura'),
  it('Cream cheese', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', ABERTO, 'abertura'),
  it('Presunto', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('Presunto fatiado', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS),
  it('Mortadela', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('Salame', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('Manteiga', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', ABERTO, 'abertura'),
  it('Margarina', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', ABERTO, 'abertura'),
  it('Creme de leite', 'LATICÍNIOS E FRIOS', 'L', 'refrigerado', { refrigerado: 3 }, 'abertura'),
  it('Leite condensado', 'LATICÍNIOS E FRIOS', 'L', 'refrigerado', { refrigerado: 3 }, 'abertura'),
  it('Leite aberto', 'LATICÍNIOS E FRIOS', 'L', 'refrigerado', { refrigerado: 3 }, 'abertura'),
  it('Iogurte natural', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', ABERTO, 'abertura'),
  it('Ovos', 'LATICÍNIOS E FRIOS', 'unid', 'refrigerado', ABERTO),
  it('Nata', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', { refrigerado: 3 }, 'abertura'),

  // ── MOLHOS E PREPARADOS (da casa) ──────────────────────────
  it('Molho de tomate da casa', 'MOLHOS E PREPARADOS', 'L', 'refrigerado', COZIDO),
  it('Molho branco', 'MOLHOS E PREPARADOS', 'L', 'refrigerado', COZIDO),
  it('Molho barbecue da casa', 'MOLHOS E PREPARADOS', 'L', 'refrigerado', COZIDO),
  it('Molho de alho', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', { refrigerado: 3 }),
  it('Maionese temperada', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', { refrigerado: 2 }),
  it('Vinagrete', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', { refrigerado: 2 }),
  it('Chimichurri', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', { refrigerado: 3 }),
  it('Caldo de carne', 'MOLHOS E PREPARADOS', 'L', 'congelado', COZIDO),
  it('Caldo de legumes', 'MOLHOS E PREPARADOS', 'L', 'congelado', COZIDO),
  it('Caldo de frango', 'MOLHOS E PREPARADOS', 'L', 'congelado', COZIDO),
  it('Feijão cozido', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', COZIDO),
  it('Arroz cozido', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', COZIDO),
  it('Purê de batata', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', COZIDO),
  it('Farofa pronta', 'MOLHOS E PREPARADOS', 'kg', 'ambiente', { ambiente: 2, refrigerado: 3 }),
  it('Carne desfiada temperada', 'MOLHOS E PREPARADOS', 'kg', 'congelado', COZIDO),
  it('Recheio pronto', 'MOLHOS E PREPARADOS', 'kg', 'congelado', COZIDO),
  it('Legumes refogados', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', COZIDO),
  it('Massa de bolinho', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', { refrigerado: 2 }),
  it('Marinada / tempero líquido', 'MOLHOS E PREPARADOS', 'L', 'refrigerado', { refrigerado: 3 }),

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
  it('Ketchup', 'TEMPEROS E CONDIMENTOS', 'kg', 'refrigerado', ABERTO, 'abertura'),
  it('Mostarda', 'TEMPEROS E CONDIMENTOS', 'kg', 'refrigerado', ABERTO, 'abertura'),
  it('Maionese industrializada', 'TEMPEROS E CONDIMENTOS', 'kg', 'refrigerado', ABERTO, 'abertura'),
  it('Extrato de tomate', 'TEMPEROS E CONDIMENTOS', 'kg', 'refrigerado', { refrigerado: 3 }, 'abertura'),
  it('Azeitona', 'TEMPEROS E CONDIMENTOS', 'kg', 'refrigerado', ABERTO, 'abertura'),
  it('Palmito', 'TEMPEROS E CONDIMENTOS', 'kg', 'refrigerado', { refrigerado: 3 }, 'abertura'),
  it('Milho em conserva', 'TEMPEROS E CONDIMENTOS', 'kg', 'refrigerado', { refrigerado: 2 }, 'abertura'),
  it('Ervilha em conserva', 'TEMPEROS E CONDIMENTOS', 'kg', 'refrigerado', { refrigerado: 2 }, 'abertura'),

  // ── MASSAS E PANIFICAÇÃO ───────────────────────────────────
  it('Massa fresca', 'MASSAS E PANIFICAÇÃO', 'kg', 'refrigerado', { refrigerado: 3 }),
  it('Massa de pizza', 'MASSAS E PANIFICAÇÃO', 'unid', 'refrigerado', { refrigerado: 2, congelado: 30 }),
  it('Massa de pastel', 'MASSAS E PANIFICAÇÃO', 'kg', 'refrigerado', { refrigerado: 3 }),
  it('Massa de lasanha', 'MASSAS E PANIFICAÇÃO', 'kg', 'refrigerado', { refrigerado: 3 }),
  it('Pão de hambúrguer', 'MASSAS E PANIFICAÇÃO', 'unid', 'ambiente', { ambiente: 3 }),
  it('Pão francês', 'MASSAS E PANIFICAÇÃO', 'kg', 'ambiente', { ambiente: 1 }),
  it('Pão de forma', 'MASSAS E PANIFICAÇÃO', 'unid', 'ambiente', { ambiente: 5 }, 'abertura'),
  it('Torrada / crouton', 'MASSAS E PANIFICAÇÃO', 'kg', 'ambiente', { ambiente: 7 }),
  it('Bolo', 'MASSAS E PANIFICAÇÃO', 'unid', 'refrigerado', { refrigerado: 3 }),
  it('Massa de bolo crua', 'MASSAS E PANIFICAÇÃO', 'kg', 'refrigerado', { refrigerado: 1 }),

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
  it('Suco natural', 'BEBIDAS', 'L', 'refrigerado', { refrigerado: 1 }),
  it('Polpa batida', 'BEBIDAS', 'L', 'refrigerado', { refrigerado: 1 }),
  it('Chá gelado', 'BEBIDAS', 'L', 'refrigerado', { refrigerado: 2 }),
  it('Limonada', 'BEBIDAS', 'L', 'refrigerado', { refrigerado: 1 }),
  it('Caldo de cana', 'BEBIDAS', 'L', 'refrigerado', { refrigerado: 1 }),
  it('Xarope / calda', 'BEBIDAS', 'L', 'refrigerado', { refrigerado: 15 }),

  // ── DOCES E SOBREMESAS ─────────────────────────────────────
  it('Pudim', 'DOCES E SOBREMESAS', 'unid', 'refrigerado', { refrigerado: 3 }),
  it('Mousse', 'DOCES E SOBREMESAS', 'kg', 'refrigerado', { refrigerado: 3 }),
  it('Doce de leite', 'DOCES E SOBREMESAS', 'kg', 'refrigerado', ABERTO, 'abertura'),
  it('Brigadeiro / recheio doce', 'DOCES E SOBREMESAS', 'kg', 'refrigerado', { refrigerado: 3 }),
  it('Calda de chocolate', 'DOCES E SOBREMESAS', 'L', 'refrigerado', { refrigerado: 7 }),
  it('Fruta em calda', 'DOCES E SOBREMESAS', 'kg', 'refrigerado', { refrigerado: 5 }, 'abertura'),
  it('Chantilly montado', 'DOCES E SOBREMESAS', 'kg', 'refrigerado', { refrigerado: 1 }),
  it('Sorvete caseiro', 'DOCES E SOBREMESAS', 'L', 'congelado', { congelado: 90 }),
  it('Torta gelada', 'DOCES E SOBREMESAS', 'unid', 'refrigerado', { refrigerado: 3 }),
  it('Ganache', 'DOCES E SOBREMESAS', 'kg', 'refrigerado', { refrigerado: 7 }),

  // ── ACRESCENTADOS NA 2ª PASSADA ────────────────────────────
  // Faltavam itens que quase toda cozinha etiqueta e que não estavam em
  // nenhuma das categorias acima.
  it('Costela bovina desossada', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Ossobuco', 'BOVINOS', 'kg', 'congelado', CARNE_CRUA),
  it('Carne para hambúrguer (blend)', 'BOVINOS', 'kg', 'congelado', MOIDA),
  it('Picanha suína', 'SUÍNOS', 'kg', 'congelado', CARNE_CRUA),
  it('Joelho suíno', 'SUÍNOS', 'kg', 'congelado', CARNE_CRUA),
  it('Salsicha', 'SUÍNOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('File de peito de frango temperado', 'AVES', 'kg', 'congelado', CARNE_CRUA),
  it('Sassami', 'AVES', 'kg', 'congelado', CARNE_CRUA),
  it('Tilápia inteira', 'PESCADOS', 'kg', 'congelado', PESCADO),
  it('Camarão cozido', 'PESCADOS', 'kg', 'refrigerado', { refrigerado: 1 }),
  it('Pepino', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Beterraba', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Chuchu', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Mandioca descascada', 'HORTIFRÚTI', 'kg', 'refrigerado', { refrigerado: 2, congelado: MESES(6) }),
  it('Batata-doce', 'HORTIFRÚTI', 'kg', 'ambiente', { ambiente: 15 }),
  it('Salsa e cebolinha picada', 'HORTIFRÚTI', 'kg', 'refrigerado', FOLHOSA),
  it('Gengibre', 'HORTIFRÚTI', 'kg', 'resfriado', HORTI),
  it('Queijo gorgonzola', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('Queijo provolone', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', FRIOS, 'abertura'),
  it('Ricota', 'LATICÍNIOS E FRIOS', 'kg', 'refrigerado', { refrigerado: 3 }, 'abertura'),
  it('Leite integral (caixa fechada)', 'LATICÍNIOS E FRIOS', 'L', 'ambiente', ABERTO, 'abertura'),
  it('Clara / gema pasteurizada', 'LATICÍNIOS E FRIOS', 'L', 'refrigerado', { refrigerado: 3 }, 'abertura'),
  it('Molho pesto', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', { refrigerado: 5 }),
  it('Molho de pimenta da casa', 'MOLHOS E PREPARADOS', 'L', 'refrigerado', { refrigerado: 15 }),
  it('Ragu / molho de carne', 'MOLHOS E PREPARADOS', 'kg', 'congelado', COZIDO),
  it('Base de risoto', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', COZIDO),
  it('Sopa / creme', 'MOLHOS E PREPARADOS', 'L', 'congelado', COZIDO),
  it('Massa de panqueca', 'MASSAS E PANIFICAÇÃO', 'kg', 'refrigerado', { refrigerado: 2 }),
  it('Pão de alho', 'MASSAS E PANIFICAÇÃO', 'unid', 'congelado', { congelado: 90 }),
  it('Tapioca (goma)', 'MASSAS E PANIFICAÇÃO', 'kg', 'refrigerado', { refrigerado: 5 }),
  it('Chocolate em pó', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Gelatina em pó', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Mel', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Café em pó', 'GRÃOS E SECOS', 'kg', 'ambiente', ABERTO, 'abertura'),
  it('Vinho para cozinha', 'TEMPEROS E CONDIMENTOS', 'L', 'ambiente', ABERTO, 'abertura'),
  it('Alho triturado em conserva', 'TEMPEROS E CONDIMENTOS', 'kg', 'refrigerado', { refrigerado: 7 }, 'abertura'),
  it('Cebola caramelizada', 'MOLHOS E PREPARADOS', 'kg', 'refrigerado', { refrigerado: 7 }),
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
