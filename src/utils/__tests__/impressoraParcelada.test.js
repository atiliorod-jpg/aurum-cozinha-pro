// =====================================================================
//  PREÇO NOVO E IMPRESSORA PARCELADA (M60, decisão do dono em 30/09/2026)
//  Etiquetas a R$ 149,90; impressora 12 × R$ 60, 2 × R$ 290 ou 1 × R$ 560,
//  no mesmo Pix do sistema; quitada, é do cliente.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PRODUTOS, IMPRESSORA_PARCELADA, totalDaImpressora, impressoraEmPagamento,
  parcelaDasImpressoras, saldoDaImpressora, precoPlano, planoPorId, adicionalUnidade,
} from '../assinatura';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const imp = (extra = {}) => ({
  id: 'i1', forma: 'mensal', parcelas: 12, valor_parcela: '60.00', parcelas_pagas: 0,
  inicio: '2026-10-01', saldo_cobrado_em: null, removida_em: null, ...extra,
});

describe('a tabela da impressora', () => {
  it('é a do dono: 12 × 60, 2 × 290, 1 × 560', () => {
    expect(IMPRESSORA_PARCELADA).toEqual({
      mensal: { parcelas: 12, valor: 60 }, semestral: { parcelas: 2, valor: 290 }, anual: { parcelas: 1, valor: 560 },
    });
    expect(totalDaImpressora('mensal')).toBe(720);
    expect(totalDaImpressora('semestral')).toBe(580);
    expect(totalDaImpressora('anual')).toBe(560);
    expect(totalDaImpressora('xpto')).toBe(0);
  });

  it('com o sistema, o 1º ano fecha nos números que o dono viu', () => {
    expect(PRODUTOS.etiquetas.precoMes).toBe(149.9);
    expect(adicionalUnidade('etiquetas')).toBe(49.97);
    const com = (forma) => Math.round((precoPlano(planoPorId(forma), 'etiquetas') + IMPRESSORA_PARCELADA[forma].valor) * 100) / 100;
    expect(com('mensal')).toBe(209.9);
    expect(com('semestral')).toBe(1144.43);
    expect(com('anual')).toBe(2178.92);
  });
});

describe('a parcela que entra no próximo Pix', () => {
  it('sem impressora: nada muda', () => {
    expect(parcelaDasImpressoras([])).toEqual({ forma: null, linhas: [], total: 0 });
    expect(parcelaDasImpressoras(undefined).total).toBe(0);
  });

  it('em pagamento: a próxima parcela, com "n de N", e a forma trava o plano', () => {
    const p = parcelaDasImpressoras([imp({ parcelas_pagas: 2 })]);
    expect(p.forma).toBe('mensal');
    expect(p.total).toBe(60);
    expect(p.linhas).toEqual([{ id: 'i1', unidadeId: null, forma: 'mensal', valor: 60, numero: 3, de: 12 }]);
  });

  it('duas impressoras (a da unidade também): as duas parcelas somam', () => {
    expect(parcelaDasImpressoras([imp(), imp({ id: 'i2', parcelas_pagas: 5 })]).total).toBe(120);
  });

  it('quitada, removida ou com o saldo já cobrado à parte: sai da conta sozinha', () => {
    for (const x of [imp({ parcelas_pagas: 12 }), imp({ removida_em: '2026-10-02' }), imp({ saldo_cobrado_em: '2026-10-02' })]) {
      expect(impressoraEmPagamento(x)).toBe(false);
      expect(parcelaDasImpressoras([x]).total).toBe(0);
      expect(saldoDaImpressora(x)).toBe(0);
    }
  });

  it('o saldo é o que falta pagar', () => {
    expect(saldoDaImpressora(imp({ parcelas_pagas: 2 }))).toBe(600);
    expect(saldoDaImpressora(imp({ forma: 'semestral', parcelas: 2, valor_parcela: 290, parcelas_pagas: 1 }))).toBe(290);
  });
});

