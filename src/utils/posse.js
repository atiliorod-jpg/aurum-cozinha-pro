// =====================================================================
//  A EMBALAGEM NA FINALIZAÇÃO (2ª etapa da baixa pela etiqueta, M61,
//  01/10/2026) — as regras puras do lado de quem RECEBE
//
//  Tudo aqui sai dos lançamentos que JÁ viajam para o aparelho da
//  Finalização (as saídas da Produção para ela = `recebimentos`, e as
//  perdas dela). Nada de lista nova para baixar, e funciona sem internet:
//   • a remessa pelo QR traz `etiquetaId`, `potes`, a validade e o nome;
//   • a saída lançada à mão traz `vinculos` (as embalagens lidas aqui);
//   • "usado" fica anotado na remessa (`usadas`), "chegou/não chegou" em
//     `conferida` — quem escreve é o banco, nunca o aparelho.
//
//  ⚠️ QUEM DECIDE É O BANCO. `decidirRecebimento` só ADIVINHA o caminho para
//  a tela responder na hora (e para a demonstração, que não tem banco). A
//  resposta do banco manda: se ela vier diferente, o aparelho desfaz o palpite.
// =====================================================================

import { quantoSomaNaContagem } from './etiquetas';
import { tipoBase } from './modulos';

const num = (v) => parseFloat(v) || 0;
const potesDe = (v) => Math.max(1, parseInt(v, 10) || 1);

/** A Finalização que tem a conferência ligada? Devolve `{ desde }` ou null. */
export function conferenciaDe(estoquesDoc, cozinha) {
  if (tipoBase(cozinha) !== 'finalizacao') return null;
  const c = estoquesDoc?.receberPeloQR?.[cozinha];
  return c && typeof c === 'object' ? c : null;
}

/** Liga/desliga a conferência de uma Finalização no documento `estoques`. */
export function comConferencia(estoquesDoc, cozinha, ligada, agora = Date.now()) {
  const doc = estoquesDoc && typeof estoquesDoc === 'object' ? estoquesDoc : {};
  const mapa = { ...(doc.receberPeloQR || {}) };
  if (ligada) mapa[cozinha] = mapa[cozinha] || { desde: agora };
  else delete mapa[cozinha];
  return { ...doc, receberPeloQR: mapa };
}

/**
 * As embalagens que estão AQUI, montadas dos recebimentos.
 *
 * ⚠️ O CONSUMO DAQUI É O FECHAR TURNO: ninguém lê o QR do que vai para o
 * prato. Sem um teto, a lista encheria de embalagens que já foram usadas. O
 * teto é o SALDO do item (que a contagem acerta): cabem `saldo ÷ medida`
 * embalagens, e ficam as que chegaram por último (as mais velhas saem antes).
 */
