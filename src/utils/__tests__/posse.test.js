// =====================================================================
//  2ª ETAPA DA BAIXA PELA ETIQUETA — LOTE B (M61, 01/10/2026)
//  A embalagem na Finalização: posse, receber, conferir, a fila.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  conferenciaDe, comConferencia, embalagensNaCozinha, pendentesDeConferencia, ultimoFechamentoTs,
  decidirRecebimento, aplicarFilaNosRecebimentos, remessaConferida, remessaComUsadas, avisoAoApagarRemessa,
} from '../posse';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const P = (id, unidade = 'unid') => ({ id, nome: id, unidade, ativo: true });
const AGORA = Date.parse('2026-10-01T12:00:00Z');

// a remessa pelo QR, como o banco grava (M61)
const remessaQR = (id, etq, extra = {}) => ({
  id, ts: AGORA - 3600000, data: '2026-10-01', hora: '11:00', destino: 'finalizacao',
  itens: [{ produtoId: 'frango', quantidade: 2, validade: '2026-10-05', etiquetaId: etq, potes: 2 }],
  etiquetaId: etq, baixaId: `bx_${id}`, potes: 2, etiqueta: { nome: 'Frango', medida: '1 un' }, ...extra,
});

describe('a conferência é de cada Finalização (chave no documento estoques)', () => {
  it('liga, desliga e só vale para Finalização', () => {
    const ligado = comConferencia({ versao: 1, itens: [{ id: 'x' }] }, 'finalizacao', true, 123);
    expect(ligado.itens).toEqual([{ id: 'x' }]);                // não mexe nas cozinhas
    expect(conferenciaDe(ligado, 'finalizacao')).toEqual({ desde: 123 });
    expect(conferenciaDe(ligado, 'finalizacao#ab12')).toBeNull();
    expect(conferenciaDe(ligado, 'producao')).toBeNull();
    // ligar de novo não muda o "desde" (a lista a conferir não recomeça)
    expect(conferenciaDe(comConferencia(ligado, 'finalizacao', true, 999), 'finalizacao')).toEqual({ desde: 123 });
    expect(conferenciaDe(comConferencia(ligado, 'finalizacao', false), 'finalizacao')).toBeNull();
  });
});

describe('as embalagens que estão AQUI', () => {
  const produtos = [P('frango')];

  it('vêm das remessas pelo QR e das saídas à mão ligadas; usado e perda saem', () => {
    const recebimentos = [
      remessaQR('r1', 'k3f9x2ab', { usadas: { k3f9x2ab: 1 } }),
      { id: 'r2', ts: AGORA, destino: 'finalizacao', itens: [{ produtoId: 'frango', quantidade: 3 }],
        vinculos: [{ etiquetaId: 'aaaa1111', potes: 1, quantidade: 1, validade: '2026-10-07', produtoId: 'frango', nome: 'Frango', medida: '1 un' }] },
    ];
    const perdas = [{ etiquetaId: 'aaaa1111', potes: 1, origem: 'estoque', produtoId: 'frango', quantidade: 1 }];
    const lista = embalagensNaCozinha({ recebimentos, perdas, estoque: { frango: 10 }, produtos, cozinha: 'finalizacao' });
    expect(lista.map(e => [e.id, e.copias])).toEqual([['k3f9x2ab', 1]]);
    expect(lista[0]).toMatchObject({ naFinalizacao: true, cozinha: 'finalizacao', baixadas: 0, validade: '2026-10-05' });
  });

  it('o Fechar Turno limpa a lista: o saldo é o teto (ficam as que chegaram por último)', () => {
    const recebimentos = [
      { ...remessaQR('r1', 'velha001'), ts: AGORA - 7200000 },
      { ...remessaQR('r2', 'nova0001'), ts: AGORA - 600000 },
    ];
    // contaram 2 na sobra: cabem 2 embalagens de 1 un — as da remessa mais nova
    const lista = embalagensNaCozinha({ recebimentos, estoque: { frango: 2 }, produtos, cozinha: 'finalizacao' });
    expect(lista.map(e => [e.id, e.copias])).toEqual([['nova0001', 2]]);
    // saldo zerado: nada aqui
    expect(embalagensNaCozinha({ recebimentos, estoque: { frango: 0 }, produtos })).toEqual([]);
  });
});

