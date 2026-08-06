import { useState, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { pode } from '../utils/permissoes';
import ResponsavelSelect from '../components/ResponsavelSelect';
import { fmtNum, fmtData, hoje, fmtHora } from '../utils/formatters';
import LeitorQR from '../components/LeitorQR';
import { lerLoteIdDoQR } from '../utils/etiquetas';

export default function Inventario() {
  const { produtos, estoque, addAjuste, ajustes, removeAjuste, categorias, prefs, setPref, etiquetasImpressas, permissoes } = useApp();
  const { toast, confirm } = useUI();
  const { sessao } = useAuth();
  // Mesma trava do Histórico: sem isto o cozinheiro não via 'Remover' lá, mas
  // via aqui — a permissão existia numa porta e faltava nas outras quatro.
  const podeRemover = pode(sessao, permissoes, 'removerRegistros');
  const [data, setData] = useState(hoje());
  const [responsavel, setResponsavel] = useState(prefs.responsavel || '');
  const [contagem, setContagem] = useState({});
  const [catAtiva, setCatAtiva] = useState(categorias[0]);
  const [tab, setTab] = useState('novo');
  const produtosAtivos = produtos.filter(p => p.ativo);

  const setCont = (id, val) => {
    setContagem(prev => ({ ...prev, [id]: val }));
  };

  // ── Contagem por leitura de QR ──────────────────────────────
  // Cada etiqueta lida SOMA 1 ao produto dela. É o ganho real: em vez de
  // procurar o item na lista e digitar, a pessoa passa a câmera nos potes.
  const [lendo, setLendo] = useState(false);
  const [lidos, setLidos] = useState([]); // feedback do que já entrou
  const aoLerQR = useCallback((texto) => {
    const loteId = lerLoteIdDoQR(texto);
    if (!loteId) { toast('Esse QR não é de uma etiqueta do app.', 'aviso'); return; }
    const etq = (etiquetasImpressas || []).find(e => e.id === loteId);
    if (!etq) { toast('Etiqueta não encontrada neste estoque.', 'aviso'); return; }
    // Cada POTE conta uma vez. Sem isto, passar a câmera duas vezes no mesmo
    // pote (comum quando não se vê o toast) contava em dobro — e a contagem
    // física vira a nova base do estoque.
    if (lidos.some(l => l.loteId === loteId)) { toast(`"${etq.nome}" já foi contado.`, 'aviso'); return; }
    if (!etq.produtoId) { toast(`"${etq.nome}" é etiqueta avulsa — não entra na contagem.`, 'aviso'); return; }
    const prod = produtos.find(p => p.id === etq.produtoId);
    // Quanto cada etiqueta SOMA depende da unidade do produto. Somar sempre 1
    // corrompia o estoque de quem vende por peso: 5 potes de 2 kg viravam
    // "5 kg" em vez de 10 kg — e a contagem vira a nova base do estoque.
    const passo = prod?.unidade === 'unid'
      ? 1
      : parseFloat(String(etq.medida || '').replace(',', '.').match(/[\d.]+/)?.[0] || '');
    if (!passo || passo <= 0) {
      toast(`"${etq.nome}" é por ${prod?.unidade || 'peso'} e a etiqueta não tem a medida — digite a quantidade na lista.`, 'aviso', { duracao: 5000 });
      return;
    }
    setContagem(prev => ({ ...prev, [etq.produtoId]: String((parseFloat(prev[etq.produtoId]) || 0) + passo) }));
    setLidos(prev => [{ loteId, nome: etq.nome, validade: etq.validade }, ...prev]);
    toast(`+1 ${etq.nome}`, 'sucesso', { duracao: 1200 });
  }, [etiquetasImpressas, produtos, lidos, toast]);

  const itensContados = Object.entries(contagem).filter(([, v]) => v !== '' && v != null && !isNaN(parseFloat(v)));

  const [salvando, setSalvando] = useState(false); // trava anti-duplo-toque
  const handleSalvar = async () => {
    if (salvando) return; // toque repetido — já registrando
    if (!itensContados.length) {
      toast('Conte ao menos um produto.', 'aviso');
      return;
    }
    if (itensContados.some(([, v]) => parseFloat(v) < 0)) {
      toast('A contagem não pode ser negativa.', 'aviso');
      return;
    }
    // A trava sobe ANTES do await da confirmação: senão um segundo toque
    // passa pela guarda enquanto o diálogo está aberto.
    setSalvando(true);
    const ok = await confirm({
      titulo: 'Confirmar contagem física',
      mensagem: `Você está ajustando o estoque de ${itensContados.length} produto(s) para o valor contado fisicamente. Isso passa a ser a nova base de cálculo.`,
      confirmar: 'Salvar contagem',
    });
    if (!ok) { setSalvando(false); return; }
    setTimeout(() => setSalvando(false), 800);
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
            O estoque é <strong>calculado automaticamente</strong> (estoque inicial + entradas − saídas − perdas do estoque). As aparas <strong>não</strong> abatem o estoque. Use esta tela só quando <strong>conferir fisicamente</strong> e o valor real divergir: a contagem digitada vira a nova base a partir de agora.
          </div>

          <div className="bg-white rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
              <input type="date" value={data} max={hoje()} onChange={e => setData(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <ResponsavelSelect value={responsavel} onChange={setResponsavel} />
          </div>

          {/* Contagem por câmera: cada etiqueta lida soma 1 ao produto dela */}
          <div className="bg-white rounded-xl p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-polo-navy">📷 Contar escaneando</p>
                <p className="text-[11px] text-gray-500">
                  Passe a câmera no QR de cada pote. Produto por unidade soma 1; por peso/volume soma a medida da etiqueta. Dá para misturar com a digitação.
                </p>
              </div>
              <button onClick={() => setLendo(v => !v)}
                className={`text-xs font-bold px-3 py-2 rounded-lg flex-shrink-0 ${lendo ? 'bg-gray-100 text-gray-600' : 'bg-polo-navy text-polo-gold'}`}>
                {lendo ? 'Parar' : 'Escanear'}
              </button>
            </div>
            {lendo && (
              <div className="mt-3">
                <LeitorQR onLer={aoLerQR} onFechar={() => setLendo(false)} />
              </div>
            )}
            {lidos.length > 0 && (
              <ul className="mt-3 space-y-1">
                {lidos.slice(0, 8).map((l) => (
                  <li key={l.loteId} className="text-[11px] text-gray-600 flex justify-between gap-2">
                    <span className="truncate">✓ {l.nome}</span>
                    <span className="text-gray-400 flex-shrink-0">
                      {l.validade ? `val. ${fmtData(l.validade)}` : 'sem validade'} · {l.loteId}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
                      type="number" inputMode="decimal" min="0" step="0.5"
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

          <button onClick={handleSalvar} disabled={!itensContados.length || salvando}
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
                {podeRemover && (
                <button onClick={async () => {
                  const ok = await confirm({ titulo: 'Remover contagem', mensagem: `Remover todos os ${sessao.itens.length} ajustes desta contagem?`, perigo: true, confirmar: 'Remover' });
                  if (ok) {
                    sessao.itens.forEach(aj => removeAjuste(aj.id));
                    toast('Contagem removida.', 'sucesso');
                  }
                }} aria-label="Remover esta contagem"
                  className="text-red-500 text-lg font-semibold ml-2 min-w-11 min-h-11 flex items-center justify-center flex-shrink-0">×</button>
                )}
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
