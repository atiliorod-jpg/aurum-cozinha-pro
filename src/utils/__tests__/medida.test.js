// =====================================================================
//  A MEDIDA PELO TECLADO GRANDE (23/11/2026, jeito do Magurō)
//  O teclado monta o MESMO texto de sempre ("1,5 kg"), e o que ele monta
//  continua dando entrada certa no estoque (quantoSomaNaContagem).
// =====================================================================
import { describe, it, expect } from 'vitest';
import { UNIDADES_DA_MEDIDA, lerMedida, textoDaMedida, unidadeParaAbrir, teclar, MAX_INTEIROS } from '../medida';
import { quantoSomaNaContagem } from '../etiquetas';

describe('ler a medida que já existe', () => {
  it('número e unidade, com vírgula ou ponto, com ou sem espaço', () => {
    expect(lerMedida('1 kg')).toEqual({ numero: '1', unidade: 'kg', livre: '' });
    expect(lerMedida('1,5 kg')).toEqual({ numero: '1,5', unidade: 'kg', livre: '' });
    expect(lerMedida('1.5kg')).toEqual({ numero: '1,5', unidade: 'kg', livre: '' });
    expect(lerMedida('500 g')).toEqual({ numero: '500', unidade: 'g', livre: '' });
    expect(lerMedida('500 ML')).toEqual({ numero: '500', unidade: 'mL', livre: '' });
    expect(lerMedida('1 l')).toEqual({ numero: '1', unidade: 'L', livre: '' });
    expect(lerMedida('4 unid')).toEqual({ numero: '4', unidade: 'un', livre: '' });
    expect(lerMedida('4 un.')).toEqual({ numero: '4', unidade: 'un', livre: '' });
    expect(lerMedida('2')).toEqual({ numero: '2', unidade: '', livre: '' });
  });

  it('vazio é vazio; o que não é "número + unidade" fica como texto livre', () => {
    expect(lerMedida('')).toEqual({ numero: '', unidade: '', livre: '' });
    expect(lerMedida(null)).toEqual({ numero: '', unidade: '', livre: '' });
    expect(lerMedida('1 pote')).toEqual({ numero: '', unidade: '', livre: '1 pote' });
    expect(lerMedida('porção da casa')).toEqual({ numero: '', unidade: '', livre: 'porção da casa' });
  });
});

describe('o texto que vai na etiqueta', () => {
  it('"1,5 kg"; vírgula sobrando sai; zero ou vazio = sem medida', () => {
    expect(textoDaMedida('1,5', 'kg')).toBe('1,5 kg');
    expect(textoDaMedida('2,', 'L')).toBe('2 L');
    expect(textoDaMedida('2', '')).toBe('2');
    expect(textoDaMedida('', 'kg')).toBe('');
    expect(textoDaMedida('0', 'kg')).toBe('');
    expect(textoDaMedida('0,0', 'kg')).toBe('');
  });

  it('⚠️ o que o teclado monta continua dando entrada certa no estoque', () => {
    expect(quantoSomaNaContagem(textoDaMedida('1,5', 'kg'), 'kg')).toBe(1.5);
    expect(quantoSomaNaContagem(textoDaMedida('500', 'g'), 'kg')).toBe(0.5);
    expect(quantoSomaNaContagem(textoDaMedida('500', 'mL'), 'L')).toBe(0.5);
    expect(quantoSomaNaContagem(textoDaMedida('4', 'un'), 'unid')).toBe(4);
    // e lido de volta, dá o mesmo número
    for (const u of UNIDADES_DA_MEDIDA) {
      expect(lerMedida(textoDaMedida('2,25', u))).toEqual({ numero: '2,25', unidade: u, livre: '' });
    }
  });
});

describe('a unidade que o teclado abre marcada', () => {
  it('a da medida; sem ela, a do item; sem nada, kg', () => {
    expect(unidadeParaAbrir('500 g', 'kg')).toBe('g');
    expect(unidadeParaAbrir('', 'L')).toBe('L');
    expect(unidadeParaAbrir('', 'unid')).toBe('un');
    expect(unidadeParaAbrir('', 'maço')).toBe('kg');
    expect(unidadeParaAbrir('', '')).toBe('kg');
  });
});

describe('as teclas', () => {
  it('números, uma vírgula só, zero à esquerda trocado', () => {
    expect(teclar('', '1')).toBe('1');
    expect(teclar('1', ',')).toBe('1,');
    expect(teclar('1,', '5')).toBe('1,5');
    expect(teclar('1,5', ',')).toBe('1,5');
    expect(teclar('', ',')).toBe('0,');
    expect(teclar('0', '7')).toBe('7');
  });

  it('sem vírgula quando não aceita decimal; teto de algarismos', () => {
    expect(teclar('12', ',', { decimal: false })).toBe('12');
    const grande = '9'.repeat(MAX_INTEIROS);
    expect(teclar(grande, '9')).toBe(grande);
    expect(teclar('1,250', '5')).toBe('1,250');
    expect(teclar('1', 'x')).toBe('1');
  });
});

// ── O TECLADO DA BALANÇA (24/11/2026, escolha do dono para o kg do desperdício)
import { digitosDaBalanca, teclarBalanca, textoDaBalanca, MAX_DIGITOS_BALANCA } from '../medida';

describe('teclado da balança: os números entram pela direita, 3 casas fixas', () => {
  const tocar = (...teclas) => teclas.reduce((d, t) => teclarBalanca(d, t), '');
  it('1-5-0-0 é 1,500; 2-5-0 é 0,250; 2 e 000 é 2,000', () => {
    expect(textoDaBalanca(tocar('1', '5', '0', '0'))).toBe('1,500');
    expect(textoDaBalanca(tocar('2', '5', '0'))).toBe('0,250');
    expect(textoDaBalanca(tocar('2', '000'))).toBe('2,000');
    expect(textoDaBalanca(tocar('1', '0'))).toBe('0,010');
  });
  it('zero à esquerda não conta; vírgula não é tecla; tem limite', () => {
    expect(tocar('0', '0', '5')).toBe('5');
    expect(teclarBalanca('15', ',')).toBe('15');
    expect(tocar('9', '9', '9', '9', '9', '9', '9', '9', '9')).toHaveLength(MAX_DIGITOS_BALANCA);
    expect(textoDaBalanca('')).toBe('');
  });
  it('o valor que já existe abre nos dígitos certos', () => {
    expect(digitosDaBalanca('1,5')).toBe('1500');
    expect(digitosDaBalanca('1.5')).toBe('1500');
    expect(digitosDaBalanca(0.25)).toBe('250');
    expect(digitosDaBalanca('')).toBe('');
    expect(digitosDaBalanca('0')).toBe('');
  });
});
