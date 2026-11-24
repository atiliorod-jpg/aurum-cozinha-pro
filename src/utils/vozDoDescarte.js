// =====================================================================
//  A VOZ DO DESPERDÍCIO (24/11/2026, pedido do dono)
//
//  A mesma busca por voz das etiquetas (utils/voz.js), entendendo o que se
//  fala no descarte, em qualquer ordem:
//   • "bolinho de costela 10 gramas"          → 10 g de Bolinho de costela
//   • "10kg de frango vencido"                → 10 kg de Frango, Vencido
//   • "meio quilo de arroz porque queimou"    → 0,5 kg de Arroz, Queimado
//   • "um quilo e duzentos de carne"          → 1,2 kg
//   • "joguei fora três unidades de pão"      → 3 unid de Pão
//  O motivo vira o botão da casa quando combina ("venceu" → Vencido); o que
//  vem depois de "porque" ou "motivo" e não combina fica escrito como foi dito.
//  ⚠️ A pessoa SEMPRE confere na janela antes de registrar: aqui só se
//  preenche, nada é gravado direto da fala.
// =====================================================================
import { normalizarBusca } from './busca';
import {
  NUMEROS, LIGACOES, VAZIAS, ANTES_DO_NUMERO, SOBRAS, palavras, distancia, melhorNota, aparar, pontuarItem,
} from './voz';

// ⚠️ "10kg" e "200g" CHEGAM GRUDADOS do reconhecimento, e o decimal ("1,5")
// precisa ficar inteiro — o `pedacos` das etiquetas partia a vírgula.
const pedacosDoDescarte = (s) => {
  const texto = String(s ?? '').replace(/(\d)(\p{L})/gu, '$1 $2').replace(/(\p{L})(\d)/gu, '$1 $2');
  return (texto.match(/\d+(?:[.,]\d+)*|[\p{L}\p{N}]+/gu) || [])
    .map(orig => ({ orig, norm: normalizarBusca(orig) }))
    .filter(p => p.norm);
};
const juntar = (lista, campo) => lista.map(p => p[campo]).join(' ');
const ehNumero = (p) => /^\d/.test(p.norm);

/** "1,5" → 1,5 · "1.500" → 1500 (o ponto de milhar) · "10" → 10. */
function numeroEmDigitos(t) {
  if (!/^\d+(?:[.,]\d+)*$/.test(t)) return null;
  const s = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '') : t;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const POR_EXTENSO = {
  ...NUMEROS, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};
const MEIO = new Set(['meio', 'meia']);

/** Um número: "1,5", "10", "duzentos e cinquenta", "dois mil", "meio". */
function lerQuantia(ns, i) {
  const p = ns[i];
  if (p == null) return null;
  const d = numeroEmDigitos(p);
  if (d != null) return ns[i + 1] === 'mil' ? { valor: d * 1000, usados: 2 } : { valor: d, usados: 1 };
  if (MEIO.has(p)) return { valor: 0.5, usados: 1 };
  let total = 0;
  let grupo = 0;
  let j = i;
  while (j < ns.length) {
    const w = ns[j];
    if (w === 'mil') { total += (grupo || 1) * 1000; grupo = 0; }
    else if (POR_EXTENSO[w] != null) grupo += POR_EXTENSO[w];
    else break;
    j += 1;
    if (ns[j] === 'mil' && w !== 'mil') continue;                              // "dois mil"
    if (ns[j] === 'e' && POR_EXTENSO[ns[j + 1]] != null) { j += 1; continue; } // "cento e vinte"
    break;
  }
  return j > i ? { valor: total + grupo, usados: j - i } : null;
}

