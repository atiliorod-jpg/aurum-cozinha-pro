import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import ResponsavelSelect from '../components/ResponsavelSelect';
import { hoje, fmtData, fmtHora, fmtNum } from '../utils/formatters';
import { validarDataRegistro } from '../utils/datas';
import { listaDeCompras } from '../utils/analise';

export default function Compras() {
  const { compras, addCompra, fichas, estoque, produtos, aparas, desperdicio, listaManual, setListaManual, producoes, prefs, setPref } = useApp();
  const { toast, confirm } = useUI();
  const location = useLocation();
  const [form, setForm] = useState({
    data: hoje(), fornecedor: '', item: '', quantidade: '', unidade: 'kg', responsavel: prefs.responsavel || '',
  });
  const [tab, setTab] = useState(location.state?.tab === 'lista' ? 'lista' : 'novo'); // novo | lista
  const [fornecedorAuto, setFornecedorAuto] = useState(false);

  const lista = useMemo(
    () => listaDeCompras(produtos, estoque, compras, aparas, desperdicio),
    [produtos, estoque, compras, aparas, desperdicio]
  );

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
    lista.forEach(({ p, atual, brutoKg, liquidoKg, fc, fornecedor }) => {
      const kgTexto = brutoKg
        ? `${fmtNum(brutoKg)} kg bruto${fc ? ` (FC ${Math.round(fc * 100)}%)` : ''}`
        : liquidoKg
          ? `${fmtNum(liquidoKg)} kg`
          : `${fmtNum(Math.max((p.max || p.min) - atual, 0))} ${p.unidade}`;
      const fornTexto = fornecedor ? ` — fornecedor: ${fornecedor}` : '';
      linhas.push(`• ${p.nome}: comprar ${kgTexto}${fornTexto} (tem ${fmtNum(atual)} ${p.unidade})`);
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

  return (
    <Layout title="Compras / Recebimento">
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[
          ['novo', '+ Nova compra'],
          ['lista', `🧾 Lista de compras${lista.length + listaManual.length ? ` (${lista.length + listaManual.length})` : ''}`],
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
          {lista.length === 0 && listaManual.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-semibold text-gray-700">Nada para comprar!</p>
              <p className="text-xs text-gray-500 mt-1">Nenhum produto está abaixo do mínimo.</p>
            </div>
          ) : (
            <>
              {lista.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">Abaixo do mínimo</p>
                    <span className="text-xs text-gray-400">{lista.length} {lista.length === 1 ? 'item' : 'itens'} • mais crítico primeiro</span>
                  </div>
                  {lista.map(({ p, atual, sugerido, brutoKg, liquidoKg, fc, fornecedor }) => {
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
                                    <div className="text-[10px] text-white/50">
                                      líquido {fmtNum(liquidoKg)} kg • FC {Math.round(fc * 100)}% histórico
                                    </div>
                                  )}
                                  {fc == null && liquidoKg && (
                                    <div className="text-[10px] text-white/50">sem FC histórico ainda</div>
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
                          {/* Conversão para embalagem de compra (caixa/fardo) */}
                          {p.unidEmbalagem > 0 && sugerido > 0 && (
                            <div className="text-xs text-polo-navy bg-polo-beige rounded-lg px-3 py-1.5 font-semibold">
                              📦 ≈ {Math.ceil(sugerido / p.unidEmbalagem)} {p.nomeEmbalagem || 'embalagem'}(s)
                              <span className="font-normal text-gray-500"> ({p.unidEmbalagem} {p.unidade} cada)</span>
                            </div>
                          )}
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

              {listaManual.length > 0 && (
                <div className="bg-white rounded-xl overflow-hidden">
                  <div className="bg-polo-gold px-4 py-2.5 flex justify-between items-center">
                    <h2 className="text-polo-navy text-sm font-bold">Adicionados manualmente</h2>
                    <button onClick={limparManuais} className="text-polo-navy/70 text-xs font-semibold">Limpar</button>
                  </div>
                  {listaManual.map((m, i, arr) => (
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
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                    <p className="text-xs font-bold text-polo-navy">📖 Ingredientes de receita (referência)</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Não controlados em estoque — lembrete para o comprador.</p>
                  </div>
                  {ingredientesReceita.map((item, i, arr) => (
                    <div key={item.nome} className={`px-4 py-2.5 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                      <div className="font-medium text-sm text-gray-800">{item.nome}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {item.usos.map((u, j) => (
                          <span key={j} className="text-[11px] text-gray-500">
                            {u.receita}: <span className="font-semibold text-gray-700">{u.quantidade} {u.unidade}</span>
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

          <button onClick={handleSalvar} disabled={!form.item.trim() || !form.quantidade}
            className="w-full bg-polo-navy text-polo-gold font-bold py-4 rounded-xl text-base active:scale-95 transition-transform disabled:opacity-40 disabled:scale-100">
            ✓ Registrar Compra
          </button>
        </div>
      ) : null}
    </Layout>
  );
}
