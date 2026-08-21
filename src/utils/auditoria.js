// Conciliação da trilha de auditoria entre a linha OTIMISTA (montada no
// aparelho para a tela responder na hora) e a DEFINITIVA (gravada pela RPC
// registrar_auditoria, migração 18).
//
// O problema: os dois ids são gerados em lugares diferentes — o local é
// `Date.now()_random`, o do banco é `encode(gen_random_bytes(8),'hex')`. O merge
// da hidratação e o do tempo real deduplicam POR ID, então nunca casavam e a
// tela mostrava cada ação duas vezes. Pior, o resultado era gravado no cache:
// a duplicata sobrevivia ao recarregar.
//
// Por que casar por CONTEÚDO e não trocar o id na resposta da RPC: a linha
// otimista também chega ao banco pelo replay do outbox (bem depois, às vezes
// depois de recarregar o app, quando quem gravou já nem está mais em memória),
// e o cache de quem já usava o app está cheio de duplicatas antigas. Casar por
// conteúdo conserta os três casos com um caminho só.

const JANELA_MS = 120000; // 2 min: cobre relógio do tablet fora de hora sem colapsar ações repetidas legítimas

const mesmoTexto = (a, b) => String(a || '') === String(b || '');

/**
 * Remove das linhas LOCAIS aquelas que já chegaram do servidor.
 *
 * O casamento é 1 para 1 (cada linha do servidor consome no máximo uma local),
 * então duas ações idênticas de verdade continuam aparecendo duas vezes.
 *
 * @param {Array} servidor linhas vindas do banco
 * @param {Array} locais   linhas que só existem neste aparelho
 * @returns {Array} as locais que realmente ainda não subiram
 */
export function conciliarAuditoria(servidor, locais, janelaMs = JANELA_MS) {
  const doServidor = Array.isArray(servidor) ? servidor : [];
  const doAparelho = Array.isArray(locais) ? locais : [];
  if (!doServidor.length || !doAparelho.length) return doAparelho;

  const usados = new Set();
  return doAparelho.filter(l => {
    const i = doServidor.findIndex((s, idx) =>
      !usados.has(idx)
      && mesmoTexto(s.acao, l?.acao)
      && mesmoTexto(s.detalhe, l?.detalhe)
      && Math.abs((s.ts || 0) - (l?.ts || 0)) <= janelaMs);
    if (i < 0) return true;   // ainda não subiu: mantém na tela
    usados.add(i);
    return false;             // já veio do banco: a definitiva é a que fica
  });
}