// A unidade falada logo depois do número. O que se conta (caixa, porção,
// pedaço) é unid.
// ⚠️ LÍQUIDO VIRA PESO (1 L de molho ≈ 1 kg; 500 mL ≈ 500 g): sem isso "500 ml
// de molho" abria como 500 kg. A pessoa vê na janela e troca se precisar.
const UNIDADE_FALADA = {
  kg: 'kg', kgs: 'kg', quilo: 'kg', quilos: 'kg', kilo: 'kg', kilos: 'kg',
  quilograma: 'kg', quilogramas: 'kg', kilograma: 'kg', kilogramas: 'kg',
  g: 'g', gr: 'g', grs: 'g', grama: 'g', gramas: 'g',
  litro: 'kg', litros: 'kg', l: 'kg', ml: 'g', mililitro: 'g', mililitros: 'g',
  unidade: 'unid', unidades: 'unid', un: 'unid', und: 'unid', unid: 'unid', unids: 'unid',
  peca: 'unid', pecas: 'unid', pedaco: 'unid', pedacos: 'unid', porcao: 'unid', porcoes: 'unid',
  fatia: 'unid', fatias: 'unid', caixa: 'unid', caixas: 'unid', pacote: 'unid', pacotes: 'unid',
  lata: 'unid', latas: 'unid', garrafa: 'unid', garrafas: 'unid', pote: 'unid', potes: 'unid',
  bandeja: 'unid', bandejas: 'unid',
};
const DUZIA = /^duzias?$/;

/**
 * Todos os números da fala, com a unidade quando ela vem junto: "2 kg",
 * "meio quilo", "um quilo e meio", "um quilo e duzentos" (1,2 kg), "uma dúzia".
 * Devolve [{ valor, unidade (ou null), de, ate }] — o pedaço a tirar da fala.
 */
function acharQuantias(ns) {
  const achados = [];
  for (let i = 0; i < ns.length; i++) {
    const n = lerQuantia(ns, i);
    if (!n) continue;
    let valor = n.valor;
    let de = i;
    let ate = i + n.usados;
    let unidade = null;
    // "dois E MEIO quilos"
    if (ns[ate] === 'e' && MEIO.has(ns[ate + 1]) && UNIDADE_FALADA[ns[ate + 2]]) { valor += 0.5; ate += 2; }
    if (DUZIA.test(ns[ate] || '')) { valor *= 12; unidade = 'unid'; ate += 1; }
    else if (UNIDADE_FALADA[ns[ate]]) {
      unidade = UNIDADE_FALADA[ns[ate]];
      ate += 1;
      if (ns[ate] === 'e' && MEIO.has(ns[ate + 1])) { valor += 0.5; ate += 2; }  // "um quilo E MEIO"
      else if (unidade === 'kg' && ns[ate] === 'e') {
        // "um quilo E DUZENTOS (gramas)": os gramas somam no quilo
        const g = lerQuantia(ns, ate + 1);
        const depois = g ? ate + 1 + g.usados : ate;
        const unidadeDepois = UNIDADE_FALADA[ns[depois]];
        if (g && g.valor >= 1 && g.valor < 1000 && (!unidadeDepois || unidadeDepois === 'g')) {
          valor += g.valor / 1000;
          ate = depois + (unidadeDepois === 'g' ? 1 : 0);
        }
      }
      if (LIGACOES.has(ns[ate])) ate += 1; // "2 kg DE frango"
    }
    if (ANTES_DO_NUMERO.has(ns[de - 1])) de -= 1;
    else if (ns[de - 1] === 'de' && ANTES_DO_NUMERO.has(ns[de - 2])) de -= 2;
    achados.push({ valor: Math.round(valor * 1000) / 1000, unidade, de, ate });
    i = ate - 1;
  }
  return achados;
}

// o que se fala e não é item, quantidade nem motivo
const NO_COMECO = new Set(['quero', 'foi', 'foram', 'teve', 'tivemos', 'tem', 'vai', 'vou', 'me', 'manda', 'mais', 'agora']);
const JOGAR = new Set(['jogar', 'joga', 'joguei', 'jogamos', 'jogou', 'jogaram']);
const VERBOS = new Set([...JOGAR, 'descartar', 'descarta', 'descarte', 'descartei', 'descartamos', 'descartou',
  'descartaram', 'perdi', 'perdemos', 'perdeu', 'perderam', 'registrar', 'registra', 'registre', 'anotar', 'anota', 'anote']);
