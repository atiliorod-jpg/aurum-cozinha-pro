// Regras comerciais: DOIS produtos + período de teste de 14 dias.
// Sem webhook de pagamento: a ativação é manual (super-admin, RPC ativar_assinatura).
// Desde a migração 10 o corte também vale no banco (restaurante_pode_escrever),
// além do bloqueio visual no app.
//
// ⚠️ PARIDADE: TESTE_DIAS precisa ser IGUAL ao "interval '14 days'" usado em
// restaurante_pode_escrever — recriada na MIGRAÇÃO 40. Mudou aqui, mude lá
// também: o app diria "ok" e o banco negaria a escrita, e como o app é
// offline-first o lançamento entra na fila e some sem erro visível na tela.
//
// ⚠️ E o PRODUTO não entra nessa paridade, de propósito: o corte de teste/
// assinatura/bloqueio é idêntico nos dois produtos, então a frase acima segue
// verdadeira. Produto é o que a conta COMPROU (interface, ver utils/produto.js);
// validade é se a conta PODE ESCREVER (acesso, espelhado no banco). Misturar os
// dois aqui faria este comentário virar mentira.
// ⚠️ ISTO NÃO CONCEDE NADA — é só a SUGESTÃO que o painel oferece quando a
// Aurum vai liberar um teste. Até 03/09/2026 este número era a régua: quem se
// cadastrasse ganhava o acesso sozinho, sem falar com ninguém. Hoje o acesso é
// uma data escolhida conta a conta (`teste_ate`, M41) e cadastro novo nasce
// SEM acesso.
//
// 14 continua sendo a sugestão porque o produto se vende com a impressora
// junto: o cliente precisa cadastrar itens, ESPERAR O CORREIO trazer a MDK-022
// e o rolo, conectar por Bluetooth e imprimir. Prazo menor acaba antes de a
// caixa chegar, e a pessoa julga o produto sem nunca ter visto uma etiqueta.
export const TESTE_DIAS = 14;

// ⚠️ DOIS EIXOS INDEPENDENTES, e os nomes existem para não confundi-los:
//   PRODUTOS → O QUE a conta comprou   (etiquetas | completo)
//   PLANOS   → POR QUANTO TEMPO pagou  (mensal | semestral | anual)
// Existe "etiquetas anual" e "completo mensal". Antes disto havia produto único
// (PRECO_MES = 149), que saiu junto com a criação do Aurum Etiquetas.
export const PRODUTOS = {
  etiquetas: {
    id: 'etiquetas',
    label: 'Aurum Etiquetas',
    // ⚠️ 279,90 desde 03/09/2026 (era 249). O preço é a fonte da verdade: as
    // telas e os planos semestral/anual saem daqui por cálculo, nunca de número
    // digitado noutro lugar.
    precoMes: 279.90,
    // ⚠️ NÃO prometer "acompanhar o que vence": a tela de Validades saiu deste
    // produto de propósito — ele imprime a data na etiqueta, não monitora
    // vencimento. Quem quer acompanhamento compra o completo. Prometer aqui é
    // vender tela que a conta não tem, na hora exata da decisão de compra.
    resumo: 'Imprime as etiquetas de validade: cadastro de itens, prazo por armazenamento e biblioteca pronta.',
  },
  completo: {
    id: 'completo',
    label: 'Aurum Cozinha Pro',
    precoMes: 399,
    resumo: 'Estoque, compras, produção, receitas, relatórios — e as etiquetas junto.',
    // ⚠️ AINDA NÃO SE VENDE. O produto existe e funciona, mas está em teste — e
    // vender agora é assumir suporte de um app que ainda vai mudar de forma.
    // A tela de cadastro mostra "em breve" e não deixa escolher; o super-admin
    // continua podendo ATIVAR uma conta nele pelo painel, que é como um piloto
    // começa.
    emBreve: true,
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
 *  { ok:true,  tipo:'teste', diasRestantes, ate }  — dentro do teste (TESTE_DIAS)
 *  { ok:false, tipo:'vencido' }                    — teste e assinatura vencidos
 *  { ok:false, tipo:'bloqueado' }                  — conta suspensa pelo administrador
 *  { ok:true,  tipo:'cortesia', regime, ate }     — não paga, por decisão da Aurum
 *  { ok:true,  tipo:'isento' }                     — super-admin/demo/sem restaurante
 */
export function statusAssinatura(sessao, agora = Date.now()) {
  if (!sessao?.restauranteId || sessao.eSuperAdmin || sessao.demo) return { ok: true, tipo: 'isento' };
  // bloqueio comercial (migração 9) passa por cima até de assinatura ativa
  if (sessao.bloqueado) return { ok: false, tipo: 'bloqueado' };
  // ⚠️ CORTESIA VEM ANTES DA ASSINATURA, e a ordem é a regra: uma conta de
  // cortesia que por acaso tenha data de assinatura em dia continua sendo
  // cortesia. Se a assinatura ganhasse, a conta apareceria como pagante no
  // painel e entraria na receita — que é exatamente o erro que o regime
  // existe para evitar. Espelhado em restaurante_pode_escrever (M37): app e
  // banco liberam pelo MESMO critério, senão o lançamento entra na fila
  // offline e some sem erro na tela.
  const regime = sessao.regime || 'pagante';
  if (regime !== 'pagante') {
    const ate = sessao.cortesiaAte ? new Date(sessao.cortesiaAte).getTime() : null;
    if (!ate || ate > agora) return { ok: true, tipo: 'cortesia', regime, ate };
    // Cortesia com prazo vencido volta a valer a régua normal — não bloqueia
    // sozinha: a conta pode ter assinatura em dia por baixo.
  }
  const assin = sessao.assinaturaAte ? new Date(sessao.assinaturaAte).getTime() : 0;
  if (assin > agora) return { ok: true, tipo: 'assinatura', ate: assin };

  // ⚠️ O TESTE DEIXOU DE SER AUTOMÁTICO (M41, 03/09/2026). Antes saía de
  // `criado + TESTE_DIAS`: qualquer um que preenchesse o cadastro entrava por
  // duas semanas sem falar com ninguém. Agora é uma DATA que a Aurum escolhe
  // conta a conta, e cadastro novo nasce SEM acesso, esperando a liberação.
  //
  // ⚠️ E é uma data PRÓPRIA, não `assinaturaAte`: conta em teste não é receita.
  // Dar o teste como assinatura a faria aparecer como "Ativo" no painel e
  // entrar no cálculo de quanto entra por mês — o mesmo erro que o `regime`
  // existe para evitar com as cortesias.
  const teste = sessao.testeAte ? new Date(sessao.testeAte).getTime() : 0;
  if (teste > agora) {
    return { ok: true, tipo: 'teste', ate: teste, diasRestantes: Math.max(1, Math.ceil((teste - agora) / 86400000)) };
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
    regime: rest?.regime || 'pagante',
    cortesiaAte: rest?.cortesia_ate || null,
    // ⚠️ Sem esta linha o painel mostraria como VENCIDA justamente a conta a
    // quem a Aurum acabou de dar o teste — e ela entraria na fila de cobrança.
    testeAte: rest?.teste_ate || null,
  }, agora);
}

/** Rótulo curto do regime, para o selo do painel. '' = cliente normal. */
export const rotuloRegime = (regime) =>
  regime === 'cortesia' ? 'Cortesia' : regime === 'parceiro' ? 'Parceiro' : '';
