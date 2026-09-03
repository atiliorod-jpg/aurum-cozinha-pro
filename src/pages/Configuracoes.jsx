import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import Dialogo from '../components/Dialogo';
import Botao from '../components/Botao';
import { useApp } from '../store/AppContext';
import { useAuth, CARGOS, nivelDoCargo } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import NovaSenha from './NovaSenha';
import { calcSugestoesMinMax } from '../utils/sugestoes';
import { fmtNum, fmtData } from '../utils/formatters';
import { POLO_PRESET } from '../data/presetPolo';
import { fatorCorrecaoProduto } from '../utils/analise';
import { pode, CAPACIDADES, permissoesEfetivas } from '../utils/permissoes';
import { usePwaInstall } from '../lib/pwaInstall';
import { CartaoSuporteRemoto, CartaoArmazenamentos, CartaoEtiquetas, CartaoContas } from '../components/config/CartoesConfig';
import { temRecurso } from '../utils/modulos';
import { armazenamentosAtivos, prazosDoProduto, comEspelhoDePrazos, temAlgumPrazo } from '../utils/armazenamento';

// Campos numéricos ficam como texto enquanto edita (apagar/limpar funciona);
// a conversão para número acontece só no salvar.
const numVazio = (v) => (v === 0 || v == null ? '' : String(v));

// Abas válidas. Usado tanto pelo deep link (?secao=) quanto pela queda para
// 'produtos' quando a query traz lixo — sem isto um ?secao=xpto deixaria a
// tela sem nenhuma aba ativa.
const ABAS_VALIDAS = ['produtos', 'receitas', 'acessos', 'sistema'];

// A fila de erro mostrava `kind`/`op` crus — nomes internos do banco. Quem lê
// precisa reconhecer o lançamento, não o esquema.
const ROTULO_FILA = {
  compra: 'Compra', entrada: 'Entrada', saida: 'Saída',
  apara: 'Apara', perda: 'Perda', ajuste: 'Contagem', doc: 'Cadastro',
};

// Fecha o modal com a tecla Escape (acessibilidade — WCAG 2.1.2)
function useEscClose(onFechar) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onFechar]);
}

// Suporte remoto — autoriza a Aurum a visualizar os dados desta conta por 24h

// Estados de armazenamento (Configurações → Sistema)
//
// Antes eram dois, cravados no código. Agora o restaurante define quais existem
// na casa dele e qual a faixa de temperatura de cada um — que sai impressa na
// etiqueta ao lado do nome.

// Configuração das etiquetas impressas (Configurações → Sistema)

// Cartão para instalar o app na tela inicial (Configurações → Sistema)
/**
 * Cartão de catálogo simples: campo "novo item" + lista de chips com remover.
 * Destinos de saída e destinos de apara eram dois blocos praticamente iguais
 * (input+Add, chips, confirmação de remoção) — qualquer ajuste de UX precisava
 * ser feito duas vezes e as duas versões já tinham divergido (uma mostrava
 * estado vazio, a outra não).
 *
 * `itens`: [{ chave, rotulo (node), nomeParaConfirmar, fixo? }]
 */
function CartaoCatalogoChips({ titulo, descricao, placeholder, valor, onValor, onAdd, itens, textoVazio, tituloRemover, mensagemRemover, onRemover }) {
  const { confirm } = useUI();
  const remover = async (item) => {
    const ok = await confirm({
      titulo: tituloRemover,
      mensagem: mensagemRemover(item.nomeParaConfirmar),
      perigo: true,
      confirmar: 'Remover',
    });
    if (ok) onRemover(item);
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
      <div>
        {/* ⚠️ <h2>, NÃO <p> em negrito — mesma regra dos cartões de
            CartoesConfig.jsx. A correção anterior pegou só os compartilhados e
            deixou os escritos direto neste arquivo: quem usa leitor de tela
            pula de título em título para achar a seção, e um parágrafo em
            negrito não entra nessa lista. A classe é a mesma, então nada muda
            na tela. */}
        <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wide">{titulo}</h2>
        <p className="text-xs text-gray-500 mt-1">{descricao}</p>
      </div>
      <div className="flex gap-2">
        <input type="text" value={valor} onChange={e => onValor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onAdd(); }}
          placeholder={placeholder} aria-label={placeholder}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        <button onClick={onAdd}
          className="bg-polo-navy text-polo-gold font-bold px-4 rounded-lg text-sm">+ Add</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {itens.length === 0 && <span className="text-xs text-gray-500">{textoVazio}</span>}
        {itens.map(item => (
          <span key={item.chave}
            className="inline-flex items-center gap-1.5 bg-polo-beige rounded-full pl-3 pr-2 py-1 text-sm font-medium text-polo-navy">
            {item.rotulo}
            {item.fixo
              ? <span className="text-gray-500 text-[11px]">(fixo)</span>
              : <button onClick={() => remover(item)} aria-label={`Remover ${item.nomeParaConfirmar}`}
                  className="text-red-700 font-bold text-base leading-none">×</button>}
          </span>
        ))}
      </div>
    </div>
  );
}