describe('a lista "a conferir"', () => {
  it('só o que chegou depois de ligar, item a item; o de turno fechado vem marcado', () => {
    const recebimentos = [
      { id: 'antes', ts: 50, itens: [{ produtoId: 'a', quantidade: 1 }] },
      { id: 'r1', ts: 150, data: 'd', itens: [{ produtoId: 'a', quantidade: 2 }, { produtoId: 'b', quantidade: 1 }],
        conferida: { b: { em: 1, por: 'x' } } },
      { id: 'r2', ts: 300, itens: [{ produtoId: 'c', quantidade: 1, etiquetaId: 'e1', potes: 2 }], etiquetaId: 'e1', baixaId: 'bx' },
    ];
    const l = pendentesDeConferencia({ recebimentos, desde: 100, fechadoEm: 200 });
    expect(l.map(x => [x.registroId, x.produtoId, x.antiga, x.manual])).toEqual([['r2', 'c', false, false], ['r1', 'a', true, true]]);
    expect(l[0]).toMatchObject({ potes: 2, etiquetaIds: ['e1'] });
  });

  it('o último fechamento é o do Fechar Turno (itens[]), não o Inventário', () => {
    expect(ultimoFechamentoTs([{ ts: 10, itens: [{}] }, { ts: 99, produtoId: 'x' }, { ts: 40, itens: [{}] }])).toBe(40);
  });
});

describe('receber: o palpite (o banco confirma)', () => {
  const etqProd = { id: 'k3f9x2ab', cozinha: 'producao', produtoId: 'frango', copias: 3, baixadas: 0, status: 'valida' };

  it('veio pelo QR e ninguém conferiu → confere todas as embalagens dela', () => {
    expect(decidirRecebimento({ etq: etqProd, recebimentos: [remessaQR('r1', 'k3f9x2ab')] }))
      .toEqual({ caso: 'conferida', registros: ['r1'], potes: 2 });
  });

  it('a Produção lançou à mão (3 dias) e cabe → liga a embalagem; cheia → não liga', () => {
    const manual = { id: 'm1', ts: AGORA - 3600000, itens: [{ produtoId: 'frango', quantidade: 2 }] };
    expect(decidirRecebimento({ etq: etqProd, recebimentos: [manual], quantidade: 1, agora: AGORA }))
      .toEqual({ caso: 'vinculo', registroId: 'm1' });
    const cheia = { ...manual, vinculos: [{ produtoId: 'frango', quantidade: 2 }] };
    expect(decidirRecebimento({ etq: etqProd, recebimentos: [cheia], quantidade: 1, agora: AGORA }).caso).toBeNull();
    // etiqueta impressa DEPOIS do dia da saída não pode ter ido nela
    const deOntem = { ...manual, data: '2026-09-30' };
    expect(decidirRecebimento({ etq: { ...etqProd, impressoEm: '2026-10-01' }, recebimentos: [deOntem], quantidade: 1, agora: AGORA }).caso)
      .toBeNull();
    expect(decidirRecebimento({ etq: { ...etqProd, impressoEm: '2026-09-30' }, recebimentos: [deOntem], quantidade: 1, agora: AGORA }).caso)
      .toBe('vinculo');
    const velha = { ...manual, ts: AGORA - 4 * 86400000 };
    expect(decidirRecebimento({ etq: etqProd, recebimentos: [velha], quantidade: 1, agora: AGORA }).motivo).toBe('nao_saiu');
  });

  it('a Produção não lançou: entrada SÓ com a conferência ligada', () => {
    expect(decidirRecebimento({ etq: etqProd, recebimentos: [], ligada: true })).toEqual({ caso: 'entrada' });
    expect(decidirRecebimento({ etq: etqProd, recebimentos: [], ligada: false })).toEqual({ caso: null, motivo: 'nao_saiu' });
  });

  it('já saiu tudo, já está aqui, outra cozinha, avulsa', () => {
    expect(decidirRecebimento({ etq: { ...etqProd, baixadas: 3 }, ligada: true }).motivo).toBe('ja_saiu');
    expect(decidirRecebimento({ etq: { ...etqProd, naFinalizacao: true }, ligada: true }).motivo).toBe('ja_recebida');
    expect(decidirRecebimento({ etq: { ...etqProd, cozinha: 'seco' }, ligada: true }).motivo).toBe('outra_cozinha');
    expect(decidirRecebimento({ etq: { ...etqProd, produtoId: null }, ligada: true }).motivo).toBe('avulsa');
  });
});

