// =====================================================================
//  REGISTRO DE DESPERDÍCIO — regras puras (24/11/2026, pedido do dono)
//
//  O checklist de desperdício do Magurō (maguro-estoque/src/desperdicio),
//  dentro do Aurum Etiquetas, usando a MESMA base: os itens de Meus itens, a
//  equipe com a senha de 2 números e a Administração com a senha.
//  ⚠️ NÃO MEXE EM ESTOQUE: é o registro do que foi jogado fora — o mesmo
//  desenho do Magurō. Sem tela, sem banco: testado em
//  __tests__/desperdicio.test.js.
// =====================================================================
import { normalizarBusca } from './busca';
import { fmtNum, fmtData } from './formatters';
import { gruposDoProduto } from './grupos';
import { normalizarUnidade } from './itens';

export const UNIDADES_DESCARTE = ['kg', 'unid'];

// os motivos que o Magurō usa; a casa muda na Administração → Desperdício
export const MOTIVOS_PADRAO = ['Vencido', 'Estragado', 'Queimado', 'Sobra de produção', 'Caiu no chão',
  'Fora do padrão', 'Devolução do cliente', 'Erro no pedido'];
export const MAX_MOTIVO = 40;

// ⚠️ MANHÃ E NOITE (decisão do dono, 24/11/2026, como no Magurō). O horário
// de cada um se ajusta na Administração → Desperdício.
export const TURNOS_PADRAO = [{ nome: 'Manhã', inicio: '05:00' }, { nome: 'Noite', inicio: '16:00' }];

const arred = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
// o texto que compara nomes: sem acento, minúsculo, espaços juntos
// ⚠️ no Magurō isto era `/s+/` (sem a barra): trocava a LETRA "s" por espaço
const chaveDoNome = (s) => normalizarBusca(String(s ?? '').trim()).replace(/\s+/g, ' ');
const horaValida = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || ''));

/** Os motivos da casa (botões rápidos): os da Administração, ou os de sempre. */
export function motivosDaCasa(prefs) {
  const lista = Array.isArray(prefs?.motivosDescarte) ? prefs.motivosDescarte : null;
  if (!lista) return MOTIVOS_PADRAO;
  const vistos = new Set();
  return lista.map(m => String(m ?? '').trim().slice(0, MAX_MOTIVO))
    .filter(m => m && !vistos.has(chaveDoNome(m)) && vistos.add(chaveDoNome(m)));
}

