// =====================================================================
//  2ª ETAPA DA BAIXA PELA ETIQUETA — LOTE A (01/10/2026)
//  A validade chega à Finalização, a contagem acerta os lotes, imprimir
//  pode dar entrada, e os erros antigos que apareceram no caminho.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { calcLotes, partirPorValidade, partesDoItem, semValidadeConhecida } from '../lotes';
import { quantoSomaNaContagem } from '../etiquetas';
import { novoFiltroDeLeitura } from '../baixaEtiqueta';
import { gerarDemoSeed } from '../../data/demo';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const resto = (lotes, id) => Object.fromEntries((lotes[id] || []).map(l => [l.validade, l.restante]));

describe('a contagem acerta os lotes (o que sobrou é o mais novo)', () => {
  const recebidos = [
    { ts: 10, itens: [{ produtoId: 'molho', quantidade: 10, validade: '2026-10-03' }] },
    { ts: 20, itens: [{ produtoId: 'molho', quantidade: 10, validade: '2026-10-08' }] },
  ];

  it('Finalização: recebeu 20, o Fechar Turno contou 5 → ficam 5 do lote mais novo', () => {
    const fechamento = { ts: 30, itens: [{ produtoId: 'molho', quantidade: 5 }] };
    expect(resto(calcLotes(recebidos, [], [], [], [fechamento]), 'molho')).toEqual({ '2026-10-08': 5 });
  });

  it('sem contagem, nada some (como antes)', () => {
    expect(resto(calcLotes(recebidos, [], []), 'molho')).toEqual({ '2026-10-03': 10, '2026-10-08': 10 });
  });

  it('contou MAIS do que os lotes somam: não inventa data, deixa os lotes como estão', () => {
    const fechamento = { ts: 30, itens: [{ produtoId: 'molho', quantidade: 25 }] };
    expect(resto(calcLotes(recebidos, [], [], [], [fechamento]), 'molho')).toEqual({ '2026-10-03': 10, '2026-10-08': 10 });
  });

  it('o que chega DEPOIS da contagem soma por cima do que sobrou', () => {
    const fechamento = { ts: 25, itens: [{ produtoId: 'molho', quantidade: 4 }] };
    const depois = [...recebidos, { ts: 40, itens: [{ produtoId: 'molho', quantidade: 6, validade: '2026-10-05' }] }];
    expect(resto(calcLotes(depois, [], [], [], [fechamento]), 'molho')).toEqual({ '2026-10-05': 6, '2026-10-08': 4 });
  });

  it('no mesmo instante, a entrada vem ANTES da contagem (a mesma regra do saldo)', () => {
    const fechamento = { ts: 20, itens: [{ produtoId: 'molho', quantidade: 3 }] };
    expect(resto(calcLotes(recebidos, [], [], [], [fechamento]), 'molho')).toEqual({ '2026-10-08': 3 });
  });

  it('Inventário da Produção (contagem na raiz) acaba com o lote fantasma', () => {
    const entradas = [{ ts: 1, itens: [{ produtoId: 'charque', quantidade: 20, validade: '2026-06-20' }] }];
    const inventario = { ts: 5, produtoId: 'charque', quantidade: 0 };
    expect(calcLotes(entradas, [], [], [], [inventario]).charque).toEqual([]);
  });

  it('contagem zerada some com o lote; a perda depois não mexe em nada', () => {
    const fechamento = { ts: 30, itens: [{ produtoId: 'molho', quantidade: 0 }] };
    const perda = { ts: 31, origem: 'estoque', produtoId: 'molho', quantidade: 1 };
    expect(calcLotes(recebidos, [], [perda], [], [fechamento]).molho).toEqual([]);
  });
});

