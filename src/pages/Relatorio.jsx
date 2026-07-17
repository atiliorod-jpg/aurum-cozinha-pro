import { useState, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { DESTINOS_APARA, MOTIVOS_DESPERDICIO } from '../data/produtos';
import { filtrarPorPeriodo, totalPorProduto, statusEstoque } from '../utils/calculos';
import { saidasPorDia, topProdutosSaida, somaPorCampo, rendimentoPorFornecedor } from '../utils/analise';
import { fmtData, fmtNum, semanaAtual, hoje } from '../utils/formatters';
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
  // textos livres de "Outro" prevalecem sobre o rótulo genérico
  const destinoDaApara = (a) => a.destinoOutro || rotuloDestino(a.destino);
  const motivoDaPerda = (d) => d.motivoOutro || rotuloMotivo(d.motivo);
  const { toast } = useUI();
  const { sessao } = useAuth();
  const semana = semanaAtual();
  const [modo, setModo] = useState('diario'); // 'diario' | 'periodo'
  const [dia, setDia] = useState(hoje());
  const [inicio, setInicio] = useState(semana.inicio);
  const [fim, setFim] = useState(semana.fim);
  const [exportando, setExportando] = useState(false);

  const rIni = modo === 'diario' ? dia : inicio;
  const rFim = modo === 'diario' ? dia : fim;

  const comprasF = useMemo(() => filtrarPorPeriodo(compras, rIni, rFim), [compras, rIni, rFim]);
  const entradasF = useMemo(() => filtrarPorPeriodo(entradas, rIni, rFim), [entradas, rIni, rFim]);
  const saidasF = useMemo(() => filtrarPorPeriodo(saidas, rIni, rFim), [saidas, rIni, rFim]);
  const aparasF = useMemo(() => filtrarPorPeriodo(aparas, rIni, rFim), [aparas, rIni, rFim]);
  const perdasF = useMemo(() => filtrarPorPeriodo(desperdicio, rIni, rFim), [desperdicio, rIni, rFim]);

  const totalEntradas = useMemo(() => totalPorProduto(entradasF), [entradasF]);
  const totalSaidas = useMemo(() => totalPorProduto(saidasF), [saidasF]);
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
  const totalComprasKg = somaQtd(comprasF.filter(c => c.unidade === 'kg'));
  const totalAparas = somaQtd(aparasF);
  const totalPerdas = somaQtd(perdasF);
  const perdasEstoque = somaQtd(perdasF.filter(p => p.origem === 'estoque'));

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const XLSX = await import('xlsx'); // carregado só na hora do export
      const wb = XLSX.utils.book_new();
      // filtroAte: nº da linha do cabeçalho (1-based) para ligar o autofiltro
      // (setinhas de filtrar/ordenar em cada coluna — deixa a planilha dinâmica)
      const sheet = (nome, aoa, larguras, filtroLinha = null) => {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        if (larguras) ws['!cols'] = larguras.map(wch => ({ wch }));
        if (filtroLinha && aoa.length > filtroLinha) {
          const nCols = aoa[filtroLinha - 1].length;
          ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: filtroLinha - 1, c: 0 }, e: { r: aoa.length - 1, c: nCols - 1 } }) };
        }
        XLSX.utils.book_append_sheet(wb, ws, nome);
      };
      const nomeRest = sessao?.restauranteNome || '';

      // 0. Como ler este arquivo
      sheet('Leia-me', [
        ['AURUM COZINHA PRO — RELATÓRIO DE PRODUÇÃO E ESTOQUE'],
        nomeRest ? ['Restaurante', nomeRest] : [],
        ['Período', `${fmtData(rIni)} a ${fmtData(rFim)}`],
        ['Gerado em', `${fmtData(hoje())}`],
        [],
        ['Aba', 'O que mostra'],
        ['Resumo', 'Os números do período em uma tela: compras, entradas, saídas, aparas e perdas.'],
        ['Movimentação', 'Produto por produto: o que entrou, o que saiu (por destino) e o estoque atual com a situação (OK / abaixo do mínimo / zerado). Use as setinhas do cabeçalho para filtrar e ordenar.'],
        ['Produção', 'Tudo que a cozinha produziu no período (receitas executadas).'],
        ['Saídas por Dia', 'Total enviado a cada dia — bom para ver o ritmo da semana.'],
        ['Compras', 'Recebimentos de fornecedor + rendimento de cada fornecedor (quanto vira aproveitável).'],
        ['Aparas', 'Reaproveitamentos registrados, com destino.'],
        ['Perdas', 'Descartes com motivo e se abateram o estoque.'],
        [],
        ['Dica', 'Todas as abas de lista têm FILTRO no cabeçalho: clique na setinha da coluna para filtrar ou ordenar.'],
      ], [16, 95]);

      // 1. Resumo executivo
      sheet('Resumo', [
        [`RESUMO DO PERÍODO — ${fmtData(rIni)} a ${fmtData(rFim)}${nomeRest ? ` — ${nomeRest}` : ''}`],
        [],
        ['Indicador', 'Valor'],
        ['Compras recebidas (registros)', comprasF.length],
        ['Compras recebidas (kg)', totalComprasKg],
        ['Entradas na produção (registros)', entradasF.length],
        ['Produções executadas', entradasF.filter(e => e.producaoId).length],
        ['Saídas (registros)', saidasF.length],
        ['Aparas para reaproveitamento (total)', totalAparas],
        ['Perdas totais', totalPerdas],
        ['Perdas que abateram estoque', perdasEstoque],
        ['Perdas no recebimento', totalPerdas - perdasEstoque],
        ['Produtos abaixo do mínimo (hoje)', produtosAtivos.filter(p => p.min > 0 && (estoque[p.id] ?? 0) < p.min).length],
        ['Produtos zerados (hoje)', produtosAtivos.filter(p => (estoque[p.id] ?? 0) <= 0 && ((totalEntradas[p.id] || 0) || (totalSaidas[p.id] || 0))).length],
      ], [38, 18]);

      // 2. Movimentação por produto + estoque atual (1 coluna de saída por destino)
      const locaisAtivos = locais || [];
      const movHeader = ['Categoria', 'Produto', 'Un.', 'Entradas',
        ...locaisAtivos.map(l => `Saídas ${l.nome}`),
        'Saídas Total', 'Estoque Atual', 'Mín', 'Máx', 'Situação'];
      const mov = [movHeader];
      categorias.forEach(cat => {
        produtosAtivos.filter(p => p.categoria === cat).forEach(p => {
          const e = totalEntradas[p.id] || 0;
          const porLocal = locaisAtivos.map(l => (totaisPorLocal[l.id] || {})[p.id] || 0);
          const st = totalSaidas[p.id] || 0;
          const atual = estoque[p.id] ?? 0;
          if (e || st || atual) {
            const status = statusEstoque(atual, p.min, p.max);
            mov.push([cat, p.nome, p.unidade, e, ...porLocal, st, atual, p.min, p.max,
              status === 'ok' ? 'OK' : status === 'critico' ? 'ABAIXO DO MÍNIMO' : status === 'zerado' ? 'ZERADO' : status === 'excesso' ? 'ACIMA DO MÁXIMO' : '—']);
          }
        });
      });
      sheet('Movimentação', mov, [16, 26, 6, 10, ...locaisAtivos.map(() => 12), 12, 13, 8, 8, 18], 1);

      // 3. Produção do período (receitas executadas)
      const prod = [['Data', 'Hora', 'Item Produzido', 'Qtd', 'Un.', 'Responsável', 'Obs']];
      entradasF.filter(e => e.producaoId).forEach(e => (e.itens || []).forEach(item => {
        const p = produtos.find(x => x.id === item.produtoId);
        prod.push([fmtData(e.data), e.hora || '', p?.nome || item.produtoId, item.quantidade, p?.unidade || '', e.responsavel || '', e.obs || '']);
      }));
      if (prod.length === 1) prod.push(['— nenhuma produção no período —']);
      sheet('Produção', prod, [12, 8, 26, 8, 6, 16, 34], 1);

      // 4. Saídas por dia (totais — drill-down por destino fica na aba Movimentação)
      const dias = [['Data', 'Saídas (total)']];
      serieDias.forEach(d => dias.push([fmtData(d.data), d.total]));
      sheet('Saídas por Dia', dias, [12, 14], 1);

      // 5. Compras & rendimento por fornecedor
      const cmp = [['Data', 'Fornecedor', 'Item', 'Qtd Bruta', 'Un.', 'Responsável']];
      comprasF.forEach(c => cmp.push([fmtData(c.data), c.fornecedor || '', c.item, c.quantidade, c.unidade, c.responsavel || '']));
      cmp.push([]);
      cmp.push(['RENDIMENTO POR FORNECEDOR']);
      cmp.push(['Fornecedor', 'Recebimentos', 'Total Comprado', 'Aparas+Perdas Assoc.', 'Rendimento %']);
      fornecedores.forEach(f => cmp.push([f.fornecedor, f.n, f.comprado, f.correcao, f.rendimento != null ? Number(f.rendimento.toFixed(1)) : '—']));
      sheet('Compras', cmp, [12, 22, 24, 12, 6, 16], 1);

      // 6. Aparas (com resumo por destino)
      const apr = [['Data', 'Turno', 'Item', 'Qtd', 'Un.', 'Destino', 'Responsável']];
      aparasF.forEach(a => apr.push([fmtData(a.data), a.turno, a.item, a.quantidade, a.unidade, destinoDaApara(a), a.responsavel || '']));
      apr.push([]);
      apr.push(['TOTAL POR DESTINO']);
      aparasPorDestino.forEach(d => apr.push([d.label, d.valor]));
      sheet('Aparas', apr, [12, 10, 24, 8, 6, 22, 16], 1);

      // 7. Perdas (com resumo por motivo)
      const per = [['Data', 'Turno', 'Item', 'Qtd', 'Un.', 'Motivo', 'Origem', 'Abateu Estoque?', 'Responsável']];
      perdasF.forEach(d => per.push([fmtData(d.data), d.turno, d.item, d.quantidade, d.unidade, motivoDaPerda(d),
        d.origem === 'estoque' ? 'Estoque' : 'Recebimento', d.origem === 'estoque' ? 'SIM' : 'NÃO', d.responsavel || '']));
      per.push([]);
      per.push(['TOTAL POR MOTIVO']);
      perdasPorMotivo.forEach(m => per.push([m.label, m.valor]));
      sheet('Perdas', per, [12, 10, 24, 8, 6, 20, 14, 16, 16], 1);

      XLSX.writeFile(wb, `relatorio_aurum_${rIni}_a_${rFim}.xlsx`);
      toast('Excel exportado com 8 abas (com filtros no cabeçalho)!', 'sucesso');
    } catch (e) {
      toast('Falha ao exportar: ' + e.message, 'erro');
    } finally {
      setExportando(false);
    }
  };

  return (
    <Layout
      title="Relatório"
      actions={
        <button onClick={exportarExcel} disabled={exportando}
          className="bg-polo-gold text-polo-navy text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">
          {exportando ? '...' : '↓ Excel'}
        </button>
      }
    >
      {/* Modo Diário / Período */}
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[['diario', '📅 Contabilização Diária'], ['periodo', '🗓️ Por Período']].map(([v, l]) => (
          <button key={v} onClick={() => setModo(v)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors
              ${modo === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl p-4 mb-4">
        {modo === 'diario' ? (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Dia do fechamento</label>
            <input type="date" value={dia} onChange={e => setDia(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
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

      {/* Tendência diária (só faz sentido em período) */}
      {modo === 'periodo' && (
        <Card titulo="📈 Saídas por dia">
          <LinhaDias dados={serieDias} />
        </Card>
      )}

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

      <button onClick={() => window.print()}
        className="w-full bg-gray-100 text-gray-600 font-semibold py-3 rounded-xl text-sm mb-2">
        🖨️ Imprimir / Salvar PDF
      </button>
    </Layout>
  );
}
