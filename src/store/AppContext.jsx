import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { PRODUTOS_INICIAIS, PESSOAS_INICIAIS, DESTINOS_APARA, CATEGORIAS } from '../data/produtos';
import { FICHAS_INICIAIS } from '../data/fichas';
import { calcSugestoesMinMax } from '../utils/sugestoes';
import { calcEstoquePuro } from '../utils/estoque';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet, outboxGet, outboxSet, outboxAdd } from '../lib/cache';

// Valores iniciais (usados ao criar um restaurante novo / sem internet no 1º uso)
const CAT = {
  produtos:   PRODUTOS_INICIAIS,
  categorias: CATEGORIAS,
  pessoas:    PESSOAS_INICIAIS,
  destinos:   DESTINOS_APARA,
  fichas:     FICHAS_INICIAIS,
  prefs:      { responsavel: '', turno: 'Manhã', destino: 'polo_central' },
};

// tipo no banco → rótulo legível para a trilha de auditoria
const ROTULO = {
  compra: 'compra', entrada: 'entrada', saida: 'saída',
  apara: 'apara', perda: 'perda', ajuste: 'contagem física',
};

// Linha do banco ↔ registro do app
const semIdTs = ({ id, ts, ...resto }) => resto;
const linhaParaRegistro = (row) => ({ id: row.id, ts: Number(row.ts), ...row.dados });