export function embalagensNaCozinha({ recebimentos = [], perdas = [], estoque = {}, produtos = [], cozinha = '' }) {
  const porId = new Map();
  const entrada = (id, base) => {
    if (!porId.has(id)) porId.set(id, { id, chegaram: 0, usadas: 0, perdidas: 0, remessas: [], ultimaChegada: 0, ...base });
    return porId.get(id);
  };

  (recebimentos || []).forEach(r => {
    if (!r) return;
    const ts = Number(r.ts) || 0;
    (r.itens || []).forEach(it => {
      if (!it?.etiquetaId) return;
      const e = entrada(it.etiquetaId, {
        produtoId: it.produtoId, validade: it.validade || null,
        nome: r.etiqueta?.nome || '', medida: r.etiqueta?.medida || '',
      });
      e.chegaram += potesDe(it.potes ?? r.potes);
      e.remessas.push(r.id);
      e.ultimaChegada = Math.max(e.ultimaChegada, ts);
    });
    (Array.isArray(r.vinculos) ? r.vinculos : []).forEach(v => {
      if (!v?.etiquetaId) return;
      const e = entrada(v.etiquetaId, {
        produtoId: v.produtoId, validade: v.validade || null, nome: v.nome || '', medida: v.medida || '',
      });
      e.chegaram += potesDe(v.potes);
      e.remessas.push(r.id);
      e.ultimaChegada = Math.max(e.ultimaChegada, ts);
    });
    Object.entries(r.usadas || {}).forEach(([id, n]) => { entrada(id, {}).usadas += Math.max(0, parseInt(n, 10) || 0); });
  });
  (perdas || []).forEach(p => {
    if (!p?.etiquetaId || !porId.has(p.etiquetaId)) return;
    porId.get(p.etiquetaId).perdidas += potesDe(p.potes);
  });

  const prod = new Map((produtos || []).map(p => [p.id, p]));
  const lista = [...porId.values()]
    .filter(e => e.produtoId && e.chegaram > 0)
    .map(e => ({ ...e, aqui: Math.max(0, e.chegaram - e.usadas - e.perdidas) }));

  // o teto pelo saldo, item a item: ficam as que chegaram por último
  const porProduto = new Map();
  lista.forEach(e => { (porProduto.get(e.produtoId) || porProduto.set(e.produtoId, []).get(e.produtoId)).push(e); });
  porProduto.forEach((doItem, produtoId) => {
    const unidade = prod.get(produtoId)?.unidade;
    let cabem = null; // null = não dá para converter: sem teto
    const medidas = doItem.map(e => quantoSomaNaContagem(e.medida, unidade));
    if (medidas.every(m => m && m > 0)) {
      let saldo = Math.max(0, num(estoque[produtoId]));
      cabem = new Map();
      doItem
        .map((e, i) => ({ e, m: medidas[i] }))
        .sort((a, b) => b.e.ultimaChegada - a.e.ultimaChegada)
        .forEach(({ e, m }) => {
          const n = Math.min(e.aqui, Math.floor(saldo / m + 1e-6));
          cabem.set(e.id, n);
          saldo = Math.max(0, saldo - n * m);
        });
    }
    doItem.forEach(e => { if (cabem) e.aqui = cabem.get(e.id) ?? e.aqui; });
  });

  return lista
    .filter(e => e.aqui > 0)
    .map(e => ({
      // no formato de uma etiqueta: a folha "Dar baixa" e a lista de Validades
      // usam as mesmas contas (copias − baixadas)
      id: e.id, produtoId: e.produtoId, nome: e.nome || prod.get(e.produtoId)?.nome || '',
      medida: e.medida, validade: e.validade, copias: e.aqui, baixadas: 0, status: 'valida',
      naFinalizacao: true, cozinha, remessas: e.remessas, chegouEm: e.ultimaChegada,
    }))
    .sort((a, b) => String(a.validade || '9999').localeCompare(String(b.validade || '9999')));
}

/** Data/hora do último Fechar Turno desta Finalização (0 = nenhum). */
export function ultimoFechamentoTs(ajustes = []) {
  return (ajustes || []).reduce((m, a) => (Array.isArray(a?.itens) ? Math.max(m, Number(a.ts) || 0) : m), 0);
}

/**
 * O que a Produção mandou e ninguém conferiu, item a item — só a partir de
 * quando a conferência foi ligada. A remessa de um turno JÁ FECHADO vem
 * marcada `antiga`: "não chegou" nela só arquiva (a contagem daquele turno já
 * descontou — lançar perda agora contaria duas vezes).
 */
export function pendentesDeConferencia({ recebimentos = [], desde = 0, fechadoEm = 0 }) {
  const linhas = [];
  (recebimentos || []).forEach(r => {
    if (!r || (Number(r.ts) || 0) < (Number(desde) || 0)) return;
    const porProduto = new Map();
    (r.itens || []).forEach(it => {
      if (!it?.produtoId) return;
      const l = porProduto.get(it.produtoId) || {
        registroId: r.id, produtoId: it.produtoId, quantidade: 0, potes: 0, etiquetaIds: [],
        ts: Number(r.ts) || 0, data: r.data, hora: r.hora, responsavel: r.responsavel || '',
        manual: !r.etiquetaId && !r.baixaId,
      };
      l.quantidade = Math.round((l.quantidade + num(it.quantidade)) * 1000) / 1000;
      if (it.etiquetaId) { l.etiquetaIds.push(it.etiquetaId); l.potes += potesDe(it.potes ?? r.potes); }
      porProduto.set(it.produtoId, l);
    });
    porProduto.forEach((l, produtoId) => {
      if (r.conferida?.[produtoId]) return;
      linhas.push({ ...l, antiga: l.ts <= (Number(fechadoEm) || 0) });
    });
  });
  return linhas.sort((a, b) => b.ts - a.ts);
}

