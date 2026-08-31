import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const UIContext = createContext(null);

let toastSeq = 0;

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  // Modal de impressão de etiquetas (renderizado por components/EtiquetaPrint.jsx).
  // Centralizado aqui — igual ao confirm() — para poder ser aberto de qualquer
  // página (Entradas, Produção, Histórico, Etiquetas) sem prop-drilling.
  const [etiquetaState, setEtiquetaState] = useState(null); // [{ produtoId, nome, tipoData, dataFabricacao, armazenamento, diasValidade, validade, quantidade }] | null
  const resolverRef = useRef(null);

  // opts.acao = { label, onClick } — toast com botão (ex.: Desfazer) dura mais
  const toast = useCallback((mensagem, tipo = 'sucesso', opts = {}) => {
    const id = ++toastSeq;
    setToasts(prev => [...prev, { id, mensagem, tipo, acao: opts.acao }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, opts.duracao ?? (opts.acao ? 7000 : 4500));
  }, []);

  const fecharToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfirmState({
        titulo: opts.titulo || 'Confirmar',
        mensagem: opts.mensagem || '',
        confirmar: opts.confirmar || 'Confirmar',
        cancelar: opts.cancelar || 'Cancelar',
        perigo: opts.perigo || false,
      });
    });
  }, []);

  const fecharConfirm = useCallback((resultado) => {
    setConfirmState(null);
    if (resolverRef.current) {
      resolverRef.current(resultado);
      resolverRef.current = null;
    }
  }, []);

  const abrirEtiquetas = useCallback((itens) => {
    if (!Array.isArray(itens) || !itens.length) return;
    setEtiquetaState(itens);
  }, []);
  const fecharEtiquetas = useCallback(() => setEtiquetaState(null), []);

  // ⚠️ ABRIR A AJUDA DE OUTRA TELA. O botão de Ajuda mora no Layout e guardava
  // o estado dele sozinho, então nada no app conseguia dizer "abre aí, na aba
  // de pedido". Mandar a pessoa "procurar o botão no topo" é o tipo de
  // instrução que se lê e não se cumpre. `null` = ninguém pediu.
  const [ajudaPedida, setAjudaPedida] = useState(null); // 'bug' | 'sugestao' | 'pedido'
  const abrirAjuda = useCallback((tipo = 'pedido') => setAjudaPedida(tipo), []);
  const fecharAjuda = useCallback(() => setAjudaPedida(null), []);

  useEffect(() => {
    if (!confirmState) return;
    const handler = (e) => { if (e.key === 'Escape') fecharConfirm(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirmState, fecharConfirm]);

  // Aviso central quando uma escrita é barrada pelo modo suporte (somente leitura),
  // para não deixar o "sucesso" das telas enganar o super-admin (AUR-SUP-002).
  useEffect(() => {
    let ultimo = 0;
    const handler = () => {
      const agora = Date.now();
      if (agora - ultimo < 2500) return; // não repete em rajada de escritas
      ultimo = agora;
      toast('Modo somente leitura — nada foi salvo.', 'aviso');
    };
    window.addEventListener('escrita-bloqueada', handler);
    return () => window.removeEventListener('escrita-bloqueada', handler);
  }, [toast]);

  // O servidor recusou o lançamento EM DEFINITIVO e ele foi desfeito.
  //
  // Este é o aviso que quebra o silêncio mais caro deste app: até aqui um erro
  // permanente (tipo de estoque que o banco não conhece, coluna inexistente) ia
  // para a fila offline e retentava 8 vezes, enquanto a tela já tinha mostrado o
  // toast verde. Foi assim que o Estoque Seco passou semanas gravando só no
  // tablet. Duração longa e tom de erro de propósito: é para ser lido.
  useEffect(() => {
    const handler = (e) => {
      const detalhe = String(e?.detail || '');
      const ehTipo = /violates check constraint/i.test(detalhe);
      toast(
        ehTipo
          ? 'Não foi possível salvar neste estoque. Avise a diretoria antes de continuar lançando.'
          : 'O servidor recusou este lançamento e ele não foi salvo. Confira os dados e tente de novo.',
        'erro',
        { duracao: 10000 },
      );
    };
    window.addEventListener('registro-recusado', handler);
    return () => window.removeEventListener('registro-recusado', handler);
  }, [toast]);

  // Conflito de catálogo (migração 8): outro aparelho gravou primeiro — a tela
  // foi recarregada com a versão vigente em vez de sobrescrever o outro.
  useEffect(() => {
    const ROTULOS = {
      produtos: 'os produtos', categorias: 'as categorias', pessoas: 'a equipe',
      destinos: 'os destinos', fichas: 'as fichas', producoes: 'as receitas',
      locais: 'os destinos de saída', listaManual: 'a lista de compras',
      etiquetasAvulsas: 'as etiquetas avulsas', prefs: 'as configurações',
    };
    const handler = (e) => {
      const rotulo = ROTULOS[e.detail?.chave] || 'este catálogo';
      // ⚠️ "Aparelho", não "tablet": o app roda em tablet, computador e celular,
      // e nomear só um faz a mensagem parecer errada para quem está nos outros
      // dois — que é metade dos casos.
      toast(`Outro aparelho alterou ${rotulo}. Refaça sua alteração.`, 'aviso', { duracao: 7000 });
    };
    window.addEventListener('catalogo-conflito', handler);
    return () => window.removeEventListener('catalogo-conflito', handler);
  }, [toast]);

  return (
    <UIContext.Provider value={{ toast, confirm, etiquetaState, abrirEtiquetas, fecharEtiquetas, ajudaPedida, abrirAjuda, fecharAjuda, temDialogoAberto: !!confirmState || !!etiquetaState }}>
      {children}

      {/* Toasts */}
      <div role="status" aria-live="polite"
        className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[90%] max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            role={t.tipo === 'erro' ? 'alert' : undefined}
            className={`pointer-events-auto rounded-xl px-4 py-3 shadow-lg text-sm font-semibold flex items-center gap-2 animate-[slideDown_0.2s_ease-out]
              ${t.tipo === 'sucesso' ? 'bg-green-600 text-white' :
                t.tipo === 'erro' ? 'bg-red-600 text-white' :
                t.tipo === 'aviso' ? 'bg-orange-500 text-white' : 'bg-polo-navy text-white'}`}>
            <span className="text-lg leading-none">
              {t.tipo === 'sucesso' ? '✓' : t.tipo === 'erro' ? '✕' : t.tipo === 'aviso' ? '⚠️' : 'ℹ️'}
            </span>
            <span className="flex-1">{t.mensagem}</span>
            {t.acao && (
              <button onClick={() => { t.acao.onClick(); fecharToast(t.id); }}
                className="bg-white/25 hover:bg-white/35 font-bold text-xs px-3 py-1.5 rounded-lg flex-shrink-0 underline-offset-2">
                {t.acao.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-6"
          onClick={e => { if (e.target === e.currentTarget && !confirmState.perigo) fecharConfirm(false); }}>
          <div role="dialog" aria-modal="true" aria-label={confirmState.titulo}
            className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className={`font-bold text-lg ${confirmState.perigo ? 'text-red-600' : 'text-polo-navy'}`}>
              {confirmState.titulo}
            </h2>
            <p className="text-sm text-gray-600 whitespace-pre-line">{confirmState.mensagem}</p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => fecharConfirm(false)} autoFocus
                className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">
                {confirmState.cancelar}
              </button>
              <button onClick={() => fecharConfirm(true)}
                className={`flex-1 font-bold py-3 rounded-xl text-white ${confirmState.perigo ? 'bg-red-600' : 'bg-polo-navy text-polo-gold'}`}>
                {confirmState.confirmar}
              </button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