describe('a fila sem internet continua na tela até subir', () => {
  const base = [remessaQR('r1', 'k3f9x2ab'), { id: 'm1', ts: 1, itens: [{ produtoId: 'frango', quantidade: 2 }] }];

  it('o "Receber" na fila reaplica conferência, vínculo e a entrada nova', () => {
    const entrada = { id: 'novo', ts: 9, itens: [] };
    const fila = [
      { kind: 'receberEtiqueta', payload: { local: { cozinha: 'finalizacao', caso: 'conferida', registros: ['r1'], produtoId: 'frango', quem: 'Ana' } } },
      { kind: 'receberEtiqueta', payload: { local: { cozinha: 'finalizacao', caso: 'vinculo', registroId: 'm1', produtoId: 'frango', baixaId: 'bx_1', vinculo: { etiquetaId: 'zz', baixaId: 'bx_1' } } } },
      { kind: 'receberEtiqueta', payload: { local: { cozinha: 'finalizacao', caso: 'entrada', registro: entrada } } },
      { kind: 'receberEtiqueta', _morto: true, payload: { local: { cozinha: 'finalizacao', caso: 'entrada', registro: { id: 'morto' } } } },
    ];
    const out = aplicarFilaNosRecebimentos(base, fila, 'finalizacao');
    expect(out.find(x => x.id === 'r1').conferida.frango.por).toBe('Ana');
    expect(out.find(x => x.id === 'm1').vinculos).toHaveLength(1);
    expect(out.map(x => x.id)).toContain('novo');
    expect(out.map(x => x.id)).not.toContain('morto');
    // aplicar duas vezes não duplica
    expect(aplicarFilaNosRecebimentos(out, fila, 'finalizacao').find(x => x.id === 'm1').vinculos).toHaveLength(1);
  });

  it('sem nada na fila devolve a MESMA lista (não regrava cache à toa); outra Finalização não mexe', () => {
    expect(aplicarFilaNosRecebimentos(base, [], 'finalizacao')).toBe(base);
    const fila = [{ kind: 'receberEtiqueta', payload: { local: { cozinha: 'finalizacao#ab12', caso: 'entrada', registro: { id: 'x' } } } }];
    expect(aplicarFilaNosRecebimentos(base, fila, 'finalizacao')).toBe(base);
  });
});

describe('apagar na Produção o que a Finalização já tocou: a tela avisa', () => {
  it('conferida, usada, ligada ou entrada pela Finalização', () => {
    const r = remessaQR('r1', 'k3f9x2ab');
    expect(avisoAoApagarRemessa(r)).toBe('');
    expect(avisoAoApagarRemessa(remessaConferida(r, 'frango', 'Ana'))).toMatch(/conferiu/);
    expect(avisoAoApagarRemessa(remessaComUsadas(r, 'k3f9x2ab', 1))).toMatch(/usou parte/);
    expect(avisoAoApagarRemessa({ ...r, recebidaPelaFinalizacao: true })).toMatch(/deu entrada/);
    expect(avisoAoApagarRemessa({ ...r, destino: 'salao', usadas: { x: 1 } })).toBe('');
  });
});