/**
 * O palpite do caminho do "Receber" (o banco confirma):
 *  'conferida' — veio pelo QR e ainda não foi conferida;
 *  'vinculo'   — a Produção lançou à mão (3 dias) e cabe esta embalagem;
 *  'entrada'   — a Produção não lançou, e a conferência está ligada;
 *  null        — nada a fazer aqui (`motivo` diz por quê).
 */
export function decidirRecebimento({ etq, recebimentos = [], ligada = false, potes = 1, quantidade = null, agora = Date.now() }) {
  if (!etq?.id) return { caso: null, motivo: 'nao_encontrada' };
  if (tipoBase(etq.cozinha) !== 'producao' && !etq.naFinalizacao) return { caso: null, motivo: 'outra_cozinha' };

  const pendentes = (recebimentos || []).filter(r => (r.itens || []).some(it => it?.etiquetaId === etq.id)
    && !r.conferida?.[etq.produtoId]);
  if (pendentes.length) {
    const n = pendentes.reduce((s, r) => s + (r.itens || [])
      .filter(it => it?.etiquetaId === etq.id).reduce((t, it) => t + potesDe(it.potes ?? r.potes), 0), 0);
    return { caso: 'conferida', registros: pendentes.map(r => r.id), potes: n };
  }
  if (etq.naFinalizacao) return { caso: null, motivo: 'ja_recebida' };

  const restantes = Math.max(0, potesDe(etq.copias) - Math.max(0, parseInt(etq.baixadas, 10) || 0));
  if (restantes < potes || (['consumida', 'descartada'].includes(etq.status) && !(parseInt(etq.baixadas, 10) > 0))) {
    return { caso: null, motivo: 'ja_saiu' };
  }
  if (!etq.produtoId) return { caso: null, motivo: 'avulsa' };

  const tresDias = agora - 3 * 86400000;
  const manual = [...(recebimentos || [])]
    .filter(r => !r.baixaId && !r.etiquetaId && (Number(r.ts) || 0) >= tresDias
      // etiqueta impressa DEPOIS da saída não pode ter ido nela
      && !(etq.impressoEm && r.data && String(etq.impressoEm) > String(r.data))
      && (r.itens || []).some(it => it?.produtoId === etq.produtoId))
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
    .find(r => {
      const doItem = (r.itens || []).filter(it => it.produtoId === etq.produtoId).reduce((s, it) => s + num(it.quantidade), 0);
      const ligadas = (Array.isArray(r.vinculos) ? r.vinculos : [])
        .filter(v => v.produtoId === etq.produtoId).reduce((s, v) => s + num(v.quantidade), 0);
      return ligadas + (num(quantidade) || 0.001) <= doItem + 0.001;
    });
  if (manual) return { caso: 'vinculo', registroId: manual.id };
  if (ligada) return { caso: 'entrada' };
  return { caso: null, motivo: 'nao_saiu' };
}

export const MOTIVO_RECEBER = {
  ja_recebida: 'Esta embalagem já foi recebida aqui.',
  ja_saiu: 'Todas as embalagens deste código já saíram da Produção.',
  nao_saiu: 'A Produção ainda não deu saída desta embalagem.',
  outra_cozinha: 'Esta etiqueta não é da Produção.',
  avulsa: 'Etiqueta sem item do estoque: não há o que receber.',
  nao_encontrada: 'Etiqueta não encontrada nesta conta.',
  nao_esta_aqui: 'Esta embalagem não está nesta Finalização.',
  poucos_potes: 'Não há tantas embalagens deste código aqui.',
};

// ── Mexer numa remessa (o palpite local, igual ao que o banco grava) ────
const marca = (por, nao = false) => ({ em: Date.now(), por: por || '', ...(nao ? { nao: true } : {}) });