// Preferências de APARELHO (ficam só no tablet, não sincronizam):
// "último responsável/turno/destino" são conveniência local de cada aparelho.
// As demais (ex.: autoMinMax) são do restaurante e vão para a nuvem.
const PREFS_APARELHO = ['responsavel', 'turno', 'destino'];
const soRestaurante = (p) => { const o = { ...p }; PREFS_APARELHO.forEach(k => delete o[k]); return o; };
const soAparelho = (p) => { const o = {}; PREFS_APARELHO.forEach(k => { if (p[k] !== undefined) o[k] = p[k]; }); return o; };

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { sessao } = useAuth() || {};
  const rid = sessao?.restauranteId || null;

  // ── Estado (hidratado do cache → rede) ─────────────────────
  const [produtos,    setProdutosRaw]    = useState(CAT.produtos);
  const [categorias,  setCategoriasRaw]  = useState(CAT.categorias);
  const [pessoas,     setPessoasRaw]     = useState(CAT.pessoas);
  const [destinos,    setDestinosRaw]    = useState(CAT.destinos);
  const [fichas,      setFichasRaw]      = useState(CAT.fichas);
  const [prefs,       setPrefsRaw]       = useState(CAT.prefs);
  const [compras,     setComprasRaw]     = useState([]);
  const [entradas,    setEntradasRaw]    = useState([]);
  const [saidas,      setSaidasRaw]      = useState([]);
  const [aparas,      setAparasRaw]      = useState([]);
  const [desperdicio, setDesperdicioRaw] = useState([]);
  const [ajustes,     setAjustesRaw]     = useState([]);
  const [auditoria,   setAuditoriaRaw]   = useState([]);

  // refs estáveis para callbacks não dependerem de closures velhas
  const ridRef = useRef(rid); ridRef.current = rid;
  const sessaoRef = useRef(sessao); sessaoRef.current = sessao;
  const dadosRef = useRef({});
  dadosRef.current = { produtos, categorias, pessoas, destinos, fichas, prefs, compras, entradas, saidas, aparas, desperdicio, ajustes, auditoria };

  const nomeProduto = (id) => dadosRef.current.produtos.find(p => p.id === id)?.nome || id;

  // ── Resumos para a auditoria ───────────────────────────────
  const resumoItens = (r) => (r.itens || []).map(i => `${i.quantidade} ${nomeProduto(i.produtoId)}`).join(', ');
  const RESUMOS = {
    compra: (r) => `${r.quantidade} ${r.unidade} de ${r.item}${r.fornecedor ? ` (${r.fornecedor})` : ''}`,
    entrada: (r) => resumoItens(r),
    'saída': (r) => `${resumoItens(r)} → ${r.destino === 'polo_beer' ? 'Polo Beer' : 'Polo Central'}`,
    apara: (r) => `${r.quantidade} ${r.unidade} de ${r.item} → ${r.destinoOutro || r.destino}`,
    perda: (r) => `${r.quantidade} ${r.unidade} de ${r.item} (motivo ${r.motivoOutro || r.motivo}${r.origem === 'estoque' ? ', abateu estoque' : ''})`,
    'contagem física': (r) => `${nomeProduto(r.produtoId)} → ${r.quantidade}`,
  };

  // ── Trilha de auditoria (registro tipo 'auditoria') ────────
  const logAudit = useCallback((acao, detalhe = '') => {
    const r = ridRef.current;
    const reg = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      usuario: sessaoRef.current?.nome || '—',
      cargo: sessaoRef.current?.cargo || '',
      acao, detalhe,
    };
    setAuditoriaRaw(prev => {
      const next = [...prev.slice(-1999), reg];
      cacheSet(r, 'auditoria', next);
      return next;
    });
    if (!r) return;
    const row = { id: reg.id, restaurante_id: r, tipo: 'auditoria', ts: reg.ts, dados: semIdTs(reg), deleted: false };
    supabase.from('registros').insert(row).then(({ error }) => {
      if (error) outboxAdd(r, { kind: 'registro', op: 'insert', payload: row });
    });
  }, []);

  // ── Catálogos (documentos JSONB, 1 linha por lista) ────────
  const persistCatalogo = useCallback((chave, setRaw, valor) => {
    setRaw(valor);
    const r = ridRef.current;
    cacheSet(r, chave, valor);
    if (!r) return;
    const payload = { restaurante_id: r, chave, dados: valor, updated_at: new Date().toISOString() };
    supabase.from('documentos').upsert(payload).then(({ error }) => {
      if (error) outboxAdd(r, { kind: 'doc', op: 'upsert', payload });
    });
  }, []);

  const setProdutos   = useCallback((v) => persistCatalogo('produtos',   setProdutosRaw,   v), [persistCatalogo]);
  const setCategorias = useCallback((v) => persistCatalogo('categorias', setCategoriasRaw, v), [persistCatalogo]);
  const setDestinos   = useCallback((v) => persistCatalogo('destinos',   setDestinosRaw,   v), [persistCatalogo]);
  const setFichas     = useCallback((v) => persistCatalogo('fichas',     setFichasRaw,     v), [persistCatalogo]);

  const setPref = useCallback((chave, valor) => {
    const r = ridRef.current;
    const next = { ...dadosRef.current.prefs, [chave]: valor };
    setPrefsRaw(next);
    if (PREFS_APARELHO.includes(chave)) {
      // só neste aparelho — não sobe para a nuvem
      cacheSet(r, '_prefs_device', soAparelho(next));
    } else {
      // preferência do restaurante → nuvem (sem as chaves de aparelho)
      const restPrefs = soRestaurante(next);
      cacheSet(r, 'prefs', restPrefs);
      if (r) {
        const payload = { restaurante_id: r, chave: 'prefs', dados: restPrefs, updated_at: new Date().toISOString() };
        supabase.from('documentos').upsert(payload)
          .then(({ error }) => { if (error) outboxAdd(r, { kind: 'doc', op: 'upsert', payload }); });
      }
    }
  }, []);

  const addPessoa = useCallback((nome) => {
    const n = (nome || '').trim();
    if (!n) return;
    if (dadosRef.current.pessoas.some(p => p.toLowerCase() === n.toLowerCase())) return;
    persistCatalogo('pessoas', setPessoasRaw, [...dadosRef.current.pessoas, n]);
  }, [persistCatalogo]);

  const removePessoa = useCallback((nome) => {
    persistCatalogo('pessoas', setPessoasRaw, dadosRef.current.pessoas.filter(p => p !== nome));
  }, [persistCatalogo]);

  // ── Registros operacionais (tabela 'registros') ────────────
  const addRegistro = useCallback((tipo, setRaw, key, registro) => {
    const r = ridRef.current;
    const novo = { ...registro, id: Date.now().toString(), ts: Date.now() };
    setRaw(prev => {
      const next = [...prev, novo];
      cacheSet(r, key, next);
      return next;
    });
    if (r) {
      const row = { id: novo.id, restaurante_id: r, tipo, ts: novo.ts, dados: semIdTs(novo), deleted: false };
      supabase.from('registros').insert(row).then(({ error }) => {
        if (error) outboxAdd(r, { kind: 'registro', op: 'insert', payload: row });
      });
    }
    logAudit(`registrou ${ROTULO[tipo]}`, RESUMOS[ROTULO[tipo]]?.(novo) || '');
  }, [logAudit]);

  const removeRegistro = useCallback((tipo, setRaw, key, id) => {
    const r = ridRef.current;
    const alvo = dadosRef.current[key].find(x => x.id === id);
    setRaw(prev => {
      const next = prev.filter(x => x.id !== id);
      cacheSet(r, key, next);
      return next;
    });
    if (r) {
      supabase.from('registros').update({ deleted: true }).eq('id', id).then(({ error }) => {
        if (error) outboxAdd(r, { kind: 'registro', op: 'delete', payload: { id } });
      });
    }
    if (alvo) logAudit(`removeu ${ROTULO[tipo]}`, RESUMOS[ROTULO[tipo]]?.(alvo) || '');
  }, [logAudit]);

  const addCompra      = useCallback((x) => addRegistro('compra',  setComprasRaw,     'compras',     x), [addRegistro]);
  const removeCompra   = useCallback((x) => removeRegistro('compra', setComprasRaw,   'compras',     x), [removeRegistro]);
  const addEntrada     = useCallback((x) => addRegistro('entrada', setEntradasRaw,    'entradas',    x), [addRegistro]);
  const removeEntrada  = useCallback((x) => removeRegistro('entrada', setEntradasRaw, 'entradas',    x), [removeRegistro]);
  const addSaida       = useCallback((x) => addRegistro('saida',   setSaidasRaw,      'saidas',      x), [addRegistro]);
  const removeSaida    = useCallback((x) => removeRegistro('saida', setSaidasRaw,     'saidas',      x), [removeRegistro]);
  const addApara       = useCallback((x) => addRegistro('apara',   setAparasRaw,      'aparas',      x), [addRegistro]);
  const removeApara    = useCallback((x) => removeRegistro('apara', setAparasRaw,     'aparas',      x), [removeRegistro]);
  const addDesperdicio = useCallback((x) => addRegistro('perda',   setDesperdicioRaw, 'desperdicio', x), [addRegistro]);
  const removeDesperdicio = useCallback((x) => removeRegistro('perda', setDesperdicioRaw, 'desperdicio', x), [removeRegistro]);
  const addAjuste      = useCallback((x) => addRegistro('ajuste',  setAjustesRaw,     'ajustes',     x), [addRegistro]);
  const removeAjuste   = useCallback((x) => removeRegistro('ajuste', setAjustesRaw,   'ajustes',     x), [removeRegistro]);

  // Desfazer: devolve um registro removido exatamente como era (mesmo id/ts)
  const MAPA_RESTAURO = {
    compra:  [setComprasRaw,     'compras',     'compra',  'compra'],
    entrada: [setEntradasRaw,    'entradas',    'entrada', 'entrada'],
    saida:   [setSaidasRaw,      'saidas',      'saida',   'saída'],
    apara:   [setAparasRaw,      'aparas',      'apara',   'apara'],
    perda:   [setDesperdicioRaw, 'desperdicio', 'perda',   'perda'],
    ajuste:  [setAjustesRaw,     'ajustes',     'ajuste',  'contagem física'],
  };
  const restaurarRegistro = useCallback((tipoApi, registro) => {
    const alvo = MAPA_RESTAURO[tipoApi];
    if (!alvo || !registro) return;
    const [setRaw, key, tipo, rotulo] = alvo;
    const r = ridRef.current;
    setRaw(prev => {
      if (prev.some(x => x.id === registro.id)) return prev;
      const next = [...prev, registro].sort((a, b) => (a.ts || 0) - (b.ts || 0));
      cacheSet(r, key, next);
      return next;
    });
    if (r) {
      const row = { id: registro.id, restaurante_id: r, tipo, ts: registro.ts, dados: semIdTs(registro), deleted: false };
      supabase.from('registros').upsert(row).then(({ error }) => {
        if (error) outboxAdd(r, { kind: 'registro', op: 'insert', payload: row });
      });
    }
    logAudit(`restaurou ${rotulo} (desfazer)`, RESUMOS[rotulo]?.(registro) || '');
  }, [logAudit]);

  // ── Estoque automático (regra completa em utils/estoque.js) ─
  const calcEstoque = useCallback(
    () => calcEstoquePuro({ produtos, entradas, saidas, ajustes, desperdicio }),
    [produtos, entradas, saidas, ajustes, desperdicio]
  );

  // Modo automático mín/máx
  useEffect(() => {
    if (!prefs.autoMinMax) return;
    const sug = calcSugestoesMinMax(produtos, saidas);
    let mudou = false;
    const next = produtos.map(p => {
      const s = sug[p.id];
      if (s && (p.min !== s.min || p.max !== s.max)) { mudou = true; return { ...p, min: s.min, max: s.max }; }
      return p;
    });
    if (mudou) setProdutos(next);
  }, [produtos, saidas, prefs.autoMinMax, setProdutos]);

  // ── Hidratação (cache → rede) + tempo real + offline ───────
  useEffect(() => {
    if (!rid) {
      // sem sessão: volta aos valores padrão
      setProdutosRaw(CAT.produtos); setCategoriasRaw(CAT.categorias);
      setPessoasRaw(CAT.pessoas); setDestinosRaw(CAT.destinos);
      setFichasRaw(CAT.fichas); setPrefsRaw(CAT.prefs);
      setComprasRaw([]); setEntradasRaw([]); setSaidasRaw([]);
      setAparasRaw([]); setDesperdicioRaw([]); setAjustesRaw([]); setAuditoriaRaw([]);
      return;
    }
    let ativo = true;

    // 1) cache instantâneo (funciona offline)
    setProdutosRaw(cacheGet(rid, 'produtos', CAT.produtos));
    setCategoriasRaw(cacheGet(rid, 'categorias', CAT.categorias));
    setPessoasRaw(cacheGet(rid, 'pessoas', CAT.pessoas));
    setDestinosRaw(cacheGet(rid, 'destinos', CAT.destinos));
    setFichasRaw(cacheGet(rid, 'fichas', CAT.fichas));
    // prefs = restaurante (nuvem) + aparelho (local), mescladas
    setPrefsRaw({ ...cacheGet(rid, 'prefs', CAT.prefs), ...cacheGet(rid, '_prefs_device', {}) });
    setComprasRaw(cacheGet(rid, 'compras', []));
    setEntradasRaw(cacheGet(rid, 'entradas', []));
    setSaidasRaw(cacheGet(rid, 'saidas', []));
    setAparasRaw(cacheGet(rid, 'aparas', []));
    setDesperdicioRaw(cacheGet(rid, 'desperdicio', []));
    setAjustesRaw(cacheGet(rid, 'ajustes', []));
    setAuditoriaRaw(cacheGet(rid, 'auditoria', []));

    // sobe pendências acumuladas offline
    const flush = async () => {
      const fila = outboxGet(rid);
      if (!fila.length) return;
      const restantes = [];
      for (const item of fila) {
        try {
          let error = null;
          if (item.kind === 'registro' && item.op === 'insert')
            ({ error } = await supabase.from('registros').upsert(item.payload));
          else if (item.kind === 'registro' && item.op === 'delete')
            ({ error } = await supabase.from('registros').update({ deleted: true }).eq('id', item.payload.id));
          else if (item.kind === 'doc' && item.op === 'upsert')
            ({ error } = await supabase.from('documentos').upsert(item.payload));
          else if (item.kind === 'clearAll')
            ({ error } = await supabase.from('registros').update({ deleted: true }).eq('restaurante_id', rid).neq('tipo', 'auditoria'));
          if (error) restantes.push(item);
        } catch { restantes.push(item); }
      }
      outboxSet(rid, restantes);
    };

    // 2) rede (fonte da verdade)
    (async () => {
      const { data: docs } = await supabase.from('documentos').select('*').eq('restaurante_id', rid);
      if (!ativo) return;
      const mapa = {};
      (docs || []).forEach(d => { mapa[d.chave] = d.dados; });
      const aplicaCat = (chave, setRaw, def) => {
        if (mapa[chave] !== undefined) { setRaw(mapa[chave]); cacheSet(rid, chave, mapa[chave]); }
        else { // catálogo ainda não existe na nuvem → semeia
          setRaw(def); cacheSet(rid, chave, def);
          // .then() é obrigatório: a query do Supabase só é ENVIADA quando consumida
          supabase.from('documentos')
            .upsert({ restaurante_id: rid, chave, dados: def, updated_at: new Date().toISOString() })
            .then(() => {});
        }
      };
      aplicaCat('produtos', setProdutosRaw, CAT.produtos);
      aplicaCat('categorias', setCategoriasRaw, CAT.categorias);
      aplicaCat('pessoas', setPessoasRaw, CAT.pessoas);
      aplicaCat('destinos', setDestinosRaw, CAT.destinos);
      aplicaCat('fichas', setFichasRaw, CAT.fichas);
      // prefs: parte do restaurante (nuvem) + parte do aparelho (local)
      const prefsNuvem = mapa['prefs'] !== undefined ? mapa['prefs'] : soRestaurante(CAT.prefs);
      if (mapa['prefs'] === undefined) {
        supabase.from('documentos')
          .upsert({ restaurante_id: rid, chave: 'prefs', dados: prefsNuvem, updated_at: new Date().toISOString() })
          .then(() => {});
      }
      cacheSet(rid, 'prefs', prefsNuvem);
      setPrefsRaw({ ...prefsNuvem, ...cacheGet(rid, '_prefs_device', {}) });

      const { data: regs } = await supabase.from('registros').select('*').eq('restaurante_id', rid).eq('deleted', false);
      if (!ativo) return;
      const porTipo = {};
      (regs || []).forEach(r => { (porTipo[r.tipo] = porTipo[r.tipo] || []).push(linhaParaRegistro(r)); });
      const aplicaReg = (tipo, setRaw, key) => {
        const arr = (porTipo[tipo] || []).sort((a, b) => (a.ts || 0) - (b.ts || 0));
        setRaw(arr); cacheSet(rid, key, arr);
      };
      aplicaReg('compra', setComprasRaw, 'compras');
      aplicaReg('entrada', setEntradasRaw, 'entradas');
      aplicaReg('saida', setSaidasRaw, 'saidas');
      aplicaReg('apara', setAparasRaw, 'aparas');
      aplicaReg('perda', setDesperdicioRaw, 'desperdicio');
      aplicaReg('ajuste', setAjustesRaw, 'ajustes');
      aplicaReg('auditoria', setAuditoriaRaw, 'auditoria');

      await flush();
    })();

    // 3) tempo real (sincroniza entre aparelhos)
    const setterReg = {
      compra: [setComprasRaw, 'compras'], entrada: [setEntradasRaw, 'entradas'],
      saida: [setSaidasRaw, 'saidas'], apara: [setAparasRaw, 'aparas'],
      perda: [setDesperdicioRaw, 'desperdicio'], ajuste: [setAjustesRaw, 'ajustes'],
      auditoria: [setAuditoriaRaw, 'auditoria'],
    };
    const setterDoc = {
      produtos: setProdutosRaw, categorias: setCategoriasRaw, pessoas: setPessoasRaw,
      destinos: setDestinosRaw, fichas: setFichasRaw,
    };
    const aplicaRegistroRT = (row) => {
      if (!row) return;
      const alvo = setterReg[row.tipo];
      if (!alvo) return;
      const [setRaw, key] = alvo;
      setRaw(prev => {
        const semEle = prev.filter(x => x.id !== row.id);
        if (row.deleted) { cacheSet(rid, key, semEle); return semEle; }
        const next = [...semEle, linhaParaRegistro(row)].sort((a, b) => (a.ts || 0) - (b.ts || 0));
        cacheSet(rid, key, next);
        return next;
      });
    };
    const aplicaDocRT = (row) => {
      if (!row) return;
      if (row.chave === 'prefs') { // mescla com as preferências locais do aparelho
        cacheSet(rid, 'prefs', row.dados);
        setPrefsRaw({ ...row.dados, ...cacheGet(rid, '_prefs_device', {}) });
        return;
      }
      const setRaw = setterDoc[row.chave];
      if (!setRaw) return;
      setRaw(row.dados);
      cacheSet(rid, row.chave, row.dados);
    };
    const canal = supabase.channel(`rt-${rid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros', filter: `restaurante_id=eq.${rid}` },
        p => aplicaRegistroRT(p.new && Object.keys(p.new).length ? p.new : p.old))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentos', filter: `restaurante_id=eq.${rid}` },
        p => aplicaDocRT(p.new))
      .subscribe();

    // 4) reconexão → sobe pendências
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
      window.removeEventListener('online', onOnline);
    };
  }, [rid]);

  // ── Administração de dados ─────────────────────────────────
  const limparTudo = useCallback(() => {
    const r = ridRef.current;
    [['compras', setComprasRaw], ['entradas', setEntradasRaw], ['saidas', setSaidasRaw],
     ['aparas', setAparasRaw], ['desperdicio', setDesperdicioRaw], ['ajustes', setAjustesRaw]]
      .forEach(([key, setRaw]) => { setRaw([]); cacheSet(r, key, []); });
    if (r) supabase.from('registros').update({ deleted: true }).eq('restaurante_id', r).neq('tipo', 'auditoria')
      .then(({ error }) => { if (error) outboxAdd(r, { kind: 'clearAll', op: 'clearAll', payload: {} }); });
    logAudit('apagou todos os registros', 'compras, entradas, saídas, aparas, perdas e contagens');
  }, [logAudit]);

  const resetarProdutos = useCallback(() => setProdutos(PRODUTOS_INICIAIS), [setProdutos]);

  const exportarBackup = useCallback(() => {
    const d = dadosRef.current;
    const dados = {
      versao: 3, exportadoEm: new Date().toISOString(),
      produtos: d.produtos, compras: d.compras, entradas: d.entradas, saidas: d.saidas,
      aparas: d.aparas, desperdicio: d.desperdicio, ajustes: d.ajustes, pessoas: d.pessoas,
      fichas: d.fichas, destinos: d.destinos, categorias: d.categorias, auditoria: d.auditoria, prefs: d.prefs,
    };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_polo_estoque_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importarBackup = useCallback((dados) => {
    if (!dados || typeof dados !== 'object') throw new Error('Arquivo inválido');
    const cat = (chave, setRaw, val) => { if (val) persistCatalogo(chave, setRaw, val); };
    cat('produtos', setProdutosRaw, dados.produtos);
    cat('categorias', setCategoriasRaw, dados.categorias);
    cat('pessoas', setPessoasRaw, dados.pessoas);
    cat('destinos', setDestinosRaw, dados.destinos);
    cat('fichas', setFichasRaw, dados.fichas);
    cat('prefs', setPrefsRaw, dados.prefs);

    const r = ridRef.current;
    const reg = (key, setRaw, tipo, arr) => {
      if (!arr) return;
      setRaw(arr); cacheSet(r, key, arr);
      if (r && arr.length) {
        const rows = arr.map(x => ({ id: x.id, restaurante_id: r, tipo, ts: x.ts || Date.now(), dados: semIdTs(x), deleted: false }));
        supabase.from('registros').upsert(rows).then(() => {});
      }
    };
    reg('compras', setComprasRaw, 'compra', dados.compras);
    reg('entradas', setEntradasRaw, 'entrada', dados.entradas);
    reg('saidas', setSaidasRaw, 'saida', dados.saidas);
    reg('aparas', setAparasRaw, 'apara', dados.aparas);
    reg('desperdicio', setDesperdicioRaw, 'perda', dados.desperdicio);
    reg('ajustes', setAjustesRaw, 'ajuste', dados.ajustes);
    reg('auditoria', setAuditoriaRaw, 'auditoria', dados.auditoria);
  }, [persistCatalogo]);

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
      categorias, setCategorias,
      auditoria, logAudit,
      restaurarRegistro,
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
