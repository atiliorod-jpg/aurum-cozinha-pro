export const statusEstoque = (atual, min, max) => {
  if (min === 0 && max === 0) return 'sem-meta';
  if (atual <= 0) return 'zerado';
  if (atual < min) return 'critico';
  if (atual > max) return 'excesso';
  return 'ok';
};

export const corStatus = (status) => ({
  'zerado':   { bg: 'bg-red-100',    text: 'text-red-700',    badge: 'bg-red-600 text-white',    label: 'ZERADO' },
  'critico':  { bg: 'bg-orange-100', text: 'text-orange-700', badge: 'bg-orange-500 text-white', label: 'BAIXO' },
  'ok':       { bg: 'bg-green-50',   text: 'text-green-700',  badge: 'bg-green-600 text-white',  label: 'OK' },
  'excesso':  { bg: 'bg-blue-50',    text: 'text-blue-700',   badge: 'bg-blue-500 text-white',   label: 'EXCESSO' },
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
