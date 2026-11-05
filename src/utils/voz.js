// =====================================================================
//  BUSCA POR VOZ (pedido do dono, 04/11/2026)
//
//  A pessoa toca no microfone e fala o item — com a mão suja ou de luva, sem
//  digitar. Quem transforma a fala em texto é o NAVEGADOR (Chrome no Android,
//  Safari no iPhone), de graça. Aqui o app só entende o texto:
//   • a quantidade, se veio junto: "três etiquetas de frango desfiado";
//   • o método, se veio junto: "frango desfiado congelado" (05/11/2026);
//   • o item, tolerando o pouco que o reconhecimento erra ("frango desfiada").
//
//  ⚠️ O reconhecimento passa pelo serviço de voz do Google ou da Apple e
//  PRECISA DE INTERNET. O modo dentro do aparelho ainda é experimental nos
//  navegadores (nov/2026) — não dá para contar com ele.
// =====================================================================

import { normalizarBusca, casaBusca } from './busca';
import { temPrazo } from './metodos';

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
// o que sobra entre o item e o método: "frango NA geladeira", "EM temperatura ambiente"
const LIGACOES_DO_METODO = new Set(['em', 'no', 'na', 'de', 'do', 'da', 'a', 'o']);
// "3 etiquetas", "três unidades", "2 cópias": a palavra que gruda no número
const DEPOIS_DO_NUMERO = /^(etiquetas?|unidades?|copias?|vez|vezes)$/;
// "quantidade três", "quantidade de três"
const ANTES_DO_NUMERO = new Set(['quantidade', 'qtd', 'qtde']);
// o que se fala e não é item, quantidade nem método ("…, por favor")
const SOBRAS = new Set(['por', 'favor', 'obrigado', 'obrigada', 'entao', 'ai', 'agora', 'tambem', 'ok']);
// o que fica solto nas pontas depois de tirar a quantidade e o método
const PONTAS = new Set([...LIGACOES, 'e', 'com', 'em', 'no', 'na', 'a', 'o', ...ANTES_DO_NUMERO]);

// ⚠️ REFRIGERADO E RESFRIADO SÃO MÉTODOS DIFERENTES no app (0 a 6 °C e 6 a
// 10 °C) — a voz não junta os dois. Além destas palavras, vale o nome que a
// casa deu a cada armazenamento e a cada estado (pista quente...).
const PALAVRAS_DO_ARMAZENAMENTO = {
  congelado: ['congelado', 'congelada', 'congelados', 'congeladas', 'freezer', 'frizer'],
  refrigerado: ['refrigerado', 'refrigerada', 'refrigerados', 'refrigeradas', 'geladeira'],
  resfriado: ['resfriado', 'resfriada', 'resfriados', 'resfriadas'],
  ambiente: ['ambiente', 'temperatura ambiente'],
};

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
 * O que a casa pode falar de método: cada armazenamento ativo (pelo nome que
 * ela deu e pelas palavras de sempre) e cada estado (pista quente...).
 * Devolve [{ tipo: 'armazenamento' | 'estado', id, nome, frases }].
 */
export function vocabularioDeMetodos(armazenamentos = [], estados = []) {
  const frase = (s) => palavras(s).join(' ');
  return [
    ...armazenamentos.filter(a => a?.id).map(a => ({
      tipo: 'armazenamento', id: a.id, nome: a.nome || a.id,
      frases: [...new Set([frase(a.nome), ...(PALAVRAS_DO_ARMAZENAMENTO[a.id] || [])])].filter(Boolean),
    })),
    ...estados.filter(e => e?.id).map(e => ({
      tipo: 'estado', id: e.id, nome: e.nome || e.id, frases: [frase(e.nome)].filter(Boolean),
    })),
  ];
}

/** A melhor nota de um pedaço da fala entre os itens. */
const melhorNota = (lista, produtos) => {
  const t = lista.map(p => p.norm).join(' ');
  let melhor = 0;
  for (const p of produtos || []) melhor = Math.max(melhor, pontuarItem(t, p.nome));
  return melhor;
};

/** Tira das pontas o que sobrou solto: "etiqueta de", "com", "na". */
function aparar(lista) {
  const solta = (p) => p && (ETIQUETA.test(p.norm) || PONTAS.has(p.norm));
  let r = lista;
  while (r.length && solta(r[0])) r = r.slice(1);
  while (r.length && solta(r[r.length - 1])) r = r.slice(0, -1);
  return r;
}

