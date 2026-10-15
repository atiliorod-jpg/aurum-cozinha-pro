import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// =====================================================================
//  LOTE 10 DA AUDITORIA, PARTE 1 (15/10/2026) — a primeira abertura mais leve.
//  O resto do lote (lançamentos só no IndexedDB, tempo real por Broadcast,
//  retenção das etiquetas) vai junto do Lote 8, depois da M61: precisa de
//  migração no banco e mexe na mesma camada de sincronização.
// =====================================================================

describe('o que não é a primeira tela carrega sob demanda', () => {
  const app = ler('../../App.jsx');

  it('nova senha, pagamento, novidades, termos, Meus itens e Impressas são lazy', () => {
    for (const nome of ['NovaSenha', 'Pagamento', 'Novidades', 'Termos', 'Itens', 'EtiquetasImpressas']) {
      expect(app.includes(`const ${nome} = lazy(() => import(`), nome).toBe(true);
      expect(app.split(/\r?\n/).some(l => l.startsWith(`import ${nome} from`)), nome).toBe(false);
    }
  });

  it('a tela de imprimir e o login continuam no pacote principal', () => {
    expect(app).toMatch(/^import Etiquetas from '\.\/pages\/Etiquetas';/m);
    expect(app).toMatch(/^import Login from '\.\/pages\/Login';/m);
  });

  it('as telas que abrem fora das rotas têm a própria espera (sem ela o React quebra)', () => {
    expect(app).toMatch(/<Suspense fallback=\{<Splash \/>\}><Termos \/><\/Suspense>/);
    expect(app).toMatch(/<Suspense fallback=\{<Splash \/>\}><NovaSenha \/><\/Suspense>/);
    const bloqueio = app.slice(app.indexOf('if (!plano.ok) {'), app.indexOf('// Primeiro acesso NESTE aparelho'));
    expect(bloqueio).toMatch(/<Suspense fallback=\{<Splash \/>\}>\s*<Routes>/);
  });
});
