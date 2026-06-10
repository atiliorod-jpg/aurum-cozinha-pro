import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { PRODUTOS_INICIAIS, PESSOAS_INICIAIS, DESTINOS_APARA } from '../data/produtos';
import { FICHAS_INICIAIS } from '../data/fichas';
import { calcSugestoesMinMax } from '../utils/sugestoes';
import { calcEstoquePuro } from '../utils/estoque';
import { useAuth } from './AuthContext';

const KEY = {
  produtos: 'pe_produtos',
  compras: 'pe_compras',
  entradas: 'pe_entradas',
  saidas: 'pe_saidas',
  aparas: 'pe_aparas',
  desperdicio: 'pe_desperdicio',
  ajustes: 'pe_ajustes',
  pessoas: 'pe_pessoas',
  fichas: 'pe_fichas',
  destinos: 'pe_destinos',
  auditoria: 'pe_auditoria',
  prefs: 'pe_prefs',
};

const load = (key, fallback) => {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

const save = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

// Ordering key: prefer explicit ts, fall back to numeric id (ids são Date.now())
const ordemTs = (r) => r.ts || parseInt(r.id, 10) || 0;

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { sessao } = useAuth() || {};
  const [produtos, setProdutosState] = useState(() => load(KEY.produtos, PRODUTOS_INICIAIS));
  const [auditoria, setAuditoriaState] = useState(() => load(KEY.auditoria, []));
  const [destinos, setDestinosState] = useState(() => load(KEY.destinos, DESTINOS_APARA));

  // refs para os resumos de auditoria não dependerem de closures
  const sessaoRef = useRef(sessao);
  sessaoRef.current = sessao;
  const produtosRef = useRef(produtos);
  produtosRef.current = produtos;

  const nomeProduto = (id) => produtosRef.current.find(p => p.id === id)?.nome || id;

  // Trilha de auditoria: quem fez o quê, quando (visível para Gerência/Diretoria)
  const logAudit = useCallback((acao, detalhe = '') => {
    setAuditoriaState(prev => {
      const reg = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(),
        usuario: sessaoRef.current?.nome || '—',
        cargo: sessaoRef.current?.cargo || '',
        acao, detalhe,
      };
      const next = [...prev.slice(-1999), reg];
      save(KEY.auditoria, next);
      return next;
    });
  }, []);

  const setDestinos = useCallback((val) => {
    setDestinosState(val);
    save(KEY.destinos, val);
  }, []);
  const [compras, setComprasState] = useState(() => load(KEY.compras, []));
  const [entradas, setEntradasState] = useState(() => load(KEY.entradas, []));
  const [saidas, setSaidasState] = useState(() => load(KEY.saidas, []));
  const [aparas, setAparasState] = useState(() => load(KEY.aparas, []));
  const [desperdicio, setDesperdicioState] = useState(() => load(KEY.desperdicio, []));
  const [ajustes, setAjustesState] = useState(() => load(KEY.ajustes, []));
  const [pessoas, setPessoasState] = useState(() => load(KEY.pessoas, PESSOAS_INICIAIS));
  const [fichas, setFichasState] = useState(() => load(KEY.fichas, FICHAS_INICIAIS));

  const setFichas = useCallback((val) => {
    setFichasState(val);
    save(KEY.fichas, val);
  }, []);
  const [prefs, setPrefsState] = useState(() => load(KEY.prefs, { responsavel: '', turno: 'Manhã', destino: 'polo_central' }));

  const addPessoa = useCallback((nome) => {
    const n = (nome || '').trim();
    if (!n) return;
    setPessoasState(prev => {
      if (prev.some(p => p.toLowerCase() === n.toLowerCase())) return prev;
      const next = [...prev, n];
      save(KEY.pessoas, next);
      return next;
    });
  }, []);

  const removePessoa = useCallback((nome) => {
    setPessoasState(prev => {
      const next = prev.filter(p => p !== nome);
      save(KEY.pessoas, next);
      return next;
    });
  }, []);

  const setProdutos = useCallback((val) => {
    setProdutosState(val);
    save(KEY.produtos, val);
  }, []);

  const setPref = useCallback((chave, valor) => {
    setPrefsState(prev => {
      const next = { ...prev, [chave]: valor };
      save(KEY.prefs, next);
      return next;
    });
  }, []);

  // Resumos legíveis para a trilha de auditoria
  const resumoItens = (r) => (r.itens || []).map(i => `${i.quantidade} ${nomeProduto(i.produtoId)}`).join(', ');
  const RESUMOS = {
    compra: (r) => `${r.quantidade} ${r.unidade} de ${r.item}${r.fornecedor ? ` (${r.fornecedor})` : ''}`,
    entrada: (r) => resumoItens(r),
    saída: (r) => `${resumoItens(r)} → ${r.destino === 'polo_beer' ? 'Polo Beer' : 'Polo Central'}`,
    apara: (r) => `${r.quantidade} ${r.unidade} de ${r.item} → ${r.destinoOutro || r.destino}`,
    perda: (r) => `${r.quantidade} ${r.unidade} de ${r.item} (motivo ${r.motivoOutro || r.motivo}${r.origem === 'estoque' ? ', abateu estoque' : ''})`,
    'contagem física': (r) => `${nomeProduto(r.produtoId)} → ${r.quantidade}`,
  };

  const makeAdd = (setState, key, tipo) => (registro) => {
    const novo = { ...registro, id: Date.now().toString(), ts: Date.now() };
    setState(prev => {
      const next = [...prev, novo];
      save(key, next);
      return next;
    });
    logAudit(`registrou ${tipo}`, RESUMOS[tipo]?.(novo) || '');
  };

  const makeRemove = (setState, key, tipo) => (id) => {
    setState(prev => {
      const alvo = prev.find(r => r.id === id);
      const next = prev.filter(r => r.id !== id);
      save(key, next);
      if (alvo) logAudit(`removeu ${tipo}`, RESUMOS[tipo]?.(alvo) || '');
      return next;
    });
  };

  const addCompra = useCallback(makeAdd(setComprasState, KEY.compras, 'compra'), []);
  const removeCompra = useCallback(makeRemove(setComprasState, KEY.compras, 'compra'), []);
  const addEntrada = useCallback(makeAdd(setEntradasState, KEY.entradas, 'entrada'), []);
  const removeEntrada = useCallback(makeRemove(setEntradasState, KEY.entradas, 'entrada'), []);
  const addSaida = useCallback(makeAdd(setSaidasState, KEY.saidas, 'saída'), []);
  const removeSaida = useCallback(makeRemove(setSaidasState, KEY.saidas, 'saída'), []);
  const addApara = useCallback(makeAdd(setAparasState, KEY.aparas, 'apara'), []);
  const removeApara = useCallback(makeRemove(setAparasState, KEY.aparas, 'apara'), []);
  const addDesperdicio = useCallback(makeAdd(setDesperdicioState, KEY.desperdicio, 'perda'), []);
  const removeDesperdicio = useCallback(makeRemove(setDesperdicioState, KEY.desperdicio, 'perda'), []);
  const addAjuste = useCallback(makeAdd(setAjustesState, KEY.ajustes, 'contagem física'), []);
  const removeAjuste = useCallback(makeRemove(setAjustesState, KEY.ajustes, 'contagem física'), []);

  // Estoque automático — regra completa (e coberta por testes) em utils/estoque.js
  const calcEstoque = useCallback(
    () => calcEstoquePuro({ produtos, entradas, saidas, ajustes, desperdicio }),
    [produtos, entradas, saidas, ajustes, desperdicio]
  );

  // Modo automático: quando ligado em Configurações, o mín/máx de cada produto
  // acompanha sozinho a média de saídas (3 dias = mín, 6 dias = máx).
  // Converge em uma passada: depois de aplicar, sugestão === valor atual e nada muda.
  useEffect(() => {
    if (!prefs.autoMinMax) return;
    const sug = calcSugestoesMinMax(produtos, saidas);
    let mudou = false;
    const next = produtos.map(p => {
      const s = sug[p.id];
      if (s && (p.min !== s.min || p.max !== s.max)) {
        mudou = true;
        return { ...p, min: s.min, max: s.max };
      }
      return p;
    });
    if (mudou) setProdutos(next);
  }, [produtos, saidas, prefs.autoMinMax, setProdutos]);

  const limparTudo = useCallback(() => {
    setComprasState([]); save(KEY.compras, []);
    setEntradasState([]); save(KEY.entradas, []);
    setSaidasState([]); save(KEY.saidas, []);
    setAparasState([]); save(KEY.aparas, []);
    setDesperdicioState([]); save(KEY.desperdicio, []);
    setAjustesState([]); save(KEY.ajustes, []);
    logAudit('apagou todos os registros', 'compras, entradas, saídas, aparas, perdas e contagens');
  }, [logAudit]);

  const resetarProdutos = useCallback(() => {
    setProdutos(PRODUTOS_INICIAIS);
  }, [setProdutos]);

  const exportarBackup = useCallback(() => {
    const dados = {
      versao: 2,
      exportadoEm: new Date().toISOString(),
      produtos, compras, entradas, saidas, aparas, desperdicio, ajustes, pessoas, fichas, destinos, auditoria, prefs,
    };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_polo_estoque_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [produtos, entradas, saidas, aparas, desperdicio, ajustes, prefs]);

  const importarBackup = useCallback((dados) => {
    if (!dados || typeof dados !== 'object') throw new Error('Arquivo inválido');
    if (dados.produtos) { setProdutosState(dados.produtos); save(KEY.produtos, dados.produtos); }
    if (dados.compras) { setComprasState(dados.compras); save(KEY.compras, dados.compras); }
    if (dados.entradas) { setEntradasState(dados.entradas); save(KEY.entradas, dados.entradas); }
    if (dados.saidas) { setSaidasState(dados.saidas); save(KEY.saidas, dados.saidas); }
    if (dados.aparas) { setAparasState(dados.aparas); save(KEY.aparas, dados.aparas); }
    if (dados.desperdicio) { setDesperdicioState(dados.desperdicio); save(KEY.desperdicio, dados.desperdicio); }
    if (dados.ajustes) { setAjustesState(dados.ajustes); save(KEY.ajustes, dados.ajustes); }
    if (dados.pessoas) { setPessoasState(dados.pessoas); save(KEY.pessoas, dados.pessoas); }
    if (dados.fichas) { setFichasState(dados.fichas); save(KEY.fichas, dados.fichas); }
    if (dados.destinos) { setDestinosState(dados.destinos); save(KEY.destinos, dados.destinos); }
    if (dados.auditoria) { setAuditoriaState(dados.auditoria); save(KEY.auditoria, dados.auditoria); }
    if (dados.prefs) { setPrefsState(dados.prefs); save(KEY.prefs, dados.prefs); }
  }, []);

  return (
    <AppContext.Provider value={{
      produtos, setProdutos,
      compras, addCompra, removeCompra,
      entradas, addEntrada, removeEntrada,
      saidas, addSaida, removeSaida,
      aparas, addApara, removeApara,
      desperdicio, addDesperdicio, removeDesperdicio,
      ajustes, addAjuste, removeAjuste,
      pessoas, addPessoa, removePessoa,
      fichas, setFichas,
      destinos, setDestinos,
      auditoria, logAudit,
      prefs, setPref,
      calcEstoque,
      limparTudo, resetarProdutos,
      exportarBackup, importarBackup,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
