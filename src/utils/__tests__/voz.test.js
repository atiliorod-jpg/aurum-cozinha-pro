import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  entenderFala, pontuarItem, acharPorVoz, itemCerto, textoDoErroDeVoz, vocabularioDeMetodos, escolherMetodoFalado,
} from '../voz';
import { ARMAZENAMENTOS_PADRAO } from '../armazenamento';
import { ESTADOS_PADRAO } from '../metodos';

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// =====================================================================
//  BUSCA POR VOZ (04/11/2026) — o navegador transforma a fala em texto; o
//  app entende a quantidade e acha o item, tolerando o que o reconhecimento
//  erra pouco.
// =====================================================================

const ITENS = [
  { id: 'f', nome: 'Frango desfiado' },
  { id: 'p', nome: 'Picanha (porção)' },
  { id: 'q', nome: 'Queijo mussarela' },
  { id: 'm', nome: 'Molho de tomate da casa' },
  { id: 'ff', nome: 'Filé de Frango (porção)' },
  { id: 'e', nome: 'Empanado de Filé (porção)' },
  { id: 'qq', nome: 'Molho quatro queijos' },
];

describe('a quantidade que veio junto', () => {
  it('no começo, com número ou por extenso', () => {
    expect(entenderFala('três etiquetas de frango desfiado', ITENS)).toMatchObject({ termo: 'frango desfiado', quantidade: 3 });
    expect(entenderFala('3 etiquetas de frango desfiado', ITENS)).toMatchObject({ termo: 'frango desfiado', quantidade: 3 });
    expect(entenderFala('uma etiqueta de picanha', ITENS)).toMatchObject({ termo: 'picanha', quantidade: 1 });
    expect(entenderFala('duas picanhas', ITENS)).toMatchObject({ termo: 'picanhas', quantidade: 2 });
    expect(entenderFala('vinte e cinco de queijo', ITENS)).toMatchObject({ termo: 'queijo', quantidade: 25 });
  });
  it('no fim, e com o verbo na frente', () => {
    expect(entenderFala('frango desfiado três etiquetas', ITENS)).toMatchObject({ termo: 'frango desfiado', quantidade: 3 });
    expect(entenderFala('imprimir frango desfiado 4', ITENS)).toMatchObject({ termo: 'frango desfiado', quantidade: 4 });
  });
  it('sem número: só o item, sem o "etiqueta de" da frente', () => {
    expect(entenderFala('frango desfiado', ITENS)).toMatchObject({ termo: 'frango desfiado', quantidade: null });
    expect(entenderFala('etiqueta de queijo', ITENS)).toMatchObject({ termo: 'queijo', quantidade: null });
  });
  it('a tela mostra o que foi falado, com acento; a comparação é sem', () => {
    expect(entenderFala('três etiquetas de filé', ITENS)).toMatchObject({ termo: 'file', falado: 'filé', quantidade: 3 });
  });
  it('⚠️ o nome de um item ganha da quantidade: "quatro queijos" não vira 4', () => {
    expect(entenderFala('molho quatro queijos', ITENS).quantidade).toBeNull();
    expect(entenderFala('molho quatro queijos', ITENS).termo).toBe('molho quatro queijos');
  });
});

describe('achar o item pelo que foi ouvido', () => {
  it('igual, começo do nome, todas as palavras, e parecido', () => {
    expect(pontuarItem('frango desfiado', 'Frango desfiado')).toBe(100);
    expect(pontuarItem('frango', 'Frango desfiado')).toBe(90);
    expect(pontuarItem('porcao', 'Picanha (porção)')).toBe(80);
    // o reconhecimento errou o gênero, o plural, uma letra
    expect(pontuarItem('frango desfiada', 'Frango desfiado')).toBe(70);
    expect(pontuarItem('picanhas', 'Picanha (porção)')).toBe(70);
    expect(pontuarItem('queijo muçarela', 'Queijo mussarela')).toBe(70);
    expect(pontuarItem('lasanha', 'Frango desfiado')).toBe(0);
  });
  it('um item só combinou: abre direto, com a quantidade', () => {
    const r = acharPorVoz(['três etiquetas de frango desfiada'], ITENS);
    expect(r.quantidade).toBe(3);
    expect(itemCerto(r.achados)?.id).toBe('f');
  });
  it('com dois parecidos, a pessoa escolhe na lista', () => {
    const r = acharPorVoz(['filé'], ITENS);
    expect(r.achados.map(a => a.produto.id).sort()).toEqual(['e', 'ff']);
    expect(itemCerto(r.achados)).toBeNull();
  });
  it('o nome exato abre direto mesmo com outros parecidos', () => {
    const itens = [...ITENS, { id: 'fr', nome: 'Frango' }];
    expect(itemCerto(acharPorVoz(['frango'], itens).achados)?.id).toBe('fr');
  });
  it('das versões que o navegador ouviu, fica a que acha o melhor item', () => {
    const r = acharPorVoz(['franco desfiar', 'frango desfiado'], ITENS);
    expect(r.termo).toBe('frango desfiado');
    expect(r.achados[0].nota).toBe(100);
  });
  it('nada combinou: lista vazia, para a tela dizer que não achou', () => {
    expect(acharPorVoz(['lasanha bolonhesa'], ITENS).achados).toEqual([]);
    expect(acharPorVoz([], ITENS)).toMatchObject({ termo: '', quantidade: null, achados: [] });
  });
});

