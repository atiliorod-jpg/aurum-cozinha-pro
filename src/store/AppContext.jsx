import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PRODUTOS_BASE, PESSOAS_BASE, DESTINOS_APARA, CATEGORIAS_BASE } from '../data/produtos';
import { FICHAS_BASE } from '../data/fichas';
import { gerarDemoSeed } from '../data/demo';
import { calcSugestoesMinMax, DIAS_MIN, DIAS_MAX } from '../utils/sugestoes';
import { consumoComoSaidas } from '../utils/turno';
import { conciliarAuditoria } from '../utils/auditoria';
import { calcEstoquePuro } from '../utils/estoque';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet, outboxGet, outboxSet, outboxAdd, outboxCount, outboxMortos, outboxGarantirUids } from '../lib/cache';
import { registrarFalha, ressuscitar, ehErroDefinitivo } from '../utils/outbox';
import { MODULO_PADRAO, moduloValido, chaveModulo, tipoModulo, lerTipo, ehTipoGlobal, catalogoDe, mesclarFixos, tipoBase, temRecurso, ehIdInstancia } from '../utils/modulos';
import { listarEstoques, moduloUtilizavel, acharEstoque, locaisPadrao } from '../utils/instancias';
import { CATEGORIAS_BIBLIOTECA } from '../data/bibliotecaEtiquetas';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../utils/produto';
import { comMetas, separarMetas, fatiarPorEstoque, visaoDoEstoque, comprasQueEntram } from '../utils/visaoEstoque';
import { SECO_BASE, SECO_CATEGORIAS } from '../data/seco';

// Valores iniciais (usados ao criar um restaurante novo / sem internet no 1º uso)
const CAT = {
  produtos:   PRODUTOS_BASE,
  categorias: CATEGORIAS_BASE,
  pessoas:    PESSOAS_BASE,
  destinos:   DESTINOS_APARA,
  fichas:     FICHAS_BASE,
  producoes:  [],
  // Destinos de saída (editáveis em Config). "Cozinha de Finalização" é FIXO:
  // enviar para ele é o que faz o item aparecer como recebimento do outro lado.
  locais:     [
    { id: 'finalizacao', nome: 'Cozinha de Finalização', fixo: true },
    { id: 'salao', nome: 'Salão' },
  ],
  // Itens adicionados manualmente à lista de compras (ex.: faltantes de uma
  // produção planejada). Cada item: { id, nome, unidade, quantidade, origem }
  listaManual: [],
  // Etiquetas avulsas: itens FORA do estoque que a cozinha etiqueta mesmo assim
  // (ex.: "Leite aberto"). Cada item: { id, nome, tipoData: 'fabricacao'|'abertura', diasValidade }
  etiquetasAvulsas: [],
  // Etiquetas FÍSICAS já impressas (uma por pote), com id de lote e status.
  // Fica em catálogo (não em registros) porque os registros são carregados
  // TODOS a cada abertura do app — milhares de etiquetas ali dentro deixariam
  // o start lento no tablet. Aqui o histórico é podado (ver podarEtiquetas).
  etiquetasImpressas: [],
  // Matriz de permissões da equipe. Chave PRÓPRIA (não dentro de prefs) porque
  // a migração 18 só deixa a DIRETORIA gravar `permissoes` — dentro de prefs
  // qualquer membro reescrevia a matriz que o restringia.
  permissoes: {},
  // Tabela de custos: { <produtoId>: { custo, unidade, em, fornecedor } }.
  // Chave PRÓPRIA e da conta (sem namespace de módulo), protegida pela
  // migração 20 — quem não tem `verFinanceiro` simplesmente NÃO RECEBE esta
  // linha do servidor. Por isso o padrão é {} e nunca uma exceção: para essa
  // pessoa o app funciona igual, só sem número de dinheiro.
  precos: {},
  // Registro dos estoques criados pelo dono. As TRÊS raízes não entram aqui:
  // são sintetizadas na leitura, então conta que nunca criou instância não tem
  // documento nenhum e não há o que migrar. Só a diretoria grava (migração 22).
  estoques: {},
  prefs:      { responsavel: '', turno: 'Manhã', destino: '', guia: true },
};

