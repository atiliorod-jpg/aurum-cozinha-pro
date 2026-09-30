// =====================================================================
//  LOTE C — LEVEZA (28/09/2026)
// =====================================================================

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const app = ler('../../store/AppContext.jsx');

describe('menos idas ao banco', () => {
  it('painel: uma consulta para os usuários de todos os clientes (sem N+1)', () => {
    const adm = ler('../../pages/Admin.jsx');
    expect(adm).toMatch(/await buscarTodas\(\(\) => supabase\.rpc\('usuarios_de_todos_restaurantes'\)\)/);
    expect(ler('../../lib/migration57_leveza.sql')).toMatch(/order by p\.restaurante_id, p\.cargo, p\.nome, p\.id;/);
  });

  it('etiquetas: só o que mudou, com a conferência pelo número de linhas da janela', () => {
    expect(app).toMatch(/const chaveEtq = `etq:\$\{rid\}:\$\{moduloEfetivo\}`;/);
    expect(app).toMatch(/\.gte\('atualizado_em', desdeEtq\)/);
    expect(app).toMatch(/if \(!eCount && count === juntas\.length\) \{\s*linhasEtq = juntas;/);
    expect(app).toMatch(/buscarTodasPorId\(\(\) => daJanela\(supabase\.from\('etiquetas'\)\.select\(COLS_ETQ\)\)\)/);
    expect(ler('../../lib/migration57_leveza.sql')).toMatch(/before insert or update on etiquetas/);
  });

  it('o documento antigo de impressas não vem mais em toda abertura', () => {
    expect(app).toMatch(/\.select\('chave, dados, versao'\)\s*\.eq\('restaurante_id', rid\)\.not\('chave', 'like', '%etiquetasImpressas'\)/);
    expect(app).toMatch(/leg\.updated_at !== cacheGet\(rid, `_legado::\$\{chaveLegado\}`, null\)/);
  });
});

describe('o aparelho fica em dia', () => {
  it('acordou depois de 2 minutos, ou a internet voltou: refaz a leitura', () => {
    expect(app).toMatch(/Date\.now\(\) - escondidoEm > 2 \* 60 \* 1000\) setRodadaSync\(n => n \+ 1\)/);
    expect(app).toMatch(/window\.addEventListener\('online', aoVoltarRede\)/);
    expect(app).toMatch(/baseCatalogo, rodadaSync, acompanharBrutos\]\);/);
  });

  it('relatórios, financeiro e balanço veem o que foi lançado depois da abertura', () => {
    expect((app.match(/acompanharBrutos\(/g) || []).length).toBeGreaterThanOrEqual(5);
    expect(app).toMatch(/acompanharBrutos\(row\); \/\/ os relatórios veem o que outro aparelho lançou/);
  });
});

describe('memória do aparelho cheia', () => {
  afterEach(() => { delete globalThis.localStorage; delete globalThis.window; });

  it('a fila apaga os caches que se refazem e tenta de novo; se ainda falhar, avisa a tela', async () => {
    const store = { 'pe::r1::entradas': 'x'.repeat(50), 'pe::r1::_prefs_device': '{}', 'pe::r2::entradas': 'y' };
    let cheio = true;
    globalThis.localStorage = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { if (cheio && k.endsWith('_outbox')) throw new Error('QuotaExceededError'); store[k] = v; },
      removeItem: (k) => { delete store[k]; cheio = false; },
      key: () => null,
    };
    // Object.keys(localStorage) precisa ver as chaves
    globalThis.localStorage = new Proxy(globalThis.localStorage, {
      ownKeys: () => Object.keys(store),
      getOwnPropertyDescriptor: (_t, k) => (k in store ? { enumerable: true, configurable: true, value: store[k] } : undefined),
    });
    const eventos = [];
    globalThis.window = { dispatchEvent: (e) => { eventos.push(e.type); return true; } };
    const { outboxSet } = await import('../../lib/cache');
    const ok = outboxSet('r1', [{ kind: 'registro' }]);
    expect(ok).toBe(true);
    expect(store['pe::r1::entradas']).toBeUndefined();     // refazível: saiu
    expect(store['pe::r1::_prefs_device']).toBe('{}');     // do aparelho: fica
    expect(store['pe::r2::entradas']).toBe('y');           // outra conta: fica
    expect(JSON.parse(store['pe::r1::_outbox'])).toHaveLength(1);
    expect(eventos).not.toContain('fila-cheia');
    expect(ler('../../store/UIContext.jsx')).toMatch(/window\.addEventListener\('fila-cheia', cheia\)/);
  });
});

describe('telas e instalação mais leves', () => {
  it('Impressas mostra 7 dias e abre mais; a busca espera parar de digitar', () => {
    const tela = ler('../../pages/etiquetas/Impressas.jsx');
    expect(tela).toMatch(/useState\(7\)/);
    expect(tela).toMatch(/dias\.slice\(0, diasVisiveis\)/);
    expect(tela).toMatch(/const buscaAdiada = useDeferredValue\(busca\);/);
  });

  it('o app instalado não baixa a planilha, o painel da Aurum nem o leitor de QR do iPhone', () => {
    const cfg = ler('../../../vite.config.js');
    expect(cfg).toMatch(/globIgnores: \['\*\*\/xlsx-\*\.js', '\*\*\/Admin-\*\.js', '\*\*\/jsQR-\*\.js', 'icon-\*\.png'\]/);
    expect(cfg).toMatch(/handler: 'CacheFirst'/);
  });
});
