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

// ⚠️ TOLERÂNCIA DO CONTRATO PARCELADO (cl. 7ª do Contrato de Assinatura
// Anual, 10/09/2026): o acesso só pode ser suspenso com atraso SUPERIOR a 10
// dias. Antes da M45 o app cortava no primeiro dia para todo mundo — com
// contrato assinado, era a Aurum descumprindo o próprio contrato.
// ⚠️ PARIDADE com `interval '10 days'` em restaurante_pode_escrever (M45).
export const TOLERANCIA_CONTRATO_DIAS = 10;

// Dias de calendário entre o vencimento e hoje, pela data LOCAL do aparelho —
// é o "dia a dia" dos juros do contrato. 0 = vence hoje ou ainda não venceu.
const diaLocal = (t) => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
export function diasDeAtraso(vencimento, agora = Date.now()) {
  const v = vencimento ? new Date(vencimento).getTime() : NaN;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.round((diaLocal(agora) - diaLocal(v)) / 86400000));
}

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

// Meio centavo sobe: 279,90 × 0,85 = 237,915 é 237,91499… no ponto flutuante e
// arredondava para baixo. Corta o ruído (4 casas) antes de arredondar.
const r2 = (n) => Math.round(Number((n * 100).toFixed(4))) / 100;
const mensalDe = (produto) => produtoDe(produto).precoMes;
// Preço TOTAL do período, já com o desconto aplicado.
//
// ⚠️ UNIDADES ADICIONAIS (M46, decisão do dono em 22/09/2026): cada unidade
// extra da conta — outro CNPJ, na mesma conta — custa 1/3 do plano por mês.
// `extras` tem padrão 0, então toda chamada antiga continua dando o mesmo
// valor. O desconto semestral/anual vale sobre o total, com as unidades.
export const ADICIONAL_UNIDADE = 1 / 3;
/** Quanto custa UMA unidade extra por mês: Etiquetas R$ 93,30; Pro R$ 133,00. */
export const adicionalUnidade = (produto) => r2(mensalDe(produto) * ADICIONAL_UNIDADE);
/** O mês cheio da conta: o plano mais as unidades extras. */
export const mensalComUnidades = (produto, extras = 0) =>
  r2(mensalDe(produto) + Math.max(0, parseInt(extras, 10) || 0) * adicionalUnidade(produto));
// ── DESCONTO COMBINADO (M54, 28/09/2026) ────────────────────────────
// A Aurum combina com o cliente R$ X a menos por mês, ou X% a menos, com
// data para acabar ou não. Vale sobre o MÊS (plano + unidades) e DEPOIS vem o
// desconto do período (semestral/anual). `desconto` = { tipo: 'valor' |
// 'percentual', valor, ate: 'AAAA-MM-DD' | null } — o que a linha de
// `restaurantes` traz. Sem desconto (ou vencido), tudo como sempre foi.
const diaLocalISO = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** O desconto que vale HOJE, ou null. */
export function descontoAtivo(desconto, agora = Date.now()) {
  const tipo = desconto?.tipo;
  const valor = Number(desconto?.valor) || 0;
  if (!['valor', 'percentual'].includes(tipo) || valor <= 0) return null;
  if (desconto.ate && String(desconto.ate).slice(0, 10) < diaLocalISO(agora)) return null;
  return { tipo, valor, ate: desconto.ate || null, motivo: desconto.motivo || '' };
}
/** O mês com o desconto combinado (nunca abaixo de zero). */
export function aplicarDesconto(mensal, desconto, agora = Date.now()) {
  const d = descontoAtivo(desconto, agora);
  if (!d) return r2(mensal);
  const com = d.tipo === 'percentual' ? mensal * (1 - Math.min(d.valor, 90) / 100) : mensal - d.valor;
  return r2(Math.max(0, com));
}
/** O mês que ESTA conta paga: plano + unidades, menos o desconto combinado. */
export const mensalCombinado = (produto, extras = 0, desconto = null, agora = Date.now()) =>
  aplicarDesconto(mensalComUnidades(produto, extras), desconto, agora);
/** O desconto a partir da linha crua de `restaurantes` (painel). */
export const descontoDaLinha = (r) => (r?.desconto_tipo
  ? { tipo: r.desconto_tipo, valor: Number(r.desconto_valor) || 0, ate: r.desconto_ate || null, motivo: r.desconto_motivo || '' }
  : null);
/** Texto curto do desconto: "R$ 30,00/mês" ou "15%". */
export const rotuloDesconto = (d) => (!d ? '' : d.tipo === 'percentual'
  ? `${String(d.valor).replace('.', ',')}%` : `R$ ${fmtPreco(d.valor)}/mês`);

export const precoPlano = (plano, produto, extras = 0, desconto = null, agora = Date.now()) =>
  r2(mensalCombinado(produto, extras, desconto, agora) * plano.meses * (1 - plano.desconto));
// Quanto sai por mês naquele plano (para mostrar "equivale a R$X/mês").
export const precoMensalEquivalente = (plano, produto, extras = 0, desconto = null, agora = Date.now()) =>
  r2(precoPlano(plano, produto, extras, desconto, agora) / plano.meses);
// Quanto o cliente economiza no período vs. pagar mês a mês (o desconto
// combinado já está nos dois lados: aqui é só o do semestral/anual).
export const economiaPlano = (plano, produto, extras = 0, desconto = null, agora = Date.now()) =>
  r2(mensalCombinado(produto, extras, desconto, agora) * plano.meses - precoPlano(plano, produto, extras, desconto, agora));

