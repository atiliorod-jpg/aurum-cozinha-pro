// A decisão do cartão de primeiro uso (components/PrimeiroUso.jsx).
//
// ⚠️ MORA AQUI, e não junto do componente, pelo mesmo motivo de
// `marcaDeUpgrade` em utils/produto.js: a decisão é a parte que erra, e ela
// precisa de teste sem navegador. (O projeto não tem jsdom — comportamento de
// componente só se verifica no navegador; regra pura se verifica no CI.)

/**
 * O cartão aparece? Função PURA, no mesmo espírito de `marcaDeUpgrade()`: a
 * decisão é a parte que erra, e ela precisa de teste sem navegador.
 *
 * Devolve o que está faltando, não um booleano: a mesma resposta serve para
 * decidir se mostra e para escrever a frase certa.
 */
export function faltasDoPrimeiroUso({ pessoas, prefs, ehDiretoria }) {
  const nada = { mostrar: false, faltaPessoa: false, faltaEndereco: false };
  // Cozinha não alcança equipe nem dados do estabelecimento — oferecer o
  // formulário a ela seria botão que leva a uma recusa.
  if (!ehDiretoria) return nada;
  if (prefs?.primeiroUsoAdiado) return nada;
  const faltaPessoa = (pessoas || []).length === 0;
  const faltaEndereco = !((prefs?.estabelecimento || {}).endereco || '').trim();
  if (!faltaPessoa && !faltaEndereco) return nada;
  return { mostrar: true, faltaPessoa, faltaEndereco };
}
