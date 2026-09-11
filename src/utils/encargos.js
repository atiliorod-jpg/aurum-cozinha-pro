// =====================================================================
//  Encargos de atraso do contrato parcelado (M45)
//
//  A regra é a da cláusula 6ª do Contrato de Assinatura Anual: multa de 2%
//  sobre a parcela e juros de 1% ao mês, calculados dia a dia. O IPCA fica
//  de fora da conta automática (centavos em dias de atraso; ver a M45).
//
//  ⚠️ ESTA CONTA É A PRÉVIA DO PAINEL. Quem grava o valor é o banco
//  (`lancar_encargo`), com a MESMA fórmula — um teste compara as duas.
//  Função pura, em utils/, para ter teste (o projeto não tem jsdom).
// =====================================================================

import { diasDeAtraso } from './assinatura';

export const MULTA_ATRASO = 0.02;   // 2% sobre a parcela
export const JUROS_AO_MES = 0.01;   // 1% ao mês, pro rata dia (÷ 30)

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Multa + juros de uma parcela vencida em `vencimento`.
 * Devolve `null` quando não há o que cobrar (sem parcela, ou sem atraso).
 */
export function calcularEncargo(parcela, vencimento, agora = Date.now()) {
  const base = Number(parcela) || 0;
  const dias = diasDeAtraso(vencimento, agora);
  if (base <= 0 || dias <= 0) return null;
  const multa = r2(base * MULTA_ATRASO);
  const juros = r2((base * JUROS_AO_MES) / 30 * dias);
  return { base: r2(base), dias, multa, juros, total: r2(multa + juros) };
}
