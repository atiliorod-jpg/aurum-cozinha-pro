import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { fatorCorrecaoItem } from '../utils/analise';
import { fmtNum } from '../utils/formatters';

// Sem histórico de compras/aparas do item, parte de 0% — o usuário ajusta se souber a perda real
const CORRECAO_PADRAO = 0;

function ModalFicha({ ficha, onSalvar, onFechar }) {
  const [form, setForm] = useState(ficha || { materiaPrima: '', preparacao: '', gramatura: '', coccao: '' });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto overscroll-contain p-4 flex">
      <div className="bg-white w-full max-w-lg m-auto rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg text-polo-navy">{ficha ? 'Editar Ficha' : 'Nova Ficha'}</h2>
          <button onClick={onFechar} className="text-2xl text-gray-500">×</button>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Matéria-prima</label>
          <input type="text" value={form.materiaPrima} onChange={e => set('materiaPrima', e.target.value)}
            placeholder="Ex: Filé Mignon"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Preparação</label>
          <input type="text" value={form.preparacao} onChange={e => set('preparacao', e.target.value)}
            placeholder="Ex: Parmegiana"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Gramatura (g por porção/lote)</label>
          <input type="number" min="0" value={form.gramatura} onChange={e => set('gramatura', e.target.value)}
            placeholder="Ex: 130"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Fator de cocção — perda no cozimento (%)</label>
          <input type="number" min="0" max="90" step="0.5" value={form.coccao ?? ''} onChange={e => set('coccao', e.target.value)}
            placeholder="Ex: 30 (deixe vazio se não cozinha antes de porcionar)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-gray-500 mt-1">
            Quanto o item perde de peso ao cozinhar, medido na sua cozinha (pese antes e depois). Ex.: carne de sol e charque encolhem bastante no cozimento.
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onFechar} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">Cancelar</button>
          <button onClick={() => onSalvar({ ...form, gramatura: parseFloat(form.gramatura) || 0, coccao: Math.min(parseFloat(form.coccao) || 0, 90) })}
            disabled={!form.materiaPrima.trim() || !form.preparacao.trim() || !parseFloat(form.gramatura)}
            className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl disabled:opacity-40">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Fichas() {
  const { fichas, setFichas, compras, aparas, desperdicio } = useApp();
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState('planejar');
  const [fichaId, setFichaId] = useState('');
  const [porcoes, setPorcoes] = useState('');
  const [correcaoManual, setCorrecaoManual] = useState('');
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [busca, setBusca] = useState('');

  const ficha = fichas.find(f => f.id === fichaId);

  // Fator de correção histórico do item (aparas/perdas ÷ comprado); senão, padrão editável
  const correcaoHistorica = useMemo(
    () => (ficha ? fatorCorrecaoItem(ficha.materiaPrima, compras, aparas, desperdicio) : null),
    [ficha, compras, aparas, desperdicio]
  );
  const correcaoPct = correcaoManual !== ''
    ? Math.min(parseFloat(correcaoManual) || 0, 90)
    : (correcaoHistorica != null ? correcaoHistorica * 100 : CORRECAO_PADRAO);

  const nPorcoes = parseFloat(porcoes) || 0;
  const coccaoPct = ficha ? (parseFloat(ficha.coccao) || 0) : 0;
  // 1) peso servido (cozido) = porções × gramatura
  const servidoKg = ficha ? (nPorcoes * ficha.gramatura) / 1000 : 0;
  // 2) peso cru necessário = servido ÷ (1 − perda de cocção)
  const cruKg = servidoKg > 0 ? servidoKg / (1 - coccaoPct / 100) : 0;
  // 3) compra bruta = cru ÷ (1 − fator de correção de limpeza)
  const brutoKg = cruKg > 0 ? cruKg / (1 - correcaoPct / 100) : 0;

  const grupos = useMemo(() => {
    const m = {};
    fichas
      .filter(f => !busca || f.materiaPrima.toLowerCase().includes(busca.toLowerCase()) || f.preparacao.toLowerCase().includes(busca.toLowerCase()))
      .forEach(f => { (m[f.materiaPrima] = m[f.materiaPrima] || []).push(f); });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [fichas, busca]);

  const salvarFicha = (form) => {
    if (editando) {
      setFichas(fichas.map(f => f.id === editando.id ? { ...f, ...form } : f));
      toast('Ficha atualizada.', 'sucesso');
    } else {
      setFichas([...fichas, { ...form, id: `ficha_${Date.now()}` }]);
      toast('Ficha criada.', 'sucesso');
    }
    setEditando(null);
    setCriando(false);
  };

  return (
    <Layout
      title="Fichas Técnicas"
      actions={
        <button onClick={() => setCriando(true)}
          className="bg-polo-gold text-polo-navy text-xs font-bold px-3 py-1.5 rounded-lg">
          + Ficha
        </button>
      }
    >
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[['planejar', '🧮 Planejar Compra'], ['fichas', '📖 Gramaturas']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors
              ${tab === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'planejar' ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
            Escolha a preparação e quantas porções quer produzir. O sistema calcula o peso líquido pela gramatura
            e <strong>sugere a compra bruta já com o fator de correção</strong> (aparas/perdas de limpeza do seu histórico).
          </div>

          <div className="bg-white rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Preparação</label>
              <select value={fichaId} onChange={e => { setFichaId(e.target.value); setCorrecaoManual(''); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Selecione...</option>
                {grupos.map(([mp, lista]) => (
                  <optgroup key={mp} label={mp}>
                    {lista.map(f => <option key={f.id} value={f.id}>{f.preparacao} ({f.gramatura} g)</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Porções / lotes desejados</label>
                <input type="number" min="0" value={porcoes} onChange={e => setPorcoes(e.target.value)}
                  placeholder="Ex: 150"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Fator de correção (%)
                  {correcaoManual === '' && correcaoHistorica != null && (
                    <span className="ml-1 text-[10px] font-bold text-polo-gold bg-polo-navy px-1.5 py-0.5 rounded">histórico</span>
                  )}
                </label>
                <input type="number" min="0" max="90" step="0.5"
                  value={correcaoManual}
                  onChange={e => setCorrecaoManual(e.target.value)}
                  placeholder={correcaoPct.toFixed(1)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <p className="text-xs text-gray-500 -mt-1">
              {correcaoHistorica != null
                ? `Correção real do seu histórico de compras de ${ficha?.materiaPrima}: ${(correcaoHistorica * 100).toFixed(1)}%.`
                : `Sem histórico de aparas/perdas associadas a compras de ${ficha?.materiaPrima || 'este item'} — começa em 0%; digite a perda de limpeza se você já a conhece.`}
            </p>
          </div>

          {ficha && nPorcoes > 0 && (
            <div className="bg-polo-navy rounded-xl p-5 text-white space-y-3">
              <p className="text-xs uppercase tracking-wide text-polo-gold font-bold">Resultado do planejamento</p>
              <div className={`grid ${coccaoPct > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5 text-center`}>
                <div className="bg-white/10 rounded-lg p-2.5">
                  <div className="text-base font-bold">{fmtNum(nPorcoes)}</div>
                  <div className="text-[9px] opacity-80">porções × {ficha.gramatura} g</div>
                </div>
                <div className="bg-white/10 rounded-lg p-2.5">
                  <div className="text-base font-bold">{fmtNum(servidoKg)} kg</div>
                  <div className="text-[9px] opacity-80">peso servido</div>
                </div>
                {coccaoPct > 0 && (
                  <div className="bg-white/10 rounded-lg p-2.5">
                    <div className="text-base font-bold">{fmtNum(cruKg)} kg</div>
                    <div className="text-[9px] opacity-80">cru (cocção {coccaoPct}%)</div>
                  </div>
                )}
                <div className="bg-polo-gold text-polo-navy rounded-lg p-2.5">
                  <div className="text-base font-bold">{fmtNum(brutoKg)} kg</div>
                  <div className="text-[9px] font-semibold">comprar bruto</div>
                </div>
              </div>
              <p className="text-xs opacity-90">
                🛒 Compre <strong>{fmtNum(brutoKg)} kg</strong> de <strong>{ficha.materiaPrima}</strong> para servir{' '}
                {fmtNum(servidoKg)} kg ({fmtNum(nPorcoes)} × {ficha.preparacao})
                {coccaoPct > 0 && <> — o cozimento reduz {coccaoPct}% do peso</>}
                , mais {correcaoPct.toFixed(1)}% de aparas/perdas na limpeza.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="🔍 Buscar matéria-prima ou preparação..."
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
          {grupos.map(([mp, lista]) => (
            <div key={mp} className="bg-white rounded-xl overflow-hidden">
              <div className="bg-polo-beige px-4 py-2 text-xs font-bold text-polo-navy uppercase tracking-wide">{mp}</div>
              {lista.map((f, i) => (
                <div key={f.id} className={`flex items-center px-4 py-2.5 gap-3 ${i < lista.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 truncate">{f.preparacao}</div>
                    {(parseFloat(f.coccao) || 0) > 0 && (
                      <div className="text-[10px] text-orange-600">🔥 cocção −{f.coccao}%</div>
                    )}
                  </div>
                  <span className="text-sm font-bold text-polo-navy flex-shrink-0">{f.gramatura} g</span>
                  <button onClick={() => setEditando(f)}
                    className="text-xs text-polo-navy font-semibold px-2 py-1 rounded bg-gray-100 flex-shrink-0">Editar</button>
                  <button onClick={async () => {
                      const ok = await confirm({ titulo: 'Excluir ficha', mensagem: `Excluir "${f.preparacao}"?`, perigo: true, confirmar: 'Excluir' });
                      if (ok) { setFichas(fichas.filter(x => x.id !== f.id)); toast('Ficha excluída.', 'sucesso'); }
                    }}
                    className="text-xs text-red-400 font-semibold px-2 py-1 rounded bg-red-50 flex-shrink-0">×</button>
                </div>
              ))}
            </div>
          ))}
          {grupos.length === 0 && (
            <div className="text-center text-gray-500 py-10 text-sm">Nenhuma ficha encontrada.</div>
          )}
        </div>
      )}

      {(editando || criando) && (
        <ModalFicha ficha={editando} onSalvar={salvarFicha} onFechar={() => { setEditando(null); setCriando(false); }} />
      )}
    </Layout>
  );
}
