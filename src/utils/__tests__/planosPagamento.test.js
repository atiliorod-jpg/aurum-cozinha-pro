// =====================================================================
//  PLANOS E PAGAMENTO (27/09/2026) — pedido do dono: CNPJ inteiro na
//  etiqueta; a Administração do cliente enxuta, com a conta e o Pro em
//  "Planos e pagamento".
//  ⚠️ 24/11/2026: saíram as unidades (outro CNPJ = outra conta) e as contas
//  da equipe (login da casa); entrou o aparelho a mais (M64).
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { etiquetaTSPL } from '../tspl';
import { mensalComAparelhos } from '../assinatura';

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
  // a Administração dos dois planos (Lote 4): o plano mora no grupo Conta
  const ajustes = ler('../../pages/AdministracaoGrupo.jsx');
  const pagamento = ler('../../pages/Pagamento.jsx');
  const extras = ler('../../components/PlanoExtras.jsx');

  it('a Administração tem uma linha do plano, sem o cartão grande nem o anúncio do Pro', () => {
    expect(ajustes).toMatch(/\{a\.plano && <ResumoDoPlano \/>\}/);
    expect(ler('../../store/acessosAdmin.js')).toMatch(/plano: dono && !sessao\?\.eSuperAdmin,/);
    expect(ajustes).not.toMatch(/O Aurum Cozinha Pro/);
    expect(ajustes).not.toMatch(/Sua conta<\/p>/);
    expect(ajustes).not.toMatch(/Preciso de outra unidade/);
  });

  it('Planos e pagamento: impressora e Cozinha Pro; sem unidades e sem contas da equipe', () => {
    expect(pagamento).toMatch(/<Layout title="Planos e pagamento"/);
    expect(pagamento).toMatch(/<SecaoImpressora impressoras=\{impressoras\} \/>\s*<SecaoCozinhaPro \/>/);
    expect(pagamento).not.toMatch(/SecaoUnidades|SecaoContas/);
    expect(extras).not.toMatch(/<section id="unidades"|<section id="contas"/);
    expect(extras).toMatch(/Planos e pagamento<\/span>/);
    expect(pagamento).toMatch(/document\.getElementById\(hash\.slice\(1\)\)\?\.scrollIntoView/);
  });

  it('o plano diz quantos aparelhos inclui e quanto custa o aparelho a mais', () => {
    expect(pagamento).toMatch(/Inclui \{inclusos\} aparelhos conectados\. Aparelho a mais: \{brl\(ADICIONAL_APARELHO\)\} por mês/);
    expect(pagamento).toMatch(/'Até 3 aparelhos conectados na mesma conta'/);
    expect(mensalComAparelhos('etiquetas', 1)).toBe(119.9);
  });

  it('menos texto: sem a caixa "Como funciona" e sem o parágrafo repetido do Pix', () => {
    expect(pagamento).not.toMatch(/Como funciona<\/p>/);
    expect(pagamento).not.toMatch(/Ao confirmar, a equipe Aurum é avisada/);
  });

  it('o suporte da Aurum e a demonstração não mandam pedido pelo cliente', () => {
    expect(extras).toMatch(/return !impersonando && !sessao\?\.eSuperAdmin && sessao\?\.cargo === 'diretoria';/);
    expect(extras).toMatch(/if \(sessao\?\.demo\) return 'demo';/);
  });
});

describe('painel: outro CNPJ é outra conta (24/11/2026)', () => {
  const admin = ler('../../pages/Admin.jsx');

  it('só "+ Abrir conta de cliente"; sem "+ Unidade para um cliente" nem o aviso de não abrir conta', () => {
    expect(admin).toMatch(/\+ Abrir conta de cliente/);
    expect(admin).not.toMatch(/\+ Unidade para um cliente|Outra casa de um cliente que já existe/);
  });

  it('o pedido de unidade não vira mais formulário; o de impressora continua com atalho', () => {
    expect(admin).not.toMatch(/d\.tipoPedido === 'unidade'/);
    expect(admin).toMatch(/d\.tipoPedido === 'impressora' && fb\.restaurante_id/);
  });
});
