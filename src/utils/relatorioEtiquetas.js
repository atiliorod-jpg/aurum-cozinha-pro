// =====================================================================
//  Relatório de etiquetas — as contas do período (dia, semana, mês)
//
//  Os dados vêm do banco (M43, `relatorio_etiquetas`) já somados por dia,
//  item, responsável e reimpressão. Aqui eles viram o que a tela mostra.
//
//  ⚠️ FUNÇÕES PURAS, e mora em `utils/` por isso: este projeto não tem jsdom,
//  então o que precisa de teste sai do componente.
//
//  ⚠️ DATAS SEMPRE COMO TEXTO 'AAAA-MM-DD' E CONTAS EM UTC. `new Date('2026-
//  09-01')` é meia-noite UTC, que em Recife ainda é 31/08 — misturar hora
//  local com data ISO é o jeito clássico de um relatório perder o dia 1º.
// =====================================================================

const DIA_MS = 86400000;

// Um ano e um dia: cobre "o ano passado inteiro" sem deixar alguém pedir dez
// anos de uma vez (o banco recusa acima de 800 dias contando a comparação).
export const MAX_DIAS_RELATORIO = 366;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const paraData = (iso) => {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const paraISO = (dt) => dt.toISOString().slice(0, 10);

export const somarDias = (iso, n) => paraISO(new Date(paraData(iso).getTime() + n * DIA_MS));
/** Quantos dias o período tem, contando as duas pontas. */
export const diasNoPeriodo = (de, ate) => Math.round((paraData(ate) - paraData(de)) / DIA_MS) + 1;

const primeiroDoMes = (iso) => `${iso.slice(0, 7)}-01`;
const ultimoDoMes = (iso) => {
  const d = paraData(iso);
  return paraISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};
const inicioDoMesAnterior = (iso) => {
  const d = paraData(iso);
  return paraISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
};

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const diaDaSemana = (iso) => DIAS_DA_SEMANA[paraData(iso).getUTCDay()];

export const PERIODOS = [
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mesPassado', rotulo: 'Mês passado' },
  { id: '30dias', rotulo: 'Últimos 30 dias' },
  { id: 'datas', rotulo: 'Escolher datas' },
];

/**
 * O período que a tela pediu, já corrigido.
 *
 * ⚠️ "ESTE MÊS" VAI SÓ ATÉ HOJE, não até o dia 30. Dia que ainda não chegou
 * tem zero etiqueta por definição, e entraria na média por dia puxando-a para
 * baixo — "média de 12 por dia" num mês em que a casa faz 40.
 *
 * ⚠️ DATAS ESCOLHIDAS À MÃO são consertadas em vez de recusadas: invertidas
 * trocam de lugar, futuro vira hoje, e período maior que um ano é cortado.
 * Quem erra a data num campo de calendário quer ver o relatório, não um erro.
 */
export function periodoDoRelatorio(tipo, hojeISO, de, ate) {
  if (tipo === 'mesPassado') {
    const ini = inicioDoMesAnterior(hojeISO);
    return { de: ini, ate: ultimoDoMes(ini) };
  }
  if (tipo === '30dias') return { de: somarDias(hojeISO, -29), ate: hojeISO };
  if (tipo === 'datas') {
    let a = ISO.test(de || '') ? de : hojeISO;
    let b = ISO.test(ate || '') ? ate : hojeISO;
    if (a > hojeISO) a = hojeISO;
    if (b > hojeISO) b = hojeISO;
    if (a > b) [a, b] = [b, a];
    if (diasNoPeriodo(a, b) > MAX_DIAS_RELATORIO) a = somarDias(b, -(MAX_DIAS_RELATORIO - 1));
    return { de: a, ate: b };
  }
  return { de: primeiroDoMes(hojeISO), ate: hojeISO };
}

/**
 * Com o que comparar.
 *
 * ⚠️ MÊS SE COMPARA COM MÊS, não com "os N dias de antes". Setembro inteiro
 * (30 dias) contra "os 30 dias antes de 1º/09" pegaria de 2 a 31 de agosto e
 * deixaria o dia 1º de fora — e a pessoa lê "comparado com agosto".
 *   • mês inteiro           → o mês anterior inteiro
 *   • 1º até hoje, no mês   → o mesmo trecho do mês anterior (1º a 10/09
 *                             contra 1º a 10/08: comparar 10 dias com 31
 *                             daria sempre "caiu 70%")
 *   • qualquer outro        → o mesmo número de dias, logo antes
 */
export function periodoAnterior({ de, ate }) {
  const n = diasNoPeriodo(de, ate);
  const noMesmoMes = de.slice(0, 7) === ate.slice(0, 7);
  if (noMesmoMes && de === primeiroDoMes(de)) {
    const ini = inicioDoMesAnterior(de);
    const fimDoMes = ultimoDoMes(ini);
    if (ate === ultimoDoMes(de)) return { de: ini, ate: fimDoMes };
    const fim = somarDias(ini, n - 1);
    return { de: ini, ate: fim < fimDoMes ? fim : fimDoMes };
  }
  return { de: somarDias(de, -n), ate: somarDias(de, -1) };
}

const numero = (v) => Math.max(0, Math.round(Number(v) || 0));

/**
 * O relatório de um período, a partir das linhas do banco.
 *
 * ⚠️ CONTA ETIQUETAS DE PAPEL, com as cópias — a mesma régua da aba
 * Impressas. Uma impressão de 5 cópias é 5 etiquetas, não 1.
 *
 * ⚠️ TODOS OS DIAS DO PERÍODO APARECEM, inclusive os de zero. Dia sem
 * etiqueta é informação ("domingo não se produz"), e um gráfico que pula o
 * dia vazio faz a semana parecer mais cheia do que foi.
 *
 * ⚠️ SEMANA DE SEGUNDA A DOMINGO, cortada nas pontas do período. O mês não
 * começa na segunda: a primeira e a última semana saem incompletas, e a tela
 * mostra as datas de cada uma para ninguém comparar 3 dias com 7.
 *
 * ⚠️ O ITEM É AGRUPADO SEM DIFERENÇA DE MAIÚSCULA E ESPAÇO. A etiqueta sai
 * toda em maiúscula; "Arroz" e "ARROZ " são o mesmo pote no papel e não podem
 * virar duas linhas no ranking.
 */
export function resumirRelatorio(linhas, { de, ate }) {
  const dentro = (linhas || []).filter(l => l && l.dia >= de && l.dia <= ate);
  const porDia = new Map();
  const porItem = new Map();
  const porResp = new Map();
  let total = 0;
  let reimpressas = 0;
  let impressoes = 0;

  const somar = (mapa, chave, nome, n) => {
    const atual = mapa.get(chave);
    if (atual) atual.etiquetas += n;
    else mapa.set(chave, { nome, etiquetas: n });
  };

  for (const l of dentro) {
    const n = numero(l.etiquetas);
    total += n;
    impressoes += numero(l.impressoes);
    if (l.reimpressao) reimpressas += n;
    porDia.set(l.dia, (porDia.get(l.dia) || 0) + n);
    const item = String(l.item || '').replace(/\s+/g, ' ').trim();
    somar(porItem, item.toUpperCase() || '—', item || 'Sem nome', n);
    const resp = String(l.responsavel || '').replace(/\s+/g, ' ').trim();
    somar(porResp, resp.toUpperCase() || '—', resp || 'Sem responsável', n);
  }

  const dias = [];
  for (let d = de, i = 0; d <= ate && i < 1000; d = somarDias(d, 1), i++) {
    dias.push({ dia: d, etiquetas: porDia.get(d) || 0 });
  }

  const semanas = [];
  for (const d of dias) {
    if (!semanas.length || paraData(d.dia).getUTCDay() === 1) {
      semanas.push({ de: d.dia, ate: d.dia, etiquetas: 0 });
    }
    const s = semanas[semanas.length - 1];
    s.ate = d.dia;
    s.etiquetas += d.etiquetas;
  }

  const ordenar = (mapa) => [...mapa.values()]
    .sort((a, b) => b.etiquetas - a.etiquetas || a.nome.localeCompare(b.nome, 'pt-BR'));

  // No empate, o PRIMEIRO dia com o máximo — estável, e é o que se lê primeiro.
  const pico = dias.reduce((m, d) => (d.etiquetas > (m ? m.etiquetas : 0) ? d : m), null);

  return {
    total,
    reimpressas,
    impressoes,
    dias,
    semanas,
    porItem: ordenar(porItem),
    porResponsavel: ordenar(porResp),
    mediaPorDia: dias.length ? total / dias.length : 0,
    pico,
  };
}

/**
 * Quanto subiu ou caiu, em %.
 *
 * ⚠️ `null` QUANDO O PERÍODO ANTERIOR FOI ZERO e o atual não: não existe
 * porcentagem sobre zero, e "subiu ∞%" ou "subiu 100%" seriam números
 * inventados. A tela diz "sem base para comparar".
 */
export function variacao(atual, anterior) {
  const a = numero(atual);
  const b = numero(anterior);
  if (!b) return a ? null : 0;
  return Math.round(((a - b) / b) * 100);
}

/**
 * Id de cada impressão, gerado NO APARELHO.
 *
 * ⚠️ É ele que impede a fila offline de contar duas vezes: o banco ignora um
 * id que já recebeu (M43). Por isso não pode ser sequencial nem depender do
 * relógio — dois tablets imprimindo no mesmo segundo não podem colidir.
 */
export function idDeImpressao() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* contexto sem crypto — segue para o plano B */ }
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const variante = '89ab'[Math.floor(Math.random() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variante}${hex(3)}-${hex(12)}`;
}

const br = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };

/** As abas da planilha que o dono baixa: [nome da aba, linhas]. */
export function planilhaDoRelatorio(resumo, { de, ate }) {
  const media = Math.round((resumo.mediaPorDia || 0) * 10) / 10;
  return [
    ['Resumo', [
      ['Período', `${br(de)} a ${br(ate)}`],
      ['Etiquetas impressas', resumo.total],
      ['Das quais reimpressões', resumo.reimpressas],
      ['Média por dia', media],
      ['Dia de maior volume', resumo.pico ? `${br(resumo.pico.dia)} (${resumo.pico.etiquetas})` : '—'],
    ]],
    ['Por dia', [['Dia', 'Semana', 'Etiquetas'],
      ...resumo.dias.map(d => [br(d.dia), diaDaSemana(d.dia), d.etiquetas])]],
    ['Por semana', [['De', 'Até', 'Etiquetas'],
      ...resumo.semanas.map(s => [br(s.de), br(s.ate), s.etiquetas])]],
    ['Por item', [['Item', 'Etiquetas'], ...resumo.porItem.map(i => [i.nome, i.etiquetas])]],
    ['Por responsável', [['Responsável', 'Etiquetas'], ...resumo.porResponsavel.map(r => [r.nome, r.etiquetas])]],
  ];
}
