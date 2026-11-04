// =====================================================================
//  BUSCA POR VOZ (pedido do dono, 04/11/2026)
//
//  A pessoa toca no microfone e fala o item — com a mão suja ou de luva, sem
//  digitar. Quem transforma a fala em texto é o NAVEGADOR (Chrome no Android,
//  Safari no iPhone), de graça. Aqui o app só entende o texto:
//   • a quantidade, se veio junto: "três etiquetas de frango desfiado";
//   • o item, tolerando o pouco que o reconhecimento erra ("frango desfiada").
//
//  ⚠️ O reconhecimento passa pelo serviço de voz do Google ou da Apple e
//  PRECISA DE INTERNET. O modo dentro do aparelho ainda é experimental nos
//  navegadores (nov/2026) — não dá para contar com ele.
// =====================================================================

import { normalizarBusca, casaBusca } from './busca';

/** O navegador reconhece fala? (Firefox e o navegador do WhatsApp, não.) */
export const vozDisponivel = () =>
  typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

const UNIDADES = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
};
const NUMEROS = {
  ...UNIDADES, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
};
// "de frango", "do molho", "pra picanha" — ligam a quantidade ao item
const LIGACOES = new Set(['de', 'do', 'da', 'dos', 'das', 'pra', 'para']);
const ETIQUETA = /^etiquetas?$/;
// o que se fala antes do pedido e não é o item
const VERBOS = new Set(['imprimir', 'imprime', 'imprima', 'quero', 'faz', 'faca', 'fazer', 'me', 've', 'manda', 'mais']);
// palavras que não ajudam a achar o item ("filé DE frango")
const VAZIAS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'com', 'sem', 'a', 'o', 'as', 'os', 'em', 'no', 'na']);

