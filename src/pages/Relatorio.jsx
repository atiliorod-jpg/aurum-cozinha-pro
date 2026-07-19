import { useState, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { DESTINOS_APARA, MOTIVOS_DESPERDICIO } from '../data/produtos';
import { filtrarPorPeriodo, totalPorProduto } from '../utils/calculos';
import { saidasPorDia, topProdutosSaida, somaPorCampo, rendimentoPorFornecedor } from '../utils/analise';
import { saidasPorDestinoDia, chegadasPorDia, rendimentoPorItem, producaoPorItem } from '../utils/relatorios';
import { fmtData, fmtNum, hoje } from '../utils/formatters';
import { addDias } from '../utils/datas';
import { BarrasEmpilhadas, Donut, LinhaDias, BarraRendimento } from '../components/Charts';

const rotuloMotivo = (cod) => MOTIVOS_DESPERDICIO.find(m => m.cod === cod)?.label || cod;

// Cartão de seção do relatório (escopo de módulo: componente definido dentro
// do render é recriado a cada render e perde estado — react-hooks/static-components)
const Card = ({ titulo, children }) => (
  <div className="bg-white rounded-xl p-4 mb-4">
    <h2 className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-3">{titulo}</h2>
    {children}
  </div>
);

export default function Relatorio() {
  const { produtos, compras, entradas, saidas, aparas, desperdicio, estoque, categorias, destinos, locais } = useApp();
  // destinos criados pelo usuário em Config também precisam aparecer com o nome certo
  const rotuloDestino = useCallback((cod) =>
    destinos.find(d => d.cod === cod)?.label || DESTINOS_APARA.find(d => d.cod === cod)?.label || cod, [destinos]);
  const { sessao } = useAuth();
  const hj = hoje();
  const primeiroDoMes = `${hj.slice(0, 8)}01`;
  // Seletor único de período. 'custom' abre os campos de data manuais.
  const [periodo, setPeriodo] = useState('7d'); // hoje | 7d | quinzena | mes | custom
  const [inicio, setInicio] = useState(addDias(hj, -6));
  const [fim, setFim] = useState(hj);

  const rangePreset = {
    hoje: [hj, hj],
    '7d': [addDias(hj, -6), hj],
    quinzena: [addDias(hj, -14), hj],
    mes: [primeiroDoMes, hj],
  };
  const [rIni, rFim] = periodo === 'custom' ? [inicio, fim] : rangePreset[periodo];

  const comprasF = useMemo(() => filtrarPorPeriodo(compras, rIni, rFim), [compras, rIni, rFim]);
  const entradasF = useMemo(() => filtrarPorPeriodo(entradas, rIni, rFim), [entradas, rIni, rFim]);
  const saidasF = useMemo(() => filtrarPorPeriodo(saidas, rIni, rFim), [saidas, rIni, rFim]);
  const aparasF = useMemo(() => filtrarPorPeriodo(aparas, rIni, rFim), [aparas, rIni, rFim]);
  const perdasF = useMemo(() => filtrarPorPeriodo(desperdicio, rIni, rFim), [desperdicio, rIni, rFim]);

  const totalEntradas = useMemo(() => totalPorProduto(entradasF), [entradasF]);
  const totalSaidas = useMemo(() => totalPorProduto(saidasF), [saidasF]);
  const porDestinoDia = useMemo(() => saidasPorDestinoDia(saidasF, produtos, locais), [saidasF, produtos, locais]);
  const chegadas = useMemo(() => chegadasPorDia(comprasF), [comprasF]);
  // Saídas por destino (genérico — usa o catálogo de locais editável).
  // Saídas internas para "Produção" são excluídas (são consumo, não envio).
  const totaisPorLocal = useMemo(() => {
    const out = {};
    (locais || []).forEach(l => { out[l.id] = totalPorProduto(saidasF.filter(s => s.destino === l.id)); });
    return out;
  }, [saidasF, locais]);

  // Análises
  const serieDias = useMemo(() => saidasPorDia(saidas, rIni, rFim), [saidas, rIni, rFim]);
  const topProdutos = useMemo(() => topProdutosSaida(produtos, saidasF), [produtos, saidasF]);
  const perdasPorMotivo = useMemo(
    () => somaPorCampo(perdasF, 'motivo').map(x => ({ label: `${x.cod} — ${rotuloMotivo(x.cod)}`, valor: x.valor })),
    [perdasF]);
  const aparasPorDestino = useMemo(
    () => somaPorCampo(aparasF, 'destino').map(x => ({ label: rotuloDestino(x.cod), valor: x.valor })),
    [aparasF, rotuloDestino]);
  // Rendimento considera as compras do período, mas correções associadas de qualquer data
  const fornecedores = useMemo(() => rendimentoPorFornecedor(comprasF, aparas, desperdicio), [comprasF, aparas, desperdicio]);

  const produtosAtivos = produtos.filter(p => p.ativo);

  const somaQtd = (regs) => regs.reduce((s, r) => s + (parseFloat(r.quantidade) || 0), 0);
  const totalAparas = somaQtd(aparasF);
  const totalPerdas = somaQtd(perdasF);
  const perdasEstoque = somaQtd(perdasF.filter(p => p.origem === 'estoque'));

  // Novas visões "por item": rendimento (chegou → aparas/perdas → %) e produção
  const rendItens = useMemo(() => rendimentoPorItem(comprasF, aparas, desperdicio), [comprasF, aparas, desperdicio]);
  const prodItens = useMemo(() => producaoPorItem(entradasF, produtos), [entradasF, produtos]);

  const corRend = (pct) => pct == null ? 'text-gray-400' : pct >= 90 ? 'text-green-700' : pct >= 80 ? 'text-amber-600' : 'text-red-600';
  const nomeRest = sessao?.restauranteNome || '';

  return (
    <Layout
      title="Relatório"
      actions={
        <button onClick={() => window.print()}
          className="bg-polo-gold text-polo-navy text-xs font-bold px-3 py-1.5 rounded-lg">
          🖨️ PDF
        </button>
      }
    >
      {/* Cabeçalho que só aparece na impressão/PDF (o header do app some no print) */}
      <div className="relatorio-print-cabecalho mb-4">
        <p className="text-lg font-bold text-polo-navy">Relatório — {nomeRest || 'Aurum Cozinha Pro'}</p>
        <p className="text-xs text-gray-500">Período: {fmtData(rIni)} a {fmtData(rFim)} · gerado em {fmtData(hj)}</p>
      </div>
      {/* Seletor único de período */}
      <div className="bg-white rounded-xl p-3 mb-4 print:hidden">
        <div className="flex flex-wrap gap-1.5 mb-1">
          {[['hoje', 'Hoje'], ['7d', '7 dias'], ['quinzena', 'Quinzena'], ['mes', 'Mês'], ['custom', 'Personalizado']].map(([v, l]) => (
            <button key={v} onClick={() => setPeriodo(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                ${periodo === v ? 'bg-polo-navy text-polo-gold' : 'bg-gray-100 text-gray-500'}`}>
              {l}
            </button>
          ))}
        </div>
        {periodo === 'custom' ? (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">De</label>
              <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Até</label>
              <input type="date" value={fim} onChange={e => setFim(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 mt-1">{fmtData(rIni)} a {fmtData(rFim)}</p>
        )}
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-700">{comprasF.length}</div>
          <div className="text-xs text-blue-600">Compras recebidas</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-green-700">{entradasF.length}</div>
          <div className="text-xs text-green-600">Entradas na produção</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-amber-700">{fmtNum(totalAparas)}</div>
          <div className="text-xs text-amber-600">Aparas reaproveitadas</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-red-600">{fmtNum(totalPerdas)}</div>
          <div className="text-xs text-red-500">Perdas ({fmtNum(perdasEstoque)} do estoque)</div>
        </div>
      </div>

      {/* Rendimento por item — chegou → aparas/perdas → % (o controle do período) */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <p className="text-sm font-bold text-polo-navy mb-1">📊 Rendimento por item</p>
        <p className="text-[11px] text-gray-500 mb-3">Quanto de cada matéria-prima chegou e quanto virou apara/perda. Rendimento = o que sobrou aproveitável.</p>
        {rendItens.length === 0 ? (
          <div className="text-center text-gray-400 py-6 text-sm">Nenhuma compra registrada neste período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left py-1.5 font-semibold">Item</th>
                  <th className="text-right py-1.5 font-semibold">Chegou</th>
                  <th className="text-right py-1.5 font-semibold">Aparas</th>
                  <th className="text-right py-1.5 font-semibold">Perdas</th>
                  <th className="text-right py-1.5 font-semibold">Rend.</th>
                </tr>
              </thead>
              <tbody>
                {rendItens.map(it => (
                  <tr key={it.item} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-800">{it.item}</td>
                    <td className="py-1.5 text-right text-gray-700">{fmtNum(it.comprado)} {it.unidade}</td>
                    <td className="py-1.5 text-right text-amber-600">{it.aparas ? fmtNum(it.aparas) : '—'}</td>
                    <td className="py-1.5 text-right text-red-500">{it.perdas ? fmtNum(it.perdas) : '—'}</td>
                    <td className={`py-1.5 text-right font-bold ${corRend(it.rendimento)}`}>
                      {it.rendimento == null ? '—' : `${it.rendimento.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-400 pt-2">Rendimento = 100% − (aparas + perdas associadas à compra ÷ total que chegou). Verde ≥ 90%, âmbar ≥ 80%, vermelho abaixo.</p>
          </div>
        )}
      </div>

      {/* Produção por item — quanto se produziu de cada semiacabado */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <p className="text-sm font-bold text-polo-navy mb-1">🍲 Produção por item</p>
        <p className="text-[11px] text-gray-500 mb-3">Quanto de cada item produzido saiu da cozinha no período.</p>
        {prodItens.length === 0 ? (
          <div className="text-center text-gray-400 py-6 text-sm">Nenhuma produção registrada neste período.</div>
        ) : (
          <ul className="text-xs text-gray-700 space-y-1">
            {prodItens.map(it => (
              <li key={it.produtoId} className="flex justify-between border-b border-gray-50 pb-1">
                <span>{it.nome}</span>
                <span className="font-semibold text-polo-navy">{fmtNum(it.quantidade)} {it.unidade}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Card titulo="📈 Saídas por dia">
        <LinhaDias dados={serieDias} />
      </Card>

      <Card titulo="🏆 Produtos mais consumidos">
        <BarrasEmpilhadas dados={topProdutos} locais={locais} />
      </Card>

      <Card titulo="🗑️ Perdas por motivo">
        <Donut dados={perdasPorMotivo} />
      </Card>

      <Card titulo="✂️ Aparas por destino">
        <Donut dados={aparasPorDestino} />
      </Card>

      <Card titulo="🚚 Rendimento por fornecedor">
        {fornecedores.length === 0 ? (
          <p className="text-center text-gray-500 text-xs py-4">Nenhuma compra no período. Registre compras e associe aparas/perdas a elas.</p>
        ) : (
          <div className="space-y-2.5">
            {fornecedores.map(f => (
              <div key={f.fornecedor}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-medium text-gray-700">{f.fornecedor}</span>
                  <span className="text-gray-500">{f.n} receb. • {fmtNum(f.comprado)} comprado • {fmtNum(f.correcao)} correção</span>
                </div>
                <BarraRendimento pct={f.rendimento} />
              </div>
            ))}
            <p className="text-[10px] text-gray-500 pt-1">Rendimento = 100% − (aparas e perdas associadas ÷ total comprado). Verde ≥ 90%, âmbar ≥ 80%, vermelho abaixo.</p>
          </div>
        )}
      </Card>

      {/* Movimentação por produto */}
      <div className="bg-white rounded-xl overflow-hidden mb-4">
        <div className="bg-polo-navy px-4 py-2.5">
          <h2 className="text-polo-gold text-sm font-bold">Movimentação por Produto</h2>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="text-left px-4 py-2 font-semibold">Produto</th>
              <th className="text-right px-2 py-2 font-semibold text-green-700">Entradas</th>
              {(locais || []).map(l => (
                <th key={l.id} className="text-right px-2 py-2 font-semibold text-blue-700"
                  title={`Saídas para ${l.nome}`}>{l.nome}</th>
              ))}
              <th className="text-right px-4 py-2 font-semibold">Estoque</th>
            </tr>
          </thead>
          <tbody>
            {categorias.map(cat => {
              const colCount = 3 + (locais?.length || 0);
              const linhas = produtosAtivos
                .filter(p => p.categoria === cat)
                .map(p => {
                  const porLocal = (locais || []).map(l => (totaisPorLocal[l.id] || {})[p.id] || 0);
                  return { p, e: totalEntradas[p.id] || 0, porLocal };
                })
                .filter(l => l.e > 0 || l.porLocal.some(v => v > 0));
              if (!linhas.length) return null;
              return [
                <tr key={cat} className="bg-gray-50/60">
                  <td colSpan={colCount} className="px-4 py-1.5 font-bold text-gray-500 text-[10px] uppercase tracking-wide">{cat}</td>
                </tr>,
                ...linhas.map(({ p, e, porLocal }) => (
                  <tr key={p.id} className="border-t border-gray-50">
                    <td className="px-4 py-1.5 text-gray-800">{p.nome}</td>
                    <td className="px-2 py-1.5 text-right text-green-700">{e ? `+${fmtNum(e)}` : '—'}</td>
                    {porLocal.map((v, i) => (
                      <td key={i} className="px-2 py-1.5 text-right text-blue-700">{v ? `−${fmtNum(v)}` : '—'}</td>
                    ))}
                    <td className="px-4 py-1.5 text-right font-semibold text-gray-700">{fmtNum(estoque[p.id] ?? 0)}</td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
        {!Object.keys(totalEntradas).length && !Object.keys(totalSaidas).length && (
          <div className="text-center text-gray-500 py-8 text-sm">Nenhum registro neste período.</div>
        )}
      </div>

      {/* Saídas por destino (por dia) — sem misturar destinos */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <p className="text-sm font-bold text-polo-navy mb-1">🎯 Saídas por destino (por dia)</p>
        <p className="text-[11px] text-gray-500 mb-3">O que foi enviado para cada unidade, dia a dia. Cada destino é separado.</p>
        {porDestinoDia.length === 0 ? (
          <div className="text-center text-gray-400 py-6 text-sm">Nenhuma saída para unidades neste período.</div>
        ) : (
          <div className="space-y-3">
            {porDestinoDia.map(d => (
              <details key={d.destinoId} className="border border-gray-100 rounded-lg">
                <summary className="cursor-pointer px-3 py-2 font-semibold text-sm text-polo-navy flex justify-between">
                  <span>📤 {d.destinoNome}</span>
                  <span className="text-[11px] text-gray-400 font-normal">{d.dias.length} dia(s)</span>
                </summary>
                <div className="px-3 pb-3 space-y-2">
                  {d.dias.map(dia => (
                    <div key={dia.data} className="border-t border-gray-50 pt-2">
                      <p className="text-[11px] font-semibold text-gray-500">{fmtData(dia.data)}</p>
                      <ul className="text-xs text-gray-700">
                        {dia.itens.map(it => <li key={it.produtoId}>{fmtNum(it.quantidade)} — {it.nome}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* Chegadas por dia (controle diário do que entrou) */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <p className="text-sm font-bold text-polo-navy mb-1">📦 Chegadas por dia</p>
        <p className="text-[11px] text-gray-500 mb-3">O que chegou em cada data, com o peso total do dia (itens em kg).</p>
        {chegadas.length === 0 ? (
          <div className="text-center text-gray-400 py-6 text-sm">Nenhuma compra recebida neste período.</div>
        ) : (
          <div className="space-y-2">
            {chegadas.map(c => (
              <div key={c.data} className="border-t border-gray-50 pt-2 first:border-0 first:pt-0">
                <p className="text-[11px] font-semibold text-gray-500 flex justify-between">
                  <span>{fmtData(c.data)}</span>
                  {c.pesoKg > 0 && <span className="text-polo-navy">{fmtNum(c.pesoKg)} kg no dia</span>}
                </p>
                <ul className="text-xs text-gray-700">
                  {c.itens.map((it, i) => <li key={i}>{fmtNum(it.quantidade)} {it.unidade} — {it.item}{it.fornecedor ? ` · ${it.fornecedor}` : ''}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => window.print()}
        className="w-full bg-gray-100 text-gray-600 font-semibold py-3 rounded-xl text-sm mb-2">
        🖨️ Imprimir / Salvar PDF
      </button>
    </Layout>
  );
}
