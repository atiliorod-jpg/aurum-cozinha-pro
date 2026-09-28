// =====================================================================
//  OS LANÇAMENTOS GUARDADOS NO APARELHO (M53, 28/09/2026)
//
//  IndexedDB, não localStorage: o localStorage tem ~5 MB por endereço, e um
//  ano de lançamentos de uma cozinha passa disso. Um registro por conta:
//  { linhas, ate } — `ate` é a hora (do BANCO) da mudança mais nova que o
//  aparelho já tem.
//
//  ⚠️ TUDO AQUI PODE FALHAR em silêncio (aba privada, navegador antigo, cota):
//  quem chama trata `null` como "não tenho nada guardado" e baixa tudo, como
//  era antes. Guardar nunca pode atrapalhar a abertura.
//
//  ⚠️ O "SAIR" APAGA (apagarRegistrosLocais, chamado por limparCacheLocal): num
//  aparelho compartilhado, o próximo usuário não pode achar os lançamentos da
//  conta anterior aqui dentro.
// =====================================================================

const BANCO = 'aurum-local';
const LOJA = 'registros';

function abrir() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function comLoja(modo, fazer) {
  const db = await abrir();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LOJA, modo);
      const req = fazer(tx.objectStore(LOJA));
      tx.oncomplete = () => { resolve(req?.result ?? true); db.close(); };
      tx.onerror = () => { resolve(null); db.close(); };
      tx.onabort = () => { resolve(null); db.close(); };
    } catch { resolve(null); try { db.close(); } catch { /* já fechado */ } }
  });
}

/** { linhas, ate } desta conta, ou null. */
export async function lerRegistrosLocais(rid) {
  const v = await comLoja('readonly', (s) => s.get(rid));
  return v && Array.isArray(v.linhas) ? v : null;
}

export async function gravarRegistrosLocais(rid, linhas, ate) {
  return comLoja('readwrite', (s) => s.put({ linhas, ate, gravadoEm: Date.now() }, rid));
}

/** Apaga os lançamentos guardados de TODAS as contas deste aparelho. */
export async function apagarRegistrosLocais() {
  return comLoja('readwrite', (s) => s.clear());
}
