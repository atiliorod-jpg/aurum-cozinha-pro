import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import ResponsavelSelect from '../components/ResponsavelSelect';
import { fmtNum, fmtData, hoje, fmtHora } from '../utils/formatters';

export default function Inventario() {
  const { produtos, estoque, addAjuste, ajustes, removeAjuste, restaurarRegistro, categorias, prefs, setPref } = useApp();
  const { toast, confirm } = useUI();
  const [data, setData] = useState(hoje());
  const [responsavel, setResponsavel] = useState(prefs.responsavel || '');
  const [contagem, setContagem] = useState({});
  const [catAtiva, setCatAtiva] = useState(categorias[0]);
  const [tab, setTab] = useState('novo');
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
    const inventarioId = `inv_${Date.now().toString(36)}`;
    itensContados.forEach(([produtoId, quantidade]) => {
      addAjuste({ data, hora: fmtHora(), responsavel, produtoId, quantidade: parseFloat(quantidade), inventarioId });
    });
    setContagem({});
    toast('Contagem registrada! Estoque atualizado.', 'sucesso');
    setTab('historico');
  };

  // Agrupa ajustes por inventarioId (sessão de contagem) ou exibe individualmente se legado
  const sessoesInventario = useMemo(() => {
    const grupos = {};
    [...ajustes].sort((a, b) => (b.ts || 0) - (a.ts || 0)).forEach(aj => {
      const chave = aj.inventarioId || aj.id;
      if (!grupos[chave]) grupos[chave] = { inventarioId: chave, itens: [], ts: aj.ts, data: aj.data, hora: aj.hora, responsavel: aj.responsavel };
      grupos[chave].itens.push(aj);
    });
    return Object.values(grupos).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }, [ajustes]);

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
            {categorias.map(c => (
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
          {sessoesInventario.length === 0 && (
            <div className="text-center text-gray-500 py-12">Nenhuma contagem registrada ainda.</div>
          )}
          {sessoesInventario.map(sessao => (
            <div key={sessao.inventarioId} className="bg-white rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold text-sm text-polo-navy">
                    📐 Contagem — {sessao.itens.length} produto{sessao.itens.length > 1 ? 's' : ''}
                  </div>
                  <div className="text-xs text-gray-500">
                    {fmtData(sessao.data)} {sessao.hora && `• ${sessao.hora}`} {sessao.responsavel && `• ${sessao.responsavel}`}
                  </div>
                </div>
                <button onClick={async () => {
                  const ok = await confirm({ titulo: 'Remover contagem', mensagem: `Remover todos os ${sessao.itens.length} ajustes desta contagem?`, perigo: true, confirmar: 'Remover' });
                  if (ok) {
                    sessao.itens.forEach(aj => removeAjuste(aj.id));
                    toast('Contagem removida.', 'sucesso');
                  }
                }} aria-label="Remover esta contagem"
                  className="text-red-500 text-lg font-semibold ml-2 min-w-11 min-h-11 flex items-center justify-center flex-shrink-0">×</button>
              </div>
              {sessao.itens.map(aj => {
                const p = produtos.find(x => x.id === aj.produtoId);
                return (
                  <div key={aj.id} className="flex justify-between text-sm border-t border-gray-50 pt-1 mt-1">
                    <span className="text-gray-700">{p?.nome || aj.produtoId}</span>
                    <span className="font-bold text-blue-700">{fmtNum(aj.quantidade)} {p?.unidade}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
