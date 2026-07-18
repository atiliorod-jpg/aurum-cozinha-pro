// Novidades do app (changelog voltado ao CLIENTE — linguagem simples, sem jargão).
// A cada atualização relevante, adicione um item NO TOPO e atualize APP_VERSAO
// com a mesma "versao". O app mostra um aviso "O que há de novo" uma vez quando
// o cliente abre uma versão mais nova, e a lista fica em Configurações → Novidades.

export const APP_VERSAO = '2026.07.18';

export const NOVIDADES = [
  {
    versao: '2026.07.18',
    data: '18/07/2026',
    titulo: 'Pagamento por Pix e vários ajustes',
    itens: [
      'Pagamento por Pix: o QR já vem com o valor preenchido, e agora há planos mensal, semestral (−10%) e anual (−20%).',
      'Botão de Ajuda no topo para você relatar um problema ou sugerir uma melhoria — com um passo a passo de como descrever.',
      'Aviso no cantinho quando a sua assinatura ou teste está perto de vencer.',
      'A diretoria pode escolher o que cada função (cozinha e gerência) pode fazer no app.',
      'Textos revisados e a descrição da "entrada avulsa" ficou mais clara (item só porcionado, sem receita).',
    ],
  },
];
