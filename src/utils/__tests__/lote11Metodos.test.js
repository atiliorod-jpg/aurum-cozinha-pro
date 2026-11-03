import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizarMetodo, metodosDoProduto, textoDoPrazo, prazoCurto, espelhoDosMetodos, validadeDoPrazo,
  metodoInicial, metodosRepetidos, novoIdDeMetodo, listarEstados, idDoEstado, ESTADOS_PADRAO,
  aplicarPrazosDaPlanilha, rotuloDoMetodo, prazoComHoras,
} from '../metodos';
import {
  montarCamposEtiqueta, prazoInicialDaEtiqueta, usandoSugestaoDeAbertura, lembrarArmazenamentos,
  statusEtiqueta, limitarAte,
} from '../etiquetas';
import { temAlgumPrazo, ARMAZENAMENTOS_PADRAO } from '../armazenamento';
import { mesclarItens } from '../planilhaItens';

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// =====================================================================
//  LOTE 11, PARTE 1 (02/11/2026) — métodos de conservação, vistos no Suflex:
//  vários por item (armazenamento + estado), prazo em dias, horas e minutos,
//  horário na etiqueta por método e a prévia dentro da ficha.
// =====================================================================

describe('os métodos do item', () => {
  it('item antigo ganha um método por prazo preenchido, o padrão primeiro', () => {
    const p = { armazenamentoPadrao: 'refrigerado', valCongelado: 90, prazos: { refrigerado: 3, ambiente: 0 } };
    expect(metodosDoProduto(p).map(m => [m.id, m.armazenamento, m.dias])).toEqual([
      ['refrigerado', 'refrigerado', 3], ['congelado', 'congelado', 90],
    ]);
  });

  it('item com a lista nova usa a lista, com os números no lugar', () => {
    const p = { prazos: { resfriado: 9 }, metodos: [{ id: 'm1', armazenamento: 'resfriado', estado: 'pista_quente', horas: '2', dias: '' }] };
    expect(metodosDoProduto(p)).toEqual([
      { id: 'm1', armazenamento: 'resfriado', estado: 'pista_quente', dias: 0, horas: 2, minutos: 0, mostrarHora: true },
    ]);
  });

  it('horas e minutos têm teto; texto e número negativo viram zero', () => {
    expect(normalizarMetodo({ armazenamento: 'x', dias: '-3', horas: 30, minutos: '75' }))
      .toMatchObject({ dias: 0, horas: 23, minutos: 59 });
  });

  it('o prazo escrito por extenso e curto', () => {
    expect(textoDoPrazo({ dias: 3 })).toBe('3 dias');
    expect(textoDoPrazo({ dias: 1, horas: 6 })).toBe('1 dia e 6 h');
    expect(textoDoPrazo({ dias: 1, horas: 6, minutos: 30 })).toBe('1 dia, 6 h e 30 min');
    expect(textoDoPrazo({})).toBe('');
    expect(prazoCurto({ dias: 1, horas: 6 })).toBe('1d 6h');
    expect(prazoCurto({ minutos: 45 })).toBe('45min');
  });

  it('o rótulo junta o armazenamento e o estado da casa', () => {
    expect(rotuloDoMetodo({ armazenamento: 'resfriado', estado: 'pista_fria' }, ARMAZENAMENTOS_PADRAO, ESTADOS_PADRAO))
      .toBe('Resfriado · Pista fria');
    expect(rotuloDoMetodo({ armazenamento: 'resfriado', estado: 'apagado' }, ARMAZENAMENTOS_PADRAO, ESTADOS_PADRAO))
      .toBe('Resfriado');
  });

  it('o mesmo armazenamento com o mesmo estado é repetido; com estado diferente não', () => {
    const ms = [{ armazenamento: 'resfriado' }, { armazenamento: 'resfriado', estado: 'pista_fria' }, { armazenamento: 'resfriado', estado: '' }];
    expect([...metodosRepetidos(ms)]).toEqual(['resfriado|']);
    expect(metodosRepetidos(ms.slice(0, 2)).size).toBe(0);
  });

  it('id novo não colide', () => {
    expect(novoIdDeMetodo([{ id: 'm2' }])).toBe('m3');
    expect(novoIdDeMetodo([{ id: 'congelado' }, { id: 'm2' }])).toBe('m3');
  });

  it('prazo só em horas conta como prazo (o aviso de "sem prazo" não acende)', () => {
    expect(temAlgumPrazo({ prazos: { resfriado: 0 }, metodos: [{ armazenamento: 'resfriado', horas: 2 }] })).toBe(true);
    expect(temAlgumPrazo({ prazos: { resfriado: 3 }, metodos: [{ armazenamento: 'resfriado' }] })).toBe(false);
    expect(temAlgumPrazo({ valCongelado: 30 })).toBe(true);
  });
});

