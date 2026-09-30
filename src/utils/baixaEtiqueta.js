// =====================================================================
//  BAIXA PELA ETIQUETA (M59, 30/09/2026) — as regras puras
//
//  Ler o QR da embalagem (ou digitar o código) dá SAÍDA, PERDA ou só marca
//  como USADA. Decisões do dono:
//   • Produção e Seco: Saída (com destino), Perda e Usado.
//   • Finalização: Usado e Perda — o consumo de lá vem do Fechar Turno.
//   • "Usado" SÓ MARCA, sem mexer no estoque: a produção ainda desconta os
//     ingredientes pela receita, e lançar saída contaria duas vezes (até o
//     dono reformular a produção).
//   • Embalagem vencida na Saída: pede confirmação e sugere Perda.
//   • Desfazer por até 24 horas; depois, pelo Histórico.
//   • Sem medida na etiqueta: pergunta a quantidade (item em unidades vale 1).
//
//  ⚠️ UM CÓDIGO POR LOTE: pelo Bluetooth as N cópias saem com o mesmo QR, e
//  a linha da etiqueta guarda `copias`. Cada baixa consome embalagens desse
//  lote — "embalagem 2 de 5".
// =====================================================================

import { temRecurso } from './modulos';
import { quantoSomaNaContagem } from './etiquetas';
import { diasAte } from './datas';

export const DESFAZER_HORAS = 24;

/** Quantas embalagens deste código a linha representa. */
export const copiasDaEtiqueta = (etq) => Math.max(1, parseInt(etq?.copias, 10) || 1);

/**
 * Quantas ainda estão na prateleira. A etiqueta marcada à mão ANTES da M59
 * (consumida/descartada sem contador) vale como toda baixada.
 */
export function embalagensRestantes(etq) {
  if (!etq) return 0;
  const copias = copiasDaEtiqueta(etq);
  const baixadas = Math.max(0, parseInt(etq.baixadas, 10) || 0);
  if (['consumida', 'descartada'].includes(etq.status) && baixadas === 0) return 0;
  return Math.max(0, copias - baixadas);
}

/** Qual é a próxima embalagem: "2 de 5". */
export const proximaEmbalagem = (etq) => ({
  numero: Math.min(copiasDaEtiqueta(etq), copiasDaEtiqueta(etq) - embalagensRestantes(etq) + 1),
  de: copiasDaEtiqueta(etq),
});

/** Os botões da cozinha aberta, na ordem em que aparecem. */
export function acoesDaCozinha(modulo) {
  const acoes = [];
  if (temRecurso(modulo, 'saidas')) acoes.push('saida');
  if (temRecurso(modulo, 'perdas')) acoes.push('perda');
  acoes.push('usada');
  return acoes;
}

export const ROTULO_ACAO = { saida: 'Saída', perda: 'Perda', usada: 'Usado' };

/**
 * Quanto do item sai com UMA embalagem, na unidade do item. `null` = a
 * medida não diz (ou não converte) e a tela pergunta.
 */
export function quantidadeDaEmbalagem(etq, produto) {
  if (!produto) return null;
  const q = quantoSomaNaContagem(etq?.medida, produto.unidade);
  return q && q > 0 ? q : null;
}

