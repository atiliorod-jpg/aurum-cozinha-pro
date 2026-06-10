import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth, CARGOS } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { CATEGORIAS } from '../data/produtos';
import { calcSugestoesMinMax, DIAS_MIN, DIAS_MAX } from '../utils/sugestoes';

// Campos numéricos ficam como texto enquanto edita (apagar/limpar funciona);
// a conversão para número acontece só no salvar.
const numVazio = (v) => (v === 0 || v == null ? '' : String(v));

function ModalProduto({ produto, sugestao, onSalvar, onFechar }) {
  const [form, setForm] = useState(() => produto
    ? {
        ...produto,
        estoqueInicial: numVazio(produto.estoqueInicial),
        min: numVazio(produto.min),
        max: numVazio(produto.max),
        valCongelado: numVazio(produto.valCongelado),
        valResfriado: numVazio(produto.valResfriado),
      }
    : {
        nome: '', categoria: CATEGORIAS[0], unidade: 'kg',
        estoqueInicial: '', min: '', max: '', valCongelado: '', valResfriado: '', ativo: true,
      });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto overscroll-contain p-4 flex">
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
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
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
            })} disabled={!form.nome.trim()}
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
          pessoas, addPessoa, removePessoa, destinos, setDestinos, logAudit, prefs, setPref } = useApp();
  const { usuarios, setUsuarios, criarUsuario, sessao, temPermissao } = useAuth();
  const { toast, confirm } = useUI();
  const sugestoes = calcSugestoesMinMax(produtos, saidas);
  const [novoDestino, setNovoDestino] = useState('');
  const [novoUsuario, setNovoUsuario] = useState({ nome: '', pin: '', cargo: 'cozinha' });

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

  const handleAddUsuario = () => {
    const { nome, pin, cargo } = novoUsuario;
    if (nome.trim().length < 2) { toast('Digite o nome do usuário.', 'aviso'); return; }
    if (!/^\d{4,6}$/.test(pin)) { toast('PIN deve ter de 4 a 6 números.', 'aviso'); return; }
    if (usuarios.some(u => u.nome.toLowerCase() === nome.trim().toLowerCase())) {
      toast('Já existe usuário com esse nome.', 'aviso'); return;
    }
    criarUsuario(nome, pin, cargo);
    addPessoa(nome); // já entra na lista de responsáveis também
    logAudit('criou usuário', `${nome.trim()} (${CARGOS.find(c => c.id === cargo)?.label})`);
    setNovoUsuario({ nome: '', pin: '', cargo: 'cozinha' });
    toast('Usuário criado.', 'sucesso');
  };
  const [catAtiva, setCatAtiva] = useState('TODOS');
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [busca, setBusca] = useState('');
  const [novaPessoa, setNovaPessoa] = useState('');
  const [secao, setSecao] = useState('produtos'); // produtos | acessos | sistema
  const [resetPin, setResetPin] = useState(null); // usuário em redefinição de PIN
  const [pinNovo, setPinNovo] = useState('');
  const fileRef = useRef(null);

  const confirmarResetPin = () => {
    if (!/^\d{4,6}$/.test(pinNovo)) { toast('PIN deve ter de 4 a 6 números.', 'aviso'); return; }
    setUsuarios(usuarios.map(u => u.id === resetPin.id ? { ...u, pin: pinNovo } : u));
    logAudit('redefiniu PIN', resetPin.nome);
    toast(`PIN de ${resetPin.nome} redefinido.`, 'sucesso');
    setResetPin(null);
    setPinNovo('');
  };

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
        {[['produtos', '📦 Produtos'], ['acessos', '👤 Equipe & Acessos'], ['sistema', '🛠️ Sistema']].map(([v, l]) => (
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
        {['TODOS', ...CATEGORIAS].map(c => (
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
      </>}

      {secao === 'sistema' && <>
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
            Cozinha registra operações; Gerência e Diretoria também acessam Relatório, Configurações, Contagem e o Histórico de Mudanças.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={novoUsuario.nome} onChange={e => setNovoUsuario(p => ({ ...p, nome: e.target.value }))}
            placeholder="Nome" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input type="password" inputMode="numeric" value={novoUsuario.pin}
            onChange={e => setNovoUsuario(p => ({ ...p, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
            placeholder="PIN (4-6 nº)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2">
          <select value={novoUsuario.cargo} onChange={e => setNovoUsuario(p => ({ ...p, cargo: e.target.value }))}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            {CARGOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button onClick={handleAddUsuario}
            className="bg-polo-navy text-polo-gold font-bold px-4 rounded-lg text-sm">+ Criar</button>
        </div>
        <div className="space-y-1.5">
          {usuarios.map(u => (
            <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <div>
                <span className="text-sm font-semibold text-gray-800">{u.nome}</span>
                <span className="text-[10px] font-bold text-polo-navy bg-polo-beige px-1.5 py-0.5 rounded ml-2">
                  {CARGOS.find(c => c.id === u.cargo)?.label}
                </span>
                {u.id === sessao?.usuarioId && <span className="text-[10px] text-green-600 font-semibold ml-1.5">• você</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setResetPin(u); setPinNovo(''); }}
                  className="text-xs font-semibold text-polo-navy bg-polo-beige px-2 py-1 rounded-lg">🔑 PIN</button>
                {u.id !== sessao?.usuarioId && (
                  <button onClick={async () => {
                      const ok = await confirm({ titulo: 'Remover usuário', mensagem: `Remover o acesso de ${u.nome}?`, perigo: true, confirmar: 'Remover' });
                      if (ok) {
                        setUsuarios(usuarios.filter(x => x.id !== u.id));
                        logAudit('removeu usuário', u.nome);
                        toast('Usuário removido.', 'sucesso');
                      }
                    }}
                    className="text-red-400 text-xs font-semibold">Remover</button>
                )}
              </div>
            </div>
          ))}
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

      {/* Modal de redefinição de PIN */}
      {resetPin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-lg text-polo-navy">Redefinir PIN — {resetPin.nome}</h2>
            <input type="password" inputMode="numeric" value={pinNovo}
              onChange={e => setPinNovo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => { if (e.key === 'Enter') confirmarResetPin(); }}
              placeholder="Novo PIN (4 a 6 números)" autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-lg tracking-[0.4em]" />
            <div className="flex gap-3">
              <button onClick={() => { setResetPin(null); setPinNovo(''); }}
                className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">Cancelar</button>
              <button onClick={confirmarResetPin}
                className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl">Salvar PIN</button>
            </div>
          </div>
        </div>
      )}

      {(editando || criando) && (
        <ModalProduto
          produto={editando}
          sugestao={editando ? sugestoes[editando.id] : null}
          onSalvar={handleSalvar}
          onFechar={() => { setEditando(null); setCriando(false); }}
        />
      )}
    </Layout>
  );
}
