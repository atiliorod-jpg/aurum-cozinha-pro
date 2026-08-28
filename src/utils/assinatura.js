// Regras comerciais: DOIS produtos + período de teste de 7 dias.
// Sem webhook de pagamento: a ativação é manual (super-admin, RPC ativar_assinatura).
// Desde a migração 10 o corte também vale no banco (restaurante_pode_escrever),
// além do bloqueio visual no app.
//
// ⚠️ PARIDADE: TESTE_DIAS precisa ser IGUAL ao "interval '7 days'" usado em
// restaurante_pode_escrever (migration10). Mudou aqui, mude lá também — senão o
// app diz "ok" e o banco nega a escrita (ou vice-versa).
//
// ⚠️ E o PRODUTO não entra nessa paridade, de propósito: o corte de teste/
// assinatura/bloqueio é idêntico nos dois produtos, então a frase acima segue
// verdadeira. Produto é o que a conta COMPROU (interface, ver utils/produto.js);
// validade é se a conta PODE ESCREVER (acesso, espelhado no banco). Misturar os
// dois aqui faria este comentário virar mentira.
export const TESTE_DIAS = 7;

// ⚠️ DOIS EIXOS INDEPENDENTES, e os nomes existem para não confundi-los:
//   PRODUTOS → O QUE a conta comprou   (etiquetas | completo)
//   PLANOS   → POR QUANTO TEMPO pagou  (mensal | semestral | anual)
// Existe "etiquetas anual" e "completo mensal". Antes disto havia produto único
// (PRECO_MES = 149), que saiu junto com a criação do Aurum Etiquetas.
export const PRODUTOS = {
  etiquetas: {
    id: 'etiquetas',
    label: 'Aurum Etiquetas',
    precoMes: 270,
    resumo: 'Etiquetas de validade: imprimir, cadastrar itens e acompanhar o que vence.',
  },
  completo: {
    id: 'completo',
    label: 'Aurum Cozinha Pro',
    precoMes: 500,
    resumo: 'Estoque, compras, produção, receitas, relatórios — e as etiquetas junto.',
  },
};
export const PRODUTO_PADRAO = 'completo';
// Aceita tanto o id ('etiquetas') quanto a sessão inteira — as telas chamam dos
// dois jeitos, e um `sessao.produto` indefinido tem que cair no completo.
export const produtoDe = (produtoOuSessao) => {
  const id = typeof produtoOuSessao === 'string' ? produtoOuSessao : produtoOuSessao?.produto;
  return PRODUTOS[id] || PRODUTOS[PRODUTO_PADRAO];
};

// Planos de pagamento (Pix manual). Semestral -5%, anual -10%.
// `dias` é quanto o super-admin adiciona ao ativar (30 dias = 1 mês, como o teste).
//
// ⚠️ Os descontos eram 10% e 20% e o dono baixou para 5% e 10% em 28/08/2026.
// Com o mensal a R$500, 20% de desconto anual dava R$1.200 de abatimento — um
// mês inteiro de faturamento por cliente, para um serviço cujo custo não cai
// quando o pagamento é adiantado. Os testes de preço travam esses números.
export const PLANOS = [
  { id: 'mensal',    label: 'Mensal',    meses: 1,  dias: 30,  desconto: 0    },
  { id: 'semestral', label: 'Semestral', meses: 6,  dias: 180, desconto: 0.05 },
  { id: 'anual',     label: 'Anual',     meses: 12, dias: 365, desconto: 0.10 },
];

const r2 = (n) => Math.round(n * 100) / 100;
const mensalDe = (produto) => produtoDe(produto).precoMes;
// Preço TOTAL do período, já com o desconto aplicado.
export const precoPlano = (plano, produto) => r2(mensalDe(produto) * plano.meses * (1 - plano.desconto));
// Quanto sai por mês naquele plano (para mostrar "equivale a R$X/mês").
export const precoMensalEquivalente = (plano, produto) => r2(precoPlano(plano, produto) / plano.meses);
// Quanto o cliente economiza vs. pagar mês a mês.
export const economiaPlano = (plano, produto) => r2(mensalDe(produto) * plano.meses - precoPlano(plano, produto));
export const planoPorId = (id) => PLANOS.find(p => p.id === id) || PLANOS[0];

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
