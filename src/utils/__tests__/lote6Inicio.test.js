import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { temRecurso } from '../modulos';

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// =====================================================================
//  LOTE 6 DA AUDITORIA (15/10/2026) — o Início de cada cozinha e o D5.
// =====================================================================

describe('D5 — a Finalização não usa as metas da Produção', () => {
  it('só Produção e Seco têm metas de estoque', () => {
    expect(temRecurso('producao', 'metasDeEstoque')).toBe(true);
    expect(temRecurso('seco', 'metasDeEstoque')).toBe(true);
    expect(temRecurso('finalizacao', 'metasDeEstoque')).toBe(false);
    // as instâncias seguem o tipo
    expect(temRecurso('finalizacao#abc123', 'metasDeEstoque')).toBe(false);
  });

  it('o mínimo/máximo automático não roda na Finalização (regravava as metas da Produção)', () => {
    const ctx = ler('../../store/AppContext.jsx');
    const bloco = ctx.slice(ctx.indexOf('// Modo automático mín/máx'), ctx.indexOf('// ── O APARELHO ACORDOU'));
    expect(bloco).toMatch(/if \(!temRecurso\(moduloEfetivo, 'metasDeEstoque'\)\) return;/);
    expect(bloco).toMatch(/setProdutos, moduloEfetivo\]\);/);
  });

  it('a bolinha "abaixo do mínimo" da barra some onde não há metas', () => {
    expect(ler('../../components/NavBar.jsx')).toMatch(/const alertas = soEtiquetas \|\| !comMetas \? 0 :/);
  });
});

describe('o Início com o urgente; o estoque completo numa tela própria', () => {
  const inicio = ler('../../pages/Dashboard.jsx');

  it('o Início não lista mais o estoque inteiro, e leva à tela Estoque', () => {
    expect(inicio).not.toMatch(/<Filtros /);
    expect(inicio).toMatch(/<Link to="\/estoque"/);
    expect(ler('../../App.jsx')).toMatch(/<Route path="\/estoque" element=\{<Estoque \/>\} \/>/);
  });

  it('a calculadora foi para a Produção', () => {
    expect(inicio).not.toMatch(/CalculadoraProducao/);
    expect(ler('../../pages/Producao.jsx')).toMatch(/<CalculadoraProducao \/>/);
  });

  it('a Finalização tem o fechar turno à mão; o Estoque dela não mostra selo nem mínimo', () => {
    expect(inicio).toMatch(/temRecurso\(modulo, 'fecharTurno'\) && \(\s*<Link to="\/fechar-turno"/);
    const est = ler('../../pages/Estoque.jsx');
    expect(est).toMatch(/\{comMetas \? <Selo status=\{status\} \/> :/);
    expect(est).toMatch(/\{comMetas && \(p\.min > 0 \|\| p\.max > 0\) && \(/);
  });
});