/**
 * A cobrança à parte da unidade criada no meio de um período JÁ PAGO (M54,
 * decisão do dono): os meses que faltam até o vencimento × o adicional, com o
 * mesmo desconto do período pago (5% semestral, 10% anual) e o combinado.
 * Faltando 31 dias ou menos, não há cobrança à parte — entra na próxima.
 * Devolve { meses, valor } ou null.
 */
export function cobrancaDaUnidade({ produto, assinaturaAte, planoPago, desconto = null, agora = Date.now() }) {
  const fim = assinaturaAte ? new Date(assinaturaAte).getTime() : NaN;
  if (Number.isNaN(fim)) return null;
  const dias = Math.ceil((fim - agora) / 86400000);
  if (dias <= 31) return null;
  const meses = Math.ceil(dias / 30);
  const plano = planoPorId(planoPago);
  const adicionalMes = aplicarDesconto(adicionalUnidade(produto), descontoAtivo(desconto, agora)?.tipo === 'percentual' ? desconto : null, agora);
  return { meses, valor: r2(adicionalMes * meses * (1 - plano.desconto)) };
}
export const planoPorId = (id) => PLANOS.find(p => p.id === id) || PLANOS[0];

// Preço para a TELA: vírgula e dois decimais. `R$ {precoMes}` direto saía
// "R$ 279.9/mês" — ponto americano e sem o zero final — justo na tela de
// cadastro, onde o cliente está decidindo se paga.
export const fmtPreco = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');

/**
 * Situação do plano de uma sessão:
 *  { ok:true,  tipo:'assinatura', ate }            — assinatura ativa
 *  { ok:true,  tipo:'teste', diasRestantes, ate }  — dentro do teste (TESTE_DIAS)
 *  { ok:false, tipo:'vencido' }                    — teste e assinatura vencidos
 *  { ok:false, tipo:'aguardando' }                 — nunca liberada (cadastro novo)
 *  { ok:true,  tipo:'indeterminado' }              — não deu para ler o cadastro (rede/RLS)
 *  { ok:false, tipo:'bloqueado' }                  — conta suspensa pelo administrador
 *  { ok:true,  tipo:'cortesia', regime, ate }     — não paga, por decisão da Aurum
 *  { ok:true,  tipo:'atraso', ate, diasAtraso, suspendeEm } — contrato parcelado
 *                                                   vencido há até 10 dias (M45)
 *  { ok:true,  tipo:'isento' }                     — super-admin/demo/sem restaurante
 */
export function statusAssinatura(sessao, agora = Date.now()) {
  if (!sessao?.restauranteId || sessao.eSuperAdmin || sessao.demo) return { ok: true, tipo: 'isento' };
  // bloqueio comercial (migração 9) passa por cima até de assinatura ativa
  if (sessao.bloqueado) return { ok: false, tipo: 'bloqueado' };
  // ⚠️ NÃO SE TIRA ACESSO POR CONSULTA QUE FALHOU. Quando a linha do
  // restaurante não pôde ser lida (sem internet, RLS oscilando, banco fora do
  // ar), a sessão chega com TODAS as datas nulas — e a régua abaixo leria isso
  // como "nunca foi liberada", tapando o app com "Falta liberarmos o seu
  // acesso". Foi o que aconteceu com a conta do dono, que tem assinatura em
  // dia: o aviso ia e voltava conforme a rede, no meio do serviço.
  //
  // Ausência de dado não é dado. E deixar entrar não abre brecha: quem barra
  // de verdade é o banco (`restaurante_pode_escrever`, M37) — a tela é
  // conveniência, não fechadura.
  //
  // `=== false` de propósito: sessão antiga, demo e o painel não têm o campo,
  // e `undefined` tem de continuar significando "li normalmente".
  if (sessao.assinaturaLida === false) return { ok: true, tipo: 'indeterminado' };
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

  // ⚠️ CONTRATO PARCELADO NÃO É CORTADO NO PRIMEIRO DIA (cl. 7ª): até 10 dias
  // depois do vencimento a conta segue aberta, com a faixa de atraso na tela.
  // Só para conta marcada com contrato e que PAGA — cortesia tem régua própria.
  // O banco libera a escrita pelo mesmo critério (M45).
  const limite = assin + TOLERANCIA_CONTRATO_DIAS * 86400000;
  if (sessao.parcelaContrato && assin && regime === 'pagante' && limite > agora) {
    return { ok: true, tipo: 'atraso', ate: assin, suspendeEm: limite,
      diasAtraso: Math.max(1, diasDeAtraso(assin, agora)) };
  }

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

  // ⚠️ QUEM NUNCA TEVE ACESSO NÃO É QUEM PERDEU O ACESSO, e antes desta linha
  // os dois eram a mesma coisa: 'vencido'. Quem acabou de se cadastrar via
  // "Seu período de teste terminou — continue de onde parou", uma frase que
  // fala de um passado que ele não tem. Pior na hora exata em que ele acabou
  // de pagar e está esperando a Aurum liberar.
  //
  // A régua é ter QUALQUER data já registrada: assinatura, teste ou cortesia.
  // Sem nenhuma delas, esta conta nunca foi liberada por ninguém.
  const jaTeveAlgumAcesso = !!(sessao.assinaturaAte || sessao.testeAte || sessao.cortesiaAte);
  if (!jaTeveAlgumAcesso) return { ok: false, tipo: 'aguardando' };

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
    // M45: sem isto o painel veria como VENCIDA a conta de contrato que ainda
    // está nos 10 dias de tolerância — e o cliente, como aberta.
    parcelaContrato: rest?.parcela_contrato ? Number(rest.parcela_contrato) : null,
  }, agora);
}

/** Rótulo curto do regime, para o selo do painel. '' = cliente normal. */
export const rotuloRegime = (regime) =>
  regime === 'cortesia' ? 'Cortesia' : regime === 'parceiro' ? 'Parceiro' : '';
