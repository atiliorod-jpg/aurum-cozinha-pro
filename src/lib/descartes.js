// =====================================================================
//  REGISTRO DE DESPERDÍCIO — o banco (M65) e a fila sem internet
//
//  Registrar: manda na hora; sem internet (ou erro), entra na MESMA fila do
//  app (outbox, kind 'descarte') e sobe sozinho quando a conexão volta — com
//  a hora em que foi feito, e sem duplicar (o id vem do aparelho).
//  Ler, corrigir e apagar: só com a Administração aberta (o banco confere).
//  ⚠️ NA DEMONSTRAÇÃO não há banco: tudo fica no aparelho, numa chave
//  `pe::demo::` — que o "Sair da demo" já apaga.
// =====================================================================
import { supabase } from './supabase';
import { outboxAdd, outboxGet } from './cache';
import { isoLocal } from '../utils/formatters';

const CHAVE_DEMO = 'pe::demo::descartes';
const lerDemo = () => { try { return JSON.parse(localStorage.getItem(CHAVE_DEMO) || '[]') || []; } catch { return []; } };
const gravarDemo = (l) => { try { localStorage.setItem(CHAVE_DEMO, JSON.stringify(l)); } catch { /* sem storage */ } };
const horaDe = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const novoIdDeDescarte = () => (typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : ((n % 4) + 8)).toString(16);
  }));

/**
 * Registra um descarte. `linha` = { id, quando, turno, item_id, item_nome,
 * quantidade, unidade, motivo, responsavel }. Devolve { enviado: true } ou
 * { enviado: false } (ficou na fila, vai sozinho depois).
 */
export async function registrarDescarte({ rid, demo }, linha) {
  if (demo) {
    const d = new Date(linha.quando);
    gravarDemo([{ ...linha, dia: isoLocal(d), hora: horaDe(d), editado_em: null, original: null }, ...lerDemo()]);
    return { enviado: true };
  }
  const naFila = () => {
    outboxAdd(rid, { kind: 'descarte', op: 'rpc', payload: { itens: [linha] } });
    try { window.dispatchEvent(new Event('forcar-sync')); } catch { /* sem window */ }
    return { enviado: false };
  };
  try {
    const { data, error } = await supabase.rpc('registrar_descartes', { p_itens: [linha] });
    if (error) return naFila();
    // ⚠️ O BANCO RECUSOU SEM ERRO (auditoria 24/11/2026): a função devolve
    // quantos gravou, e 0 é conta sem liberação (M55) ou o relógio do aparelho
    // muito atrasado. Antes a tela dizia "Descarte registrado" assim mesmo.
    return Number(data) === 0 ? { enviado: false, recusado: true } : { enviado: true };
  } catch { return naFila(); }
}

const ehFalhaDeRede = (msg) => /Failed to fetch|NetworkError|network|Load failed|fetch failed/i.test(String(msg || ''));

/**
 * O "ALTERAR" DE QUEM ACABOU DE REGISTRAR (24/11/2026, pedido do dono, M66):
 * anotou errado, corrige ali mesmo, sem a senha da Administração. O banco só
 * deixa no registro feito NESTE aparelho, nos primeiros 15 minutos e enquanto
 * a Administração não corrigiu; guarda como estava e marca "Alterado na hora".
 * `a` = { id, item_id, item_nome, quantidade, unidade, motivo }.
 * ⚠️ SEM INTERNET (o registro ainda na fila, ou a rede caiu): a alteração
 * entra na MESMA fila, DEPOIS do registro — a fila sobe em ordem, então o
 * registro chega primeiro e a alteração em seguida.
 * Devolve { enviado }; erro do banco (passou o tempo...) vira exceção.
 */
