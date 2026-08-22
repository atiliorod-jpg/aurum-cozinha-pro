// Módulos do app (multi-cozinha). Cada módulo é um ESTOQUE SEPARADO dentro da
// MESMA conta/restaurante — quem trabalha só no seco não enxerga a produção.
//
// ⚠️ REGRA QUE EVITA MIGRAÇÃO: o módulo PADRÃO ('producao') guarda os dados nas
// chaves ANTIGAS ('produtos', 'entradas', tipo 'entrada'…). Só os módulos novos
// ganham prefixo. Assim todo restaurante que já usa o app continua lendo e
// gravando exatamente onde sempre gravou — não existe dado para converter, e um
// bug no código novo não tem como corromper o estoque de produção de ninguém.

export const MODULO_PADRAO = 'producao';

// ─────────────────────────────────────────────────────────────────────
//  INSTÂNCIAS — vários estoques do MESMO tipo na mesma conta.
//  Ex.: o Estoque Seco do Restaurante X e o do Restaurante Y.
//
//  Formato: <tipo>#<4 caracteres>   →  'seco#x7k2'
//
//  Por que '#' e não ':' — `lerTipo` corta no PRIMEIRO ':', então
//  'seco#x7k2:entrada' continua sendo lido como { modulo:'seco#x7k2',
//  tipo:'entrada' } sem alterar uma linha daquela função.
//
//  A instância RAIZ de cada tipo mantém o id de sempre ('seco', 'producao'),
//  então nenhum dado existente precisa ser convertido — é a mesma regra que
//  fez o multi-módulo caber sem migração de dados.
//
//  ⚠️ Duas regras de higiene: id de instância NUNCA entra cru numa URL (usar
//  encodeURIComponent — '#' vira âncora) nem num seletor CSS.
// ─────────────────────────────────────────────────────────────────────
export const SEPARADOR_INSTANCIA = '#';
export const RE_INSTANCIA = /^(producao|seco|finalizacao)#[a-z0-9]{4}$/;

/** Tipo base de um id. 'seco#x7k2' → 'seco'; 'seco' → 'seco'. */
export const tipoBase = (id) => {
  const s = String(id || '');
  const i = s.indexOf(SEPARADOR_INSTANCIA);
  return i < 0 ? s : s.slice(0, i);
};

export const ehIdInstancia = (id) => RE_INSTANCIA.test(String(id || ''));

// Sem i, l, o, 0 e 1: o dono precisa conseguir ler o id em voz alta ao telefone
// quando for pedir suporte, e esses cinco se confundem em qualquer fonte.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Gera um id novo e não usado para uma instância do tipo. */
export function gerarIdInstancia(tipo, existentes = []) {
  if (!RECURSOS_MODULO[tipo]) throw new Error(`Tipo de estoque desconhecido: ${tipo}`);
  const usados = new Set((existentes || []).map(i => i && i.id));
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    let sufixo = '';
    for (let n = 0; n < 4; n++) sufixo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
    const id = `${tipo}${SEPARADOR_INSTANCIA}${sufixo}`;
    if (!usados.has(id)) return id;
  }
  throw new Error('Não consegui gerar um id de estoque. Tente de novo.');
}

export const MODULOS = [
  {
    id: 'producao',
    // ⚠️ Nome de ÍCONE (ver Icons.jsx), não emoji: emoji renderiza diferente
    // em cada aparelho e não aceita a cor da marca.
    icone: 'faca',
    label: 'Cozinha de Produção',
    descricao: 'Porcionamento e semiacabados: receitas, produção, aparas e etiquetas de validade.',
  },
  {
    id: 'finalizacao',
    icone: 'frigideira',
    label: 'Cozinha de Finalização',
    descricao: 'Recebe os semiacabados da produção e monta os pratos. Fecha o turno contando a sobra.',
  },
  {
    id: 'seco',
    icone: 'mantimento',
    label: 'Estoque Seco',
    descricao: 'Mantimentos: grãos, enlatados, temperos, descartáveis, bebidas e limpeza.',
  },
];

