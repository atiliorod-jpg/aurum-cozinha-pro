import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { statusEstoque, corStatus, pctBarra } from '../utils/calculos';
import { calcSugestoesMinMax, produtosDivergentes } from '../utils/sugestoes';
import { mediaDiariaSaidas, previsaoRuptura, listaDeCompras } from '../utils/analise';
import { diasAte } from '../utils/datas';
import { calcLotes } from '../utils/lotes';
import { fmtNum, fmtData, hoje } from '../utils/formatters';

export default function Dashboard() {
  const { produtos, setProdutos, saidas, entradas, desperdicio, calcEstoque, categorias, prefs } = useApp();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [catAtiva, setCatAtiva] = useState('TODOS');
  const [verSugestoes, setVerSugestoes] = useState(false);
  const [expandido, setExpandido] = useState(null); // produtoId com lotes abertos
  const estoque = calcEstoque();
  const dataHoje = hoje();

  // Sugestões de mín/máx pela média de saídas (escondidas se o modo automático estiver ligado)
  const sugestoes = useMemo(() => calcSugestoesMinMax(produtos, saidas), [produtos, saidas]);
  const divergentes = useMemo(
    () => (prefs.autoMinMax ? [] : produtosDivergentes(produtos, sugestoes)),
    [produtos, sugestoes, prefs.autoMinMax]
  );

  // Lotes restantes por produto (FEFO) e os que vencem em até 5 dias
  const lotes = useMemo(() => calcLotes(entradas, saidas, desperdicio), [entradas, saidas, desperdicio]);
  const vencendo = useMemo(() => {
    const lista = [];
    produtos.forEach(p => {
      if (!p.ativo) return;
      (lotes[p.id] || []).forEach(l => {
        const dias = diasAte(l.validade);
        if (dias <= 5) lista.push({ p, lote: l, dias });
      });
    });
    return lista.sort((a, b) => a.dias - b.dias);
  }, [produtos, lotes]);

  // Previsão de ruptura (ritmo dos últimos 14 dias) e lista de compras
  const medias = useMemo(() => mediaDiariaSaidas(saidas), [saidas]);
  const emRisco = useMemo(
    () => previsaoRuptura(produtos, estoque, medias).filter(x => x.dias <= 3),
    [produtos, estoque, medias]
  );
  const lista = useMemo(() => listaDeCompras(produtos, estoque), [produtos, estoque]);

  const aplicarSugestao = (ids) => {
    const next = produtos.map(p => {
      if (!ids.includes(p.id) || !sugestoes[p.id]) return p;
      return { ...p, min: sugestoes[p.id].min, max: sugestoes[p.id].max };
    });
    setProdutos(next);
    toast(ids.length === 1 ? 'Mín/Máx atualizado.' : `Mín/Máx de ${ids.length} produtos atualizados.`, 'sucesso');
  };

  const produtosAtivos = produtos.filter(p => p.ativo);
  const produtosFiltrados = catAtiva === 'TODOS'
    ? produtosAtivos
    : produtosAtivos.filter(p => p.categoria === catAtiva);

  const totais = {
    total: produtosAtivos.length,
    ok: produtosAtivos.filter(p => statusEstoque(estoque[p.id] ?? 0, p.min, p.max) === 'ok').length,
    critico: produtosAtivos.filter(p => {
      const s = statusEstoque(estoque[p.id] ?? 0, p.min, p.max);
      return s === 'critico' || s === 'zerado';
    }).length,
    excesso: produtosAtivos.filter(p => statusEstoque(estoque[p.id] ?? 0, p.min, p.max) === 'excesso').length,
  };

  const cats = ['TODOS', ...categorias];

  return (
    <Layout title="Polo Estoque — Produção">
      {/* Resumo do dia */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">Atualizado em: {fmtData(dataHoje)}</p>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="bg-green-600 text-white rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{totais.ok}</div>
            <div className="text-xs">Em nível OK</div>
          </div>
          <div className="bg-orange-500 text-white rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{totais.critico}</div>
            <div className="text-xs">Abaixo / Zerado</div>
          </div>
          <div className="bg-blue-500 text-white rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{totais.excesso}</div>
            <div className="text-xs">Excesso</div>
          </div>
        </div>
      </div>

      {/* Lista de compras automática */}
      {lista.length > 0 && (
        <button onClick={() => navigate('/compras', { state: { tab: 'lista' } })}
          className="w-full flex items-center justify-between bg-polo-navy text-white rounded-xl px-4 py-3 mb-4 active:scale-[0.99] transition-transform">
          <span className="text-sm font-semibold">
            🧾 Lista de compras pronta — <strong className="text-polo-gold">{lista.length} {lista.length === 1 ? 'item' : 'itens'}</strong> abaixo do mínimo
          </span>
          <span className="text-polo-gold text-lg">›</span>
        </button>
      )}

      {/* Previsão de ruptura — ritmo atual de consumo */}
      {emRisco.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 mb-4">
          <p className="text-xs font-bold text-red-700 mb-2">📉 Risco de faltar (no ritmo atual de saídas)</p>
          <div className="space-y-1">
            {emRisco.map(({ p, dias }) => (
              <div key={p.id} className="flex justify-between items-center text-xs">
                <span className="font-medium text-gray-700">{p.nome} <span className="text-gray-500">({fmtNum(estoque[p.id] ?? 0)} {p.unidade})</span></span>
                <span className="font-bold text-red-600">
                  {dias < 1 ? 'acaba HOJE' : `acaba em ~${Math.ceil(dias)} dia${Math.ceil(dias) > 1 ? 's' : ''}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lotes vencendo — usar primeiro (FEFO) */}
      {vencendo.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-3 mb-4">
          <p className="text-xs font-bold text-orange-700 mb-2">⏰ Usar primeiro — lotes vencendo</p>
          <div className="space-y-1">
            {vencendo.map(({ p, lote, dias }, i) => (
              <div key={`${p.id}-${i}`} className="flex justify-between items-center text-xs">
                <span className="font-medium text-gray-700">{p.nome} <span className="text-gray-500">({fmtNum(lote.restante)} {p.unidade})</span></span>
                <span className={`font-bold ${dias < 0 ? 'text-red-600' : dias <= 2 ? 'text-orange-600' : 'text-amber-600'}`}>
                  {dias < 0 ? `VENCIDO (${fmtData(lote.validade)})` : dias === 0 ? 'vence HOJE' : `vence em ${dias}d (${fmtData(lote.validade)})`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sugestão de mín/máx pela média de saídas */}
      {divergentes.length > 0 && (
        <div className="bg-polo-beige border border-polo-gold/50 rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-polo-navy flex-1">
              💡 <strong>{divergentes.length} produto{divergentes.length > 1 ? 's' : ''}</strong> com mín/máx fora do consumo real (média dos últimos {sugestoes[divergentes[0].id]?.dias} dias).
            </p>
            <button onClick={() => setVerSugestoes(v => !v)}
              className="text-xs font-bold text-polo-navy underline flex-shrink-0">
              {verSugestoes ? 'Ocultar' : 'Ver'}
            </button>
            <button onClick={() => aplicarSugestao(divergentes.map(p => p.id))}
              className="bg-polo-navy text-polo-gold text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0">
              Aplicar todos
            </button>
          </div>
          {verSugestoes && (
            <div className="mt-2 space-y-1.5">
              {divergentes.map(p => {
                const s = sugestoes[p.id];
                return (
                  <div key={p.id} className="flex items-center justify-between bg-white/70 rounded-lg px-3 py-2">
                    <div className="text-xs">
                      <span className="font-semibold text-gray-800">{p.nome}</span>
                      <span className="text-gray-500 block">
                        Mín {p.min} → <strong>{s.min}</strong> • Máx {p.max} → <strong>{s.max}</strong> {p.unidade}
                      </span>
                    </div>
                    <button onClick={() => aplicarSugestao([p.id])}
                      className="text-xs font-bold text-polo-navy border border-polo-navy/30 px-2.5 py-1 rounded-lg">
                      Aplicar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filtro por categoria */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-3">
        {cats.map(cat => (
          <button
            key={cat}
            onClick={() => setCatAtiva(cat)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex-shrink-0
              ${catAtiva === cat
                ? 'bg-polo-navy text-polo-gold'
                : 'bg-white text-gray-600 border border-gray-200'}`}
          >
            {cat === 'TODOS' ? 'Todos' : cat}
          </button>
        ))}
      </div>

      {/* Cards de produtos */}
      <div className="space-y-2">
        {categorias.filter(c => catAtiva === 'TODOS' || c === catAtiva).map(cat => {
          const prods = produtosFiltrados.filter(p => p.categoria === cat);
          if (!prods.length) return null;
          return (
            <div key={cat}>
              <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wider mb-1 mt-3">{cat}</h2>
              {prods.map(p => {
                const atual = estoque[p.id] ?? 0;
                const status = statusEstoque(atual, p.min, p.max);
                const cor = corStatus(status);
                const pct = pctBarra(atual, p.max);
                const lotesProduto = lotes[p.id] || [];
                const aberto = expandido === p.id;
                return (
                  <div key={p.id}
                    onClick={() => lotesProduto.length && setExpandido(aberto ? null : p.id)}
                    className={`${cor.bg} rounded-xl p-3 mb-2 border border-white/60 ${lotesProduto.length ? 'cursor-pointer active:scale-[0.995] transition-transform' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-gray-800">
                        {p.nome}
                        {lotesProduto.length > 0 && (
                          <span className="ml-1.5 text-[10px] font-bold text-polo-navy bg-white/70 px-1.5 py-0.5 rounded-full">
                            🏷️ {lotesProduto.length} lote{lotesProduto.length > 1 ? 's' : ''} {aberto ? '▾' : '▸'}
                          </span>
                        )}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cor.badge}`}>
                        {cor.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white/60 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            status === 'zerado' ? 'bg-red-500' :
                            status === 'critico' ? 'bg-orange-500' :
                            status === 'excesso' ? 'bg-blue-500' :
                            status === 'ok' ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-sm font-bold ${cor.text} min-w-[60px] text-right`}>
                        {fmtNum(atual)} {p.unidade}
                      </span>
                    </div>
                    {(p.min > 0 || p.max > 0) && (
                      <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                        <span>Mín: {p.min} {p.unidade}</span>
                        <span>Máx: {p.max} {p.unidade}</span>
                      </div>
                    )}
                    {aberto && lotesProduto.length > 0 && (
                      <div className="mt-2 bg-white/70 rounded-lg p-2 space-y-1">
                        {lotesProduto.map((l, i) => {
                          const dias = diasAte(l.validade);
                          return (
                            <div key={i} className="flex justify-between items-center text-xs">
                              <span className="text-gray-600">
                                {l.armazenamento === 'resfriado' ? '🧊' : '❄️'} {fmtNum(l.restante)} {p.unidade}
                                <span className="text-gray-500"> • entrou {fmtData(l.dataEntrada)}</span>
                              </span>
                              <span className={`font-bold ${dias < 0 ? 'text-red-600' : dias <= 3 ? 'text-orange-600' : 'text-gray-600'}`}>
                                {dias < 0 ? 'VENCIDO ' : 'vence '}{fmtData(l.validade)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {produtosFiltrados.length === 0 && (
        <div className="text-center text-gray-500 py-12">Nenhum produto nesta categoria.</div>
      )}
    </Layout>
  );
}