/** Os turnos da casa, em ordem de início; inválido volta para o de sempre. */
export function turnosDaCasa(prefs) {
  const lista = Array.isArray(prefs?.turnosDescarte) ? prefs.turnosDescarte : null;
  const validos = (lista || [])
    .map(t => ({ nome: String(t?.nome ?? '').trim().slice(0, 20), inicio: String(t?.inicio ?? '') }))
    .filter(t => t.nome && horaValida(t.inicio));
  return (validos.length ? validos : TURNOS_PADRAO).slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/**
 * O turno de uma hora. ⚠️ ANTES DO PRIMEIRO TURNO DO DIA AINDA É O ÚLTIMO:
 * o descarte das 2 da manhã é do fechamento da noite, não da manhã.
 */
export function turnoDe(data, turnos = TURNOS_PADRAO) {
  const d = data instanceof Date ? data : new Date(data);
  const h = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const ordem = (turnos && turnos.length ? turnos : TURNOS_PADRAO).slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
  let r = ordem[ordem.length - 1].nome;
  for (const t of ordem) if (h >= t.inicio) r = t.nome;
  return r;
}

/** A unidade de costume do item no descarte: unid, ou kg para todo o resto. */
export const unidadeDoItem = (p) => (normalizarUnidade(p?.unidade) === 'unid' ? 'unid' : 'kg');

/** "1,5 kg", "3 unid". */
export const fmtQtd = (n, unidade) => `${fmtNum(n, 3)} ${unidade === 'unid' ? 'unid' : 'kg'}`;

/** Confere o registro antes de mandar (o banco confere de novo). */
export function conferirDescarte({ itemNome, quantidade, unidade, motivo }) {
  if (!String(itemNome || '').trim()) throw new Error('Falta o item.');
  if (!(arred(quantidade) > 0)) throw new Error('A quantidade precisa ser maior que zero.');
  if (arred(quantidade) > 100000) throw new Error('Quantidade grande demais.');
  if (!UNIDADES_DESCARTE.includes(unidade)) throw new Error('Unidade inválida.');
  if (!String(motivo || '').trim()) throw new Error('Falta o motivo do descarte.');
  return true;
}

/**
 * SOMA OS ITENS IGUAIS: "Salmão", "salmao " e "SALMÃO" são o mesmo item —
 * cadastrado ou digitado em "Item fora da lista". Item cadastrado que mudou
 * de nome usa o nome de HOJE (`itensAtuais`), então registros antigos e novos
 * somam juntos. kg e unid nunca se somam.
 * Devolve [{ item, unidade, total, vezes, foraDaLista, motivos: [{ motivo, total }] }], maior primeiro.
 */
export function somarPorItem(registros, itensAtuais = []) {
  const nomeAtual = new Map((itensAtuais || []).map(i => [i.id, i.nome]));
  const cadastrados = new Set((itensAtuais || []).map(i => chaveDoNome(i.nome)));
  const grupos = new Map();
  for (const r of registros || []) {
    const nome = String((r.item_id && nomeAtual.get(r.item_id)) || r.item_nome || '').trim();
    const chave = `${chaveDoNome(nome)}|${r.unidade}`;
    let g = grupos.get(chave);
    if (!g) { g = { item: nome, cadastrado: false, unidade: r.unidade, total: 0, vezes: 0, porMotivo: new Map() }; grupos.set(chave, g); }
    // o nome do cadastro ganha do que foi digitado à mão ("Salmão", não "salmao")
    if (!g.cadastrado && r.item_id && nomeAtual.has(r.item_id)) { g.item = nome; g.cadastrado = true; }
    g.total = arred(g.total + Number(r.quantidade));
    g.vezes += 1;
    const m = String(r.motivo || '').trim();
    g.porMotivo.set(m, arred((g.porMotivo.get(m) || 0) + Number(r.quantidade)));
  }
  return [...grupos.values()]
    .map(g => ({
      item: g.item, unidade: g.unidade, total: g.total, vezes: g.vezes,
      foraDaLista: !cadastrados.has(chaveDoNome(g.item)),
      motivos: [...g.porMotivo.entries()].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => (a.unidade === b.unidade ? 0 : a.unidade === 'kg' ? -1 : 1) || b.total - a.total || a.item.localeCompare(b.item, 'pt-BR'));
}

/** Soma por motivo (só kg, que é o que dá para comparar). */
export function somarPorMotivo(registros) {
  const m = new Map();
  for (const r of registros || []) {
    if (r.unidade !== 'kg') continue;
    const k = String(r.motivo || '').trim();
    m.set(k, arred((m.get(k) || 0) + Number(r.quantidade)));
  }
  return [...m.entries()].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total);
}

/** Totais do período: kg, unidades e quantos registros. */
export function totais(registros) {
  const l = registros || [];
  return {
    kg: arred(l.filter(r => r.unidade === 'kg').reduce((s, r) => s + Number(r.quantidade), 0)),
    unid: arred(l.filter(r => r.unidade !== 'kg').reduce((s, r) => s + Number(r.quantidade), 0)),
    registros: l.length,
  };
}

/**
 * Soma por GRUPO. O grupo é o PRINCIPAL do item cadastrado (o de hoje); item
 * digitado fora da lista acha o grupo pelo nome, se houver um item igual;
 * senão fica em "Sem grupo". kg e unid separados.
 */
export function somarPorGrupo(registros, itensAtuais = []) {
  const porId = new Map((itensAtuais || []).map(i => [i.id, i]));
  const porNome = new Map((itensAtuais || []).map(i => [chaveDoNome(i.nome), i]));
  const grupos = new Map();
  for (const r of registros || []) {
    const item = (r.item_id && porId.get(r.item_id)) || porNome.get(chaveDoNome(r.item_nome));
    const grupo = String(gruposDoProduto(item)[0] || '').trim() || 'Sem grupo';
    const chave = `${chaveDoNome(grupo)}|${r.unidade}`;
    const g = grupos.get(chave) || { grupo, unidade: r.unidade, total: 0, vezes: 0 };
    g.total = arred(g.total + Number(r.quantidade));
    g.vezes += 1;
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => (a.unidade === b.unidade ? 0 : a.unidade === 'kg' ? -1 : 1) || b.total - a.total);
}

/** O registro é de um item que não está na lista hoje? */
export function registroForaDaLista(registro, itensAtuais = []) {
  if (registro.item_id && (itensAtuais || []).some(i => i.id === registro.item_id)) return false;
  const n = chaveDoNome(registro.item_nome);
  return !(itensAtuais || []).some(i => chaveDoNome(i.nome) === n);
}

/** Os itens registrados fora da lista, somados — para a Administração cadastrar. */
export const itensForaDaLista = (registros, itensAtuais = []) => somarPorItem(registros, itensAtuais).filter(g => g.foraDaLista);

/** "Frango · 1,5 kg · Vencido" — como a pessoa registrou, antes da correção. */
export const resumoRegistro = (o) => (o ? `${o.item_nome} · ${fmtQtd(o.quantidade, o.unidade)} · ${o.motivo}` : '');

/** As abas da planilha (xlsx): soma por item, por grupo, por motivo e um por um. */
export function planilhaDoDesperdicio(registros, itensAtuais, periodo) {
  const titulo = periodo.de === periodo.ate ? fmtData(periodo.de) : `${fmtData(periodo.de)} a ${fmtData(periodo.ate)}`;
  return [
    ['Soma por item', [['Desperdício', titulo], [],
      ['Item', 'Total', 'Unidade', 'Vezes', 'Motivos'],
      ...somarPorItem(registros, itensAtuais).map(g => [g.item, g.total, g.unidade, g.vezes,
        g.motivos.map(m => `${m.motivo} (${fmtNum(m.total, 3)})`).join(', ')])]],
    ['Por grupo', [['Grupo', 'Total', 'Unidade', 'Vezes'],
      ...somarPorGrupo(registros, itensAtuais).map(g => [g.grupo, g.total, g.unidade, g.vezes])]],
    ['Por motivo', [['Motivo', 'Total (kg)'], ...somarPorMotivo(registros).map(m => [m.motivo, m.total])]],
    ['Um por um', [['Data', 'Hora', 'Turno', 'Item', 'Quantidade', 'Unidade', 'Motivo', 'Responsável', 'Corrigido'],
      ...(registros || []).map(r => [fmtData(r.dia), r.hora, r.turno, r.item_nome, Number(r.quantidade), r.unidade,
        r.motivo, r.responsavel, r.editado_em ? `Sim (antes: ${resumoRegistro(r.original)})` : ''])]],
  ];
}
