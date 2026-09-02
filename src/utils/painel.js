// =====================================================================
//  Painel super-admin — as contas que respondem "o que eu faço hoje"
//
//  ⚠️ POR QUE ESTAS FUNÇÕES SAÍRAM DA TELA. O painel só abre com a conta
//  super-admin, então ninguém — nem eu, ao mexer — consegue conferir no
//  navegador se a fila trouxe quem devia. Aqui elas são funções puras com
//  teste: a regra de quem entra na fila e de quanto entra por mês passa a ser
//  verificável sem precisar da conta do dono.
//
//  ⚠️ E A SEPARAÇÃO É REAL, não organizacional: são REGRAS COMERCIAIS
//  (quem precisa de atenção, quanto a operação fatura), não desenho de tela.
// =====================================================================

import { statusRestaurante, produtoDe } from './assinatura';

// Aviso primeiro: é o único caso em que o CLIENTE está esperando resposta —
// ele avisou que pagou e está olhando para uma conta que ainda não liberou.
// Depois o teste acabando, que ainda dá para virar venda. Vencido por último:
// já aconteceu, e não fica pior por esperar mais uma hora.
// ⚠️ FEEDBACK LOGO DEPOIS DO AVISO, e pelo mesmo motivo: nos dois casos há
// alguém do outro lado ESPERANDO RESPOSTA. Teste acabando e vencido são
// coisas nossas, não do cliente — podem esperar mais uma hora.
const ORDEM = { aviso: 0, feedback: 1, teste: 2, vencido: 3 };

/** Quantos dias antes do fim do teste a conta entra na fila. */
export const DIAS_TESTE_ACABANDO = 2;

/**
 * A fila de trabalho do dia.
 *
 * Devolve `[{ r, tipo, quando }]` ordenado por urgência e, dentro de cada
 * tipo, do mais antigo para o mais novo — quem esperou mais aparece primeiro.
 */
export function filaDoPainel(restaurantes, agora = Date.now(), feedbacks = []) {
  const itens = [];

  // ⚠️ FEEDBACK ENTRA NA FILA (G5). O painel já contava feedback aberto num
  // selo vermelho lá embaixo, mas a fila do topo o ignorava — então com dois
  // feedbacks e nenhum aviso de pagamento a fila NÃO APARECIA, e a única
  // pista de que havia gente esperando estava a três telas de rolagem.
  // Uma fila que diz "o que fazer hoje" e omite metade do que há para fazer
  // é pior que fila nenhuma: ela ensina a confiar num número incompleto.
  for (const f of feedbacks || []) {
    if (f?.status === 'resolvido') continue;
    itens.push({
      // `restaurante_nome` é como a RPC `feedback_todos` (M15) devolve.
      r: { id: f.restaurante_id, nome: f.restaurante_nome || 'Restaurante' },
      tipo: 'feedback',
      quando: new Date(f.created_at || 0).getTime(),
      feedback: f,
    });
  }

  for (const r of restaurantes || []) {
    const st = statusRestaurante(r, agora);
    // ⚠️ CORTESIA NÃO ENTRA NA FILA. É o ponto do regime existir: sem isso, a
    // conta que a Aurum decidiu não cobrar apareceria todo dia entre as que
    // precisam de cobrança — e uma fila com item que nunca sai é uma fila que
    // se aprende a ignorar inteira.
    if (st.tipo === 'cortesia') continue;
    // ⚠️ O AVISO VALE MESMO COM A CONTA ATIVA, e é de propósito: quem paga
    // adiantado avisa antes de vencer. Descartar o aviso porque "está em dia"
    // deixaria o cliente esperando confirmação que nunca vem.
    if (r.aviso_pagamento_em) {
      itens.push({ r, tipo: 'aviso', quando: new Date(r.aviso_pagamento_em).getTime() });
    }
    if (st.tipo === 'teste' && st.diasRestantes <= DIAS_TESTE_ACABANDO) {
      itens.push({ r, tipo: 'teste', quando: st.ate });
    }
    if (st.tipo === 'vencido') {
      itens.push({ r, tipo: 'vencido', quando: new Date(r.assinatura_ate || r.created_at || 0).getTime() });
    }
  }
  return itens.sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo] || a.quando - b.quando);
}

/**
 * Os números do negócio.
 *
 * ⚠️ `mrr` É ESTIMATIVA, e o nome do campo não deixa isso claro sozinho — a
 * tela é obrigada a escrever "estimada". Ele sai do PREÇO DO PLANO de cada
 * conta ativa, não de pagamento registrado, porque nada no sistema guarda que
 * houve pagamento: ao liberar dias, o aviso é apagado e não fica registro
 * nenhum (ver a seção H da auditoria de 31/08/2026). Enquanto for assim, este
 * número responde "quanto deveria entrar", nunca "quanto entrou".
 */
export function numerosDoPainel(restaurantes, agora = Date.now()) {
  const n = { total: 0, pagantes: 0, teste: 0, vencidos: 0, bloqueados: 0, cortesia: 0, mrr: 0 };
  for (const r of restaurantes || []) {
    n.total++;
    const st = statusRestaurante(r, agora);
    if (st.tipo === 'bloqueado') { n.bloqueados++; continue; }
    // ⚠️ Conta contada à parte e FORA da receita: somar cortesia inflaria o
    // faturamento exatamente onde não há dinheiro nenhum entrando.
    if (st.tipo === 'cortesia') { n.cortesia++; continue; }
    if (st.tipo === 'assinatura') { n.pagantes++; n.mrr += produtoDe(r.produto).precoMes; continue; }
    if (st.tipo === 'teste') { n.teste++; continue; }
    if (st.tipo === 'vencido') n.vencidos++;
  }
  return n;
}

/**
 * O filtro da lista: situação comercial OU produto, somado com a busca.
 *
 * ⚠️ Situação e produto dividem o mesmo estado de propósito — são duas
 * maneiras de cortar a MESMA lista, e a tela nunca mostra as duas ativas ao
 * mesmo tempo. Dois estados independentes criariam combinações vazias
 * ("pagantes" + "etiquetas" sem nenhum) que a pessoa não pediu.
 */
export function passaNoFiltro(r, situacao, agora = Date.now()) {
  if (!situacao || situacao === 'todos') return true;
  if (situacao === 'etiquetas') return (r.produto || 'completo') === 'etiquetas';
  if (situacao === 'completo') return (r.produto || 'completo') === 'completo';
  const st = statusRestaurante(r, agora).tipo;
  if (situacao === 'pagantes') return st === 'assinatura';
  if (situacao === 'teste') return st === 'teste';
  if (situacao === 'vencidos') return st === 'vencido';
  if (situacao === 'bloqueados') return st === 'bloqueado';
  if (situacao === 'cortesia') return st === 'cortesia';
  return true;
}