// Padrões de catálogo POR MÓDULO. O seco tem itens e categorias próprios e não
// usa receita/produção — quem abre o módulo pela primeira vez vê exemplos do
// seu ramo, não filé e molho.
const catalogosPadrao = (mod, soEtiquetas = false) => {
  // ⚠️ Plano Aurum Etiquetas começa com "Meus itens" VAZIO, e isso é regra do
  // produto. Semear o catálogo de exemplo aqui entregaria ao cliente uma lista
  // de carnes que não é dele — ele teria que APAGAR item por item antes de
  // cadastrar o que realmente usa, que é o oposto de facilitar. Quem preenche
  // é a biblioteca de itens prontos (data/bibliotecaEtiquetas.js), item a
  // item, com a ficha aberta para conferência.
  // As CATEGORIAS vêm da biblioteca: sem elas o primeiro cadastro não teria
  // onde classificar o item, e classificar é requisito desta tela.
  if (soEtiquetas) {
    return { ...CAT, produtos: [], categorias: [...CATEGORIAS_BIBLIOTECA], fichas: [], producoes: [], listaManual: [] };
  }
  return mod === 'seco'
    ? { ...CAT, produtos: SECO_BASE, categorias: SECO_CATEGORIAS, fichas: [], producoes: [], listaManual: [] }
    : CAT;
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

// O servidor recusou em DEFINITIVO e o lançamento foi desfeito. A UI escuta e
// mostra — este app tem histórico de mostrar sucesso quando o banco recusou, e
// esse é o evento que quebra o silêncio.
const avisaErroDefinitivo = (msg) => {
  try { window.dispatchEvent(new CustomEvent('registro-recusado', { detail: msg })); }
  catch { /* sem window (SSR/teste) */ }
};

// Modo demonstração: rid 'demo' NUNCA fala com o Supabase — tudo fica só no
// cache local do navegador (apagado ao sair). Retorna o rid quando é de nuvem.
const nuvemDe = (r) => (r && r !== 'demo' ? r : null);

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { sessao, impersonando } = useAuth() || {};
  // Produto contratado — decide se o catalogo nasce vazio (plano Etiquetas).
  const soEtiq = ehSoEtiquetas(produtoAtivo(sessao, impersonando));
  // Em modo suporte, o super-admin carrega o restaurante impersonado em SOMENTE
  // LEITURA — nada é escrito na conta do cliente (o RLS também bloqueia).
  const rid = impersonando?.restauranteId || sessao?.restauranteId || null;
  // Modo suporte: somente leitura, EXCETO quando o cliente autorizou "ver e
  // editar" (24h) — aí o RLS (migration7) também libera a escrita do super-admin.
  const soLeitura = !!impersonando && !impersonando.podeMexer;

  // ── Estado (hidratado do cache → rede) ─────────────────────
  const [produtosCat, setProdutosRaw]    = useState(CAT.produtos); // catálogo COMPARTILHADO
  const [categorias,  setCategoriasRaw]  = useState(CAT.categorias);
  const [pessoas,     setPessoasRaw]     = useState(CAT.pessoas);
  const [destinos,    setDestinosRaw]    = useState(CAT.destinos);
  const [fichas,      setFichasRaw]      = useState(CAT.fichas);
  const [producoes,   setProducoesRaw]   = useState(CAT.producoes);
  const [locais,      setLocaisRaw]      = useState(CAT.locais);
  const [listaManual, setListaManualRaw] = useState(CAT.listaManual);
  const [etiquetasAvulsas, setEtiquetasAvulsasRaw] = useState(CAT.etiquetasAvulsas);
  const [etiquetasImpressas, setEtiquetasImpressasRaw] = useState(CAT.etiquetasImpressas);
  const [permissoes, setPermissoesRaw] = useState(CAT.permissoes);
  const [precos,      setPrecosRaw]      = useState(CAT.precos);
  const [estoquesDoc, setEstoquesDocRaw] = useState(CAT.estoques);
  // mín/máx DESTE estoque, sobrepostos ao catálogo compartilhado (Fase 3)
  const [metas,       setMetasRaw]       = useState({});
  const [prefs,       setPrefsRaw]       = useState(CAT.prefs);
  const [compras,     setComprasRaw]     = useState([]);
  const [entradas,    setEntradasRaw]    = useState([]);
  const [saidas,      setSaidasRaw]      = useState([]);
  const [aparas,      setAparasRaw]      = useState([]);
  const [desperdicio, setDesperdicioRaw] = useState([]);
  const [ajustes,     setAjustesRaw]     = useState([]);
  const [auditoria,   setAuditoriaRaw]   = useState([]);
  // Recebimentos da finalização = saídas da produção com destino Finalização.
  // Derivado, nunca gravado: a produção é a dona do registro.
  const [recebimentos, setRecebimentosRaw] = useState([]);
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
  const flushandoRef = useRef(false); // impede dois flushes simultâneos (mount + 'online')

  // ── Módulo ativo (multi-cozinha) ───────────────────────────
  // Qual estoque está aberto: produção, seco… Fica por APARELHO (quem só
  // trabalha no seco já abre nele), não na nuvem.
  const [modulo, setModuloRaw] = useState(() => {
    try {
      const salvo = localStorage.getItem('pe::modulo');
      return moduloValido(salvo) ? salvo : MODULO_PADRAO;
    } catch { return MODULO_PADRAO; }
  });
  // Lista completa dos estoques: as três raízes (sintetizadas) + as instâncias
  // que o dono criou. Derivada, nunca gravada — ver utils/instancias.js.
  const estoques = useMemo(() => listarEstoques(estoquesDoc), [estoquesDoc]);

  // ⚠️ O id do estoque aberto fica no APARELHO. Um tablet levado para outra
  // unidade abriria o estoque de lá; e um id ARQUIVADO continuaria passando na
  // validação de formato, deixando a pessoa operar um estoque que ninguém mais
  // vê. Aqui ele é corrigido para a raiz do tipo — a tela avisa (ver Layout).
  // ⚠️ NO PLANO ETIQUETAS O MÓDULO É SEMPRE O PADRÃO, e isto é correção de bug
  // real, não zelo. O módulo aberto mora no localStorage DO APARELHO
  // (`pe::modulo`). Quem já tinha usado o app completo naquele navegador ficava
  // com 'seco' salvo — e o Estoque Seco tem `armazenamento: false`, porque
  // mantimento não vai para câmara fria. Resultado no plano Etiquetas, que não
  // tem seletor de estoque para a pessoa corrigir:
  //   • o seletor de congelado/resfriado SUMIA da tela de impressão;
  //   • a etiqueta saía SEM a linha do armazenamento;
  //   • o prazo caía no ramo "prateleira única" de diasDoCadastro.
  // Tudo em silêncio, e sem caminho de volta. Foi assim que o dono viu.
  const moduloEfetivo = useMemo(
    () => (soEtiq ? MODULO_PADRAO : moduloUtilizavel(estoques, modulo)),
    [estoques, modulo, soEtiq]);
  const estoqueAtual = useMemo(() => acharEstoque(estoques, moduloEfetivo), [estoques, moduloEfetivo]);

  // ⚠️ NÃO colocar `estoques` nas deps do efeito de hidratação. Ele é um array
  // NOVO a cada mudança de `estoquesDoc`, e o próprio efeito grava esse estado
  // (o ramo demo lê do cache, que devolve objeto novo toda vez) — cada volta
  // gerava um objeto novo e disparava a próxima: laço infinito de render, que
  // no tablet trava o app. A chave abaixo é uma STRING e só muda quando algo
  // que o efeito realmente usa muda: quais finalizações existem e como se
  // chamam (é o que vira destino de saída).
  const chaveDestinos = useMemo(
    () => estoques.filter(e => e.tipo === 'finalizacao' && !e.arquivado).map(e => `${e.id}:${e.nome}`).join('|'),
    [estoques],
  );
  const estoquesRef = useRef(estoques); estoquesRef.current = estoques;

  const moduloRef = useRef(moduloEfetivo); moduloRef.current = moduloEfetivo;
  // Mesmo padrao do moduloRef: o produto so muda com troca de sessao, e por-lo
  // nas deps da hidratacao faria o app re-hidratar a toa.
  const soEtiqRef = useRef(soEtiq); soEtiqRef.current = soEtiq;
  const setModulo = useCallback((id) => {
    if (!moduloValido(id)) return;
    try { localStorage.setItem('pe::modulo', id); } catch { /* storage indisponível */ }
    setModuloRaw(id);
  }, []);
  // k() = chave de catálogo/cache do módulo ativo; t() = tipo do registro.
  // No módulo padrão os dois devolvem o valor original — é o que mantém os
  // dados de quem já usa o app exatamente onde sempre estiveram.
  const k = useCallback((chave) => chaveModulo(moduloRef.current, chave), []);
  // Tipos que pertencem AO MÓDULO ABERTO. "Apagar todos os registros" e a
  // restauração de backup usavam só restaurante_id e varriam os outros
  // estoques junto — quem limpasse o Seco levava a Produção inteira.
  const tiposDoModulo = useCallback(
    () => ['compra', 'entrada', 'saida', 'apara', 'perda', 'ajuste'].map(x => tipoModulo(moduloRef.current, x)),
    []);
  // kc() = chave de CATÁLOGO. A finalização não cadastra produto: ela lê o
  // catálogo da produção, senão o mesmo semiacabado teria ids diferentes dos
  // dois lados e a ponte nunca casaria.
  const kc = useCallback((chave) => chaveModulo(catalogoDe(moduloRef.current), chave), []);
  const t = useCallback((tipo) => tipoModulo(moduloRef.current, tipo), []);
  // ── O que o app inteiro enxerga como `produtos` ────────────
  // Catálogo COMPARTILHADO entre estoques do mesmo tipo + as METAS deste
  // estoque. É o ponto único de injeção: os oito consumidores de p.min/p.max
  // (calculos, analise, NavBar, Dashboard, Compras, Producao, sugestoes)
  // continuam iguais, sem uma linha alterada.
  const produtos = useMemo(() => comMetas(produtosCat, metas), [produtosCat, metas]);

  // Dados CRUS da última hidratação — o cliente já baixa tudo da conta e antes
  // jogava fora o que não era do estoque aberto. Guardar permite a Administração
  // mostrar o relatório de outro estoque SEM trocar o que está aberto, e o
  // balanço consolidado somar todos. Custo zero de rede.
  // ESTADO, não ref: o cálculo das visões acontece no render, e ler ref durante
  // o render quebra no modo concorrente do React (o lint pega). Muda só na
  // hidratação, então não custa render extra.
  const [brutos, setBrutos] = useState({ registros: [], docs: {} });

  const dadosRef = useRef({});
  // ⚠️ produtosCat e metas PRECISAM estar aqui: setProdutos lê os dois deste
  // espelho. Sem eles, separarMetas recebia (undefined, lista, undefined),
  // devolvia sempre { catalogo: <lista com mín/máx dentro>, metas: null }, e o
  // documento `metas` nunca era gravado — o mín/máx de um restaurante ia para a
  // chave compartilhada por tipo e sobrescrevia o do outro, em silêncio.
  dadosRef.current = { produtos, produtosCat, metas, categorias, pessoas, destinos, fichas, producoes, locais, listaManual, etiquetasAvulsas, prefs, compras, entradas, saidas, aparas, desperdicio, ajustes, auditoria };
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
    // A trilha é gravada por RPC (migração 18): o `usuario`/`cargo` da linha
    // definitiva vem do BANCO, não daqui. Antes a linha era montada no
    // navegador e dava para forjar uma entrada assinada pela diretoria — e,
    // como a policy proíbe apagar auditoria, ninguém conseguia removê-la.
    // O objeto local acima continua valendo só para a tela responder na hora.
    supabase.rpc('registrar_auditoria', { p_acao: acao, p_detalhe: detalhe || null })
      .then(({ error }) => {
        if (error) outboxAdd(r, { kind: 'auditoria', op: 'rpc', payload: { acao, detalhe: detalhe || null } });
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

  const persistCatalogo = useCallback((chaveBase, setRaw, valor) => {
    if (soLeituraRef.current) { avisaBloqueioLeitura(); return; } // modo suporte = só leitura
    setRaw(valor);
    const r = ridRef.current;
    // Três escopos diferentes:
    //  • GLOBAIS  → chave crua. A equipe e a matriz de permissões valem para a
    //    CONTA inteira. Namespacear 'permissoes' era grave: 'seco::permissoes'
    //    escapa do filtro da policy (que olha a chave) e qualquer membro
    //    conseguia reescrever a matriz por ali.
    //  • COMPARTILHADOS → chave do módulo de CATÁLOGO (finalização lê o da produção)
    //  • resto → chave do próprio módulo
    const GLOBAIS = ['pessoas', 'permissoes', 'precos', 'estoques'];
    const COMPARTILHADOS = ['produtos', 'categorias', 'fichas'];
    const chave = GLOBAIS.includes(chaveBase) ? chaveBase
      : COMPARTILHADOS.includes(chaveBase) ? kc(chaveBase)
      : k(chaveBase);
    cacheSet(r, chave, valor);
    if (!nuvemDe(r)) return;
    salvarDocNuvem(r, chave, valor, (dadosSrv) => { setRaw(dadosSrv); cacheSet(r, chave, dadosSrv); });
  }, [salvarDocNuvem, k, kc]);

  const setMetas = useCallback((v) => persistCatalogo('metas', setMetasRaw, v), [persistCatalogo]);

  /**
   * PONTO ÚNICO da separação catálogo x metas.
   *
   * Todas as telas continuam chamando setProdutos com a lista inteira, como
   * sempre — Configurações, importação de planilha, sugestão do Dashboard,
   * auto-mín/máx. Se cada uma tivesse que saber da separação, bastava UMA
   * esquecer para gravar o mín do Restaurante Y por cima do X, em silêncio.
   */
  const setProdutos = useCallback((v) => {
    const lista = typeof v === 'function' ? v(dadosRef.current.produtos) : v;
    const { catalogo, metas: novasMetas } =
      separarMetas(dadosRef.current.produtosCat, lista, dadosRef.current.metas);
    if (novasMetas) persistCatalogo('metas', setMetasRaw, novasMetas);
    if (catalogo) persistCatalogo('produtos', setProdutosRaw, catalogo);
  }, [persistCatalogo]);
  const setCategorias = useCallback((v) => persistCatalogo('categorias', setCategoriasRaw, v), [persistCatalogo]);
  const setDestinos   = useCallback((v) => persistCatalogo('destinos',   setDestinosRaw,   v), [persistCatalogo]);
  const setFichas     = useCallback((v) => persistCatalogo('fichas',     setFichasRaw,     v), [persistCatalogo]);
  const setProducoes  = useCallback((v) => persistCatalogo('producoes',  setProducoesRaw,  v), [persistCatalogo]);
  const setLocais     = useCallback((v) => persistCatalogo('locais',     setLocaisRaw,     v), [persistCatalogo]);
  const setListaManual = useCallback((v) => persistCatalogo('listaManual', setListaManualRaw, v), [persistCatalogo]);
  const setEtiquetasAvulsas = useCallback((v) => persistCatalogo('etiquetasAvulsas', setEtiquetasAvulsasRaw, v), [persistCatalogo]);
  const setEtiquetasImpressas = useCallback((v) => persistCatalogo('etiquetasImpressas', setEtiquetasImpressasRaw, v), [persistCatalogo]);
  const setPermissoes = useCallback((v) => persistCatalogo('permissoes', setPermissoesRaw, v), [persistCatalogo]);
  const setPrecos = useCallback((v) => persistCatalogo('precos', setPrecosRaw, v), [persistCatalogo]);
  const setEstoquesDoc = useCallback((v) => persistCatalogo('estoques', setEstoquesDocRaw, v), [persistCatalogo]);

  /**
   * Grava VÁRIAS preferências de uma vez.
   *
   * ⚠️ DUAS CHAMADAS SEGUIDAS DE setPref PERDIAM UMA DAS DUAS, e o sintoma que
   * apareceu foi outro: "Outro tablet alterou as configurações" ao autorizar o
   * suporte remoto, sem tablet nenhum por perto.
   *
   * O motivo: `dadosRef.current` é preenchido no RENDER. Duas chamadas no mesmo
   * clique leem o MESMO prefs antigo, então a segunda monta o objeto sem a
   * mudança da primeira — e as duas sobem para a nuvem disputando a mesma
   * versão do documento. Uma é recusada, o app recarrega a versão do servidor,
   * e o valor perdido é justamente o que não venceu a corrida.
   *
   * No suporte remoto isso não era cosmético: `suporteAtivo` e
   * `suportePermissao` são gravados juntos, e o painel da Aurum lê os dois do
   * servidor. Perder o segundo faz a tela do cliente dizer "autorizado a
   * editar" enquanto o painel vê só leitura.
   */
  const setPrefs = useCallback((patch) => {
    if (soLeituraRef.current) { avisaBloqueioLeitura(); return; }
    const r = ridRef.current;
    const next = { ...dadosRef.current.prefs, ...patch };
    setPrefsRaw(next);
    // Uma gravação por destino, mesmo quando o patch mistura os dois tipos de
    // chave: as de aparelho não sobem, as do restaurante sobem juntas.
    const chaves = Object.keys(patch);
    if (chaves.some(k => PREFS_APARELHO.includes(k))) cacheSet(r, '_prefs_device', soAparelho(next));
    if (chaves.some(k => !PREFS_APARELHO.includes(k))) {
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
      cacheSet(r, k(key), next);
      return next;
    });
    if (nuvemDe(r)) {
      // tipo com o módulo embutido ('seco:entrada') — é o que separa os estoques
      const row = { id: novo.id, restaurante_id: r, tipo: t(tipo), ts: novo.ts, dados: semIdTs(novo), deleted: false };
      supabase.from('registros').insert(row).then(({ error }) => {
        if (!error) return;
        // ⚠️ ERRO DEFINITIVO NÃO VAI PARA A FILA. Violação de constraint (tipo
        // de estoque que o banco não conhece, coluna inexistente) NUNCA passa
        // numa nova tentativa — enfileirar só adia a má notícia enquanto a tela
        // já mostrou o toast verde. Foi assim que o Estoque Seco passou semanas
        // gravando só no tablet: o app dizia "salvo", o banco recusava, e o item
        // ficava preso na fila em silêncio.
        //
        // Aqui a gente DESFAZ o lançamento otimista e conta o que houve. Mentir
        // sobre sucesso é pior que dar erro.
        if (ehErroDefinitivo(error.message)) {
          setRaw(prev => {
            const next = prev.filter(x => x.id !== novo.id);
            cacheSet(r, k(key), next);
            return next;
          });
          avisaErroDefinitivo(error.message);
          return;
        }
        outboxAdd(r, { kind: 'registro', op: 'insert', payload: row });
      });
    }
    logAudit(`registrou ${ROTULO[tipo]}`, RESUMOS[ROTULO[tipo]]?.(novo) || '');
  }, [logAudit, RESUMOS, k, t]);

  const removeRegistro = useCallback((tipo, setRaw, key, id) => {
    if (soLeituraRef.current) { avisaBloqueioLeitura(); return; } // modo suporte = só leitura
    const r = ridRef.current;
    const alvo = dadosRef.current[key].find(x => x.id === id);
    setRaw(prev => {
      const next = prev.filter(x => x.id !== id);
      cacheSet(r, k(key), next);
      return next;
    });
    if (nuvemDe(r)) {
      supabase.from('registros').update({ deleted: true }).eq('id', id).then(({ error }) => {
        if (error) outboxAdd(r, { kind: 'registro', op: 'delete', payload: { id } });
      });
    }
    if (alvo) logAudit(`removeu ${ROTULO[tipo]}`, RESUMOS[ROTULO[tipo]]?.(alvo) || '');
  }, [logAudit, RESUMOS, k]);

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
      cacheSet(r, k(key), next);
      return next;
    });
    if (nuvemDe(r)) {
      // o "desfazer" tem que devolver o registro AO MÓDULO DE ONDE SAIU: sem o
      // t(), apagar uma entrada no Estoque Seco e desfazer ressuscitava ela
      // dentro da Cozinha de Produção, inflando o estoque errado.
      const row = { id: registro.id, restaurante_id: r, tipo: t(tipo), ts: registro.ts, dados: semIdTs(registro), deleted: false };
      supabase.from('registros').upsert(row).then(({ error }) => {
        if (error) outboxAdd(r, { kind: 'registro', op: 'insert', payload: row });
      });
    }
    logAudit(`restaurou ${rotulo} (desfazer)`, RESUMOS[rotulo]?.(registro) || '');
  }, [logAudit, MAPA_RESTAURO, RESUMOS, k, t]);

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

  // ── Consumo, para quem não tem tela de saída ───────────────
  //
  // A Cozinha de Finalização não registra prato a prato: o consumo dela nasce da
  // diferença entre o disponível e a sobra contada no fechamento de turno.
  // Convertido para o formato de saída, ele alimenta média diária, previsão de
  // ruptura e sugestão de mín/máx SEM duplicar nenhuma dessas contas — e é o que
  // destrava o auto-mín/máx, que estava desligado lá por falta de `saidas`.
  const saidasParaConsumo = useMemo(
    () => (temRecurso(moduloEfetivo, 'saidas') ? saidas : consumoComoSaidas(ajustes)),
    [moduloEfetivo, saidas, ajustes],
  );

  // ── Estoque (calculado uma vez, partilhado por todos os componentes) ─
  // ⚠️ `recebimentos` PRECISA entrar. A Cozinha de Finalização não tem tela de
  // entrada: tudo o que chega nela vem da Produção, como recebimento. Sem esta
  // lista o estoque dela ficava sempre ZERADO — a bancada recebia 20 porções e
  // a tela mostrava 0, o que também derrubava alertas e mín/máx.
  const estoque = useMemo(
    () => calcEstoquePuro({
      produtos,
      // `comprasQueEntram` só devolve algo onde a compra É a entrada (Seco).
      entradas: [...entradas, ...recebimentos, ...comprasQueEntram(moduloEfetivo, compras)],
      saidas, ajustes, desperdicio,
    }),
    [produtos, entradas, recebimentos, compras, moduloEfetivo, saidas, ajustes, desperdicio]
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
  const saidasRef = useRef([]);
  useEffect(() => { produtosAutoRef.current = produtos; }, [produtos]);
  useEffect(() => { saidasRef.current = saidasParaConsumo; }, [saidasParaConsumo]);
  useEffect(() => {
    if (!prefs.autoMinMax) return;
    const t = setTimeout(() => {
      const prods = produtosAutoRef.current;
      if (!prods) return;
      // `saidasParaConsumo`: na Finalização isto é o consumo apurado no
      // fechamento de turno. Com lista vazia calcSugestoesMinMax devolve {} e
      // nada é gravado — a trava que existia aqui deixou de ser necessária.
      const sug = calcSugestoesMinMax(prods, saidasRef.current, undefined, prefs.diasMin || DIAS_MIN, prefs.diasMax || DIAS_MAX, prefs.minMaxPorDiaSemana);
      let mudou = false;
      const next = prods.map(p => {
        const s = sug[p.id];
        // `Number.isFinite` não é paranoia: com min/max NaN a comparação
        // `p.min !== s.min` é SEMPRE verdadeira (NaN nunca é igual a NaN), então
        // o efeito gravava o catálogo a cada ciclo sem nunca convergir, e o
        // produto com NaN sumia da lista de compras. A raiz está corrigida em
        // calcSugestoesMinMax; isto impede que qualquer nova fonte de NaN
        // chegue ao catálogo de novo.
        if (!s || !Number.isFinite(s.min) || !Number.isFinite(s.max)) return p;
        if (p.min !== s.min || p.max !== s.max) { mudou = true; return { ...p, min: s.min, max: s.max }; }
        return p;
      });
      if (mudou) setProdutos(next);
    }, 1500);
    return () => clearTimeout(t);
  }, [saidasParaConsumo, prefs.autoMinMax, prefs.diasMin, prefs.diasMax, prefs.minMaxPorDiaSemana, setProdutos]);

  // ── Hidratação (cache → rede) + tempo real + offline ───────
  // O setState síncrono neste efeito é o coração do offline-first: o cache
  // local precisa aparecer no primeiro paint pós-login (antes da rede).
  /* eslint-disable react-hooks/set-state-in-effect -- hidratação síncrona do cache é intencional */
  useEffect(() => {
    if (!rid) {
      // sem sessão: volta aos valores padrão
      setProdutosRaw(CAT.produtos); setCategoriasRaw(CAT.categorias);
      setPessoasRaw(CAT.pessoas); setDestinosRaw(CAT.destinos);
      setFichasRaw(CAT.fichas); setProducoesRaw(CAT.producoes); setLocaisRaw(CAT.locais); setListaManualRaw(CAT.listaManual); setEtiquetasAvulsasRaw(CAT.etiquetasAvulsas); setEtiquetasImpressasRaw(CAT.etiquetasImpressas); setPrefsRaw(CAT.prefs);
      setComprasRaw([]); setEntradasRaw([]); setSaidasRaw([]);
      setAparasRaw([]); setDesperdicioRaw([]); setAjustesRaw([]); setAuditoriaRaw([]); setRecebimentosRaw([]);
      return;
    }

    // MODO DEMONSTRAÇÃO: semeia os dados de exemplo e PARA aqui — nada de
    // rede, realtime nem fila offline. O rascunho do visitante fica no cache
    // pe::demo::* (apagado no logout pelo AuthContext).
    if (rid === 'demo') {
      // Seed DO MÓDULO ABERTO, e cache pelas MESMAS chaves do app real
      // (k()/kc()). Antes eram chaves cruas — 'produtos', 'compras' — então o
      // Estoque Seco da demo mostrava picanha e filé mignon, e o que o
      // visitante lançava "no Seco" reaparecia na "Produção", porque os três
      // módulos gravavam no mesmo lugar. kc() mantém a Finalização lendo o
      // catálogo da Produção, que é o comportamento correto.
      const seed = gerarDemoSeed(tipoBase(moduloEfetivo));
      // ⚠️ A demo do plano Etiquetas comeca com "Meus itens" VAZIO, igual a uma
      // conta nova de verdade. E de proposito: e assim que o cliente vai
      // receber o app, e a demonstracao que vende e justamente buscar na
      // biblioteca, conferir a ficha e imprimir em poucos toques. Mostrar um
      // catalogo de carnes que nao e dele venderia uma tela que ele nunca vera.
      // As categorias ficam, senao o primeiro cadastro nao tem onde classificar.
      const c = soEtiqRef.current
        ? { ...seed.catalogos, produtos: [], categorias: [...CATEGORIAS_BIBLIOTECA], etiquetasAvulsas: [] }
        : seed.catalogos;
      // O seed de movimentos vale só para a instância RAIZ. Uma instância criada
      // pelo visitante tem que começar VAZIA — herdar as entradas e saídas de
      // exemplo da raiz faria dois estoques distintos mostrarem o mesmo
      // movimento, que é justamente o contrário do que a tela quer ensinar.
      const g = ehIdInstancia(moduloEfetivo) ? {} : seed.registros;
      setProdutosRaw(cacheGet(rid, kc('produtos'), c.produtos));
      setMetasRaw(cacheGet(rid, k('metas'), {}));   // mín/máx desta instância
      setCategoriasRaw(cacheGet(rid, kc('categorias'), c.categorias));
      setPessoasRaw(cacheGet(rid, 'pessoas', c.pessoas)); // equipe é da conta
      setDestinosRaw(cacheGet(rid, k('destinos'), c.destinos));
      setFichasRaw(cacheGet(rid, kc('fichas'), c.fichas));
      setProducoesRaw(cacheGet(rid, k('producoes'), c.producoes));
      setLocaisRaw(cacheGet(rid, k('locais'), c.locais));
      setListaManualRaw(cacheGet(rid, k('listaManual'), c.listaManual));
      setEtiquetasAvulsasRaw(cacheGet(rid, k('etiquetasAvulsas'), c.etiquetasAvulsas));
      setEtiquetasImpressasRaw(cacheGet(rid, k('etiquetasImpressas'), []));
      setPrefsRaw(cacheGet(rid, 'prefs', c.prefs)); // prefs é da conta, não do módulo
      setComprasRaw(cacheGet(rid, k('compras'), g.compras || []));
      setEntradasRaw(cacheGet(rid, k('entradas'), g.entradas || []));
      setSaidasRaw(cacheGet(rid, k('saidas'), g.saidas || []));
      setAparasRaw(cacheGet(rid, k('aparas'), g.aparas || []));
      setDesperdicioRaw(cacheGet(rid, k('desperdicio'), g.desperdicio || []));
      setAjustesRaw(cacheGet(rid, k('ajustes'), g.ajustes || []));
      setRecebimentosRaw(cacheGet(rid, k('recebimentos'), g.recebimentos || []));
      setAuditoriaRaw(cacheGet(rid, 'auditoria', g.auditoria || [])); // auditoria é da conta
      // Documentos da CONTA que o ramo demo também precisa ler do cache, senão
      // o visitante cria um estoque e ele desaparece no recarregar — a queda
      // para a raiz funciona (a proteção está certa), mas parece bug.
      setEstoquesDocRaw(cacheGet(rid, 'estoques', {}));
      setPermissoesRaw(cacheGet(rid, 'permissoes', {}));
      setPrecosRaw(cacheGet(rid, 'precos', {}));

      // A demo não passa pela rede, então não existe "bruto" vindo do servidor —
      // e sem ele o Balanço e os seletores de visão da Administração ficariam
      // vazios justamente onde o visitante explora o app. Aqui os brutos são
      // MONTADOS a partir do cache de cada estoque, no mesmo formato que a
      // hidratação real produz.
      const LISTA_PARA_TIPO = {
        compras: 'compra', entradas: 'entrada', saidas: 'saida',
        aparas: 'apara', desperdicio: 'perda', ajustes: 'ajuste',
      };
      const regsDemo = [];
      const docsDemo = {};
      // pelo REF, não pelo estado: `estoques` é um array novo a cada mudança e
      // colocá-lo nas deps deste efeito já causou laço infinito de render uma
      // vez (o efeito grava estado que muda o array que dispara o efeito).
      estoquesRef.current.forEach(e => {
        // ⚠️ O SEED entra como queda, igual à hidratação do estoque aberto.
        // O seed alimenta o estado por fallback do cacheGet mas NÃO é gravado
        // no cache, e este laço lia só o cache — então a operação mostrava as
        // compras de exemplo e a Administração não mostrava nenhuma. Na demo,
        // que é a tela de venda do app, isso fazia o relatório parecer quebrado.
        const seedE = ehIdInstancia(e.id) ? {} : gerarDemoSeed(tipoBase(e.id)).registros;
        Object.entries(LISTA_PARA_TIPO).forEach(([lista, tipo]) => {
          cacheGet(rid, chaveModulo(e.id, lista), seedE[lista] || []).forEach(reg => {
            const { id, ts, ...dados } = reg;
            regsDemo.push({ id, ts, tipo: tipoModulo(e.id, tipo), dados, deleted: false });
          });
        });
        // catálogo e metas, nas mesmas chaves que visaoDoEstoque procura
        const cCat = chaveModulo(catalogoDe(e.id), 'produtos');
        if (!docsDemo[cCat]) docsDemo[cCat] = cacheGet(rid, cCat, catalogosPadrao(tipoBase(e.id), soEtiqRef.current).produtos);
        const cMetas = chaveModulo(e.id, 'metas');
        docsDemo[cMetas] = cacheGet(rid, cMetas, {});
      });
      setBrutos({ registros: regsDemo, docs: docsDemo });
      return;
    }
    let ativo = true;
    // documentos crus desta hidratação (usados pela visão de outro estoque)
    let mapaDocs = {};

    // 1) cache instantâneo (funciona offline) — tudo pela chave do MÓDULO ativo
    const P = catalogosPadrao(tipoBase(moduloEfetivo), soEtiqRef.current);
    setProdutosRaw(cacheGet(rid, kc('produtos'), P.produtos));
    // metas usam k() (por estoque), NÃO kc() — é justamente o que muda entre
    // instâncias do mesmo tipo
    setMetasRaw(cacheGet(rid, k('metas'), {}));
    setCategoriasRaw(cacheGet(rid, kc('categorias'), P.categorias));
    setPessoasRaw(cacheGet(rid, 'pessoas', P.pessoas)); // equipe é do restaurante, não do módulo
    setDestinosRaw(cacheGet(rid, k('destinos'), P.destinos));
    setFichasRaw(cacheGet(rid, kc('fichas'), P.fichas));
    setProducoesRaw(cacheGet(rid, k('producoes'), P.producoes));
    // Os destinos FIXOS vêm do registro de estoques, não do CAT: uma
    // finalização criada hoje precisa virar destino também nas contas que já
    // têm o documento `locais` gravado (o semeador só roda quando ele não
    // existe). É o mesmo buraco que mesclarFixos foi criada para tapar.
    const LOC = locaisPadrao(P.locais, estoquesRef.current, moduloEfetivo);
    setLocaisRaw(mesclarFixos(cacheGet(rid, k('locais'), LOC), LOC));
    setListaManualRaw(cacheGet(rid, k('listaManual'), P.listaManual));
    setEtiquetasAvulsasRaw(cacheGet(rid, k('etiquetasAvulsas'), P.etiquetasAvulsas));
    setEtiquetasImpressasRaw(cacheGet(rid, k('etiquetasImpressas'), P.etiquetasImpressas));
    setPermissoesRaw(cacheGet(rid, 'permissoes', {}));
    setPrecosRaw(cacheGet(rid, 'precos', {}));
    setEstoquesDocRaw(cacheGet(rid, 'estoques', {}));
    // prefs = restaurante (nuvem) + aparelho (local), mescladas. NÃO é por
    // módulo: etiqueta, estabelecimento e responsável valem para a conta toda.
    setPrefsRaw({ ...cacheGet(rid, 'prefs', P.prefs), ...cacheGet(rid, '_prefs_device', {}) });
    setComprasRaw(cacheGet(rid, k('compras'), []));
    setEntradasRaw(cacheGet(rid, k('entradas'), []));
    setSaidasRaw(cacheGet(rid, k('saidas'), []));
    setAparasRaw(cacheGet(rid, k('aparas'), []));
    setDesperdicioRaw(cacheGet(rid, k('desperdicio'), []));
    setAjustesRaw(cacheGet(rid, k('ajustes'), []));
    setRecebimentosRaw(cacheGet(rid, k('recebimentos'), []));
    setAuditoriaRaw(cacheGet(rid, 'auditoria', [])); // auditoria é do restaurante

    // sobe pendências acumuladas offline
    const flush = async () => {
      if (soLeituraRef.current) return; // modo suporte: não sobe nada para a conta do cliente
      if (flushandoRef.current) return; // já tem um flush rodando (mount + evento 'online' juntos)
      flushandoRef.current = true;
      try {
      const fila = outboxGarantirUids(rid);
      if (!fila.length) return;
      // Resultado por ITEM (não por posição): o flush é assíncrono e a cozinha
      // continua salvando durante ele. Reescrever a fila inteira no final
      // apagava o que entrou no meio do caminho.
      const sincronizados = new Set();
      const falhados = new Map();
      for (const item of fila) {
        // Itens mortos (falharam MAX vezes) não são retentados no loop normal;
        // ficam na fila para a lista de erro permanente / retry manual.
        if (item._morto) continue;
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
          else if (item.kind === 'auditoria' && item.op === 'rpc')
            ({ error } = await supabase.rpc('registrar_auditoria', {
              p_acao: item.payload?.acao, p_detalhe: item.payload?.detalhe ?? null,
            }));
          else if (item.kind === 'clearAll')
            // Os tipos vão no PAYLOAD: o replay acontece depois, possivelmente
            // com outro módulo aberto. Sem isso, "apagar tudo" feito offline no
            // Seco voltava e varria a Produção inteira ao reconectar — o mesmo
            // bug que a correção do limparTudo fechou pelo caminho online.
            ({ error } = await supabase.from('registros').update({ deleted: true })
              .eq('restaurante_id', rid)
              .in('tipo', item.payload?.tipos?.length ? item.payload.tipos : ['__nenhum__']));
          // sucesso → sai da fila; falha → conta a tentativa (vira morto no limite)
          if (error) falhados.set(item._uid, registrarFalha({ ...item, _ultimoErro: error.message || 'erro' }));
          else sincronizados.add(item._uid);
        } catch (e) { falhados.set(item._uid, registrarFalha({ ...item, _ultimoErro: e?.message || 'erro' })); }
      }
      // Relê a fila AGORA (pode ter crescido durante os awaits acima) e aplica o
      // resultado item a item — o que entrou no meio do flush continua na fila.
      outboxSet(rid, outboxGet(rid)
        .filter(i => !sincronizados.has(i._uid))
        .map(i => falhados.get(i._uid) || i));
      } finally { flushandoRef.current = false; }
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
        mapaDocs = mapa;
        versoesRef.current = {}; // recomeça o controle de versão para este restaurante
        (docs || []).forEach(d => { mapa[d.chave] = d.dados; versoesRef.current[d.chave] = d.versao || 0; });
        // `reparar` conserta um catálogo que JÁ existe na nuvem. Era o buraco do
        // destino fixo: a semeadura só roda quando o documento não existe, então
        // conta antiga nunca ganhava a "Cozinha de Finalização" e a ponte entre
        // as cozinhas ficava inalcançável pela tela. O conserto sobe para a
        // nuvem, senão valeria só neste aparelho e o outro tablet seguiria sem.
        const aplicaCat = (chave, setRaw, def, reparar) => {
          if (docsPendentes.has(chave)) return; // alteração local não sincronizada → não rebaixa
          if (mapa[chave] !== undefined) {
            const vindo = mapa[chave];
            const corrigido = reparar ? reparar(vindo) : vindo;
            setRaw(corrigido); cacheSet(rid, chave, corrigido);
            // mesclarFixos devolve a MESMA referência quando não muda nada, então
            // isto grava uma vez só — não a cada abertura do app.
            if (corrigido !== vindo && !soLeituraRef.current) {
              salvarDocNuvem(rid, chave, corrigido, (dadosSrv) => { setRaw(dadosSrv); cacheSet(rid, chave, dadosSrv); });
            }
          }
          else { // catálogo ainda não existe na nuvem → semeia (versionado)
            setRaw(def); cacheSet(rid, chave, def);
            if (soLeituraRef.current) return; // modo suporte: não escreve na conta do cliente
            salvarDocNuvem(rid, chave, def, (dadosSrv) => { setRaw(dadosSrv); cacheSet(rid, chave, dadosSrv); });
          }
        };
        // catálogos do MÓDULO ativo (no padrão, k() devolve a chave de sempre)
        aplicaCat(kc('produtos'), setProdutosRaw, P.produtos);
        aplicaCat(k('metas'), setMetasRaw, {});
        aplicaCat(kc('categorias'), setCategoriasRaw, P.categorias);
        aplicaCat('pessoas', setPessoasRaw, P.pessoas); // equipe é do restaurante
        aplicaCat(k('destinos'), setDestinosRaw, P.destinos);
        aplicaCat(kc('fichas'), setFichasRaw, P.fichas);
        aplicaCat(k('producoes'), setProducoesRaw, P.producoes);
        aplicaCat(k('locais'), setLocaisRaw, LOC, (d) => mesclarFixos(d, LOC));
        aplicaCat(k('listaManual'), setListaManualRaw, P.listaManual);
        aplicaCat(k('etiquetasAvulsas'), setEtiquetasAvulsasRaw, P.etiquetasAvulsas);
        aplicaCat(k('etiquetasImpressas'), setEtiquetasImpressasRaw, P.etiquetasImpressas);
        // Compatibilidade: contas antigas têm a matriz dentro de prefs. Lê de lá
        // enquanto a chave nova não existir — sem exigir migração de dados.
        // `precos` pode simplesmente NÃO VIR: a policy da migração 20 não
        // entrega a linha a quem não tem `verFinanceiro`. Ausência aqui é o
        // comportamento esperado, não erro — por isso não semeia nem avisa.
        // ⚠️ E zera o que houver em cache: se a permissão foi retirada, manter
        // o custo antigo no aparelho seria contornar a trava por teimosia do
        // cache local.
        if (mapa['precos'] !== undefined) {
          setPrecosRaw(mapa['precos']); cacheSet(rid, 'precos', mapa['precos']);
        } else {
          setPrecosRaw({}); cacheSet(rid, 'precos', {});
        }
        if (mapa['estoques'] !== undefined) {
          setEstoquesDocRaw(mapa['estoques']); cacheSet(rid, 'estoques', mapa['estoques']);
        }
        if (mapa['permissoes'] !== undefined) {
          setPermissoesRaw(mapa['permissoes']); cacheSet(rid, 'permissoes', mapa['permissoes']);
        } else if (mapa['prefs']?.permissoes) {
          setPermissoesRaw(mapa['prefs'].permissoes); cacheSet(rid, 'permissoes', mapa['prefs'].permissoes);
        }
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
      // Guarda o BRUTO: a Administração precisa mostrar o relatório de outro
      // estoque sem trocar o que está aberto, e o balanço consolidado precisa de
      // todos. O cliente já baixou tudo — antes isto era descartado.
      setBrutos({ registros: regs || [], docs: mapaDocs });
      if (!errRegs) {
        // Agrupa por tipo JÁ separando o módulo: 'seco:entrada' só alimenta o
        // estoque seco. Registro antigo (sem prefixo) cai na produção, que é o
        // comportamento correto para quem já usava o app.
        const porTipo = {};
        (regs || []).forEach(r => {
          const { modulo: mod, tipo } = lerTipo(r.tipo);
          // PONTE PRODUÇÃO → FINALIZAÇÃO: a saída da produção com destino
          // "Cozinha de Finalização" é lida aqui como RECEBIMENTO, sem gravar um
          // segundo registro. Fonte única: se a produção corrigir ou apagar a
          // saída, o recebimento acompanha sozinho — não existe cópia para
          // dessincronizar.
          // PONTE PRODUÇÃO → FINALIZAÇÃO, agora com N finalizações.
          // A comparação é contra a INSTÂNCIA ABERTA, não contra a constante:
          // se fosse contra 'finalizacao', TODA finalização veria a entrega
          // destinada às outras — a cozinha do Restaurante Y contaria como sua
          // a comida enviada para o X. Para a raiz o resultado é idêntico ao de
          // antes, porque as saídas antigas têm destino:'finalizacao'.
          if (tipoBase(moduloEfetivo) === 'finalizacao' && tipoBase(mod) === MODULO_PADRAO && tipo === 'saida') {
            const reg = linhaParaRegistro(r);
            if (reg.destino === moduloEfetivo) {
              (porTipo.recebimento = porTipo.recebimento || []).push(reg);
            }
            return;
          }
          if (!ehTipoGlobal(tipo) && mod !== moduloEfetivo) return; // outro estoque
          (porTipo[tipo] = porTipo[tipo] || []).push(linhaParaRegistro(r));
        });
        const aplicaReg = (tipo, setRaw, key) => {
          const arr = (porTipo[tipo] || []).sort((a, b) => (a.ts || 0) - (b.ts || 0));
          setRaw(prev => {
            const fetchedIds = new Set(arr.map(x => x.id));
            let localOnly = prev.filter(x => !fetchedIds.has(x.id));
            // Auditoria é o único tipo cujo id DEFINITIVO nasce no banco (a RPC
            // da migração 18 gera o dela), então a linha otimista deste aparelho
            // jamais casava por id e a tela mostrava tudo em dobro — inclusive
            // depois de recarregar, porque o merge duplicado ia para o cache.
            if (tipo === 'auditoria') localOnly = conciliarAuditoria(arr, localOnly);
            const merged = localOnly.length
              ? [...arr, ...localOnly].sort((a, b) => (a.ts || 0) - (b.ts || 0))
              : arr;
            cacheSet(rid, key === 'auditoria' ? key : k(key), merged);
            return merged;
          });
        };
        aplicaReg('compra', setComprasRaw, 'compras');
        aplicaReg('entrada', setEntradasRaw, 'entradas');
        aplicaReg('saida', setSaidasRaw, 'saidas');
        aplicaReg('apara', setAparasRaw, 'aparas');
        aplicaReg('perda', setDesperdicioRaw, 'desperdicio');
        aplicaReg('ajuste', setAjustesRaw, 'ajustes');
        aplicaReg('recebimento', setRecebimentosRaw, 'recebimentos');
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
    // Mapa da CHAVE COMPLETA (já namespaceada) para o setter, montado com as
    // MESMAS funções k()/kc() da hidratação. Antes o handler deduzia o
    // namespace na mão, comparando o prefixo com `modulo` — e isso ignorava
    // que produtos/categorias/fichas moram na chave do módulo de CATÁLOGO.
    // Na Finalização, que lê o catálogo da Produção (chave SEM prefixo), todo
    // update de produto vindo de outro tablet caía como "doc de outro módulo"
    // e era descartado. Derivar do mesmo lugar impede os dois caminhos de
    // divergirem de novo.
    const setterDoc = {
      [kc('produtos')]:   setProdutosRaw,
      [k('metas')]:       setMetasRaw,
      [kc('categorias')]: setCategoriasRaw,
      [kc('fichas')]:     setFichasRaw,
      [k('destinos')]:    setDestinosRaw,
      [k('producoes')]:   setProducoesRaw,
      [k('locais')]:      setLocaisRaw,
      [k('listaManual')]: setListaManualRaw,
      [k('etiquetasAvulsas')]:   setEtiquetasAvulsasRaw,
      [k('etiquetasImpressas')]: setEtiquetasImpressasRaw,
      permissoes: setPermissoesRaw, // matriz da equipe: do restaurante, sem namespace
      precos: setPrecosRaw,          // tabela de custos: idem, e só chega a quem pode
      estoques: setEstoquesDocRaw,   // registro dos estoques da conta
    };
    const reparoDoc = { [k('locais')]: (d) => mesclarFixos(d, LOC) };
    const aplicaRegistroRT = (row) => {
      if (!row) return;
      // outro aparelho gravou: só entra se for do MÓDULO que está aberto aqui
      const { modulo: mod, tipo } = lerTipo(row.tipo);

      // PONTE PRODUÇÃO → FINALIZAÇÃO. A saída da produção com destino "Cozinha
      // de Finalização" É o recebimento do outro lado — é dado de OUTRO módulo
      // que precisa entrar aqui. A hidratação já tratava isso; o tempo real
      // não, e caía no filtro de módulo logo abaixo. Resultado: o tablet da
      // finalização só via o que tinha chegado depois de recarregar o app, no
      // meio do serviço, que é exatamente quando ninguém recarrega nada.
      if (tipoBase(moduloEfetivo) === 'finalizacao' && tipoBase(mod) === MODULO_PADRAO && tipo === 'saida') {
        const reg = linhaParaRegistro(row);
        const chaveReceb = k('recebimentos');
        setRecebimentosRaw(prev => {
          const semEle = prev.filter(x => x.id !== row.id);
          // Some da lista se foi apagado, se o destino foi corrigido para outro
          // lugar, OU se foi redirecionado para OUTRA finalização — senão esta
          // cozinha contaria uma entrega que é de outra casa.
          const sai = row.deleted || reg.destino !== moduloEfetivo;
          const next = sai ? semEle : [...semEle, reg].sort((a, b) => (a.ts || 0) - (b.ts || 0));
          cacheSet(rid, chaveReceb, next);
          return next;
        });
        return;
      }

      if (!ehTipoGlobal(tipo) && mod !== moduloEfetivo) return;
      const alvo = setterReg[tipo];
      if (!alvo) return;
      const [setRaw, keyBase] = alvo;
      const key = keyBase === 'auditoria' ? keyBase : k(keyBase);
      const linha = linhaParaRegistro(row);
      setRaw(prev => {
        let semEle = prev.filter(x => x.id !== row.id);
        // mesma armadilha da hidratação: a linha definitiva da auditoria chega
        // com o id do banco e não anula a otimista que este aparelho criou.
        if (keyBase === 'auditoria') semEle = conciliarAuditoria([linha], semEle);
        if (row.deleted) { cacheSet(rid, key, semEle); return semEle; }
        const next = [...semEle, linha].sort((a, b) => (a.ts || 0) - (b.ts || 0));
        cacheSet(rid, key, next);
        return next;
      });
    };
    const aplicaDocRT = (row) => {
      if (!row) return;
      // outro aparelho gravou: a versão dele passa a ser a que conhecemos
      if (row.chave) versoesRef.current[row.chave] = row.versao || 0;
      // prefs e pessoas valem para a conta toda — não passam pelo filtro de módulo
      if (row.chave === 'prefs') { // mescla com as preferências locais do aparelho
        cacheSet(rid, 'prefs', row.dados);
        setPrefsRaw({ ...row.dados, ...cacheGet(rid, '_prefs_device', {}) });
        return;
      }
      if (row.chave === 'pessoas') { setPessoasRaw(row.dados); cacheSet(rid, 'pessoas', row.dados); return; }
      // A chave já vem namespaceada ('seco::produtos'). O mapa acima só contém
      // as chaves que ESTE módulo lê, então doc de outro módulo simplesmente
      // não casa — sem precisar reimplementar a regra de namespace aqui.
      const bruta = String(row.chave || '');
      const setRaw = Object.prototype.hasOwnProperty.call(setterDoc, bruta) ? setterDoc[bruta] : null;
      if (!setRaw) return;
      // mesmo reparo da hidratação: se o outro tablet gravar `locais` sem o
      // destino fixo, este aparelho não pode perdê-lo por realtime.
      const dados = reparoDoc[bruta] ? reparoDoc[bruta](row.dados) : row.dados;
      setRaw(dados);
      cacheSet(rid, bruta, dados);
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
    // `moduloEfetivo` nas deps: trocar de estoque re-hidrata tudo daquele
    // estoque. É o EFETIVO, não o do localStorage: um id arquivado precisa
    // hidratar a raiz, não continuar carregando o estoque escondido.
  }, [rid, salvarDocNuvem, moduloEfetivo, chaveDestinos, k, kc]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Administração de dados ─────────────────────────────────
  const limparTudo = useCallback(() => {
    if (soLeituraRef.current) { avisaBloqueioLeitura(); return; } // modo suporte = só leitura
    const r = ridRef.current;
    [['compras', setComprasRaw], ['entradas', setEntradasRaw], ['saidas', setSaidasRaw],
     ['aparas', setAparasRaw], ['desperdicio', setDesperdicioRaw], ['ajustes', setAjustesRaw]]
      .forEach(([key, setRaw]) => { setRaw([]); cacheSet(r, k(key), []); });
    if (nuvemDe(r)) supabase.from('registros').update({ deleted: true }).eq('restaurante_id', r).in('tipo', tiposDoModulo())
      .then(({ error }) => { if (error) outboxAdd(r, { kind: 'clearAll', op: 'clearAll', payload: { tipos: tiposDoModulo() } }); });
    logAudit('apagou todos os registros', 'compras, entradas, saídas, aparas, perdas e contagens');
  }, [logAudit]);

  // "Restaurar produtos ao padrão" precisa devolver o padrão DO MÓDULO ABERTO.
  // Antes mandava PRODUTOS_BASE sempre: no Estoque Seco, restaurar substituía
  // grãos e descartáveis por filé e molho da produção — e, como a chave de
  // catálogo do seco é outra, o estrago era gravado direto por cima do
  // catálogo do seco. catalogoDe() mantém a finalização lendo o da produção,
  // que é o comportamento correto (ela não tem catálogo próprio).
  // Restaura o CATÁLOGO. Não mexe nas metas: elas são de cada estoque, e
  // apagá-las junto faria "restaurar produtos" zerar o mín/máx de todas as
  // unidades de uma vez.
  /**
   * Visão de QUALQUER estoque, sem mexer no que está aberto.
   *
   * É o que permite a Administração ser uma área de verdade: ver o relatório do
   * Estoque Seco enquanto a cozinha continua com a Produção aberta no mesmo
   * aparelho. Antes o cartão chamava setModulo e a área operacional trocava
   * embaixo do usuário — clicar num relatório mudava onde a equipe ia lançar.
   *
   */
  const visoesPorEstoque = useMemo(() => {
    const ids = estoques.map(e => e.id);
    const fatiado = fatiarPorEstoque(brutos.registros, ids, linhaParaRegistro);
    const saida = {};
    ids.forEach(id => {
      saida[id] = visaoDoEstoque({
        id,
        docs: brutos.docs,
        registrosFatiados: fatiado,
        padroes: catalogosPadrao(tipoBase(id), soEtiq),
        aplicarMetas: comMetas,
      });
    });
    return saida;
    // soEtiq entra nas deps de verdade (nao via ref): isto e derivacao pura de
    // render, e ler ref durante o render devolveria valor defasado.
  }, [estoques, brutos, soEtiq]);

  const resetarProdutos = useCallback(
    () => persistCatalogo('produtos', setProdutosRaw, catalogosPadrao(catalogoDe(moduloRef.current), soEtiqRef.current).produtos),
    [persistCatalogo],
  );

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
    a.download = `aurum-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
        throw new Error('Este arquivo não é uma cópia de segurança válida. Use um arquivo exportado pelo próprio app.');
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
    // ⚠️ prefs entra por LISTA BRANCA, nunca inteiro. Um arquivo de backup
    // é conteúdo que o usuário traz de fora e pode ter sido editado à mão:
    // aplicar o objeto cru deixaria o arquivo escolher qualquer chave que o app
    // venha a guardar em prefs — e prefs é da CONTA INTEIRA, não de um estoque.
    // Só as chaves que o app de fato reconhece passam.
    if (dados.prefs && typeof dados.prefs === 'object' && !Array.isArray(dados.prefs)) {
      const permitidas = Object.keys(soRestaurante(CAT.prefs));
      const limpo = {};
      permitidas.forEach(k => { if (dados.prefs[k] !== undefined) limpo[k] = dados.prefs[k]; });
      if (Object.keys(limpo).length) cat('prefs', setPrefsRaw, limpo);
    }

    const r = ridRef.current;
    // RESTAURAÇÃO REAL: o backup SUBSTITUI o estado atual. Sem este soft-delete
    // prévio, registros atuais que não estão no backup voltariam "zumbis" na
    // próxima hidratação (o upsert sozinho não os remove). Auditoria fica de
    // fora: é imutável no banco (insert-only) e registra a própria restauração.
    if (nuvemDe(r)) {
      supabase.from('registros').update({ deleted: true }).eq('restaurante_id', r).in('tipo', tiposDoModulo())
        .then(({ error }) => { if (error) outboxAdd(r, { kind: 'clearAll', op: 'clearAll', payload: { tipos: tiposDoModulo() } }); });
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
      etiquetasImpressas, setEtiquetasImpressas,
      permissoes, setPermissoes,
      precos, setPrecos,
      estoques, estoqueAtual, estoquesDoc, setEstoquesDoc, visoesPorEstoque,
      metas, setMetas, saidasParaConsumo,
      destinos, setDestinos,
      categorias, setCategorias,
      auditoria, logAudit,
      restaurarRegistro,
      prefs, setPref, setPrefs,
      modulo: moduloEfetivo, setModulo, recebimentos,
      estoque,
      limparTudo, resetarProdutos,
      exportarBackup, importarBackup,
      soLeitura,
      // id do restaurante — as telas precisam dele para gravar rascunho local
      // na MESMA convenção de chave do resto do app (pe::<rid>::…)
      rid,
      pendencias, online,
      mortos, retentarMortos, descartarMortos,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
