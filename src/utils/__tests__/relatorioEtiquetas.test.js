// =====================================================================
//  Testes do RELATÓRIO DE ETIQUETAS (M43) — período, comparação e somas
//
//  ⚠️ 10/09/2026 é uma QUINTA-FEIRA, e vários testes dependem disso: a
//  semana começa na segunda (07/09), então 1º a 10/09 são duas semanas —
//  01 a 06 (terça a domingo) e 07 a 10.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  periodoDoRelatorio, periodoAnterior, resumirRelatorio, variacao, somarDias,
  diasNoPeriodo, diaDaSemana, idDeImpressao, planilhaDoRelatorio, MAX_DIAS_RELATORIO,
} from '../relatorioEtiquetas';

const HOJE = '2026-09-10';
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('relatório de etiquetas — o período', () => {
  it('"este mês" vai do dia 1º até HOJE, não até o fim do mês', () => {
    expect(periodoDoRelatorio('mes', HOJE)).toEqual({ de: '2026-09-01', ate: '2026-09-10' });
  });

  it('"mês passado" é o mês anterior inteiro — inclusive virando o ano', () => {
    expect(periodoDoRelatorio('mesPassado', HOJE)).toEqual({ de: '2026-08-01', ate: '2026-08-31' });
    expect(periodoDoRelatorio('mesPassado', '2026-01-15')).toEqual({ de: '2025-12-01', ate: '2025-12-31' });
    expect(periodoDoRelatorio('mesPassado', '2026-03-05')).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
  });

  it('"últimos 30 dias" são 30 dias contando hoje', () => {
    const p = periodoDoRelatorio('30dias', HOJE);
    expect(p).toEqual({ de: '2026-08-12', ate: HOJE });
    expect(diasNoPeriodo(p.de, p.ate)).toBe(30);
  });

  it('datas escolhidas: invertidas trocam de lugar, futuro vira hoje, lixo vira hoje', () => {
    expect(periodoDoRelatorio('datas', HOJE, '2026-09-05', '2026-08-20')).toEqual({ de: '2026-08-20', ate: '2026-09-05' });
    expect(periodoDoRelatorio('datas', HOJE, '2026-09-01', '2026-12-31')).toEqual({ de: '2026-09-01', ate: HOJE });
    // ⚠️ as duas no futuro: a versão ingênua cortava só o fim e depois trocava,
    // devolvendo um período que terminava no futuro
    expect(periodoDoRelatorio('datas', HOJE, '2026-11-01', '2026-12-01')).toEqual({ de: HOJE, ate: HOJE });
    expect(periodoDoRelatorio('datas', HOJE, 'ontem', '')).toEqual({ de: HOJE, ate: HOJE });
  });

  it('datas escolhidas com mais de um ano são cortadas no teto', () => {
    const p = periodoDoRelatorio('datas', HOJE, '2020-01-01', HOJE);
    expect(p.ate).toBe(HOJE);
    expect(diasNoPeriodo(p.de, p.ate)).toBe(MAX_DIAS_RELATORIO);
  });
});

describe('relatório de etiquetas — com o que comparar', () => {
  it('1º até hoje compara com o MESMO TRECHO do mês anterior', () => {
    expect(periodoAnterior({ de: '2026-09-01', ate: '2026-09-10' })).toEqual({ de: '2026-08-01', ate: '2026-08-10' });
  });

  it('mês inteiro compara com o mês anterior INTEIRO, tenha ele 28, 30 ou 31 dias', () => {
    expect(periodoAnterior({ de: '2026-08-01', ate: '2026-08-31' })).toEqual({ de: '2026-07-01', ate: '2026-07-31' });
    // setembro tem 30 e agosto 31: o dia 31/08 não pode ficar de fora
    expect(periodoAnterior({ de: '2026-09-01', ate: '2026-09-30' })).toEqual({ de: '2026-08-01', ate: '2026-08-31' });
    expect(periodoAnterior({ de: '2026-03-01', ate: '2026-03-31' })).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(periodoAnterior({ de: '2026-01-01', ate: '2026-01-31' })).toEqual({ de: '2025-12-01', ate: '2025-12-31' });
  });

  it('trecho de mês maior que o mês anterior para no fim dele', () => {
    expect(periodoAnterior({ de: '2026-03-01', ate: '2026-03-30' })).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
  });

  it('qualquer outro período compara com os mesmos N dias logo antes', () => {
    expect(periodoAnterior({ de: '2026-08-12', ate: '2026-09-10' })).toEqual({ de: '2026-07-13', ate: '2026-08-11' });
    // começa no dia 1º mas atravessa meses: não é "mês", é trecho
    // (92 dias: 1º/03 a 31/05 são os 92 de antes)
    expect(periodoAnterior({ de: '2026-06-01', ate: '2026-08-31' })).toEqual({ de: '2026-03-01', ate: '2026-05-31' });
  });
});