describe('a saída manual para a Finalização leva a validade', () => {
  const lotesDaProducao = [
    { validade: '2026-10-05', restante: 3 },
    { validade: '2026-10-02', restante: 5, armazenamento: 'resfriado' },
    { validade: '2026-10-09', restante: 10 },
  ];

  it('parte pelos lotes que vencem primeiro', () => {
    expect(partirPorValidade(9, lotesDaProducao)).toEqual([
      { validade: '2026-10-02', quantidade: 5, armazenamento: 'resfriado' },
      { validade: '2026-10-05', quantidade: 3 },
      { validade: '2026-10-09', quantidade: 1 },
    ]);
  });

  it('junta lotes da mesma validade e não inventa data para o que passar', () => {
    const iguais = [{ validade: '2026-10-02', restante: 2 }, { validade: '2026-10-02', restante: 2 }];
    expect(partirPorValidade(10, iguais)).toEqual([{ validade: '2026-10-02', quantidade: 4 }]);
    expect(partesDoItem({ produtoId: 'x', quantidade: 10, porValidade: [{ validade: '2026-10-02', quantidade: 4 }] }))
      .toEqual({ partes: [{ validade: '2026-10-02', qtd: 4, armazenamento: undefined }], semValidade: 6 });
  });

  it('sem lote nenhum, a saída vai sem validade (como sempre foi)', () => {
    expect(partirPorValidade(5, [])).toEqual([]);
  });

  it('a Produção abate os lotes certos e a Finalização recebe com as mesmas datas', () => {
    const entradas = [
      { ts: 1, itens: [{ produtoId: 'p', quantidade: 5, validade: '2026-10-02' }] },
      { ts: 2, itens: [{ produtoId: 'p', quantidade: 10, validade: '2026-10-09' }] },
    ];
    const saida = { ts: 3, destino: 'finalizacao', itens: [{ produtoId: 'p', quantidade: 8,
      porValidade: [{ validade: '2026-10-02', quantidade: 5 }, { validade: '2026-10-09', quantidade: 3 }] }] };
    expect(resto(calcLotes(entradas, [saida], []), 'p')).toEqual({ '2026-10-09': 7 });
    // do lado de lá, a mesma saída É o recebimento
    expect(resto(calcLotes([saida], [], []), 'p')).toEqual({ '2026-10-02': 5, '2026-10-09': 3 });
  });

  it('a validade da embalagem lida pelo QR continua valendo (item com `validade`)', () => {
    const recebido = { ts: 5, itens: [{ produtoId: 'p', quantidade: 1, validade: '2026-10-04', etiquetaId: 'k3f9x2ab' }] };
    expect(resto(calcLotes([recebido], [], []), 'p')).toEqual({ '2026-10-04': 1 });
  });

  it('o que está no estoque sem lote aparece como "sem validade conhecida"', () => {
    expect(semValidadeConhecida(12, [{ restante: 5 }, { restante: 3 }], 'kg')).toBe(4);
    expect(semValidadeConhecida(8, [{ restante: 5 }, { restante: 3 }], 'kg')).toBe(0);
    expect(semValidadeConhecida(1.5, [{ restante: 1 }], 'unid')).toBe(0); // menos de uma unidade
  });
});

describe('erros antigos que apareceram no caminho', () => {
  it('"4 un" na medida conta 4 unidades por embalagem; "150 g" num item em unidade continua 1', () => {
    expect(quantoSomaNaContagem('4 un', 'unid')).toBe(4);
    expect(quantoSomaNaContagem('12 pç', 'unid')).toBe(12);
    expect(quantoSomaNaContagem('6 unidades', 'unid')).toBe(6);
    expect(quantoSomaNaContagem('150 g', 'unid')).toBe(1);
    expect(quantoSomaNaContagem('2', 'unid')).toBe(1);
    expect(quantoSomaNaContagem('', 'unid')).toBe(1);
  });

  it('a câmera parada sobre o mesmo QR não lança de novo; só depois de sair do quadro', () => {
    const novo = novoFiltroDeLeitura(1500);
    const disparos = [];
    for (let t = 0; t <= 6000; t += 250) if (novo('K3F9X2AB', t)) disparos.push(t);
    expect(disparos).toEqual([0]);                 // 6 s à vista: um disparo só
    expect(novo('K3F9X2AB', 6000 + 2000)).toBe(true); // ficou 2 s fora: vale de novo
    expect(novo('OUTRO', 8100)).toBe(true);          // outro código não espera
  });

  it('importar a cópia de segurança MESCLA as preferências (antes apagava as da conta)', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/if \(Object\.keys\(limpo\)\.length\) setPrefs\(limpo\);/);
    expect(app).not.toMatch(/cat\('prefs', setPrefsRaw, limpo\)/);
  });

  it('apagar um lançamento que ainda está na fila tira da fila (não ressuscita ao subir)', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/i\.kind === 'registro' && i\.op === 'insert' && i\.payload\?\.id === id/);
  });

  it('recebimento só do banco: o resto velho do aparelho não volta para o saldo', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/let localOnly = tipo === 'recebimento' \? \[\] : prev\.filter/);
  });

  it('Finalização arquivada sai dos botões de destino (e fora da Produção não há destino Finalização)', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/const destinosDeSaida = useMemo/);
    expect(app).toMatch(/tipoBase\(l\.id\) !== 'finalizacao' \|\| \(daProducao && ativas\.has\(l\.id\)\)/);
    for (const tela of ['../../pages/Saidas.jsx', '../../components/BaixaEtiqueta.jsx', '../../pages/LerEtiquetas.jsx']) {
      expect(ler(tela)).toMatch(/destinosDeSaida/);
    }
  });

  it('Histórico mostra o fechamento de turno pelos itens (não "undefined → undefined")', () => {
    expect(ler('../../pages/Historico.jsx')).toMatch(/fechamento de turno\$\{r\.turno/);
  });

  it('as sugestões de mín/máx das Configurações usam o consumo do Fechar Turno na Finalização', () => {
    expect(ler('../../pages/Configuracoes.jsx')).toMatch(/calcSugestoesMinMax\(produtos, saidasParaConsumo,/);
  });
});

