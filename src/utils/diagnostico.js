// =====================================================================
//  DIAGNÓSTICO PARA O SUPORTE (23/09/2026)
//
//  Quando a impressora não imprime, o suporte pelo WhatsApp investigava às
//  cegas: "qual celular? está no Chrome? o Bluetooth está ligado? qual
//  versão?". O botão "Copiar diagnóstico" da aba Impressora junta tudo num
//  texto que a pessoa cola na conversa.
//
//  ⚠️ SÓ O QUE AJUDA A CONSERTAR: nada de e-mail, senha, lista de itens ou
//  dado de cliente. Nome da conta e da unidade entram porque é por eles que o
//  suporte acha a conta no painel.
//
//  Função PURA: recebe os fatos já coletados e devolve o texto.
// =====================================================================

const simNao = (v) => (v === true ? 'sim' : v === false ? 'não' : 'não sei');

export function textoDoDiagnostico(d = {}) {
  const imp = d.impressora || {};
  const linhas = [
    `Diagnóstico Aurum — ${d.quando || ''}`,
    `Conta: ${d.conta || '—'}${d.plano ? ` (${d.plano})` : ''}`,
    d.unidade ? `Unidade: ${d.unidade}` : null,
    `Versão do app: ${d.versao || 'desconhecida'}`,
    `Aparelho: ${d.navegador || '—'}`,
    d.tela ? `Tela: ${d.tela}` : null,
    `Internet: ${d.online === false ? 'SEM internet' : 'ok'}`,
    `Envios pendentes: ${Number(d.pendencias) || 0}${Number(d.mortos) ? ` (com erro: ${d.mortos})` : ''}`,
    `Impressão por: ${d.caminho || '—'}`,
    `Bluetooth no navegador: ${simNao(d.bleNoNavegador)}`,
    d.bleNoNavegador ? `Bluetooth ligado: ${simNao(d.bleLigado)}` : null,
    d.bleNoNavegador
      ? `Impressora: ${imp.conectada ? `conectada (${imp.nome || 'sem nome'})` : 'não conectada'}${imp.modo ? ` · envio ${imp.modo}` : ''}`
      : null,
    Array.isArray(d.autorizados) ? `Aparelhos autorizados: ${d.autorizados.length ? d.autorizados.join(', ') : 'nenhum'}` : null,
    d.ultimoErro
      ? `Último travamento de tela: ${d.ultimoErro.quando || ''} em ${d.ultimoErro.tela || '?'} — ${d.ultimoErro.mensagem || ''}`
      : null,
  ];
  return linhas.filter(Boolean).join('\n');
}
