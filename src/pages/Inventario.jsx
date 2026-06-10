import { useState } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import ResponsavelSelect from '../components/ResponsavelSelect';
import { CATEGORIAS } from '../data/produtos';
import { fmtNum, fmtData, hoje, fmtHora } from '../utils/formatters';

export default function Inventario() {
  const { produtos, calcEstoque, addAjuste, ajustes, removeAjuste, prefs, setPref } = useApp();
  const { toast, confirm } = useUI();
  const [data, setData] = useState(hoje());
  const [responsavel, setResponsavel] = useState(prefs.responsavel || '');
  const [contagem, setContagem] = useState({});
  const [catAtiva, setCatAtiva] = useState(CATEGORIAS[0]);
  const [tab, setTab] = useState('novo');

  const estoque = calcEstoque();
  const produtosAtivos = produtos.filter(p => p.ativo);

  const setCont = (id, val) => {
    setContagem(prev => ({ ...prev, [id]: val }));
  };

  const itensContados = Object.entries(contagem).filter(([, v]) => v !== '' && v != null && !isNaN(parseFloat(v)));

  const handleSalvar = async () => {
    if (!itensContados.length) {
      toast('Conte ao menos um produto.', 'aviso');
      return;
    }
    const ok = await confirm({
      titulo: 'Confirmar contagem física',
      mensagem: `Você está ajustando o estoque de ${itensContados.length} produto(s) para o valor contado fisicamente. Isso passa a ser a nova base de cálculo.`,
      confirmar: 'Salvar contagem',
    });
    if (!ok) return;
    if (responsavel) setPref('responsavel', responsavel);
    itensContados.forEach(([produtoId, quantidade]) => {
      addAjuste({ data, hora: fmtHora(), responsavel, produtoId, quantidade: parseFloat(quantidade) });
    });
    setContagem({});
    toast('Contagem registrada! Estoque atualizado.', 'sucesso');
    setTab('historico');
  };

  const ajustesOrdenados = [...ajustes].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return (
    <Layout title="Inventário / Contagem">
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[['novo', '📐 Contar'], ['historico', '📋 Histórico']].map(([v, l]) => (
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
            O estoque é <strong>calculado automaticamente</strong> (estoque inicial + entradas − saídas − desperdício − aparas). Use esta tela só quando <strong>conferir fisicamente</strong> e o valor real divergir: a contagem digitada vira a nova base a partir de agora.
          </div>

          <div className="bg-white rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
              <input type="date" value={data} max={hoje()} onChange={e => setData(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <ResponsavelSelect value={responsavel} onChange={setResponsavel} />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {CATEGORIAS.map(c => (
              <button key={c} onClick={() => setCatAtiva(c)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0
                  ${catAtiva === c ? 'bg-polo-navy text-polo-gold' : 'bg-white text-gray-600 border border-gray-200'}`}>
                {c}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl overflow-hidden">
            {produtosAtivos.filter(p => p.categoria === catAtiva).map((p, i, arr) => {
              const calc = estoque[p.id] ?? 0;
              const cont = contagem[p.id];
              const diff = cont !== '' && cont != null && !isNaN(parseFloat(cont)) ? parseFloat(cont) - calc : null;
              return (
                <div key={p.id} className={`px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800 truncate">{p.nome}</div>
                      <div className="text-xs text-gray-500">Sistema: {fmtNum(calc)} {p.unidade}</div>
                    </div>
                    <input
                      type="number" min="0" step="0.5"
                      value={contagem[p.id] ?? ''}
                      onChange={e => setCont(p.id, e.target.value)}
                      placeholder="contado"
                      className="w-24 text-center border border-gray-200 rounded-lg py-2 text-sm font-semibold"
                    />
                  </div>
                  {diff !== null && diff !== 0 && (
                    <div className={`text-xs font-semibold mt-1 text-right ${diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {diff > 0 ? '+' : ''}{fmtNum(diff)} {p.unidade} de diferença
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={handleSalvar} disabled={!itensContados.length}
            className="w-full bg-polo-navy text-polo-gold font-bold py-4 rounded-xl text-base
                       disabled:opacity-40 active:scale-95 transition-transform">
            ✓ Salvar Contagem ({itensContados.length})
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {ajustesOrdenados.length === 0 && (
            <div className="text-center text-gray-500 py-12">Nenhuma contagem registrada ainda.</div>
          )}
          {ajustesOrdenados.map(aj => {
            const p = produtos.find(x => x.id === aj.produtoId);
            return (
              <div key={aj.id} className="bg-white rounded-xl p-4 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-sm">{p?.nome || aj.produtoId}</div>
                  <div className="text-xs text-gray-500">
                    {fmtData(aj.data)} {aj.hora && `• ${aj.hora}`} {aj.responsavel && `• ${aj.responsavel}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-blue-700 text-sm">{fmtNum(aj.quantidade)} {p?.unidade}</span>
                  <button onClick={async () => {
                    const ok = await confirm({ titulo: 'Remover contagem', mensagem: 'Remover este ajuste de inventário?', perigo: true, confirmar: 'Remover' });
                    if (ok) { removeAjuste(aj.id); toast('Contagem removida.', 'sucesso'); }
                  }}
                    className="text-red-400 text-lg font-semibold">×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
