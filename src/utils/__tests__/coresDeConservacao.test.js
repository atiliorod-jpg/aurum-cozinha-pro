// =====================================================================
//  AS ETIQUETAS COLORIDAS DE PRAZO (redesign, 25/11/2026, pedido do dono):
//  cada armazenamento com a sua cor — inclusive os que a casa criar.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { corDoArmazenamento, etiquetasDePrazo } from '../coresDeConservacao';

const ARMAZ = [
  { id: 'congelado', nome: 'Congelado' }, { id: 'refrigerado', nome: 'Refrigerado' },
  { id: 'resfriado', nome: 'Resfriado' }, { id: 'ambiente', nome: 'Temperatura ambiente' },
  { id: 'camara_peixe', nome: 'Câmara do peixe' }, { id: 'adega', nome: 'Adega' },
];
const ESTADOS = [{ id: 'pista_quente', nome: 'Pista quente' }];
const item = (metodos) => ({ id: 'x', nome: 'X', metodos });

describe('a cor de cada armazenamento', () => {
  it('os de sempre têm cor fixa: congelado azul, refrigerado verde, resfriado ciano, ambiente âmbar', () => {
    expect(corDoArmazenamento('congelado', ARMAZ)).toMatch(/blue/);
    expect(corDoArmazenamento('refrigerado', ARMAZ)).toMatch(/green/);
    expect(corDoArmazenamento('resfriado', ARMAZ)).toMatch(/cyan/);
    expect(corDoArmazenamento('ambiente', ARMAZ)).toMatch(/amber/);
  });

  it('⚠️ os que a casa criou ganham cores próprias, diferentes entre si e das de sempre', () => {
    const daCasa = [corDoArmazenamento('camara_peixe', ARMAZ), corDoArmazenamento('adega', ARMAZ)];
    const fixas = ['congelado', 'refrigerado', 'resfriado', 'ambiente'].map(id => corDoArmazenamento(id, ARMAZ));
    expect(new Set([...daCasa, ...fixas]).size).toBe(6);
    // e a mesma cor sempre, para o mesmo armazenamento
    expect(corDoArmazenamento('adega', ARMAZ)).toBe(daCasa[1]);
  });
});

describe('as etiquetas de prazo do item', () => {
  it('uma por método, com o nome e o prazo por extenso ("Congelado 30 dias")', () => {
    const e = etiquetasDePrazo(item([
      { id: 'm1', armazenamento: 'congelado', dias: 30 },
      { id: 'm2', armazenamento: 'refrigerado', dias: 2 },
    ]), ARMAZ, ESTADOS);
    expect(e.map(x => x.texto)).toEqual(['Congelado 30 dias', 'Refrigerado 2 dias']);
    expect(e[0].cor).toMatch(/blue/);
    expect(e[1].cor).toMatch(/green/);
  });

  it('o estado vai escrito e ganha moldura, com a cor do armazenamento', () => {
    const [e] = etiquetasDePrazo(item([{ id: 'm1', armazenamento: 'refrigerado', estado: 'pista_quente', horas: 6 }]), ARMAZ, ESTADOS);
    expect(e.texto).toBe('Refrigerado · Pista quente 6 h');
    expect(e.cor).toMatch(/green/);
    expect(e.cor).toMatch(/ring-1/);
  });

  it('prazo igual em todos vira UMA etiqueta neutra; sem prazo, nenhuma', () => {
    const iguais = etiquetasDePrazo(item([
      { id: 'a', armazenamento: 'congelado', dias: 3 }, { id: 'b', armazenamento: 'refrigerado', dias: 3 },
    ]), ARMAZ, ESTADOS);
    expect(iguais.map(x => x.texto)).toEqual(['3 dias em qualquer estado']);
    expect(etiquetasDePrazo(item([]), ARMAZ, ESTADOS)).toEqual([]);
    // armazenamento que a casa não usa mais não aparece
    expect(etiquetasDePrazo(item([{ id: 'a', armazenamento: 'sumiu', dias: 5 }]), ARMAZ, ESTADOS)).toEqual([]);
  });
});