const SOBRAS_DO_DESCARTE = new Set(['lixo']);
// depois destas palavras, tudo é o motivo ("porque queimou", "motivo: cheiro ruim")
const MARCAS_DO_MOTIVO = new Set(['porque', 'pois', 'motivo', 'causa', 'razao']);
// ⚠️ O JEITO DE FALAR DE CADA MOTIVO, palavra a palavra: "venceu" é Vencido,
// "derrubou" é Caiu no chão. Vale para o motivo da casa que tiver a palavra
// ("Produto vencido" também). Gênero e plural já passam pela tolerância
// (vencida, queimados). ⚠️ Não é por "começo igual": "estranho" começa como
// "estragado" e "sobremesa" como "sobra".
const SINONIMOS = {
  vencido: ['venceu', 'venceram', 'vencendo', 'validade', 'vencimento'],
  estragado: ['estragou', 'estragaram', 'podre', 'apodreceu', 'azedo', 'azeda', 'azedou', 'mofo', 'mofado', 'mofada', 'mofou'],
  queimado: ['queimou', 'queimaram', 'torrado', 'torrada', 'torrou'],
  sobra: ['sobrou', 'sobraram', 'sobrando', 'sobrado'],
  caiu: ['cairam', 'cair', 'derrubou', 'derrubei', 'derrubaram', 'derrubado', 'derrubada'],
  devolucao: ['devolveu', 'devolveram', 'devolvido', 'devolvida', 'voltou'],
  erro: ['errou', 'erraram', 'errado', 'errada'],
};

/**
 * Onde começa o motivo dito: depois de "porque", "motivo", "pois", "por
 * causa", "por que". Devolve { onde, pulo } (onde = -1: não foi dito assim).
 */
function marcaDoMotivo(todos) {
  for (let i = 0; i < todos.length; i++) {
    if (MARCAS_DO_MOTIVO.has(todos[i].norm)) return { onde: i, pulo: 1 };
    if (todos[i].norm === 'por' && todos[i + 1]?.norm === 'que') return { onde: i, pulo: 2 };
  }
  return { onde: -1, pulo: 0 };
}

/** Limpa a fala: tira "por favor", "joguei fora", "no lixo", "quero"... */
function limpar(pedacos) {
  const ps = pedacos.filter(p => !SOBRAS.has(p.norm) && !SOBRAS_DO_DESCARTE.has(p.norm));
  const r = [];
  for (let i = 0; i < ps.length; i++) {
    if (VERBOS.has(ps[i].norm)) {
      if (JOGAR.has(ps[i].norm) && ps[i + 1]?.norm === 'fora') i += 1; // "joguei FORA" não é "Fora do padrão"
      continue;
    }
    r.push(ps[i]);
  }
  let c = 0;
  while (c < r.length && NO_COMECO.has(r[c].norm)) c += 1;
  return r.slice(c);
}

/**
 * A palavra falada é a do motivo: igual, quase igual (vencida, queimados) ou
 * o jeito de falar dela (venceu). ⚠️ Sem o "começa igual" da busca de itens:
 * ali "que" achava "queimado" em "...que estava frio".
 */
function quaseIgual(falada, palavra) {
  if (falada === palavra) return true;
  const tolerancia = Math.max(falada.length, palavra.length) >= 7 ? 2 : falada.length >= 4 ? 1 : 0;
  return tolerancia > 0 && Math.abs(falada.length - palavra.length) <= tolerancia && distancia(falada, palavra) <= tolerancia;
}
const combinaComMotivo = (falada, doMotivo) =>
  quaseIgual(falada, doMotivo) || (SINONIMOS[doMotivo] || []).some(s => quaseIgual(falada, s));

/**
 * O motivo entre as palavras. Vale o botão da casa quando todas as palavras
 * dele foram faladas ("caiu no chão") ou quando se falou pouco ("caiu",
 * "venceu"). Senão, com `livre` (o que veio depois de "porque", ou o
 * microfone do motivo), fica o que foi dito. Devolve { motivo, usadas }.
 */
