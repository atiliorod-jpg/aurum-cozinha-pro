import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Filtros from '../components/ui/Filtros';
import Selo from '../components/ui/Selo';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { statusEstoque, corStatus, pctBarra } from '../utils/calculos';
import { calcSugestoesMinMax, produtosDivergentes } from '../utils/sugestoes';
import { mediaDiariaSaidas } from '../utils/analise';
import { diasAte } from '../utils/datas';
import { fmtNum, fmtData, plural } from '../utils/formatters';
import { temRecurso } from '../utils/modulos';
import { acharArmazenamento } from '../utils/armazenamento';
import { pode } from '../utils/permissoes';
import { ativoNoEstoque } from '../utils/itens';

// situação → as que entram no filtro
const SITUACOES = {
  abaixo: (s) => s === 'critico' || s === 'zerado',
  acima: (s) => s === 'excesso',
  normal: (s) => s === 'ok',
};

/**
 * O ESTOQUE COMPLETO (Lote 6 da auditoria, 15/10/2026).
 *
 * Morava no Início, abaixo de guia, calculadora, lista de compras, produzir
 * hoje e vencendo: duas telas e meia de rolagem até o item (U4). O Início
 * ficou com o que pede ação agora; a lista inteira, com filtros e lotes, é
 * esta tela. Os três números do topo também são filtro ("Abaixo do mínimo"
 * mostra só esses) — o Início manda para cá já filtrado.
 *
 * ⚠️ NA FINALIZAÇÃO NÃO HÁ METAS (D5): o mínimo e o máximo do catálogo são os
 * da Produção. Aqui ela vê só quanto tem e os lotes, sem selo nem barra.
 */
