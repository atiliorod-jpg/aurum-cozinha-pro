// =====================================================================
//  PLANOS E PAGAMENTO (27/09/2026) — pedido do dono: CNPJ inteiro na
//  etiqueta; a Administração do cliente enxuta, com conta, unidades, contas a
//  mais e o Pro em "Planos e pagamento"; e o painel mostrando onde criar a
//  unidade de um cliente e quem paga o adicional.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { etiquetaTSPL } from '../tspl';
import { mensalComUnidades, adicionalUnidade } from '../assinatura';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('CNPJ na etiqueta com a pontuação', () => {
  const campos = {
    nome: 'Picanha', medida: '150 g', rotuloData: 'MANIPULACAO',
    dataFabricacaoFmt: '27/09/2026 - 10:00', validadeFmt: '30/09/2026 - 10:00',
    armazenamentoLabel: 'REFRIGERADO', armazenamentoFaixa: '0°C a 6°C',
    restauranteNome: 'Polo Central',
  };
  const config = { larguraMm: 60, alturaMm: 50, campos: {}, estabelecimento: { cnpj: '12345678000190' } };

  it('pelo celular (impressora Bluetooth): 12.345.678/0001-90, não 14 números corridos', () => {
    const t = etiquetaTSPL(campos, config);
    expect(t).toContain('CNPJ: 12.345.678/0001-90');
    expect(t).not.toContain('12345678000190');
  });

  it('pelo computador: a mesma formatação', () => {
    expect(ler('../../components/EtiquetaPrint.jsx')).toMatch(/\{est\.cnpj && <div>CNPJ: \{formatarCNPJ\(est\.cnpj\)\}<\/div>\}/);
  });
});

describe('Administração do cliente enxuta; conta e dinheiro em Planos e pagamento', () => {
  const ajustes = ler('../../pages/etiquetas/Ajustes.jsx');
  const pagamento = ler('../../pages/Pagamento.jsx');
  const extras = ler('../../components/PlanoExtras.jsx');

  it('a Administração do Etiquetas tem uma linha do plano, sem o cartão grande nem o anúncio do Pro', () => {
    expect(ajustes).toMatch(/\{ehDono && <ResumoDoPlano \/>\}/);
    expect(ajustes).not.toMatch(/O Aurum Cozinha Pro/);
    expect(ajustes).not.toMatch(/Sua conta<\/p>/);
    expect(ajustes).not.toMatch(/Preciso de outra unidade/);
  });

  it('o cartão Unidades só aparece com mais de uma unidade', () => {
    const cartao = ler('../../components/config/CartoesConfig.jsx');
    const unid = cartao.slice(cartao.indexOf('export function CartaoUnidades'), cartao.indexOf('export function CartaoContas'));
    expect(unid).toMatch(/if \(!temUnidadesExtras\(unidades\)\) return null;/);
  });

  it('Planos e pagamento tem as três seções novas, nos dois planos', () => {
    expect(pagamento).toMatch(/<Layout title="Planos e pagamento"/);
    expect(pagamento).toMatch(/<SecaoUnidades \/>\s*<SecaoContas \/>\s*<SecaoCozinhaPro \/>/);
    expect(ler('../../pages/Administracao.jsx')).toMatch(/titulo: 'Planos e pagamento'/);
    // os links levam direto à seção
    expect(pagamento).toMatch(/document\.getElementById\(hash\.slice\(1\)\)\?\.scrollIntoView/);
    expect(extras).toMatch(/<section id="unidades"/);
    expect(extras).toMatch(/<section id="contas"/);
  });

  it('unidade: explica, mostra a conta pronta e o pedido chega com nome e CNPJ', () => {
    expect(extras).toMatch(/mensalCombinado\(prod\.id, extras \+ 1, sessao\?\.desconto\)/);
    expect(extras).toMatch(/começa na próxima cobrança depois disso, sem cobrar os dias quebrados/);
    expect(extras).toMatch(/tipoPedido: 'unidade'/);
    expect(extras).toMatch(/if \(!validarCNPJ\(form\.cnpj\)\)/);
    expect(mensalComUnidades('etiquetas', 1)).toBe(199.87);
    expect(adicionalUnidade('etiquetas')).toBe(49.97);
  });

  it('contas a mais: sem cobrança, a Aurum libera; e "sem vagas" leva até o pedido', () => {
    expect(extras).toMatch(/tipoPedido: 'contas'/);
    expect(extras).toMatch(/Peça aqui, sem custo/);
    expect(ler('../../components/config/CartoesConfig.jsx')).toMatch(/vagas <= 0 && !sessao\?\.eSuperAdmin && \(\s*<Link to="\/pagamento#contas"/);
  });

  it('o suporte da Aurum e a demonstração não mandam pedido pelo cliente', () => {
    expect(extras).toMatch(/return !impersonando && !sessao\?\.eSuperAdmin && sessao\?\.cargo === 'diretoria';/);
    expect(extras).toMatch(/if \(sessao\?\.demo\) return 'demo';/);
  });
});

describe('painel: onde criar a unidade e quem paga', () => {
  const admin = ler('../../pages/Admin.jsx');

  it('"+ Unidade para um cliente" ao lado de "Abrir conta", e o aviso dentro do Abrir conta', () => {
    expect(admin).toMatch(/\+ Unidade para um cliente \(outro CNPJ\)/);
    expect(admin).toMatch(/irAoRestaurante\(r\.id\);\s*abrirUnidade\(r\);/);
    expect(admin).toMatch(/Outra casa de um cliente que já existe\? Não abra conta nova/);
  });

  it('o pedido de unidade vira "Criar esta unidade" com o formulário preenchido', () => {
    expect(admin).toMatch(/d\.tipoPedido === 'unidade' && fb\.restaurante_id/);
    expect(admin).toMatch(/cnpj: formatarCNPJ\(d\.unidadeCnpj \|\| ''\)/);
    expect(admin).toMatch(/d\.tipoPedido === 'contas' && fb\.restaurante_id/);
  });

  it('o cartão diz que o adicional é pago na conta principal, com o total', () => {
    expect(admin).toMatch(/Tudo é pago nesta conta: plano R\$/);
    expect(admin).toMatch(/mensalComUnidades\(r\.produto, extrasDe\(r\)\)/);
  });
});