/** A validade da embalagem hoje: vencida? quantos dias? */
export function validadeDaEmbalagem(etq, hojeISO) {
  if (!etq?.validade) return { vencida: false, dias: null, texto: 'sem validade' };
  const dias = diasAte(etq.validade, hojeISO);
  const texto = dias < 0 ? `venceu há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`
    : dias === 0 ? 'vence hoje'
    : `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return { vencida: dias < 0, dias, texto };
}

/** A etiqueta é de outra cozinha que não a aberta? (a baixa vai para a dela) */
export const deOutraCozinha = (etq, moduloAberto) => !!etq?.cozinha && !!moduloAberto && etq.cozinha !== moduloAberto;

/**
 * O lançamento de estoque que a baixa gera, no MESMO formato dos lançamentos
 * manuais (Saídas e Aparas/Perdas) — assim Histórico, Relatório e o cálculo
 * de estoque o leem sem caso especial. O banco sobrescreve item, validade e
 * cozinha com os da etiqueta (M59); aqui vão iguais para a cópia local bater.
 */
export function registroDaBaixa({ acao, etq, produto, quantidade, destino, responsavel, turno, dia, hora, baixaId, motivo = null }) {
  const comum = { data: dia, hora, responsavel: responsavel || '', etiquetaId: etq.id, baixaId };
  if (acao === 'saida') {
    return {
      ...comum,
      destino,
      obs: `Pela etiqueta ${codigoLegivel(etq.id)}`,
      itens: [{ produtoId: etq.produtoId, quantidade, validade: etq.validade || null, etiquetaId: etq.id }],
    };
  }
  if (acao === 'perda') {
    const vencida = !!etq.validade && etq.validade < dia;
    const cod = motivo || (vencida ? 'V' : 'O');
    return {
      ...comum,
      turno: turno || '',
      origem: 'estoque',
      produtoId: etq.produtoId,
      item: etq.nome || produto?.nome || '',
      quantidade,
      unidade: produto?.unidade || '',
      // os códigos de MOTIVOS_DESPERDICIO (V = vencimento, O = outro)
      motivo: cod,
      motivoOutro: cod === 'O' ? 'Baixa pela etiqueta' : '',
      validade: etq.validade || null,
    };
  }
  return null;
}

/** O código como sai impresso: 8 letras em maiúsculas, com hífen no meio. */
export const codigoLegivel = (id) => {
  const t = String(id || '').toUpperCase();
  return t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4)}` : t;
};

/** Id novo de baixa (idempotência da fila; o banco exige o formato). */
export const novaBaixaId = () =>
  `bx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;

/** Ainda dá para desfazer pelo aviso? */
export const podeDesfazer = (quandoMs, agora = Date.now()) => agora - quandoMs < DESFAZER_HORAS * 3600 * 1000;

/**
 * MODO RÁPIDO: a leitura já lança a ação escolhida — a não ser que alguma
 * coisa peça um olhar. Devolve o motivo para abrir a folha (e perguntar), ou
 * null quando dá para lançar direto.
 */
export function motivoParaPerguntar(etq, acao, { modulo, produto, hojeISO }) {
  if (embalagensRestantes(etq) <= 0) return 'acabou';
  if (deOutraCozinha(etq, modulo)) return 'outra_cozinha';
  if (!acoesDaCozinha(modulo).includes(acao)) return 'acao_indisponivel';
  if (acao !== 'usada' && !etq.produtoId) return 'avulsa';
  if (acao !== 'usada' && !quantidadeDaEmbalagem(etq, produto)) return 'sem_quantidade';
  if (acao === 'saida' && validadeDaEmbalagem(etq, hojeISO).vencida) return 'vencida';
  return null;
}

export const AVISO_PARA_PERGUNTAR = {
  acabou: 'Todas as embalagens deste código já saíram.',
  outra_cozinha: 'Esta etiqueta é de outra cozinha.',
  acao_indisponivel: 'Esta ação não existe nesta cozinha.',
  avulsa: 'Etiqueta sem item do estoque: só dá para marcar como usada.',
  sem_quantidade: 'A etiqueta não diz a medida: confira a quantidade.',
  vencida: 'Embalagem vencida: confira antes de dar saída.',
};

// ── Código digitado com letra parecida ───────────────────────────────
// ⚠️ O código é base36 (0-9 e a-z), e no papel "O" e "0", "I", "L" e "1" se
// confundem. Quem digita o que VÊ não pode ficar sem achar a etiqueta. A
// busca aceita as trocas: compara pela forma "normalizada" na lista local e
// pede ao banco as variações possíveis (com teto, para não virar varredura).
const PARECIDAS = { 0: ['0', 'o'], o: ['o', '0'], 1: ['1', 'i', 'l'], i: ['i', '1', 'l'], l: ['l', '1', 'i'] };
export const normalizarCodigo = (id) => String(id || '').toLowerCase().replace(/o/g, '0').replace(/[il]/g, '1');
export function candidatosDoCodigo(id, max = 64) {
  const base = String(id || '').toLowerCase();
  let lista = [''];
  for (const ch of base) {
    const ops = PARECIDAS[ch] || [ch];
    lista = lista.flatMap(p => ops.map(o => p + o));
    if (lista.length > max) return [base];
  }
  return lista;
}