describe('quando a voz falha', () => {
  it('cada erro do navegador vira uma frase que diz o que fazer', () => {
    expect(textoDoErroDeVoz('network')).toMatch(/precisa de internet/);
    expect(textoDoErroDeVoz('not-allowed')).toMatch(/microfone está bloqueado/);
    expect(textoDoErroDeVoz('no-speech')).toMatch(/Não ouvi nada/);
    expect(textoDoErroDeVoz('aborted')).toBeNull();
    expect(textoDoErroDeVoz('qualquer-outro')).toMatch(/Não entendi/);
  });
});

describe('na tela Imprimir', () => {
  it('o microfone fica junto da busca, e a quantidade falada vale para o item escolhido na lista', () => {
    const tela = ler('../../pages/Etiquetas.jsx');
    expect(tela).toMatch(/<BuscaPorVoz /);
    expect(tela).toMatch(/const voz = pedido \|\| pedidoDaVoz \|\| \{\};/);
    // o método falado que o item não tem: a janela não abre, a tela mostra os dele
    expect(tela).toMatch(/if \(!m\) \{ mostrarMetodosDoItem\(original, p, conservacao, voz\); return undefined; \}/);
  });
  it('sem reconhecimento de fala no navegador, o botão nem aparece', () => {
    expect(ler('../../components/BuscaPorVoz.jsx')).toMatch(/if \(!vozDisponivel\(\)\) return children;/);
  });
});

// =====================================================================
//  O MÉTODO PELA VOZ (05/11/2026): "frango desfiado congelado" abre já em
//  Congelado; o item sem esse método não abre (a tela mostra os dele).
// =====================================================================

const VOC = vocabularioDeMetodos(ARMAZENAMENTOS_PADRAO, ESTADOS_PADRAO);

describe('o método que veio junto', () => {
  it('no fim, depois da quantidade e do item', () => {
    expect(entenderFala('três etiquetas de frango desfiado congelado', ITENS, VOC))
      .toMatchObject({ termo: 'frango desfiado', quantidade: 3, armazenamento: 'congelado', estado: null });
    expect(entenderFala('frango desfiado congelado três etiquetas', ITENS, VOC))
      .toMatchObject({ termo: 'frango desfiado', quantidade: 3, armazenamento: 'congelado' });
  });
  it('as palavras de cada um, no feminino e no plural', () => {
    expect(entenderFala('picanha congelada', ITENS, VOC).armazenamento).toBe('congelado');
    expect(entenderFala('queijo temperatura ambiente', ITENS, VOC)).toMatchObject({ termo: 'queijo', armazenamento: 'ambiente' });
    expect(entenderFala('frango na geladeira', ITENS, VOC)).toMatchObject({ termo: 'frango', armazenamento: 'refrigerado' });
    expect(entenderFala('picanha no freezer', ITENS, VOC)).toMatchObject({ termo: 'picanha', armazenamento: 'congelado' });
  });
  it('⚠️ refrigerado e resfriado são métodos diferentes', () => {
    expect(entenderFala('picanha resfriada', ITENS, VOC).armazenamento).toBe('resfriado');
    expect(entenderFala('picanha refrigerada', ITENS, VOC).armazenamento).toBe('refrigerado');
  });
  it('o estado da casa, sozinho ou junto do armazenamento', () => {
    expect(entenderFala('molho de tomate da casa pista quente', ITENS, VOC))
      .toMatchObject({ termo: 'molho de tomate da casa', estado: 'pista_quente', armazenamento: null });
    expect(entenderFala('molho de tomate da casa refrigerado pista quente', ITENS, VOC))
      .toMatchObject({ termo: 'molho de tomate da casa', armazenamento: 'refrigerado', estado: 'pista_quente', metodoFalado: 'refrigerado pista quente' });
  });
  it('⚠️ o nome do item ganha: "polpa congelada" é o item quando ele existe', () => {
    const itens = [...ITENS, { id: 'pc', nome: 'Polpa congelada de maracujá' }];
    expect(entenderFala('polpa congelada', itens, VOC)).toMatchObject({ termo: 'polpa congelada', armazenamento: null });
    // e sem um item assim, "congelada" é o método
    expect(entenderFala('polpa congelada', ITENS, VOC)).toMatchObject({ termo: 'polpa', armazenamento: 'congelado' });
  });
  it('o nome que a casa deu ao armazenamento também vale', () => {
    const voc = vocabularioDeMetodos([{ id: 'camara', nome: 'Câmara fria' }], []);
    expect(entenderFala('picanha câmara fria', ITENS, voc)).toMatchObject({ termo: 'picanha', armazenamento: 'camara' });
  });
  it('sem método falado, nada muda', () => {
    expect(entenderFala('frango desfiado', ITENS, VOC)).toMatchObject({ armazenamento: null, estado: null, metodoFalado: '' });
  });
  it('a busca leva o método junto do item achado', () => {
    const r = acharPorVoz(['duas etiquetas de queijo mussarela congelado'], ITENS, VOC);
    expect(r).toMatchObject({ quantidade: 2, armazenamento: 'congelado' });
    expect(itemCerto(r.achados)?.id).toBe('q');
  });
});

