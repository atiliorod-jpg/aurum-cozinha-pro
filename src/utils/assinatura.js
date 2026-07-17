// Regras do plano único (R$149/mês) + período de teste de 7 dias.
// Sem webhook de pagamento: a ativação é manual (super-admin, RPC ativar_assinatura).
// Desde a migração 10 o corte também vale no banco (restaurante_pode_escrever),
// além do bloqueio visual no app.
//
// ⚠️ PARIDADE: TESTE_DIAS precisa ser IGUAL ao "interval '7 days'" usado em
// restaurante_pode_escrever (migration10). Mudou aqui, mude lá também — senão o
// app diz "ok" e o banco nega a escrita (ou vice-versa).
export const TESTE_DIAS = 7;
export const PRECO_MES = 149;

/**
 * Situação do plano de uma sessão:
 *  { ok:true,  tipo:'assinatura', ate }            — assinatura ativa
 *  { ok:true,  tipo:'teste', diasRestantes, ate }  — dentro do teste de 7 dias
 *  { ok:false, tipo:'vencido' }                    — teste e assinatura vencidos
 *  { ok:false, tipo:'bloqueado' }                  — conta suspensa pelo administrador
 *  { ok:true,  tipo:'isento' }                     — super-admin/demo/sem restaurante
 */
export function statusAssinatura(sessao, agora = Date.now()) {
  if (!sessao?.restauranteId || sessao.eSuperAdmin || sessao.demo) return { ok: true, tipo: 'isento' };
  // bloqueio comercial (migração 9) passa por cima até de assinatura ativa
  if (sessao.bloqueado) return { ok: false, tipo: 'bloqueado' };
  const assin = sessao.assinaturaAte ? new Date(sessao.assinaturaAte).getTime() : 0;
  if (assin > agora) return { ok: true, tipo: 'assinatura', ate: assin };
  const criado = sessao.restauranteCriadoEm ? new Date(sessao.restauranteCriadoEm).getTime() : agora;
  const fimTeste = criado + TESTE_DIAS * 86400000;
  if (fimTeste > agora) {
    return { ok: true, tipo: 'teste', ate: fimTeste, diasRestantes: Math.max(1, Math.ceil((fimTeste - agora) / 86400000)) };
  }
  return { ok: false, tipo: 'vencido' };
}

/**
 * Mesma régua, mas para o PAINEL ADMIN olhar um restaurante qualquer
 * (linha da tabela restaurantes: created_at, assinatura_ate, bloqueado).
 */
export function statusRestaurante(rest, agora = Date.now()) {
  return statusAssinatura({
    restauranteId: rest?.id,
    restauranteCriadoEm: rest?.created_at || null,
    assinaturaAte: rest?.assinatura_ate || null,
    bloqueado: !!rest?.bloqueado,
  }, agora);
}
