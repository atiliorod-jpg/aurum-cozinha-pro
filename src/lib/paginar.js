// =====================================================================
//  BUSCAR TODAS AS LINHAS, em páginas (23/09/2026)
//
//  ⚠️ O Supabase entrega no MÁXIMO 1.000 linhas por consulta (max_rows do
//  projeto) — e não avisa: a resposta vem "certa", só que cortada. Toda
//  leitura que pode passar disso (lançamentos de uma conta, a cópia do
//  cliente antes de apagar a conta) tem de vir por aqui.
//
//  `montar` devolve a consulta JÁ ORDENADA por uma coluna única (senão as
//  páginas se sobrepõem ou pulam linhas). Erro em qualquer página = erro no
//  todo: meia cópia não pode passar por cópia inteira.
// =====================================================================

export const TAMANHO_PAGINA = 1000;

/**
 * Todas as linhas, página a página PELA CHAVE (id > último), não pela posição.
 *
 * ⚠️ Com `range` (posição), uma linha que some do filtro no meio da leitura
 * (marcada como apagada, por exemplo) faz as seguintes recuarem uma casa, e
 * uma delas nunca é lida. Antes a próxima abertura baixava tudo e corrigia;
 * com os lançamentos guardados no aparelho (M53) o buraco ficaria para sempre.
 * `montar` NÃO deve ordenar: a ordem é pelo id, aqui.
 */
export async function buscarTodasPorId(montar, tamanho = TAMANHO_PAGINA) {
  const linhas = [];
  let ultimo = null;
  for (;;) {
    let q = montar();
    if (ultimo !== null) q = q.gt('id', ultimo);
    const { data, error } = await q.order('id').limit(tamanho);
    if (error) return { data: null, error };
    linhas.push(...(data || []));
    if (!data || data.length < tamanho) return { data: linhas, error: null };
    ultimo = data[data.length - 1].id;
  }
}

export async function buscarTodas(montar, tamanho = TAMANHO_PAGINA) {
  const linhas = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montar().range(de, de + tamanho - 1);
    if (error) return { data: null, error };
    linhas.push(...(data || []));
    if (!data || data.length < tamanho) return { data: linhas, error: null };
  }
}