export default function Estoque() {
  const { produtos, setProdutos, saidasParaConsumo, producoes, estoque, lotes, categorias, prefs, modulo, permissoes } = useApp();
  const { sessao } = useAuth();
  const { toast } = useUI();
  const comMetas = temRecurso(modulo, 'metasDeEstoque');
  const situacaoDaUrl = new URLSearchParams(useLocation().search).get('situacao');
  const [situacao, setSituacao] = useState(comMetas && SITUACOES[situacaoDaUrl] ? situacaoDaUrl : '');
  const [catAtiva, setCatAtiva] = useState('TODOS');
  const [subAtivo, setSubAtivo] = useState('TODOS');
  const [expandido, setExpandido] = useState(null); // produtoId com lotes abertos
  const [verSugestoes, setVerSugestoes] = useState(false);
  // Finalização: a bancada só recebe parte do catálogo da Produção; o item que
  // nunca chegou aparecia zerado na lista inteira. Fica escondido até pedir.
  const [verZerados, setVerZerados] = useState(false);

  // ⚠️ Só o que CONTROLA estoque (Lote 4): o item só de etiqueta não tem
  // saldo, e aqui viraria um card "sem meta" com zero para sempre. A gravação
  // (aplicarSugestao) continua sobre `produtos`, a lista inteira.
  const produtosAtivos = useMemo(() => produtos.filter(ativoNoEstoque), [produtos]);
  const temSoEtiqueta = produtosAtivos.length === 0 && produtos.some(p => p.ativo);
  const statusDe = (p) => statusEstoque(estoque[p.id] ?? 0, p.min, p.max);
  const medias = useMemo(() => mediaDiariaSaidas(saidasParaConsumo), [saidasParaConsumo]);
  const produtoFinalIds = useMemo(() => new Set(producoes.map(r => r.produtoFinalId)), [producoes]);

  // Sugestões de mín/máx pela média de saídas (escondidas com o automático ligado)
  const sugestoes = useMemo(
    () => (comMetas ? calcSugestoesMinMax(produtos, saidasParaConsumo, undefined, prefs.diasMin || 3, prefs.diasMax || 6, prefs.minMaxPorDiaSemana) : {}),
    [comMetas, produtos, saidasParaConsumo, prefs.diasMin, prefs.diasMax, prefs.minMaxPorDiaSemana]);
  const divergentes = useMemo(
    () => (comMetas && !prefs.autoMinMax ? produtosDivergentes(produtos, sugestoes) : []),
    [comMetas, produtos, sugestoes, prefs.autoMinMax]);
  const aplicarSugestao = (ids) => {
    const next = produtos.map(p => {
      if (!ids.includes(p.id) || !sugestoes[p.id]) return p;
      return { ...p, min: sugestoes[p.id].min, max: sugestoes[p.id].max };
    });
    setProdutos(next);
    toast(ids.length === 1 ? 'Mínimo e máximo atualizados.' : `Mínimo e máximo de ${plural(ids.length, 'item atualizados', 'itens atualizados')}.`, 'sucesso');
  };

  const totais = {
    normal: produtosAtivos.filter(p => SITUACOES.normal(statusDe(p))).length,
    abaixo: produtosAtivos.filter(p => SITUACOES.abaixo(statusDe(p))).length,
    acima: produtosAtivos.filter(p => SITUACOES.acima(statusDe(p))).length,
  };

  const semSaldo = comMetas ? [] : produtosAtivos.filter(p => (estoque[p.id] ?? 0) === 0);
  const daSituacao = situacao
    ? produtosAtivos.filter(p => SITUACOES[situacao](statusDe(p)))
    : (!comMetas && !verZerados ? produtosAtivos.filter(p => (estoque[p.id] ?? 0) !== 0) : produtosAtivos);
  // subgrupos disponíveis dentro da categoria escolhida
  const subgruposDaCategoria = useMemo(() => {
    const base = catAtiva === 'TODOS' ? produtosAtivos : produtosAtivos.filter(p => p.categoria === catAtiva);
    const sgs = [...new Set(base.map(p => (p.subgrupo || '').trim()).filter(Boolean))].sort();
    return sgs.length ? ['TODOS', ...sgs] : [];
  }, [produtosAtivos, catAtiva]);
  const produtosFiltrados = catAtiva === 'TODOS' ? daSituacao : daSituacao.filter(p => p.categoria === catAtiva);
  const produtosVisiveis = subAtivo === 'TODOS' || !subgruposDaCategoria.length
    ? produtosFiltrados
    : produtosFiltrados.filter(p => (p.subgrupo || '').trim() === subAtivo);

  const contador = (chave, n, rotulo, cor) => (
    <button type="button" onClick={() => setSituacao(situacao === chave ? '' : chave)} aria-pressed={situacao === chave}
      className={`${cor} text-white rounded-xl p-3 text-center min-h-11 transition-transform active:scale-[0.98]
        ${situacao === chave ? 'ring-4 ring-polo-gold' : situacao ? 'opacity-60' : ''}`}>
      <span className="block text-2xl font-bold">{n}</span>
      <span className="block text-xs">{rotulo}</span>
    </button>
  );

  return (
    <Layout title="Estoque">
      {comMetas && produtosAtivos.length > 0 && (
        <>
          {/* os três números são filtro: tocar de novo tira o filtro */}
          <div className="grid grid-cols-3 gap-2 mb-2" role="group" aria-label="Filtrar pela situação">
            {contador('normal', totais.normal, 'Normal', 'bg-green-700')}
            {contador('abaixo', totais.abaixo, 'Abaixo do mínimo', 'bg-orange-700')}
            {contador('acima', totais.acima, 'Acima do máximo', 'bg-blue-700')}
          </div>
          {situacao && (
            <button type="button" onClick={() => setSituacao('')}
              className="min-h-11 text-sm font-semibold text-polo-navy underline underline-offset-2 mb-2">
              Mostrar todos os itens
            </button>
          )}
        </>
      )}

      {/* Sugestão de mín/máx pela média de saídas */}
      {divergentes.length > 0 && (
        <div className="bg-polo-beige border border-polo-gold/50 rounded-xl p-3 my-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-polo-navy flex-1">
              <strong>{plural(divergentes.length, 'item', 'itens')}</strong> com mínimo e máximo fora do consumo real (média dos últimos {sugestoes[divergentes[0].id]?.dias} dias).
            </p>
            <button onClick={() => setVerSugestoes(v => !v)}
              className="min-h-11 px-2 text-sm font-bold text-polo-navy underline flex-shrink-0">
              {verSugestoes ? 'Ocultar' : 'Ver'}
            </button>
            <button onClick={() => aplicarSugestao(divergentes.map(p => p.id))}
              className="min-h-11 bg-polo-navy text-polo-gold text-sm font-bold px-3 rounded-lg flex-shrink-0">
              Aplicar todos
            </button>
          </div>
          {verSugestoes && (
            <div className="mt-2 space-y-1.5">
              {divergentes.map(p => {
                const s = sugestoes[p.id];
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 bg-white/70 rounded-lg pl-3 pr-1 py-1">
                    <div className="text-xs min-w-0">
                      <span className="font-semibold text-gray-800">{p.nome}</span>
                      <span className="text-gray-600 block">
                        Mínimo {fmtNum(p.min)} → <strong>{fmtNum(s.min)}</strong> · Máximo {fmtNum(p.max)} → <strong>{fmtNum(s.max)}</strong> {p.unidade}
                      </span>
                    </div>
                    <button onClick={() => aplicarSugestao([p.id])} aria-label={`Aplicar a sugestão em ${p.nome}`}
                      className="min-h-11 text-sm font-bold text-polo-navy px-3 rounded-lg flex-shrink-0">
                      Aplicar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Conta nova: explica por que ainda não há sugestões de mín/máx (~15 dias) */}
      {comMetas && !prefs.autoMinMax && divergentes.length === 0 && Object.keys(sugestoes).length === 0 && produtosAtivos.length > 0 && (
        <p className="text-xs text-gray-600 px-1 mb-3">
          Sugestões de mínimo e máximo aparecem depois de ~15 dias de saídas registradas.
        </p>
      )}

      {produtosAtivos.length > 0 && (
        <Filtros rotulo="Categoria" todos={null} valor={catAtiva} aoTrocar={setCatAtiva} className="mb-3"
          opcoes={['TODOS', ...categorias.filter(c => produtosAtivos.some(p => p.categoria === c))].map(cat => [cat, cat === 'TODOS' ? 'Todos' : cat])} />
      )}

      {/* Subgrupos: só aparecem quando a categoria escolhida tem mais de um.
          Categoria grande (PROTEÍNAS com 30 itens) fica navegável sem virar
          uma lista infinita; quem não usa subgrupo não vê nada mudar. */}
      {subgruposDaCategoria.length > 1 && (
        <Filtros rotulo="Subgrupo" todos={null} ativo="dourado" valor={subAtivo} aoTrocar={setSubAtivo} className="mb-3"
          opcoes={subgruposDaCategoria.map(sg => [sg, sg === 'TODOS' ? 'Todos os subgrupos' : sg])} />
      )}

      <div className="space-y-2">
        {categorias.filter(c => catAtiva === 'TODOS' || c === catAtiva).map(cat => {
          const prods = produtosVisiveis.filter(p => p.categoria === cat);
          if (!prods.length) return null;
          return (
            <div key={cat}>
              <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wider mb-1 mt-3">{cat}</h2>
              {prods.map(p => {
                const atual = estoque[p.id] ?? 0;
                const status = comMetas ? statusDe(p) : 'sem-meta';
                const cor = corStatus(status);
                const pct = pctBarra(atual, p.max);
                const lotesProduto = lotes[p.id] || [];
                const aberto = expandido === p.id;
                return (
                  <div key={p.id}
                    {...(lotesProduto.length ? {
                      role: 'button', tabIndex: 0, 'aria-expanded': aberto,
                      'aria-label': `${p.nome}: ${plural(lotesProduto.length, 'lote', 'lotes')}, toque para ${aberto ? 'recolher' : 'ver'}`,
                      onClick: () => setExpandido(aberto ? null : p.id),
                      onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandido(aberto ? null : p.id); } },
                    } : {})}
                    className={`${comMetas ? cor.bg : 'bg-white'} rounded-xl p-3 mb-2 border border-white/60 ${lotesProduto.length ? 'cursor-pointer active:scale-[0.995] transition-transform' : ''}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-sm text-gray-800 flex items-center gap-1 flex-wrap min-w-0">
                        {p.nome}
                        {produtoFinalIds.has(p.id) && (
                          <span className="text-xs font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full">
                            produzido
                          </span>
                        )}
                        {lotesProduto.length > 0 && (
                          <span className="text-xs font-bold text-polo-navy bg-white/70 px-1.5 py-0.5 rounded-full">
                            {plural(lotesProduto.length, 'lote', 'lotes')} {aberto ? '▾' : '▸'}
                          </span>
                        )}
                      </span>
                      {comMetas ? <Selo status={status} /> : (
                        <span className="text-sm font-bold text-polo-navy flex-shrink-0">{fmtNum(atual)} {p.unidade}</span>
                      )}
                    </div>
                    {comMetas && (
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
                    )}
                    {comMetas && (p.min > 0 || p.max > 0) && (
                      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                        <span>Mín: {fmtNum(p.min)} {p.unidade}</span>
                        <span>Máx: {fmtNum(p.max)} {p.unidade}</span>
                      </div>
                    )}
                    {/* Consumo médio por dia — a pergunta que a cozinha faz antes
                        de pedir reposição ("dura quanto?"). Só aparece com
                        histórico suficiente: mediaDiariaSaidas exige 3+ dias
                        DAQUELE item, para não arriscar uma média com dois
                        lançamentos e sugerir compra errada. */}
                    {medias[p.id] > 0 && (
                      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                        <span>Consumo: {fmtNum(Math.round(medias[p.id] * 10) / 10)} {p.unidade}/dia</span>
                        {atual > 0 && <span>dura ~{plural(Math.floor(atual / medias[p.id]), 'dia', 'dias')}</span>}
                      </div>
                    )}
                    {aberto && lotesProduto.length > 0 && (
                      <div className="mt-2 bg-white/70 rounded-lg p-2 space-y-1">
                        {lotesProduto.map((l, i) => {
                          const dias = diasAte(l.validade);
                          return (
                            <div key={`${l.validade}_${l.dataEntrada}_${i}`} className="flex justify-between items-center gap-2 text-xs">
                              <span className="text-gray-700">
                                {/* nome do armazenamento configurado: com "ambiente"
                                    na lista, um floco de neve fixo mentiria */}
                                {acharArmazenamento(prefs, l.armazenamento)?.nome || '—'} · {fmtNum(l.restante)} {p.unidade}
                                <span className="text-gray-600"> · entrou {fmtData(l.dataEntrada)}</span>
                              </span>
                              <span className={`font-bold flex-shrink-0 ${dias < 0 ? 'text-red-700' : dias <= 3 ? 'text-orange-700' : 'text-gray-700'}`}>
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

      {semSaldo.length > 0 && (
        <button type="button" onClick={() => setVerZerados(v => !v)}
          className="w-full min-h-11 mt-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-polo-navy">
          {verZerados ? 'Esconder os itens sem saldo' : `Mostrar também ${plural(semSaldo.length, 'item sem saldo', 'itens sem saldo')}`}
        </button>
      )}

      {produtosVisiveis.length === 0 && (
        <div className="text-center text-gray-600 py-12 space-y-3">
          {/* Estoque ZERADO de cadastro era um beco: a tela dizia "nenhum
              produto" e não oferecia caminho nenhum para criar o primeiro —
              quem abria um Estoque Seco novo ficava parado aqui. */}
          <p>{temSoEtiqueta
            ? 'Os itens cadastrados aqui são só de etiqueta. Para contar o estoque de um deles, ligue “Controla estoque” na ficha dele, em Meus itens.'
            : produtosAtivos.length === 0
              ? 'Este estoque ainda não tem nenhum produto cadastrado.'
              : situacao ? 'Nenhum item nesta situação.'
                : semSaldo.length && !verZerados ? 'Nada com saldo aqui agora.' : 'Nenhum produto nesta categoria.'}</p>
          {produtosAtivos.length === 0 && pode(sessao, permissoes, 'gerenciarProdutos') && (
            <Link to="/itens"
              className="inline-block min-h-11 px-5 py-3 rounded-xl bg-polo-navy text-polo-gold font-bold text-sm
                         active:scale-95 transition-transform">
              {temSoEtiqueta ? 'Abrir Meus itens' : 'Cadastrar o primeiro produto'}
            </Link>
          )}
        </div>
      )}
    </Layout>
  );
}