describe('o formato antigo continua gravado (estoque e aparelho desatualizado)', () => {
  it('vale o método SEM estado de cada armazenamento', () => {
    expect(espelhoDosMetodos([
      { armazenamento: 'resfriado', estado: 'pista_fria', dias: 7 },
      { armazenamento: 'resfriado', dias: 3 },
      { armazenamento: 'congelado', dias: 30 },
    ])).toEqual({ resfriado: 3, congelado: 30 });
  });

  it('sem método sem estado, vale o primeiro', () => {
    expect(espelhoDosMetodos([
      { armazenamento: 'resfriado', estado: 'pista_fria', dias: 7 },
      { armazenamento: 'resfriado', estado: 'pista_quente', dias: 1 },
    ])).toEqual({ resfriado: 7 });
  });

  it('⚠️ prazo só em horas vira ZERO, nunca um dia inteiro a mais', () => {
    expect(espelhoDosMetodos([{ armazenamento: 'resfriado', horas: 2 }])).toEqual({ resfriado: 0 });
  });
});

describe('a validade com horas', () => {
  it('só dias: a conta de sempre, e a validade repete a hora da manipulação', () => {
    expect(validadeDoPrazo('2026-11-02', '14:30', { dias: 3 })).toEqual({ validade: '2026-11-05', validadeHora: '14:30' });
  });
  it('horas somam de verdade', () => {
    expect(validadeDoPrazo('2026-11-02', '14:30', { horas: 2 })).toEqual({ validade: '2026-11-02', validadeHora: '16:30' });
    expect(validadeDoPrazo('2026-11-02', '14:30', { dias: 1, horas: 6, minutos: 45 })).toEqual({ validade: '2026-11-03', validadeHora: '21:15' });
  });
  it('passa da meia-noite e vira o dia (e o mês)', () => {
    expect(validadeDoPrazo('2026-10-31', '23:00', { horas: 2 })).toEqual({ validade: '2026-11-01', validadeHora: '01:00' });
  });
  it('sem prazo, sem validade', () => {
    expect(validadeDoPrazo('2026-11-02', '14:30', {})).toEqual({ validade: null, validadeHora: '' });
  });
});

describe('o que sai impresso', () => {
  const base = { nome: 'Molho', dataFabricacao: '2026-11-02', hora: '14:30', armazenamento: 'resfriado', armazenamentoNome: 'Resfriado' };

  it('o estado entra na linha do armazenamento', () => {
    expect(montarCamposEtiqueta({ ...base, estadoNome: 'Pista fria', diasValidade: 7 }).armazenamentoLabel)
      .toBe('RESFRIADO · PISTA FRIA');
  });

  it('prazo em horas: a validade é a hora certa', () => {
    const c = montarCamposEtiqueta({ ...base, horasValidade: 2 });
    expect(c.validadeFmt).toBe('02/11/2026 - 16:30');
    expect(c.dataFabricacaoFmt).toBe('02/11/2026 - 14:30');
    expect(c.validadeHora).toBe('16:30');
  });

  it('só dias, como hoje: a validade repete a hora', () => {
    const c = montarCamposEtiqueta({ ...base, diasValidade: 3 });
    expect(c.validadeFmt).toBe('05/11/2026 - 14:30');
    expect(c.mostrarHora).toBe(true);
  });

  it('com a chave desligada, as datas saem sem hora', () => {
    const c = montarCamposEtiqueta({ ...base, diasValidade: 3, mostrarHora: false });
    expect(c.validadeFmt).toBe('05/11/2026');
    expect(c.dataFabricacaoFmt).toBe('02/11/2026');
    expect(c.mostrarHora).toBe(false);
  });

  it('⚠️ prazo em horas mostra a hora mesmo com a chave desligada', () => {
    expect(montarCamposEtiqueta({ ...base, horasValidade: 2, mostrarHora: false }).validadeFmt).toBe('02/11/2026 - 16:30');
  });

  it('reimpressão: a validade pronta com a hora DELA', () => {
    const c = montarCamposEtiqueta({ ...base, validade: '2026-11-02', validadeHora: '16:30' });
    expect(c.validadeFmt).toBe('02/11/2026 - 16:30');
  });

  it('a chamada antiga (sem nada novo) sai igual a antes', () => {
    const c = montarCamposEtiqueta({ ...base, diasValidade: 3 });
    expect(c.armazenamentoLabel).toBe('RESFRIADO');
    expect(c.validade).toBe('2026-11-05');
  });
});

