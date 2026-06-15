import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth, CARGOS } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import NovaSenha from './NovaSenha';
import { calcSugestoesMinMax } from '../utils/sugestoes';
import { fmtNum } from '../utils/formatters';
import { POLO_PRESET } from '../data/presetPolo';
import { fatorCorrecaoProduto } from '../utils/analise';
import { usePwaInstall } from '../lib/pwaInstall';

// Campos numéricos ficam como texto enquanto edita (apagar/limpar funciona);
// a conversão para número acontece só no salvar.
const numVazio = (v) => (v === 0 || v == null ? '' : String(v));

// Fecha o modal com a tecla Escape (acessibilidade — WCAG 2.1.2)
function useEscClose(onFechar) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onFechar]);
}

// Cartão para instalar o app na tela inicial (Configurações → Sistema)
function CartaoInstalarApp() {
  const { podeInstalar, instalado, ios, instalar } = usePwaInstall();
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-polo-navy">📲 Instalar app no tablet</p>
          {instalado ? (
            <p className="text-xs text-green-700 mt-0.5">✅ App já instalado neste aparelho.</p>
          ) : ios ? (
            <p className="text-xs text-gray-500 mt-0.5">
              No iPad: toque em <strong>⎙ Compartilhar</strong> no Safari e em <strong>"Adicionar à Tela de Início"</strong>.
            </p>
          ) : podeInstalar ? (
            <p className="text-xs text-gray-500 mt-0.5">Coloca o ícone da Aurum na tela inicial, abrindo em tela cheia.</p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">
              Se o botão não aparecer: abra o menu <strong>⋮</strong> do navegador e toque em <strong>"Instalar aplicativo"</strong>.
              Caso não apareça, feche o navegador por completo e abra o app de novo.
            </p>
          )}
        </div>
        {!instalado && !ios && podeInstalar && (
          <button onClick={instalar}
            className="bg-polo-navy text-polo-gold font-bold px-4 py-2 rounded-lg text-sm whitespace-nowrap">Instalar</button>
        )}
      </div>
    </div>
  );
}

// Resolve o produto (matéria-prima) de uma ficha: vínculo explícito (produtoId)
// e, na falta dele, casamento por nome — tolerante a substrings.
function resolverProduto(ficha, produtos) {
  if (ficha.produtoId) return produtos.find(p => p.id === ficha.produtoId) || null;
  const mp = (ficha.materiaPrima || '').toLowerCase().trim();
  if (!mp) return null;
  return produtos.find(p => {
    const n = (p.nome || '').toLowerCase().trim();
    if (!n) return false;
    if (n === mp) return true;
    const menor = n.length <= mp.length ? n : mp;
    if (menor.length < 4) return false;
    return n.includes(mp) || mp.includes(n);
  }) || null;
}

