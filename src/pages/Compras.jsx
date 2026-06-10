import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import ResponsavelSelect from '../components/ResponsavelSelect';
import { hoje, fmtData, fmtHora, fmtNum } from '../utils/formatters';
import { validarDataRegistro } from '../utils/datas';

export default function Compras() {
  const { compras, addCompra, removeCompra, aparas, desperdicio, fichas, prefs, setPref } = useApp();
  const { toast, confirm } = useUI();
  const [form, setForm] = useState({
    data: hoje(), fornecedor: '', item: '', quantidade: '', unidade: 'kg', responsavel: prefs.responsavel || '',
  });
  const [tab, setTab] = useState('novo');
  const [fornecedorAuto, setFornecedorAuto] = useState(false);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Sugestões de itens: matérias-primas das fichas técnicas + itens já comprados
  const itensSugeridos = useMemo(() => {
    const m = new Map();
    fichas.forEach(f => m.set(f.materiaPrima.toLowerCase(), f.materiaPrima));
    compras.forEach(c => c.item && m.set(c.item.toLowerCase(), c.item));
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [fichas, compras]);

  const fornecedoresSugeridos = useMemo(() => {
    const m = new Map();
    compras.forEach(c => {
      const f = (c.fornecedor || '').trim();
      if (f) m.set(f.toLowerCase(), f);
    });
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [compras]);

  // Ao escolher um item já conhecido, pré-preenche o fornecedor do último recebimento dele
  const onItemChange = (valor) => {
    setForm(prev => {
      const ultima = [...compras]
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .find(c => (c.item || '').toLowerCase() === valor.toLowerCase() && (c.fornecedor || '').trim());
      if (ultima && (!prev.fornecedor || fornecedorAuto)) {
        setFornecedorAuto(true);
        return { ...prev, item: valor, fornecedor: ultima.fornecedor, unidade: ultima.unidade || prev.unidade };
      }
      return { ...prev, item: valor };
    });
  };

  const handleSalvar = async () => {
    if (!form.item.trim() || !form.quantidade) {
      toast('Preencha o item e a quantidade.', 'aviso');
      return;
    }
    const v = validarDataRegistro(form.data);
    if (!v.ok) { toast('Não é possível registrar compra em data futura.', 'erro'); return; }
    if (v.confirmar) {
      const ok = await confirm({ titulo: 'Registro antigo', mensagem: `Esta compra é de ${v.dias} dias atrás (${fmtData(form.data)}). Confirma a data?`, confirmar: 'Sim, registrar' });
      if (!ok) return;
    }
    addCompra({ ...form, hora: fmtHora(), quantidade: parseFloat(form.quantidade) });
    if (form.responsavel) setPref('responsavel', form.responsavel);
    setForm(prev => ({ ...prev, item: '', quantidade: '', fornecedor: '' }));
    toast('Compra registrada!', 'sucesso');
  };

  const comprasOrdenadas = [...compras].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  // soma de aparas + desperdício associados a cada compra (monitoramento de rendimento)
  const correcaoDaCompra = (compraId) => {
    const items = [...aparas, ...desperdicio].filter(r => r.compraId === compraId);
    return items.reduce((s, r) => s + (parseFloat(r.quantidade) || 0), 0);
  };

  return (
    <Layout title="Compras / Recebimento">
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[['novo', '+ Nova Compra'], ['historico', '📋 Histórico']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors
              ${tab === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'novo' ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
            Registre o que <strong>chegou bruto</strong> do fornecedor (ex: 25 kg de filé). Isso <strong>não entra no estoque</strong> automaticamente — serve para monitorar compras e o rendimento (aparas/perdas de limpeza associadas a este recebimento).
          </div>

          <div className="bg-white rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
                <input type="date" value={form.data} max={hoje()} onChange={e => set('data', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Fornecedor (opcional)
                  {fornecedorAuto && form.fornecedor && (
                    <span className="ml-1 text-[10px] font-bold text-polo-gold bg-polo-navy px-1.5 py-0.5 rounded">auto</span>
                  )}
                </label>
                <input type="text" list="lista-fornecedores" value={form.fornecedor}
                  onChange={e => { setFornecedorAuto(false); set('fornecedor', e.target.value); }}
                  placeholder="Nome do fornecedor"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <datalist id="lista-fornecedores">
                  {fornecedoresSugeridos.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Item comprado</label>
              <input type="text" list="lista-itens-compra" value={form.item} onChange={e => onItemChange(e.target.value)}
                placeholder="Ex: Filé Mignon, Frango Filé, Picanha..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <datalist id="lista-itens-compra">
                {itensSugeridos.map(i => <option key={i} value={i} />)}
              </datalist>
              <p className="text-xs text-gray-500 mt-1">Digite e escolha da lista — o fornecedor do último recebimento deste item entra sozinho.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Quantidade bruta</label>
                <input type="number" min="0" step="0.1" value={form.quantidade} onChange={e => set('quantidade', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Unidade</label>
                <select value={form.unidade} onChange={e => set('unidade', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="kg">kg</option>
                  <option value="unid">unid</option>
                  <option value="cx">caixa</option>
                </select>
              </div>
            </div>

            <ResponsavelSelect value={form.responsavel} onChange={v => set('responsavel', v)} />
          </div>

          <button onClick={handleSalvar}
            className="w-full bg-polo-navy text-polo-gold font-bold py-4 rounded-xl text-base active:scale-95 transition-transform">
            ✓ Registrar Compra
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {comprasOrdenadas.length === 0 && (
            <div className="text-center text-gray-500 py-12">Nenhuma compra registrada ainda.</div>
          )}
          {comprasOrdenadas.map(c => {
            const correcao = correcaoDaCompra(c.id);
            const rend = correcao > 0 && c.quantidade > 0 ? (100 - (correcao / c.quantidade) * 100) : null;
            return (
              <div key={c.id} className="bg-white rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{c.item}</div>
                    <div className="text-xs text-gray-500">
                      {fmtData(c.data)} {c.fornecedor && `• ${c.fornecedor}`} {c.responsavel && `• ${c.responsavel}`}
                    </div>
                    <div className="text-xs mt-1">
                      <span className="font-bold text-polo-navy">{fmtNum(c.quantidade)} {c.unidade}</span>
                      {correcao > 0 && (
                        <span className="text-amber-600 ml-2">
                          − {fmtNum(correcao)} {c.unidade} de correção{rend !== null && ` (rend. ${fmtNum(rend)}%)`}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={async () => {
                      const ok = await confirm({ titulo: 'Remover compra', mensagem: 'Remover este recebimento?', perigo: true, confirmar: 'Remover' });
                      if (ok) { removeCompra(c.id); toast('Compra removida.', 'sucesso'); }
                    }}
                    className="text-red-400 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50 ml-2">
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