describe('o método falado entre os do item', () => {
  const ativos = ['congelado', 'refrigerado', 'resfriado', 'ambiente'];
  const frango = [
    { id: 'refrigerado', armazenamento: 'refrigerado', estado: '', dias: 3 },
    { id: 'congelado', armazenamento: 'congelado', estado: '', dias: 90 },
    { id: 'm3', armazenamento: 'refrigerado', estado: 'pista_quente', dias: 0, horas: 4 },
  ];
  const inicial = { armazenamento: 'refrigerado', metodoId: 'refrigerado' };
  it('acha o método do armazenamento falado', () => {
    expect(escolherMetodoFalado({ armazenamento: 'congelado' }, { metodos: frango, inicial, ativos }))
      .toEqual({ metodoId: 'congelado', armazenamento: 'congelado' });
  });
  it('"refrigerado" é o refrigerado sem estado; "pista quente" é o dela', () => {
    expect(escolherMetodoFalado({ armazenamento: 'refrigerado' }, { metodos: frango, inicial, ativos })?.metodoId).toBe('refrigerado');
    expect(escolherMetodoFalado({ estado: 'pista_quente' }, { metodos: frango, inicial, ativos })?.metodoId).toBe('m3');
  });
  it('o item não tem o método falado: null (a tela mostra os dele)', () => {
    expect(escolherMetodoFalado({ armazenamento: 'ambiente' }, { metodos: frango, inicial, ativos })).toBeNull();
    // método sem prazo não conta
    expect(escolherMetodoFalado({ armazenamento: 'resfriado' }, {
      metodos: [...frango, { id: 'r', armazenamento: 'resfriado', estado: '', dias: 0 }], inicial, ativos,
    })).toBeNull();
  });
  it('⚠️ o Seco abre em ambiente sem método: "temperatura ambiente" vai para lá, não para o congelado de 540', () => {
    const seco = [{ id: 'congelado', armazenamento: 'congelado', estado: '', dias: 540 }];
    expect(escolherMetodoFalado({ armazenamento: 'ambiente' }, { metodos: seco, inicial: { armazenamento: 'ambiente', metodoId: null }, ativos }))
      .toEqual({ metodoId: null, armazenamento: 'ambiente' });
  });
  it('dois do mesmo armazenamento, sem um sem estado: a pessoa escolhe', () => {
    const doisEstados = [
      { id: 'a', armazenamento: 'refrigerado', estado: 'pista_fria', dias: 1 },
      { id: 'b', armazenamento: 'refrigerado', estado: 'pista_quente', horas: 4 },
    ];
    expect(escolherMetodoFalado({ armazenamento: 'refrigerado' }, { metodos: doisEstados, inicial: null, ativos })).toBeNull();
    // o de sempre desempata
    expect(escolherMetodoFalado({ armazenamento: 'refrigerado' }, { metodos: doisEstados, inicial: { metodoId: 'b' }, ativos })?.metodoId).toBe('b');
  });
});
