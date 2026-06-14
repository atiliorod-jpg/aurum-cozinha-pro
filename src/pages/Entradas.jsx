import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import ResponsavelSelect from '../components/ResponsavelSelect';
import { hoje, fmtData, fmtHora } from '../utils/formatters';
import { nomeProduto } from '../utils/calculos';
import { validarDataRegistro, addDias } from '../utils/datas';

export default function Entradas() {
  const { produtos, producoes, addEntrada, entradas, removeEntrada, restaurarRegistro, categorias, prefs, setPref } = useApp();
  const { toast, confirm } = useUI();
  const [data, setData] = useState(hoje());
  const [responsavel, setResponsavel] = useState(prefs.responsavel || '');
  const [obs, setObs] = useState('');
  const [armazenamento, setArmazenamento] = useState('congelado');
  const [qtds, setQtds] = useState({});
  const [catAtiva, setCatAtiva] = useState('');
  const [busca, setBusca] = useState('');
  const [tab, setTab] = useState('novo'); // 'novo' | 'historico'

  const produtosAtivos = produtos.filter(p => p.ativo && !producoes.some(r => r.produtoFinalId === p.id));
  const buscando = busca.trim().length > 0;
  const produtosVisiveis = buscando
    ? produtosAtivos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()))
    : catAtiva === ''
      ? produtosAtivos
      : produtosAtivos.filter(p => p.categoria === catAtiva);

  const setQtd = (id, val) => {
    const num = parseFloat(val);
    setQtds(prev => ({ ...prev, [id]: isNaN(num) || num < 0 ? '' : val }));
  };

  const itensPreenchidos = Object.entries(qtds).filter(([, v]) => parseFloat(v) > 0);

  const handleSalvar = async () => {
    if (!itensPreenchidos.length) {
      toast('Adicione pelo menos um produto com quantidade.', 'aviso');
      return;
    }
    const v = validarDataRegistro(data);
    if (!v.ok) {
      toast('Não é possível registrar entrada em data futura.', 'erro');
      return;
    }
    if (v.confirmar) {
      const ok = await confirm({
        titulo: 'Registro antigo',
        mensagem: `Esta entrada é de ${v.dias} dias atrás (${fmtData(data)}). Confirma a data?`,
        confirmar: 'Sim, registrar',
      });
      if (!ok) return;
    }
    addEntrada({
      data,
      hora: fmtHora(),
      responsavel,
      obs,
      armazenamento,
      itens: itensPreenchidos.map(([produtoId, quantidade]) => {
        const p = produtos.find(x => x.id === produtoId);
        const dias = armazenamento === 'congelado' ? (p?.valCongelado || 0) : (p?.valResfriado || 0);
        return {
          produtoId,
          quantidade: parseFloat(quantidade),
          ...(dias > 0 ? { validade: addDias(data, dias) } : {}),
        };
      }),
    });
    if (responsavel) setPref('responsavel', responsavel);
    setQtds({});
    setObs('');
    toast(`Entrada de ${itensPreenchidos.length} item(ns) registrada!`, 'sucesso');
  };

  const [buscaHist, setBuscaHist] = useState('');
  const entradasOrdenadas = useMemo(() => [...entradas]
    .sort((a, b) => b.data.localeCompare(a.data) || b.hora?.localeCompare(a.hora || ''))
    .filter(e => !buscaHist ||
      `${e.responsavel || ''} ${(e.itens || []).map(i => nomeProduto(produtos, i.produtoId)).join(' ')}`.toLowerCase().includes(buscaHist.toLowerCase())),
    [entradas, buscaHist, produtos]);

  return (
    <Layout title="Entrada de Mercadoria">
      {tab === 'novo' ? (
        <div className="space-y-4">
          {/* Cabeçalho */}
          <div className="bg-white rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
              <input type="date" value={data} max={hoje()} onChange={e => setData(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <ResponsavelSelect value={responsavel} onChange={setResponsavel} />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Armazenamento</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setArmazenamento('congelado')}
                  className={`py-2.5 rounded-lg text-xs font-semibold border-2 transition-colors
                    ${armazenamento === 'congelado' ? 'border-polo-gold bg-polo-navy text-polo-gold' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                  ❄️ Congelado
                </button>
                <button type="button" onClick={() => setArmazenamento('resfriado')}
                  className={`py-2.5 rounded-lg text-xs font-semibold border-2 transition-colors
                    ${armazenamento === 'resfriado' ? 'border-polo-gold bg-polo-navy text-polo-gold' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                  🧊 Resfriado
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">A validade de cada item é calculada sozinha pelos prazos do produto (Config).</p>
            </div>
          </div>

          {/* Busca */}
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="🔍 Buscar produto..."
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />

          {/* Categorias */}
          {!buscando && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button onClick={() => setCatAtiva('')}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0
                  ${catAtiva === '' ? 'bg-polo-navy text-polo-gold' : 'bg-white text-gray-600 border border-gray-200'}`}>
                Todos
              </button>
              {categorias.map(c => (
                <button key={c} onClick={() => setCatAtiva(c)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0
                    ${catAtiva === c ? 'bg-polo-navy text-polo-gold' : 'bg-white text-gray-600 border border-gray-200'}`}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Produtos */}
          <div className="bg-white rounded-xl overflow-hidden">
            {produtosVisiveis.length === 0 && (
              <div className="text-center text-gray-500 py-6 text-sm">Nenhum produto encontrado.</div>
            )}
            {produtosVisiveis.map((p, i, arr) => {
              const diasVal = armazenamento === 'congelado' ? (p.valCongelado || 0) : (p.valResfriado || 0);
              const temQtd = parseFloat(qtds[p.id]) > 0;
              return (
              <div key={p.id} className={`flex items-center px-4 py-3 gap-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800 truncate">{p.nome}</div>
                  <div className="text-xs text-gray-500">{p.unidade}</div>
                  {temQtd && diasVal > 0 && (
                    <div className="text-[10px] font-semibold text-polo-navy bg-polo-beige rounded px-1.5 py-0.5 mt-1 inline-block">
                      🏷️ Etiqueta: fab. {fmtData(data)} • venc. {fmtData(addDias(data, diasVal))}
                    </div>
                  )}
                  {temQtd && diasVal === 0 && (
                    <div className="text-[10px] text-gray-500 mt-0.5">sem prazo de validade cadastrado (Config → produto)</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button aria-label={`Diminuir quantidade de ${p.nome}`}
                    onClick={() => setQtd(p.id, Math.max(0, (parseFloat(qtds[p.id]) || 0) - 1).toString())}
                    className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 font-bold text-lg flex items-center justify-center flex-shrink-0">−</button>
                  <input
                    type="number" min="0" step="0.5"
                    value={qtds[p.id] ?? ''}
                    onChange={e => setQtd(p.id, e.target.value)}
                    placeholder="0"
                    aria-label={`Quantidade de ${p.nome}`}
                    className="w-16 text-center border border-gray-200 rounded-lg py-2.5 text-sm font-semibold"
                  />
                  <button aria-label={`Aumentar quantidade de ${p.nome}`}
                    onClick={() => setQtd(p.id, ((parseFloat(qtds[p.id]) || 0) + 1).toString())}
                    className="w-11 h-11 rounded-full bg-polo-navy text-polo-gold font-bold text-lg flex items-center justify-center flex-shrink-0">+</button>
                </div>
              </div>
            );})}
          </div>

          {/* Obs + Salvar */}
          <div className="bg-white rounded-xl p-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Observação (opcional)</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Alguma observação sobre esta entrada..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          {itensPreenchidos.length > 0 && (
            <div className="bg-polo-navy/10 rounded-xl p-3">
              <p className="text-xs font-semibold text-polo-navy mb-1">Itens a registrar:</p>
              {itensPreenchidos.map(([id, qtd]) => {
                const p = produtos.find(x => x.id === id);
                return (
                  <div key={id} className="flex justify-between text-sm">
                    <span>{p?.nome}</span>
                    <span className="font-bold">{qtd} {p?.unidade}</span>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={handleSalvar} disabled={!itensPreenchidos.length}
            className="w-full bg-polo-navy text-polo-gold font-bold py-4 rounded-xl text-base
                       disabled:opacity-40 active:scale-95 transition-transform">
            ✓ Registrar Entrada
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input type="text" value={buscaHist} onChange={e => setBuscaHist(e.target.value)}
            placeholder="🔍 Buscar por produto ou responsável..."
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
          {entradasOrdenadas.length === 0 && (
            <div className="text-center text-gray-500 py-12">Nenhuma entrada registrada ainda.</div>
          )}
          {entradasOrdenadas.map(e => (
            <div key={e.id} className="bg-white rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold text-sm">{fmtData(e.data)} {e.hora && `• ${e.hora}`}</div>
                  {e.responsavel && <div className="text-xs text-gray-500">Por: {e.responsavel}</div>}
                </div>
                <button onClick={async () => {
                    const ok = await confirm({ titulo: 'Remover entrada', mensagem: 'Remover esta entrada? O estoque será recalculado.', perigo: true, confirmar: 'Remover' });
                    if (ok) {
                      removeEntrada(e.id);
                      toast('Entrada removida.', 'sucesso', { acao: { label: 'Desfazer', onClick: () => restaurarRegistro('entrada', e) } });
                    }
                  }}
                  className="text-red-400 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50">
                  Remover
                </button>
              </div>
              {e.itens.map(item => {
                const p = produtos.find(x => x.id === item.produtoId);
                return (
                  <div key={item.produtoId} className="flex justify-between text-sm border-t border-gray-50 pt-1 mt-1">
                    <span className="text-gray-700">{p?.nome || item.produtoId}</span>
                    <span className="font-semibold text-green-700">+{item.quantidade} {p?.unidade}</span>
                  </div>
                );
              })}
              {e.obs && <p className="text-xs text-gray-500 mt-2 italic">{e.obs}</p>}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