/**
 * De qual módulo vem o CATÁLOGO DE PRODUTOS.
 *
 * A Finalização não cadastra produto: ela recebe exatamente os semiacabados que
 * a Produção porcionou. Cadastrar "Molho da casa" duas vezes criaria dois itens
 * diferentes com o mesmo nome e a ponte entre as cozinhas nunca casaria os ids.
 * Por isso ela lê o catálogo da produção — mesmo item, mesmo id, dos dois lados.
 *
 * Com instâncias, o catálogo é por TIPO, não por instância: "Arroz tipo 1" é
 * cadastrado uma vez e aparece em todo Estoque Seco. O que é ÚNICO de cada
 * instância é o SALDO (sai de graça: os lançamentos já são separados por
 * estoque) e o mín/máx (documento `metas`, por instância).
 *
 * É também o que torna o balanço consolidado possível: somar por produtoId só
 * funciona porque o id é o mesmo dos dois lados.
 */
export const catalogoDe = (modulo) => {
  const base = tipoBase(modulo);
  return base === 'finalizacao' ? MODULO_PADRAO : base;
};

// Destino de saída que representa "mandei para a Cozinha de Finalização".
// É o gatilho da entrada automática do outro lado.
export const DESTINO_FINALIZACAO = 'finalizacao';

/**
 * Garante que os itens FIXOS do padrão existam na lista salva.
 *
 * O semeador de catálogo só roda quando o documento AINDA NÃO EXISTE na nuvem.
 * Toda conta criada antes da Cozinha de Finalização já tinha um documento
 * `locais` salvo, então o destino fixo nunca era acrescentado: a ponte entre as
 * duas cozinhas existia no código e era inalcançável pela tela — não havia como
 * escolher o destino que dispara o recebimento do outro lado.
 *
 * Preserva o que o restaurante editou (inclusive se renomeou o destino fixo);
 * só repõe o que está faltando e reforça a marca `fixo`, que é o que impede a
 * tela de Configurações de oferecer o botão de remover.
 *
 * Devolve a MESMA referência quando nada muda — sem isso a hidratação
 * gravaria o documento a cada abertura do app.
 */
export function mesclarFixos(salvos, padrao) {
  const lista = Array.isArray(salvos) ? salvos : [];
  const fixos = (padrao || []).filter(x => x && x.fixo);
  if (!fixos.length) return lista;

  let mudou = false;
  const saida = lista.map(item => {
    const f = fixos.find(y => y.id === item?.id);
    if (f && !item.fixo) { mudou = true; return { ...item, fixo: true }; }
    return item;
  });
  fixos.forEach(f => {
    if (!lista.some(item => item?.id === f.id)) { saida.push({ ...f }); mudou = true; }
  });
  return mudou ? saida : lista;
}

export const moduloPorId = (id) => MODULOS.find(m => m.id === tipoBase(id)) || MODULOS[0];

/**
 * Valida um id de estoque — por FORMATO, nunca consultando o registro de
 * instâncias.
 *
 * ⚠️ Isto não é preferência de estilo. Se a validação dependesse do registro,
 * ARQUIVAR uma instância faria `lerTipo` cair no fallback "prefixo desconhecido
 * = dado antigo" e despejar o estoque daquele restaurante DENTRO DA PRODUÇÃO,
 * sem erro nenhum. Validando por formato isso é impossível por construção.
 *
 * Também mantém a função pura: ela roda na leitura do localStorage, antes de
 * qualquer hidratação, quando o registro ainda nem existe.
 */
export const moduloValido = (id) => MODULOS.some(m => m.id === id) || ehIdInstancia(id);

/**
 * Quais recursos cada módulo tem. É isto que a navegação consulta para esconder
 * telas que não fazem sentido — estoque seco não tem receita nem apara de
 * limpeza, e mostrar essas telas vazias só confunde a equipe.
 */