export function remessaConferida(r, produtoId, por, nao = false) {
  return { ...r, conferida: { ...(r.conferida || {}), [produtoId]: marca(por, nao) } };
}
export function remessaSemConferencia(r, produtoId) {
  const c = { ...(r.conferida || {}) };
  delete c[produtoId];
  return { ...r, conferida: c };
}
export function remessaComVinculo(r, v) {
  return { ...r, vinculos: [...(Array.isArray(r.vinculos) ? r.vinculos : []), v] };
}
export function remessaSemVinculo(r, baixaId) {
  return { ...r, vinculos: (Array.isArray(r.vinculos) ? r.vinculos : []).filter(v => v.baixaId !== baixaId) };
}
export function remessaComUsadas(r, etiquetaId, delta) {
  const atual = Math.max(0, parseInt(r.usadas?.[etiquetaId], 10) || 0);
  return { ...r, usadas: { ...(r.usadas || {}), [etiquetaId]: Math.max(0, atual + delta) } };
}

/**
 * Os recebimentos vêm SÓ do banco (o resto velho do aparelho não volta) — mas
 * o que este aparelho fez e ainda está NA FILA (sem internet) precisa
 * continuar na tela até subir. Devolve a MESMA lista quando nada muda.
 */
export function aplicarFilaNosRecebimentos(lista, fila, cozinha) {
  let out = Array.isArray(lista) ? lista : [];
  const mudar = (id, fn) => {
    if (!out.some(x => x.id === id)) return;
    out = out.map(x => (x.id === id ? fn(x) : x));
  };
  (fila || []).forEach(i => {
    if (!i || i._morto) return;
    const b = i.payload?.local;
    if (!b) return;
    if (i.kind === 'receberEtiqueta' && b.cozinha === cozinha) {
      if (b.caso === 'entrada' && b.registro && !out.some(x => x.id === b.registro.id)) {
        out = [...out, b.registro].sort((x, y) => (x.ts || 0) - (y.ts || 0));
      } else if (b.caso === 'conferida') {
        (b.registros || []).forEach(id => mudar(id, x => (x.conferida?.[b.produtoId] ? x : remessaConferida(x, b.produtoId, b.quem))));
      } else if (b.caso === 'vinculo' && b.registroId) {
        mudar(b.registroId, x => ((x.vinculos || []).some(v => v.baixaId === b.baixaId) ? x
          : remessaConferida(remessaComVinculo(x, b.vinculo), b.produtoId, b.quem)));
      }
    } else if (i.kind === 'baixaNoDestino' && b.cozinha === cozinha && b.acao === 'usada' && b.remessaId) {
      mudar(b.remessaId, x => remessaComUsadas(x, b.etiquetaId, b.potes));
    } else if (i.kind === 'conferirRemessa' && b.registroId) {
      mudar(b.registroId, x => (b.resultado === 'desfazer'
        ? remessaSemConferencia(x, b.produtoId) : remessaConferida(x, b.produtoId, b.quem, b.resultado === 'nao_chegou')));
    }
  });
  return out;
}

/**
 * Apagar na Produção uma saída que a Finalização JÁ recebeu, conferiu ou usou:
 * o que ainda está lá volta para a Produção, o que já foi usado não volta. A
 * tela avisa antes (o banco nunca recusa a exclusão — "Apagar tudo" e a cópia
 * de segurança não podem travar numa linha).
 */
export function avisoAoApagarRemessa(reg) {
  if (!reg || tipoBase(reg.destino) !== 'finalizacao') return '';
  const usou = Object.values(reg.usadas || {}).some(n => (parseInt(n, 10) || 0) > 0);
  const ligadas = Array.isArray(reg.vinculos) && reg.vinculos.length > 0;
  const conferida = reg.conferida && Object.keys(reg.conferida).length > 0;
  if (!usou && !ligadas && !conferida && !reg.recebidaPelaFinalizacao) return '';
  return `A Finalização já ${reg.recebidaPelaFinalizacao ? 'deu entrada desta remessa' : usou ? 'usou parte desta remessa' : 'conferiu esta remessa'}. `
    + 'Apagar devolve à Produção só o que ainda está lá; o que já foi usado ou perdido na Finalização continua lançado lá.';
}

/** A remessa mais recente onde a embalagem chegou (onde se anota o "usado"). */
export function remessaDaEmbalagem(recebimentos = [], etiquetaId) {
  return [...(recebimentos || [])]
    .filter(r => (r.itens || []).some(it => it?.etiquetaId === etiquetaId)
      || (Array.isArray(r.vinculos) && r.vinculos.some(v => v.etiquetaId === etiquetaId)))
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))[0] || null;
}