describe('a janela de impressão abre no método certo', () => {
  const metodos = [
    { id: 'resfriado', armazenamento: 'resfriado', estado: '', dias: 3, horas: 0, minutos: 0 },
    { id: 'm2', armazenamento: 'resfriado', estado: 'pista_quente', dias: 0, horas: 2, minutos: 0 },
    { id: 'm3', armazenamento: 'congelado', estado: '', dias: 30, horas: 0, minutos: 0 },
  ];
  const ligados = ARMAZENAMENTOS_PADRAO;
  const p = { id: 'molho', armazenamentoPadrao: 'congelado' };

  it('pela memória do aparelho (id do método)', () => {
    expect(metodoInicial(p, { molho: 'm2' }, ligados, metodos).id).toBe('m2');
  });
  it('memória antiga, com o id do armazenamento, ainda serve', () => {
    expect(metodoInicial(p, { molho: 'resfriado' }, ligados, metodos).id).toBe('resfriado');
  });
  it('sem memória, o padrão do cadastro', () => {
    expect(metodoInicial(p, {}, ligados, metodos).id).toBe('m3');
  });
  it('⚠️ padrão ligado sem método abre no padrão, sem método (Estoque Seco)', () => {
    const seco = { id: 'extrato', armazenamentoPadrao: 'ambiente', valCongelado: 540 };
    expect(metodoInicial(seco, {}, ligados, metodosDoProduto(seco))).toBe(null);
  });
  it('método num armazenamento desligado não abre', () => {
    const soCongelado = ligados.filter(a => a.id === 'congelado');
    expect(metodoInicial(p, { molho: 'm2' }, soCongelado, metodos).id).toBe('m3');
    expect(metodoInicial(p, {}, [], metodos)).toBe(null);
  });

  it('⚠️ o prazo inicial é o do MÉTODO, não o `prazos` do armazenamento', () => {
    const item = { tipoData: 'fabricacao', prazos: { resfriado: 3 }, armazenamento: 'resfriado', metodos, metodoId: 'm2' };
    expect(prazoInicialDaEtiqueta(item)).toEqual({ dias: 0, horas: 2, minutos: 0 });
  });
  it('item aberto com prazo só em horas não ganha a sugestão de 3 dias', () => {
    const item = { tipoData: 'abertura', metodos, metodoId: 'm2' };
    expect(prazoInicialDaEtiqueta(item).dias).toBe(0);
    expect(usandoSugestaoDeAbertura(item, '3')).toBe(false);
  });
  it('item aberto num método sem prazo ganha a sugestão', () => {
    const item = { tipoData: 'abertura', metodos: [{ id: 'x', armazenamento: 'resfriado', dias: 0, horas: 0, minutos: 0 }], metodoId: 'x' };
    expect(prazoInicialDaEtiqueta(item)).toEqual({ dias: 3, horas: 0, minutos: 0 });
    expect(usandoSugestaoDeAbertura(item, '3')).toBe(true);
  });
  it('sem método, a regra antiga', () => {
    expect(prazoInicialDaEtiqueta({ prazos: { resfriado: 5 }, armazenamento: 'resfriado' })).toEqual({ dias: 5, horas: 0, minutos: 0 });
  });

  it('a memória guarda o método (e o armazenamento quando não há método)', () => {
    expect(lembrarArmazenamentos({}, [
      { produtoId: 'molho', armazenamento: 'resfriado', metodoId: 'm2' },
      { produtoId: 'azeite', armazenamento: 'ambiente', metodoId: null },
    ])).toEqual({ molho: 'm2', azeite: 'ambiente' });
  });

  it('horas e minutos com teto no campo', () => {
    expect(limitarAte('30', 23)).toBe('23');
    expect(limitarAte('-1', 59)).toBe('0');
    expect(limitarAte('', 59)).toBe('');
  });
});

describe('a etiqueta de prazo em horas vence na hora dela', () => {
  const etq = { validade: '2026-11-02', validadeHora: '16:30', status: 'valida' };
  it('antes da hora, válida; depois, vencida', () => {
    expect(statusEtiqueta(etq, '2026-11-02', '16:00')).toBe('valida');
    expect(statusEtiqueta(etq, '2026-11-02', '16:30')).toBe('vencida');
  });
  it('a de prazo em dias continua vencendo na virada do dia', () => {
    expect(statusEtiqueta({ validade: '2026-11-02', status: 'valida' }, '2026-11-02', '23:59')).toBe('valida');
  });
});