export const RECURSOS_MODULO = {
  producao: {
    compras: true, entradas: true, compraEntraNoEstoque: false, validadeDoProdutor: false,
    saidas: true, producao: true,
    aparas: true, inventario: true, etiquetas: true, receitas: true, listaCompras: true,
    fecharTurno: false, perdas: true,
    // câmara fria: o item entra congelado OU resfriado, e cada um tem prazo próprio
    armazenamento: true,
  },
  seco: {
    // ⚠️ No seco a COMPRA JÁ É A ENTRADA. Você compra 12 pacotes de arroz e eles
    // SÃO o item do estoque — não existe porcionamento no meio. Ter duas telas
    // para o mesmo ato fazia a pessoa registrar a compra e o saldo não mexer.
    // Na Produção continuam separadas, porque lá são atos diferentes de verdade
    // (compra o filé cru, porciona depois, e é a porção que entra).
    compras: true, entradas: false, compraEntraNoEstoque: true,
    saidas: true, producao: false,
    aparas: false, inventario: true, receitas: false, listaCompras: true,
    fecharTurno: false, perdas: true,
    // Etiqueta não: o mantimento chega LACRADO e já etiquetado pelo fabricante.
    // Etiquetar o que já tem etiqueta é trabalho sem retorno. A tela de
    // Validades continua, lendo a data impressa que foi digitada na entrada.
    etiquetas: false,
    // despensa é temperatura ambiente: não existe "congelado/resfriado" aqui, e
    // a validade é a DO PRODUTOR, digitada na entrada — não um prazo calculado.
    armazenamento: false,
    validadeDoProdutor: true,
  },
  finalizacao: {
    // Não compra de fornecedor nem porciona: só RECEBE da produção. A entrada é
    // automática (a saída da produção para cá), por isso `entradas` fica off —
    // não existe tela de "dar entrada" aqui.
    compras: false, entradas: false, compraEntraNoEstoque: false, validadeDoProdutor: false,
    saidas: false, producao: false,
    aparas: false, receitas: false, listaCompras: false,
    // Durante o serviço ninguém registra prato a prato. O controle é: recebe
    // automático + conta a sobra no fim do turno + registra o que estragou.
    inventario: false, fecharTurno: true, perdas: true,
    etiquetas: true, armazenamento: true,
  },
};

// ESTRITO de propósito: só liga o que está declarado `true`. A versão anterior
// usava `!== false`, então um recurso ausente (ou um nome digitado errado)
// ligava a tela sozinho — foi assim que "Fechar turno", que só existe na
// finalização, apareceu na Produção e no Estoque Seco.
export const temRecurso = (modulo, recurso) =>
  (RECURSOS_MODULO[tipoBase(modulo)] || RECURSOS_MODULO[MODULO_PADRAO])[recurso] === true;

/**
 * Chave de catálogo/cache com namespace do módulo.
 *   chaveModulo('producao', 'produtos') → 'produtos'        (compatível com o que já existe)
 *   chaveModulo('seco',     'produtos') → 'seco::produtos'
 */
export const chaveModulo = (modulo, chave) =>
  !modulo || modulo === MODULO_PADRAO ? chave : `${modulo}::${chave}`;

/**
 * Tipo do registro com namespace do módulo. O app carrega os registros do
 * restaurante numa query só e agrupa por `tipo` no cliente, então prefixar o
 * tipo já separa os módulos sem coluna nova no banco.
 *   tipoModulo('producao', 'entrada') → 'entrada'
 *   tipoModulo('seco',     'entrada') → 'seco:entrada'
 */
export const tipoModulo = (modulo, tipo) =>
  !modulo || modulo === MODULO_PADRAO ? tipo : `${modulo}:${tipo}`;

/**
 * Separa um tipo gravado de volta em { modulo, tipo }.
 *
 * Corta no PRIMEIRO ':' — é por isso que o separador de instância é '#':
 * 'seco#x7k2:entrada' devolve { modulo: 'seco#x7k2', tipo: 'entrada' } sem que
 * esta função precise saber que instâncias existem.
 */
export function lerTipo(tipoGravado) {
  const i = String(tipoGravado || '').indexOf(':');
  if (i < 0) return { modulo: MODULO_PADRAO, tipo: tipoGravado };
  const modulo = tipoGravado.slice(0, i);
  return moduloValido(modulo)
    ? { modulo, tipo: tipoGravado.slice(i + 1) }
    : { modulo: MODULO_PADRAO, tipo: tipoGravado }; // prefixo desconhecido = dado antigo
}

// A auditoria é do RESTAURANTE (quem mexeu em quê), não de um módulo — fica
// fora do namespace para o histórico continuar único e comparável.
export const TIPOS_GLOBAIS = ['auditoria'];
export const ehTipoGlobal = (tipo) => TIPOS_GLOBAIS.includes(tipo);