describe('o código: o banco decide, o aparelho só adivinha', () => {
  const app = ler('../../store/AppContext.jsx');
  const sql = ler('../../lib/migration61_embalagem_na_finalizacao.sql');

  it('a baixa da cozinha DONA vai para o estoque dela, mesmo pedida da Finalização', () => {
    expect(app).toMatch(/const cozinha = etq\.cozinha \|\| moduloRef\.current;/);
  });

  it('receber, baixar no destino e conferir têm fila própria, e "não está aqui" tenta de novo', () => {
    expect(app).toMatch(/kind: 'receberEtiqueta', op: 'rpc'/);
    expect(app).toMatch(/kind: 'baixaNoDestino', op: 'rpc'/);
    expect(app).toMatch(/kind: 'conferirRemessa', op: 'rpc'/);
    expect(app).toMatch(/\['nao_encontrada', 'nao_esta_aqui'\]\.includes\(data\.motivo\)\) naFila\(\)/);
  });

  it('a fila: a falha de uma etiqueta segura as ações seguintes dela; tipo desconhecido não some calado', () => {
    expect(app).toMatch(/if \(etiquetaDoItem\(item\) && etiquetasComFalha\.has\(etiquetaDoItem\(item\)\)\) continue;/);
    expect(app).toMatch(/else error = \{ message: `tipo desconhecido na fila: \$\{item\.kind\}\/\$\{item\.op\}` \};/);
  });

  it('os recebimentos do banco + o que está na fila (na abertura e no tempo real)', () => {
    expect((app.match(/aplicarFilaNosRecebimentos\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('M61: a assinatura antiga fica (sem sobrecarga), o gatilho lê o livro e cada lado devolve o seu', () => {
    expect(sql).toMatch(/create or replace function baixar_etiqueta\(p_baixa text, p_etiqueta text, p_acao text, p_potes integer,\s+p_registro_id text default null, p_dados jsonb default null,\s+p_ts bigint default null\)/);
    expect(sql).toMatch(/proname = 'baixar_etiqueta' and pronamespace = 'public'::regnamespace\) <> 1/);
    expect(sql).toMatch(/registro_id = new\.id or saida_vinculada = new\.id or remessa_id = new\.id/);
    expect(sql).toMatch(/-- baixa FEITA NA FINALIZAÇÃO: a embalagem volta a estar lá/);
    expect(sql).toMatch(/ndev := least\(b\.potes, _posse_no_destino\(p_rid, b\.etiqueta_id, b\.destino\)\);/);
    // a chave do dono é lida no banco antes de dar entrada
    expect(sql).toMatch(/d\.dados->'receberPeloQR'->p_cozinha/);
    // o aparelho não forja conferência nem vínculo pelo p_dados
    expect(sql).toMatch(/- 'etiqueta' - 'vinculos' - 'usadas' - 'conferida'/);
    // reconfere a idempotência DEPOIS da trava
    expect((sql.match(/select \* into b from etiqueta_baixas where id = p_baixa;/g) || []).length).toBeGreaterThanOrEqual(6);
  });

  it('a tela: Finalização com posse, receber, a conferir e a chave por Finalização', () => {
    const folha = ler('../../components/BaixaEtiqueta.jsx');
    expect(folha).toMatch(/const b = etq\.naFinalizacao \? baixarNoDestino\(pedido\) : baixarEtiqueta\(pedido\);/);
    expect(folha).toMatch(/function AindaNaProducao/);
    expect(ler('../../pages/FecharTurno.jsx')).toMatch(/<AConferir titulo="Antes de contar: a conferir"/);
    expect(ler('../../pages/Estoques.jsx')).toMatch(/Conferir pelo QR o que chega da Produção/);
    expect(ler('../../pages/Validades.jsx')).toMatch(/\[\.\.\.\(etiquetasImpressas \|\| \[\]\), \.\.\.\(embalagensAqui \|\| \[\]\)\]/);
  });
});
