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

export const estaMorto = (item) => !!item._morto;
export const contarVivos = (fila) => (fila || []).filter(i => !i._morto).length;
export const contarMortos = (fila) => (fila || []).filter(i => i._morto).length;