export async function alterarMeuDescarte({ rid, demo }, a) {
  const campos = { item_id: a.item_id || null, item_nome: a.item_nome, quantidade: a.quantidade, unidade: a.unidade, motivo: a.motivo };
  if (demo) {
    gravarDemo(lerDemo().map(l => (l.id !== a.id ? l : {
      ...l,
      original: l.original || { item_id: l.item_id, item_nome: l.item_nome, quantidade: l.quantidade, unidade: l.unidade, motivo: l.motivo },
      ...campos,
      alterado_em: new Date().toISOString(),
    })));
    return { enviado: true };
  }
  const naFila = () => {
    outboxAdd(rid, { kind: 'descarte', op: 'alterar', payload: { id: a.id, ...campos } });
    try { window.dispatchEvent(new Event('forcar-sync')); } catch { /* sem window */ }
    return { enviado: false };
  };
  const registroNaFila = outboxGet(rid).some(i => i.kind === 'descarte' && i.op === 'rpc' && !i._morto
    && (i.payload?.itens || []).some(l => l.id === a.id));
  if (registroNaFila) return naFila();
  let erro;
  try {
    ({ error: erro } = await supabase.rpc('alterar_meu_descarte', {
      p_id: a.id, p_item_id: campos.item_id, p_item_nome: campos.item_nome,
      p_quantidade: campos.quantidade, p_unidade: campos.unidade, p_motivo: campos.motivo,
    }));
  } catch (e) { erro = e; }
  if (!erro) return { enviado: true };
  if (ehFalhaDeRede(erro.message || erro)) return naFila();
  throw new Error(erro.message || 'Não deu para alterar.');
}

/** Os registros do período (Administração aberta). `restaurante`: só no modo suporte. */
export async function listarDescartes({ demo, restaurante = null }, de, ate) {
  if (demo) return lerDemo().filter(l => l.dia >= de && l.dia <= ate).sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  const { data, error } = await supabase.rpc('descartes_do_periodo', {
    p_de: de, p_ate: ate, ...(restaurante ? { p_restaurante: restaurante } : {}),
  });
  if (error) throw new Error(ehFalhaDeRede(error.message) ? 'Sem internet para ver os registros.' : error.message);
  return data || [];
}

/** Corrige item, quantidade, unidade ou motivo; o banco guarda como a pessoa registrou. */
export async function corrigirDescarte({ demo }, c) {
  if (demo) {
    gravarDemo(lerDemo().map(l => (l.id !== c.id ? l : {
      ...l,
      original: l.original || { item_id: l.item_id, item_nome: l.item_nome, quantidade: l.quantidade, unidade: l.unidade, motivo: l.motivo },
      item_id: c.item_id || null, item_nome: c.item_nome, quantidade: c.quantidade, unidade: c.unidade, motivo: c.motivo,
      editado_em: new Date().toISOString(),
    })));
    return;
  }
  const { error } = await supabase.rpc('corrigir_descarte', {
    p_id: c.id, p_item_id: c.item_id || null, p_item_nome: c.item_nome,
    p_quantidade: c.quantidade, p_unidade: c.unidade, p_motivo: c.motivo,
  });
  if (error) throw new Error(error.message);
}

export async function voltarDescarteOriginal({ demo }, id) {
  if (demo) {
    gravarDemo(lerDemo().map(l => (l.id !== id || !l.original ? l : { ...l, ...l.original, original: null, editado_em: null, alterado_em: null })));
    return;
  }
  const { error } = await supabase.rpc('voltar_descarte_original', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function apagarDescarte({ demo }, id) {
  if (demo) { gravarDemo(lerDemo().filter(l => l.id !== id)); return; }
  const { error } = await supabase.rpc('apagar_descarte', { p_id: id });
  if (error) throw new Error(error.message);
}

/** Apaga de vez os registros do período. Devolve quantos. */
export async function apagarDescartesDoPeriodo({ demo }, de, ate) {
  if (demo) {
    const antes = lerDemo();
    const ficam = antes.filter(l => !(l.dia >= de && l.dia <= ate));
    gravarDemo(ficam);
    return antes.length - ficam.length;
  }
  const { data, error } = await supabase.rpc('apagar_descartes_periodo', { p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
