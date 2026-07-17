// Lógica pura da fila de sincronização (outbox) — testável sem DOM/rede.
//
// Um item que falha para sempre (payload que viola constraint, plano vencido
// de vez, schema divergente) não pode ficar preso retentando eternamente e
// travando o badge de "sincronizando". Depois de MAX_TENTATIVAS ele é marcado
// como MORTO: sai do loop e aparece numa lista separada, com retry manual.

export const MAX_TENTATIVAS_OUTBOX = 8;

// Registra uma tentativa falha; devolve o item atualizado (imutável).
// Ao atingir o máximo, marca _morto para o flush parar de retentá-lo.
export function registrarFalha(item, max = MAX_TENTATIVAS_OUTBOX) {
  const tentativas = (item._tentativas || 0) + 1;
  return { ...item, _tentativas: tentativas, _morto: tentativas >= max };
}

// Zera o estado de falha (usado no "tentar de novo" manual).
export function ressuscitar(item) {
  const { _morto, _tentativas, ...resto } = item;
  return resto;
}

export const estaMorto = (item) => !!item._morto;
export const contarVivos = (fila) => (fila || []).filter(i => !i._morto).length;
export const contarMortos = (fila) => (fila || []).filter(i => i._morto).length;
