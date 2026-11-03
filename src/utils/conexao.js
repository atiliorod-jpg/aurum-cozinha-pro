// =====================================================================
//  SEM INTERNET OU SERVIDOR FORA DO AR? (03/11/2026)
//
//  O dono não conseguiu entrar e o app dizia "Sem conexão com a internet".
//  A internet estava boa: o projeto do Supabase (plano grátis) tinha sido
//  PAUSADO por falta de uso, e o endereço dele some da rede. Para o
//  navegador as duas coisas são o mesmo "Failed to fetch" — e a mensagem
//  mandava conferir o Wi-Fi, que não tinha nada a ver.
//
//  Agora, quando o servidor não responde, o app pergunta ao PRÓPRIO
//  endereço (onde o app mora, fora do Supabase). Respondeu? A internet está
//  boa e o problema é o servidor. Não respondeu? É a internet.
// =====================================================================

import { traduzErroAuth } from './erros';

/**
 * "Failed to fetch" (Chrome), "NetworkError…" (Firefox), "Load failed" (Safari).
 * ⚠️ AuthRetryableFetchError também: é o servidor respondendo 502/503/504
 * (projeto pausado ou acordando), e a mensagem dele é só "{}".
 */
export const ehFalhaDeRede = (erro) => erro?.name === 'AuthRetryableFetchError'
  || /network|fetch|load failed/i.test(String(erro?.message ?? erro ?? ''));

/** O que o login devolve quando o servidor não respondeu (ver AuthContext). */
export const FALHA_DE_REDE = 'Failed to fetch';

export const TEXTO_SEM_INTERNET = 'Este aparelho está sem internet. Confira o Wi-Fi ou os dados móveis e tente de novo.';
export const TEXTO_SERVIDOR_FORA = 'A internet deste aparelho está funcionando, mas o servidor do Aurum não respondeu. '
  + 'Tente de novo em alguns minutos. Se continuar, avise o suporte.';

/**
 * A internet chega até o endereço do app?
 *
 * ⚠️ O TESTE VAI À REDE DE VERDADE: `cache: 'no-store'` e um parâmetro novo a
 * cada vez. Sem isso o app instalado (service worker) responderia com a cópia
 * guardada e "provaria" uma internet que não existe.
 * ⚠️ PRAZO DE 5 s: Wi-Fi sem internet de verdade deixa a pergunta pendurada,
 * e a pessoa ficaria olhando "Entrando…" sem fim.
 */
export async function temInternet({
  buscar = globalThis.fetch,
  online = globalThis.navigator?.onLine,
  endereco = `${import.meta.env.BASE_URL}favicon.svg?conexao=${Date.now()}`,
  prazoMs = 5000,
} = {}) {
  if (online === false) return false;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), prazoMs);
  try {
    // qualquer resposta, até um 404, prova que a internet chegou
    await buscar(endereco, { method: 'HEAD', cache: 'no-store', signal: controle.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(relogio);
  }
}

/** A frase certa para a falha de rede: sem internet ou servidor fora do ar. */
export async function textoDaFalhaDeRede(opcoes) {
  return (await temInternet(opcoes)) ? TEXTO_SERVIDOR_FORA : TEXTO_SEM_INTERNET;
}

/** traduzErroAuth, mas a falha de rede vira a frase certa (internet ou servidor). */
export async function explicarErroAuth(erro, opcoes) {
  return ehFalhaDeRede(erro) ? textoDaFalhaDeRede(opcoes) : traduzErroAuth(erro);
}
