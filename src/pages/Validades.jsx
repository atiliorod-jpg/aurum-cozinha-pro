import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { fmtData, fmtNum, hoje } from '../utils/formatters';
import { addDias, diasAte } from '../utils/datas';
import { calcLotes } from '../utils/lotes';
import { STATUS_ETIQUETA, statusEtiqueta } from '../utils/etiquetas';
import { temRecurso } from '../utils/modulos';

const FILTROS = [
  ['hoje', 'Vence hoje', 0],
  ['3d', 'Até 3 dias', 3],
  ['7d', 'Até 7 dias', 7],
  ['30d', 'Até 30 dias', 30],
  ['vencidos', 'Já vencidos', -1],
];

/**
 * Consulta de validades: responde "o que vence hoje / até tal dia".
 *
 * Duas visões da mesma pergunta:
 *  • LOTES — o que o estoque calculado diz que existe (vem das entradas)
 *  • ETIQUETAS — os potes fisicamente etiquetados, com o status de cada um
 * A segunda só tem conteúdo depois que se imprime etiqueta com QR, e é a que
 * permite achar o pote específico na prateleira.
 */
export default function Validades() {
  const { produtos, entradas, saidas, desperdicio, estoque, etiquetasImpressas, setEtiquetasImpressas, modulo } = useApp();
  const { toast, confirm } = useUI();
  const [filtro, setFiltro] = useState('7d');
  const [ate, setAte] = useState(addDias(hoje(), 7));
  const [aba, setAba] = useState('lotes');

  const hj = hoje();
  const limite = filtro === 'custom' ? ate : (() => {
    const f = FILTROS.find(x => x[0] === filtro);
    return f && f[2] >= 0 ? addDias(hj, f[2]) : hj;
  })();
  const soVencidos = filtro === 'vencidos';

  const lotes = useMemo(() => calcLotes(entradas, saidas, desperdicio, produtos), [entradas, saidas, desperdicio, produtos]);

  const linhasLotes = useMemo(() => {
    const out = [];
    produtos.filter(p => p.ativo).forEach(p => {
      const limiar = p.unidade === 'unid' ? 1 : 0.001;
      if ((estoque[p.id] ?? 0) < limiar) return; // zerado por contagem → não é alerta real
      (lotes[p.id] || []).forEach(l => {
        if (!l.validade) return;
        const dentro = soVencidos ? l.validade < hj : (l.validade >= hj && l.validade <= limite);
        if (dentro) out.push({ produto: p, lote: l, dias: diasAte(l.validade, hj) });
      });
    });
    return out.sort((a, b) => a.lote.validade.localeCompare(b.lote.validade));
  }, [produtos, lotes, estoque, limite, soVencidos, hj]);

  const linhasEtiquetas = useMemo(() => {
    return (etiquetasImpressas || [])
      .map(e => ({ ...e, st: statusEtiqueta(e, hj) }))
      .filter(e => {
        if (e.st === 'consumida' || e.st === 'descartada') return false;
        if (!e.validade) return false;
        return soVencidos ? e.validade < hj : (e.validade >= hj && e.validade <= limite);
      })
      .sort((a, b) => a.validade.localeCompare(b.validade));
  }, [etiquetasImpressas, limite, soVencidos, hj]);

  const marcar = async (etq, status) => {
    const rotulo = status === 'consumida' ? 'consumida' : 'descartada';
    const ok = await confirm({
      titulo: `Marcar como ${rotulo}`,
      mensagem: `Tirar "${etq.nome}" da lista de potes? O estoque não muda.`,
      confirmar: `Marcar ${rotulo}`,
    });
    if (!ok) return;
    setEtiquetasImpressas((etiquetasImpressas || []).map(e => e.id === etq.id ? { ...e, status } : e));
    toast(`Etiqueta marcada como ${rotulo}.`, 'sucesso');
  };

  const corDias = (d) => d < 0 ? 'text-red-600' : d === 0 ? 'text-red-600' : d <= 3 ? 'text-orange-600' : 'text-gray-600';
  const textoDias = (d) => d < 0 ? `venceu há ${Math.abs(d)}d` : d === 0 ? 'vence hoje' : `${d}d`;

  return (
    <Layout title="Validades">
      <div className="space-y-4">
        <div className="bg-white rounded-xl p-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map(([v, l]) => (
              <button key={v} onClick={() => setFiltro(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                  ${filtro === v ? 'bg-polo-navy text-polo-gold' : 'bg-gray-100 text-gray-500'}`}>
                {l}
              </button>
            ))}
            <button onClick={() => setFiltro('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                ${filtro === 'custom' ? 'bg-polo-navy text-polo-gold' : 'bg-gray-100 text-gray-500'}`}>
              Escolher data
            </button>
          </div>
          {filtro === 'custom' && (
            <div className="mt-2">
              <label className="block text-xs text-gray-500 mb-1">Vencendo até</label>
              <input type="date" value={ate} min={hj} onChange={e => setAte(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
          <p className="text-[11px] text-gray-600 mt-1.5">
            {soVencidos ? 'Itens que já passaram da validade.' : `De ${fmtData(hj)} até ${fmtData(limite)}.`}
          </p>
        </div>

        <div className="flex bg-white rounded-xl p-1 gap-1">
          {/* No Estoque Seco nao existe etiqueta (o mantimento chega lacrado e
              ja etiquetado pelo fabricante), entao a aba abria sempre vazia. */}
          {(temRecurso(modulo, 'etiquetas')
            ? [['lotes', `Lotes (${linhasLotes.length})`], ['etiquetas', `Etiquetas (${linhasEtiquetas.length})`]]
            : [['lotes', `Lotes (${linhasLotes.length})`]]
          ).map(([v, l]) => (
            <button key={v} onClick={() => setAba(v)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors
                ${aba === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
              {l}
            </button>
          ))}
        </div>

        {aba === 'lotes' ? (
          linhasLotes.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <p className="text-sm text-gray-500">Nada {soVencidos ? 'vencido' : 'vencendo neste período'}.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl divide-y divide-gray-100">
              {linhasLotes.map((l, i) => (
                <div key={`${l.produto.id}_${i}`} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-800 truncate">{l.produto.nome}</p>
                    <p className="text-[11px] text-gray-500">
                      {fmtNum(l.lote.restante)} {l.produto.unidade}
                      {l.lote.dataEntrada && ` · entrou ${fmtData(l.lote.dataEntrada)}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-polo-navy">{fmtData(l.lote.validade)}</p>
                    <p className={`text-[11px] font-semibold ${corDias(l.dias)}`}>{textoDias(l.dias)}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          linhasEtiquetas.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <p className="text-sm text-gray-500">Nenhuma etiqueta {soVencidos ? 'vencida' : 'vencendo neste período'}.</p>
              <p className="text-xs text-gray-600 mt-1">
                As etiquetas aparecem aqui depois de impressas com QR ligado (Config → Sistema → Etiquetas).
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl divide-y divide-gray-100">
              {linhasEtiquetas.map(e => {
                const d = diasAte(e.validade, hj);
                const st = STATUS_ETIQUETA[e.st];
                return (
                  <div key={e.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-800 truncate">{e.nome}</p>
                        <p className="text-[11px] text-gray-500">
                          lote <span className="font-mono">{e.id}</span>
                          {e.medida && ` · ${e.medida}`}
                          {e.responsavel && ` · ${e.responsavel}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-polo-navy">{fmtData(e.validade)}</p>
                        <p className={`text-[11px] font-semibold ${corDias(d)}`}>{textoDias(d)}</p>
                      </div>
                    </div>
                    {/* ⚠️ Eram dois links de texto puro, ~17 px de altura, a 8 px um
                        do outro. "Descartada" muda o estado do lote de um jeito que
                        só se desfaz reimprimindo a etiqueta — e ficava colado no
                        botão inofensivo. Agora são alvos de 44 px, e o de risco fica
                        empurrado para a direita. */}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${st.cor}`}>{st.label}</span>
                      <button onClick={() => marcar(e, 'consumida')}
                        className="min-h-11 px-4 rounded-lg text-sm font-semibold text-polo-navy bg-gray-100 active:bg-gray-200">
                        Marcar consumida
                      </button>
                      <button onClick={() => marcar(e, 'descartada')}
                        className="min-h-11 px-4 rounded-lg text-sm font-semibold text-orange-800 bg-orange-50 border border-orange-200 ml-auto">
                        Descartada
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </Layout>
  );
}
