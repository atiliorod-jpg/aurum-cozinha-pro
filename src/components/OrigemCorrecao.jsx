import { useApp } from '../store/AppContext';
import { CATEGORIAS } from '../data/produtos';
import { fmtData } from '../utils/formatters';

// Define a origem de uma apara/desperdício:
//  - 'recebimento': perda na compra bruta (limpeza). NÃO abate estoque; associa a uma compra (opcional).
//  - 'estoque': item que já estava no estoque e estragou/perdeu. ABATE do estoque.
export default function OrigemCorrecao({ form, onChange }) {
  const { produtos, compras } = useApp();
  const ativos = produtos.filter(p => p.ativo);
  const comprasRecentes = [...compras].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);

  const setOrigem = (origem) => {
    if (origem === 'recebimento') onChange({ origem, produtoId: '' });
    else onChange({ origem, compraId: '' });
  };

  const selecionarProduto = (id) => {
    const p = produtos.find(x => x.id === id);
    onChange({ produtoId: id, item: p ? p.nome : form.item, unidade: p ? p.unidade : form.unidade });
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-600">De onde veio essa perda?</label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOrigem('recebimento')}
          className={`py-2.5 px-3 rounded-lg text-xs font-semibold border-2 text-left transition-colors
            ${form.origem === 'recebimento' ? 'border-polo-gold bg-polo-navy text-polo-gold' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
          📦 Recebimento<br /><span className="font-normal opacity-80">não abate estoque</span>
        </button>
        <button type="button" onClick={() => setOrigem('estoque')}
          className={`py-2.5 px-3 rounded-lg text-xs font-semibold border-2 text-left transition-colors
            ${form.origem === 'estoque' ? 'border-red-400 bg-red-600 text-white' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
          ❄️ Estoque<br /><span className="font-normal opacity-80">abate do estoque</span>
        </button>
      </div>

      {form.origem === 'recebimento' ? (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Associar à compra (opcional)</label>
          <select value={form.compraId || ''} onChange={e => onChange({ compraId: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">— Não associar —</option>
            {comprasRecentes.map(c => (
              <option key={c.id} value={c.id}>{fmtData(c.data)} • {c.item} ({c.quantidade}{c.unidade})</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Monitoramento de rendimento. Não mexe no estoque.</p>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Produto do estoque que perdeu</label>
          <select value={form.produtoId || ''} onChange={e => selecionarProduto(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Selecione o produto...</option>
            {CATEGORIAS.map(cat => {
              const prods = ativos.filter(p => p.categoria === cat);
              if (!prods.length) return null;
              return (
                <optgroup key={cat} label={cat}>
                  {prods.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </optgroup>
              );
            })}
          </select>
          <p className="text-xs text-red-500 mt-1">Será abatido do estoque deste produto.</p>
        </div>
      )}
    </div>
  );
}
