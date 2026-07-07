// Regras do plano único (R$149/mês) + período de teste de 7 dias.
// Sem webhook de pagamento: a ativação é manual (super-admin, RPC ativar_assinatura).
// O "corte" ao vencer é VISUAL (tela de bloqueio no app) — decisão do dono 07/07/2026.

export const TESTE_DIAS = 7;
export const PRECO_MES = 149;

/**
 * Situação do plano de uma sessão:
 *  { ok:true,  tipo:'assinatura', ate }            — assinatura ativa
 *  { ok:true,  tipo:'teste', diasRestantes, ate }  — dentro do teste de 7 dias
 *  { ok:false, tipo:'vencido' }                    — teste e assinatura vencidos
 *  { ok:true,  tipo:'isento' }                     — super-admin/demo/sem restaurante
 */
export function statusAssinatura(sessao, agora = Date.now()) {
  if (!sessao?.restauranteId || sessao.eSuperAdmin || sessao.demo) return { ok: true, tipo: 'isento' };
  const assin = sessao.assinaturaAte ? new Date(sessao.assinaturaAte).getTime() : 0;
  if (assin > agora) return { ok: true, tipo: 'assinatura', ate: assin };
  const criado = sessao.restauranteCriadoEm ? new Date(sessao.restauranteCriadoEm).getTime() : agora;
  const fimTeste = criado + TESTE_DIAS * 86400000;
  if (fimTeste > agora) {
    return { ok: true, tipo: 'teste', ate: fimTeste, diasRestantes: Math.max(1, Math.ceil((fimTeste - agora) / 86400000)) };
  }
  return { ok: false, tipo: 'vencido' };
}
