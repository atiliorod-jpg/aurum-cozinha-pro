// =====================================================================
//  SÓ O QUE MUDOU (M53, 28/09/2026) — o aparelho guarda os lançamentos e
//  pede ao banco só o que mudou desde a última vez.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { juntarDelta, pedirDesde, horaMaisNova, FOLGA_MS } from '../registrosDelta';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const R = 'r1';
const l = (id, h, extra = {}) => ({ id, restaurante_id: R, tipo: 'entrada', dados: {}, deleted: false, atualizado_em: h, ...extra });

describe('as contas', () => {
  it('juntar: o que chegou substitui pelo id, o apagado sai, o novo entra', () => {
    const guardadas = [l('a', '2026-09-28T10:00:00Z'), l('b', '2026-09-28T10:01:00Z'), l('c', '2026-09-28T10:02:00Z')];
    const chegaram = [
      l('b', '2026-09-28T11:00:00Z', { dados: { quantidade: 5 } }), // corrigido
      l('c', '2026-09-28T11:01:00Z', { deleted: true }),            // apagado
      l('d', '2026-09-28T11:02:00Z'),                               // novo
      l('b', '2026-09-28T11:00:00Z', { dados: { quantidade: 5 } }), // repetido pela folga
    ];
    const r = juntarDelta(guardadas, chegaram, R);
    expect(r.map(x => x.id).sort()).toEqual(['a', 'b', 'd']);
    expect(r.find(x => x.id === 'b').dados.quantidade).toBe(5);
  });

  it('juntar: linha de outra conta nunca entra', () => {
    const r = juntarDelta([l('a', 'x')], [{ ...l('z', 'x'), restaurante_id: 'outra' }], R);
    expect(r.map(x => x.id)).toEqual(['a']);
  });

  it('a hora mais nova vem das linhas (hora do banco), e a folga pede 10 minutos para trás', () => {
    expect(horaMaisNova([l('a', '2026-09-28T10:00:00Z'), l('b', '2026-09-28T12:00:00Z')])).toBe('2026-09-28T12:00:00Z');
    expect(horaMaisNova([], '2026-09-28T09:00:00Z')).toBe('2026-09-28T09:00:00Z');
    expect(horaMaisNova([l('a', '2026-09-28T08:00:00Z')], '2026-09-28T09:00:00Z')).toBe('2026-09-28T09:00:00Z');
    expect(horaMaisNova([])).toBeNull();
    expect(FOLGA_MS).toBe(600000);
    expect(pedirDesde('2026-09-28T12:00:00.000Z')).toBe('2026-09-28T11:50:00.000Z');
    expect(pedirDesde(null)).toBeNull();
    expect(pedirDesde('lixo')).toBeNull();
  });
});

describe('ligado no app', () => {
  const app = ler('../../store/AppContext.jsx');

  it('com o guardado, pede só o que mudou (apagadas inclusive); sem ele, ou se falhar, baixa tudo', () => {
    expect(app).toMatch(/const guardadas = guardaLocalRef\.current \? await lerRegistrosLocais\(rid\) : null;/);
    expect(app).toMatch(/const juntas = juntarDelta\(guardadas\.linhas, mudaram, rid\);/);
    // conferência: o número de lançamentos vivos do banco tem de bater, senão baixa tudo
    expect(app).toMatch(/\.select\('id', \{ count: 'exact', head: true \}\)\.eq\('restaurante_id', rid\)\.eq\('deleted', false\);/);
    expect(app).toMatch(/if \(!eCount && count === juntas\.length\) \{/);
    expect(app).toMatch(/if \(!regs\) \{/);
  });

  it('a leitura completa pagina pela CHAVE: linha que some no meio não faz outra ser pulada', async () => {
    const { buscarTodasPorId } = await import('../../lib/paginar');
    // banco falso: 7 linhas vivas; depois da 1ª página, 'c' é apagada
    let vivas = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    let paginas = 0;
    const montar = () => {
      const f = { gt: null, lim: 0 };
      const q = {
        gt: (_c, v) => { f.gt = v; return q; },
        order: () => q,
        limit: (n) => { f.lim = n; return q; },
        then: (ok) => {
          paginas += 1;
          const data = vivas.filter(id => f.gt === null || id > f.gt).slice(0, f.lim).map(id => ({ id }));
          if (paginas === 1) vivas = vivas.filter(id => id !== 'c');
          return Promise.resolve({ data, error: null }).then(ok);
        },
      };
      return q;
    };
    const { data } = await buscarTodasPorId(montar, 3);
    // a..c na 1ª página; depois d, e, f, g — nenhuma pulada
    expect(data.map(x => x.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('o suporte da Aurum não guarda os lançamentos do cliente, e o "Sair" apaga o que ficou', () => {
    expect(app).toMatch(/const guardaLocalRef = useRef\(!impersonando\);/);
    const cache = ler('../../lib/cache.js');
    expect(cache).toMatch(/apagarRegistrosLocais\(\)\.catch/);
  });

  it('o banco carimba a hora da mudança (não o aparelho) e tem o índice da consulta', () => {
    const sql = ler('../../lib/migration53_registros_so_o_que_mudou.sql');
    expect(sql).toMatch(/new\.atualizado_em := clock_timestamp\(\);/);
    expect(sql).toMatch(/before insert or update on registros/);
    expect(sql).toMatch(/create index if not exists idx_registros_rest_atualizado on registros \(restaurante_id, atualizado_em, id\);/);
  });
});