/**
 * A quantidade, em qualquer lugar da frase. O número grudado em "etiquetas"
 * (ou logo depois de "quantidade") vale onde estiver; um número sozinho, só no
 * começo ou no fim — no meio ele costuma ser do nome do item.
 * Devolve { valor, de, ate } (o pedaço a tirar da frase) ou null.
 */
function acharQuantidade(ps) {
  const ns = ps.map(p => p.norm);
  const achados = [];
  for (let i = 0; i < ns.length; i++) {
    const n = lerNumero(ns, i);
    if (!n) continue;
    let de = i;
    let ate = i + n.usados;
    let colado = false;
    if (DEPOIS_DO_NUMERO.test(ns[ate] || '')) {
      ate += 1;
      colado = true;
      if (LIGACOES.has(ns[ate])) ate += 1; // "3 etiquetas DE frango"
    }
    if (ANTES_DO_NUMERO.has(ns[de - 1])) { de -= 1; colado = true; }
    else if (ns[de - 1] === 'de' && ANTES_DO_NUMERO.has(ns[de - 2])) { de -= 2; colado = true; }
    if (colado || de === 0 || ate === ns.length) achados.push({ valor: n.valor, de, ate, colado });
    i = ate - 1;
  }
  return achados.find(a => a.colado) || achados[0] || null;
}

/**
 * Tira as palavras de método de QUALQUER lugar da frase: "frango desfiado
 * congelado", "congelado, frango desfiado", "frango na geladeira". Até um
 * armazenamento e um estado: "molho refrigerado pista quente".
 * ⚠️ O nome do item ganha: "polpa congelada" fica inteira quando existe um
 * item que começa assim ("Polpa congelada de maracujá").
 */
function tirarMetodo(lista, vocabulario, produtos) {
  const sem = { resto: lista, armazenamento: null, estado: null, metodoFalado: '' };
  if (!vocabulario.length || lista.length < 2) return sem;
  if (melhorNota(lista, produtos) >= 90) return sem;
  let resto = lista;
  const achado = { armazenamento: null, estado: null };
  const ditas = [];
  const tirarUma = () => {
    // frases de até 3 palavras ("temperatura ambiente" antes de "ambiente"),
    // e sempre sobra pelo menos uma palavra para o item
    for (const tam of [3, 2, 1]) {
      if (resto.length - tam < 1) continue;
      for (let i = 0; i + tam <= resto.length; i++) {
        const pedaco = resto.slice(i, i + tam);
        const v = vocabulario.find(x => !achado[x.tipo] && x.frases.includes(pedaco.map(p => p.norm).join(' ')));
        if (!v) continue;
        achado[v.tipo] = v.id;
        ditas.push({ onde: lista.indexOf(pedaco[0]), texto: pedaco.map(p => p.orig).join(' ') });
        // "frango NA geladeira": a ligação logo antes também sai
        let de = i;
        if (de > 0 && LIGACOES_DO_METODO.has(resto[de - 1].norm) && resto.length - tam - 1 >= 1) de -= 1;
        resto = [...resto.slice(0, de), ...resto.slice(i + tam)];
        return true;
      }
    }
    return false;
  };
  while (tirarUma()) { /* até um armazenamento e um estado */ }
  if (!achado.armazenamento && !achado.estado) return sem;
  return {
    resto,
    ...achado,
    // na ordem em que foi falado: "refrigerado pista quente"
    metodoFalado: ditas.sort((x, y) => x.onde - y.onde).map(d => d.texto).join(' '),
  };
}

/**
 * Separa a quantidade e o método do item: "três etiquetas de frango desfiado
 * congelado" → { quantidade: 3, termo: 'frango desfiado', falado: 'frango
 * desfiado', armazenamento: 'congelado', estado: null, metodoFalado:
 * 'congelado' }. Sem número, quantidade null; sem método, armazenamento e
 * estado null. `termo` é o que compara (sem acento); `falado`, o que a tela
 * mostra ("filé", não "file"). `vocabulario` vem de vocabularioDeMetodos.
 * ⚠️ EM QUALQUER ORDEM (05/11/2026, testado no celular pelo dono): só o
 * começo e o fim valiam, e "frango desfiado, três etiquetas, congelado" ou
 * "congelado, três etiquetas de frango" se perdiam. Agora a quantidade e o
 * método saem de onde estiverem, e o que sobra é o item.
 * ⚠️ O nome inteiro ganha de tudo: "molho quatro queijos" é o item, quando
 * existe — não "4 de queijos".
 */
