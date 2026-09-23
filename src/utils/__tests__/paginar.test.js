// =====================================================================
//  O limite de 1.000 linhas do Supabase (23/09/2026): a conta do Pro com mais
//  de 1.000 lançamentos recebia um pedaço deles, sem erro — e a cópia do
//  cliente feita antes de apagar a conta também saía cortada.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buscarTodas } from '../../lib/paginar';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

// um "banco" de mentira que, como o Supabase, nunca entrega mais de 1.000
function tabela(n, { falhaNaPagina = -1 } = {}) {
  const linhas = Array.from({ length: n }, (_, i) => ({ id: i }));
  let chamadas = 0;
  const montar = () => ({
    range: async (de, ate) => {
      const pagina = chamadas++;
      if (pagina === falhaNaPagina) return { data: null, error: { message: 'caiu a rede' } };
      return { data: linhas.slice(de, Math.min(ate + 1, de + 1000)), error: null };
    },
  });
  return { montar, chamadas: () => chamadas };
}

describe('buscar todas as linhas, em páginas', () => {
  it('2.500 linhas chegam inteiras (antes: 1.000)', async () => {
    const t = tabela(2500);
    const { data, error } = await buscarTodas(t.montar);
    expect(error).toBe(null);
    expect(data).toHaveLength(2500);
    expect(new Set(data.map(l => l.id)).size).toBe(2500);
    expect(t.chamadas()).toBe(3);
  });

  it('exatamente 1.000: uma página a mais, vazia, e para', async () => {
    const t = tabela(1000);
    const { data } = await buscarTodas(t.montar);
    expect(data).toHaveLength(1000);
    expect(t.chamadas()).toBe(2);
  });

  it('conta nova, sem nada: uma chamada só', async () => {
    const t = tabela(0);
    expect((await buscarTodas(t.montar)).data).toEqual([]);
    expect(t.chamadas()).toBe(1);
  });

  it('falhou no meio: é erro no todo — meia cópia não passa por inteira', async () => {
    const t = tabela(2500, { falhaNaPagina: 1 });
    const r = await buscarTodas(t.montar);
    expect(r.data).toBe(null);
    expect(r.error).toBeTruthy();
  });

  it('o app e a cópia do painel buscam em páginas, ordenadas por coluna única', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/\.order\('id'\)\.range\(de, de \+ TAMANHO_PAGINA - 1\)/);
    const adm = ler('../../pages/Admin.jsx');
    expect(adm).toMatch(/buscarTodas\(\(\) => supabase\.from\('registros'\)\.select\('\*'\)\.eq\('restaurante_id', r\.id\)\.order\('id'\)\)/);
    expect(adm).toMatch(/if \(docs\.error \|\| regs\.error\) throw docs\.error \|\| regs\.error;/);
  });
});
