import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { statusEstoque, corStatus, pctBarra } from '../utils/calculos';
import { calcSugestoesMinMax, produtosDivergentes } from '../utils/sugestoes';
import { mediaDiariaSaidas, previsaoRuptura, listaDeCompras } from '../utils/analise';
import { diasAte } from '../utils/datas';
import { calcLotes, lotesVencendo } from '../utils/lotes';
import { producoesIncompletas } from '../utils/producao';
import { fmtNum, fmtData, hoje } from '../utils/formatters';
import { somaPorUnidade } from '../utils/relatorios';
import CalculadoraProducao from '../components/CalculadoraProducao';
import GuideTour from '../components/GuideTour';
import { temRecurso } from '../utils/modulos';
import { acharArmazenamento } from '../utils/armazenamento';
import { pode } from '../utils/permissoes';
import { useAuth } from '../store/AuthContext';

export default function Dashboard() {
  const { produtos, setProdutos, saidas, saidasParaConsumo, entradas, desperdicio, compras, aparas, producoes, estoque, categorias, listaManual, prefs, modulo, permissoes } = useApp();
  const { toast } = useUI();
  const { sessao } = useAuth();
  const navigate = useNavigate();
  const [catAtiva, setCatAtiva] = useState('TODOS');
  const [subAtivo, setSubAtivo] = useState('TODOS');
  const [verSugestoes, setVerSugestoes] = useState(false);
  const [expandido, setExpandido] = useState(null); // produtoId com lotes abertos
  const dataHoje = hoje();

  // Sugestões de mín/máx pela média de saídas (escondidas se o modo automático estiver ligado)
  // mesma fonte de consumo do resto da tela: funciona nas três áreas
  const sugestoes = useMemo(() => calcSugestoesMinMax(produtos, saidasParaConsumo, undefined, prefs.diasMin || 3, prefs.diasMax || 6, prefs.minMaxPorDiaSemana), [produtos, saidasParaConsumo, prefs.diasMin, prefs.diasMax, prefs.minMaxPorDiaSemana]);
  const divergentes = useMemo(
    () => (prefs.autoMinMax ? [] : produtosDivergentes(produtos, sugestoes)),
    [produtos, sugestoes, prefs.autoMinMax]
  );

  // Lotes restantes por produto (FEFO) e os que vencem em até 5 dias
  const lotes = useMemo(() => calcLotes(entradas, saidas, desperdicio, produtos), [entradas, saidas, desperdicio, produtos]);
  // reconciliado com o estoque: produto zerado (ex.: contagem física) não gera alerta fantasma
  const vencendo = useMemo(() => lotesVencendo(lotes, produtos, estoque, diasAte), [produtos, lotes, estoque]);

  // Produção incompleta: saída interna gravada sem a entrada do produto final
  // (falha entre os dois passos do par) — ingredientes baixados "no vazio"
  const prodIncompletas = useMemo(() => producoesIncompletas(entradas, saidas), [entradas, saidas]);

  // Previsão de ruptura (ritmo dos últimos 14 dias) e lista de compras
  // `saidasParaConsumo`: na Cozinha de Finalização isto é o consumo apurado no
  // fechamento de turno, não a lista de saídas (que lá não existe). Com isso a
  // média diária, a previsão de ruptura e a sugestão de mín/máx passam a
  // funcionar nas TRÊS áreas, com uma conta só.
  const medias = useMemo(() => mediaDiariaSaidas(saidasParaConsumo), [saidasParaConsumo]);
  const emRisco = useMemo(
    () => previsaoRuptura(produtos, estoque, medias).filter(x => x.dias <= 3),
    [produtos, estoque, medias]
  );
  const lista = useMemo(() => listaDeCompras(produtos, estoque, compras, aparas, desperdicio), [produtos, estoque, compras, aparas, desperdicio]);

  // Receitas cujo produto final está abaixo do mínimo → mostrar "Produzir hoje"
  const produzirHoje = useMemo(() => producoes
    .map(r => {
      const produto = produtos.find(p => p.id === r.produtoFinalId);
      if (!produto?.ativo) return null;
      const atual = estoque[r.produtoFinalId] ?? 0;
      if (produto.min > 0 && atual >= produto.min) return null;
      return { receita: r, produto, atual };
    })
    .filter(Boolean),
  [producoes, produtos, estoque]);

  // IDs de produtos que são resultado de uma receita de produção
  const produtoFinalIds = useMemo(() => new Set(producoes.map(r => r.produtoFinalId)), [producoes]);

  const aplicarSugestao = (ids) => {
    const next = produtos.map(p => {
      if (!ids.includes(p.id) || !sugestoes[p.id]) return p;
      return { ...p, min: sugestoes[p.id].min, max: sugestoes[p.id].max };
    });
    setProdutos(next);
    toast(ids.length === 1 ? 'Mín/Máx atualizado.' : `Mín/Máx de ${ids.length} produtos atualizados.`, 'sucesso');
  };

  // Estoque negativo: quase sempre é um lançamento faltando (entrada/produção não registrada)
  const negativos = useMemo(
    () => produtos
      .filter(p => p.ativo && (estoque[p.id] ?? 0) < 0)
      .map(p => ({ p, atual: estoque[p.id] ?? 0 }))
      .sort((a, b) => a.atual - b.atual),
    [produtos, estoque]
  );

  const produtosAtivos = produtos.filter(p => p.ativo);
  // subgrupos disponíveis dentro da categoria escolhida
  const subgruposDaCategoria = useMemo(() => {
    const base = catAtiva === 'TODOS' ? produtosAtivos : produtosAtivos.filter(p => p.categoria === catAtiva);
    const sgs = [...new Set(base.map(p => (p.subgrupo || '').trim()).filter(Boolean))].sort();
    return sgs.length ? ['TODOS', ...sgs] : [];
  }, [produtosAtivos, catAtiva]);

  const produtosFiltrados = catAtiva === 'TODOS'
    ? produtosAtivos
    : produtosAtivos.filter(p => p.categoria === catAtiva);
  const produtosVisiveis = subAtivo === 'TODOS' || !subgruposDaCategoria.length
    ? produtosFiltrados
    : produtosFiltrados.filter(p => (p.subgrupo || '').trim() === subAtivo);

  const totais = {
    total: produtosAtivos.length,
    ok: produtosAtivos.filter(p => statusEstoque(estoque[p.id] ?? 0, p.min, p.max) === 'ok').length,
    critico: produtosAtivos.filter(p => {
      const s = statusEstoque(estoque[p.id] ?? 0, p.min, p.max);
      return s === 'critico' || s === 'zerado';
    }).length,
    excesso: produtosAtivos.filter(p => statusEstoque(estoque[p.id] ?? 0, p.min, p.max) === 'excesso').length,
  };

  // O que foi descartado HOJE, na tela de quem descartou. Antes apara e perda
  // eram lidas aqui só como insumo do fator de correção da lista de compras:
  // a equipe registrava e o número sumia de vista até alguém abrir a
  // Administração.
  const descarteHoje = useMemo(() => {
    const ap = temRecurso(modulo, 'aparas') ? (aparas || []).filter(r => r.data === dataHoje) : [];
    const pe = (desperdicio || []).filter(r => r.data === dataHoje);
    return { aparas: somaPorUnidade(ap), perdas: somaPorUnidade(pe), houve: ap.length + pe.length > 0 };
  }, [aparas, desperdicio, dataHoje, modulo]);
  const fmtUn = (m) => Object.entries(m).sort((a, b) => b[1] - a[1])
    .map(([u, q]) => `${fmtNum(q)} ${u}`).join(' · ');

  const cats = ['TODOS', ...categorias];

  return (
    <Layout title="Início">
      {/* O guia do turno vive AQUI, não no Layout: é o progresso do dia. */}
      <GuideTour />
      {/* Resumo do dia */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">Atualizado em: {fmtData(dataHoje)}</p>
        {descarteHoje.houve && (
          <button onClick={() => navigate('/aparas')}
            className="w-full text-left mb-2 min-h-11 px-3 py-2 rounded-xl bg-white border border-gray-200
                       flex items-center justify-between gap-2 active:scale-[0.99] transition-transform
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
            <span className="text-xs font-semibold text-gray-700">Descartado hoje</span>
            <span className="text-xs text-right">
              {Object.keys(descarteHoje.aparas).length > 0 && (
                <span className="text-amber-800">apara {fmtUn(descarteHoje.aparas)}</span>
              )}
              {Object.keys(descarteHoje.aparas).length > 0 && Object.keys(descarteHoje.perdas).length > 0 && ' · '}
              {Object.keys(descarteHoje.perdas).length > 0 && (
                <span className="text-red-700">perda {fmtUn(descarteHoje.perdas)}</span>
              )}
            </span>
          </button>
        )}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="bg-green-600 text-white rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{totais.ok}</div>
            <div className="text-xs">Normal</div>
          </div>
          <div className="bg-orange-500 text-white rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{totais.critico}</div>
            <div className="text-xs">Abaixo do mínimo</div>
          </div>
          <div className="bg-blue-500 text-white rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{totais.excesso}</div>
            <div className="text-xs">Acima do máximo</div>
          </div>
        </div>
      </div>

      {/* Estoque negativo — provável lançamento faltando */}
      {negativos.length > 0 && (
        <div className="bg-red-100 border border-red-400 rounded-xl p-3 mb-4">
          <p className="text-xs font-bold text-red-800 mb-2">
            ⚠️ {negativos.length} item(ns) com estoque negativo — provável entrada ou produção não registrada
          </p>
          <div className="space-y-1">
            {negativos.map(({ p, atual }) => (
              <div key={p.id} className="flex justify-between items-center text-xs">
                <span className="font-medium text-gray-700">{p.nome}</span>
                <span className="font-bold text-red-700">{fmtNum(atual)} {p.unidade}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-red-600 mt-2">Confira se faltou registrar uma entrada/produção, ou ajuste pela contagem física (Inventário).</p>
        </div>
      )}

      {/* Calculadora rápida de produção (apoio à equipe) */}
      {/* calculadora depende de receita — não existe no estoque seco */}
      {temRecurso(modulo, 'receitas') && <CalculadoraProducao />}

      {/* Lista de compras (automática + manual) */}
      {/* gate pelo recurso: a Finalizacao nao tem lista de compras, e o botao
          levava para uma tela que nao existe ali */}
      {temRecurso(modulo, 'listaCompras') && (lista.length > 0 || listaManual.length > 0) && (
        <button onClick={() => navigate('/compras', { state: { tab: 'lista' } })}
          className="w-full flex items-center justify-between bg-polo-navy text-white rounded-xl px-4 py-3 mb-4 active:scale-[0.99] transition-transform">
          <span className="text-sm font-semibold text-left">
            🧾 Lista de compras —
            {lista.length > 0 && <> <strong className="text-polo-gold">{lista.length}</strong> abaixo do mín</>}
            {lista.length > 0 && listaManual.length > 0 && ' + '}
            {listaManual.length > 0 && <><strong className="text-polo-gold">{listaManual.length}</strong> manual{listaManual.length > 1 ? 'is' : ''}</>}
          </span>
          <span className="text-polo-gold text-lg">›</span>
        </button>
      )}

      {/* Produzir hoje — receitas com produto final abaixo do mínimo */}
      {temRecurso(modulo, 'producao') && produzirHoje.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2">Produzir hoje</p>
          <div className="space-y-2">
            {produzirHoje.map(({ receita, produto, atual }) => (
              <button key={receita.id}
                onClick={() => navigate(`/producao?r=${receita.id}`)}
                className="w-full bg-white rounded-xl p-3 flex items-center justify-between border border-polo-gold/40 active:scale-[0.99] transition-transform text-left">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-polo-navy truncate">{produto?.nome || receita.nome}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Estoque: <span className={`font-semibold ${atual <= 0 ? 'text-red-600' : 'text-orange-600'}`}>{fmtNum(atual)} {produto?.unidade}</span>
                    {produto?.min > 0 && <> · mín {produto.min} {produto?.unidade}</>}
                  </div>
                </div>
                <span className="flex-shrink-0 ml-3 bg-polo-navy text-polo-gold font-bold text-xs px-3 py-2 rounded-lg">
                  Produzir →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Previsão de ruptura — ritmo atual de consumo */}
      {/* Era um aviso MORTO: mostrava o problema e não levava a lugar nenhum.
          Quem vê "acaba hoje" quer comprar — o destino é a lista de compras. */}
      {emRisco.length > 0 && (
        <Link to="/compras" state={{ tab: 'lista' }}
          className="block bg-red-50 border border-red-300 rounded-xl p-3 mb-4 active:scale-[0.99] transition-transform
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
          <p className="text-xs font-bold text-red-800 mb-2 flex items-center justify-between">
            <span>Risco de faltar (no ritmo atual de saídas)</span>
            <span aria-hidden="true">›</span>
          </p>
          <div className="space-y-1">
            {emRisco.map(({ p, dias }) => (
              <div key={p.id} className="flex justify-between items-center text-xs">
                <span className="font-medium text-gray-700">{p.nome} <span className="text-gray-500">({fmtNum(estoque[p.id] ?? 0)} {p.unidade})</span></span>
                <span className="font-bold text-red-600">
                  {dias < 1 ? 'acaba HOJE' : `acaba em ~${Math.ceil(dias)} dia${Math.ceil(dias) > 1 ? 's' : ''}`}
                </span>
              </div>
            ))}
          </div>
        </Link>
      )}

      {/* Produção incompleta — ingredientes baixados sem entrada do produto final */}
      {temRecurso(modulo, 'producao') && prodIncompletas.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 mb-4">
          <p className="text-xs font-bold text-red-800 mb-1">Produção pela metade</p>
          <p className="text-xs text-red-700 mb-2">
            {prodIncompletas.length === 1
              ? '1 produção ficou pela metade: os ingredientes saíram, o item produzido não entrou.'
              : `${prodIncompletas.length} produções ficaram pela metade: os ingredientes saíram, o item produzido não entrou.`}
            {' '}Remova no Histórico e registre de novo.
          </p>
          <button onClick={() => navigate('/historico')}
            className="text-[11px] font-bold text-red-50 bg-red-600 rounded-lg px-2.5 py-1.5">
            Abrir Histórico →
          </button>
        </div>
      )}

      {/* Lotes vencendo — usar primeiro (FEFO)
          É um ATALHO, não só um aviso: antes o alerta mostrava o problema e
          terminava ali, obrigando a pessoa a achar Validades por conta própria
          no meio do serviço. */}
      {vencendo.length > 0 && (
        <Link to="/validades"
          className="block bg-orange-50 border border-orange-300 rounded-xl p-3 mb-4 active:scale-[0.99] transition-transform
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-orange-700">⏰ Usar primeiro — lotes vencendo</p>
            <span className="text-[11px] font-bold text-orange-700">ver todas →</span>
          </div>
          <div className="space-y-1">
            {vencendo.map(({ p, lote, dias }, i) => (
              <div key={`${p.id}-${i}`} className="flex justify-between items-center text-xs">
                <span className="font-medium text-gray-700">{p.nome} <span className="text-gray-500">({fmtNum(lote.restante)} {p.unidade})</span></span>
                <span className={`font-bold ${dias < 0 ? 'text-red-600' : dias <= 2 ? 'text-orange-600' : 'text-amber-600'}`}>
                  {dias < 0 ? `VENCIDO (${fmtData(lote.validade)})` : dias === 0 ? 'vence HOJE' : `vence em ${dias}d (${fmtData(lote.validade)})`}
                </span>
              </div>
            ))}
          </div>
        </Link>
      )}

      {/* Sugestão de mín/máx pela média de saídas */}
      {divergentes.length > 0 && (
        <div className="bg-polo-beige border border-polo-gold/50 rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-polo-navy flex-1">
              💡 <strong>{divergentes.length} produto{divergentes.length > 1 ? 's' : ''}</strong> com mín/máx fora do consumo real (média dos últimos {sugestoes[divergentes[0].id]?.dias} dias).
            </p>
            <button onClick={() => setVerSugestoes(v => !v)}
              className="text-xs font-bold text-polo-navy underline flex-shrink-0">
              {verSugestoes ? 'Ocultar' : 'Ver'}
            </button>
            <button onClick={() => aplicarSugestao(divergentes.map(p => p.id))}
              className="bg-polo-navy text-polo-gold text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0">
              Aplicar todos
            </button>
          </div>
          {verSugestoes && (
            <div className="mt-2 space-y-1.5">
              {divergentes.map(p => {
                const s = sugestoes[p.id];
                return (
                  <div key={p.id} className="flex items-center justify-between bg-white/70 rounded-lg px-3 py-2">
                    <div className="text-xs">
                      <span className="font-semibold text-gray-800">{p.nome}</span>
                      <span className="text-gray-500 block">
                        Mín {p.min} → <strong>{s.min}</strong> • Máx {p.max} → <strong>{s.max}</strong> {p.unidade}
                      </span>
                    </div>
                    <button onClick={() => aplicarSugestao([p.id])}
                      className="text-xs font-bold text-polo-navy border border-polo-navy/30 px-2.5 py-1 rounded-lg">
                      Aplicar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Conta nova: explica por que ainda não há sugestões de mín/máx (gate de ~15 dias) */}
      {!prefs.autoMinMax && divergentes.length === 0 && Object.keys(sugestoes).length === 0 && produtosAtivos.length > 0 && (
        <p className="text-[11px] text-gray-600 px-1 mb-4">
          💡 Sugestões automáticas de mín/máx aparecem após ~15 dias de saídas registradas.
        </p>
      )}

      {/* Filtro por categoria */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-3">
        {cats.map(cat => (
          <button
            key={cat}
            onClick={() => setCatAtiva(cat)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex-shrink-0
              ${catAtiva === cat
                ? 'bg-polo-navy text-polo-gold'
                : 'bg-white text-gray-600 border border-gray-200'}`}
          >
            {cat === 'TODOS' ? 'Todos' : cat}
          </button>
        ))}
      </div>

      {/* Subgrupos: só aparecem quando a categoria escolhida tem mais de um.
          Categoria grande (PROTEÍNAS com 30 itens) fica navegável sem virar
          uma lista infinita; quem não usa subgrupo não vê nada mudar. */}
      {subgruposDaCategoria.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3 scrollbar-hide">
          {subgruposDaCategoria.map(sg => (
            <button key={sg} onClick={() => setSubAtivo(sg)}
              className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors flex-shrink-0
                ${subAtivo === sg ? 'bg-polo-gold text-polo-navy' : 'bg-white text-gray-500 border border-gray-200'}`}>
              {sg === 'TODOS' ? 'Todos os subgrupos' : sg}
            </button>
          ))}
        </div>
      )}

      {/* Cards de produtos */}
      <div className="space-y-2">
        {categorias.filter(c => catAtiva === 'TODOS' || c === catAtiva).map(cat => {
          const prods = produtosVisiveis.filter(p => p.categoria === cat);
          if (!prods.length) return null;
          return (
            <div key={cat}>
              <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wider mb-1 mt-3">{cat}</h2>
              {prods.map(p => {
                const atual = estoque[p.id] ?? 0;
                const status = statusEstoque(atual, p.min, p.max);
                const cor = corStatus(status);
                const pct = pctBarra(atual, p.max);
                const lotesProduto = lotes[p.id] || [];
                const aberto = expandido === p.id;
                return (
                  <div key={p.id}
                    {...(lotesProduto.length ? {
                      role: 'button', tabIndex: 0, 'aria-expanded': aberto,
                      'aria-label': `${p.nome}: ${lotesProduto.length} lote(s), toque para ${aberto ? 'recolher' : 'ver'}`,
                      onClick: () => setExpandido(aberto ? null : p.id),
                      onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandido(aberto ? null : p.id); } },
                    } : {})}
                    className={`${cor.bg} rounded-xl p-3 mb-2 border border-white/60 ${lotesProduto.length ? 'cursor-pointer active:scale-[0.995] transition-transform' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-gray-800 flex items-center gap-1 flex-wrap">
                        {p.nome}
                        {produtoFinalIds.has(p.id) && (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                            🍲 produzido
                          </span>
                        )}
                        {lotesProduto.length > 0 && (
                          <span className="text-[11px] font-bold text-polo-navy bg-white/70 px-1.5 py-0.5 rounded-full">
                            🏷️ {lotesProduto.length} lote{lotesProduto.length > 1 ? 's' : ''} {aberto ? '▾' : '▸'}
                          </span>
                        )}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cor.badge}`}>
                        {cor.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white/60 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            status === 'zerado' ? 'bg-red-500' :
                            status === 'critico' ? 'bg-orange-500' :
                            status === 'excesso' ? 'bg-blue-500' :
                            status === 'ok' ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-sm font-bold ${cor.text} min-w-[60px] text-right`}>
                        {fmtNum(atual)} {p.unidade}
                      </span>
                    </div>
                    {(p.min > 0 || p.max > 0) && (
                      <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                        <span>Mín: {p.min} {p.unidade}</span>
                        <span>Máx: {p.max} {p.unidade}</span>
                      </div>
                    )}
                    {/* Consumo médio por dia — a pergunta que a cozinha faz antes
                        de pedir reposição ("dura quanto?"). Só aparece com
                        histórico suficiente: mediaDiariaSaidas exige 3+ dias
                        DAQUELE item, para não arriscar uma média com dois
                        lançamentos e sugerir compra errada. */}
                    {medias[p.id] > 0 && (
                      <div className="flex justify-between text-[11px] text-gray-600 mt-0.5">
                        <span>Consumo: {fmtNum(Math.round(medias[p.id] * 10) / 10)} {p.unidade}/dia</span>
                        {medias[p.id] > 0 && atual > 0 && (
                          <span>dura ~{Math.floor(atual / medias[p.id])} dia(s)</span>
                        )}
                      </div>
                    )}
                    {aberto && lotesProduto.length > 0 && (
                      <div className="mt-2 bg-white/70 rounded-lg p-2 space-y-1">
                        {lotesProduto.map((l, i) => {
                          const dias = diasAte(l.validade);
                          return (
                            <div key={`${l.validade}_${l.dataEntrada}_${i}`} className="flex justify-between items-center text-xs">
                              <span className="text-gray-600">
                                {/* nome do armazenamento configurado, em vez do
                                    par de emojis fixo — com "ambiente" na lista,
                                    o floco de neve mentiria */}
                                {acharArmazenamento(prefs, l.armazenamento)?.nome || '—'} · {fmtNum(l.restante)} {p.unidade}
                                <span className="text-gray-500"> • entrou {fmtData(l.dataEntrada)}</span>
                              </span>
                              <span className={`font-bold ${dias < 0 ? 'text-red-600' : dias <= 3 ? 'text-orange-600' : 'text-gray-600'}`}>
                                {dias < 0 ? 'VENCIDO ' : 'vence '}{fmtData(l.validade)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {produtosFiltrados.length === 0 && (
        <div className="text-center text-gray-500 py-12 space-y-3">
          {/* Estoque ZERADO de cadastro era um beco: a tela dizia "nenhum
              produto" e não oferecia caminho nenhum para criar o primeiro —
              quem abria um Estoque Seco novo ficava parado aqui. */}
          <p>{produtosAtivos.length === 0
            ? 'Este estoque ainda não tem nenhum produto cadastrado.'
            : 'Nenhum produto nesta categoria.'}</p>
          {produtosAtivos.length === 0 && pode(sessao, permissoes, 'gerenciarProdutos') && (
            <Link to="/configuracoes?secao=produtos"
              className="inline-block min-h-11 px-5 py-3 rounded-xl bg-polo-navy text-polo-gold font-bold text-sm
                         active:scale-95 transition-transform">
              Cadastrar o primeiro produto
            </Link>
          )}
        </div>
      )}
    </Layout>
  );
}
