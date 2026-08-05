// Fechamento de turno da Cozinha de Finalização.
//
// A regra que evita digitação no corre do serviço: ninguém registra prato a
// prato. O app sabe o que ENTROU (a produção mandou) e a equipe conta só o que
// SOBROU no fim do turno. O consumo é a diferença:
//
//   consumo = (sobra do turno anterior + recebido no turno) − perdas − sobra contada
//              └──────────── disponível no turno ────────────┘
//
// A sobra contada num fechamento vira a ABERTURA do turno seguinte — é o mesmo
// espírito da contagem física da produção, só que como rotina de fim de turno.

const num = (v) => parseFloat(v) || 0;

/** Último fechamento gravado (o mais recente por ts). */
export function ultimoFechamento(fechamentos = []) {
  return [...fechamentos].sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] || null;
}

/** Sobra por produto no último fechamento = saldo de abertura do turno atual. */
export function saldoAbertura(fechamentos = []) {
  const ult = ultimoFechamento(fechamentos);
  const out = {};
  (ult?.itens || []).forEach(i => { out[i.produtoId] = num(i.quantidade); });
  return out;
}

/**
 * Situação do turno EM ABERTO, por produto.
 * Considera só o que aconteceu DEPOIS do último fechamento — é isso que separa
 * um turno do outro sem precisar de "início de turno" explícito.
 */
export function turnoAberto({ produtos = [], recebimentos = [], perdas = [], fechamentos = [] }) {
  const ult = ultimoFechamento(fechamentos);
  const desde = ult?.ts || 0;
  const abertura = saldoAbertura(fechamentos);

  const recebido = {};
  recebimentos.filter(r => (r.ts || 0) > desde).forEach(r => {
    (r.itens || []).forEach(i => {
      recebido[i.produtoId] = (recebido[i.produtoId] || 0) + num(i.quantidade);
    });
  });

  const perdido = {};
  perdas.filter(p => (p.ts || 0) > desde).forEach(p => {
    if (!p.produtoId) return;
    perdido[p.produtoId] = (perdido[p.produtoId] || 0) + num(p.quantidade);
  });

  const ids = new Set([...Object.keys(abertura), ...Object.keys(recebido), ...Object.keys(perdido)]);
  const linhas = [...ids].map(produtoId => {
    const p = produtos.find(x => x.id === produtoId);
    const ab = abertura[produtoId] || 0;
    const re = recebido[produtoId] || 0;
    const pe = perdido[produtoId] || 0;
    return {
      produtoId,
      nome: p?.nome || produtoId,
      unidade: p?.unidade || '',
      abertura: ab,
      recebido: re,
      perdido: pe,
      // quanto deveria estar na bancada agora, se nada tivesse sido consumido
      disponivel: Math.round((ab + re - pe) * 1000) / 1000,
    };
  });
  return {
    desde,
    aberturaEm: ult?.data || null,
    linhas: linhas.sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

/**
 * Consumo do turno a partir da sobra contada.
 * `sobras` = { [produtoId]: quantidade contada na bancada }
 *
 * Sobra MAIOR que o disponível não é erro de conta do app — é sinal de que
 * chegou coisa sem registro ou que a contagem anterior estava baixa. Devolvemos
 * o consumo negativo marcado como `inconsistente` para a tela poder avisar, em
 * vez de esconder o problema zerando.
 */
export function consumoDoTurno(linhas = [], sobras = {}) {
  return linhas.map(l => {
    const sobra = num(sobras[l.produtoId]);
    const consumo = Math.round((l.disponivel - sobra) * 1000) / 1000;
    return { ...l, sobra, consumo, inconsistente: consumo < 0 };
  });
}

/** Só as linhas que valem gravar no fechamento (evita poluir com zeros). */
export const linhasParaGravar = (linhas) =>
  linhas.filter(l => l.disponivel > 0 || l.sobra > 0);
