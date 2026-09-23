// =====================================================================
//  BUSCA — uma regra só para o app inteiro (23/09/2026)
//
//  ⚠️ O cozinheiro digita no celular ou no tablet com pressa e sem acento: "file", "pure",
//  "feijao", "limao". Com `toLowerCase().includes`, isso dava "Nada
//  encontrado" para Filé, Purê, Feijão e Limão — e a pessoa concluía que o
//  item não existia: escrevia à mão ou cadastrava de novo (item duplicado).
//  Só a biblioteca ignorava acento; as telas do dia a dia não. O mesmo dado
//  se comportava de dois jeitos.
//
//  Regra: sem acento, sem maiúscula, e CADA palavra digitada tem de aparecer
//  em algum dos textos, em qualquer ordem — "mignon porc" acha "Filé mignon
//  porcionado".
// =====================================================================

/** Texto comparável: sem acento (ç → c) e minúsculo. */
export const normalizarBusca = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * O item casa com o que foi digitado? `textos` são os campos onde procurar
 * (nome, categoria, responsável...). Busca vazia casa com tudo.
 */
export function casaBusca(termo, ...textos) {
  const palavras = normalizarBusca(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return true;
  const alvo = normalizarBusca(textos.filter(t => t != null && t !== '').join(' '));
  return palavras.every(p => alvo.includes(p));
}