function acharMotivo(lista, motivos, { livre = false } = {}) {
  const sig = lista.map((p, i) => ({ p, i })).filter(({ p }) => !VAZIAS.has(p.norm) && !ehNumero(p));
  const nada = { motivo: '', usadas: new Set() };
  if (!sig.length) return nada;
  let melhor = null;
  for (const m of motivos || []) {
    const ms = palavras(m).filter(w => !VAZIAS.has(w));
    if (!ms.length) continue;
    const combina = combinaComMotivo;
    const acertos = ms.filter(x => sig.some(({ p }) => combina(p.norm, x))).length;
    if (!acertos) continue;
    const nota = acertos / ms.length;
    if (!melhor || nota > melhor.nota) {
      melhor = { motivo: m, nota, usadas: new Set(sig.filter(({ p }) => ms.some(x => combina(p.norm, x))).map(({ i }) => i)) };
    }
  }
  if (melhor && (melhor.nota === 1 || sig.length <= 2)) return { motivo: melhor.motivo, usadas: melhor.usadas };
  if (!livre) return nada;
  const texto = juntar(aparar(lista.filter(p => !ehNumero(p))), 'orig').trim();
  return { motivo: texto ? `${texto[0].toUpperCase()}${texto.slice(1)}`.slice(0, 200) : '', usadas: new Set(lista.map((_, i) => i)) };
}

/**
 * O pedaço da fala que mais combina com um item ("frango" em "frango vencido",
 * "bolinho de costela" em "10 bolinho de costela"). Empate: o mais comprido.
 * Só número não é item.
 */
function melhorJanela(lista, produtos) {
  let melhor = null;
  for (let tam = Math.min(lista.length, 8); tam >= 1; tam--) {
    for (let de = 0; de + tam <= lista.length; de++) {
      const pedaco = lista.slice(de, de + tam);
      if (aparar(pedaco).length !== tam || pedaco.every(ehNumero)) continue;
      const nota = melhorNota(pedaco, produtos);
      if (nota > (melhor?.nota || 0)) melhor = { de, ate: de + tam, nota };
    }
  }
  return melhor;
}

/**
 * Entende uma fala do descarte. Devolve { termo, falado, quantidade, unidade,
 * motivo }: `termo` compara (sem acento), `falado` é o que a tela mostra;
 * quantidade e unidade null quando não foram ditas; motivo '' idem.
 */
