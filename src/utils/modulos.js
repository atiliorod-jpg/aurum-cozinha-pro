// Módulos do app (multi-cozinha). Cada módulo é um ESTOQUE SEPARADO dentro da
// MESMA conta/restaurante — quem trabalha só no seco não enxerga a produção.
//
// ⚠️ REGRA QUE EVITA MIGRAÇÃO: o módulo PADRÃO ('producao') guarda os dados nas
// chaves ANTIGAS ('produtos', 'entradas', tipo 'entrada'…). Só os módulos novos
// ganham prefixo. Assim todo restaurante que já usa o app continua lendo e
// gravando exatamente onde sempre gravou — não existe dado para converter, e um
// bug no código novo não tem como corromper o estoque de produção de ninguém.

export const MODULO_PADRAO = 'producao';

export const MODULOS = [
  {
    id: 'producao',
    icone: '🔪',
    label: 'Cozinha de Produção',
    descricao: 'Porcionamento e semiacabados: receitas, produção, aparas e etiquetas de validade.',
  },
  {
    id: 'seco',
    icone: '🧂',
    label: 'Estoque Seco',
    descricao: 'Mantimentos: grãos, enlatados, temperos, descartáveis, bebidas e limpeza.',
  },
];

export const moduloPorId = (id) => MODULOS.find(m => m.id === id) || MODULOS[0];
export const moduloValido = (id) => MODULOS.some(m => m.id === id);

/**
 * Quais recursos cada módulo tem. É isto que a navegação consulta para esconder
 * telas que não fazem sentido — estoque seco não tem receita nem apara de
 * limpeza, e mostrar essas telas vazias só confunde a equipe.
 */
export const RECURSOS_MODULO = {
  producao: {
    compras: true, entradas: true, saidas: true, producao: true,
    aparas: true, inventario: true, etiquetas: true, receitas: true, listaCompras: true,
  },
  seco: {
    compras: true, entradas: true, saidas: true, producao: false,
    aparas: false, inventario: true, etiquetas: true, receitas: false, listaCompras: true,
  },
};

export const temRecurso = (modulo, recurso) =>
  (RECURSOS_MODULO[modulo] || RECURSOS_MODULO[MODULO_PADRAO])[recurso] !== false;

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

/** Separa um tipo gravado de volta em { modulo, tipo }. */
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
