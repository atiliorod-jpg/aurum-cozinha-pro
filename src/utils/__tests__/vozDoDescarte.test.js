// =====================================================================
//  A VOZ DO DESPERDÍCIO (24/11/2026, pedido do dono): o item, quanto (kg, g
//  ou unid) e o motivo, numa frase só e em qualquer ordem —
//  "bolinho de costela 10 gramas", "10kg de frango vencido".
// =====================================================================
import { describe, it, expect } from 'vitest';
import { entenderFalaDoDescarte, acharDescartePorVoz, motivoDaFala } from '../vozDoDescarte';
import { MOTIVOS_PADRAO } from '../desperdicio';
import { itemCerto } from '../voz';

const ITENS = ['Bolinho de costela', 'Bolinho de bacalhau', 'Frango', 'Frango desfiado', 'Arroz', 'Molho 4 queijos',
  'Pão de queijo', 'Salmão', 'Carne moída', 'Sobremesa de chocolate', 'Couve-flor']
  .map((nome, i) => ({ id: `i${i}`, nome }));
const entender = (fala) => entenderFalaDoDescarte(fala, ITENS, MOTIVOS_PADRAO);
const resumo = (fala) => {
  const r = entender(fala);
  return [r.termo, r.quantidade, r.unidade, r.motivo];
};

describe('quanto e em que unidade', () => {
  it('os exemplos do dono: "bolinho de costela 10 gramas" e "10kg" grudado', () => {
    expect(resumo('bolinho de costela 10 gramas')).toEqual(['bolinho de costela', 10, 'g', '']);
    expect(resumo('bolinho de costela 10kg')).toEqual(['bolinho de costela', 10, 'kg', '']);
    expect(resumo('10 kg de bolinho de costela')).toEqual(['bolinho de costela', 10, 'kg', '']);
    expect(resumo('200g de frango desfiado')).toEqual(['frango desfiado', 200, 'g', '']);
  });

  it('decimal com vírgula ou ponto, e o ponto de milhar', () => {
    expect(resumo('1,5 kg de arroz')).toEqual(['arroz', 1.5, 'kg', '']);
    expect(resumo('arroz 1.5 kg')).toEqual(['arroz', 1.5, 'kg', '']);
    expect(resumo('1.500 gramas de arroz')).toEqual(['arroz', 1500, 'g', '']);
  });

  it('por extenso: meio quilo, quilo e meio, um quilo e duzentos, dois mil gramas, dúzia', () => {
    expect(resumo('meio quilo de arroz')).toEqual(['arroz', 0.5, 'kg', '']);
    expect(resumo('dois quilos e meio de arroz')).toEqual(['arroz', 2.5, 'kg', '']);
    expect(resumo('dois e meio quilos de arroz')).toEqual(['arroz', 2.5, 'kg', '']);
    expect(resumo('um quilo e duzentos de carne moída')).toEqual(['carne moida', 1.2, 'kg', '']);
    expect(resumo('um quilo e duzentos gramas de carne moída')).toEqual(['carne moida', 1.2, 'kg', '']);
    expect(resumo('duzentos e cinquenta gramas de salmão')).toEqual(['salmao', 250, 'g', '']);
    expect(resumo('dois mil gramas de arroz')).toEqual(['arroz', 2000, 'g', '']);
    expect(resumo('uma dúzia de pão de queijo')).toEqual(['pao de queijo', 12, 'unid', '']);
  });

  it('unidades, peças e porções contam como unid; litro vira kg e mL vira g', () => {
    expect(resumo('três unidades de pão de queijo')).toEqual(['pao de queijo', 3, 'unid', '']);
    expect(resumo('2 porções de arroz')).toEqual(['arroz', 2, 'unid', '']);
    expect(resumo('500 ml de molho 4 queijos')).toEqual(['molho 4 queijos', 500, 'g', '']);
    expect(resumo('molho 4 queijos 2 litros')).toEqual(['molho 4 queijos', 2, 'kg', '']);
  });

  it('número sem unidade: vale o de fora do item, e a janela usa a unidade do item', () => {
    expect(resumo('bolinho de costela 10')).toEqual(['bolinho de costela', 10, null, '']);
    expect(resumo('10 bolinho de costela')).toEqual(['bolinho de costela', 10, null, '']);
    expect(resumo('quantidade 3 frango')).toEqual(['frango', 3, null, '']);
  });

  it('⚠️ o nome inteiro ganha: "molho 4 queijos" é o item, não 4 de queijos', () => {
    expect(resumo('molho 4 queijos')).toEqual(['molho 4 queijos', null, null, '']);
    expect(resumo('salmão')).toEqual(['salmao', null, null, '']);
  });
});

