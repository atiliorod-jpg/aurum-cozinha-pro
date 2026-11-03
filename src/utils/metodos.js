// =====================================================================
//  MÉTODOS DE CONSERVAÇÃO DO ITEM (Lote 11, 02/11/2026 — ideia vista no Suflex)
//
//  Antes cada item tinha UM prazo, em dias, para CADA armazenamento da casa
//  (`prazos: { congelado: 30, resfriado: 3 }`), e a ficha mostrava todos os
//  armazenamentos, usados ou não. Agora o item tem a lista dos métodos que ele
//  usa de verdade:
//
//    { id, armazenamento, estado, dias, horas, minutos, mostrarHora }
//
//  • o MESMO armazenamento pode aparecer mais de uma vez, com um ESTADO
//    diferente: Resfriado 3 dias / Resfriado · Pista fria 7 dias. Os estados
//    são criados pela casa (Administração → Etiqueta);
//  • o prazo tem dias, horas e minutos: pista quente 2 h vence 2 h depois;
//  • `mostrarHora` decide se a hora sai na etiqueta. Ligado (o padrão) é o
//    que o app sempre fez: a validade repete a hora da manipulação (decisão do
//    dono: "manter como hoje"). Prazo com horas mostra a hora sempre — sem ela
//    "vence 14/10" de um molho de 2 h não diz nada.
//
//  ⚠️ O FORMATO ANTIGO CONTINUA SENDO GRAVADO (`prazos` + valCongelado/
//  valResfriado), com os DIAS do método sem estado de cada armazenamento. É o
//  que o estoque (Entradas, Produção) e os aparelhos com versão velha leem.
//  Item que nunca passou pela ficha nova não tem `metodos`: eles nascem do
//  `prazos` na leitura (metodosDoProduto), e nada muda no papel.
// =====================================================================

import { prazosDoProduto } from './armazenamento';
import { addDias } from './datas';
import { normalizarBusca } from './busca';

const inteiro = (v, max) => {
  const n = Math.floor(Number(String(v ?? '').replace(',', '.')));
  if (!Number.isFinite(n) || n < 0) return 0;
  return max != null ? Math.min(n, max) : n;
};

/** Um método com os números no lugar (texto vazio vira 0). */
export function normalizarMetodo(m) {
  return {
    id: String(m?.id || m?.armazenamento || 'metodo'),
    armazenamento: String(m?.armazenamento || ''),
    estado: String(m?.estado || ''),
    dias: inteiro(m?.dias, 3650),
    horas: inteiro(m?.horas, 23),
    minutos: inteiro(m?.minutos, 59),
    mostrarHora: m?.mostrarHora !== false,
  };
}

/**
 * Os métodos do item. Item sem a lista nova ganha um método por prazo
 * preenchido do formato antigo — o id é o do armazenamento, então a memória
 * do "último usado" de cada aparelho continua valendo.
 */
export function metodosDoProduto(p) {
  if (Array.isArray(p?.metodos) && p.metodos.length) return p.metodos.map(normalizarMetodo);
  // o armazenamento padrão do item vem primeiro: na ficha nova, o primeiro
  // método É o padrão
  const padrao = p?.armazenamentoPadrao;
  return Object.entries(prazosDoProduto(p))
    .filter(([, dias]) => Number(dias) > 0)
    .sort(([a], [b]) => (a === padrao ? -1 : b === padrao ? 1 : 0))
    .map(([armazenamento, dias]) => normalizarMetodo({ id: armazenamento, armazenamento, dias }));
}

export const minutosDoMetodo = (m) =>
  (Number(m?.dias) || 0) * 1440 + (Number(m?.horas) || 0) * 60 + (Number(m?.minutos) || 0);

export const temPrazo = (m) => minutosDoMetodo(m) > 0;

/** Prazo com horas ou minutos: a hora é parte da validade. */
export const prazoComHoras = (m) => (Number(m?.horas) || 0) > 0 || (Number(m?.minutos) || 0) > 0;

