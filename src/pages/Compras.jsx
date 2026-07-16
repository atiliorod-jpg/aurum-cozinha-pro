import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import ResponsavelSelect from '../components/ResponsavelSelect';
import AutocompleteInput from '../components/AutocompleteInput';
import { hoje, fmtData, fmtHora, fmtNum } from '../utils/formatters';
import { validarDataRegistro } from '../utils/datas';
import { listaDeCompras, agruparListaPorMateriaPrima, fcEfetivo, preparacoesDoItem } from '../utils/analise';

export default function Compras() {
  const { compras, addCompra, fichas, estoque, produtos, aparas, desperdicio, listaManual, setListaManual, producoes, prefs, setPref } = useApp();
  const { toast, confirm } = useUI();
  const location = useLocation();
  const [form, setForm] = useState({
    data: hoje(), fornecedor: '', item: '', quantidade: '', unidade: 'kg', responsavel: prefs.responsavel || '',
  });
  const [tab, setTab] = useState(location.state?.tab === 'lista' ? 'lista' : 'novo'); // novo | lista
  const [fornecedorAuto, setFornecedorAuto] = useState(false);
  const [busca, setBusca] = useState('');

  const listaCompleta = useMemo(
    () => listaDeCompras(produtos, estoque, compras, aparas, desperdicio),
    [produtos, estoque, compras, aparas, desperdicio]
  );

  // Filtro de busca (por nome do produto / categoria / matéria-prima)
  const b = busca.trim().toLowerCase();
  const lista = b
    ? listaCompleta.filter(({ p }) =>
        (p.nome || '').toLowerCase().includes(b) ||
        (p.categoria || '').toLowerCase().includes(b) ||
        (p.materiaPrima || '').toLowerCase().includes(b))
    : listaCompleta;
  const manualFiltrada = b
    ? listaManual.filter(m => (m.nome || '').toLowerCase().includes(b))
    : listaManual;

  // Linhas para exibir: produtos da mesma matéria-prima viram uma linha só (somada)
  const listaAgrupada = useMemo(() => agruparListaPorMateriaPrima(lista), [lista]);
  const [expandido, setExpandido] = useState({}); // materiaPrima -> bool

  // Ingredientes não controlados em estoque (abate: false) por receita — referência para o comprador
  const ingredientesReceita = useMemo(() => {
    const mapa = new Map();
    producoes.forEach(r => {
      (r.ingredientes || []).filter(i => !i.abate && (i.nome || '').trim()).forEach(i => {
        const chave = i.nome.trim().toLowerCase();
        if (!mapa.has(chave)) mapa.set(chave, { nome: i.nome.trim(), usos: [] });
        mapa.get(chave).usos.push({ receita: r.nome, quantidade: i.quantidade, unidade: i.unidade || 'un' });
      });
    });
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [producoes]);

  const copiarLista = async () => {
    const linhas = [`🧾 LISTA DE COMPRAS — ${fmtData(hoje())}`];
    const textoItem = ({ p, atual, brutoKg, liquidoKg, fc, fornecedor }) => {
      const kgTexto = brutoKg
        ? `${fmtNum(brutoKg)} kg bruto${fc ? ` (FC ${Math.round(fc * 100)}%)` : ''}`
        : liquidoKg
          ? `${fmtNum(liquidoKg)} kg`
          : `${fmtNum(Math.max((p.max || p.min) - atual, 0))} ${p.unidade}`;
      const fornTexto = fornecedor ? ` — fornecedor: ${fornecedor}` : '';
      return `${kgTexto}${fornTexto} (tem ${fmtNum(atual)} ${p.unidade})`;
    };
    agruparListaPorMateriaPrima(listaCompleta).forEach(e => {
      if (e.tipo === 'grupo') {
        const fornTexto = e.fornecedor ? ` — fornecedor: ${e.fornecedor}` : '';
        linhas.push(`• ${e.materiaPrima}: comprar ${fmtNum(e.brutoKg)} kg bruto${fornTexto}`);
        e.itens.forEach(it => linhas.push(`   └ ${it.p.nome}: ${it.brutoKg ? `${fmtNum(it.brutoKg)} kg` : `${fmtNum(it.sugerido)} ${it.p.unidade}`}`));
      } else {
        linhas.push(`• ${e.p.nome}: comprar ${textoItem(e)}`);
      }
    });
    if (listaManual.length) {
      linhas.push('', '— Adicionados manualmente —');
      listaManual.forEach(m => linhas.push(`• ${m.nome}: ${fmtNum(m.quantidade)} ${m.unidade}${m.origem ? ` (${m.origem})` : ''}`));
    }
    try {
      await navigator.clipboard.writeText(linhas.join('\n'));
      toast('Lista copiada! Cole onde precisar.', 'sucesso');
    } catch {
      toast('Não foi possível copiar automaticamente.', 'aviso');
    }
  };

  const removerManual = (id) => setListaManual(listaManual.filter(m => m.id !== id));
  const limparManuais = () => setListaManual([]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Sugestões de itens: produtos cadastrados + itens já comprados
  const itensSugeridos = useMemo(() => {
    const m = new Map();
    produtos.forEach(p => p.nome && m.set(p.nome.toLowerCase(), p.nome));
    compras.forEach(c => c.item && m.set(c.item.toLowerCase(), c.item));
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [produtos, compras]);

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

  // Fator de correção do ingrediente que está sendo comprado + preparações que o usam.
  // O FC é do INGREDIENTE (matéria-prima), não de cada preparação: um único FC do filé
  // já cobre parmegiana, strogonoff, filé com fritas etc. — todas saem do mesmo estoque limpo.
  const itemInfo = useMemo(() => {
    const item = form.item.trim();
    if (!item) return null;
    const itemMin = item.toLowerCase();
    const prod = produtos.find(p => {
      const n = (p.nome || '').toLowerCase();
      if (!n) return false;
      const menor = n.length <= itemMin.length ? n : itemMin;
      if (menor.length < 4) return n === itemMin;
      return n === itemMin || n.includes(itemMin) || itemMin.includes(n);
    });
    const fc = prod ? fcEfetivo(prod, compras, aparas, desperdicio) : 0;
    const preparacoes = preparacoesDoItem(item, fichas);
    if (!fc && preparacoes.length === 0) return null;
    return { fc, preparacoes, prodNome: prod?.nome || item };
  }, [form.item, produtos, fichas, compras, aparas, desperdicio]);

  const [salvando, setSalvando] = useState(false); // trava anti-duplo-toque
  const handleSalvar = async () => {
    if (salvando) return; // toque repetido — já registrando
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
    setSalvando(true);
    setTimeout(() => setSalvando(false), 800);
    // Vincula ao produto do catálogo quando o nome digitado é IGUAL (o match por
    // id é exato e blinda o FC/fornecedor contra ambiguidade de texto livre)
    const prodExato = produtos.find(p => p.ativo && (p.nome || '').trim().toLowerCase() === form.item.trim().toLowerCase());
    addCompra({ ...form, ...(prodExato ? { produtoId: prodExato.id } : {}), hora: fmtHora(), quantidade: parseFloat(form.quantidade) });
    if (form.responsavel) setPref('responsavel', form.responsavel);
    setForm(prev => ({ ...prev, item: '', quantidade: '', fornecedor: '' }));
    toast('Compra registrada!', 'sucesso');
  };

  return (
    <Layout title="Compras / Recebimento">
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[
          ['novo', '+ Nova compra'],
          ['lista', `🧾 Lista de compras${listaCompleta.length + listaManual.length ? ` (${listaCompleta.length + listaManual.length})` : ''}`],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors
              ${tab === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'lista' && (
        <div className="space-y-3">
          <div className="bg-polo-beige border border-polo-gold/40 rounded-xl p-3 text-xs text-polo-navy">
            <strong>Automática:</strong> produtos abaixo do mínimo. <strong>Manual:</strong> itens adicionados ao planejar uma produção.
          </div>

          {/* Busca na lista */}
          {(listaCompleta.length > 0 || listaManual.length > 0) && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Pesquisar item ou categoria…"
                className="w-full border border-gray-200 rounded-xl pl-9 pr-9 py-2.5 text-sm"
              />
              {busca && (
                <button onClick={() => setBusca('')} aria-label="Limpar busca"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">×</button>
              )}
            </div>
          )}

          {listaCompleta.length === 0 && listaManual.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-semibold text-gray-700">Nada para comprar!</p>
              <p className="text-xs text-gray-500 mt-1">Nenhum produto está abaixo do mínimo.</p>
            </div>
          ) : b && lista.length === 0 && manualFiltrada.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">🔍</div>
              <p className="text-sm font-semibold text-gray-700">Nenhum item encontrado</p>
              <p className="text-xs text-gray-500 mt-1">Nada na lista corresponde a "{busca}".</p>
            </div>
          ) : (
            <>
              {listaAgrupada.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">Abaixo do mínimo</p>
                    <span className="text-xs text-gray-400">{listaAgrupada.length} {listaAgrupada.length === 1 ? 'linha' : 'linhas'} • mais crítico primeiro</span>
                  </div>
                  {listaAgrupada.map((entrada) => {
                    // ── Linha de GRUPO (matéria-prima unificada) ──
                    if (entrada.tipo === 'grupo') {
                      const aberto = !!expandido[entrada.materiaPrima];
                      return (
                        <div key={`g-${entrada.materiaPrima}`} className="bg-white rounded-xl overflow-hidden border border-polo-gold/50">
                          <div className="px-4 py-2 bg-polo-beige border-b border-polo-gold/30 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-polo-navy bg-polo-gold px-1.5 py-0.5 rounded uppercase">
                              🛒 Matéria-prima
                            </span>
                            <span className="text-[10px] text-polo-navy/60">{entrada.itens.length} produtos</span>
                          </div>
                          <div className="px-4 py-3 space-y-2">
                            <div className="font-semibold text-sm text-gray-900">{entrada.materiaPrima}</div>
                            <div className="bg-polo-navy rounded-lg px-3 py-2.5 flex items-center justify-between">
                              <div className="text-xs text-white/70">Comprar (bruto total)</div>
                              <div className="text-right">
                                {entrada.brutoKg != null ? (
                                  <div className="text-base font-bold text-polo-gold">{fmtNum(entrada.brutoKg)} kg</div>
                                ) : (
                                  <div className="text-base font-bold text-polo-gold">{fmtNum(entrada.sugerido)}</div>
                                )}
                                {entrada.liquidoKg != null && (
                                  <div className="text-[10px] text-white/75">líquido {fmtNum(entrada.liquidoKg)} kg somado</div>
                                )}
                              </div>
                            </div>
                            <button onClick={() => setExpandido(s => ({ ...s, [entrada.materiaPrima]: !aberto }))}
                              className="w-full flex items-center justify-between text-xs text-polo-navy font-semibold pt-1">
                              <span>{aberto ? 'Ocultar' : 'Ver'} detalhe por produto</span>
                              <span className={`transition-transform ${aberto ? 'rotate-180' : ''}`}>⌄</span>
                            </button>
                            {aberto && (
                              <div className="space-y-1.5 border-t border-gray-100 pt-2">
                                {entrada.itens.map(it => (
                                  <div key={it.p.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                                    <div className="min-w-0">
                                      <div className="font-medium text-gray-800 truncate">{it.p.nome}</div>
                                      <div className="text-[10px] text-gray-500">
                                        tem {fmtNum(it.atual)} {it.p.unidade} • mín {fmtNum(it.p.min)}
                                        {it.fc != null && it.fc > 0 && ` • FC ${Math.round(it.fc * 100)}%`}
                                      </div>
                                    </div>
                                    <span className="font-bold text-polo-navy bg-white border border-gray-200 px-2 py-1 rounded-lg flex-shrink-0 ml-2">
                                      {it.brutoKg != null ? `${fmtNum(it.brutoKg)} kg` : `${fmtNum(it.sugerido)} ${it.p.unidade}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {entrada.fornecedor && (
                              <div className="text-xs text-gray-500 flex items-center gap-1">
                                <span>🏪</span>
                                <span>Último fornecedor: <span className="font-semibold text-gray-700">{entrada.fornecedor}</span></span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    // ── Linha simples (item) ──
                    const { p, atual, brutoKg, liquidoKg, fc, fornecedor } = entrada;
                    const zerado = atual <= 0;
                    const pctMin = p.min > 0 ? Math.min(100, Math.round((atual / p.min) * 100)) : 0;
                    const urgencia = zerado ? 'zerado' : pctMin < 30 ? 'critico' : 'alerta';
                    return (
                      <div key={p.id} className="bg-white rounded-xl overflow-hidden border border-gray-100">
                        {/* Cabeçalho do card */}
                        <div className={`px-4 py-2 flex items-center justify-between
                          ${urgencia === 'zerado' ? 'bg-red-50 border-b border-red-100'
                            : urgencia === 'critico' ? 'bg-orange-50 border-b border-orange-100'
                            : 'bg-yellow-50 border-b border-yellow-100'}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0
                              ${urgencia === 'zerado' ? 'bg-red-600 text-white'
                                : urgencia === 'critico' ? 'bg-orange-500 text-white'
                                : 'bg-yellow-400 text-yellow-950'}`}>
                              {urgencia === 'zerado' ? 'Zerado' : urgencia === 'critico' ? 'Crítico' : 'Alerta'}
                            </span>
                            <span className="text-[10px] text-gray-500 flex-shrink-0">{p.categoria}</span>
                          </div>
                          <span className={`text-[10px] font-semibold flex-shrink-0
                            ${urgencia === 'zerado' ? 'text-red-600' : urgencia === 'critico' ? 'text-orange-600' : 'text-yellow-700'}`}>
                            {pctMin}% do mínimo
                          </span>
                        </div>
                        {/* Corpo */}
                        <div className="px-4 py-3 space-y-2">
                          <div className="font-semibold text-sm text-gray-900">{p.nome}</div>
                          {/* Linha de estoque atual */}
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>Tem: <span className={`font-bold ${zerado ? 'text-red-600' : 'text-gray-700'}`}>{fmtNum(atual)} {p.unidade}</span></span>
                            <span className="text-gray-300">|</span>
                            <span>Mín: <span className="font-semibold text-gray-700">{fmtNum(p.min)} {p.unidade}</span></span>
                            {p.max > 0 && <>
                              <span className="text-gray-300">|</span>
                              <span>Meta: <span className="font-semibold text-gray-700">{fmtNum(p.max)} {p.unidade}</span></span>
                            </>}
                          </div>
                          {/* Quantidade a comprar — destaque principal */}
                          <div className="bg-polo-navy rounded-lg px-3 py-2.5 flex items-center justify-between">
                            <div className="text-xs text-white/70">Comprar (bruto)</div>
                            <div className="text-right">
                              {brutoKg ? (
                                <>
                                  <div className="text-base font-bold text-polo-gold">{fmtNum(brutoKg)} kg</div>
                                  {fc != null && (
                                    <div className="text-[10px] text-white/75">
                                      líquido {fmtNum(liquidoKg)} kg • FC {Math.round(fc * 100)}% histórico
                                    </div>
                                  )}
                                  {fc == null && liquidoKg && (
                                    <div className="text-[10px] text-white/75">sem FC histórico ainda</div>
                                  )}
                                </>
                              ) : liquidoKg ? (
                                <div className="text-base font-bold text-polo-gold">{fmtNum(liquidoKg)} kg</div>
                              ) : (
                                <>
                                  <div className="text-base font-bold text-polo-gold">
                                    {fmtNum(Math.max((p.max || p.min) - atual, 0))} {p.unidade}
                                  </div>
                                  {p.unidade === 'unid' && !p.pesoUnidade && (
                                    <div className="text-[10px] text-amber-400">cadastre peso/unid para ver em kg</div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          {/* Fornecedor */}
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <span>🏪</span>
                            {fornecedor
                              ? <span>Último fornecedor: <span className="font-semibold text-gray-700">{fornecedor}</span></span>
                              : <span className="italic">Fornecedor não informado nas compras anteriores</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {manualFiltrada.length > 0 && (
                <div className="bg-white rounded-xl overflow-hidden">
                  <div className="bg-polo-gold px-4 py-2.5 flex justify-between items-center">
                    <h2 className="text-polo-navy text-sm font-bold">Adicionados manualmente</h2>
                    <button onClick={limparManuais} className="text-polo-navy/70 text-xs font-semibold">Limpar</button>
                  </div>
                  {manualFiltrada.map((m, i, arr) => (
                    <div key={m.id} className={`flex items-center justify-between px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-gray-800 truncate">{m.nome}</div>
                        {m.origem && <div className="text-[10px] text-amber-700">{m.origem}</div>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="font-bold text-polo-navy text-sm bg-polo-beige px-3 py-1.5 rounded-lg">
                          {fmtNum(m.quantidade)} {m.unidade}
                        </span>
                        <button onClick={() => removerManual(m.id)} aria-label={`Remover ${m.nome}`}
                          className="text-red-400 font-bold text-lg w-6">×</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {ingredientesReceita.length > 0 && (
                <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-polo-navy">📖 Ingredientes de receita (referência)</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">Não controlados em estoque — lembrete para o comprador.</p>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5 flex-shrink-0">
                      {ingredientesReceita.length} {ingredientesReceita.length === 1 ? 'item' : 'itens'}
                    </span>
                  </div>
                  {ingredientesReceita.map((item, i, arr) => (
                    <div key={item.nome} className={`px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-semibold text-sm text-gray-800">{item.nome}</span>
                        <span className="text-[10px] text-gray-400">· {item.usos.length} {item.usos.length === 1 ? 'receita' : 'receitas'}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {item.usos.map((u, j) => (
                          <span key={j} className="text-[10px] bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 text-gray-600">
                            {u.receita} <span className="font-bold text-gray-800">{u.quantidade}{u.unidade}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={copiarLista}
                  className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm">
                  📋 Copiar lista
                </button>
                <button onClick={() => window.print()}
                  className="flex-1 border border-polo-navy text-polo-navy font-semibold py-3 rounded-xl text-sm">
                  🖨️ Imprimir
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
                <AutocompleteInput
                  value={form.fornecedor}
                  onChange={v => { setFornecedorAuto(false); set('fornecedor', v); }}
                  sugestoes={fornecedoresSugeridos}
                  placeholder="Nome do fornecedor"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Item comprado</label>
              <AutocompleteInput
                value={form.item}
                onChange={onItemChange}
                sugestoes={itensSugeridos}
                placeholder="Ex: Filé Mignon, Frango Filé, Picanha..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Digite e escolha da lista — o fornecedor do último recebimento deste item entra sozinho.</p>

              {itemInfo && (
                <div className="mt-2 bg-polo-beige border border-polo-gold/50 rounded-xl p-3 space-y-2">
                  {itemInfo.fc > 0 ? (
                    <p className="text-xs text-polo-navy">
                      🎯 Rendimento de <strong>{itemInfo.prodNome}</strong>: o sistema desconta{' '}
                      <strong>{Math.round(itemInfo.fc * 100)}%</strong> de apara/perda — você compra mais bruto na lista para sobrar o líquido certo.
                    </p>
                  ) : (
                    <p className="text-xs text-polo-navy/80">
                      🎯 Ainda sem fator de correção para <strong>{itemInfo.prodNome}</strong>. Registre uma apara vinculada a este produto (em ✂️ Aparas) para o FC ser calculado sozinho.
                    </p>
                  )}
                  {itemInfo.preparacoes.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-polo-navy/70 mb-1">
                        Esse FC vale para as {itemInfo.preparacoes.length} preparações que usam este ingrediente:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {itemInfo.preparacoes.map((pr, i) => (
                          <span key={i} className="text-[10px] bg-white text-polo-navy border border-polo-gold/40 rounded-full px-2 py-0.5">
                            {pr.preparacao}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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

          <button onClick={handleSalvar} disabled={!form.item.trim() || !form.quantidade || salvando}
            className="w-full bg-polo-navy text-polo-gold font-bold py-4 rounded-xl text-base active:scale-95 transition-transform disabled:opacity-40 disabled:scale-100">
            ✓ Registrar Compra
          </button>
        </div>
      ) : null}
    </Layout>
  );
}
