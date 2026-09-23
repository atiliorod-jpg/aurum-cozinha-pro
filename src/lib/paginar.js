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

export async function buscarTodas(montar, tamanho = TAMANHO_PAGINA) {
  const linhas = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montar().range(de, de + tamanho - 1);
    if (error) return { data: null, error };
    linhas.push(...(data || []));
    if (!data || data.length < tamanho) return { data: linhas, error: null };
  }
}