describe('os estados da casa', () => {
  it('sem nada salvo, os três de partida; lista vazia salva vale', () => {
    expect(listarEstados({}).map(e => e.nome)).toEqual(['Pista fria', 'Pista quente', 'Descongelando']);
    expect(listarEstados({ estadosConservacao: [] })).toEqual([]);
    expect(listarEstados({ estadosConservacao: [{ id: 'x', nome: '' }] })).toEqual([]);
  });
  it('o id vem do nome, sem acento', () => {
    expect(idDoEstado('Pista Fria')).toBe('pista_fria');
    expect(idDoEstado('Exposição')).toBe('exposicao');
  });
});

describe('a planilha de itens mexe nos métodos', () => {
  const metodos = [
    { id: 'm1', armazenamento: 'resfriado', estado: '', dias: 3 },
    { id: 'm2', armazenamento: 'resfriado', estado: 'pista_quente', horas: 2 },
  ];
  it('número igual ao baixado: nada muda', () => {
    expect(aplicarPrazosDaPlanilha(metodos, { resfriado: 3, congelado: 0 }).map(m => [m.id, m.dias, m.horas]))
      .toEqual([['m1', 3, 0], ['m2', 0, 2]]);
  });
  it('número diferente vai para o método sem estado; armazenamento novo ganha método', () => {
    const r = aplicarPrazosDaPlanilha(metodos, { resfriado: 5, congelado: 60 });
    expect(r.map(m => [m.armazenamento, m.estado, m.dias, m.horas])).toEqual([
      ['resfriado', '', 5, 0], ['resfriado', 'pista_quente', 0, 2], ['congelado', '', 60, 0],
    ]);
  });
  it('⚠️ mesclarItens: o item com métodos recebe o prazo novo (a etiqueta lê os métodos)', () => {
    const produtos = [{ id: 'molho', nome: 'Molho', prazos: { resfriado: 3 }, valResfriado: 3, metodos }];
    const { produtos: r } = mesclarItens(produtos, [{ nome: 'Molho', prazosLidos: { resfriado: 5 } }]);
    expect(metodosDoProduto(r[0]).find(m => m.id === 'm1').dias).toBe(5);
    expect(r[0].prazos.resfriado).toBe(5);
    expect(r[0].valResfriado).toBe(5);
  });
});

describe('as telas usam os métodos', () => {
  it('a ficha grava os métodos E o espelho em `prazos`', () => {
    const t = ler('../../pages/etiquetas/Itens.jsx');
    expect(t).toMatch(/const prazos = metodos\.length \? espelhoDosMetodos\(metodos\)/);
    expect(t).toMatch(/metodos,\n\s+\}, prazos\),/);
    // o primeiro cartão é o padrão do item
    expect(t).toMatch(/const armazenamentoPadrao = metodos\[0\]\?\.armazenamento/);
    // método repetido trava o Salvar
    expect(t).toMatch(/disabled=\{!\(form\.nome \|\| ''\)\.trim\(\) \|\| repetidos\.size > 0\}/);
  });

  it('a etiqueta impressa guarda o estado e a hora da validade para a reimpressão', () => {
    const ep = ler('../../components/EtiquetaPrint.jsx');
    expect(ep).toMatch(/estadoNome: c\.estadoNome/);
    expect(ep).toMatch(/c\.validadeHora !== c\.hora && \{ validadeHora: c\.validadeHora \}/);
    expect(ep).toMatch(/!c\.mostrarHora && \{ semHora: true \}/);
    const imp = ler('../../pages/etiquetas/Impressas.jsx');
    expect(imp).toMatch(/validadeHora: e\.validadeHora \|\| ''/);
    expect(imp).toMatch(/semHora: !!e\.semHora/);
  });

  it('os estados ficam em Administração → Etiqueta', () => {
    const g = ler('../../pages/AdministracaoGrupo.jsx');
    expect(g).toMatch(/<CartaoEstados prefs=\{prefs\} setPref=\{setPref\}/);
  });

  it('prazoComHoras', () => {
    expect(prazoComHoras({ minutos: 1 })).toBe(true);
    expect(prazoComHoras({ dias: 3 })).toBe(false);
  });
});
