import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PRODUTOS_BASE, PESSOAS_BASE, DESTINOS_APARA, CATEGORIAS_BASE } from '../data/produtos';
import { FICHAS_BASE } from '../data/fichas';
import { gerarDemoSeed } from '../data/demo';
import { calcSugestoesMinMax, DIAS_MIN, DIAS_MAX } from '../utils/sugestoes';
import { calcEstoquePuro } from '../utils/estoque';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet, outboxGet, outboxSet, outboxAdd, outboxCount, outboxMortos } from '../lib/cache';
import { registrarFalha, ressuscitar } from '../utils/outbox';

// Valores iniciais (usados ao criar um restaurante novo / sem internet no 1º uso)
const CAT = {
  produtos:   PRODUTOS_BASE,
  categorias: CATEGORIAS_BASE,
  pessoas:    PESSOAS_BASE,
  destinos:   DESTINOS_APARA,
  fichas:     FICHAS_BASE,
  producoes:  [],
  locais:     [{ id: 'salao', nome: 'Salão' }], // destinos de saída (editáveis em Config)
  // Itens adicionados manualmente à lista de compras (ex.: faltantes de uma
  // produção planejada). Cada item: { id, nome, unidade, quantidade, origem }
  listaManual: [],
  // Etiquetas avulsas: itens FORA do estoque que a cozinha etiqueta mesmo assim
  // (ex.: "Leite aberto"). Cada item: { id, nome, tipoData: 'fabricacao'|'abertura', diasValidade }
  etiquetasAvulsas: [],
  prefs:      { responsavel: '', turno: 'Manhã', destino: '', guia: true },
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

// Avisa a UI quando uma escrita do usuário é barrada pelo modo suporte (somente
// leitura), para não exibir um "sucesso" enganoso ao super-admin (AUR-SUP-002).
const avisaBloqueioLeitura = () => { try { window.dispatchEvent(new Event('escrita-bloqueada')); } catch { /* sem window (SSR/teste) */ } };

// Modo demonstração: rid 'demo' NUNCA fala com o Supabase — tudo fica só no
// cache local do navegador (apagado ao sair). Retorna o rid quando é de nuvem.
const nuvemDe = (r) => (r && r !== 'demo' ? r : null);

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { sessao, impersonando } = useAuth() || {};
  // Em modo suporte, o super-admin carrega o restaurante impersonado em SOMENTE
  // LEITURA — nada é escrito na conta do cliente (o RLS também bloqueia).
  const rid = impersonando?.restauranteId || sessao?.restauranteId || null;
  // Modo suporte: somente leitura, EXCETO quando o cliente autorizou "ver e
  // editar" (24h) — aí o RLS (migration7) também libera a escrita do super-admin.
  const soLeitura = !!impersonando && !impersonando.podeMexer;

  // ── Estado (hidratado do cache → rede) ─────────────────────
  const [produtos,    setProdutosRaw]    = useState(CAT.produtos);
  const [categorias,  setCategoriasRaw]  = useState(CAT.categorias);
  const [pessoas,     setPessoasRaw]     = useState(CAT.pessoas);
  const [destinos,    setDestinosRaw]    = useState(CAT.destinos);
  const [fichas,      setFichasRaw]      = useState(CAT.fichas);
  const [producoes,   setProducoesRaw]   = useState(CAT.producoes);
  const [locais,      setLocaisRaw]      = useState(CAT.locais);
  const [listaManual, setListaManualRaw] = useState(CAT.listaManual);
  const [etiquetasAvulsas, setEtiquetasAvulsasRaw] = useState(CAT.etiquetasAvulsas);
  const [prefs,       setPrefsRaw]       = useState(CAT.prefs);
  const [compras,     setComprasRaw]     = useState([]);
  const [entradas,    setEntradasRaw]    = useState([]);
  const [saidas,      setSaidasRaw]      = useState([]);
  const [aparas,      setAparasRaw]      = useState([]);
  const [desperdicio, setDesperdicioRaw] = useState([]);
  const [ajustes,     setAjustesRaw]     = useState([]);
  const [auditoria,   setAuditoriaRaw]   = useState([]);
  // Observabilidade da sincronização: nº de operações na fila offline + status de rede.
  const [pendencias,  setPendencias]     = useState(0);
  const [mortos,      setMortos]         = useState([]); // itens que falharam demais (erro permanente)
  const [online,      setOnline]         = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  // refs estáveis para callbacks não dependerem de closures velhas.
  // A atribuição DURANTE o render é deliberada: os callbacks (useCallback [])
  // precisam ler o valor do render corrente mesmo antes dos efeitos rodarem —
  // mover para useEffect deixaria uma janela de valor velho no primeiro uso.
  /* eslint-disable react-hooks/refs -- espelho síncrono de estado em ref (padrão fundacional deste contexto) */
  const ridRef = useRef(rid); ridRef.current = rid;
  const sessaoRef = useRef(sessao); sessaoRef.current = sessao;
  const soLeituraRef = useRef(soLeitura); soLeituraRef.current = soLeitura;
  const dadosRef = useRef({});
  dadosRef.current = { produtos, categorias, pessoas, destinos, fichas, producoes, locais, listaManual, etiquetasAvulsas, prefs, compras, entradas, saidas, aparas, desperdicio, ajustes, auditoria };
  /* eslint-enable react-hooks/refs */

  // Só lê refs (estáveis) — identidade fixa para entrar nos deps dos callbacks.
  const nomeProduto = useCallback((id) => dadosRef.current.produtos.find(p => p.id === id)?.nome || id, []);

  // ── Resumos para a auditoria ───────────────────────────────
  const resumoItens = useCallback((r) => (r.itens || []).map(i => `${i.quantidade} ${nomeProduto(i.produtoId)}`).join(', '), [nomeProduto]);
  const RESUMOS = useMemo(() => ({
    compra: (r) => `${r.quantidade} ${r.unidade} de ${r.item}${r.fornecedor ? ` (${r.fornecedor})` : ''}`,
    entrada: (r) => resumoItens(r),
    'saída': (r) => `${resumoItens(r)} → ${r.destino === 'producao' ? 'Produção' : (dadosRef.current.locais.find(l => l.id === r.destino)?.nome || r.destino)}`,
    apara: (r) => `${r.quantidade} ${r.unidade} de ${r.item} → ${r.destinoOutro || r.destino}`,
    perda: (r) => `${r.quantidade} ${r.unidade} de ${r.item} (motivo ${r.motivoOutro || r.motivo}${r.origem === 'estoque' ? ', abateu estoque' : ''})`,
    'contagem física': (r) => `${nomeProduto(r.produtoId)} → ${r.quantidade}`,
  }), [resumoItens, nomeProduto]);

  // ── Trilha de auditoria (registro tipo 'auditoria') ────────
  const logAudit = useCallback((acao, detalhe = '') => {
    if (soLeituraRef.current) return; // modo suporte = só leitura
    const r = ridRef.current;
    const reg = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      usuario: sessaoRef.current?.nome || '—',
      cargo: sessaoRef.current?.cargo || '',
      acao, detalhe,
    };
    setAuditoriaRaw(prev => {
      const next = [...(prev || []).slice(-1999), reg];
      if (r) cacheSet(r, 'auditoria', next);
      return next;
    });
    if (!nuvemDe(r)) return;
    const row = { id: reg.id, restaurante_id: r, tipo: 'auditoria', ts: reg.ts, dados: semIdTs(reg), deleted: false };
    supabase.from('registros').insert(row).then(({ error }) => {
      if (error) outboxAdd(r, { kind: 'registro', op: 'insert', payload: row });
    });
  }, []);

  // ── Catálogos (documentos JSONB, 1 linha por lista) ────────
  // Versão conhecida de cada documento (anti-sobrescrita entre 2 tablets —
  // migração 8). Atualizada na hidratação, no realtime e a cada gravação ok.
  const versoesRef = useRef({});

  // Gravação versionada: o servidor compara a versão que ESTE aparelho conhece.
  // Conflito (outro tablet gravou antes) → aplicamos o conteúdo vigente aqui e
  // avisamos, em vez de sobrescrever o trabalho do outro em silêncio.
  const salvarDocNuvem = useCallback((r, chave, dadosDoc, aplicarServidor) => {
    const payload = { restaurante_id: r, chave, dados: dadosDoc, updated_at: new Date().toISOString() };
    supabase.rpc('salvar_documento', { p_restaurante: r, p_chave: chave, p_dados: dadosDoc, p_versao: versoesRef.current[chave] ?? 0 })
      .then(({ data, error }) => {
        if (error) {
          // migração 8 não rodada → caminho antigo (upsert); erro de rede → fila offline
          if (/salvar_documento|function|does not exist|schema cache|not find/i.test(error.message || '')) {
            supabase.from('documentos').upsert(payload).then(({ error: e2 }) => {
              if (e2) outboxAdd(r, { kind: 'doc', op: 'upsert', payload });
            });
          } else {
            outboxAdd(r, { kind: 'doc', op: 'upsert', payload });
          }
          return;
        }
        if (data?.ok) { versoesRef.current[chave] = data.versao; return; }
        if (data?.conflito) {
          versoesRef.current[chave] = data.versao;
          aplicarServidor?.(data.dados);
          try { window.dispatchEvent(new CustomEvent('catalogo-conflito', { detail: { chave } })); } catch { /* sem window */ }
        }
      });
  }, []);

  const persistCatalogo = useCallback((chave, setRaw, valor) => {
    if (soLeituraRef.current) { avisaBloqueioLeitura(); return; } // modo suporte = só leitura
    setRaw(valor);
    const r = ridRef.current;
    cacheSet(r, chave, valor);
    if (!nuvemDe(r)) return;
    salvarDocNuvem(r, chave, valor, (dadosSrv) => { setRaw(dadosSrv); cacheSet(r, chave, dadosSrv); });
  }, [salvarDocNuvem]);

  const setProdutos   = useCallback((v) => persistCatalogo('produtos',   setProdutosRaw,   v), [persistCatalogo]);
  const setCategorias = useCallback((v) => persistCatalogo('categorias', setCategoriasRaw, v), [persistCatalogo]);
  const setDestinos   = useCallback((v) => persistCatalogo('destinos',   setDestinosRaw,   v), [persistCatalogo]);
  const setFichas     = useCallback((v) => persistCatalogo('fichas',     setFichasRaw,     v), [persistCatalogo]);
  const setProducoes  = useCallback((v) => persistCatalogo('producoes',  setProducoesRaw,  v), [persistCatalogo]);
  const setLocais     = useCallback((v) => persistCatalogo('locais',     setLocaisRaw,     v), [persistCatalogo]);
  const setListaManual = useCallback((v) => persistCatalogo('listaManual', setListaManualRaw, v), [persistCatalogo]);
  const setEtiquetasAvulsas = useCallback((v) => persistCatalogo('etiquetasAvulsas', setEtiquetasAvulsasRaw, v), [persistCatalogo]);

  const setPref = useCallback((chave, valor) => {
    if (soLeituraRef.current) { avisaBloqueioLeitura(); return; } // modo suporte = só leitura
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
      if (nuvemDe(r)) {
        salvarDocNuvem(r, 'prefs', restPrefs, (dadosSrv) => {
          cacheSet(r, 'prefs', dadosSrv);
          setPrefsRaw({ ...dadosSrv, ...cacheGet(r, '_prefs_device', {}) });
        });
      }
    }
  }, [salvarDocNuvem]);

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
    if (soLeituraRef.current) { avisaBloqueioLeitura(); return; } // modo suporte = só leitura
    const r = ridRef.current;
    const novo = { ...registro, id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, ts: Date.now() };
    setRaw(prev => {
      const next = [...prev, novo];
      cacheSet(r, key, next);
      return next;
    });
    if (nuvemDe(r)) {
      const row = { id: novo.id, restaurante_id: r, tipo, ts: novo.ts, dados: semIdTs(novo), deleted: false };
      supabase.from('registros').insert(row).then(({ error }) => {
        if (error) outboxAdd(r, { kind: 'registro', op: 'insert', payload: row });
      });
    }
    logAudit(`registrou ${ROTULO[tipo]}`, RESUMOS[ROTULO[tipo]]?.(novo) || '');
  }, [logAudit, RESUMOS]);

  const removeRegistro = useCallback((tipo, setRaw, key, id) => {
    if (soLeituraRef.current) { avisaBloqueioLeitura(); return; } // modo suporte = só leitura
    const r = ridRef.current;
    const alvo = dadosRef.current[key].find(x => x.id === id);
    setRaw(prev => {
      const next = prev.filter(x => x.id !== id);
      cacheSet(r, key, next);
      return next;
    });
    if (nuvemDe(r)) {
      supabase.from('registros').update({ deleted: true }).eq('id', id).then(({ error }) => {
        if (error) outboxAdd(r, { kind: 'registro', op: 'delete', payload: { id } });
      });
    }
    if (alvo) logAudit(`removeu ${ROTULO[tipo]}`, RESUMOS[ROTULO[tipo]]?.(alvo) || '');
  }, [logAudit, RESUMOS]);

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
  const MAPA_RESTAURO = useMemo(() => ({
    compra:  [setComprasRaw,     'compras',     'compra',  'compra'],
    entrada: [setEntradasRaw,    'entradas',    'entrada', 'entrada'],
    saida:   [setSaidasRaw,      'saidas',      'saida',   'saída'],
    apara:   [setAparasRaw,      'aparas',      'apara',   'apara'],
    perda:   [setDesperdicioRaw, 'desperdicio', 'perda',   'perda'],
    ajuste:  [setAjustesRaw,     'ajustes',     'ajuste',  'contagem física'],
  }), []);
  const restaurarRegistro = useCallback((tipoApi, registro) => {
    if (soLeituraRef.current) { avisaBloqueioLeitura(); return; } // modo suporte = só leitura
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
    if (nuvemDe(r)) {
      const row = { id: registro.id, restaurante_id: r, tipo, ts: registro.ts, dados: semIdTs(registro), deleted: false };
      supabase.from('registros').upsert(row).then(({ error }) => {
        if (error) outboxAdd(r, { kind: 'registro', op: 'insert', payload: row });
      });
    }
    logAudit(`restaurou ${rotulo} (desfazer)`, RESUMOS[rotulo]?.(registro) || '');
  }, [logAudit, MAPA_RESTAURO, RESUMOS]);

  // ── Pendências de sincronização (badge offline) ───────────
  useEffect(() => {
    const atualiza = () => {
      setPendencias(rid ? outboxCount(rid) : 0);
      setMortos(rid ? outboxMortos(rid) : []);
    };
    atualiza();
    const onOnline = () => { setOnline(true); atualiza(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('outbox-mudou', atualiza);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('outbox-mudou', atualiza);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [rid]);

  // ── Fila morta: tentar de novo / descartar (erro permanente de sincronização) ──
  const retentarMortos = useCallback(() => {
    if (!rid) return;
    // ressuscita (zera _morto/_tentativas) e dispara uma nova sincronização
    outboxSet(rid, outboxGet(rid).map(i => i._morto ? ressuscitar(i) : i));
    try { window.dispatchEvent(new Event('forcar-sync')); } catch { /* sem window */ }
  }, [rid]);
  const descartarMortos = useCallback(() => {
    if (!rid) return;
    outboxSet(rid, outboxGet(rid).filter(i => !i._morto));
  }, [rid]);

  // ── Estoque (calculado uma vez, partilhado por todos os componentes) ─
  const estoque = useMemo(
    () => calcEstoquePuro({ produtos, entradas, saidas, ajustes, desperdicio }),
    [produtos, entradas, saidas, ajustes, desperdicio]
  );

  // Migração única: copia gramatura/coccao de fichas para os produtos correspondentes
  const gramigrRef = useRef(false);
  useEffect(() => {
    if (gramigrRef.current || prefs.gramaturasMigradas) { gramigrRef.current = true; return; }
    if (!fichas.length || !produtos.length) return;
    gramigrRef.current = true;
    let mudou = false;
    const next = produtos.map(p => {
      if (p.gramatura) return p;
      const nome = p.nome.toLowerCase().trim();
      const ficha = fichas.find(f => f.materiaPrima.toLowerCase().trim() === nome);
      if (!ficha) return p;
      mudou = true;
      return { ...p, gramatura: ficha.gramatura, coccao: parseFloat(ficha.coccao) || 0 };
    });
    if (mudou) setProdutos(next);
    setPref('gramaturasMigradas', true);
  }, [fichas, produtos, prefs.gramaturasMigradas, setProdutos, setPref]);

  // Modo automático mín/máx
  // Usa saidas como trigger principal; produtos via ref para não criar loop de re-render.
  // O ref é atualizado em efeito (não durante o render) e o recálculo é debounced para
  // evitar tempestade de writes entre tablets quando uma saída chega via realtime.
  const produtosAutoRef = useRef(null);
  useEffect(() => { produtosAutoRef.current = produtos; }, [produtos]);
  useEffect(() => {
    if (!prefs.autoMinMax) return;
    const t = setTimeout(() => {
      const prods = produtosAutoRef.current;
      if (!prods) return;
      const sug = calcSugestoesMinMax(prods, saidas, undefined, prefs.diasMin || DIAS_MIN, prefs.diasMax || DIAS_MAX, prefs.minMaxPorDiaSemana);
      let mudou = false;
      const next = prods.map(p => {
        const s = sug[p.id];
        if (s && (p.min !== s.min || p.max !== s.max)) { mudou = true; return { ...p, min: s.min, max: s.max }; }
        return p;
      });
      if (mudou) setProdutos(next);
    }, 1500);
    return () => clearTimeout(t);
  }, [saidas, prefs.autoMinMax, prefs.diasMin, prefs.diasMax, prefs.minMaxPorDiaSemana, setProdutos]);

  // ── Hidratação (cache → rede) + tempo real + offline ───────
  // O setState síncrono neste efeito é o coração do offline-first: o cache
  // local precisa aparecer no primeiro paint pós-login (antes da rede).
  /* eslint-disable react-hooks/set-state-in-effect -- hidratação síncrona do cache é intencional */
  useEffect(() => {
    if (!rid) {
      // sem sessão: volta aos valores padrão
      setProdutosRaw(CAT.produtos); setCategoriasRaw(CAT.categorias);
      setPessoasRaw(CAT.pessoas); setDestinosRaw(CAT.destinos);
      setFichasRaw(CAT.fichas); setProducoesRaw(CAT.producoes); setLocaisRaw(CAT.locais); setListaManualRaw(CAT.listaManual); setEtiquetasAvulsasRaw(CAT.etiquetasAvulsas); setPrefsRaw(CAT.prefs);
      setComprasRaw([]); setEntradasRaw([]); setSaidasRaw([]);
      setAparasRaw([]); setDesperdicioRaw([]); setAjustesRaw([]); setAuditoriaRaw([]);
      return;
    }

    // MODO DEMONSTRAÇÃO: semeia os dados de exemplo e PARA aqui — nada de
    // rede, realtime nem fila offline. O rascunho do visitante fica no cache
    // pe::demo::* (apagado no logout pelo AuthContext).
    if (rid === 'demo') {
      const seed = gerarDemoSeed();
      const c = seed.catalogos, g = seed.registros;
      setProdutosRaw(cacheGet(rid, 'produtos', c.produtos));
      setCategoriasRaw(cacheGet(rid, 'categorias', c.categorias));
      setPessoasRaw(cacheGet(rid, 'pessoas', c.pessoas));
      setDestinosRaw(cacheGet(rid, 'destinos', c.destinos));
      setFichasRaw(cacheGet(rid, 'fichas', c.fichas));
      setProducoesRaw(cacheGet(rid, 'producoes', c.producoes));
      setLocaisRaw(cacheGet(rid, 'locais', c.locais));
      setListaManualRaw(cacheGet(rid, 'listaManual', c.listaManual));
      setEtiquetasAvulsasRaw(cacheGet(rid, 'etiquetasAvulsas', c.etiquetasAvulsas));
      setPrefsRaw(cacheGet(rid, 'prefs', c.prefs));
      setComprasRaw(cacheGet(rid, 'compras', g.compras));
      setEntradasRaw(cacheGet(rid, 'entradas', g.entradas));
      setSaidasRaw(cacheGet(rid, 'saidas', g.saidas));
      setAparasRaw(cacheGet(rid, 'aparas', g.aparas));
      setDesperdicioRaw(cacheGet(rid, 'desperdicio', g.desperdicio));
      setAjustesRaw(cacheGet(rid, 'ajustes', g.ajustes));
      setAuditoriaRaw(cacheGet(rid, 'auditoria', g.auditoria));
      return;
    }
    let ativo = true;

    // 1) cache instantâneo (funciona offline)
    setProdutosRaw(cacheGet(rid, 'produtos', CAT.produtos));
    setCategoriasRaw(cacheGet(rid, 'categorias', CAT.categorias));
    setPessoasRaw(cacheGet(rid, 'pessoas', CAT.pessoas));
    setDestinosRaw(cacheGet(rid, 'destinos', CAT.destinos));
    setFichasRaw(cacheGet(rid, 'fichas', CAT.fichas));
    setProducoesRaw(cacheGet(rid, 'producoes', CAT.producoes));
    setLocaisRaw(cacheGet(rid, 'locais', CAT.locais));
    setListaManualRaw(cacheGet(rid, 'listaManual', CAT.listaManual));
    setEtiquetasAvulsasRaw(cacheGet(rid, 'etiquetasAvulsas', CAT.etiquetasAvulsas));
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
      if (soLeituraRef.current) return; // modo suporte: não sobe nada para a conta do cliente
      const fila = outboxGet(rid);
      if (!fila.length) return;
      const restantes = [];
      for (const item of fila) {
        // Itens mortos (falharam MAX vezes) não são retentados no loop normal;
        // ficam na fila para a lista de erro permanente / retry manual.
        if (item._morto) { restantes.push(item); continue; }
        try {
          let error = null;
          if (item.kind === 'registro' && item.op === 'insert')
            ({ error } = await supabase.from('registros').upsert(item.payload));
          else if (item.kind === 'registro' && item.op === 'delete')
            ({ error } = await supabase.from('registros').update({ deleted: true }).eq('id', item.payload.id));
          else if (item.kind === 'doc' && item.op === 'upsert') {
            // replay offline: RPC com versão -1 (força com bump — mantém o
            // contador coerente); fallback pro upsert se a migração 8 faltar
            const { error: eRpc } = await supabase.rpc('salvar_documento', {
              p_restaurante: item.payload.restaurante_id, p_chave: item.payload.chave,
              p_dados: item.payload.dados, p_versao: -1,
            });
            if (eRpc && /salvar_documento|does not exist|schema cache|not find/i.test(eRpc.message || '')) {
              ({ error } = await supabase.from('documentos').upsert(item.payload));
            } else {
              error = eRpc;
            }
          }
          else if (item.kind === 'clearAll')
            ({ error } = await supabase.from('registros').update({ deleted: true }).eq('restaurante_id', rid).neq('tipo', 'auditoria'));
          // sucesso → não repõe; falha → conta a tentativa (vira morto no limite)
          if (error) restantes.push(registrarFalha({ ...item, _ultimoErro: error.message || 'erro' }));
        } catch (e) { restantes.push(registrarFalha({ ...item, _ultimoErro: e?.message || 'erro' })); }
      }
      outboxSet(rid, restantes);
    };

    // 2) rede (fonte da verdade). IMPORTANTE: se a busca FALHAR (rede/RLS), NÃO
    // sobrescrevemos os catálogos locais — senão um erro transitório jogaria os
    // produtos/fichas do cliente de volta aos valores padrão (e ainda os semearia
    // no banco). Também não rebaixamos um catálogo com alteração local ainda não
    // sincronizada (pendência no outbox).
    (async () => {
      const docsPendentes = new Set(
        outboxGet(rid).filter(i => i.kind === 'doc' && i.payload?.chave).map(i => i.payload.chave)
      );
      const { data: docs, error: errDocs } = await supabase.from('documentos').select('*').eq('restaurante_id', rid);
      if (!ativo) return;
      if (errDocs) {
        console.warn('[hidratação] falha ao buscar catálogos — mantendo o cache local (não sobrescreve com padrões):', errDocs.message);
      } else {
        const mapa = {};
        versoesRef.current = {}; // recomeça o controle de versão para este restaurante
        (docs || []).forEach(d => { mapa[d.chave] = d.dados; versoesRef.current[d.chave] = d.versao || 0; });
        const aplicaCat = (chave, setRaw, def) => {
          if (docsPendentes.has(chave)) return; // alteração local não sincronizada → não rebaixa
          if (mapa[chave] !== undefined) { setRaw(mapa[chave]); cacheSet(rid, chave, mapa[chave]); }
          else { // catálogo ainda não existe na nuvem → semeia (versionado)
            setRaw(def); cacheSet(rid, chave, def);
            if (soLeituraRef.current) return; // modo suporte: não escreve na conta do cliente
            salvarDocNuvem(rid, chave, def, (dadosSrv) => { setRaw(dadosSrv); cacheSet(rid, chave, dadosSrv); });
          }
        };
        aplicaCat('produtos', setProdutosRaw, CAT.produtos);
        aplicaCat('categorias', setCategoriasRaw, CAT.categorias);
        aplicaCat('pessoas', setPessoasRaw, CAT.pessoas);
        aplicaCat('destinos', setDestinosRaw, CAT.destinos);
        aplicaCat('fichas', setFichasRaw, CAT.fichas);
        aplicaCat('producoes', setProducoesRaw, CAT.producoes);
        aplicaCat('locais', setLocaisRaw, CAT.locais);
        aplicaCat('listaManual', setListaManualRaw, CAT.listaManual);
        aplicaCat('etiquetasAvulsas', setEtiquetasAvulsasRaw, CAT.etiquetasAvulsas);
        // prefs: parte do restaurante (nuvem) + parte do aparelho (local)
        if (!docsPendentes.has('prefs')) {
          const prefsNuvem = mapa['prefs'] !== undefined ? mapa['prefs'] : soRestaurante(CAT.prefs);
          if (mapa['prefs'] === undefined && !soLeituraRef.current) {
            salvarDocNuvem(rid, 'prefs', prefsNuvem, () => {});
          }
          cacheSet(rid, 'prefs', prefsNuvem);
          setPrefsRaw({ ...prefsNuvem, ...cacheGet(rid, '_prefs_device', {}) });
        }
      }

      const { data: regs, error: errRegs } = await supabase.from('registros').select('*').eq('restaurante_id', rid).eq('deleted', false);
      if (!ativo) return;
      if (!errRegs) {
        const porTipo = {};
        (regs || []).forEach(r => { (porTipo[r.tipo] = porTipo[r.tipo] || []).push(linhaParaRegistro(r)); });
        const aplicaReg = (tipo, setRaw, key) => {
          const arr = (porTipo[tipo] || []).sort((a, b) => (a.ts || 0) - (b.ts || 0));
          setRaw(prev => {
            const fetchedIds = new Set(arr.map(x => x.id));
            const localOnly = prev.filter(x => !fetchedIds.has(x.id));
            const merged = localOnly.length
              ? [...arr, ...localOnly].sort((a, b) => (a.ts || 0) - (b.ts || 0))
              : arr;
            cacheSet(rid, key, merged);
            return merged;
          });
        };
        aplicaReg('compra', setComprasRaw, 'compras');
        aplicaReg('entrada', setEntradasRaw, 'entradas');
        aplicaReg('saida', setSaidasRaw, 'saidas');
        aplicaReg('apara', setAparasRaw, 'aparas');
        aplicaReg('perda', setDesperdicioRaw, 'desperdicio');
        aplicaReg('ajuste', setAjustesRaw, 'ajustes');
        aplicaReg('auditoria', setAuditoriaRaw, 'auditoria');
      }

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
      destinos: setDestinosRaw, fichas: setFichasRaw, producoes: setProducoesRaw, locais: setLocaisRaw, listaManual: setListaManualRaw,
      etiquetasAvulsas: setEtiquetasAvulsasRaw,
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
      // outro aparelho gravou: a versão dele passa a ser a que conhecemos
      if (row.chave) versoesRef.current[row.chave] = row.versao || 0;
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

    // 4) reconexão / retry manual → sobe pendências
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    window.addEventListener('forcar-sync', onOnline);

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('forcar-sync', onOnline);
    };
  }, [rid, salvarDocNuvem]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Administração de dados ─────────────────────────────────
  const limparTudo = useCallback(() => {
    if (soLeituraRef.current) { avisaBloqueioLeitura(); return; } // modo suporte = só leitura
    const r = ridRef.current;
    [['compras', setComprasRaw], ['entradas', setEntradasRaw], ['saidas', setSaidasRaw],
     ['aparas', setAparasRaw], ['desperdicio', setDesperdicioRaw], ['ajustes', setAjustesRaw]]
      .forEach(([key, setRaw]) => { setRaw([]); cacheSet(r, key, []); });
    if (nuvemDe(r)) supabase.from('registros').update({ deleted: true }).eq('restaurante_id', r).neq('tipo', 'auditoria')
      .then(({ error }) => { if (error) outboxAdd(r, { kind: 'clearAll', op: 'clearAll', payload: {} }); });
    logAudit('apagou todos os registros', 'compras, entradas, saídas, aparas, perdas e contagens');
  }, [logAudit]);

  const resetarProdutos = useCallback(() => setProdutos(PRODUTOS_BASE), [setProdutos]);

  const exportarBackup = useCallback(() => {
    const d = dadosRef.current;
    const dados = {
      versao: 3, exportadoEm: new Date().toISOString(),
      produtos: d.produtos, compras: d.compras, entradas: d.entradas, saidas: d.saidas,
      aparas: d.aparas, desperdicio: d.desperdicio, ajustes: d.ajustes, pessoas: d.pessoas,
      fichas: d.fichas, producoes: d.producoes, locais: d.locais, listaManual: d.listaManual, etiquetasAvulsas: d.etiquetasAvulsas, destinos: d.destinos, categorias: d.categorias, auditoria: d.auditoria, prefs: d.prefs,
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
    if (soLeituraRef.current) throw new Error('Modo suporte é somente leitura — não é possível importar dados.');
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
      throw new Error('Arquivo inválido: não é um backup do Aurum Cozinha.');
    }
    // 1) Valida TODAS as chaves ANTES de aplicar qualquer coisa (evita restauração pela metade).
    const listas = ['produtos', 'categorias', 'pessoas', 'destinos', 'fichas', 'producoes', 'locais', 'listaManual', 'etiquetasAvulsas',
                    'compras', 'entradas', 'saidas', 'aparas', 'desperdicio', 'ajustes', 'auditoria'];
    for (const k of listas) {
      if (dados[k] != null && !Array.isArray(dados[k])) {
        throw new Error(`Arquivo inválido: "${k}" deveria ser uma lista.`);
      }
    }
    if (dados.prefs != null && (typeof dados.prefs !== 'object' || Array.isArray(dados.prefs))) {
      throw new Error('Arquivo inválido: "prefs" deveria ser um objeto.');
    }
    // Exige pelo menos uma chave reconhecível para não aceitar um JSON qualquer.
    if (![...listas, 'prefs'].some(k => dados[k] != null)) {
      throw new Error('Arquivo inválido: nenhum dado reconhecido neste backup.');
    }

    // 2) Aplica (catálogos primeiro, depois registros).
    const cat = (chave, setRaw, val) => { if (val) persistCatalogo(chave, setRaw, val); };
    cat('produtos', setProdutosRaw, dados.produtos);
    cat('categorias', setCategoriasRaw, dados.categorias);
    cat('pessoas', setPessoasRaw, dados.pessoas);
    cat('destinos', setDestinosRaw, dados.destinos);
    cat('fichas', setFichasRaw, dados.fichas);
    cat('producoes', setProducoesRaw, dados.producoes);
    cat('locais', setLocaisRaw, dados.locais);
    cat('listaManual', setListaManualRaw, dados.listaManual);
    cat('etiquetasAvulsas', setEtiquetasAvulsasRaw, dados.etiquetasAvulsas);
    cat('prefs', setPrefsRaw, dados.prefs);

    const r = ridRef.current;
    // RESTAURAÇÃO REAL: o backup SUBSTITUI o estado atual. Sem este soft-delete
    // prévio, registros atuais que não estão no backup voltariam "zumbis" na
    // próxima hidratação (o upsert sozinho não os remove). Auditoria fica de
    // fora: é imutável no banco (insert-only) e registra a própria restauração.
    if (nuvemDe(r)) {
      supabase.from('registros').update({ deleted: true }).eq('restaurante_id', r).neq('tipo', 'auditoria')
        .then(({ error }) => { if (error) outboxAdd(r, { kind: 'clearAll', op: 'clearAll', payload: {} }); });
    }
    const reg = (key, setRaw, tipo, arr, sobeNuvem = true) => {
      if (!arr) return;
      setRaw(arr); cacheSet(r, key, arr);
      if (sobeNuvem && nuvemDe(r) && arr.length) {
        const rows = arr.map(x => ({ id: x.id, restaurante_id: r, tipo, ts: x.ts || Date.now(), dados: semIdTs(x), deleted: false }));
        supabase.from('registros').upsert(rows).then(({ error }) => {
          // Falha ao subir (offline/erro): enfileira para reenviar ao reconectar,
          // em vez de só logar — senão a restauração parece concluída sem persistir.
          if (error) rows.forEach(row => outboxAdd(r, { kind: 'registro', op: 'insert', payload: row }));
        });
      }
    };
    reg('compras', setComprasRaw, 'compra', dados.compras);
    reg('entradas', setEntradasRaw, 'entrada', dados.entradas);
    reg('saidas', setSaidasRaw, 'saida', dados.saidas);
    reg('aparas', setAparasRaw, 'apara', dados.aparas);
    reg('desperdicio', setDesperdicioRaw, 'perda', dados.desperdicio);
    reg('ajustes', setAjustesRaw, 'ajuste', dados.ajustes);
    // auditoria NÃO sobe: o RLS bloqueia UPDATE de auditoria (imutável) — o upsert
    // de linhas já existentes falharia e entupiria o outbox em retries eternos.
    reg('auditoria', setAuditoriaRaw, 'auditoria', dados.auditoria, false);
    logAudit('restaurou backup', `${(dados.entradas || []).length + (dados.saidas || []).length + (dados.compras || []).length} registros`);
  }, [persistCatalogo, logAudit]);

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
      producoes, setProducoes,
      locais, setLocais,
      listaManual, setListaManual,
      etiquetasAvulsas, setEtiquetasAvulsas,
      destinos, setDestinos,
      categorias, setCategorias,
      auditoria, logAudit,
      restaurarRegistro,
      prefs, setPref,
      estoque,
      limparTudo, resetarProdutos,
      exportarBackup, importarBackup,
      soLeitura,
      pendencias, online,
      mortos, retentarMortos, descartarMortos,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