describe('os lotes saem de um lugar só', () => {
  it('o contexto calcula com recebimentos, compras do Seco e contagens; as telas só leem', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/\[\.\.\.entradas, \.\.\.recebimentos, \.\.\.comprasQueEntram\(moduloEfetivo, compras\)\]/);
    expect(app).toMatch(/calcLotes\(entradasDoEstoque, saidas, desperdicio, produtos, ajustes\)/);
    for (const tela of ['../../pages/Validades.jsx', '../../pages/Dashboard.jsx', '../../pages/Saidas.jsx']) {
      expect(ler(tela)).not.toMatch(/calcLotes\(/);
    }
  });

  it('a saída manual só parte por validade quando vai para uma Finalização', () => {
    const tela = ler('../../pages/Saidas.jsx');
    expect(tela).toMatch(/const paraFinalizacao = tipoBase\(destino\) === 'finalizacao';/);
    expect(tela).toMatch(/partirPorValidade\(quantidade, lotes\[produtoId\]\)/);
  });
});

describe('imprimir pode dar entrada (decisão do dono)', () => {
  const tela = ler('../../components/EtiquetaPrint.jsx');

  it('só no Pro, na cozinha que tem Entradas, e nunca na reimpressão, no teste ou vindo de uma entrada', () => {
    expect(tela).toMatch(/const podeDarEntrada = guardaHistorico && temRecurso\(modulo, 'entradas'\);/);
    expect(tela).toMatch(/!item\.origemRegistro\s+&& !item\.codigo && !item\.reimpressao && !item\.teste/);
  });

  it('só entra o que SAIU no papel, e com Desfazer', () => {
    expect(tela).toMatch(/registrarImpressao\(lista, umCodigoPorCopia, idDe\);\s+\/\/ só o que SAIU[^\n]*\n\s+darEntrada\(lista\);/);
    expect(tela).toMatch(/acao: \{ label: 'Desfazer', onClick: \(\) => removeEntrada\(novo\.id\) \}/);
  });
});

describe('demonstração: a Finalização recebe pela mesma ponte da conta real', () => {
  it('as entregas são saídas da Produção com destino Finalização e validade', () => {
    const prod = gerarDemoSeed('producao').registros.saidas.filter(s => s.destino === 'finalizacao');
    expect(prod.length).toBeGreaterThanOrEqual(3);
    prod.forEach(s => s.itens.forEach(i => expect(i.porValidade?.[0]?.validade).toMatch(/^\d{4}-\d{2}-\d{2}$/)));
    expect(gerarDemoSeed('finalizacao').registros.recebimentos).toBeUndefined();
  });

  it('o fechamento de turno da demo tem o formato do Fechar Turno (itens[])', () => {
    const [f] = gerarDemoSeed('finalizacao').registros.ajustes;
    expect(Array.isArray(f.itens)).toBe(true);
    expect(f.itens.map(i => i.produtoId)).toEqual(expect.arrayContaining(['empanado', 'molho']));
  });

  it('o contexto monta os recebimentos da demo a partir das saídas da Produção', () => {
    expect(ler('../../store/AppContext.jsx')).toMatch(/\.filter\(r => r && r\.destino === moduloEfetivo\)/);
  });
});
