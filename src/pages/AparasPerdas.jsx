import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import ResponsavelSelect from '../components/ResponsavelSelect';
import OrigemCorrecao from '../components/OrigemCorrecao';
import { DESTINOS_APARA, MOTIVOS_DESPERDICIO } from '../data/produtos';
import { hoje, fmtData, fmtHora } from '../utils/formatters';
import { validarDataRegistro } from '../utils/datas';

const TURNOS = ['Manhã', 'Tarde', 'Noite'];

const COR_MOTIVO = {
  V: 'bg-purple-100 text-purple-700',
  P: 'bg-orange-100 text-orange-700',
  S: 'bg-blue-100 text-blue-700',
  A: 'bg-red-100 text-red-700',
  D: 'bg-gray-100 text-gray-700',
  O: 'bg-yellow-100 text-yellow-700',
};

export default function AparasPerdas() {
  const { compras, aparas, addApara, removeApara, desperdicio, addDesperdicio, removeDesperdicio, restaurarRegistro, destinos, produtos, prefs, setPref } = useApp();
  const { toast, confirm } = useUI();
  const [tipo, setTipo] = useState('apara'); // 'apara' | 'perda'
  const [tab, setTab] = useState('novo');

  const [formApara, setFormApara] = useState({
    data: hoje(), turno: prefs.turno || 'Manhã', compraId: '', produtoId: '', item: '', quantidade: '', unidade: 'kg', destino: 'STG', destinoOutro: '', responsavel: prefs.responsavel || '',
  });
  const [formPerda, setFormPerda] = useState({
    data: hoje(), turno: prefs.turno || 'Manhã', origem: 'estoque', produtoId: '', compraId: '', item: '', quantidade: '', unidade: 'kg', motivo: 'S', motivoOutro: '', responsavel: prefs.responsavel || '',
  });

  const setA = (k, v) => setFormApara(prev => ({ ...prev, [k]: v }));
  const setP = (k, v) => setFormPerda(prev => ({ ...prev, [k]: v }));
  const patchPerda = (obj) => setFormPerda(prev => ({ ...prev, ...obj }));

  const comprasRecentes = [...compras].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);

  const salvarApara = async () => {
    if (!formApara.item.trim() || !formApara.quantidade) {
      toast('Preencha a descrição e a quantidade.', 'aviso');
      return;
    }
    if (!(parseFloat(formApara.quantidade) > 0)) {
      toast('A quantidade deve ser maior que zero.', 'aviso');
      return;
    }
    const v = validarDataRegistro(formApara.data);
    if (!v.ok) { toast('Não é possível registrar em data futura.', 'erro'); return; }
    if (v.confirmar) {
      const okData = await confirm({ titulo: 'Registro antigo', mensagem: `Este registro é de ${v.dias} dias atrás (${fmtData(formApara.data)}). Confirma a data?`, confirmar: 'Sim, registrar' });
      if (!okData) return;
    }
    if (formApara.destino === 'OUT' && !formApara.destinoOutro.trim()) {
      toast('Escreva qual é o destino previsto.', 'aviso');
      return;
    }
    // Apara é sempre monitoramento de rendimento: nunca abate estoque
    let qtdApara = parseFloat(formApara.quantidade);
    let unidApara = formApara.unidade;
    if (unidApara === 'g') { qtdApara = qtdApara / 1000; unidApara = 'kg'; }
    // O fator de correção é calculado ao vivo (aparas + perdas ligadas ao produto/compra),
    // não precisa recalcular/gravar nada aqui — basta vincular a apara ao produto.
    addApara({ ...formApara, origem: 'recebimento', hora: fmtHora(), quantidade: qtdApara, unidade: unidApara });

    if (formApara.responsavel) setPref('responsavel', formApara.responsavel);
    setPref('turno', formApara.turno);
    setFormApara(prev => ({ ...prev, compraId: '', produtoId: '', item: '', quantidade: '', destinoOutro: '' }));
    toast('Apara registrada! Vai para o freezer de reaproveitamento.', 'sucesso');
  };

  const salvarPerda = async () => {
    if (!formPerda.item.trim() || !formPerda.quantidade) {
      toast('Preencha a descrição e a quantidade.', 'aviso');
      return;
    }
    if (!(parseFloat(formPerda.quantidade) > 0)) {
      toast('A quantidade deve ser maior que zero.', 'aviso');
      return;
    }
    const v = validarDataRegistro(formPerda.data);
    if (!v.ok) { toast('Não é possível registrar em data futura.', 'erro'); return; }
    if (v.confirmar) {
      const okData = await confirm({ titulo: 'Registro antigo', mensagem: `Este registro é de ${v.dias} dias atrás (${fmtData(formPerda.data)}). Confirma a data?`, confirmar: 'Sim, registrar' });
      if (!okData) return;
    }
    if (formPerda.origem === 'estoque' && !formPerda.produtoId) {
      toast('Selecione o produto do estoque que perdeu.', 'aviso');
      return;
    }
    if (formPerda.motivo === 'O' && !formPerda.motivoOutro.trim()) {
      toast('Escreva o motivo do descarte.', 'aviso');
      return;
    }
    let qtdPerda = parseFloat(formPerda.quantidade);
    let unidPerda = formPerda.unidade;
    if (unidPerda === 'g') { qtdPerda = qtdPerda / 1000; unidPerda = 'kg'; }
    addDesperdicio({ ...formPerda, hora: fmtHora(), quantidade: qtdPerda, unidade: unidPerda });
    if (formPerda.responsavel) setPref('responsavel', formPerda.responsavel);
    setPref('turno', formPerda.turno);
    setFormPerda(prev => ({ ...prev, produtoId: '', compraId: '', item: '', quantidade: '', motivoOutro: '' }));
    toast('Perda registrada.', 'sucesso');
  };

  const [buscaHist, setBuscaHist] = useState('');
  const historicoOrdenado = useMemo(() => [
    ...aparas.map(a => ({ ...a, _tipo: 'apara' })),
    ...desperdicio.map(d => ({ ...d, _tipo: 'perda' })),
  ].sort((a, b) => (b.ts || 0) - (a.ts || 0)), [aparas, desperdicio]);
  const historico = useMemo(() =>
    buscaHist ? historicoOrdenado.filter(r => `${r.item} ${r.responsavel || ''}`.toLowerCase().includes(buscaHist.toLowerCase())) : historicoOrdenado,
    [historicoOrdenado, buscaHist]);

  const removerRegistro = async (r) => {
    const ok = await confirm({
      titulo: r._tipo === 'apara' ? 'Remover apara' : 'Remover perda',
      mensagem: 'Remover este registro?',
      perigo: true,
      confirmar: 'Remover',
    });
    if (!ok) return;
    const { _tipo, ...original } = r;
    if (_tipo === 'apara') removeApara(r.id); else removeDesperdicio(r.id);
    toast('Registro removido.', 'sucesso', {
      acao: { label: 'Desfazer', onClick: () => restaurarRegistro(_tipo === 'apara' ? 'apara' : 'perda', original) },
    });
  };

  return (
    <Layout title="Aparas & Perdas">
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[['novo', '+ Novo registro'], ['historico', '📋 Histórico']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-colors
              ${tab === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'novo' ? (
        <div className="space-y-4">
          {/* Tipo: Apara ou Perda */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setTipo('apara')}
              className={`py-3 px-3 rounded-xl text-sm font-bold border-2 transition-colors
                ${tipo === 'apara' ? 'border-amber-400 bg-amber-500 text-white' : 'border-gray-200 bg-white text-gray-500'}`}>
              ✂️ Apara
              <span className="block text-[11px] font-normal opacity-90">reaproveita no freezer</span>
            </button>
            <button onClick={() => setTipo('perda')}
              className={`py-3 px-3 rounded-xl text-sm font-bold border-2 transition-colors
                ${tipo === 'perda' ? 'border-red-400 bg-red-600 text-white' : 'border-gray-200 bg-white text-gray-500'}`}>
              🗑️ Perda
              <span className="block text-[11px] font-normal opacity-90">vai para o lixo</span>
            </button>
          </div>

          {tipo === 'apara' ? (
            <>
              <button onClick={salvarApara}
                disabled={!formApara.item.trim() || !formApara.quantidade || (formApara.destino === 'OUT' && !formApara.destinoOutro.trim())}
                className="w-full bg-amber-500 text-white font-bold py-4 rounded-xl text-base active:scale-95 transition-transform disabled:opacity-40 disabled:scale-100">
                ✓ Registrar Apara
              </button>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <strong>Apara</strong> é a sobra aproveitável da limpeza/porcionamento (ex: apara de filé → strogonoff, hambúrguer). Vai para o freezer e <strong>não mexe no estoque</strong> — serve para medir o rendimento da matéria-prima.
              </div>

              <div className="bg-white rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
                    <input type="date" value={formApara.data} max={hoje()} onChange={e => setA('data', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Turno</label>
                    <select value={formApara.turno} onChange={e => setA('turno', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                      {TURNOS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Associar à compra (opcional)</label>
                  <select value={formApara.compraId} onChange={e => setA('compraId', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">— Não associar —</option>
                    {comprasRecentes.map(c => (
                      <option key={c.id} value={c.id}>{fmtData(c.data)} • {c.item} ({c.quantidade}{c.unidade})</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Liga a apara ao recebimento para calcular o rendimento da compra.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Produto (para FC automático)</label>
                  <select value={formApara.produtoId} onChange={e => setA('produtoId', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">— Não vincular —</option>
                    {[...produtos].sort((a, b) => a.nome.localeCompare(b.nome)).map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Ao vincular, o rendimento médio deste produto é atualizado automaticamente na lista de compras.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Descrição da apara</label>
                  <input type="text" value={formApara.item} onChange={e => setA('item', e.target.value)}
                    placeholder="Ex: Apara de filé, Ponta de picanha..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Quantidade</label>
                    <input type="number" min="0" step="0.1" value={formApara.quantidade} onChange={e => setA('quantidade', e.target.value)}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Unidade</label>
                    <select value={formApara.unidade} onChange={e => setA('unidade', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="kg">kg</option>
                      <option value="unid">unid</option>
                      <option value="g">g</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Destino previsto</label>
                  <div className="grid grid-cols-2 gap-2">
                    {destinos.map(d => (
                      <button key={d.cod} onClick={() => setA('destino', d.cod)}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold text-left border-2 transition-colors
                          ${formApara.destino === d.cod
                            ? 'border-polo-gold bg-polo-navy text-polo-gold'
                            : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                        <span className="font-bold">{d.cod}</span> — {d.label}
                      </button>
                    ))}
                  </div>
                  {formApara.destino === 'OUT' && (
                    <input type="text" value={formApara.destinoOutro} onChange={e => setA('destinoOutro', e.target.value)}
                      placeholder="Escreva o destino previsto..."
                      className="w-full border border-polo-gold/60 bg-polo-beige/50 rounded-lg px-3 py-2 text-sm mt-2" />
                  )}
                </div>

                <ResponsavelSelect value={formApara.responsavel} onChange={v => setA('responsavel', v)} />
              </div>
            </>
          ) : (
            <>
              <button onClick={salvarPerda}
                disabled={!formPerda.item.trim() || !formPerda.quantidade || (formPerda.origem === 'estoque' && !formPerda.produtoId) || (formPerda.motivo === 'O' && !formPerda.motivoOutro.trim())}
                className="w-full bg-red-600 text-white font-bold py-4 rounded-xl text-base active:scale-95 transition-transform disabled:opacity-40 disabled:scale-100">
                ✓ Registrar Perda
              </button>

              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800">
                <strong>Perda</strong> vai direto para o <strong>lixo</strong> (POP-07). No <strong>recebimento</strong> (matéria-prima chegou ruim) não mexe no estoque; de item já <strong>no estoque</strong> (estragou no freezer) abate automaticamente.
              </div>

              <div className="bg-white rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
                    <input type="date" value={formPerda.data} max={hoje()} onChange={e => setP('data', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Turno</label>
                    <select value={formPerda.turno} onChange={e => setP('turno', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                      {TURNOS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <OrigemCorrecao form={formPerda} onChange={patchPerda} />

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Descrição do item</label>
                  <input type="text" value={formPerda.item} onChange={e => setP('item', e.target.value)}
                    placeholder="Ex: Filé mignon, Arroz, Molho..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Quantidade</label>
                    <input type="number" min="0" step="0.1" value={formPerda.quantidade} onChange={e => setP('quantidade', e.target.value)}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Unidade</label>
                    <select value={formPerda.unidade} onChange={e => setP('unidade', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="kg">kg</option>
                      <option value="unid">unid</option>
                      <option value="g">g</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Motivo do descarte</label>
                  <div className="grid grid-cols-2 gap-2">
                    {MOTIVOS_DESPERDICIO.map(m => (
                      <button key={m.cod} onClick={() => setP('motivo', m.cod)}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold text-left border-2 transition-colors
                          ${formPerda.motivo === m.cod
                            ? 'border-polo-gold bg-polo-navy text-polo-gold'
                            : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                        <span className="font-bold">{m.cod}</span> — {m.label}
                      </button>
                    ))}
                  </div>
                  {formPerda.motivo === 'O' && (
                    <input type="text" value={formPerda.motivoOutro} onChange={e => setP('motivoOutro', e.target.value)}
                      placeholder="Escreva o motivo do descarte..."
                      className="w-full border border-red-300 bg-red-50/50 rounded-lg px-3 py-2 text-sm mt-2" />
                  )}
                </div>

                <ResponsavelSelect value={formPerda.responsavel} onChange={v => setP('responsavel', v)} />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <input type="text" value={buscaHist} onChange={e => setBuscaHist(e.target.value)}
            placeholder="🔍 Buscar por item ou responsável..."
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
          {historico.length === 0 && (
            <div className="text-center text-gray-500 py-12">Nenhum registro ainda.</div>
          )}
          {historico.map(r => {
            const ehApara = r._tipo === 'apara';
            const dest = ehApara
              ? (r.destino === 'OUT' && r.destinoOutro
                  ? { label: r.destinoOutro }
                  : destinos.find(d => d.cod === r.destino) || DESTINOS_APARA.find(d => d.cod === r.destino))
              : null;
            const motivo = !ehApara
              ? (r.motivo === 'O' && r.motivoOutro
                  ? { label: r.motivoOutro }
                  : MOTIVOS_DESPERDICIO.find(m => m.cod === r.motivo))
              : null;
            const corMotivo = !ehApara ? (COR_MOTIVO[r.motivo] || 'bg-gray-100 text-gray-700') : '';
            return (
              <div key={`${r._tipo}-${r.id}`} className="bg-white rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
                        ${ehApara ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                        {ehApara ? '✂️ APARA' : '🗑️ PERDA'}
                      </span>
                      <span className="font-semibold text-sm">{r.item}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {fmtData(r.data)} • {r.turno} {r.responsavel && `• ${r.responsavel}`}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`font-bold text-sm ${ehApara ? 'text-amber-700' : 'text-red-600'}`}>
                        {r.quantidade} {r.unidade}
                      </span>
                      {ehApara && (
                        <span className="text-xs text-gray-500">→ {dest?.label || r.destino}</span>
                      )}
                      {!ehApara && (
                        <>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${corMotivo}`}>
                            {r.motivo} — {motivo?.label}
                          </span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded
                            ${r.origem === 'estoque' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                            {r.origem === 'estoque' ? 'Abateu estoque' : 'Recebimento'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button onClick={() => removerRegistro(r)}
                    aria-label={`Remover ${ehApara ? 'apara' : 'perda'} ${r.item}`}
                    className="text-red-500 text-xs font-semibold min-w-11 min-h-11 flex items-center justify-center rounded hover:bg-red-50 ml-2">
                    Remover
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