export function entenderFalaDoDescarte(texto, produtos = [], motivos = []) {
  const vazio = { termo: '', falado: '', quantidade: null, unidade: null, motivo: '' };
  const todos = pedacosDoDescarte(texto);
  // 1) o motivo dito com "porque", "motivo": tudo o que vem depois, COMO FOI
  // DITO (sem tirar "por", "agora"... do meio da frase)
  const { onde, pulo } = marcaDoMotivo(todos);
  let motivoDito = onde >= 0 ? todos.slice(onde + pulo) : null;
  const ps = limpar(onde >= 0 ? todos.slice(0, onde) : todos);
  if (!ps.length && !motivoDito?.length) return vazio;
  const tirar = (lista, q) => [...lista.slice(0, q.de), ...lista.slice(q.ate)];
  const quantiaCom = (lista) => acharQuantias(lista.map(p => p.norm)).filter(q => q.unidade);

  // 2) quanto, com unidade, onde estiver; com dois, o que deixa o item mais
  // claro. ⚠️ O nome inteiro ganha de tudo ("Molho 4 queijos", "Pão queimado").
  const nomeInteiro = ps.length > 0 && melhorNota(ps, produtos) >= 90;
  const comUnidade = nomeInteiro ? [] : quantiaCom(ps);
  let naFala = comUnidade[0] || null;
  if (comUnidade.length > 1) {
    naFala = comUnidade
      .map(q => ({ q, nota: melhorJanela(aparar(tirar(ps, q)), produtos)?.nota || 0 }))
      .sort((a, b) => b.nota - a.nota)[0].q;
  }
  let quantia = naFala;
  // "frango, porque venceu, 2 quilos": a quantidade veio depois do motivo
  if (!quantia && motivoDito) {
    const q = quantiaCom(motivoDito)[0];
    if (q) { quantia = q; motivoDito = tirar(motivoDito, q); }
  }
  const resto = aparar(naFala ? tirar(ps, naFala) : ps);

  // 3) o item: o pedaço que mais combina
  const janela = nomeInteiro ? { de: 0, ate: resto.length, nota: 100 } : melhorJanela(resto, produtos);
  let item = janela ? resto.slice(janela.de, janela.ate) : resto;
  let sobra = janela ? [...resto.slice(0, janela.de), ...resto.slice(janela.ate)] : [];

  // 4) quanto, sem unidade: o número que ficou fora do item ("bolinho 10")
  if (!quantia) {
    const deOnde = janela ? sobra : item;
    const q = acharQuantias(deOnde.map(p => p.norm))[0];
    if (q) {
      quantia = q;
      if (janela) sobra = tirar(sobra, q); else item = tirar(item, q);
    }
  }

  // 5) o motivo: o dito depois de "porque"; senão, o que sobrou em volta do item
  let motivo;
  if (motivoDito) motivo = acharMotivo(motivoDito, motivos, { livre: true }).motivo;
  else if (janela) motivo = acharMotivo(sobra, motivos).motivo;
  else {
    // item que não está na lista: o motivo sai do meio do que foi dito, e
    // número solto não é nome (no item achado, fica: "Molho 4 queijos")
    const m = acharMotivo(item, motivos);
    motivo = m.motivo;
    item = item.filter((p, i) => !m.usadas.has(i) && !ehNumero(p));
  }
  item = aparar(item);
  return {
    termo: juntar(item, 'norm'),
    falado: juntar(item, 'orig'),
    quantidade: quantia && quantia.valor > 0 ? quantia.valor : null,
    unidade: quantia && quantia.valor > 0 ? quantia.unidade : null,
    motivo,
  };
}

/**
 * As até 3 versões que o navegador ouviu: fica a que achar o melhor item.
 * Devolve o de entenderFalaDoDescarte + achados: [{ produto, nota }], melhor primeiro.
 */
export function acharDescartePorVoz(alternativas, produtos = [], motivos = []) {
  let melhor = null;
  for (const texto of alternativas || []) {
    const pedido = entenderFalaDoDescarte(texto, produtos, motivos);
    const achados = !pedido.termo ? [] : (produtos || [])
      .map(produto => ({ produto, nota: pontuarItem(pedido.termo, produto.nome) }))
      .filter(a => a.nota > 0)
      .sort((a, b) => b.nota - a.nota || (a.produto.nome || '').localeCompare(b.produto.nome || '', 'pt-BR'));
    const r = { ...pedido, achados };
    if (!melhor || (achados[0]?.nota || 0) > (melhor.achados[0]?.nota || 0)) melhor = r;
  }
  return melhor || { termo: '', falado: '', quantidade: null, unidade: null, motivo: '', achados: [] };
}

/**
 * O microfone do MOTIVO: o botão da casa quando combina ("venceu" →
 * Vencido); senão, o que foi dito ("Cheiro estranho"). Entre as versões que o
 * navegador ouviu, ganha a que combina com um botão.
 */
export function motivoDaFala(alternativas, motivos = []) {
  const lista = (Array.isArray(alternativas) ? alternativas : [alternativas]).filter(Boolean);
  const lidos = lista.map(t => {
    // como foi dito, só sem o "porque" do começo
    const todos = pedacosDoDescarte(t);
    const { onde, pulo } = marcaDoMotivo(todos);
    return acharMotivo(onde === 0 ? todos.slice(pulo) : todos, motivos, { livre: true }).motivo;
  });
  return lidos.find(m => (motivos || []).includes(m)) || lidos[0] || '';
}