// Tabela de Rendimento por ingrediente: agrupa as preparações por produto,
// mostra o FC (automático por aparas+perdas ou manual) e permite mover uma
// preparação para o ingrediente certo quando o vínculo automático erra.
function TabelaRendimento({ produtos, fichas, setFichas, setProdutos, compras, aparas, desperdicio, toast }) {
  const [fcEdit, setFcEdit] = useState(null); // { id, pct }

  const { grupos, naoVinc } = useMemo(() => {
    const m = new Map();
    const semVinculo = [];
    fichas.forEach(f => {
      const prod = resolverProduto(f, produtos);
      if (!prod) { semVinculo.push(f); return; }
      if (!m.has(prod.id)) m.set(prod.id, { produto: prod, fichas: [] });
      m.get(prod.id).fichas.push(f);
    });
    const arr = [...m.values()].sort((a, b) => a.produto.nome.localeCompare(b.produto.nome));
    return { grupos: arr, naoVinc: semVinculo };
  }, [fichas, produtos]);

  const moverFicha = (ficha, novoId) => {
    setFichas(fichas.map(x => x.id === ficha.id ? { ...x, produtoId: novoId || undefined } : x));
    const destino = produtos.find(p => p.id === novoId);
    toast(destino ? `Preparação movida para ${destino.nome}.` : 'Vínculo removido.', 'sucesso');
  };

  const salvarFcManual = (produto, pct) => {
    const fcMedio = Math.min(parseFloat(pct) || 0, 90) / 100;
    setProdutos(produtos.map(p => p.id === produto.id ? { ...p, fcManual: true, fcMedio } : p));
    setFcEdit(null);
    toast(`FC de ${produto.nome} fixado em ${Math.round(fcMedio * 100)}%.`, 'sucesso');
  };

  const voltarAutomatico = (produto) => {
    setProdutos(produtos.map(p => p.id === produto.id ? { ...p, fcManual: false } : p));
    setFcEdit(null);
    toast(`FC de ${produto.nome} voltou ao automático.`, 'sucesso');
  };

  const opcoesProduto = [...produtos].sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <p className="text-sm font-bold text-polo-navy">🎯 Rendimento por ingrediente</p>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        Cada ingrediente reúne as preparações que o usam. O <strong>fator de correção</strong> (apara/perda na limpeza) é
        calculado sozinho pelas aparas e perdas ligadas às compras — um único FC vale para todas as preparações.
        Se o vínculo automático errar, use <strong>"mover"</strong> para corrigir, ou ajuste o FC à mão.
      </p>

      {grupos.length === 0 && naoVinc.length === 0 && (
        <p className="text-xs text-gray-500 py-4 text-center">Nenhuma preparação cadastrada ainda.</p>
      )}

      <div className="space-y-3">
        {grupos.map(({ produto, fichas: fs }) => {
          const fcAuto = fatorCorrecaoProduto(produto, compras, aparas, desperdicio);
          const editando = fcEdit?.id === produto.id;
          return (
            <div key={produto.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-polo-navy">{produto.nome}</p>
                  <p className="text-[11px] mt-0.5">
                    {produto.fcManual ? (
                      <span className="text-polo-navy">FC manual: <strong>{Math.round((produto.fcMedio || 0) * 100)}%</strong></span>
                    ) : fcAuto != null ? (
                      <span className="text-gray-600">FC automático: <strong className="text-polo-navy">{Math.round(fcAuto * 100)}%</strong> (aparas + perdas)</span>
                    ) : (
                      <span className="text-gray-400">Sem FC ainda — registre aparas/perdas ligadas às compras deste item</span>
                    )}
                  </p>
                </div>
                {!editando && (
                  <button onClick={() => setFcEdit({ id: produto.id, pct: produto.fcManual ? String(Math.round((produto.fcMedio || 0) * 100)) : '' })}
                    className="text-[11px] font-semibold text-polo-navy bg-gray-100 px-2 py-1 rounded flex-shrink-0">✏️ FC</button>
                )}
              </div>

              {editando && (
                <div className="mt-2 bg-polo-beige/60 rounded-lg p-2.5 space-y-2">
                  <label className="block text-[11px] font-semibold text-gray-600">Apara/perda na limpeza (%) — valor fixo</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" max="90" step="1" value={fcEdit.pct} autoFocus
                      onChange={e => setFcEdit({ id: produto.id, pct: e.target.value })}
                      placeholder="Ex: 12"
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    <button onClick={() => salvarFcManual(produto, fcEdit.pct)}
                      className="text-xs font-bold text-polo-gold bg-polo-navy px-3 py-1.5 rounded-lg">Fixar</button>
                    {produto.fcManual && (
                      <button onClick={() => voltarAutomatico(produto)}
                        className="text-xs font-semibold text-gray-600 underline">voltar ao automático</button>
                    )}
                    <button onClick={() => setFcEdit(null)} className="text-xs text-gray-400 ml-auto">cancelar</button>
                  </div>
                </div>
              )}

              <div className="mt-2 space-y-1">
                {fs.map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-xs text-gray-700 min-w-0 truncate">{f.preparacao}</span>
                    <select value={produto.id} onChange={e => moverFicha(f, e.target.value)}
                      aria-label={`Mover preparação ${f.preparacao} para outro ingrediente`}
                      className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white max-w-[45%]">
                      {opcoesProduto.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {naoVinc.length > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
            <p className="text-xs font-bold text-amber-800 mb-2">❓ Preparações sem ingrediente vinculado</p>
            <div className="space-y-1">
              {naoVinc.map(f => (
                <div key={f.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-2.5 py-1.5">
                  <span className="text-xs text-gray-700 min-w-0 truncate">{f.preparacao} <span className="text-gray-400">({f.materiaPrima})</span></span>
                  <select value="" onChange={e => moverFicha(f, e.target.value)}
                    aria-label={`Vincular preparação ${f.preparacao} a um ingrediente`}
                    className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white max-w-[45%]">
                    <option value="">— escolher —</option>
                    {opcoesProduto.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModalProduto({ produto, sugestao, categorias, producoes = [], diasMin = 3, diasMax = 6, onSalvar, onFechar }) {
  const [form, setForm] = useState(() => produto
    ? {
        ...produto,
        estoqueInicial: numVazio(produto.estoqueInicial),
        min: numVazio(produto.min),
        max: numVazio(produto.max),
        valCongelado: numVazio(produto.valCongelado),
        valResfriado: numVazio(produto.valResfriado),
        pesoUnidade: numVazio(produto.pesoUnidade),
        gramatura: numVazio(produto.gramatura),
        coccao: numVazio(produto.coccao),
        entradaCozida: produto.entradaCozida || false,
      }
    : {
        nome: '', categoria: categorias[0], unidade: 'kg',
        estoqueInicial: '', min: '', max: '', valCongelado: '', valResfriado: '', pesoUnidade: '',
        gramatura: '', coccao: '', entradaCozida: false, ativo: true,
      });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  useEscClose(onFechar);

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] overflow-y-auto overscroll-contain p-4 flex"
      role="dialog" aria-modal="true" aria-labelledby="modal-produto-titulo">
      <div className="bg-white w-full max-w-lg m-auto rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 id="modal-produto-titulo" className="font-bold text-lg text-polo-navy">{produto ? 'Editar Produto' : 'Novo Produto'}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="text-2xl text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">×</button>
        </div>

        <div>
          <label htmlFor="mp-nome" className="block text-xs font-semibold text-gray-600 mb-1">Nome do produto</label>
          <input id="mp-nome" type="text" value={form.nome} onChange={e => set('nome', e.target.value)} autoFocus
            placeholder="Ex: Filé de tilápia"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div>
          <label htmlFor="mp-categoria" className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
          <select id="mp-categoria" value={form.categoria} onChange={e => set('categoria', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Unidade de medida</label>
          <div className="flex gap-2">
            {['kg', 'unid', 'g', 'L'].map(u => (
              <button key={u} onClick={() => set('unidade', u)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors
                  ${form.unidade === u ? 'border-polo-gold bg-polo-navy text-polo-gold' : 'border-gray-200 text-gray-600'}`}>
                {u}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="mp-estoque-inicial" className="block text-xs font-semibold text-gray-600 mb-1">
            Estoque Inicial (ponto de partida)
          </label>
          <input id="mp-estoque-inicial" type="number" min="0" step="0.5" value={form.estoqueInicial} onChange={e => set('estoqueInicial', e.target.value)}
            placeholder="0"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-gray-500 mt-1">Quanto há hoje. A partir daqui, entradas/saídas/perdas calculam sozinhas.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mp-min" className="block text-xs font-semibold text-gray-600 mb-1">
              Estoque Mínimo — alertar quando abaixo
            </label>
            <input id="mp-min" type="number" min="0" step="0.5" value={form.min} onChange={e => set('min', e.target.value)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="mp-max" className="block text-xs font-semibold text-gray-600 mb-1">
              Estoque Máximo — meta de reposição
            </label>
            <input id="mp-max" type="number" min="0" step="0.5" value={form.max} onChange={e => set('max', e.target.value)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-2">Mín/Máx: 0 = sem meta definida (não exibe alerta)</p>

        {sugestao && (
          <div className="flex items-center justify-between bg-polo-beige border border-polo-gold/50 rounded-xl px-3 py-2 -mt-1">
            <p className="text-xs text-polo-navy">
              💡 Pelo consumo dos últimos {sugestao.dias} dias:{' '}
              <strong>mín {sugestao.min} / máx {sugestao.max}</strong>
            </p>
            <button onClick={() => setForm(prev => ({ ...prev, min: String(sugestao.min), max: String(sugestao.max) }))}
              className="text-xs font-bold text-polo-navy border border-polo-navy/30 px-2.5 py-1 rounded-lg flex-shrink-0 ml-2">
              Aplicar
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mp-val-congelado" className="block text-xs font-semibold text-gray-600 mb-1">
              ❄️ Validade congelado (dias)
            </label>
            <input id="mp-val-congelado" type="number" min="0" value={form.valCongelado}
              onChange={e => set('valCongelado', e.target.value)}
              placeholder="0 = sem controle"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="mp-val-resfriado" className="block text-xs font-semibold text-gray-600 mb-1">
              🧊 Validade resfriado (dias)
            </label>
            <input id="mp-val-resfriado" type="number" min="0" value={form.valResfriado}
              onChange={e => set('valResfriado', e.target.value)}
              placeholder="0 = sem controle"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-2">Ao registrar uma entrada, o vencimento é calculado sozinho com esses prazos. 0 = sem controle de validade.</p>

        {form.unidade === 'unid' && (
          <div>
            <label htmlFor="mp-peso-unidade" className="block text-xs font-semibold text-gray-600 mb-1">
              ⚖️ Peso por unidade (g)
            </label>
            <input id="mp-peso-unidade" type="number" min="0" value={form.pesoUnidade}
              onChange={e => set('pesoUnidade', e.target.value)}
              placeholder="Ex: 130 (1 parmegiana = 130 g)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-500 mt-1">Usado para converter a lista de compras em kg (ex.: 120 unid ≈ 15,6 kg).</p>
          </div>
        )}

        {/* Cocção — afeta só a lista de compras de itens que entram JÁ cozidos */}
        <div className="border border-gray-100 rounded-xl p-3 space-y-3">
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">🔥 Cocção (lista de compras)</p>
          <div className="flex items-center gap-3 bg-orange-50 rounded-lg p-2.5">
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-700">Entra no estoque já cozido?</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Ex: cupim cozido, carne de sol desfiada — já entram prontos. Filé de frango entra cru (deixe desligado).</p>
            </div>
            <button type="button" onClick={() => set('entradaCozida', !form.entradaCozida)}
              className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.entradaCozida ? 'bg-orange-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.entradaCozida ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
          {form.entradaCozida && (
            <div>
              <label htmlFor="mp-coccao" className="block text-xs font-semibold text-gray-600 mb-1">Perda na cocção (%)</label>
              <input id="mp-coccao" type="number" min="0" max="90" step="1" value={form.coccao} onChange={e => set('coccao', e.target.value)}
                placeholder="Ex: 30"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              {form.coccao && (
                <p className="text-[10px] text-orange-700 bg-orange-50 rounded-lg px-2 py-1.5 mt-1">
                  ✔ Na lista de compras você compra mais cru ({form.coccao}% a mais) para chegar ao kg cozido necessário.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-[10px] text-gray-400 -mt-1">
          🎯 O fator de correção (rendimento) deste item é configurado em <strong>Sistema → Rendimento por ingrediente</strong>.
        </p>

        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <span className="text-sm text-gray-700 flex-1">Produto ativo</span>
          <button onClick={() => set('ativo', !form.ativo)}
            className={`w-12 h-6 rounded-full transition-colors relative ${form.ativo ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.ativo ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onFechar}
            className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">
            Cancelar
          </button>
          <button onClick={() => onSalvar({
              ...form,
              estoqueInicial: parseFloat(form.estoqueInicial) || 0,
              min: parseFloat(form.min) || 0,
              max: parseFloat(form.max) || 0,
              valCongelado: parseInt(form.valCongelado) || 0,
              valResfriado: parseInt(form.valResfriado) || 0,
              pesoUnidade: parseFloat(form.pesoUnidade) || 0,
              gramatura: parseFloat(form.gramatura) || 0,
              coccao: Math.min(parseFloat(form.coccao) || 0, 90),
              entradaCozida: form.entradaCozida || false,
            })} disabled={!form.nome.trim()}
            className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl disabled:opacity-40">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalFicha({ ficha, fichas, categorias, onSalvar, onFechar }) {
  const [form, setForm] = useState(ficha || { materiaPrima: '', categoria: categorias[0] || '', preparacao: '', gramatura: '', coccao: '' });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  useEscClose(onFechar);

  // matérias-primas já existentes (sem repetição) para sugerir e evitar grupos duplicados
  const materiasPrimas = [...new Map(fichas.map(f => [f.materiaPrima.toLowerCase(), f.materiaPrima])).values()].sort();

  // ao escolher uma matéria-prima conhecida, herda a grafia exata e a categoria dela
  const onMateriaPrima = (valor) => {
    const existente = fichas.find(f => f.materiaPrima.toLowerCase() === valor.trim().toLowerCase());
    setForm(prev => ({
      ...prev,
      materiaPrima: existente ? existente.materiaPrima : valor,
      categoria: existente?.categoria || prev.categoria,
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] overflow-y-auto overscroll-contain p-4 flex"
      role="dialog" aria-modal="true" aria-labelledby="modal-ficha-titulo">
      <div className="bg-white w-full max-w-lg m-auto rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 id="modal-ficha-titulo" className="font-bold text-lg text-polo-navy">{ficha ? 'Editar Gramatura' : 'Nova Gramatura'}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="text-2xl text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">×</button>
        </div>
        <div>
          <label htmlFor="mf-materia-prima" className="block text-xs font-semibold text-gray-600 mb-1">Matéria-prima</label>
          <input id="mf-materia-prima" type="text" list="lista-materias-primas" value={form.materiaPrima} onChange={e => onMateriaPrima(e.target.value)}
            placeholder="Escolha da lista ou digite uma nova"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <datalist id="lista-materias-primas">
            {materiasPrimas.map(mp => <option key={mp} value={mp} />)}
          </datalist>
          <p className="text-xs text-gray-500 mt-1">Escolher uma existente agrupa a preparação nela (evita "Filé" e "Filé Mignon" separados).</p>
        </div>
        <div>
          <label htmlFor="mf-categoria" className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
          <select id="mf-categoria" value={form.categoria || ''} onChange={e => set('categoria', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="mf-preparacao" className="block text-xs font-semibold text-gray-600 mb-1">Preparação</label>
          <input id="mf-preparacao" type="text" value={form.preparacao} onChange={e => set('preparacao', e.target.value)}
            placeholder="Ex: Parmegiana"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="mf-gramatura" className="block text-xs font-semibold text-gray-600 mb-1">Gramatura (g por porção/lote)</label>
          <input id="mf-gramatura" type="number" min="0" value={form.gramatura} onChange={e => set('gramatura', e.target.value)}
            placeholder="Ex: 130"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="mf-coccao" className="block text-xs font-semibold text-gray-600 mb-1">Fator de cocção — perda no cozimento (%)</label>
          <input id="mf-coccao" type="number" min="0" max="90" step="0.5" value={form.coccao ?? ''} onChange={e => set('coccao', e.target.value)}
            placeholder="Vazio se não cozinha antes de porcionar"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-gray-500 mt-1">Quanto o item perde de peso ao cozinhar (pese antes e depois na cozinha).</p>
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

function ModalProducao({ receita, produtos, onSalvar, onFechar }) {
  const ativos = produtos.filter(p => p.ativo);
  const [form, setForm] = useState(receita || {
    nome: '', produtoFinalId: ativos[0]?.id || '', rendimentoBase: '', armazenamento: 'congelado',
    ingredientes: [{ abate: false, produtoId: '', quantidade: '', nome: '', unidade: 'kg' }],
  });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  useEscClose(onFechar);
  const setIng = (i, k, v) => setForm(prev => {
    const ing = [...prev.ingredientes];
    ing[i] = { ...ing[i], [k]: v };
    return { ...prev, ingredientes: ing };
  });
  const addIng = () => setForm(prev => ({ ...prev, ingredientes: [...prev.ingredientes, { abate: false, produtoId: '', quantidade: '', nome: '', unidade: 'kg' }] }));
  const removeIng = (i) => setForm(prev => ({ ...prev, ingredientes: prev.ingredientes.filter((_, x) => x !== i) }));
  const unid = (id) => produtos.find(p => p.id === id)?.unidade || '';

  const ingValido = (i) => parseFloat(i.quantidade) > 0 && (i.abate ? !!i.produtoId : !!(i.nome || '').trim());
  const valido = form.nome.trim() && form.produtoFinalId && parseFloat(form.rendimentoBase) > 0
    && form.ingredientes.some(ingValido);

  const salvar = () => onSalvar({
    ...form,
    rendimentoBase: parseFloat(form.rendimentoBase) || 0,
    ingredientes: form.ingredientes.filter(ingValido).map(i => i.abate
      ? { abate: true, produtoId: i.produtoId, quantidade: parseFloat(i.quantidade) }
      : { abate: false, nome: (i.nome || '').trim(), unidade: (i.unidade || 'kg').trim(), quantidade: parseFloat(i.quantidade) }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] overflow-y-auto overscroll-contain p-4 flex"
      role="dialog" aria-modal="true" aria-labelledby="modal-producao-titulo">
      <div className="bg-white w-full max-w-lg m-auto rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 id="modal-producao-titulo" className="font-bold text-lg text-polo-navy">{receita ? 'Editar Receita' : 'Nova Receita de Produção'}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="text-2xl text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">×</button>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nome da receita</label>
          <input type="text" value={form.nome} onChange={e => set('nome', e.target.value)}
            placeholder="Ex: Molho da casa" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Produto que será produzido</label>
          <select value={form.produtoFinalId} onChange={e => set('produtoFinalId', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Selecione…</option>
            {ativos.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">É o item que entra no estoque. Crie-o em 📦 Produtos se ainda não existe.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Rende quanto? ({unid(form.produtoFinalId)})</label>
            <input type="number" min="0" step="0.5" value={form.rendimentoBase} onChange={e => set('rendimentoBase', e.target.value)}
              placeholder="Ex: 10" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Armazenamento</label>
            <select value={form.armazenamento} onChange={e => set('armazenamento', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="ambos">🔄 Ambos (decide na hora)</option>
              <option value="congelado">❄️ Congelado</option>
              <option value="resfriado">🧊 Resfriado</option>
            </select>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600">Ingredientes (para o rendimento acima)</label>
            <button onClick={addIng} className="text-xs font-bold text-polo-navy bg-gray-100 px-2 py-1 rounded">+ Ingrediente</button>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            Por padrão, ingredientes são <strong>monitorados</strong> (só registra uso, sem baixa no estoque). Marque ☑️ se o item é controlado no estoque.
          </p>
          <div className="space-y-2">
            {form.ingredientes.map((ing, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    {ing.abate ? (
                      <select value={ing.produtoId || ''} onChange={e => setIng(i, 'produtoId', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
                        <option value="">Escolha o produto controlado…</option>
                        {ativos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={ing.nome || ''} onChange={e => setIng(i, 'nome', e.target.value)}
                        placeholder="Nome do ingrediente (ex: Tempero, Cebola)" className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                    )}
                  </div>
                  <input type="number" min="0" step="0.1" value={ing.quantidade} onChange={e => setIng(i, 'quantidade', e.target.value)}
                    placeholder="Qtd" className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                  <select value={ing.unidade || 'kg'} onChange={e => setIng(i, 'unidade', e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white">
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="un">un</option>
                    <option value="L">L</option>
                  </select>
                  <button onClick={() => removeIng(i)} aria-label="Remover ingrediente"
                    className="text-red-400 font-bold text-lg w-6 flex-shrink-0 flex items-center justify-center">×</button>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id={`abate-${i}`} checked={ing.abate || false} onChange={e => setIng(i, 'abate', e.target.checked)}
                    className="w-4 h-4 cursor-pointer" />
                  <label htmlFor={`abate-${i}`} className="text-xs text-gray-600 cursor-pointer">
                    ☑️ Este item tem estoque controlado (dá baixa)
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onFechar} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">Cancelar</button>
          <button onClick={salvar} disabled={!valido}
            className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl disabled:opacity-40">Salvar</button>
        </div>
      </div>
    </div>
  );
}

export default function Configuracoes() {
  const { produtos, setProdutos, saidas, limparTudo, resetarProdutos, exportarBackup, importarBackup,
          pessoas, addPessoa, removePessoa, destinos, setDestinos, categorias, setCategorias,
          fichas, setFichas, producoes, setProducoes, locais, setLocais, logAudit, prefs, setPref,
          compras, aparas, desperdicio } = useApp();
  const { usuarios, sessao, criarConvite, alterarCargo } = useAuth();
  const { toast, confirm } = useUI();
  const sugestoes = calcSugestoesMinMax(produtos, saidas, undefined, prefs.diasMin || 3, prefs.diasMax || 6, prefs.minMaxPorDiaSemana);

  // O que falta preencher em cada produto (marcação pedida pelo cliente)
  const pendenciasDoProduto = (p) => {
    const falta = [];
    if (!p.min && !p.max) falta.push('mín/máx');
    if (!p.valCongelado && !p.valResfriado) falta.push('validade');
    if (p.unidade === 'unid' && !p.pesoUnidade) falta.push('peso/unid');
    return falta;
  };
  const [novoDestino, setNovoDestino] = useState('');
  const [novoLocal, setNovoLocal] = useState('');

  const handleAddLocal = () => {
    const nome = novoLocal.trim();
    if (!nome) return;
    if (locais.some(l => l.nome.toLowerCase() === nome.toLowerCase())) { toast('Esse destino já existe.', 'aviso'); return; }
    const id = nome.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 16) || `loc${Date.now()}`;
    setLocais([...locais, { id: locais.some(l => l.id === id) ? id + Date.now() : id, nome }]);
    setNovoLocal('');
    logAudit('adicionou destino de saída', nome);
    toast('Destino adicionado.', 'sucesso');
  };
  // Inputs de dias de cobertura: string enquanto edita, converte só no onBlur
  const [diasMinStr, setDiasMinStr] = useState(String(prefs.diasMin || 3));
  const [diasMaxStr, setDiasMaxStr] = useState(String(prefs.diasMax || 6));
  // Sincroniza quando prefs muda por realtime (outro dispositivo alterou)
  useEffect(() => { setDiasMinStr(String(prefs.diasMin || 3)); }, [prefs.diasMin]);
  useEffect(() => { setDiasMaxStr(String(prefs.diasMax || 6)); }, [prefs.diasMax]);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [conviteCargo, setConviteCargo] = useState('cozinha');
  const [conviteGerado, setConviteGerado] = useState(null); // { token, cargo }
  const [editandoProducao, setEditandoProducao] = useState(null);
  const [criandoProducao, setCriandoProducao] = useState(false);

  const handleAddCategoria = () => {
    const nome = novaCategoria.trim().toUpperCase();
    if (!nome) return;
    if (categorias.some(c => c.toUpperCase() === nome)) {
      toast('Essa categoria já existe.', 'aviso');
      return;
    }
    setCategorias([...categorias, nome]);
    setNovaCategoria('');
    logAudit('adicionou categoria', nome);
    toast('Categoria criada.', 'sucesso');
  };

  const handleRemoveCategoria = async (cat) => {
    const emUso = produtos.filter(p => p.categoria === cat).length;
    if (emUso > 0) {
      toast(`${emUso} produto(s) usam "${cat}" — mova-os de categoria antes de remover.`, 'aviso');
      return;
    }
    const ok = await confirm({ titulo: 'Remover categoria', mensagem: `Remover "${cat}"?`, perigo: true, confirmar: 'Remover' });
    if (ok) {
      setCategorias(categorias.filter(c => c !== cat));
      logAudit('removeu categoria', cat);
      toast('Categoria removida.', 'sucesso');
    }
  };

  const handleAddDestino = () => {
    const label = novoDestino.trim();
    if (!label) return;
    let cod = label.normalize('NFD').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'DST';
    while (destinos.some(d => d.cod === cod)) cod = cod.slice(0, 2) + Math.floor(Math.random() * 10);
    // mantém OUT sempre por último
    const semOut = destinos.filter(d => d.cod !== 'OUT');
    const out = destinos.find(d => d.cod === 'OUT');
    setDestinos([...semOut, { cod, label }, ...(out ? [out] : [])]);
    setNovoDestino('');
    logAudit('adicionou destino de apara', label);
    toast('Destino adicionado.', 'sucesso');
  };

  const handleGerarConvite = async () => {
    const token = await criarConvite(conviteCargo);
    if (!token) { toast('Não foi possível gerar o convite.', 'erro'); return; }
    setConviteGerado({ token, cargo: conviteCargo });
    logAudit('gerou convite de acesso', CARGOS.find(c => c.id === conviteCargo)?.label || conviteCargo);
    toast('Convite gerado! Copie o código abaixo.', 'sucesso');
  };

  const copiarConvite = async () => {
    if (!conviteGerado) return;
    try { await navigator.clipboard.writeText(conviteGerado.token); toast('Código copiado!', 'sucesso'); }
    catch { toast('Copie o código manualmente.', 'aviso'); }
  };
  const [catAtiva, setCatAtiva] = useState('TODOS');
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [busca, setBusca] = useState('');
  const [novaPessoa, setNovaPessoa] = useState('');
  const [secao, setSecao] = useState('produtos'); // produtos | acessos | sistema
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const fileRef = useRef(null);
  const planilhaRef = useRef(null);

  const handleAddPessoa = () => {
    const n = novaPessoa.trim();
    if (!n) return;
    if (pessoas.some(p => p.toLowerCase() === n.toLowerCase())) {
      toast('Essa pessoa já está cadastrada.', 'aviso');
      return;
    }
    addPessoa(n);
    setNovaPessoa('');
    toast('Pessoa cadastrada.', 'sucesso');
  };

  const handleImportar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const dados = JSON.parse(ev.target.result);
        const ok = await confirm({
          titulo: 'Restaurar backup',
          mensagem: 'Isso vai adicionar e atualizar os dados com os do arquivo (registros que existem hoje e não estão no backup são mantidos). Continuar?',
          perigo: true,
          confirmar: 'Restaurar',
        });
        if (ok) {
          importarBackup(dados);
          toast('Backup restaurado com sucesso!', 'sucesso');
        }
      } catch (err) {
        toast(err?.message || 'Arquivo inválido. Selecione um backup válido.', 'erro');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Colunas da planilha modelo de produtos (ordem fixa no download; na importação
  // as colunas são localizadas por palavra-chave, então podem estar em qualquer ordem)
  const baixarPlanilhaModelo = async () => {
    const XLSX = await import('xlsx');

    const COLS = [
      'Nome *', 'Categoria *', 'Unidade * (kg/unid/g/L)',
      'Estoque inicial', 'Mínimo', 'Máximo',
      'Validade congelado (dias)', 'Validade resfriado (dias)',
      'Peso por unidade (g)',
      'Gramatura (g/porção)', 'Cocção (%)', 'Entrada cozida (sim/não)',
    ];
    const GRUPOS = [
      ['BÁSICO  * OBRIGATÓRIO', 0, 2],
      ['ESTOQUE', 3, 5],
      ['VALIDADES', 6, 7],
      ['PESO / FICHA TÉCNICA', 8, 11],
    ];

    const gruposRow = Array(COLS.length).fill('');
    GRUPOS.forEach(([nome, from]) => { gruposRow[from] = nome; });

    const titulo = [`MODELO DE PRODUTOS — Aurum Cozinha Pro | Colunas com * são obrigatórias. Preencha a aba "Produtos" a partir da linha 4 e importe em Configurações → Planilha de produtos.`];

    const linhas = (POLO_PRESET.produtos || []).map(p => [
      p.nome, p.categoria, p.unidade,
      p.estoqueInicial || 0, p.min || 0, p.max || 0,
      p.valCongelado || 0, p.valResfriado || 0, p.pesoUnidade || 0,
      p.gramatura || 0, p.coccao || 0, p.entradaCozida ? 'sim' : 'não',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([titulo, gruposRow, COLS, ...linhas]);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: COLS.length - 1 } },
      ...GRUPOS.map(([, from, to]) => ({ s: { r: 1, c: from }, e: { r: 1, c: to } })),
    ];
    ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 24 }, ...Array(11).fill({ wch: 22 })];

    // Aba Instruções
    const instrucoes = [
      ['Campo', 'Obrigatório?', 'Valores aceitos', 'Descrição'],
      ['Nome', 'Sim', 'Texto', 'Nome do produto. Se já existe, é atualizado (não duplicado).'],
      ['Categoria', 'Sim', 'Texto', 'Ex: CARNES, LATICÍNIOS. Novas categorias são criadas automaticamente.'],
      ['Unidade', 'Sim', 'kg / unid / g / L', 'Unidade de medida do estoque.'],
      ['Estoque inicial', 'Não', 'Número', 'Quantidade em estoque ao cadastrar. Use 0 se não souber.'],
      ['Mínimo', 'Não', 'Número', 'Quantidade mínima (abaixo disso entra na lista de compras).'],
      ['Máximo', 'Não', 'Número', 'Meta de compra (compra até este nível).'],
      ['Validade congelado (dias)', 'Não', 'Número', 'Vida útil congelado em dias. Deixe 0 se não congela.'],
      ['Validade resfriado (dias)', 'Não', 'Número', 'Vida útil resfriado em dias. Deixe 0 se não resfria.'],
      ['Peso por unidade (g)', 'Não', 'Número', 'Peso de cada unidade em gramas. Usado para calcular kg.'],
      ['Gramatura (g/porção)', 'Não', 'Número', 'Grama por porção usada nas fichas técnicas.'],
      ['Cocção (%)', 'Não', 'Número 0 a 90', 'Perda percentual no cozimento. 0 = sem perda.'],
      ['Entrada cozida (sim/não)', 'Não', 'sim / não', 'Marque "sim" se o produto entra já pronto/cozido.'],
    ];
    const wsInst = XLSX.utils.aoa_to_sheet(instrucoes);
    wsInst['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 22 }, { wch: 65 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instruções');
    XLSX.writeFile(wb, 'modelo_produtos.xlsx');
    toast('Planilha baixada — preencha a aba "Produtos" e importe.', 'sucesso');
  };

  const numBR = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;

  const importarPlanilha = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
        if (rows.length < 2) { toast('A planilha não tem linhas de produto.', 'erro'); return; }
        // Localiza a linha de cabeçalho (pode ter linhas de título/grupo antes)
        const headRowIdx = rows.findIndex(r =>
          r.some(c => /^nome\b/i.test(String(c || '').trim()))
        );
        if (headRowIdx < 0) { toast('Não encontrei a coluna "Nome" na planilha. Use o modelo.', 'erro'); return; }
        const head = rows[headRowIdx].map(h => String(h || '').toLowerCase().trim());
        const col = (fn) => head.findIndex(fn);
        const iNome = col(h => /^nome/.test(h) && !h.includes('embalagem'));
        const iCat = col(h => h.includes('categoria'));
        const iUnid = col(h => h.includes('unidade') && !h.includes('peso'));
        const iEst = col(h => h.includes('estoque'));
        const iMin = col(h => h.includes('mín') || h.includes('minimo'));
        const iMax = col(h => h.includes('máx') || h.includes('maximo'));
        const iCong = col(h => h.includes('congelado'));
        const iResf = col(h => h.includes('resfriado'));
        const iPeso = col(h => h.includes('peso'));
        const iGram = col(h => h.includes('gramatura'));
        const iCoc = col(h => h.includes('cocç') || h.includes('coccao') || h.includes('cocc'));
        const iCozido = col(h => h.includes('cozido') || h.includes('cozida'));
        if (iNome < 0) { toast('A planilha precisa de uma coluna "Nome".', 'erro'); return; }

        const unidsValidas = ['kg', 'unid', 'g', 'L'];
        const novos = []; const novasCats = new Set(categorias);
        rows.slice(headRowIdx + 1).forEach(r => {
          const nome = String(r[iNome] ?? '').trim();
          if (!nome) return;
          let unidade = iUnid >= 0 ? String(r[iUnid] ?? '').trim() : 'kg';
          unidade = unidsValidas.find(u => u.toLowerCase() === unidade.toLowerCase()) || 'kg';
          const categoria = (iCat >= 0 ? String(r[iCat] ?? '').trim() : '') || (categorias[0] || 'GERAL');
          novasCats.add(categoria.toUpperCase());
          const cozido = iCozido >= 0 ? /^s/i.test(String(r[iCozido] ?? '').trim()) : false;
          novos.push({
            nome, categoria: categoria.toUpperCase(), unidade,
            estoqueInicial: iEst >= 0 ? numBR(r[iEst]) : 0,
            min: iMin >= 0 ? numBR(r[iMin]) : 0,
            max: iMax >= 0 ? numBR(r[iMax]) : 0,
            valCongelado: iCong >= 0 ? numBR(r[iCong]) : 0,
            valResfriado: iResf >= 0 ? numBR(r[iResf]) : 0,
            pesoUnidade: iPeso >= 0 ? numBR(r[iPeso]) : 0,
            gramatura: iGram >= 0 ? numBR(r[iGram]) : 0,
            coccao: iCoc >= 0 ? Math.min(numBR(r[iCoc]), 90) : 0,
            entradaCozida: cozido, ativo: true,
          });
        });
        if (!novos.length) { toast('Nenhum produto válido na planilha.', 'erro'); return; }

        const ok = await confirm({
          titulo: 'Importar planilha',
          mensagem: `Encontrei ${novos.length} produto(s). Os que já existem (mesmo nome) serão atualizados; os novos serão criados. Continuar?`,
          confirmar: 'Importar',
        });
        if (!ok) return;

        // mescla por nome (case-insensitive), preservando id e estoque dos existentes
        const porNome = new Map(produtos.map(p => [p.nome.toLowerCase().trim(), p]));
        let criados = 0, atualizados = 0;
        novos.forEach(n => {
          const ex = porNome.get(n.nome.toLowerCase().trim());
          if (ex) { porNome.set(n.nome.toLowerCase().trim(), { ...ex, ...n, id: ex.id }); atualizados++; }
          else { porNome.set(n.nome.toLowerCase().trim(), { ...n, id: `custom_${Date.now()}_${criados}` }); criados++; }
        });
        setCategorias([...novasCats]);
        setProdutos([...porNome.values()]);
        logAudit('importou planilha de produtos', `${criados} novos, ${atualizados} atualizados`);
        toast(`Planilha importada: ${criados} novo(s), ${atualizados} atualizado(s).`, 'sucesso');
      } catch (err) {
        toast(err?.message || 'Não foi possível ler a planilha. Use o modelo.', 'erro');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const produtosFiltrados = produtos.filter(p => {
    const matchCat = catAtiva === 'TODOS' || p.categoria === catAtiva;
    const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase());
    return matchCat && matchBusca;
  });

  const handleSalvar = (form) => {
    if (editando) {
      setProdutos(produtos.map(p => p.id === editando.id ? { ...p, ...form } : p));
      toast('Produto atualizado.', 'sucesso');
    } else {
      const newId = `custom_${Date.now()}`;
      setProdutos([...produtos, { ...form, id: newId }]);
      toast('Produto adicionado.', 'sucesso');
    }
    setEditando(null);
    setCriando(false);
  };

  const toggleAtivo = (id) => {
    setProdutos(produtos.map(p => p.id === id ? { ...p, ativo: !p.ativo } : p));
  };

  const excluir = async (id) => {
    const ok = await confirm({
      titulo: 'Desativar produto',
      mensagem: 'Desativar este produto? Ele não aparecerá mais nas listas, mas o histórico é preservado. Use o botão ativo/inativo se quiser reativar depois.',
      perigo: true,
      confirmar: 'Desativar',
    });
    if (ok) {
      setProdutos(produtos.map(p => p.id === id ? { ...p, ativo: false } : p));
      toast('Produto desativado. Pode ser reativado a qualquer momento.', 'sucesso');
    }
  };

  return (
    <Layout
      title="Configurações"
      actions={
        secao === 'produtos' ? (
          <button onClick={() => setCriando(true)} aria-label="Adicionar produto"
            className="bg-polo-gold text-polo-navy text-xs font-bold px-3 py-1.5 rounded-lg">
            + Produto
          </button>
        ) : secao === 'receitas' ? (
          <button onClick={() => setCriandoProducao(true)} aria-label="Adicionar receita de produção"
            className="bg-polo-gold text-polo-navy text-xs font-bold px-3 py-1.5 rounded-lg">
            + Receita
          </button>
        ) : null
      }
    >
      {/* Seções — 4 abas */}
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[['produtos', '📦 Produtos'], ['receitas', '🍽️ Receitas'], ['acessos', '👤 Acessos'], ['sistema', '🛠️ Sistema']].map(([v, l]) => (
          <button key={v} onClick={() => setSecao(v)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors
              ${secao === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {secao === 'produtos' && <>
      {/* Busca */}
      <div className="mb-3">
        <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar produto..."
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
      </div>

      {/* Categorias */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-3">
        {['TODOS', ...categorias].map(c => (
          <button key={c} onClick={() => setCatAtiva(c)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0
              ${catAtiva === c ? 'bg-polo-navy text-polo-gold' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {c === 'TODOS' ? 'Todos' : c}
          </button>
        ))}
      </div>

      {/* Lista de produtos */}
      <div className="bg-white rounded-xl overflow-hidden mb-4">
        {produtosFiltrados.map((p, i, arr) => (
          <div key={p.id} className={`flex items-center px-4 py-3 gap-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''} ${!p.ativo ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-800 truncate">{p.nome}</div>
              <div className="text-xs text-gray-500">
                {p.categoria} • {p.unidade}
                {(p.estoqueInicial > 0) && ` • Inicial ${p.estoqueInicial}`}
                {(p.min > 0 || p.max > 0) && ` • Mín ${p.min} / Máx ${p.max}`}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {p.gramatura > 0 && (
                  <span className="text-[10px] font-semibold text-polo-navy bg-polo-beige px-1.5 py-0.5 rounded">
                    🍽️ {p.gramatura}g/porção{p.coccao > 0 ? ` · 🔥−${p.coccao}%` : ''}{p.entradaCozida ? ' · cozido' : ''}
                  </span>
                )}
                {pendenciasDoProduto(p).length > 0 && (
                  <span className="text-[10px] font-semibold text-amber-600">
                    ⚠️ falta: {pendenciasDoProduto(p).join(', ')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditando(p)}
                className="text-xs text-polo-navy font-semibold px-2 py-1.5 rounded-lg bg-gray-100">
                Editar
              </button>
              <button onClick={() => toggleAtivo(p.id)}
                className={`text-xs font-semibold px-2 py-1.5 rounded-lg ${p.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {p.ativo ? 'Ativo' : 'Inativo'}
              </button>
              <button onClick={() => excluir(p.id)} aria-label={`Desativar produto ${p.nome}`}
                className="text-base text-red-500 font-semibold min-w-11 min-h-11 flex items-center justify-center rounded-lg bg-red-50">
                ×
              </button>
            </div>
          </div>
        ))}
        {produtosFiltrados.length === 0 && (
          <div className="text-center text-gray-500 py-8 text-sm">Nenhum produto encontrado.</div>
        )}
      </div>

      {/* Gerenciar categorias */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">🏷️ Categorias</p>
          <p className="text-xs text-gray-500 mt-1">Organizam os produtos em todas as telas. Só é possível remover categorias sem produtos.</p>
        </div>
        <div className="flex gap-2">
          <input type="text" value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddCategoria(); }}
            placeholder="Nova categoria (ex: BEBIDAS)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleAddCategoria}
            className="bg-polo-navy text-polo-gold font-bold px-4 rounded-lg text-sm">+ Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categorias.map(c => {
            const n = produtos.filter(p => p.categoria === c).length;
            return (
              <span key={c} className="inline-flex items-center gap-1.5 bg-polo-beige rounded-full pl-3 pr-2 py-1 text-xs font-medium text-polo-navy">
                {c} <span className="text-gray-500">({n})</span>
                <button onClick={() => handleRemoveCategoria(c)} aria-label={`Remover categoria ${c}`}
                  className="text-red-400 font-bold text-sm leading-none">×</button>
              </span>
            );
          })}
        </div>
      </div>
      </>}

      {secao === 'receitas' && <>
        <div className="bg-polo-beige border border-polo-gold/40 rounded-xl p-3 text-xs text-polo-navy mb-3">
          Receitas de itens <strong>produzidos</strong> (molhos, caldos, refogados): vários ingredientes viram 1 produto com rendimento. A equipe executa em <strong>Registrar → Produção</strong>.
          <br />Gramatura por porção é configurada diretamente em cada <strong>📦 Produto</strong>.
        </div>
        <div className="space-y-3 mb-4">
          {producoes.length === 0 && (
            <div className="bg-white rounded-xl p-6 text-center text-sm text-gray-500">
              Nenhuma receita ainda. Crie a primeira com "+ Receita" acima.
            </div>
          )}
          {producoes.map(r => {
            const final = produtos.find(p => p.id === r.produtoFinalId);
            return (
              <div key={r.id} className="bg-white rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-polo-navy truncate">{r.nome}</div>
                    <div className="text-xs text-gray-500">
                      Rende {fmtNum(r.rendimentoBase)} {final?.unidade || ''} de {final?.nome || '—'} • {(r.ingredientes || []).length} ingrediente(s)
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => setEditandoProducao(r)} aria-label={`Editar receita ${r.nome}`}
                      className="text-xs text-polo-navy font-semibold px-2 py-1 rounded bg-gray-100">Editar</button>
                    <button onClick={async () => {
                        const ok = await confirm({ titulo: 'Excluir receita', mensagem: `Excluir "${r.nome}"?`, perigo: true, confirmar: 'Excluir' });
                        if (ok) { setProducoes(producoes.filter(x => x.id !== r.id)); logAudit('excluiu receita de produção', r.nome); toast('Receita excluída.', 'sucesso'); }
                      }} aria-label={`Excluir receita ${r.nome}`}
                      className="text-xs text-red-400 font-semibold px-2 py-1 rounded bg-red-50">×</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>}

      {secao === 'sistema' && <>
      {/* Instalar app no tablet */}
      <CartaoInstalarApp />

      {/* Rendimento / Fator de correção por ingrediente */}
      <TabelaRendimento produtos={produtos} fichas={fichas} setFichas={setFichas} setProdutos={setProdutos}
        compras={compras} aparas={aparas} desperdicio={desperdicio} toast={toast} />

      {/* Minha conta */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-polo-navy">🔒 Minha senha</p>
            <p className="text-xs text-gray-500 mt-0.5">Troque a senha de acesso da sua conta.</p>
          </div>
          <button onClick={() => setTrocandoSenha(true)}
            className="bg-polo-navy text-polo-gold font-bold px-4 py-2 rounded-lg text-sm whitespace-nowrap">Trocar senha</button>
        </div>
      </div>

      {/* Ajuste automático de mín/máx */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-polo-navy">🤖 Ajuste automático de Mín/Máx</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Recalcula mín/máx de cada produto pela média de saídas dos últimos 15 dias.
              Desligado, apenas sugere e você aprova.
            </p>
          </div>
          <button
            role="switch" aria-checked={!!prefs.autoMinMax}
            onClick={() => {
              const novo = !prefs.autoMinMax;
              setPref('autoMinMax', novo);
              toast(novo ? 'Ajuste automático LIGADO — mín/máx acompanham o consumo.' : 'Ajuste automático desligado — voltam as sugestões manuais.', 'sucesso');
            }}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${prefs.autoMinMax ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prefs.autoMinMax ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">Dias de cobertura do estoque</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mínimo (alerta abaixo de)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" min="1" max="30"
                  value={diasMinStr}
                  onChange={e => setDiasMinStr(e.target.value)}
                  onBlur={e => {
                    const v = Math.max(1, parseInt(e.target.value) || 3);
                    setDiasMinStr(String(v));
                    setPref('diasMin', v);
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <span className="text-xs text-gray-500 whitespace-nowrap">dias</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Máximo (meta de compra)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" min="1" max="90"
                  value={diasMaxStr}
                  onChange={e => setDiasMaxStr(e.target.value)}
                  onBlur={e => {
                    const v = Math.max(1, parseInt(e.target.value) || 6);
                    setDiasMaxStr(String(v));
                    setPref('diasMax', v);
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <span className="text-xs text-gray-500 whitespace-nowrap">dias</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Ex: mín 3 dias → com esse estoque a cozinha trabalha por 3 dias sem repor. Máx 6 dias → meta de compra para 6 dias de produção.
          </p>
        </div>
        {!!prefs.autoMinMax && (
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-bold text-polo-navy">📅 Considerar o dia da semana</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Em vez da média lisa, dimensiona o mín/máx pelo consumo previsto dos próximos dias —
                  sobe na véspera do fim de semana e cai no início da semana. Útil para casas com pico no sábado/domingo.
                </p>
              </div>
              <button
                role="switch" aria-checked={!!prefs.minMaxPorDiaSemana}
                onClick={() => {
                  const novo = !prefs.minMaxPorDiaSemana;
                  setPref('minMaxPorDiaSemana', novo);
                  toast(novo ? 'Mín/máx agora consideram o dia da semana.' : 'Mín/máx voltaram à média simples.', 'sucesso');
                }}
                className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${prefs.minMaxPorDiaSemana ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prefs.minMaxPorDiaSemana ? 'left-6' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Guia de fluxo */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-polo-navy">📋 Guia de fluxo do turno</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Exibe um painel no topo de cada tela com os passos do turno (Entradas → Aparas → Produção → Saídas) e lembra o próximo passo a registrar.
            </p>
          </div>
          <button
            role="switch" aria-checked={!!prefs.guia}
            onClick={() => setPref('guia', !prefs.guia)}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${prefs.guia ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prefs.guia ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Contagem física */}
      <Link to="/inventario"
        className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 mb-4 active:scale-[0.99] transition-transform">
        <div>
          <p className="text-sm font-bold text-polo-navy">📐 Contagem física / conferência</p>
          <p className="text-xs text-gray-500 mt-0.5">Use quando conferir o estoque real e ele divergir do calculado.</p>
        </div>
        <span className="text-polo-navy text-lg">›</span>
      </Link>

      {/* Assinatura — diretoria */}
      {sessao?.cargo === 'diretoria' && (
        <Link to="/pagamento"
          className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 mb-4 active:scale-[0.99] transition-transform">
          <div>
            <p className="text-sm font-bold text-polo-navy">💳 Assinatura / Plano</p>
            <p className="text-xs text-gray-500 mt-0.5">Gerencie seu plano e forma de pagamento.</p>
          </div>
          <span className="text-polo-navy text-lg">›</span>
        </Link>
      )}

      {/* Histórico de mudanças — diretoria */}
      {sessao?.cargo === 'diretoria' && (
        <Link to="/auditoria"
          className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 mb-4 active:scale-[0.99] transition-transform">
          <div>
            <p className="text-sm font-bold text-polo-navy">🔍 Histórico de mudanças</p>
            <p className="text-xs text-gray-500 mt-0.5">Registro de tudo que cada usuário fez no sistema.</p>
          </div>
          <span className="text-polo-navy text-lg">›</span>
        </Link>
      )}

      </>}

      {secao === 'acessos' && <>
      {/* Equipe */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">Equipe / Responsáveis</p>
          <p className="text-xs text-gray-500 mt-1">Quem aparece para selecionar ao registrar entradas, saídas, aparas e perdas.</p>
        </div>
        <div className="flex gap-2">
          <input type="text" value={novaPessoa} onChange={e => setNovaPessoa(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddPessoa(); }}
            placeholder="Nome da pessoa"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleAddPessoa}
            className="bg-polo-navy text-polo-gold font-bold px-4 rounded-lg text-sm">+ Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {pessoas.length === 0 && <span className="text-xs text-gray-500">Nenhuma pessoa cadastrada ainda.</span>}
          {pessoas.map(p => (
            <span key={p} className="inline-flex items-center gap-2 bg-polo-beige rounded-full pl-3 pr-2 py-1 text-sm font-medium text-polo-navy">
              {p}
              <button onClick={async () => {
                  const ok = await confirm({ titulo: 'Remover pessoa', mensagem: `Remover ${p} da equipe? Registros antigos não mudam.`, perigo: true, confirmar: 'Remover' });
                  if (ok) { removePessoa(p); toast('Pessoa removida.', 'sucesso'); }
                }}
                className="text-red-400 font-bold text-base leading-none">×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Usuários e acessos */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">👤 Usuários e Acessos</p>
          <p className="text-xs text-gray-500 mt-1">
            Cada pessoa entra com <strong>e-mail e senha próprios</strong>. Para dar acesso a alguém novo, gere um
            código de convite, escolha o cargo e passe o código — a pessoa se cadastra sozinha na tela de login.
          </p>
        </div>

        {/* Gerar convite */}
        <div className="flex gap-2">
          <select value={conviteCargo} onChange={e => setConviteCargo(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            {CARGOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button onClick={handleGerarConvite}
            className="bg-polo-navy text-polo-gold font-bold px-4 rounded-lg text-sm whitespace-nowrap">+ Gerar convite</button>
        </div>
        {conviteGerado && (
          <div className="bg-polo-beige border border-polo-gold/50 rounded-xl p-3 space-y-2">
            <p className="text-xs text-polo-navy">
              Código de convite ({CARGOS.find(c => c.id === conviteGerado.cargo)?.label}) — válido por 7 dias, uso único:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-lg font-bold tracking-widest text-polo-navy text-center">
                {conviteGerado.token}
              </code>
              <button onClick={copiarConvite}
                className="bg-polo-navy text-polo-gold font-bold px-3 py-2 rounded-lg text-sm">Copiar</button>
            </div>
          </div>
        )}

        {/* Lista de usuários */}
        <div className="space-y-1.5">
          {usuarios.map(u => {
            const euMesmo = u.id === sessao?.usuarioId;
            return (
              <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div>
                  <span className="text-sm font-semibold text-gray-800">{u.nome}</span>
                  {euMesmo && <span className="text-[10px] text-green-600 font-semibold ml-1.5">• você</span>}
                </div>
                {euMesmo ? (
                  <span className="text-[10px] font-bold text-polo-navy bg-polo-beige px-1.5 py-0.5 rounded">
                    {CARGOS.find(c => c.id === u.cargo)?.label}
                  </span>
                ) : (
                  <select value={u.cargo} onChange={e => { alterarCargo(u.id, e.target.value); logAudit('alterou cargo', `${u.nome} → ${CARGOS.find(c => c.id === e.target.value)?.label}`); }}
                    className="text-xs font-semibold text-polo-navy bg-polo-beige border border-polo-gold/40 rounded-lg px-2 py-1">
                    {CARGOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </div>

      </>}

      {secao === 'sistema' && <>
      {/* Destinos de saída (para onde o estoque vai) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">📤 Destinos de Saída</p>
          <p className="text-xs text-gray-500 mt-1">Para onde o estoque é enviado (ex.: unidades, salão, delivery). Aparecem na tela de Saídas.</p>
        </div>
        <div className="flex gap-2">
          <input type="text" value={novoLocal} onChange={e => setNovoLocal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddLocal(); }}
            placeholder="Novo destino (ex: Polo Beer)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleAddLocal}
            className="bg-polo-navy text-polo-gold font-bold px-4 rounded-lg text-sm">+ Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {locais.length === 0 && <span className="text-xs text-gray-500">Nenhum destino — adicione ao menos um para registrar saídas.</span>}
          {locais.map(l => (
            <span key={l.id} className="inline-flex items-center gap-2 bg-polo-beige rounded-full pl-3 pr-2 py-1 text-sm font-medium text-polo-navy">
              {l.nome}
              <button onClick={async () => {
                  const ok = await confirm({ titulo: 'Remover destino', mensagem: `Remover "${l.nome}"? Saídas antigas não mudam.`, perigo: true, confirmar: 'Remover' });
                  if (ok) { setLocais(locais.filter(x => x.id !== l.id)); logAudit('removeu destino de saída', l.nome); toast('Destino removido.', 'sucesso'); }
                }}
                className="text-red-400 font-bold text-base leading-none">×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Destinos de apara */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">✂️ Destinos de Apara</p>
          <p className="text-xs text-gray-500 mt-1">Opções que aparecem ao registrar uma apara. "Outro" é fixo e abre campo livre.</p>
        </div>
        <div className="flex gap-2">
          <input type="text" value={novoDestino} onChange={e => setNovoDestino(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddDestino(); }}
            placeholder="Novo destino (ex: Escondidinho)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleAddDestino}
            className="bg-polo-navy text-polo-gold font-bold px-4 rounded-lg text-sm">+ Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {destinos.map(d => (
            <span key={d.cod} className="inline-flex items-center gap-1.5 bg-polo-beige rounded-full pl-3 pr-2 py-1 text-xs font-medium text-polo-navy">
              <strong>{d.cod}</strong> {d.label}
              {d.cod !== 'OUT' ? (
                <button onClick={async () => {
                    const ok = await confirm({ titulo: 'Remover destino', mensagem: `Remover "${d.label}"? Registros antigos não mudam.`, perigo: true, confirmar: 'Remover' });
                    if (ok) {
                      setDestinos(destinos.filter(x => x.cod !== d.cod));
                      logAudit('removeu destino de apara', d.label);
                      toast('Destino removido.', 'sucesso');
                    }
                  }}
                  className="text-red-400 font-bold text-sm leading-none">×</button>
              ) : (
                <span className="text-gray-500 text-[9px]">(fixo)</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Planilha de produtos — cadastro padronizado em massa */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">📊 Planilha de produtos</p>
          <p className="text-xs text-gray-500 mt-1">
            Forma rápida de montar um restaurante novo: baixe a planilha modelo (já vem com produtos de exemplo),
            ajuste no Excel/Google Sheets e importe. Produtos com o mesmo nome são atualizados; os novos, criados.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={baixarPlanilhaModelo}
            className="flex-1 border border-polo-navy text-polo-navy font-semibold py-2.5 rounded-xl text-sm">
            ↓ Baixar planilha modelo
          </button>
          <button onClick={() => planilhaRef.current?.click()}
            className="flex-1 bg-polo-navy text-polo-gold font-bold py-2.5 rounded-xl text-sm">
            ↑ Importar planilha
          </button>
        </div>
        <input ref={planilhaRef} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importarPlanilha} className="hidden" />
      </div>

      {/* Cópia de segurança — recuperação de desastre (apagar tudo, clonar restaurante) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">🛟 Cópia de segurança</p>
          <p className="text-xs text-gray-500 mt-1">
            Seus dados já ficam na nuvem e sincronizam entre tablets. Esta cópia é uma rede de segurança extra:
            exporte de vez em quando para conseguir voltar atrás caso alguém apague tudo por engano, ou para clonar o restaurante (com receitas) em outra conta.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { exportarBackup(); toast('Cópia de segurança exportada!', 'sucesso'); }}
            className="flex-1 bg-polo-navy text-polo-gold font-bold py-2.5 rounded-xl text-sm">
            ↓ Exportar cópia
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="flex-1 border border-polo-navy text-polo-navy font-semibold py-2.5 rounded-xl text-sm">
            ↑ Restaurar cópia
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleImportar} className="hidden" />
      </div>

      {/* Zona de perigo */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Zona de Perigo</p>
        <button onClick={async () => {
          const ok = await confirm({ titulo: 'Restaurar produtos padrão', mensagem: 'Restaurar a lista de produtos padrão? Os valores de mín/máx personalizados serão redefinidos.', perigo: true, confirmar: 'Restaurar' });
          if (ok) { resetarProdutos(); toast('Produtos restaurados ao padrão.', 'sucesso'); }
        }}
          className="w-full border border-red-300 text-red-600 font-semibold py-2.5 rounded-xl text-sm">
          Restaurar produtos padrão
        </button>
        <button onClick={async () => {
          const ok = await confirm({ titulo: 'Apagar todos os registros', mensagem: 'ATENÇÃO: isso apaga entradas, saídas, aparas, desperdício e contagens. Esta ação não pode ser desfeita.\n\nDica: exporte um backup antes.', perigo: true, confirmar: 'Apagar tudo' });
          if (ok) { limparTudo(); toast('Todos os registros foram apagados.', 'sucesso'); }
        }}
          className="w-full bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm">
          Apagar todos os registros
        </button>
      </div>
      </>}

      {(editando || criando) && (
        <ModalProduto
          produto={editando}
          sugestao={editando ? sugestoes[editando.id] : null}
          categorias={categorias}
          producoes={producoes}
          diasMin={prefs.diasMin || 3}
          diasMax={prefs.diasMax || 6}
          onSalvar={handleSalvar}
          onFechar={() => { setEditando(null); setCriando(false); }}
        />
      )}


      {(editandoProducao || criandoProducao) && (
        <ModalProducao
          receita={editandoProducao}
          produtos={produtos}
          onSalvar={(form) => {
            if (editandoProducao) {
              setProducoes(producoes.map(r => r.id === editandoProducao.id ? { ...r, ...form } : r));
              logAudit('editou receita de produção', form.nome);
              toast('Receita atualizada.', 'sucesso');
            } else {
              setProducoes([...producoes, { ...form, id: `prod_${Date.now()}` }]);
              logAudit('criou receita de produção', form.nome);
              toast('Receita criada.', 'sucesso');
            }
            setEditandoProducao(null);
            setCriandoProducao(false);
          }}
          onFechar={() => { setEditandoProducao(null); setCriandoProducao(false); }}
        />
      )}

      {trocandoSenha && (
        <div className="fixed inset-0 z-[70]">
          <NovaSenha titulo="Trocar minha senha" aoConcluir={() => setTrocandoSenha(false)} />
        </div>
      )}
    </Layout>
  );
}
