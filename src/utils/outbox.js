// Lógica pura da fila de sincronização (outbox) — testável sem DOM/rede.
//
// Um item que falha para sempre (payload que viola constraint, plano vencido
// de vez, schema divergente) não pode ficar preso retentando eternamente e
// travando o badge de "sincronizando". Depois de MAX_TENTATIVAS ele é marcado
// como MORTO: sai do loop e aparece numa lista separada, com retry manual.

export const MAX_TENTATIVAS_OUTBOX = 8;

// Erros que NUNCA vão passar numa nova tentativa: o payload viola uma regra
// do banco (constraint/coluna/tipo inválido). Retentar 8 vezes só atrasa o
// aviso ao usuário — o item vai direto para a lista de erro permanente.
// Ex.: registro de um módulo cujo tipo ainda não foi liberado na migração 17.
const ERRO_DEFINITIVO = /violates check constraint|violates foreign key|invalid input syntax|column .* does not exist|violates not-null/i;

export const ehErroDefinitivo = (msg) => ERRO_DEFINITIVO.test(String(msg || ''));

// Registra uma tentativa falha; devolve o item atualizado (imutável).
// Ao atingir o máximo (ou logo de cara, se o erro for definitivo), marca
// _morto para o flush parar de retentá-lo.
export function registrarFalha(item, max = MAX_TENTATIVAS_OUTBOX) {
  const tentativas = (item._tentativas || 0) + 1;
  return {
    ...item,
    _tentativas: tentativas,
    _morto: tentativas >= max || ehErroDefinitivo(item._ultimoErro),
  };
}

// Zera o estado de falha (usado no "tentar de novo" manual).
export function ressuscitar(item) {
  const { _morto, _tentativas, ...resto } = item;
  return resto;
}

/**
 * A fila com um item novo no fim.
 *
 * ⚠️ DOCUMENTO SÓ PRECISA DA ÚLTIMA VERSÃO. Cada gravação de catálogo manda o
 * documento INTEIRO, e o replay grava por cima (versão -1) — então as cópias
 * antigas da mesma chave na fila não mudam o resultado, só ocupam espaço. E
 * ocupavam muito: a lista de etiquetas impressas passa de 1 MB com o uso, e
 * cada etiqueta impressa sem internet enfileirava mais uma cópia dela. Poucas
 * etiquetas enchiam o localStorage, e daí em diante a fila não conseguia mais
 * gravar NADA — lançamento e linha do relatório perdidos em silêncio.
 * Registros, impressões e auditoria continuam um por um: esses são eventos,
 * não estado.
 */
export function comItemNovo(fila, item) {
  const base = Array.isArray(fila) ? fila : [];
  const ehDoc = (i) => i?.kind === 'doc' && i.op === 'upsert' && !!i.payload?.chave;
  if (!ehDoc(item)) return [...base, item];
  const mesmaChave = (i) => ehDoc(i)
    && i.payload.chave === item.payload.chave
    && i.payload.restaurante_id === item.payload.restaurante_id;
  return [...base.filter(i => !mesmaChave(i)), item];
}

export const estaMorto = (item) => !!item._morto;
export const contarVivos = (fila) => (fila || []).filter(i => !i._morto).length;
export const contarMortos = (fila) => (fila || []).filter(i => i._morto).length;