describe('as telas usam a mesma conta', () => {
  const pag = ler('../../pages/Pagamento.jsx');
  const adm = ler('../../pages/Admin.jsx');
  const extras = ler('../../components/PlanoExtras.jsx');

  it('Planos e pagamento: trava a forma, soma a parcela no Pix e mostra o que compõe o valor', () => {
    expect(pag).toMatch(/const planoId = imp\.forma \|\| planoEscolhido;/);
    expect(pag).toMatch(/const planosVisiveis = imp\.forma \? PLANOS\.filter\(p => p\.id === imp\.forma\) : PLANOS;/);
    expect(pag).toMatch(/const valor = Math\.round\(\(valorSistema \+ imp\.total \+ valorEncargo\) \* 100\) \/ 100;/);
    expect(pag).toMatch(/Impressora: parcela \{l\.numero\} de \{l\.de\}/);
    expect(pag).toMatch(/<SecaoImpressora impressoras=\{impressoras\} \/>/);
    expect(pag).not.toMatch(/ℹ️/);
  });

  it('o cliente pede a impressora pela Ajuda, e o painel tem o atalho "Vender a impressora"', () => {
    expect(extras).toMatch(/tipoPedido: 'impressora', forma: formaDoPedido/);
    expect(adm).toMatch(/d\.tipoPedido === 'impressora'/);
    expect(adm).toMatch(/abrirVendaImpressora\(r, IMPRESSORA_PARCELADA\[d\.forma\] \? d\.forma : 'mensal'\)/);
  });

  it('o registro de pagamento soma a parcela e só avança a impressora se a caixa dizia que ela veio junto', () => {
    expect(adm).toMatch(/const imp = incluiImpressora \? parcelaDasImpressoras\(impressoras\[r\.id\]\)\.total : 0;/);
    expect(adm).toMatch(/if \(c\.incluiImpressora && parcelaDasImpressoras\(impressoras\[r\.id\]\)\.total > 0\) \{/);
    expect(adm).toMatch(/supabase\.rpc\('pagar_parcela_impressora', \{ p_restaurante: r\.id \}\)/);
  });

  it('cancelou antes de quitar: "Cobrar o saldo" vira cobrança à parte', () => {
    expect(adm).toMatch(/supabase\.rpc\('cobrar_saldo_impressora', \{ p_id: i\.id \}\)/);
  });
});

describe('M60 no banco', () => {
  const sql = ler('../../lib/migration60_impressora_parcelada.sql');

  it('toda função de escrita é só do super-admin; o cliente só lê as suas', () => {
    for (const f of ['adicionar_impressora', 'pagar_parcela_impressora', 'corrigir_parcelas_impressora', 'cobrar_saldo_impressora', 'remover_impressora', 'impressoras_admin']) {
      const corpo = sql.slice(sql.indexOf(`create or replace function ${f}(`));
      expect(corpo.slice(0, 900)).toMatch(/if not coalesce\(sou_super_admin\(\), false\) then/);
    }
    expect(sql).toMatch(/where i\.restaurante_id = meu_restaurante_id\(\) and i\.removida_em is null/);
    expect(sql).toMatch(/revoke all on impressoras_vendidas from anon, authenticated;/);
    expect(sql).not.toMatch(/create policy/i);
  });

  it('uma forma de pagamento por vez, e o saldo vai para a cobrança à parte (M54)', () => {
    expect(sql).toMatch(/Esta conta já paga uma impressora no %\. Use a mesma forma de pagamento\./);
    expect(sql).toMatch(/perform lancar_cobranca_avulsa\(v\.restaurante_id,/);
    expect(sql).toMatch(/constraint impressoras_pagas_na_faixa check \(parcelas_pagas between 0 and parcelas\)/);
  });
});

describe('Termos 1.3', () => {
  const termos = ler('../../pages/Termos.jsx');
  const visivel = termos.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

  it('a impressora é vendida em parcelas, com os valores cobrados no sistema', () => {
    expect(termos).toMatch(/export const TERMOS_VERSAO = '1\.3';/);
    expect(visivel).toMatch(/12 parcelas mensais de R\$ 60,00, 2 parcelas semestrais de R\$ 290,00 ou 1 parcela\s+anual de R\$ 560,00/);
    expect(visivel).toMatch(/o saldo das parcelas da impressora é cobrado conforme o\s+contrato/);
  });

  it('não sobra a regra antiga (comodato, uma por grupo econômico, devolução)', () => {
    expect(visivel).not.toMatch(/comodato/i);
    expect(visivel).not.toMatch(/uma única vez por estabelecimento/);
    expect(visivel).not.toMatch(/devolução da impressora/);
  });
});
