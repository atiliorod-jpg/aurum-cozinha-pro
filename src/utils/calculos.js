export const statusEstoque = (atual, min, max) => {
  if (min === 0 && max === 0) return 'sem-meta';
  if (atual <= 0) return 'zerado';
  if (atual < min) return 'critico';
  // max 0/vazio = "sem teto definido". Sem esta guarda, quem cadastra só o
  // mínimo (max fica 0) via TUDO acima de zero como EXCESSO — nunca "OK".
  if (max > 0 && atual > max) return 'excesso';
  return 'ok';
};

// ⚠️ VOCABULÁRIO ÚNICO do estado de estoque. O app tinha três conjuntos
// concorrentes para a mesma coisa — ZERADO/BAIXO/OK/EXCESSO aqui,
// Zerado/Crítico/Alerta em Compras e "Em nível OK"/"Abaixo / Zerado" no Início.
// Três nomes para um estado é o que faz a equipe achar que são coisas
// diferentes. Estas são as palavras; quem exibe usa `label`, nunca as suas.
export const corStatus = (status) => ({
  'zerado':   { bg: 'bg-red-100',    text: 'text-red-800',    badge: 'bg-red-700 text-white',    label: 'Zerado' },
  'critico':  { bg: 'bg-orange-100', text: 'text-orange-800', badge: 'bg-orange-700 text-white', label: 'Abaixo do mínimo' },
  'ok':       { bg: 'bg-green-50',   text: 'text-green-800',  badge: 'bg-green-700 text-white',  label: 'Normal' },
  'excesso':  { bg: 'bg-blue-50',    text: 'text-blue-800',   badge: 'bg-blue-700 text-white',   label: 'Acima do máximo' },
  'sem-meta': { bg: 'bg-gray-50',    text: 'text-gray-600',   badge: 'bg-gray-400 text-white',   label: '—' },
})[status] || { bg: 'bg-gray-50', text: 'text-gray-600', badge: 'bg-gray-400 text-white', label: '—' };

export const pctBarra = (atual, max) => {
  if (!max) return 0;
  return Math.min(100, Math.round((atual / max) * 100));
};

export const filtrarPorPeriodo = (registros, inicio, fim) =>
  registros.filter(r => r.data && r.data >= inicio && r.data <= fim);

export const totalPorProduto = (registros) => {
  const totais = {};
  registros.forEach(r => {
    (r.itens || []).forEach(item => {
      totais[item.produtoId] = (totais[item.produtoId] || 0) + (parseFloat(item.quantidade) || 0);
    });
  });
  return totais;
};

// Nome legível de um produto a partir do id (compartilhado pelas telas)
export const nomeProduto = (produtos, id) => produtos.find(p => p.id === id)?.nome || id;
