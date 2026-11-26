// =====================================================================
//  AS ETIQUETAS DE PRAZO, COLORIDAS (redesign, 25/11/2026, pedido do dono)
//
//  Na lista de itens, "Congelado 30d · Refrigerado 2d" em cinza virou uma
//  etiqueta colorida por método: "Congelado 30 dias" azul, "Refrigerado 2 dias"
//  verde. ⚠️ CADA ARMAZENAMENTO TEM A SUA COR — inclusive os que a casa criar
//  (o dono lembrou: há outros métodos além dos de fábrica): os quatro de
//  sempre têm cor fixa; os da casa seguem uma paleta própria, na ordem da lista
//  dela. O estado (pista quente, pista fria...) vai escrito e ganha moldura,
//  para não se confundir com o armazenamento puro.
//  ⚠️ A JANELA DE IMPRIMIR NÃO MUDA: lá o método continua na caixa em destaque
//  (decisão do dono — evita confundir congelado com resfriado).
//  ⚠️ As classes vão escritas por inteiro: o Tailwind só gera o que lê no código.
// =====================================================================
import { metodosDoProduto, temPrazo, rotuloDoMetodo, textoDoPrazo } from './metodos';

// texto escuro sobre fundo claro da mesma cor: contraste acima de 7:1
const FIXAS = {
  congelado: 'bg-blue-100 text-blue-900',
  refrigerado: 'bg-green-100 text-green-900',
  resfriado: 'bg-cyan-100 text-cyan-900',
  ambiente: 'bg-amber-100 text-amber-900',
};
const DA_CASA = [
  'bg-violet-100 text-violet-900', 'bg-pink-100 text-pink-900', 'bg-orange-100 text-orange-900',
  'bg-lime-100 text-lime-900', 'bg-indigo-100 text-indigo-900', 'bg-rose-100 text-rose-900',
  'bg-teal-100 text-teal-900', 'bg-slate-200 text-slate-900',
];
const NEUTRA = 'bg-polo-beige text-polo-navy ring-1 ring-inset ring-polo-linha';
const COM_ESTADO = ' ring-1 ring-inset ring-current';

/** A cor de um armazenamento: a fixa, ou a da paleta pela posição entre os da casa. */
export function corDoArmazenamento(id, armazenamentos = []) {
  if (FIXAS[id]) return FIXAS[id];
  const daCasa = (armazenamentos || []).map(a => a?.id).filter(a => a && !FIXAS[a]);
  const i = daCasa.indexOf(id);
  return DA_CASA[(i < 0 ? daCasa.length : i) % DA_CASA.length];
}

/**
 * As etiquetas de prazo de um item: [{ chave, texto, cor }], uma por método
 * com prazo num armazenamento que a casa usa. Prazo igual em todos → UMA,
 * neutra ("3 dias em qualquer estado": quatro vezes o mesmo número só cansa o
 * olho). Sem nenhum prazo → [].
 */
export function etiquetasDePrazo(produto, armazenamentos = [], estados = []) {
  const usaveis = metodosDoProduto(produto)
    .filter(m => temPrazo(m) && (armazenamentos || []).some(a => a.id === m.armazenamento));
  if (!usaveis.length) return [];
  const lista = usaveis.map(m => ({
    chave: m.id || `${m.armazenamento}|${m.estado || ''}`,
    texto: `${rotuloDoMetodo(m, armazenamentos, estados)} ${textoDoPrazo(m)}`,
    prazo: textoDoPrazo(m),
    cor: corDoArmazenamento(m.armazenamento, armazenamentos) + (m.estado ? COM_ESTADO : ''),
  }));
  if (lista.length > 1 && lista.every(x => x.prazo === lista[0].prazo)) {
    return [{ chave: 'todos', texto: `${lista[0].prazo} em qualquer estado`, cor: NEUTRA }];
  }
  return lista.map(({ prazo: _prazo, ...resto }) => resto);
}