describe('o motivo', () => {
  it('o botão da casa pela raiz da palavra: venceu, vencida, estragou, queimou, sobrou, caiu', () => {
    expect(resumo('10kg de frango vencido')).toEqual(['frango', 10, 'kg', 'Vencido']);
    expect(resumo('salmão vencida 2 kg')).toEqual(['salmao', 2, 'kg', 'Vencido']);
    expect(resumo('2,5 kg salmão estragou')).toEqual(['salmao', 2.5, 'kg', 'Estragado']);
    expect(resumo('arroz sobrou 3 kg')).toEqual(['arroz', 3, 'kg', 'Sobra de produção']);
    expect(resumo('200g de frango desfiado caiu no chão')).toEqual(['frango desfiado', 200, 'g', 'Caiu no chão']);
    expect(resumo('frango perdeu a validade 1 kg')).toEqual(['frango', 1, 'kg', 'Vencido']);
    expect(resumo('o cliente devolveu 2 unidades de bolinho de bacalhau')).toEqual(['bolinho de bacalhau', 2, 'unid', 'Devolução do cliente']);
  });

  it('depois de "porque" ou "motivo" vale o que foi dito, como foi dito', () => {
    expect(resumo('meio quilo de arroz porque queimou')).toEqual(['arroz', 0.5, 'kg', 'Queimado']);
    expect(resumo('frango 2 kg porque estava fora da geladeira por muito tempo'))
      .toEqual(['frango', 2, 'kg', 'Estava fora da geladeira por muito tempo']);
    expect(resumo('frango motivo cheiro estranho')).toEqual(['frango', null, null, 'Cheiro estranho']);
    expect(resumo('frango por que venceu')).toEqual(['frango', null, null, 'Vencido']);
    // a quantidade dita depois do motivo também vale
    expect(resumo('frango porque venceu 2 quilos')).toEqual(['frango', 2, 'kg', 'Vencido']);
  });

  it('⚠️ sem confundir: "joguei fora" não é "Fora do padrão", "sobremesa" não é sobra', () => {
    expect(resumo('joguei fora três unidades de pão de queijo')).toEqual(['pao de queijo', 3, 'unid', '']);
    expect(resumo('sobremesa de chocolate 3 unidades vencida')).toEqual(['sobremesa de chocolate', 3, 'unid', 'Vencido']);
    // o que não combina com botão, sem "porque", fica de fora: a pessoa escolhe
    expect(resumo('frango 2 kg da geladeira')).toEqual(['frango', 2, 'kg', '']);
  });

  it('os motivos que valem são os da casa', () => {
    const r = entenderFalaDoDescarte('frango vencido', ITENS, ['Passou do ponto']);
    expect(r.motivo).toBe('');
    expect(entenderFalaDoDescarte('frango passou do ponto', ITENS, ['Passou do ponto']).motivo).toBe('Passou do ponto');
  });
});

describe('o item', () => {
  it('item fora da lista: fica o que foi dito, sem a quantidade e sem o motivo', () => {
    const r = entender('lasanha bolonhesa 2 kg vencida');
    expect([r.falado, r.quantidade, r.unidade, r.motivo]).toEqual(['lasanha bolonhesa', 2, 'kg', 'Vencido']);
  });

  it('com dois parecidos a lista filtra (o que foi dito vale para o escolhido)', () => {
    const r = acharDescartePorVoz(['bolinho 300 gramas'], ITENS, MOTIVOS_PADRAO);
    expect([r.falado, r.quantidade, r.unidade]).toEqual(['bolinho', 300, 'g']);
    expect(r.achados.map(a => a.produto.nome)).toEqual(['Bolinho de bacalhau', 'Bolinho de costela']);
    expect(itemCerto(r.achados)).toBe(null);
  });

  it('das versões que o navegador ouviu, fica a que acha o item; acento e hífen não atrapalham', () => {
    const r = acharDescartePorVoz(['bolinho de costelas 10 gramas', 'bolinho de costela 10 gramas'], ITENS, MOTIVOS_PADRAO);
    expect(itemCerto(r.achados)?.nome).toBe('Bolinho de costela');
    expect(r.falado).toBe('bolinho de costela');
    const c = acharDescartePorVoz(['couve flor 300 g'], ITENS, MOTIVOS_PADRAO);
    expect([itemCerto(c.achados)?.nome, c.quantidade, c.unidade]).toEqual(['Couve-flor', 300, 'g']);
  });

  it('fala vazia ou só "por favor" não quebra', () => {
    expect(entender('')).toEqual({ termo: '', falado: '', quantidade: null, unidade: null, motivo: '' });
    expect(entender('por favor').termo).toBe('');
    expect(acharDescartePorVoz([], ITENS, MOTIVOS_PADRAO).achados).toEqual([]);
  });
});

describe('o microfone do motivo', () => {
  it('o botão da casa quando combina; senão, o que foi dito', () => {
    expect(motivoDaFala(['venceu'], MOTIVOS_PADRAO)).toBe('Vencido');
    expect(motivoDaFala(['porque caiu no chão'], MOTIVOS_PADRAO)).toBe('Caiu no chão');
    expect(motivoDaFala(['o cliente devolveu'], MOTIVOS_PADRAO)).toBe('Devolução do cliente');
    expect(motivoDaFala(['cheiro estranho'], MOTIVOS_PADRAO)).toBe('Cheiro estranho');
    // falou muito e só uma palavra bate: vale o que foi dito
    expect(motivoDaFala(['o cliente reclamou que estava frio'], MOTIVOS_PADRAO)).toBe('Cliente reclamou que estava frio');
  });

  it('entre as versões, ganha a que combina com um botão', () => {
    expect(motivoDaFala(['vende o', 'vencido'], MOTIVOS_PADRAO)).toBe('Vencido');
    expect(motivoDaFala([], MOTIVOS_PADRAO)).toBe('');
  });
});
