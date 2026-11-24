// =====================================================================
//  AS PREFERÊNCIAS DA CONTA SOBEM POR CHAVE (23/11/2026, defeito relatado
//  pelo dono: "os dados do estabelecimento precisam ser colocados várias
//  vezes, principalmente quando o app fica offline")
//
//  `prefs` é UM documento para a conta inteira: o modelo da etiqueta, os
//  armazenamentos, os dados do estabelecimento, o suporte remoto... E era
//  gravado INTEIRO. Dois caminhos apagavam o que alguém tinha salvo:
//   1. SEM INTERNET, a cópia inteira do aparelho ia para a fila e, na volta,
//      subia por cima do servidor (versão -1). O que outro aparelho salvou
//      nesse meio-tempo sumia — e um aparelho com o cache vazio subia os
//      valores padrão por cima de tudo.
//   2. COM INTERNET, dois aparelhos gravando juntos: o segundo descartava a
//      própria mudança e pedia para refazer.
//
//  Agora cada mudança é um PATCH (só as chaves que mudaram). O que sobe é o
//  documento do SERVIDOR com os patches pendentes por cima, na ordem em que
//  foram feitos, e com a versão dele. Outro aparelho gravou antes? Pega o
//  documento novo e aplica os mesmos patches outra vez — nada se perde, e
//  uma chave que este aparelho não mexeu nunca é sobrescrita por ele.
//
//  ⚠️ Mora aqui, e não no AppContext, para ter teste sem navegador (o projeto
//  não tem jsdom): a parte que decide o que sobe é a parte que erra.
// =====================================================================

/** Item da fila com uma mudança de prefs (o formato novo). */
export const ehPatchDePrefs = (i) => !!i && i.kind === 'prefs' && i.op === 'mesclar'
  && !!i.payload && !!i.payload.patch && typeof i.payload.patch === 'object' && !Array.isArray(i.payload.patch);

/**
 * ⚠️ ITEM ANTIGO DA FILA (antes de 23/11/2026): o documento INTEIRO, como
 * `doc`. Vira um patch de todas as chaves dele — o que a pessoa mudou sem
 * internet continua subindo, mas a chave que ele NÃO tem (os dados do
 * estabelecimento salvos em outro aparelho, por exemplo) não é mais apagada.
 */
export const ehPrefsInteiroAntigo = (i) => !!i && i.kind === 'doc' && i.op === 'upsert'
  && i.payload?.chave === 'prefs' && !!i.payload.dados && typeof i.payload.dados === 'object'
  && !Array.isArray(i.payload.dados);

export const ehMudancaDePrefs = (i) => ehPatchDePrefs(i) || ehPrefsInteiroAntigo(i);

export function patchDoItem(i) {
  if (ehPatchDePrefs(i)) return i.payload.patch;
  if (ehPrefsInteiroAntigo(i)) return i.payload.dados;
  return null;
}

/** Os itens de prefs que ainda vão subir, na ordem da fila (morto não sobe). */
export const itensDePrefs = (fila) => (Array.isArray(fila) ? fila : [])
  .filter(i => !i._morto && ehMudancaDePrefs(i));

/** O documento com os patches por cima, na ordem: o mais novo ganha. */
export function aplicarPatches(doc, patches) {
  const base = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {};
  return (patches || []).reduce((d, p) => (p && typeof p === 'object' ? { ...d, ...p } : d), { ...base });
}

/**
 * Sobe os patches por cima do documento do servidor, com a versão dele.
 *
 * - `servidor`: `{ dados, versao }` do último documento visto, ou null quando
 *   este aparelho não sabe o que o servidor tem — aí LÊ antes (`ler`), em vez
 *   de subir às cegas.
 * - `padrao`: o documento de uma conta que ainda não tem nenhum.
 * - `salvar(dados, versao)`: o RPC `salvar_documento` → `{ data, error }`.
 *   Documento que ainda não existe é criado com qualquer versão; versão
 *   diferente da do servidor volta `conflito` com o documento dele.
 * - `ler()`: `{ data: { dados, versao } | null, error }`.
 *
 * Devolve `{ ok: true, dados, versao }` ou `{ ok: false, error }`.
 */
export async function subirPatches({ servidor, patches, padrao = {}, salvar, ler, tentativas = 4 }) {
  let srv = servidor;
  if (!srv) {
    const { data, error } = await ler();
    if (error) return { ok: false, error };
    srv = { dados: data?.dados ?? null, versao: data?.versao ?? 0 };
  }
  for (let vez = 0; vez < tentativas; vez++) {
    const dados = aplicarPatches(srv.dados ?? padrao, patches);
    const { data, error } = await salvar(dados, srv.versao ?? 0);
    if (error) return { ok: false, error };
    if (data?.ok) return { ok: true, dados, versao: data.versao };
    if (!data?.conflito) return { ok: false, error: { message: 'O servidor respondeu de um jeito inesperado.' } };
    // outro aparelho gravou antes: os mesmos patches, por cima do que ele gravou
    srv = { dados: data.dados ?? null, versao: data.versao ?? 0 };
  }
  return { ok: false, error: { message: 'Outros aparelhos gravaram ao mesmo tempo. Tenta de novo sozinho.' } };
}
