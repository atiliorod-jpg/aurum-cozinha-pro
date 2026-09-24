// =====================================================================
//  Erros dos aparelhos no painel (M50) — o agrupamento, puro para teste.
//
//  O mesmo erro em dez aparelhos é UM problema, não dez linhas: o painel
//  mostra por mensagem, com quantas vezes, em quantas contas, a última vez, e
//  as versões do app em que apareceu (versão velha = app preso no endereço
//  antigo, o caso de 10/09).
// =====================================================================

// ⚠️ RUÍDO NÃO É ERRO: rede caindo, extensão do navegador e o aviso inofensivo
// do ResizeObserver ficam de fora — senão o painel encheria de coisa que não
// é defeito do app.
const RUIDO = /Failed to fetch|NetworkError|Load failed|ERR_INTERNET|ERR_NETWORK|ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|AbortError|The user aborted|cancelled|Importing a module script failed/i;

/** É ruído (rede, extensão) e não defeito do app? */
export const ehRuido = (mensagem, onde = '') => RUIDO.test(`${mensagem || ''} ${onde || ''}`);

export const TIPOS_DE_ERRO = {
  tela: 'Tela travou',
  js: 'Erro no app',
  promessa: 'Erro no app',
  fila: 'Lançamento não subiu',
};

export function agruparErros(linhas) {
  const grupos = new Map();
  for (const l of linhas || []) {
    if (!l || !l.mensagem) continue;
    const chave = `${l.tipo}|${l.mensagem}`;
    const g = grupos.get(chave) || {
      chave, tipo: l.tipo, mensagem: l.mensagem, vezes: 0, contas: new Set(),
      ultimo: '', versoes: new Set(), telas: new Set(), onde: l.onde || '',
    };
    g.vezes += Number(l.vezes) || 1;
    if (l.restaurante_id) g.contas.add(l.restaurante_id);
    const quando = l.visto_em || l.criado_em || '';
    if (quando > g.ultimo) { g.ultimo = quando; if (l.onde) g.onde = l.onde; }
    if (l.versao) g.versoes.add(l.versao);
    if (l.tela) g.telas.add(l.tela);
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .map(g => ({ ...g, contas: [...g.contas], versoes: [...g.versoes].sort().reverse(), telas: [...g.telas] }))
    .sort((a, b) => b.ultimo.localeCompare(a.ultimo));
}
