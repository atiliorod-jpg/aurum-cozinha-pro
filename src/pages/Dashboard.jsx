import { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { statusEstoque } from '../utils/calculos';
import { mediaDiariaSaidas, previsaoRuptura, listaDeCompras } from '../utils/analise';
import { diasAte } from '../utils/datas';
import { lotesVencendo } from '../utils/lotes';
import { producoesIncompletas } from '../utils/producao';
import { fmtNum, fmtData, hoje, plural } from '../utils/formatters';
import { somaPorUnidade } from '../utils/relatorios';
import { totaisImpressos } from '../utils/etiquetas';
import { turnoAberto } from '../utils/turno';
import GuideTour from '../components/GuideTour';
import BoasVindasCompleto from '../components/BoasVindasCompleto';
import { temRecurso } from '../utils/modulos';
import { pode } from '../utils/permissoes';
import { ativoNoEstoque } from '../utils/itens';

/**
 * INÍCIO — o que pede ação AGORA, em cada cozinha (Lote 6 da auditoria,
 * 15/10/2026).
 *
 * ⚠️ ERA TUDO NUMA TELA SÓ (U4): guia do turno, três contadores, calculadora,
 * lista de compras, produzir hoje, vencendo e o estoque inteiro — duas telas
 * e meia de rolagem, e o urgente se perdia no meio. Agora:
 *   • Produção — produzir hoje, vencendo, risco de faltar, lista de compras,
 *     etiquetas de hoje;
 *   • Finalização — fechar o turno e vencendo, SEM os alarmes de mínimo,
 *     que eram as metas da Produção (D5);
 *   • Seco — lista de compras e vencendo.
 * O estoque completo (com filtros e lotes) é a tela Estoque; a calculadora foi
 * para a Produção, que é onde se decide quanto produzir.
 */
export default function Dashboard() {
  const { produtos, saidas, saidasParaConsumo, entradas, desperdicio, compras, aparas, producoes, estoque, lotes,
          listaManual, modulo, permissoes, etiquetasImpressas, recebimentos, ajustes } = useApp();
  const { sessao } = useAuth();
  const navigate = useNavigate();
  const dataHoje = hoje();
  const comMetas = temRecurso(modulo, 'metasDeEstoque');

  // Lotes que vencem em até 5 dias. Vêm do contexto (recebimentos, compras do
  // Seco e contagens), reconciliados com o estoque: produto zerado (ex.: por
  // contagem física) não gera alerta fantasma.
  const vencendo = useMemo(() => lotesVencendo(lotes, produtos, estoque, diasAte), [produtos, lotes, estoque]);

  // Produção incompleta: saída interna gravada sem a entrada do produto final
  // (falha entre os dois passos do par) — ingredientes baixados "no vazio"
  const prodIncompletas = useMemo(() => producoesIncompletas(entradas, saidas), [entradas, saidas]);

  // Previsão de ruptura (ritmo dos últimos 14 dias). `saidasParaConsumo`: na
  // Finalização é o consumo apurado no fechamento de turno — a mesma conta nas
  // três cozinhas.
  const medias = useMemo(() => mediaDiariaSaidas(saidasParaConsumo), [saidasParaConsumo]);
  const emRisco = useMemo(
    () => previsaoRuptura(produtos, estoque, medias).filter(x => x.dias <= 3),
    [produtos, estoque, medias]);
  const lista = useMemo(() => listaDeCompras(produtos, estoque, compras, aparas, desperdicio), [produtos, estoque, compras, aparas, desperdicio]);

  // Receitas cujo produto final está abaixo do mínimo → "Produzir hoje"
  const produzirHoje = useMemo(() => producoes
    .map(r => {
      const produto = produtos.find(p => p.id === r.produtoFinalId);
      if (!ativoNoEstoque(produto)) return null;
      const atual = estoque[r.produtoFinalId] ?? 0;
      if (produto.min > 0 && atual >= produto.min) return null;
      return { receita: r, produto, atual };
    })
    .filter(Boolean),
  [producoes, produtos, estoque]);

  // Estoque negativo: quase sempre é um lançamento faltando (entrada/produção não registrada)
  const negativos = useMemo(
    () => produtos
      .filter(p => ativoNoEstoque(p) && (estoque[p.id] ?? 0) < 0)
      .map(p => ({ p, atual: estoque[p.id] ?? 0 }))
      .sort((a, b) => a.atual - b.atual),
    [produtos, estoque]);

  // ⚠️ Só o que CONTROLA estoque (Lote 4): o item só de etiqueta não tem saldo
  const produtosAtivos = produtos.filter(ativoNoEstoque);
  const temSoEtiqueta = produtosAtivos.length === 0 && produtos.some(p => p.ativo);
  const situacao = (p) => statusEstoque(estoque[p.id] ?? 0, p.min, p.max);
  const totais = {
    normal: produtosAtivos.filter(p => situacao(p) === 'ok').length,
    abaixo: produtosAtivos.filter(p => ['critico', 'zerado'].includes(situacao(p))).length,
    acima: produtosAtivos.filter(p => situacao(p) === 'excesso').length,
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

  // quantas etiquetas saíram hoje (contando o papel), onde se imprime
  const etiquetasHoje = temRecurso(modulo, 'etiquetas') && pode(sessao, permissoes, 'verImpressas')
    ? totaisImpressos(etiquetasImpressas, dataHoje).hoje : null;
  // Finalização: o que está na bancada para contar no fechamento
  const naBancada = useMemo(() => (temRecurso(modulo, 'fecharTurno')
    ? turnoAberto({ produtos, recebimentos, perdas: desperdicio, fechamentos: ajustes }).linhas.length : 0),
  [modulo, produtos, recebimentos, desperdicio, ajustes]);

  return (
    <Layout title="Início">
      {/* Quem acabou de subir de plano vê primeiro o que falta fazer: o guia
          do turno pede produção e saída, e sem contagem nenhuma das duas
          significa coisa alguma no estoque. */}
      <BoasVindasCompleto />
      {/* O guia do turno vive AQUI, não no Layout: é o progresso do dia. */}
      <GuideTour />

      <p className="text-xs text-gray-600 mb-2">Atualizado em: {fmtData(dataHoje)}</p>

      {/* Fechar o turno é a ação central da Finalização */}
      {temRecurso(modulo, 'fecharTurno') && (
        <Link to="/fechar-turno"
          className="block bg-polo-navy rounded-xl p-4 mb-4 active:scale-[0.99] transition-transform">
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-polo-gold">Fechar o turno</span>
            <span aria-hidden="true" className="text-polo-gold text-lg">›</span>
          </span>
          <span className="block text-xs text-white/80 mt-0.5">
            {naBancada ? `${plural(naBancada, 'item', 'itens')} na bancada para contar.` : 'Nada recebido da produção neste turno ainda.'}
          </span>
        </Link>
      )}

      {descarteHoje.houve && (
        <button onClick={() => navigate('/aparas')}
          className="w-full text-left mb-4 min-h-11 px-3 py-2 rounded-xl bg-white border border-gray-200
                     flex items-center justify-between gap-2 active:scale-[0.99] transition-transform">
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

      {/* Estoque negativo — provável lançamento faltando */}
      {negativos.length > 0 && (
        <div className="bg-red-100 border border-red-400 rounded-xl p-3 mb-4">
          <p className="text-xs font-bold text-red-800 mb-2">
            {plural(negativos.length, 'item', 'itens')} com estoque negativo: provável entrada ou produção não registrada
          </p>
          <div className="space-y-1">
            {negativos.map(({ p, atual }) => (
              <div key={p.id} className="flex justify-between items-center gap-2 text-xs">
                <span className="font-medium text-gray-700">{p.nome}</span>
                <span className="font-bold text-red-700 flex-shrink-0">{fmtNum(atual)} {p.unidade}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-red-800 mt-2">Confira se faltou registrar uma entrada ou produção, ou ajuste pela Contagem.</p>
        </div>
      )}

      {/* Produzir hoje — receitas com produto final abaixo do mínimo */}
      {temRecurso(modulo, 'producao') && produzirHoje.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2">Produzir hoje</h2>
          <div className="space-y-2">
            {produzirHoje.map(({ receita, produto, atual }) => (
              <button key={receita.id}
                onClick={() => navigate(`/producao?r=${receita.id}`)}
                className="w-full bg-white rounded-xl p-3 flex items-center justify-between border border-polo-gold/40 active:scale-[0.99] transition-transform text-left">
                <span className="min-w-0">
                  <span className="block font-semibold text-sm text-polo-navy">{produto?.nome || receita.nome}</span>
                  <span className="block text-xs text-gray-600 mt-0.5">
                    Estoque: <span className={`font-semibold ${atual <= 0 ? 'text-red-700' : 'text-orange-700'}`}>{fmtNum(atual)} {produto?.unidade}</span>
                    {produto?.min > 0 && <> · mín {fmtNum(produto.min)} {produto?.unidade}</>}
                  </span>
                </span>
                <span className="flex-shrink-0 ml-3 bg-polo-navy text-polo-gold font-bold text-xs px-3 py-2 rounded-lg">
                  Produzir →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Produção incompleta — ingredientes baixados sem entrada do produto final */}
      {temRecurso(modulo, 'producao') && prodIncompletas.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 mb-4">
          <p className="text-xs font-bold text-red-800 mb-1">Produção pela metade</p>
          <p className="text-xs text-red-800 mb-2">
            {prodIncompletas.length === 1
              ? '1 produção ficou pela metade: os ingredientes saíram, o item produzido não entrou.'
              : `${prodIncompletas.length} produções ficaram pela metade: os ingredientes saíram, o item produzido não entrou.`}
            {' '}Remova no Histórico e registre de novo.
          </p>
          <button onClick={() => navigate('/historico')}
            className="min-h-11 text-sm font-bold text-white bg-red-700 rounded-lg px-3">
            Abrir Histórico →
          </button>
        </div>
      )}

      {/* Lotes vencendo — usar primeiro. É um ATALHO, não só um aviso: o
          alerta que terminava nele obrigava a achar Validades no meio do serviço. */}
      {vencendo.length > 0 && (
        <Link to="/validades"
          className="block bg-orange-50 border border-orange-300 rounded-xl p-3 mb-4 active:scale-[0.99] transition-transform">
          <span className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-orange-800">Usar primeiro: lotes vencendo</span>
            <span className="text-xs font-bold text-orange-800">ver todas →</span>
          </span>
          <span className="block space-y-1">
            {vencendo.map(({ p, lote, dias }, i) => (
              <span key={`${p.id}-${i}`} className="flex justify-between items-center gap-2 text-xs">
                <span className="font-medium text-gray-700">{p.nome} <span className="text-gray-600">({fmtNum(lote.restante)} {p.unidade})</span></span>
                <span className={`font-bold flex-shrink-0 ${dias < 0 ? 'text-red-700' : dias <= 2 ? 'text-orange-800' : 'text-amber-800'}`}>
                  {dias < 0 ? `VENCIDO (${fmtData(lote.validade)})` : dias === 0 ? 'vence HOJE' : `vence em ${dias}d (${fmtData(lote.validade)})`}
                </span>
              </span>
            ))}
          </span>
        </Link>
      )}

      {/* Previsão de ruptura — leva à lista de compras: quem vê "acaba hoje" quer comprar */}
      {emRisco.length > 0 && (
        <Link to={temRecurso(modulo, 'listaCompras') ? '/compras' : '/estoque'} state={{ tab: 'lista' }}
          className="block bg-red-50 border border-red-300 rounded-xl p-3 mb-4 active:scale-[0.99] transition-transform">
          <span className="text-xs font-bold text-red-800 mb-2 flex items-center justify-between">
            <span>Risco de faltar (no ritmo atual)</span>
            <span aria-hidden="true">›</span>
          </span>
          <span className="block space-y-1">
            {emRisco.map(({ p, dias }) => (
              <span key={p.id} className="flex justify-between items-center gap-2 text-xs">
                <span className="font-medium text-gray-700">{p.nome} <span className="text-gray-600">({fmtNum(estoque[p.id] ?? 0)} {p.unidade})</span></span>
                <span className="font-bold text-red-700 flex-shrink-0">
                  {dias < 1 ? 'acaba HOJE' : `acaba em ~${plural(Math.ceil(dias), 'dia', 'dias')}`}
                </span>
              </span>
            ))}
          </span>
        </Link>
      )}

      {/* Lista de compras (automática + manual). Gate pelo recurso: a
          Finalização não compra, e o botão levava a uma tela que não existe lá. */}
      {temRecurso(modulo, 'listaCompras') && (lista.length > 0 || listaManual.length > 0) && (
        <button onClick={() => navigate('/compras', { state: { tab: 'lista' } })}
          className="w-full flex items-center justify-between bg-polo-navy text-white rounded-xl px-4 py-3 mb-4 active:scale-[0.99] transition-transform">
          <span className="text-sm font-semibold text-left">
            Lista de compras —
            {lista.length > 0 && <> <strong className="text-polo-gold">{lista.length}</strong> abaixo do mínimo</>}
            {lista.length > 0 && listaManual.length > 0 && ' + '}
            {listaManual.length > 0 && <><strong className="text-polo-gold">{listaManual.length}</strong> {listaManual.length === 1 ? 'manual' : 'manuais'}</>}
          </span>
          <span aria-hidden="true" className="text-polo-gold text-lg">›</span>
        </button>
      )}

      {/* Etiquetas que saíram hoje — o "últimas etiquetas" do plano */}
      {etiquetasHoje != null && (
        <Link to="/impressas"
          className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-xl px-4 min-h-11 py-3 mb-4 active:scale-[0.99] transition-transform">
          <span className="text-sm font-semibold text-gray-800">Etiquetas impressas hoje</span>
          <span className="text-sm font-bold text-polo-navy">{etiquetasHoje} <span aria-hidden="true">›</span></span>
        </Link>
      )}

      {/* O estoque completo é outra tela (com filtros e lotes); aqui, o resumo */}
      {produtosAtivos.length > 0 ? (
        <Link to="/estoque"
          className="block bg-white border border-gray-200 rounded-xl p-4 mb-4 active:scale-[0.99] transition-transform">
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-polo-navy">
              {comMetas ? 'Estoque completo' : 'Estoque da bancada'}
            </span>
            <span className="text-sm font-bold text-polo-navy">ver tudo <span aria-hidden="true">›</span></span>
          </span>
          {comMetas ? (
            <span className="mt-3 grid grid-cols-3 gap-2 text-center">
              <span className="rounded-lg bg-green-700 text-white py-2"><span className="block text-xl font-bold">{totais.normal}</span><span className="block text-xs">Normal</span></span>
              <span className="rounded-lg bg-orange-700 text-white py-2"><span className="block text-xl font-bold">{totais.abaixo}</span><span className="block text-xs">Abaixo do mínimo</span></span>
              <span className="rounded-lg bg-blue-700 text-white py-2"><span className="block text-xl font-bold">{totais.acima}</span><span className="block text-xs">Acima do máximo</span></span>
            </span>
          ) : (
            <span className="block text-xs text-gray-600 mt-0.5">
              {plural(produtosAtivos.filter(p => (estoque[p.id] ?? 0) > 0).length, 'item com saldo', 'itens com saldo')}, com os lotes e a validade de cada um.
            </span>
          )}
        </Link>
      ) : (
        <div className="text-center text-gray-600 py-12 space-y-3">
          {/* Estoque ZERADO de cadastro era um beco: a tela dizia "nenhum
              produto" e não oferecia caminho nenhum para criar o primeiro —
              quem abria um Estoque Seco novo ficava parado aqui. */}
          <p>{temSoEtiqueta
            ? 'Os itens cadastrados aqui são só de etiqueta. Para contar o estoque de um deles, ligue “Controla estoque” na ficha dele, em Meus itens.'
            : 'Este estoque ainda não tem nenhum produto cadastrado.'}</p>
          {pode(sessao, permissoes, 'gerenciarProdutos') && (
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
