import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth, CARGOS } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import NovaSenha from './NovaSenha';
import { calcSugestoesMinMax, DIAS_MIN, DIAS_MAX } from '../utils/sugestoes';

// Campos numéricos ficam como texto enquanto edita (apagar/limpar funciona);
// a conversão para número acontece só no salvar.
const numVazio = (v) => (v === 0 || v == null ? '' : String(v));

function ModalProduto({ produto, sugestao, categorias, onSalvar, onFechar }) {
  const [form, setForm] = useState(() => produto
    ? {
        ...produto,
        estoqueInicial: numVazio(produto.estoqueInicial),
        min: numVazio(produto.min),
        max: numVazio(produto.max),
        valCongelado: numVazio(produto.valCongelado),
        valResfriado: numVazio(produto.valResfriado),
        pesoUnidade: numVazio(produto.pesoUnidade),
      }
    : {
        nome: '', categoria: categorias[0], unidade: 'kg',
        estoqueInicial: '', min: '', max: '', valCongelado: '', valResfriado: '', pesoUnidade: '', ativo: true,
      });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] overflow-y-auto overscroll-contain p-4 flex">
      <div className="bg-white w-full max-w-lg m-auto rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg text-polo-navy">{produto ? 'Editar Produto' : 'Novo Produto'}</h2>
          <button onClick={onFechar} className="text-2xl text-gray-500">×</button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nome do produto</label>
          <input type="text" value={form.nome} onChange={e => set('nome', e.target.value)}
            placeholder="Ex: Filé de tilápia"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
          <select value={form.categoria} onChange={e => set('categoria', e.target.value)}
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
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Estoque Inicial (ponto de partida)
          </label>
          <input type="number" min="0" step="0.5" value={form.estoqueInicial} onChange={e => set('estoqueInicial', e.target.value)}
            placeholder="0"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-gray-500 mt-1">Quanto há hoje. A partir daqui, entradas/saídas/perdas calculam sozinhas.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Estoque Mínimo (3 dias)
            </label>
            <input type="number" min="0" step="0.5" value={form.min} onChange={e => set('min', e.target.value)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Estoque Máximo (6 dias)
            </label>
            <input type="number" min="0" step="0.5" value={form.max} onChange={e => set('max', e.target.value)}
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
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              ❄️ Validade congelado (dias)
            </label>
            <input type="number" min="0" value={form.valCongelado}
              onChange={e => set('valCongelado', e.target.value)}
              placeholder="0 = sem controle"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              🧊 Validade resfriado (dias)
            </label>
            <input type="number" min="0" value={form.valResfriado}
              onChange={e => set('valResfriado', e.target.value)}
              placeholder="0 = sem controle"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-2">Ao registrar uma entrada, o vencimento é calculado sozinho com esses prazos. 0 = sem controle de validade.</p>

        {form.unidade === 'unid' && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              ⚖️ Peso por unidade (g)
            </label>
            <input type="number" min="0" value={form.pesoUnidade}
              onChange={e => set('pesoUnidade', e.target.value)}
              placeholder="Ex: 130 (1 parmegiana = 130 g)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-500 mt-1">Usado para converter a lista de compras em kg (ex.: 120 unid ≈ 15,6 kg).</p>
          </div>
        )}

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
    <div className="fixed inset-0 bg-black/50 z-[70] overflow-y-auto overscroll-contain p-4 flex">
      <div className="bg-white w-full max-w-lg m-auto rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg text-polo-navy">{ficha ? 'Editar Ficha' : 'Nova Ficha'}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="text-2xl text-gray-500">×</button>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Matéria-prima</label>
          <input type="text" list="lista-materias-primas" value={form.materiaPrima} onChange={e => onMateriaPrima(e.target.value)}
            placeholder="Escolha da lista ou digite uma nova"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <datalist id="lista-materias-primas">
            {materiasPrimas.map(mp => <option key={mp} value={mp} />)}
          </datalist>
          <p className="text-xs text-gray-500 mt-1">Escolher uma existente agrupa a preparação nela (evita "Filé" e "Filé Mignon" separados).</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
          <select value={form.categoria || ''} onChange={e => set('categoria', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
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

export default function Configuracoes() {
  const { produtos, setProdutos, saidas, limparTudo, resetarProdutos, exportarBackup, importarBackup,
          pessoas, addPessoa, removePessoa, destinos, setDestinos, categorias, setCategorias,
          fichas, setFichas, logAudit, prefs, setPref } = useApp();
  const { usuarios, sessao, criarConvite, alterarCargo } = useAuth();
  const { toast, confirm } = useUI();
  const sugestoes = calcSugestoesMinMax(produtos, saidas);

  // O que falta preencher em cada produto (marcação pedida pelo cliente)
  const pendenciasDoProduto = (p) => {
    const falta = [];
    if (!p.min && !p.max) falta.push('mín/máx');
    if (!p.valCongelado && !p.valResfriado) falta.push('validade');
    if (p.unidade === 'unid' && !p.pesoUnidade) falta.push('peso/unid');
    return falta;
  };
  const [novoDestino, setNovoDestino] = useState('');
  const [novaCategoria, setNovaCategoria] = useState('');
  const [conviteCargo, setConviteCargo] = useState('cozinha');
  const [conviteGerado, setConviteGerado] = useState(null); // { token, cargo }
  const [buscaFicha, setBuscaFicha] = useState('');
  const [editandoFicha, setEditandoFicha] = useState(null);
  const [criandoFicha, setCriandoFicha] = useState(false);

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
          mensagem: 'Isso vai SUBSTITUIR todos os dados atuais pelos do arquivo. Continuar?',
          perigo: true,
          confirmar: 'Restaurar',
        });
        if (ok) {
          importarBackup(dados);
          toast('Backup restaurado com sucesso!', 'sucesso');
        }
      } catch {
        toast('Arquivo inválido. Selecione um backup válido.', 'erro');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
      titulo: 'Excluir produto',
      mensagem: 'Excluir este produto? Os registros históricos não serão afetados.',
      perigo: true,
      confirmar: 'Excluir',
    });
    if (ok) {
      setProdutos(produtos.filter(p => p.id !== id));
      toast('Produto excluído.', 'sucesso');
    }
  };

  return (
    <Layout
      title="Configurações"
      actions={secao === 'produtos' ? (
        <button onClick={() => setCriando(true)}
          className="bg-polo-gold text-polo-navy text-xs font-bold px-3 py-1.5 rounded-lg">
          + Produto
        </button>
      ) : null}
    >
      {/* Seções */}
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[['produtos', '📦 Produtos'], ['fichas', '🍽️ Fichas'], ['acessos', '👤 Acessos'], ['sistema', '🛠️ Sistema']].map(([v, l]) => (
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
              {pendenciasDoProduto(p).length > 0 && (
                <div className="text-[10px] font-semibold text-amber-600 mt-0.5">
                  ⚠️ falta: {pendenciasDoProduto(p).join(', ')}
                </div>
              )}
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
              <button onClick={() => excluir(p.id)}
                className="text-xs text-red-400 font-semibold px-2 py-1.5 rounded-lg bg-red-50">
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

      {secao === 'fichas' && <>
      <div className="bg-polo-beige border border-polo-gold/40 rounded-xl p-3 text-xs text-polo-navy mb-3">
        Gramaturas das preparações (cronograma do Polo). Usadas no <strong>🧮 Planejar</strong>, dentro de Compras, para calcular quanto comprar.
      </div>
      <div className="mb-3 flex gap-2">
        <input type="text" value={buscaFicha} onChange={e => setBuscaFicha(e.target.value)}
          placeholder="🔍 Buscar matéria-prima ou preparação..."
          className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
        <button onClick={() => setCriandoFicha(true)}
          className="bg-polo-gold text-polo-navy text-xs font-bold px-3 rounded-xl">+ Ficha</button>
      </div>
      <div className="space-y-3">
        {Object.entries(
          fichas
            .filter(f => !buscaFicha || f.materiaPrima.toLowerCase().includes(buscaFicha.toLowerCase()) || f.preparacao.toLowerCase().includes(buscaFicha.toLowerCase()))
            .reduce((m, f) => { (m[f.materiaPrima] = m[f.materiaPrima] || []).push(f); return m; }, {})
        ).sort(([a], [b]) => a.localeCompare(b)).map(([mp, lista]) => (
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
                <button onClick={() => setEditandoFicha(f)}
                  className="text-xs text-polo-navy font-semibold px-2 py-1 rounded bg-gray-100 flex-shrink-0">Editar</button>
                <button onClick={async () => {
                    const ok = await confirm({ titulo: 'Excluir ficha', mensagem: `Excluir "${f.preparacao}"?`, perigo: true, confirmar: 'Excluir' });
                    if (ok) { setFichas(fichas.filter(x => x.id !== f.id)); logAudit('excluiu ficha', f.preparacao); toast('Ficha excluída.', 'sucesso'); }
                  }} aria-label={`Excluir ficha ${f.preparacao}`}
                  className="text-xs text-red-400 font-semibold px-2 py-1 rounded bg-red-50 flex-shrink-0">×</button>
              </div>
            ))}
          </div>
        ))}
      </div>
      </>}

      {secao === 'sistema' && <>
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
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-polo-navy">🤖 Ajuste automático de Mín/Máx</p>
            <p className="text-xs text-gray-500 mt-0.5">
              O sistema recalcula sozinho o estoque mínimo ({DIAS_MIN} dias de consumo) e máximo ({DIAS_MAX} dias)
              de cada produto pela média de saídas dos últimos 30 dias. Desligado, ele apenas sugere e você aprova.
            </p>
          </div>
          <button onClick={() => {
              const novo = !prefs.autoMinMax;
              setPref('autoMinMax', novo);
              toast(novo ? 'Ajuste automático LIGADO — mín/máx acompanham o consumo.' : 'Ajuste automático desligado — voltam as sugestões manuais.', 'sucesso');
            }}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${prefs.autoMinMax ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prefs.autoMinMax ? 'left-6' : 'left-0.5'}`} />
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

      {/* Backup */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">Backup dos Dados</p>
          <p className="text-xs text-gray-500 mt-1">
            Exporte um arquivo de segurança regularmente. Se trocar de tablet ou limpar o navegador, restaure por aqui.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { exportarBackup(); toast('Backup exportado!', 'sucesso'); }}
            className="flex-1 bg-polo-navy text-polo-gold font-bold py-2.5 rounded-xl text-sm">
            ↓ Exportar backup
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="flex-1 border border-polo-navy text-polo-navy font-semibold py-2.5 rounded-xl text-sm">
            ↑ Restaurar backup
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
          onSalvar={handleSalvar}
          onFechar={() => { setEditando(null); setCriando(false); }}
        />
      )}

      {(editandoFicha || criandoFicha) && (
        <ModalFicha
          ficha={editandoFicha}
          fichas={fichas}
          categorias={categorias}
          onSalvar={(form) => {
            // normaliza para a grafia da matéria-prima já existente (evita grupos duplicados)
            const existente = fichas.find(f => f.materiaPrima.toLowerCase() === form.materiaPrima.trim().toLowerCase());
            form = { ...form, materiaPrima: existente ? existente.materiaPrima : form.materiaPrima.trim() };
            if (editandoFicha) {
              setFichas(fichas.map(f => f.id === editandoFicha.id ? { ...f, ...form } : f));
              logAudit('editou ficha', form.preparacao);
              toast('Ficha atualizada.', 'sucesso');
            } else {
              setFichas([...fichas, { ...form, id: `ficha_${Date.now()}` }]);
              logAudit('criou ficha', form.preparacao);
              toast('Ficha criada.', 'sucesso');
            }
            setEditandoFicha(null);
            setCriandoFicha(false);
          }}
          onFechar={() => { setEditandoFicha(null); setCriandoFicha(false); }}
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
