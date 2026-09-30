// =====================================================================
//  DESCONTO COMBINADO e COBRANÇA À PARTE (M54, 28/09/2026)
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  descontoAtivo, aplicarDesconto, mensalCombinado, precoPlano, planoPorId, economiaPlano,
  cobrancaDaUnidade, rotuloDesconto, descontoDaLinha,
} from '../assinatura';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const AGORA = new Date(2026, 8, 28, 12).getTime(); // 28/09/2026, meio-dia local

describe('desconto combinado', () => {
  it('em reais: R$ 30 a menos por mês; em percentual: 15% a menos', () => {
    expect(mensalCombinado('etiquetas', 0, { tipo: 'valor', valor: 30 }, AGORA)).toBe(119.9);
    expect(mensalCombinado('etiquetas', 0, { tipo: 'percentual', valor: 15 }, AGORA)).toBe(127.42); // 127,415: o meio centavo sobe
    // com uma unidade: vale sobre o mês inteiro (plano + unidade)
    expect(mensalCombinado('etiquetas', 1, { tipo: 'percentual', valor: 10 }, AGORA)).toBe(179.88);
  });

  it('depois vem o desconto do período (semestral 5%, anual 10%)', () => {
    const d = { tipo: 'valor', valor: 30 };
    expect(precoPlano(planoPorId('anual'), 'etiquetas', 0, d, AGORA)).toBe(1294.92); // 119,90 × 12 × 0,9
    expect(precoPlano(planoPorId('mensal'), 'etiquetas', 0, d, AGORA)).toBe(119.9);
    expect(economiaPlano(planoPorId('anual'), 'etiquetas', 0, d, AGORA)).toBe(143.88);
    // sem desconto, tudo como sempre foi
    expect(precoPlano(planoPorId('mensal'), 'etiquetas', 0, null, AGORA)).toBe(149.9);
    expect(precoPlano(planoPorId('mensal'), 'etiquetas')).toBe(149.9);
  });

  it('vale até a data (inclusive) e depois some sozinho; nunca deixa o mês negativo', () => {
    expect(descontoAtivo({ tipo: 'valor', valor: 30, ate: '2026-09-28' }, AGORA)).not.toBeNull();
    expect(descontoAtivo({ tipo: 'valor', valor: 30, ate: '2026-09-27' }, AGORA)).toBeNull();
    expect(descontoAtivo({ tipo: 'xyz', valor: 30 }, AGORA)).toBeNull();
    expect(descontoAtivo(null, AGORA)).toBeNull();
    expect(aplicarDesconto(100, { tipo: 'valor', valor: 500 }, AGORA)).toBe(0);
    expect(aplicarDesconto(100, { tipo: 'percentual', valor: 200 }, AGORA)).toBe(10); // teto de 90%
  });

  it('rótulos e a leitura da linha do banco', () => {
    expect(rotuloDesconto({ tipo: 'percentual', valor: 15 })).toBe('15%');
    expect(rotuloDesconto({ tipo: 'valor', valor: 30 })).toBe('R$ 30,00/mês');
    expect(descontoDaLinha({ desconto_tipo: 'valor', desconto_valor: '30.00', desconto_ate: null })).toMatchObject({ tipo: 'valor', valor: 30 });
    expect(descontoDaLinha({})).toBeNull();
  });
});

describe('cobrança à parte da unidade (período já pago)', () => {
  const ate = (dias) => new Date(AGORA + dias * 86400000).toISOString();

  it('anual pago com 5 meses pela frente: 5 × R$ 49,97 com os 10% do anual', () => {
    const c = cobrancaDaUnidade({ produto: 'etiquetas', assinaturaAte: ate(150), planoPago: 'anual', agora: AGORA });
    expect(c).toEqual({ meses: 5, valor: 224.87 }); // 49,97 × 5 × 0,9
  });

  it('semestral com 3 meses e pouco: arredonda o mês para cima, com os 5%', () => {
    const c = cobrancaDaUnidade({ produto: 'etiquetas', assinaturaAte: ate(95), planoPago: 'semestral', agora: AGORA });
    expect(c).toEqual({ meses: 4, valor: 189.89 }); // 49,97 × 4 × 0,95
  });

  it('faltando 31 dias ou menos (quem paga mês a mês), não há cobrança à parte', () => {
    expect(cobrancaDaUnidade({ produto: 'etiquetas', assinaturaAte: ate(20), planoPago: 'mensal', agora: AGORA })).toBeNull();
    expect(cobrancaDaUnidade({ produto: 'etiquetas', assinaturaAte: null, planoPago: 'anual', agora: AGORA })).toBeNull();
  });

  it('o desconto combinado em percentual vale também na unidade; o em reais, não (já é por mês na conta)', () => {
    const pct = cobrancaDaUnidade({ produto: 'etiquetas', assinaturaAte: ate(150), planoPago: 'anual', desconto: { tipo: 'percentual', valor: 10 }, agora: AGORA });
    expect(pct.valor).toBe(202.37); // 44,97 × 5 × 0,9
    const rs = cobrancaDaUnidade({ produto: 'etiquetas', assinaturaAte: ate(150), planoPago: 'anual', desconto: { tipo: 'valor', valor: 30 }, agora: AGORA });
    expect(rs.valor).toBe(224.87);
  });
});

