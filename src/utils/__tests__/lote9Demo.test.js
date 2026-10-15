import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { linhasDeDemonstracao, linhasDasImpressas, resumirRelatorio } from '../relatorioEtiquetas';
import { valorDoEstoque } from '../financeiro';
import { PRECOS_DEMO, gerarDemoSeed } from '../../data/demo';

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// =====================================================================
//  LOTE 9 DA AUDITORIA (D9, 15/10/2026) — a demonstração como vitrine.
// =====================================================================

describe('relatório de etiquetas na demonstração', () => {
  const HOJE = '2026-10-15'; // quinta

  it('dias anteriores de exemplo, sempre os mesmos, sem domingo', () => {
    const a = linhasDeDemonstracao(HOJE, ['Picanha', 'Molho']);
    const b = linhasDeDemonstracao(HOJE, ['Picanha', 'Molho']);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(50);
    expect(a.every(l => l.dia < HOJE)).toBe(true);
    expect(a.some(l => l.dia === '2026-10-11')).toBe(false); // domingo
    const r = resumirRelatorio(a, { de: '2026-10-01', ate: '2026-10-14' });
    expect(r.total).toBeGreaterThan(0);
    expect(r.porResponsavel.map(x => x.nome).sort()).toEqual(['João', 'Maria']);
  });

  it('o que o visitante imprime hoje entra, contando as cópias', () => {
    const linhas = linhasDasImpressas([
      { impressoEm: HOJE, nome: 'Picanha', responsavel: 'Maria', copias: 3 },
      { impressoEm: HOJE, nome: 'Molho' },
      { nome: 'sem data' },
    ]);
    expect(linhas).toHaveLength(2);
    expect(resumirRelatorio(linhas, { de: HOJE, ate: HOJE }).total).toBe(4);
  });

  it('a tela usa as linhas do aparelho na demonstração, em vez de dizer que não existe', () => {
    const t = ler('../../pages/RelatorioEtiquetas.jsx');
    expect(t).not.toMatch(/e não existe na demonstração\. Numa conta/);
    expect(t).toMatch(/demo \? linhasDemo :/);
  });
});

describe('custos na demonstração', () => {
  it('os itens da demo têm preço, e o valor do estoque não sai zerado', () => {
    const { catalogos } = gerarDemoSeed('producao');
    for (const p of catalogos.produtos) expect(PRECOS_DEMO[p.id], p.id).toBeTruthy();
    const estoque = Object.fromEntries(catalogos.produtos.map(p => [p.id, 2]));
    const v = valorDoEstoque(catalogos.produtos, estoque, PRECOS_DEMO);
    expect(v.total).toBeGreaterThan(0);
    expect(v.semCusto).toEqual([]);
  });
});

describe('a faixa da demonstração não cobre o cabeçalho', () => {
  it('a faixa publica a altura e o cabeçalho gruda abaixo dela', () => {
    expect(ler('../../components/FaixaTopo.jsx')).toMatch(/setProperty\('--faixa-topo'/);
    expect(ler('../../components/Layout.jsx')).toMatch(/style=\{\{ top: 'var\(--faixa-topo, 0px\)' \}\}/);
    expect(ler('../../App.jsx')).not.toMatch(/sticky top-0 z-50/);
  });
});