describe('relatório de etiquetas — as somas', () => {
  const periodo = { de: '2026-09-01', ate: '2026-09-10' };
  const linhas = [
    { dia: '2026-09-01', item: 'Arroz', responsavel: 'Ana', reimpressao: false, etiquetas: 5, impressoes: 2 },
    { dia: '2026-09-01', item: 'ARROZ ', responsavel: 'ana', reimpressao: true, etiquetas: 1, impressoes: 1 },
    { dia: '2026-09-08', item: 'Feijão', responsavel: '', reimpressao: false, etiquetas: 7, impressoes: 1 },
    { dia: '2026-09-10', item: 'Frango  desfiado', responsavel: 'Bruno', reimpressao: false, etiquetas: '3', impressoes: '1' },
    // fora do período (vem junto porque a tela busca o anterior na mesma chamada)
    { dia: '2026-08-31', item: 'Arroz', responsavel: 'Ana', reimpressao: false, etiquetas: 100, impressoes: 1 },
  ];

  it('conta etiquetas de papel (com as cópias) e só as do período', () => {
    const r = resumirRelatorio(linhas, periodo);
    expect(r.total).toBe(16);
    expect(r.impressoes).toBe(5);
    expect(r.reimpressas).toBe(1);
  });

  it('todo dia do período aparece, inclusive os de zero', () => {
    const r = resumirRelatorio(linhas, periodo);
    expect(r.dias).toHaveLength(10);
    expect(r.dias[0]).toEqual({ dia: '2026-09-01', etiquetas: 6 });
    expect(r.dias[1]).toEqual({ dia: '2026-09-02', etiquetas: 0 });
    expect(r.mediaPorDia).toBeCloseTo(1.6);
  });

  it('semana de segunda a domingo, cortada nas pontas do período', () => {
    const r = resumirRelatorio(linhas, periodo);
    expect(r.semanas).toEqual([
      { de: '2026-09-01', ate: '2026-09-06', etiquetas: 6 },
      { de: '2026-09-07', ate: '2026-09-10', etiquetas: 10 },
    ]);
  });

  it('item igual com maiúscula ou espaço diferente vira UMA linha do ranking', () => {
    const r = resumirRelatorio(linhas, periodo);
    expect(r.porItem.map(i => [i.nome, i.etiquetas])).toEqual([
      ['Feijão', 7], ['Arroz', 6], ['Frango desfiado', 3],
    ]);
    expect(r.porResponsavel.map(i => [i.nome, i.etiquetas])).toEqual([
      ['Sem responsável', 7], ['Ana', 6], ['Bruno', 3],
    ]);
  });

  it('dia de pico é o de mais etiquetas; período vazio não tem pico', () => {
    expect(resumirRelatorio(linhas, periodo).pico).toEqual({ dia: '2026-09-08', etiquetas: 7 });
    const vazio = resumirRelatorio([], periodo);
    expect(vazio.pico).toBeNull();
    expect(vazio.total).toBe(0);
    expect(vazio.mediaPorDia).toBe(0);
  });

  it('a planilha tem as cinco abas, com as datas em dd/mm/aaaa', () => {
    const abas = planilhaDoRelatorio(resumirRelatorio(linhas, periodo), periodo);
    expect(abas.map(([nome]) => nome)).toEqual(['Resumo', 'Por dia', 'Por semana', 'Por item', 'Por responsável']);
    expect(abas[1][1][1]).toEqual(['01/09/2026', 'ter', 6]);
  });
});

describe('relatório de etiquetas — utilitários', () => {
  it('variação em %, e sem número inventado quando a base é zero', () => {
    expect(variacao(120, 100)).toBe(20);
    expect(variacao(80, 100)).toBe(-20);
    expect(variacao(0, 0)).toBe(0);
    expect(variacao(5, 0)).toBeNull();
  });

  it('dia da semana e soma de dias sem escorregar de fuso', () => {
    expect(diaDaSemana(HOJE)).toBe('qui');
    expect(diaDaSemana('2026-09-07')).toBe('seg');
    expect(somarDias('2026-02-28', 1)).toBe('2026-03-01');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('o id de cada impressão é um uuid e não se repete', () => {
    const ids = Array.from({ length: 300 }, () => idDeImpressao());
    expect(new Set(ids).size).toBe(300);
    ids.forEach(id => expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
  });
});

describe('relatório de etiquetas — as travas que não podem voltar atrás', () => {
  const sql = ler('../../lib/migration43_relatorio_etiquetas.sql');

  it('a tabela tem RLS e NENHUMA policy: só as funções chegam nela', () => {
    expect(sql).toMatch(/alter table etiquetas_impressoes enable row level security/);
    expect(sql).not.toMatch(/create policy[^;]*etiquetas_impressoes/i);
  });

  it('reenvio da fila não conta em dobro (id do aparelho + on conflict)', () => {
    expect(sql).toMatch(/id\s+uuid primary key/);
    expect(sql).toMatch(/on conflict \(id\) do nothing\s+returning copias/);
  });

  it('as duas funções saem de anon e entram só para authenticated', () => {
    expect(sql).toMatch(/revoke all on function registrar_impressoes\(jsonb\)\s+from public, anon/);
    expect(sql).toMatch(/revoke all on function relatorio_etiquetas\(date, date, uuid\)\s+from public, anon/);
    expect(sql).toMatch(/grant execute on function registrar_impressoes\(jsonb\)\s+to authenticated/);
  });

  it('o id de outro restaurante só vale para o super-admin', () => {
    expect(sql).toMatch(/if p_restaurante is not null and coalesce\(sou_super_admin\(\), false\) then/);
  });

  it('a impressão não chama mais o contador antigo — contaria cada etiqueta duas vezes', () => {
    const tela = ler('../../components/EtiquetaPrint.jsx');
    expect(tela).not.toMatch(/rpc\('contar_etiquetas_impressas'/);
    expect(tela).toMatch(/registrarImpressoes\(eventos\)/);
  });

  it('o que foi impresso sem internet sobe pela fila', () => {
    const ctx = ler('../../store/AppContext.jsx');
    expect(ctx).toMatch(/kind: 'impressao', op: 'rpc'/);
    expect(ctx).toMatch(/item\.kind === 'impressao' && item\.op === 'rpc'/);
  });
});
