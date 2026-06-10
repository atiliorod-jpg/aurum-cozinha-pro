import { useState } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import ResponsavelSelect from '../components/ResponsavelSelect';
import { CATEGORIAS } from '../data/produtos';
import { hoje, fmtData, fmtHora, fmtNum } from '../utils/formatters';
import { validarDataRegistro, diasAte } from '../utils/datas';
import { calcLotes } from '../utils/lotes';

const DESTINOS = [
  { value: 'polo_central', label: '🏠 Polo Central' },
  { value: 'polo_beer', label: '🍺 Polo Beer' },
];

export default function Saidas() {
  const { produtos, addSaida, saidas, removeSaida, calcEstoque, entradas, desperdicio, prefs, setPref } = useApp();
  const { toast, confirm } = useUI();
  const [data, setData] = useState(hoje());
  const [responsavel, setResponsavel] = useState(prefs.responsavel || '');
  const [destino, setDestino] = useState(prefs.destino || 'polo_central');
  const [obs, setObs] = useState('');
  const [qtds, setQtds] = useState({});
  const [catAtiva, setCatAtiva] = useState(CATEGORIAS[0]);
  const [busca, setBusca] = useState('');
  const [tab, setTab] = useState('novo');

  const produtosAtivos = produtos.filter(p => p.ativo);
  const estoque = calcEstoque();
  const lotes = calcLotes(entradas, saidas, desperdicio);
  const buscando = busca.trim().length > 0;
  const produtosVisiveis = buscando
    ? produtosAtivos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()))
    : produtosAtivos.filter(p => p.categoria === catAtiva);

  const setQtd = (id, val) => {
    const num = parseFloat(val);
    setQtds(prev => ({ ...prev, [id]: isNaN(num) || num < 0 ? '' : val }));
  };

  const itensPreenchidos = Object.entries(qtds).filter(([, v]) => parseFloat(v) > 0);

  const registrar = () => {
    addSaida({
      data,
      hora: fmtHora(),
      responsavel,
      destino,
      obs,
      itens: itensPreenchidos.map(([produtoId, quantidade]) => ({ produtoId, quantidade: parseFloat(quantidade) })),
    });
    if (responsavel) setPref('responsavel', responsavel);
    setPref('destino', destino);
    setQtds({});
    setObs('');
    toast(`Saída de ${itensPreenchidos.length} item(ns) registrada!`, 'sucesso');
  };

  const handleSalvar = async () => {
    if (!itensPreenchidos.length) {
      toast('Adicione pelo menos um produto com quantidade.', 'aviso');
      return;
    }
    const v = validarDataRegistro(data);
    if (!v.ok) {
      toast('Não é possível registrar saída em data futura.', 'erro');
      return;
    }
    if (v.confirmar) {
      const okData = await confirm({
        titulo: 'Registro antigo',
        mensagem: `Esta saída é de ${v.dias} dias atrás (${fmtData(data)}). Confirma a data?`,
        confirmar: 'Sim, registrar',
      });
      if (!okData) return;
    }
    // Verifica se alguma saída deixa o estoque negativo
    const negativos = itensPreenchidos
      .map(([id, qtd]) => ({ p: produtos.find(x => x.id === id), atual: estoque[id] ?? 0, saida: parseFloat(qtd) }))
      .filter(x => x.saida > x.atual);
    if (negativos.length) {
      const lista = negativos.map(n => `• ${n.p?.nome}: tem ${fmtNum(n.atual)}, saindo ${fmtNum(n.saida)}`).join('\n');
      const ok = await confirm({
        titulo: 'Estoque insuficiente',
        mensagem: `Estes itens ficarão negativos:\n\n${lista}\n\nDeseja registrar mesmo assim?`,
        perigo: true,
        confirmar: 'Registrar assim mesmo',
      });
      if (!ok) return;
    }
    registrar();
  };

  const saidasOrdenadas = [...saidas].sort((a, b) => b.data.localeCompare(a.data) || b.hora?.localeCompare(a.hora || ''));

  return (
    <Layout title="Saídas para Restaurantes">
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[['novo', '+ Nova Saída'], ['historico', '📋 Histórico']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors
              ${tab === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'novo' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
              <input type="date" value={data} max={hoje()} onChange={e => setData(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Destino</label>
              <div className="flex gap-2">
                {DESTINOS.map(d => (
                  <button key={d.value} onClick={() => setDestino(d.value)}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-colors
                      ${destino === d.value
                        ? 'border-polo-gold bg-polo-navy text-polo-gold'
                        : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsavelSelect value={responsavel} onChange={setResponsavel} />
          </div>

          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="🔍 Buscar produto..."
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />

          {!buscando && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {CATEGORIAS.map(c => (
                <button key={c} onClick={() => setCatAtiva(c)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0
                    ${catAtiva === c ? 'bg-polo-navy text-polo-gold' : 'bg-white text-gray-600 border border-gray-200'}`}>
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="bg-white rounded-xl overflow-hidden">
            {produtosVisiveis.length === 0 && (
              <div className="text-center text-gray-500 py-6 text-sm">Nenhum produto encontrado.</div>
            )}
            {produtosVisiveis.map((p, i, arr) => (
              <div key={p.id} className={`flex items-center px-4 py-3 gap-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800 truncate">{p.nome}</div>
                  <div className="text-xs text-gray-500">
                    Em estoque: <span className={`font-semibold ${(estoque[p.id] ?? 0) <= 0 ? 'text-red-500' : 'text-gray-600'}`}>{fmtNum(estoque[p.id] ?? 0)} {p.unidade}</span>
                  </div>
                  {(lotes[p.id] || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {lotes[p.id].map((l, i) => {
                        const dias = diasAte(l.validade);
                        const cor = dias < 0 ? 'bg-red-100 text-red-700 border-red-300'
                          : dias <= 3 ? 'bg-orange-100 text-orange-700 border-orange-300'
                          : 'bg-gray-50 text-gray-500 border-gray-200';
                        return (
                          <span key={i} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cor}`}>
                            {fmtNum(l.restante)} {p.unidade} • {dias < 0 ? 'VENCIDO ' : 'vence '}{fmtData(l.validade)}
                            {i === 0 && lotes[p.id].length > 1 && ' ← pegar deste'}
                          </span>
                        );
                      })}
                    </div>
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
            ))}
          </div>

          <div className="bg-white rounded-xl p-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Observação (opcional)</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Alguma observação..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          {itensPreenchidos.length > 0 && (
            <div className="bg-red-50 rounded-xl p-3 border border-red-100">
              <p className="text-xs font-semibold text-red-700 mb-1">
                Saída para {DESTINOS.find(d => d.value === destino)?.label}:
              </p>
              {itensPreenchidos.map(([id, qtd]) => {
                const p = produtos.find(x => x.id === id);
                return (
                  <div key={id} className="flex justify-between text-sm">
                    <span>{p?.nome}</span>
                    <span className="font-bold text-red-700">−{qtd} {p?.unidade}</span>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={handleSalvar} disabled={!itensPreenchidos.length}
            className="w-full bg-polo-navy text-polo-gold font-bold py-4 rounded-xl text-base
                       disabled:opacity-40 active:scale-95 transition-transform">
            ✓ Registrar Saída
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {saidasOrdenadas.length === 0 && (
            <div className="text-center text-gray-500 py-12">Nenhuma saída registrada ainda.</div>
          )}
          {saidasOrdenadas.map(s => {
            const dest = DESTINOS.find(d => d.value === s.destino);
            return (
              <div key={s.id} className="bg-white rounded-xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold text-sm">{fmtData(s.data)} {s.hora && `• ${s.hora}`}</div>
                    <div className="text-xs font-semibold text-polo-navy">{dest?.label || s.destino}</div>
                    {s.responsavel && <div className="text-xs text-gray-500">Por: {s.responsavel}</div>}
                  </div>
                  <button onClick={async () => {
                      const ok = await confirm({ titulo: 'Remover saída', mensagem: 'Remover esta saída? O estoque será recalculado.', perigo: true, confirmar: 'Remover' });
                      if (ok) { removeSaida(s.id); toast('Saída removida.', 'sucesso'); }
                    }}
                    className="text-red-400 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50">
                    Remover
                  </button>
                </div>
                {s.itens.map(item => {
                  const p = produtos.find(x => x.id === item.produtoId);
                  return (
                    <div key={item.produtoId} className="flex justify-between text-sm border-t border-gray-50 pt-1 mt-1">
                      <span className="text-gray-700">{p?.nome || item.produtoId}</span>
                      <span className="font-semibold text-red-600">−{item.quantidade} {p?.unidade}</span>
                    </div>
                  );
                })}
                {s.obs && <p className="text-xs text-gray-500 mt-2 italic">{s.obs}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
