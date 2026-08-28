import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import Botao from '../../components/Botao';
import Icon from '../../components/Icons';
import { useApp } from '../../store/AppContext';
import { useUI } from '../../store/UIContext';
import { hoje, fmtData } from '../../utils/formatters';
import { statusEtiqueta, STATUS_ETIQUETA } from '../../utils/etiquetas';
import { armazenamentosAtivos, prazosDoProduto } from '../../utils/armazenamento';

/**
 * Tela inicial do plano Aurum Etiquetas.
 *
 * NÃO é o Dashboard do app completo: aquele é todo saldo, mínimo, crítico e
 * sugestão de compra — nada disso existe aqui, e mostrar cartão vazio de
 * estoque é o que faz um produto parecer a versão capada de outro.
 *
 * A cozinha que só etiqueta faz duas perguntas por dia: "o que vence?" e
 * "preciso imprimir". A tela responde as duas, nessa ordem.
 */
export default function Inicio() {
  const { produtos, etiquetasAvulsas, etiquetasImpressas, prefs } = useApp();
  const { abrirEtiquetas } = useUI();
  const [busca, setBusca] = useState('');
  const hojeISO = hoje();
  const armazenamentos = armazenamentosAtivos(prefs);

  // ── 1. O que vence ────────────────────────────────────────────
  const { vencidas, vencemHoje, vencemAmanha } = useMemo(() => {
    const vivas = (etiquetasImpressas || []).filter(e => statusEtiqueta(e, hojeISO) === 'valida' || statusEtiqueta(e, hojeISO) === 'vencida');
    const amanha = new Date(hojeISO + 'T12:00:00');
    amanha.setDate(amanha.getDate() + 1);
    const amanhaISO = amanha.toISOString().slice(0, 10);
    return {
      vencidas:    vivas.filter(e => e.validade && e.validade < hojeISO),
      vencemHoje:  vivas.filter(e => e.validade === hojeISO),
      vencemAmanha: vivas.filter(e => e.validade === amanhaISO),
    };
  }, [etiquetasImpressas, hojeISO]);

  const precisaAtencao = vencidas.length + vencemHoje.length;

  // ── 2. Imprimir agora ─────────────────────────────────────────
  // Produtos e avulsas na MESMA lista: quem vai etiquetar não pensa "isso é do
  // catálogo ou é avulso", pensa no nome do que está na mão.
  const paraImprimir = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    const doCatalogo = produtos.filter(p => p.ativo !== false && (p.nome || '').toLowerCase().includes(t))
      .map(p => ({ tipo: 'produto', id: p.id, nome: p.nome, p }));
    const avulsas = (etiquetasAvulsas || []).filter(a => (a.nome || '').toLowerCase().includes(t))
      .map(a => ({ tipo: 'avulsa', id: a.id, nome: a.nome, a }));
    return [...doCatalogo, ...avulsas].slice(0, 12);
  }, [busca, produtos, etiquetasAvulsas]);

  const imprimir = (r) => {
    if (r.tipo === 'produto') {
      abrirEtiquetas([{
        produtoId: r.p.id, nome: r.p.nome, tipoData: 'fabricacao', dataFabricacao: hojeISO,
        armazenamento: armazenamentos[0]?.id || 'congelado',
        prazos: prazosDoProduto(r.p),
        medida: r.p.gramatura ? `${r.p.gramatura} g` : '',
        marca: r.p.marca || '', sif: r.p.sif || '',
        responsavel: prefs.responsavel || '', quantidade: 1,
      }]);
    } else {
      abrirEtiquetas([{
        nome: r.a.nome, tipoData: r.a.tipoData || 'abertura', dataFabricacao: hojeISO,
        armazenamento: null, diasValidade: r.a.diasValidade || 0,
        responsavel: prefs.responsavel || '', quantidade: 1,
      }]);
    }
    setBusca('');
  };

  // ── 3. Impressas hoje (para reimprimir sem procurar) ──────────
  const impressasHoje = useMemo(
    () => (etiquetasImpressas || []).filter(e => e.impressoEm === hojeISO).slice(-6).reverse(),
    [etiquetasImpressas, hojeISO]);

  const semItens = produtos.filter(p => p.ativo !== false).length === 0;

  return (
    <Layout title="Início">
      <div className="space-y-5">

        {/* Primeiro acesso: sem itens não há o que imprimir, e mandar a pessoa
            caçar o cadastro sozinha é onde ela desiste. */}
        {semItens && (
          <div className="bg-white rounded-2xl p-5 text-center border border-polo-gold/40">
            <p className="font-bold text-polo-navy">Comece cadastrando seus itens</p>
            <p className="text-xs text-gray-600 mt-1 mb-4">
              Tem uma lista pronta com mais de 100 itens de cozinha — é só buscar e tocar.
            </p>
            <Link to="/itens"
              className="inline-block bg-polo-navy text-polo-gold font-bold px-5 py-2.5 rounded-xl text-sm">
              Ver itens prontos
            </Link>
          </div>
        )}

        {/* ── Vence ── */}
        <div>
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2 px-1">Validade</p>
          <Link to="/validades"
            className={`block rounded-2xl p-4 border-2 active:scale-[0.99] transition-transform
              ${precisaAtencao > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
            <div className="flex items-center gap-4">
              <span className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
                ${precisaAtencao > 0 ? 'bg-red-100 text-red-700' : 'bg-polo-beige text-polo-navy'}`}>
                <Icon name="validade" size={24} />
              </span>
              <div className="min-w-0">
                {precisaAtencao > 0 ? (
                  <>
                    <p className="font-bold text-red-800">
                      {precisaAtencao} {precisaAtencao === 1 ? 'etiqueta precisa' : 'etiquetas precisam'} de atenção
                    </p>
                    <p className="text-xs text-red-700 mt-0.5">
                      {vencidas.length > 0 && `${vencidas.length} ${vencidas.length === 1 ? 'vencida' : 'vencidas'}`}
                      {vencidas.length > 0 && vencemHoje.length > 0 && ' · '}
                      {vencemHoje.length > 0 && `${vencemHoje.length} ${vencemHoje.length === 1 ? 'vence' : 'vencem'} hoje`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-polo-navy">Nada vencendo hoje</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {vencemAmanha.length > 0
                        ? `${vencemAmanha.length} ${vencemAmanha.length === 1 ? 'vence' : 'vencem'} amanhã`
                        : 'Toque para ver tudo que está impresso'}
                    </p>
                  </>
                )}
              </div>
            </div>
          </Link>
        </div>

        {/* ── Imprimir agora ── */}
        <div>
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2 px-1">Imprimir agora</p>
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar o que vai etiquetar…"
              aria-label="Buscar item para imprimir etiqueta"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" />

            {busca.trim() && paraImprimir.length === 0 && (
              <p className="text-xs text-gray-600 text-center py-2">
                Nada encontrado. <Link to="/itens" className="text-polo-navy font-semibold underline underline-offset-2">Cadastrar “{busca.trim()}”</Link>
              </p>
            )}

            {paraImprimir.map(r => (
              <div key={`${r.tipo}_${r.id}`} className="flex items-center gap-3 border-t border-gray-100 pt-2.5 first:border-0 first:pt-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900 truncate">{r.nome}</span>
                  {r.tipo === 'avulsa' && <span className="block text-[11px] text-gray-500">etiqueta avulsa</span>}
                </span>
                <button onClick={() => imprimir(r)} aria-label={`Imprimir etiqueta de ${r.nome}`}
                  className="text-xs font-bold text-polo-gold bg-polo-navy rounded-lg px-3 py-2 flex-shrink-0">
                  Imprimir
                </button>
              </div>
            ))}

            {!busca.trim() && (
              <Link to="/etiquetas"
                className="block text-center text-xs text-gray-600 underline underline-offset-2 pt-1">
                ou ver todos os itens por categoria
              </Link>
            )}
          </div>
        </div>

        {/* ── Impressas hoje ── */}
        {impressasHoje.length > 0 && (
          <div>
            <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2 px-1">Impressas hoje</p>
            <div className="bg-white rounded-2xl divide-y divide-gray-100">
              {impressasHoje.map(e => {
                const st = statusEtiqueta(e, hojeISO);
                return (
                  <div key={e.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-900 truncate">{e.nome}</span>
                      <span className="block text-[11px] text-gray-500">
                        {e.validade ? `vence ${fmtData(e.validade)}` : 'sem vencimento'}
                        {e.responsavel && ` · ${e.responsavel}`}
                      </span>
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_ETIQUETA[st]?.cor || ''}`}>
                      {STATUS_ETIQUETA[st]?.label || st}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!semItens && (
          <Link to="/itens" className="block">
            <Botao variante="secundario">Gerenciar meus itens</Botao>
          </Link>
        )}
      </div>
    </Layout>
  );
}