describe('ligado nas telas e no banco', () => {
  it('o cliente vê o desconto e o preço cheio riscado; o Pix sai com ele', () => {
    const pag = ler('../../pages/Pagamento.jsx');
    expect(pag).toMatch(/const desconto = descontoAtivo\(sessao\?\.desconto\);/);
    expect(pag).toMatch(/cheio > total && \(/);
    expect(pag).toMatch(/<SecaoCobrancasAvulsas pix=/);
  });

  it('o painel dá desconto, lança e baixa a cobrança à parte, e sugere a da unidade', () => {
    const adm = ler('../../pages/Admin.jsx');
    expect(adm).toMatch(/supabase\.rpc\('definir_desconto'/);
    expect(adm).toMatch(/supabase\.rpc\('lancar_cobranca_avulsa'/);
    expect(adm).toMatch(/supabase\.rpc\('baixar_cobranca_avulsa'/);
    expect(adm).toMatch(/await sugerirCobrancaDaUnidade\(r, data\.nome\);/);
    expect(adm).toMatch(/if \(!arquivar\) await sugerirCobrancaDaUnidade\(r, u\.nome\);/);
  });

  it('M54: só a Aurum grava; o cliente lê só as próprias cobranças; grants com sonda', () => {
    const sql = ler('../../lib/migration54_desconto_e_cobranca_a_parte.sql');
    expect(sql).toMatch(/if not coalesce\(sou_super_admin\(\), false\) then\s*raise exception 'Apenas o administrador do sistema define desconto\.'/);
    expect(sql).toMatch(/where c\.restaurante_id = meu_restaurante_id\(\)/);
    expect(sql).toMatch(/if exists \(select 1 from pg_policies where tablename = 'cobrancas_avulsas'\)/);
    expect(sql).toMatch(/desconto_tipo = 'percentual' and desconto_valor > 0 and desconto_valor <= 90/);
  });
});

describe('achados da análise de 28/09 corrigidos na hora', () => {
  it('contagem por QR: a medida da etiqueta vira a unidade do produto', async () => {
    const { quantoSomaNaContagem } = await import('../etiquetas');
    expect(quantoSomaNaContagem('150 g', 'kg')).toBe(0.15);      // somava 150
    expect(quantoSomaNaContagem('2 kg', 'kg')).toBe(2);
    expect(quantoSomaNaContagem('1,5 kg', 'g')).toBe(1500);
    expect(quantoSomaNaContagem('500 mL', 'L')).toBe(0.5);
    expect(quantoSomaNaContagem('2', 'kg')).toBe(2);             // sem unidade: a do produto
    expect(quantoSomaNaContagem('qualquer', 'unid')).toBe(1);
    expect(quantoSomaNaContagem('500 mL', 'kg')).toBeNull();     // não converte: pede para digitar
    expect(quantoSomaNaContagem('1 maço', 'kg')).toBeNull();
    expect(quantoSomaNaContagem('', 'kg')).toBeNull();
  });

  it('o aviso do "recuperar senha" é legível; o Pro cadastra pelo Meus itens; bloqueio distingue quem pagou', () => {
    expect(ler('../../pages/Login.jsx')).not.toMatch(/text-white\/60 -mt-1/);
    expect(ler('../../pages/Registrar.jsx')).toMatch(/\{ to: '\/itens', icone: 'caixa', titulo: 'Produtos do estoque'/);
    expect(ler('../../pages/Dashboard.jsx')).not.toMatch(/to="\/configuracoes\?secao=produtos"/);
    expect(ler('../../App.jsx')).toMatch(/eraAssinante \? 'Sua assinatura venceu'/);
  });

  it('M55: conta sem liberação não grava etiqueta; teto por dia; 2 KB por etiqueta', () => {
    const sql = ler('../../lib/migration55_trava_de_gravacao_etiquetas.sql');
    expect(sql).toMatch(/where _pode_gravar_etiqueta\(rid, x\.impresso_em\)/);
    expect(sql).toMatch(/and _pode_gravar_etiqueta\(rid, \(e->>'dia'\)::date\)/);
    expect(sql).toMatch(/>= 5000 then\s*raise exception 'Limite diário de etiquetas atingido/);
    expect(sql).toMatch(/check \(pg_column_size\(dados\) <= 2048\)/);
    expect(sql).toMatch(/revoke all on function _pode_gravar_etiqueta\(uuid, date\) from public, anon, authenticated;/);
  });
});
