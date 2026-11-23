// =====================================================================
//  A MEDIDA PELO TECLADO GRANDE (23/11/2026, jeito do Magurō)
//
//  A medida da etiqueta é TEXTO — "1 kg", "1,5 kg", "500 g", "4 un". É o que
//  sai impresso, e é o que quantoSomaNaContagem (utils/etiquetas.js) lê para
//  dar entrada no estoque. O teclado grande monta ESSE MESMO texto: número com
//  vírgula, um espaço, a unidade. O que não for "número + unidade" ("1 pote",
//  "porção da casa") continua como texto livre — o teclado tem "Outra medida".
//
//  Tudo aqui é puro, com teste em __tests__/medida.test.js.
// =====================================================================

// ⚠️ "un", e não "unid": é o que quantoSomaNaContagem conta como "unidades na
// embalagem" ("4 un" num item contado em unidade = 4) — ver lá.
export const UNIDADES_DA_MEDIDA = ['kg', 'g', 'L', 'mL', 'un'];

const GRAFIA = {
  kg: 'kg', g: 'g', gr: 'g', l: 'L', ml: 'mL',
  un: 'un', und: 'un', unid: 'un', unidade: 'un', unidades: 'un',
};

// até 6 algarismos antes da vírgula e 3 depois: "1,5", "500", "0,250"
export const MAX_INTEIROS = 6;
export const MAX_DECIMAIS = 3;

/**
 * "1,5 kg" → { numero: '1,5', unidade: 'kg', livre: '' }
 * ""       → { numero: '', unidade: '', livre: '' }
 * "1 pote" → { numero: '', unidade: '', livre: '1 pote' }
 */
export function lerMedida(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return { numero: '', unidade: '', livre: '' };
  const m = t.match(/^(\d{1,6}(?:[.,]\d{1,3})?)\s*([a-zA-Z]*)\.?$/);
  if (!m) return { numero: '', unidade: '', livre: t };
  const un = m[2].toLowerCase();
  const unidade = un ? GRAFIA[un] : '';
  if (unidade === undefined) return { numero: '', unidade: '', livre: t };
  return { numero: m[1].replace('.', ','), unidade, livre: '' };
}

/** O texto que vai na etiqueta: "1,5 kg". Número vazio ou zero = sem medida. */
export function textoDaMedida(numero, unidade) {
  const n = String(numero ?? '').trim().replace(/,$/, '');
  if (!n || !/[1-9]/.test(n)) return '';
  return unidade ? `${n} ${unidade}` : n;
}

/** A unidade que o teclado abre marcada: a da medida que já existe, senão a do item. */
export function unidadeParaAbrir(medida, unidadeDoItem) {
  const daMedida = lerMedida(medida).unidade;
  if (daMedida) return daMedida;
  const doItem = GRAFIA[String(unidadeDoItem ?? '').trim().toLowerCase()];
  return doItem || 'kg';
}

/**
 * Uma tecla a mais no número. `tecla` é '0'..'9' ou ','. Devolve o número
 * novo (texto), ou o MESMO quando a tecla não cabe (vírgula repetida, número
 * grande demais).
 */
export function teclar(numero, tecla, { decimal = true } = {}) {
  const atual = String(numero ?? '');
  if (tecla === ',') {
    if (!decimal || atual.includes(',')) return atual;
    return `${atual || '0'},`;
  }
  if (!/^\d$/.test(tecla)) return atual;
  if (atual === '0') return tecla;
  const [inteiro, decimais] = atual.split(',');
  if (decimais === undefined && inteiro.length >= MAX_INTEIROS) return atual;
  if (decimais !== undefined && decimais.length >= MAX_DECIMAIS) return atual;
  return atual + tecla;
}