export function entenderFala(texto, produtos = [], vocabulario = []) {
  let ps = pedacos(texto).filter(p => !SOBRAS.has(p.norm));
  while (ps.length && VERBOS.has(ps[0].norm)) ps = ps.slice(1);
  const montar = (lista, quantidade, m = {}) => ({
    termo: lista.map(p => p.norm).join(' '),
    falado: lista.map(p => p.orig).join(' '),
    quantidade,
    armazenamento: m.armazenamento || null,
    estado: m.estado || null,
    metodoFalado: m.metodoFalado || '',
  });
  if (melhorNota(ps, produtos) >= 90) return montar(ps, null);
  const q = acharQuantidade(ps);
  const semQuantidade = q ? [...ps.slice(0, q.de), ...ps.slice(q.ate)] : ps;
  const m = tirarMetodo(aparar(semQuantidade), vocabulario, produtos);
  return montar(aparar(m.resto), q ? q.valor : null, m);
}

/**
 * A frase inteira, quando a pessoa fez pausa: as partes que o navegador já
 * fechou, cada uma pela melhor versão, e a última em todas as versões que ele
 * mandou. `resultados` é a lista do evento do navegador (SpeechRecognition).
 */
export function juntarAlternativas(resultados) {
  const partes = Array.from(resultados || []).filter(r => r && r.length);
  if (!partes.length) return [];
  const comeco = partes.slice(0, -1).map(r => r[0]?.transcript || '').join(' ');
  return Array.from(partes[partes.length - 1], a => `${comeco} ${a?.transcript || ''}`.trim()).filter(Boolean);
}

/**
 * O navegador manda até 3 versões do que ouviu ("frango desfiado", "frango
 * desfiada"...). Fica a que achar o melhor item.
 * Devolve o pedido de entenderFala + achados: [{ produto, nota }], melhor primeiro.
 */
export function acharPorVoz(alternativas, produtos, vocabulario = []) {
  let melhor = null;
  for (const texto of alternativas || []) {
    const pedido = entenderFala(texto, produtos, vocabulario);
    if (!pedido.termo) continue;
    const achados = (produtos || [])
      .map(produto => ({ produto, nota: pontuarItem(pedido.termo, produto.nome) }))
      .filter(a => a.nota > 0)
      .sort((a, b) => b.nota - a.nota || (a.produto.nome || '').localeCompare(b.produto.nome || '', 'pt-BR'));
    const r = { ...pedido, achados };
    if (!melhor || (achados[0]?.nota || 0) > (melhor.achados[0]?.nota || 0)) melhor = r;
  }
  return melhor || {
    termo: '', falado: '', quantidade: null, armazenamento: null, estado: null, metodoFalado: '', achados: [],
  };
}

/**
 * O método falado, entre os do item. `metodos` são os do item; `inicial`,
 * onde a janela abriria sem voz ({ armazenamento, metodoId }); `ativos`, os
 * armazenamentos que a casa usa. Devolve { metodoId, armazenamento }, ou null
 * quando o item não tem esse método (a tela mostra os que ele tem).
 * • falou só o armazenamento e há vários dele: vale o sem estado ("o"
 *   refrigerado), senão o de sempre; sem como decidir, a pessoa escolhe;
 * • ⚠️ sem método com prazo, vale onde a janela abriria se for o mesmo
 *   armazenamento: o Seco abre em ambiente com a sugestão de 3 dias, e
 *   "temperatura ambiente" não pode cair no congelado de 540 dias da
 *   embalagem fechada.
 */
export function escolherMetodoFalado({ armazenamento, estado } = {}, { metodos = [], inicial = null, ativos = null } = {}) {
  if (!armazenamento && !estado) return null;
  const candidatos = metodos.filter(m => (!ativos || ativos.includes(m.armazenamento)) && temPrazo(m)
    && (!armazenamento || m.armazenamento === armazenamento) && (!estado || m.estado === estado));
  const escolha = (m) => ({ metodoId: m.id, armazenamento: m.armazenamento });
  if (candidatos.length === 1) return escolha(candidatos[0]);
  if (candidatos.length > 1) {
    const semEstado = !estado && candidatos.find(m => !m.estado);
    if (semEstado) return escolha(semEstado);
    const deSempre = candidatos.find(m => m.id === inicial?.metodoId);
    return deSempre ? escolha(deSempre) : null;
  }
  if (!estado && inicial && inicial.armazenamento === armazenamento) {
    return { metodoId: inicial.metodoId || null, armazenamento };
  }
  return null;
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