function CartaoInstalarApp() {
  const { podeInstalar, instalado, ios, instalar } = usePwaInstall();
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-polo-navy">Instalar app</p>
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
  const [fcEdit,   setFcEdit]   = useState(null); // { id, pct }
  const [nomeEdit, setNomeEdit] = useState(null); // { id, nome }
  const [aberto,   setAberto]   = useState(false); // colapsável

  const { grupos, naoVinc } = useMemo(() => {
    const m = new Map();
    // Semeia com todos os produtos ativos — assim dá para configurar FC e
    // matéria-prima de compra mesmo nos produtos que ainda não têm preparação.
    produtos.filter(p => p.ativo !== false).forEach(p => m.set(p.id, { produto: p, fichas: [] }));
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

  const renomearProduto = (produto, novoNome) => {
    novoNome = novoNome.trim();
    if (!novoNome) return;
    setProdutos(produtos.map(p => p.id === produto.id ? { ...p, nome: novoNome } : p));
    setNomeEdit(null);
    toast(`Ingrediente renomeado para "${novoNome}".`, 'sucesso');
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

  const salvarMateriaPrima = (produto, valor) => {
    const mp = (valor || '').trim();
    setProdutos(produtos.map(p => p.id === produto.id ? { ...p, materiaPrima: mp || undefined } : p));
  };

  const opcoesProduto = [...produtos].sort((a, b) => a.nome.localeCompare(b.nome));
  // Matérias-primas já usadas (para sugerir ao agrupar — ex.: "Camarão")
  const materiasPrimas = [...new Set(produtos.map(p => (p.materiaPrima || '').trim()).filter(Boolean))].sort();

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-4">
      <button
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-polo-navy">Rendimento por ingrediente</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {grupos.length} {grupos.length === 1 ? 'ingrediente' : 'ingredientes'}
            {naoVinc.length > 0 && ` • ${naoVinc.length} sem vínculo`} — toque para {aberto ? 'recolher' : 'abrir'}
          </p>
        </div>
        <span className={`text-gray-600 text-lg transition-transform flex-shrink-0 ${aberto ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {aberto && (
      <div className="px-4 pb-4">
      <p className="text-xs text-gray-500 mb-3">
        O rendimento é calculado pelas aparas e perdas ligadas às compras.
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
                <div className="min-w-0 flex-1">
                  {nomeEdit?.id === produto.id ? (
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        autoFocus
                        value={nomeEdit.nome}
                        onChange={e => setNomeEdit({ ...nomeEdit, nome: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renomearProduto(produto, nomeEdit.nome);
                          if (e.key === 'Escape') setNomeEdit(null);
                        }}
                        className="border border-polo-gold/60 rounded-lg px-2 py-1 text-sm font-semibold text-polo-navy flex-1 min-w-0"
                      />
                      <button onClick={() => renomearProduto(produto, nomeEdit.nome)}
                        className="text-[11px] font-bold text-polo-gold bg-polo-navy px-2 py-1.5 rounded-lg flex-shrink-0">✓</button>
                      <button onClick={() => setNomeEdit(null)}
                        className="text-[11px] text-gray-600 flex-shrink-0">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="font-semibold text-sm text-polo-navy">{produto.nome}</p>
                      <button
                        onClick={() => { setFcEdit(null); setNomeEdit({ id: produto.id, nome: produto.nome }); }}
                        className="text-[11px] text-gray-600 hover:text-polo-navy transition-colors flex-shrink-0"
                        aria-label={`Renomear ${produto.nome}`}
                        title="Renomear ingrediente"
                      >✏️</button>
                    </div>
                  )}
                  {nomeEdit?.id !== produto.id && (
                    <p className="text-[11px]">
                      {produto.fcManual ? (
                        <span className="text-polo-navy">FC manual: <strong>{Math.round((produto.fcMedio || 0) * 100)}%</strong></span>
                      ) : fcAuto != null ? (
                        <span className="text-gray-600">FC automático: <strong className="text-polo-navy">{Math.round(fcAuto * 100)}%</strong> (aparas + perdas)</span>
                      ) : (
                        <span className="text-gray-600">Sem FC ainda — registre aparas/perdas ligadas às compras deste item</span>
                      )}
                    </p>
                  )}
                </div>
                {!editando && nomeEdit?.id !== produto.id && (
                  <button onClick={() => { setNomeEdit(null); setFcEdit({ id: produto.id, pct: produto.fcManual ? String(Math.round((produto.fcMedio || 0) * 100)) : '' }); }}
                    className="text-[11px] font-semibold text-polo-navy bg-gray-100 px-2 py-1 rounded flex-shrink-0">FC</button>
                )}
              </div>

              {editando && (
                <div className="mt-2 bg-polo-beige/60 rounded-lg p-2.5 space-y-2">
                  <label className="block text-[11px] font-semibold text-gray-600">Apara/perda na limpeza (%) — valor fixo</label>
                  <div className="flex items-center gap-2">
                    <input type="number" inputMode="numeric" min="0" max="90" step="1" value={fcEdit.pct} autoFocus
                      onChange={e => setFcEdit({ id: produto.id, pct: e.target.value })}
                      placeholder="Ex: 12"
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    <button onClick={() => salvarFcManual(produto, fcEdit.pct)}
                      className="text-xs font-bold text-polo-gold bg-polo-navy px-3 py-1.5 rounded-lg">Fixar</button>
                    {produto.fcManual && (
                      <button onClick={() => voltarAutomatico(produto)}
                        className="text-xs font-semibold text-gray-600 underline">voltar ao automático</button>
                    )}
                    <button onClick={() => setFcEdit(null)} className="text-xs text-gray-600 ml-auto">cancelar</button>
                  </div>
                </div>
              )}

              {/* Matéria-prima de compra — unifica produtos na lista de compras */}
              {nomeEdit?.id !== produto.id && (
                <div className="mt-2 bg-polo-beige/40 rounded-lg px-2.5 py-2">
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                    Comprado como
                  </label>
                  <input
                    type="text"
                    list={`mp-${produto.id}`}
                    defaultValue={produto.materiaPrima || ''}
                    onBlur={e => salvarMateriaPrima(produto, e.target.value)}
                    placeholder={`Ex: ${produto.nome.split(' ')[0]} (deixe vazio = não agrupa)`}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
                  />
                  <datalist id={`mp-${produto.id}`}>
                    {materiasPrimas.map(mp => <option key={mp} value={mp} />)}
                  </datalist>
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
                  <span className="text-xs text-gray-700 min-w-0 truncate">{f.preparacao} <span className="text-gray-600">({f.materiaPrima})</span></span>
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
      )}
    </div>
  );
}

function ModalProduto({ produto, sugestao, categorias, onSalvar, onFechar, comArmazenamento = true, subgruposExistentes = [], armazenamentos = [] }) {
  // Os prazos entram no form como mapa por ESTADO. prazosDoProduto já lê o
  // formato antigo (valCongelado/valResfriado), então produto cadastrado antes
  // da lista configurável abre com os prazos dele preenchidos, no lugar certo.
  const prazosIniciais = (p) => {
    const base = prazosDoProduto(p);
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, numVazio(v)]));
  };
  const [form, setForm] = useState(() => produto
    ? {
        ...produto,
        estoqueInicial: numVazio(produto.estoqueInicial),
        min: numVazio(produto.min),
        max: numVazio(produto.max),
        prazos: prazosIniciais(produto),
        valCongelado: numVazio(produto.valCongelado),
        valResfriado: numVazio(produto.valResfriado),
        pesoUnidade: numVazio(produto.pesoUnidade),
        gramatura: numVazio(produto.gramatura),
        coccao: numVazio(produto.coccao),
        entradaCozida: produto.entradaCozida || false,
      }
    : {
        nome: '', categoria: categorias[0], unidade: 'kg',
        estoqueInicial: '', min: '', max: '', prazos: {}, valCongelado: '', valResfriado: '', pesoUnidade: '', marca: '', sif: '',
        gramatura: '', coccao: '', entradaCozida: false, ativo: true,
      });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  useEscClose(onFechar);

  return (
    <Dialogo aoFechar={onFechar} titulo={produto ? 'Editar Produto' : 'Novo Produto'}
      forma="ficha" largura="lg" camada={70} fecharNoFundo={false} classeCaixa="space-y-4">
      <>

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
          <input id="mp-estoque-inicial" type="number" inputMode="decimal" min="0" step="0.5" value={form.estoqueInicial} onChange={e => set('estoqueInicial', e.target.value)}
            placeholder="0"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-gray-500 mt-1">Quanto há hoje. A partir daqui, entradas/saídas/perdas calculam sozinhas.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mp-min" className="block text-xs font-semibold text-gray-600 mb-1">
              Estoque Mínimo — alertar quando abaixo
            </label>
            <input id="mp-min" type="number" inputMode="decimal" min="0" step="0.5" value={form.min} onChange={e => set('min', e.target.value)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="mp-max" className="block text-xs font-semibold text-gray-600 mb-1">
              Estoque Máximo — meta de reposição
            </label>
            <input id="mp-max" type="number" inputMode="decimal" min="0" step="0.5" value={form.max} onChange={e => set('max', e.target.value)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-2">Mín/Máx: 0 = sem meta definida (não exibe alerta)</p>
        {parseFloat(form.max) > 0 && parseFloat(form.min) > parseFloat(form.max) && (
          <p className="text-xs text-orange-700 bg-orange-50 rounded-lg px-2 py-1.5 -mt-1">
            ⚠️ O máximo ({fmtNum(form.max)}) está abaixo do mínimo ({fmtNum(form.min)}) — assim o produto
            aparece como BAIXO e EXCESSO ao mesmo tempo. Confira os dois valores.
          </p>
        )}

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

        {/* Um prazo por ESTADO configurado (Config → Sistema → Armazenamento);
            despensa não tem câmara fria e usa prazo de prateleira único. */}
        {comArmazenamento ? (
          <div className="grid grid-cols-2 gap-3">
            {armazenamentos.map(a => (
              <div key={a.id}>
                <label htmlFor={`mp-prazo-${a.id}`} className="block text-xs font-semibold text-gray-600 mb-1">
                  {a.nome} (dias)
                  {a.faixa && <span className="font-normal text-gray-500"> · {a.faixa}</span>}
                </label>
                <input id={`mp-prazo-${a.id}`} type="number" inputMode="numeric" min="0"
                  value={form.prazos?.[a.id] ?? ''}
                  onChange={e => set('prazos', { ...(form.prazos || {}), [a.id]: e.target.value })}
                  placeholder="0 = sem controle"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
          </div>
        ) : (
          <div>
            <label htmlFor="mp-val-congelado" className="block text-xs font-semibold text-gray-600 mb-1">
              📦 Prazo de prateleira (dias)
            </label>
            {/* ⚠️ Escreve em prazos.congelado, NÃO em valCongelado direto.
                No Estoque Seco esta chave sempre significou "prazo de
                prateleira" (ver src/data/seco.js) — a semântica não muda, só o
                lugar onde é guardada. Escrever no campo antigo aqui faria o
                espelho do salvar zerar o valor, porque ele deriva de `prazos`. */}
            <input id="mp-val-congelado" type="number" inputMode="numeric" min="0"
              value={form.prazos?.congelado ?? ''}
              onChange={e => set('prazos', { ...(form.prazos || {}), congelado: e.target.value })}
              placeholder="0 = sem controle (ex.: descartáveis)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        )}
        <p className="text-xs text-gray-500 -mt-2">
          {comArmazenamento
            ? 'Ao registrar uma entrada, o vencimento é calculado sozinho com esses prazos. 0 = sem controle de validade.'
            : 'Validade do fabricante, em dias a partir da entrada. Use 0 em item que não vence (descartáveis, limpeza).'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mp-marca" className="block text-xs font-semibold text-gray-600 mb-1">
              🏭 Marca / fornecedor
            </label>
            <input id="mp-marca" type="text" value={form.marca || ''}
              onChange={e => set('marca', e.target.value)}
              placeholder="Ex: Swift (sai na etiqueta)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="mp-sif" className="block text-xs font-semibold text-gray-600 mb-1">
              🎖️ SIF
            </label>
            <input id="mp-sif" type="text" value={form.sif || ''}
              onChange={e => set('sif', e.target.value)}
              placeholder="Nº de inspeção (opcional)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {form.unidade === 'unid' && (
          <div>
            <label htmlFor="mp-peso-unidade" className="block text-xs font-semibold text-gray-600 mb-1">
              ⚖️ Peso por unidade (g)
            </label>
            <input id="mp-peso-unidade" type="number" inputMode="decimal" min="0" value={form.pesoUnidade}
              onChange={e => set('pesoUnidade', e.target.value)}
              placeholder="Ex: 130 (1 porção = 130 g)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-500 mt-1">Usado para converter a lista de compras em kg (ex.: 120 unid ≈ 15,6 kg).</p>
          </div>
        )}

        {/* Cocção — afeta só a lista de compras de itens que entram JÁ cozidos */}
        <div className="border border-gray-100 rounded-xl p-3 space-y-3">
          <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wide">🔥 Cocção (lista de compras)</h2>
          <div className="flex items-center gap-3 bg-orange-50 rounded-lg p-2.5">
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-700">Entra no estoque já cozido?</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Ex: cupim cozido, carne de sol desfiada — já entram prontos. Filé de frango entra cru (deixe desligado).</p>
            </div>
            <button type="button" onClick={() => set('entradaCozida', !form.entradaCozida)}
              className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.entradaCozida ? 'bg-orange-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.entradaCozida ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
          {form.entradaCozida && (
            <div>
              <label htmlFor="mp-coccao" className="block text-xs font-semibold text-gray-600 mb-1">Perda na cocção (%)</label>
              <input id="mp-coccao" type="number" inputMode="numeric" min="0" max="90" step="1" value={form.coccao} onChange={e => set('coccao', e.target.value)}
                placeholder="Ex: 30"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              {form.coccao && (
                <p className="text-[11px] text-orange-700 bg-orange-50 rounded-lg px-2 py-1.5 mt-1">
                  ✔ Na lista de compras você compra mais cru ({form.coccao}% a mais) para chegar ao kg cozido necessário.
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="mp-subgrupo" className="block text-xs font-semibold text-gray-600 mb-1">
            Subgrupo (opcional)
          </label>
          <input id="mp-subgrupo" type="text" list="lista-subgrupos" value={form.subgrupo || ''}
            onChange={e => set('subgrupo', e.target.value)}
            placeholder="Ex.: Bovinos, Aves, Molhos base…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <datalist id="lista-subgrupos">
            {subgruposExistentes.map(sg => <option key={sg} value={sg} />)}
          </datalist>
          <p className="text-[11px] text-gray-600 mt-1">
            Divide uma categoria grande em partes (PROTEÍNAS → Bovinos, Aves, Peixes). Deixe vazio se não precisar.
          </p>
        </div>

        <p className="text-[11px] text-gray-600 -mt-1">
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
              // ⚠️ comEspelhoDePrazos grava `prazos` E espelha nos campos
              // antigos. O espelho não é redundância: tablet com cache velho só
              // sabe ler valCongelado/valResfriado e, sem ele, imprimiria
              // etiqueta com validade zerada sem avisar ninguém.
              ...comEspelhoDePrazos(form, form.prazos),
              estoqueInicial: parseFloat(form.estoqueInicial) || 0,
              min: parseFloat(form.min) || 0,
              max: parseFloat(form.max) || 0,
              pesoUnidade: parseFloat(form.pesoUnidade) || 0,
              gramatura: parseFloat(form.gramatura) || 0,
              coccao: Math.min(parseFloat(form.coccao) || 0, 90),
              entradaCozida: form.entradaCozida || false,
            })} disabled={!form.nome.trim()}
            className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl disabled:opacity-40">
            Salvar
          </button>
        </div>
      </>
    </Dialogo>
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
    <Dialogo aoFechar={onFechar} titulo={receita ? 'Editar Receita' : 'Nova Receita de Produção'}
      forma="ficha" largura="lg" camada={70} fecharNoFundo={false} classeCaixa="space-y-4">
      <>
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
            <input type="number" inputMode="decimal" min="0" step="0.5" value={form.rendimentoBase} onChange={e => set('rendimentoBase', e.target.value)}
              placeholder="Ex: 10" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Armazenamento</label>
            <select value={form.armazenamento} onChange={e => set('armazenamento', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="ambos">Ambos (decide na hora)</option>
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
                  <input type="number" inputMode="decimal" min="0" step="0.1" value={ing.quantidade} onChange={e => setIng(i, 'quantidade', e.target.value)}
                    placeholder="Qtd" className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                  {ing.abate ? (
                    // Item controlado dá baixa na unidade do PRÓPRIO produto — fixa
                    // a unidade (um seletor livre aqui era ignorado no save e podia
                    // baixar 500 g como 500 kg).
                    <span title="Usa a unidade do produto controlado"
                      className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-gray-100 text-gray-600 flex items-center min-w-9 justify-center">
                      {unid(ing.produtoId) || '—'}
                    </span>
                  ) : (
                    <select value={ing.unidade || 'kg'} onChange={e => setIng(i, 'unidade', e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white">
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="un">un</option>
                      <option value="L">L</option>
                    </select>
                  )}
                  <button onClick={() => removeIng(i)} aria-label="Remover ingrediente"
                    className="text-red-700 font-bold text-lg w-6 flex-shrink-0 flex items-center justify-center">×</button>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id={`abate-${i}`} checked={ing.abate || false} onChange={e => setIng(i, 'abate', e.target.checked)}
                    className="w-6 h-6 cursor-pointer flex-shrink-0" />
                  <label htmlFor={`abate-${i}`} className="text-xs text-gray-600 cursor-pointer">
                    Controlado no estoque (dá baixa ao produzir)
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
      </>
    </Dialogo>
  );
}

export default function Configuracoes() {
  const { produtos, setProdutos, saidas, limparTudo, resetarProdutos, exportarBackup, importarBackup,
          pessoas, addPessoa, removePessoa, destinos, setDestinos, categorias, setCategorias,
          fichas, setFichas, producoes, setProducoes, locais, setLocais, logAudit, prefs, setPref, setPrefs,
          compras, aparas, desperdicio, mortos, retentarMortos, descartarMortos, modulo, permissoes, setPermissoes } = useApp();
  const { usuarios, sessao, alterarCargo,
          desativarUsuario, reativarUsuario,
          criarConta, trocarSenhaDe, removerConta, definirApelido } = useAuth();
  const { toast, confirm } = useUI();
  const sugestoes = calcSugestoesMinMax(produtos, saidas, undefined, prefs.diasMin || 3, prefs.diasMax || 6, prefs.minMaxPorDiaSemana);

  // Capacidades da sessão atual (matriz de permissões). Diretoria/super-admin = tudo.
  const subgruposExistentes = [...new Set(produtos.map(p => (p.subgrupo || '').trim()).filter(Boolean))].sort();
  const podeProdutos = pode(sessao, permissoes, 'gerenciarProdutos');
  const podeSistema  = pode(sessao, permissoes, 'configurarSistema');
  const eDiretoria = sessao?.eSuperAdmin || sessao?.cargo === 'diretoria';
  // Só gerência+ mexe em acessos (convites/cargos); a matriz de permissões é só diretoria.
  const podeAcessos = eDiretoria || sessao?.cargo === 'gerencia';
  // Matriz de permissões efetiva (padrão + o que a diretoria ajustou)
  const permMatriz = permissoesEfetivas(permissoes);
  const togglePermissao = (cargo, cap, valor) => {
    const nova = { ...permMatriz, [cargo]: { ...permMatriz[cargo], [cap]: valor } };
    // setPermissoes (chave própria, só diretoria grava) — NÃO setPref: dentro de
    // `prefs` qualquer membro reescreve a matriz que o restringe, e a trava da
    // migração 18 (que filtra por chave) nunca seria acionada.
    setPermissoes(nova);
    logAudit('ajustou permissões', `${cargo}: ${cap} ${valor ? 'liberado' : 'bloqueado'}`);
  };

  // Cargos que o usuário logado pode CONCEDER: ninguém atribui acima do próprio
  // nível (gerência não cria diretoria). Super-admin/diretoria concedem tudo.
  // Espelha a regra do banco em alterar_cargo (SUPABASE_SETUP.sql).
  const cargosAtribuiveis = sessao?.eSuperAdmin
    ? CARGOS
    : CARGOS.filter(c => c.nivel <= nivelDoCargo(sessao?.cargo));

  // O que falta preencher em cada produto (marcação pedida pelo cliente)
  const pendenciasDoProduto = (p) => {
    const falta = [];
    if (!p.min && !p.max) falta.push('mín/máx');
    // ⚠️ temAlgumPrazo, não os dois campos antigos: item com prazo só em
    // REFRIGERADO ou AMBIENTE era marcado como "falta validade" sem faltar
    // nada. Mesmo defeito que a lista de imprimir tinha — os pontos de leitura
    // de prazo precisam passar todos pelo adaptador.
    if (!temAlgumPrazo(p)) falta.push('validade');
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
  // Sincroniza quando prefs muda por realtime (outro dispositivo alterou).
  // O setState síncrono aqui é intencional: é espelho 1:1 de uma prop externa.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- espelho de valor vindo do realtime
  useEffect(() => { setDiasMinStr(String(prefs.diasMin || 3)); }, [prefs.diasMin]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- espelho de valor vindo do realtime
  useEffect(() => { setDiasMaxStr(String(prefs.diasMax || 6)); }, [prefs.diasMax]);
  const [novaCategoria, setNovaCategoria] = useState('');
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

  const usuariosAtivos = usuarios.filter(u => u.ativo !== false);
  const usuariosInativos = usuarios.filter(u => u.ativo === false);



  // Link direto: abre o app já no modo convite com o código preenchido



  const [catAtiva, setCatAtiva] = useState('TODOS');
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [busca, setBusca] = useState('');
  const [novaPessoa, setNovaPessoa] = useState('');
  // A aba pode vir por query (?secao=acessos): é assim que a Administração manda
  // direto para o assunto em vez de largar a pessoa em "Produtos" para procurar.
  //
  // ⚠️ Ler só no useState NÃO basta. O inicializador roda uma vez, no primeiro
  // mount — e vir do hub é navegação do lado do cliente, que não remonta a tela.
  // Resultado: o primeiro deep link funcionava e todos os seguintes iam para a
  // aba errada, em silêncio. Por isso o efeito abaixo observa a query.
  const abaDaUrl = new URLSearchParams(useLocation().search).get('secao');
  const [secao, setSecao] = useState(
    ABAS_VALIDAS.includes(abaDaUrl) ? abaDaUrl : 'produtos',
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizar com a URL é o propósito
    if (ABAS_VALIDAS.includes(abaDaUrl)) setSecao(abaDaUrl);
  }, [abaDaUrl]);
  // Abas visíveis dependem da função; secaoAtiva garante que uma aba escolhida
  // some (permissão retirada) caia numa aba permitida em vez de tela vazia.
  // FONTE ÚNICA das abas: rótulo e condição juntos. Antes a lista de botões era
  // escrita de novo lá embaixo, e as duas divergiram — a de baixo esquecia o
  // `temRecurso`, então "Receitas" aparecia no Seco e na Finalização, que não
  // têm receita. Clicar nela não fazia nada: a aba não estava em
  // abasDisponiveis, o secaoAtiva caía de volta em "Produtos" e o botão ficava
  // ali, morto, dando a entender que a tela estava quebrada.
  const ABAS = [
    ['produtos', 'Produtos', podeProdutos],
    ['receitas', '🍽️ Receitas', podeProdutos && temRecurso(modulo, 'receitas')],
    ['acessos',  'Acessos',  podeAcessos],
    ['sistema',  'Sistema',  podeSistema],
  ];
  const abasVisiveis = ABAS.filter(([, , ok]) => ok);
  const abasDisponiveis = abasVisiveis.map(([v]) => v);
  const secaoAtiva = abasDisponiveis.includes(secao) ? secao : (abasDisponiveis[0] || 'produtos');
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
      'Marca/Fornecedor (etiqueta)', 'SIF (etiqueta)',
    ];
    const GRUPOS = [
      ['BÁSICO  * OBRIGATÓRIO', 0, 2],
      ['ESTOQUE', 3, 5],
      ['VALIDADES', 6, 7],
      ['PESO / FICHA TÉCNICA', 8, 11],
      ['ETIQUETA', 12, 13],
    ];

    const gruposRow = Array(COLS.length).fill('');
    GRUPOS.forEach(([nome, from]) => { gruposRow[from] = nome; });

    const titulo = [`MODELO DE PRODUTOS — Aurum Cozinha Pro | Colunas com * são obrigatórias. Preencha a aba "Produtos" a partir da linha 4 e importe em Configurações → Planilha de produtos.`];

    const linhas = (POLO_PRESET.produtos || []).map(p => [
      p.nome, p.categoria, p.unidade,
      p.estoqueInicial || 0, p.min || 0, p.max || 0,
      p.valCongelado || 0, p.valResfriado || 0, p.pesoUnidade || 0,
      p.gramatura || 0, p.coccao || 0, p.entradaCozida ? 'sim' : 'não',
      p.marca || '', p.sif || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([titulo, gruposRow, COLS, ...linhas]);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: COLS.length - 1 } },
      ...GRUPOS.map(([, from, to]) => ({ s: { r: 1, c: from }, e: { r: 1, c: to } })),
    ];
    ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 24 }, ...Array(COLS.length - 3).fill({ wch: 22 })];

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
      ['Marca/Fornecedor (etiqueta)', 'Não', 'Texto', 'Sai no campo MARCA/FORN da etiqueta impressa (ex: Swift).'],
      ['SIF (etiqueta)', 'Não', 'Texto', 'Nº de inspeção federal — sai no campo SIF da etiqueta.'],
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
        const iMarca = col(h => h.includes('marca'));
        const iSif = col(h => h.includes('sif'));
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
            marca: iMarca >= 0 ? String(r[iMarca] ?? '').trim() : '',
            sif: iSif >= 0 ? String(r[iSif] ?? '').trim() : '',
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
      // ⚠️ O título segue a ABA. Ficava "Configurações" fixo, então quem vinha
      // da Administração por três cartões diferentes (Cadastros, Equipe,
      // Sistema) via sempre o mesmo cabeçalho e concluía que os três levavam
      // ao mesmo lugar — a única pista de que a aba mudou era a cor de um
      // botão pequeno mais abaixo.
      title={`Configurações — ${ABAS.find(([v]) => v === secaoAtiva)?.[1] || ''}`}
      area="admin"
      // O "+ Produto"/"+ Receita" saiu do cabeçalho: era um botão text-xs
      // espremido entre o seletor de estoque, o selo de sincronização e o
      // menu do usuário — o dono simplesmente não achava como cadastrar. O
      // CTA agora vive no corpo da aba, ao lado da busca e no estado vazio.
    >
      {/* Seções — abas conforme as permissões da função */}
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {abasVisiveis.map(([v, l]) => (
          <button key={v} onClick={() => setSecao(v)} aria-pressed={secaoAtiva === v}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors
              ${secaoAtiva === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {secaoAtiva === 'produtos' && <>
      {/* Busca + o CTA de cadastrar, lado a lado. É aqui que a pessoa está
          olhando quando conclui "não tem nenhum produto" — não no cabeçalho. */}
      <div className="mb-3 flex gap-2">
        <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar produto..."
          className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
        <Botao variante="primario" tamanho="sm" largura="auto"
          onClick={() => setCriando(true)} aria-label="Cadastrar novo produto">
          + Produto
        </Botao>
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
                  <span className="text-[11px] font-semibold text-polo-navy bg-polo-beige px-1.5 py-0.5 rounded">
                    🍽️ {p.gramatura}g/porção{p.coccao > 0 ? ` · 🔥−${p.coccao}%` : ''}{p.entradaCozida ? ' · cozido' : ''}
                  </span>
                )}
                {pendenciasDoProduto(p).length > 0 && (
                  <span className="text-[11px] font-semibold text-amber-600">
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
          <div className="text-center text-gray-500 py-8 text-sm space-y-3">
            {/* Distinguir "não tem nada cadastrado" de "a busca não achou":
                oferecer "adicionar o primeiro" quando o filtro é que zerou a
                lista mandaria a pessoa cadastrar um item que já existe. */}
            <p>{produtos.length === 0 ? 'Nenhum produto cadastrado ainda.' : 'Nenhum produto encontrado.'}</p>
            {produtos.length === 0 && (
              <Botao variante="primario" tamanho="sm" largura="auto" onClick={() => setCriando(true)}>
                + Cadastrar o primeiro
              </Botao>
            )}
          </div>
        )}
      </div>

      {/* Gerenciar categorias */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wide">Categorias</h2>
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
                  className="text-red-700 font-bold text-sm leading-none">×</button>
              </span>
            );
          })}
        </div>
      </div>
      </>}

      {secaoAtiva === 'receitas' && <>
        <div className="bg-polo-beige border border-polo-gold/40 rounded-xl p-3 text-xs text-polo-navy mb-3">
          Receitas de itens <strong>produzidos</strong> (molhos, caldos, refogados): vários ingredientes viram 1 produto com rendimento. A equipe executa em <strong>Registrar → Produção</strong>.
          <br />Gramatura por porção é configurada diretamente em cada <strong>Produto</strong>.
        </div>
        <div className="mb-3">
          <Botao variante="primario" tamanho="sm" largura="auto"
            onClick={() => setCriandoProducao(true)} aria-label="Cadastrar nova receita de produção">
            + Receita
          </Botao>
        </div>
        <div className="space-y-3 mb-4">
          {producoes.length === 0 && (
            <div className="bg-white rounded-xl p-6 text-center text-sm text-gray-500 space-y-3">
              <p>Nenhuma receita cadastrada ainda.</p>
              <Botao variante="primario" tamanho="sm" largura="auto" onClick={() => setCriandoProducao(true)}>
                + Cadastrar a primeira
              </Botao>
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
                      className="text-xs text-red-700 font-semibold px-2 py-1 rounded bg-red-50">×</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>}

      {secaoAtiva === 'sistema' && <>
      {/* Fila de erro permanente (itens que não sincronizaram após várias tentativas) */}
      {mortos.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-bold text-red-700">⚠️ {mortos.length} lançamento(s) não sincronizaram</p>
          <p className="text-xs text-red-600/90 mt-0.5">
            Estes itens falharam várias vezes ao subir para a nuvem e pararam de tentar sozinhos.
            Toque em <strong>Tentar de novo</strong>; se persistir, o último erro foi:
          </p>
          <ul className="text-[11px] text-red-600/80 mt-1.5 space-y-0.5 max-h-24 overflow-y-auto">
            {mortos.slice(0, 6).map((m, i) => (
              <li key={m.id || i}>• {ROTULO_FILA[m.kind] || 'Lançamento'}{m.dados?.data ? ` de ${fmtData(m.dados.data)}` : ''}</li>
            ))}
          </ul>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { retentarMortos(); toast('Tentando sincronizar de novo…', 'sucesso'); }}
              className="bg-polo-navy text-polo-gold font-bold px-3 py-1.5 rounded-lg text-xs">Tentar de novo</button>
            <button onClick={async () => {
                const ok = await confirm({ titulo: 'Descartar itens', mensagem: `Descartar ${mortos.length} lançamento(s) que não sincronizam? Eles somem deste aparelho e não sobem para a nuvem.`, perigo: true, confirmar: 'Descartar' });
                if (ok) { descartarMortos(); toast('Itens descartados.', 'sucesso'); }
              }}
              className="text-red-500 font-semibold px-3 py-1.5 rounded-lg text-xs border border-red-200">Descartar</button>
          </div>
        </div>
      )}

      {/* Atalho admin (só super-admin) */}
      {sessao?.eSuperAdmin && (
        <Link to="/admin" className="block bg-polo-navy rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-polo-gold">🔑 Painel super-admin</p>
              <p className="text-[11px] text-white/80 mt-0.5">Ver restaurantes, usuários e suporte ativo.</p>
            </div>
            <span className="text-polo-gold text-lg">→</span>
          </div>
        </Link>
      )}

      {/* Novidades do app */}
      <Link to="/novidades"
        className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 mb-4 active:scale-[0.99] transition-transform">
        <div>
          <p className="text-sm font-bold text-polo-navy">Novidades do app</p>
          <p className="text-xs text-gray-500 mt-0.5">Veja o que mudou nas últimas atualizações.</p>
        </div>
        <span className="text-polo-navy text-lg">›</span>
      </Link>

      {/* Instalar app no tablet */}
      <CartaoInstalarApp />

      {/* Suporte remoto */}
      <CartaoSuporteRemoto prefs={prefs} setPrefs={setPrefs} toast={toast} />

      {/* Armazenamento (vem ANTES das etiquetas: define o que a etiqueta imprime) */}
      <CartaoArmazenamentos prefs={prefs} setPref={setPref} toast={toast} confirm={confirm} />

      {/* Etiquetas impressas */}
      <CartaoEtiquetas prefs={prefs} setPref={setPref} toast={toast} nomeRestaurante={sessao?.restauranteNome} cnpjDaConta={sessao?.cnpj} />

      {/* ⚠️ O teste de Web Bluetooth que ficava aqui foi REMOVIDO — a pergunta
          dele já tem resposta, e é não. A MDK-022 fala Bluetooth CLÁSSICO
          (perfil SPP, 00001101-0000-1000-8000-00805F9B34FB), que no Windows
          aparece como porta serial COM8. Web Bluetooth só alcança BLE, nunca
          SPP clássico — em nenhum navegador, nem no Android. Então "o app
          conversa direto com a impressora" está descartado para este modelo:
          o caminho é a fila de impressão do sistema, como já é hoje.
          Se algum dia entrar uma impressora BLE de verdade, isto volta. */}

      {/* Rendimento / Fator de correção por ingrediente */}
      <TabelaRendimento produtos={produtos} fichas={fichas} setFichas={setFichas} setProdutos={setProdutos}
        compras={compras} aparas={aparas} desperdicio={desperdicio} toast={toast} />

      {/* Minha conta */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-polo-navy">Minha senha</p>
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
            <details className="mt-1.5">
              <summary className="text-[11px] font-semibold text-polo-navy cursor-pointer select-none">❓ Como funciona</summary>
              <div className="text-[11px] text-gray-600 mt-1.5 space-y-1 leading-snug">
                <p>• Olha as <strong>saídas dos últimos ~15 dias</strong> — tanto o envio para a cozinha e outras unidades
                quanto o uso interno em produção (ingrediente consumido por ficha conta).</p>
                <p>• Com isso calcula quanto a casa gasta por dia e define: mínimo = cobertura de
                {' '}{prefs.diasMin || 3} dia(s) de operação; máximo = meta de reposição para {prefs.diasMax || 6} dia(s).</p>
                <p>• <strong>Só começa a funcionar após ~15 dias com saídas registradas.</strong> Numa conta
                nova, defina mín/máx manualmente no cadastro de cada produto até lá.</p>
                <p>• Desligado: o Início mostra <em>sugestões</em> e você aprova. Ligado: atualiza sozinho
                (com pausa de segurança entre recálculos) — revise se a operação estiver atípica.</p>
              </div>
            </details>
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
                <input type="number" inputMode="numeric" min="1" max="30"
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
              <label className="block text-xs text-gray-500 mb-1">Máximo (meta de reposição)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" inputMode="numeric" min="1" max="90"
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
          <p className="text-[11px] text-gray-600 mt-2">
            Ex: mín 3 dias → alerta quando o estoque não cobre ~3 dias de saída no ritmo atual.
            Máx 6 dias → repor/produzir até cobrir ~6 dias de operação.
          </p>
        </div>
        {!!prefs.autoMinMax && (
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-bold text-polo-navy">Considerar o dia da semana</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Em vez da média lisa, dimensiona o mín/máx pelo consumo previsto dos próximos dias —
                  sobe na véspera do fim de semana e cai no início da semana.
                </p>
                <details className="mt-1.5">
                  <summary className="text-[11px] font-semibold text-polo-navy cursor-pointer select-none">❓ Quando ligar</summary>
                  <div className="text-[11px] text-gray-600 mt-1.5 leading-snug">
                    <p>Ligue se sexta a domingo vendem bem mais que o resto da semana.</p>
                  </div>
                </details>
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
            <p className="text-sm font-bold text-polo-navy">Guia de fluxo do turno</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Painel no topo de cada tela com os essenciais do turno (Produção/entrada → Saídas)
              e lembretes opcionais de etiquetas e aparas — aparas só contam se houver.
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

      {/* ⚠️ Três atalhos saíram daqui: "Contagem física", "Assinatura / Plano"
          e "Histórico de mudanças". Os três já são cartão em outro lugar
          (Registrar e Administração), e o de contagem ainda por cima levava
          para FORA da área de administração, para dentro de um estoque.
          Um destino, um caminho. */}

      </>}

      {secaoAtiva === 'acessos' && <>
      {/* Equipe */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wide">Equipe / Responsáveis</h2>
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
                className="text-red-700 font-bold text-base leading-none">×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Usuários e acessos */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wide">Usuários e Acessos</h2>
          <p className="text-xs text-gray-500 mt-1">
            Você cria a conta e entrega o acesso. Pode ser uma pessoa ou um posto — “chef”, “cozinha”,
            “noite”. Depois dá para trocar a senha, bloquear ou apagar a qualquer momento.
          </p>
        </div>

        {/* ⚠️ O CÓDIGO DE CONVITE SAIU, e ele estava QUEBRADO: a tela de
            entrada deixou de ter o cadastro por código quando o dono passou a
            criar as contas, mas esta parte continuou gerando códigos. Quem
            gerasse um passaria à pessoa um código que não tinha mais onde ser
            usado — e ninguém veria erro nenhum, dos dois lados.
            Agora é a mesma criação de conta do plano Etiquetas. A lista de
            usuários logo abaixo continua sendo a daqui, porque ela também
            troca cargo. */}
        <CartaoContas sessao={sessao} usuarios={usuarios} cargos={CARGOS}
          criarConta={criarConta} trocarSenhaDe={trocarSenhaDe} removerConta={removerConta}
          desativarUsuario={desativarUsuario} reativarUsuario={reativarUsuario}
          definirApelido={definirApelido} toast={toast} confirm={confirm}
          mostrarLista={false} />

        {/* Lista de usuários ativos */}
        <div className="space-y-1.5">
          {usuariosAtivos.map(u => {
            const euMesmo = u.id === sessao?.usuarioId;
            return (
              <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-gray-800">{u.nome}</span>
                  {euMesmo && <span className="text-[11px] text-green-600 font-semibold ml-1.5">• você</span>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {euMesmo ? (
                    <span className="text-[11px] font-bold text-polo-navy bg-polo-beige px-1.5 py-0.5 rounded">
                      {CARGOS.find(c => c.id === u.cargo)?.label}
                    </span>
                  ) : (
                    <>
                      <select value={u.cargo} onChange={async e => {
                          const novoCargo = e.target.value;
                          const label = CARGOS.find(c => c.id === novoCargo)?.label;
                          const erro = await alterarCargo(u.id, novoCargo);
                          if (erro) { toast(erro, 'erro'); return; } // RPC recusou — não loga
                          logAudit('alterou cargo', `${u.nome} → ${label}`);
                          toast(`Cargo de ${u.nome} alterado para ${label}.`, 'sucesso');
                        }}
                        className="text-xs font-semibold text-polo-navy bg-polo-beige border border-polo-gold/40 rounded-lg px-2 py-1">
                        {cargosAtribuiveis.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <button onClick={async () => {
                          const ok = await confirm({ titulo: 'Desativar acesso', mensagem: `Desativar o acesso de ${u.nome}? A pessoa não entra mais, mas o histórico dela é preservado e a vaga fica livre.`, perigo: true, confirmar: 'Desativar' });
                          if (!ok) return;
                          const erro = await desativarUsuario(u.id);
                          if (erro) { toast(erro, 'erro'); return; }
                          logAudit('desativou acesso', u.nome);
                          toast(`Acesso de ${u.nome} desativado.`, 'sucesso');
                        }}
                        aria-label={`Desativar acesso de ${u.nome}`}
                        className="text-red-700 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50">Desativar</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Acessos desativados (colapsável) — reativar libera se houver vaga */}
        {usuariosInativos.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs font-semibold text-gray-500 cursor-pointer">
              Acessos desativados ({usuariosInativos.length})
            </summary>
            <div className="space-y-1.5 mt-2">
              {usuariosInativos.map(u => (
                <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 gap-2 opacity-70">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-gray-700">{u.nome}</span>
                    <span className="text-[11px] text-gray-600 ml-1.5">{CARGOS.find(c => c.id === u.cargo)?.label} · inativo</span>
                  </div>
                  <button onClick={async () => {
                      const erro = await reativarUsuario(u.id);
                      if (erro) { toast(erro, 'erro'); return; }
                      logAudit('reativou acesso', u.nome);
                      toast(`Acesso de ${u.nome} reativado.`, 'sucesso');
                    }}
                    aria-label={`Reativar acesso de ${u.nome}`}
                    className="text-polo-navy text-xs font-semibold px-2 py-1 rounded hover:bg-polo-beige flex-shrink-0">Reativar</button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Matriz de permissões — só a diretoria configura o que cozinha/gerência podem */}
      {eDiretoria && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
          <div>
            <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wide">🔑 O que cada função pode fazer</h2>
            <p className="text-xs text-gray-500 mt-1">
              A <strong>diretoria</strong> tem acesso total, sempre. Aqui você escolhe o que <strong>cozinha</strong> e{' '}
              <strong>gerência</strong> podem fazer — é o que aparece no app para cada pessoa.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left font-semibold py-1">Ação</th>
                  <th className="font-semibold py-1 px-2 text-center w-16">Cozinha</th>
                  <th className="font-semibold py-1 px-2 text-center w-16">Gerência</th>
                </tr>
              </thead>
              <tbody>
                {CAPACIDADES.map(cap => (
                  <tr key={cap.id} className="border-t border-gray-100 align-top">
                    <td className="py-2 pr-2">
                      <span className="font-semibold text-gray-800">{cap.label}</span>
                      <span className="block text-[11px] text-gray-600 leading-snug">{cap.desc}</span>
                    </td>
                    {['cozinha', 'gerencia'].map(cargo => (
                      <td key={cargo} className="text-center px-2 py-2">
                        <input type="checkbox" checked={!!permMatriz[cargo][cap.id]}
                          aria-label={`${cap.label} — ${cargo === 'cozinha' ? 'Cozinha' : 'Gerência'}`}
                          onChange={e => togglePermissao(cargo, cap.id, e.target.checked)}
                          className="w-6 h-6 accent-polo-navy" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-600">
            Criar convites e trocar cargos continua sendo só da diretoria. As mudanças valem para todos os aparelhos.
          </p>
        </div>
      )}

      </>}

      {secaoAtiva === 'sistema' && <>
      {/* Destinos de saída (para onde o estoque vai) */}
      <CartaoCatalogoChips
        titulo="Destinos de Saída"
        descricao="Para onde o estoque é enviado (ex.: unidades, salão, delivery). Aparecem na tela de Saídas."
        placeholder="Novo destino (ex: Unidade Centro)"
        valor={novoLocal} onValor={setNovoLocal} onAdd={handleAddLocal}
        itens={locais.map(l => ({ chave: l.id, rotulo: l.nome, nomeParaConfirmar: l.nome, fixo: l.fixo, ref: l }))}
        textoVazio="Nenhum destino — adicione ao menos um para registrar saídas."
        tituloRemover="Remover destino"
        mensagemRemover={nome => `Remover "${nome}"? Saídas antigas não mudam.`}
        onRemover={item => {
          setLocais(locais.filter(x => x.id !== item.ref.id));
          logAudit('removeu destino de saída', item.ref.nome);
          toast('Destino removido.', 'sucesso');
        }}
      />

      {/* Destinos de apara */}
      <CartaoCatalogoChips
        titulo="Destinos de Apara"
        descricao={'Opções que aparecem ao registrar uma apara. "Outro" é fixo e abre campo livre.'}
        placeholder="Novo destino (ex: Escondidinho)"
        valor={novoDestino} onValor={setNovoDestino} onAdd={handleAddDestino}
        itens={destinos.map(d => ({
          chave: d.cod,
          rotulo: <><strong>{d.cod}</strong> {d.label}</>,
          nomeParaConfirmar: d.label,
          fixo: d.cod === 'OUT',
          ref: d,
        }))}
        textoVazio="Nenhum destino de apara cadastrado."
        tituloRemover="Remover destino"
        mensagemRemover={nome => `Remover "${nome}"? Registros antigos não mudam.`}
        onRemover={item => {
          setDestinos(destinos.filter(x => x.cod !== item.ref.cod));
          logAudit('removeu destino de apara', item.ref.label);
          toast('Destino removido.', 'sucesso');
        }}
      />

      {/* Planilha de produtos — cadastro padronizado em massa */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wide">Planilha de produtos</h2>
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
          <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wide">🛟 Cópia de segurança</h2>
          <p className="text-xs text-gray-500 mt-1">
            Baixe uma cópia dos dados para poder restaurar depois.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { exportarBackup(); toast('Cópia de segurança baixada.', 'sucesso'); }}
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
        <ModalProduto comArmazenamento={temRecurso(modulo, 'armazenamento')} subgruposExistentes={subgruposExistentes}
          armazenamentos={armazenamentosAtivos(prefs)}
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