const palavras = (s) => normalizarBusca(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
// cada palavra falada como veio ("filé", para mostrar) e como compara ("file")
const pedacos = (s) => String(s ?? '').split(/\s+/)
  .map(orig => ({ orig: orig.replace(/[^\p{L}\p{N}]/gu, ''), norm: normalizarBusca(orig).replace(/[^a-z0-9]/g, '') }))
  .filter(p => p.norm);

/** Lê um número a partir da posição i: "3", "tres", "vinte e cinco". */
function lerNumero(ps, i) {
  const p = ps[i];
  if (p == null) return null;
  if (/^\d{1,3}$/.test(p)) return { valor: parseInt(p, 10), usados: 1 };
  const v = NUMEROS[p];
  if (v == null) return null;
  // "vinte e cinco": dezena + "e" + unidade
  if (v >= 20 && ps[i + 1] === 'e' && UNIDADES[ps[i + 2]] != null) {
    return { valor: v + UNIDADES[ps[i + 2]], usados: 3 };
  }
  return { valor: v, usados: 1 };
}

/** Distância de edição (quantas letras trocar, pôr ou tirar). */
function distancia(a, b) {
  if (a === b) return 0;
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return linha[b.length];
}

/** Duas palavras parecidas o bastante: plural, gênero, uma letra trocada. */
function parecida(falada, doNome) {
  if (falada === doNome) return true;
  if (falada.length >= 3 && doNome.startsWith(falada)) return true;
  const tolerancia = Math.max(falada.length, doNome.length) >= 7 ? 2 : falada.length >= 4 ? 1 : 0;
  return tolerancia > 0 && distancia(falada, doNome) <= tolerancia;
}

/**
 * Quanto o termo falado combina com o nome do item:
 * 100 igual · 90 começa igual · 80 todas as palavras aparecem (a busca de
 * sempre) · 70 parecidas (o reconhecimento errou pouco) · 0 nada.
 */
export function pontuarItem(termo, nome) {
  const t = palavras(termo).join(' ');
  const n = palavras(nome).join(' ');
  if (!t || !n) return 0;
  if (n === t) return 100;
  if (n.startsWith(`${t} `)) return 90;
  if (casaBusca(t, nome)) return 80;
  const faladas = palavras(t).filter(p => !VAZIAS.has(p));
  const doNome = palavras(n).filter(p => !VAZIAS.has(p));
  if (faladas.length && faladas.every(f => doNome.some(d => parecida(f, d)))) return 70;
  return 0;
}

/**
 * Separa a quantidade do item: "três etiquetas de frango desfiado" →
 * { quantidade: 3, termo: 'frango desfiado', falado: 'frango desfiado' }.
 * Sem número, quantidade null. `termo` é o que compara (sem acento);
 * `falado`, o que a tela mostra ("filé", não "file").
 * ⚠️ O nome inteiro ganha da quantidade: "quatro queijos" é o item, quando
 * existe um item com esse nome — não "4 de queijos".
 */
export function entenderFala(texto, produtos = []) {
  let ps = pedacos(texto);
  while (ps.length && VERBOS.has(ps[0].norm)) ps = ps.slice(1);
  const normais = (lista) => lista.map(p => p.norm);
  const pedido = (lista, quantidade) => ({
    termo: normais(lista).join(' '),
    falado: lista.map(p => p.orig).join(' '),
    quantidade,
  });
  const inteiro = normais(ps).join(' ');
  if (produtos.some(p => pontuarItem(inteiro, p.nome) >= 90)) return pedido(ps, null);

  // quantidade no começo: "3 etiquetas de frango", "duas picanhas"
  const inicio = lerNumero(normais(ps), 0);
  if (inicio && ps.length > inicio.usados) {
    let resto = ps.slice(inicio.usados);
    if (ETIQUETA.test(resto[0]?.norm)) resto = resto.slice(1);
    if (LIGACOES.has(resto[0]?.norm)) resto = resto.slice(1);
    if (resto.length) return pedido(resto, inicio.valor);
  }
  // quantidade no fim: "frango desfiado, três etiquetas" / "frango desfiado três"
  let fim = ps;
  if (ETIQUETA.test(fim[fim.length - 1]?.norm)) fim = fim.slice(0, -1);
  for (const usados of [3, 1]) {
    const i = fim.length - usados;
    if (i < 1) continue;
    const n = lerNumero(normais(fim), i);
    if (n && n.usados === usados) return pedido(fim.slice(0, i), n.valor);
  }
  // sem número: tira o "etiqueta(s) de" da frente, se veio
  if (ETIQUETA.test(ps[0]?.norm)) ps = ps.slice(LIGACOES.has(ps[1]?.norm) ? 2 : 1);
  return pedido(ps, null);
}

/**
 * O navegador manda até 3 versões do que ouviu ("frango desfiado", "frango
 * desfiada"...). Fica a que achar o melhor item.
 * Devolve { termo, quantidade, achados: [{ produto, nota }] } — melhor primeiro.
 */
export function acharPorVoz(alternativas, produtos) {
  let melhor = null;
  for (const texto of alternativas || []) {
    const pedido = entenderFala(texto, produtos);
    if (!pedido.termo) continue;
    const achados = (produtos || [])
      .map(produto => ({ produto, nota: pontuarItem(pedido.termo, produto.nome) }))
      .filter(a => a.nota > 0)
      .sort((a, b) => b.nota - a.nota || (a.produto.nome || '').localeCompare(b.produto.nome || '', 'pt-BR'));
    const r = { ...pedido, achados };
    if (!melhor || (achados[0]?.nota || 0) > (melhor.achados[0]?.nota || 0)) melhor = r;
  }
  return melhor || { termo: '', falado: '', quantidade: null, achados: [] };
}

/**
 * Dá para abrir a impressão direto? Só quando não há dúvida: um item só
 * combinou, ou o nome falado é exatamente o de um item. Com dois ou mais
 * parecidos, a lista filtra e a pessoa escolhe.
 */
export function itemCerto(achados) {
  if (!achados?.length) return null;
  if (achados.length === 1) return achados[0].produto;
  if (achados[0].nota === 100 && achados[1].nota < 100) return achados[0].produto;
  return null;
}

/** O que dizer quando a voz falha (os códigos de erro do navegador). */
export function textoDoErroDeVoz(erro) {
  switch (erro) {
    case 'aborted': return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'O microfone está bloqueado para este app. Libere nas permissões do navegador e toque de novo.';
    case 'network': return 'A busca por voz precisa de internet. Digite o nome do item.';
    case 'no-speech': return 'Não ouvi nada. Toque no microfone e fale perto do aparelho.';
    case 'audio-capture': return 'Não achei o microfone deste aparelho.';
    case 'language-not-supported': return 'Este navegador não reconhece fala em português. Digite o nome do item.';
    default: return 'Não entendi. Toque no microfone de novo ou digite.';
  }
}
