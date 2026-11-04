import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { entenderFala, pontuarItem, acharPorVoz, itemCerto, textoDoErroDeVoz } from '../voz';

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
    expect(tela).toMatch(/const qtd = quantidade \|\| qtdDaVoz \|\| 1;/);
  });
  it('sem reconhecimento de fala no navegador, o botão nem aparece', () => {
    expect(ler('../../components/BuscaPorVoz.jsx')).toMatch(/if \(!vozDisponivel\(\)\) return children;/);
  });
});