/** "3 dias", "2 h", "1 dia e 6 h", "45 min", ou '' sem prazo. */
export function textoDoPrazo(m) {
  const d = Number(m?.dias) || 0, h = Number(m?.horas) || 0, min = Number(m?.minutos) || 0;
  const partes = [];
  if (d) partes.push(`${d} ${d === 1 ? 'dia' : 'dias'}`);
  if (h) partes.push(`${h} h`);
  if (min) partes.push(`${min} min`);
  if (partes.length <= 1) return partes[0] || '';
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/** "30d", "2h", "1d 6h", "45min" — para as listas, onde cabe pouco. */
export function prazoCurto(m) {
  const d = Number(m?.dias) || 0, h = Number(m?.horas) || 0, min = Number(m?.minutos) || 0;
  return [d && `${d}d`, h && `${h}h`, min && `${min}min`].filter(Boolean).join(' ');
}

/** "Resfriado · Pista fria" — o nome do armazenamento e do estado da casa. */
export function rotuloDoMetodo(m, armazenamentos = [], estados = []) {
  const a = armazenamentos.find(x => x.id === m?.armazenamento);
  const e = estados.find(x => x.id === m?.estado);
  return [a?.nome || m?.armazenamento || '', e?.nome || ''].filter(Boolean).join(' · ');
}

/**
 * O formato antigo, para quem ainda lê `prazos`: os DIAS de cada armazenamento,
 * do método sem estado (senão do primeiro). Prazo só em horas vira 0 —
 * ⚠️ de propósito: arredondar 2 h para 1 dia daria ao aparelho desatualizado
 * uma validade MAIS LONGA que a real. Sem prazo, ele imprime sem validade, o
 * que se vê na hora.
 */
export function espelhoDosMetodos(metodos = []) {
  const prazos = {}, temSemEstado = new Set();
  for (const m of metodos.map(normalizarMetodo)) {
    const a = m.armazenamento;
    if (!a || temSemEstado.has(a)) continue;
    // o primeiro sem estado manda; até ele aparecer, vale o primeiro com estado
    if (!m.estado) { prazos[a] = m.dias; temSemEstado.add(a); }
    else if (!(a in prazos)) prazos[a] = m.dias;
  }
  return prazos;
}

/**
 * Os prazos em DIAS lidos da planilha de itens, aplicados nos métodos.
 *
 * A planilha tem uma coluna por armazenamento, e o número dela é o do espelho
 * (ver espelhoDosMetodos): o método sem estado, senão o primeiro. Então:
 *  • número igual ao que a planilha baixou → nada muda (o método com horas, ou
 *    com estado, fica como está);
 *  • número diferente → vira o prazo, em dias, DO MÉTODO QUE A COLUNA MOSTRA;
 *  • armazenamento sem método e com prazo → ganha um método novo, sem estado.
 * ⚠️ Sem isto a planilha "importava" e nada mudava no papel: o item com
 * métodos lê os métodos, não o `prazos` — o mesmo defeito que a planilha já
 * teve uma vez com valCongelado (ver planilhaItens.js).
 */
export function aplicarPrazosDaPlanilha(metodos = [], prazosLidos = {}) {
  const lista = metodos.map(normalizarMetodo);
  const espelho = espelhoDosMetodos(lista);
  for (const [armazenamento, valor] of Object.entries(prazosLidos || {})) {
    const dias = inteiro(valor, 3650);
    if ((espelho[armazenamento] ?? 0) === dias) continue;
    const i = lista.findIndex(m => m.armazenamento === armazenamento && !m.estado);
    const j = i >= 0 ? i : lista.findIndex(m => m.armazenamento === armazenamento);
    if (j >= 0) lista[j] = { ...lista[j], dias, horas: 0, minutos: 0 };
    else if (dias > 0) lista.push(normalizarMetodo({ id: novoIdDeMetodo(lista), armazenamento, dias }));
  }
  return lista;
}

/** Dois métodos com o mesmo armazenamento E o mesmo estado: um sobra. */
export function metodosRepetidos(metodos = []) {
  const vistos = new Set(), repetidos = new Set();
  for (const m of metodos) {
    const k = `${m?.armazenamento}|${m?.estado || ''}`;
    if (vistos.has(k)) repetidos.add(k); else vistos.add(k);
  }
  return repetidos;
}

/** Id novo, que não colide com os da lista. */
export function novoIdDeMetodo(metodos = []) {
  let n = metodos.length + 1;
  while (metodos.some(m => m.id === `m${n}`)) n++;
  return `m${n}`;
}

/**
 * Com que método a janela de impressão abre para este item.
 *
 * ⚠️ A MEMÓRIA DO APARELHO (`ultimoArmazenamento`) agora guarda o id do
 * MÉTODO. Item antigo tem método com o id do armazenamento, então a memória
 * gravada antes desta versão continua servindo. Como no armazenamentoInicial,
 * ela só vale se o método ainda existe, está num armazenamento ligado e tem
 * prazo — senão vale o cadastro.
 */
export function metodoInicial(produto, memoria, armazenamentos, metodos) {
  const ligados = new Set((armazenamentos || []).map(a => a?.id ?? a));
  const usaveis = (metodos || []).filter(m => ligados.has(m.armazenamento));
  if (!usaveis.length) return null;
  const lembrado = memoria?.[produto?.id];
  const porMemoria = usaveis.find(m => m.id === lembrado && temPrazo(m))
    // memória antiga, com o id do armazenamento: o método dele sem estado
    || usaveis.find(m => m.armazenamento === lembrado && !m.estado && temPrazo(m));
  if (porMemoria) return porMemoria;
  const padrao = produto?.armazenamentoPadrao;
  const doPadrao = usaveis.find(m => m.armazenamento === padrao && !m.estado)
    || usaveis.find(m => m.armazenamento === padrao);
  // ⚠️ PADRÃO LIGADO E SEM MÉTODO: abre nele, sem método (null), como antes.
  // É o Estoque Seco: o item abre em TEMPERATURA AMBIENTE e o "congelado" dele
  // é o prazo de prateleira da embalagem FECHADA (540 dias no extrato). Cair
  // no primeiro método imprimiria "CONGELADO" e 540 dias num pote aberto.
  if (padrao && ligados.has(padrao)) return doPadrao || null;
  return doPadrao || usaveis[0];
}

const doisDigitos = (n) => String(n).padStart(2, '0');

/**
 * A validade de um prazo contado a partir de data + hora.
 * Devolve { validade: 'AAAA-MM-DD', validadeHora: 'HH:MM' | '' }.
 *
 * Só dias: a mesma conta de sempre (addDias) e a hora repetida — "manter como
 * hoje". Com horas/minutos: soma de verdade, e o dia vira se passar da meia-noite.
 * ⚠️ Conta em UTC para não depender do fuso nem de horário de verão do aparelho.
 */
export function validadeDoPrazo(dataISO, hora, { dias = 0, horas = 0, minutos = 0 } = {}) {
  if (!dataISO) return { validade: null, validadeHora: '' };
  const d = Number(dias) || 0, h = Number(horas) || 0, min = Number(minutos) || 0;
  if (!h && !min) return { validade: d > 0 ? addDias(dataISO, d) : null, validadeHora: d > 0 ? (hora || '') : '' };
  const [hh, mm] = String(hora || '00:00').split(':').map(x => Number(x) || 0);
  const [a, me, di] = dataISO.split('-').map(Number);
  const t = new Date(Date.UTC(a, me - 1, di, hh, mm) + ((d * 24 + h) * 60 + min) * 60000);
  return {
    validade: `${t.getUTCFullYear()}-${doisDigitos(t.getUTCMonth() + 1)}-${doisDigitos(t.getUTCDate())}`,
    validadeHora: `${doisDigitos(t.getUTCHours())}:${doisDigitos(t.getUTCMinutes())}`,
  };
}

// ── Estados (Pista fria, Pista quente…) — da casa, em Administração → Etiqueta ──
export const ESTADOS_PADRAO = [
  { id: 'pista_fria', nome: 'Pista fria' },
  { id: 'pista_quente', nome: 'Pista quente' },
  { id: 'descongelando', nome: 'Descongelando' },
];

// ⚠️ O nome sai impresso na linha do armazenamento, junto do nome dele e da
// faixa: "RESFRIADO · PISTA QUENTE 6C A 10C". Nome longo empurra a faixa para
// fora do papel (a linha corta no fim) — e a faixa é o que o fiscal confere.
export const MAX_NOME_ESTADO = 16;

/** Lista da casa; sem nada salvo, os três de partida (que dá para apagar). */
export const listarEstados = (prefs) =>
  (Array.isArray(prefs?.estadosConservacao) ? prefs.estadosConservacao : ESTADOS_PADRAO)
    .filter(e => e && e.id && e.nome);

/** Id do estado a partir do nome: sem acento, sem espaço (como os armazenamentos). */
export const idDoEstado = (nome) => normalizarBusca(nome).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
