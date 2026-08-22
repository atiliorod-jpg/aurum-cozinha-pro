import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import ResponsavelSelect from '../components/ResponsavelSelect';
import { hoje, fmtHora, fmtNum, fmtData } from '../utils/formatters';
import { turnoAberto, consumoDoTurno, linhasParaGravar } from '../utils/turno';

const TURNOS = ['Almoço', 'Jantar'];

/**
 * Fechamento de turno da Cozinha de Finalização.
 *
 * A equipe NÃO registra prato a prato durante o serviço. Aqui ela conta o que
 * sobrou na bancada e o app deduz o consumo pela diferença. A sobra contada
 * vira a abertura do próximo turno.
 */
export default function FecharTurno() {
  const { produtos, recebimentos, desperdicio, ajustes, addAjuste, prefs, setPref } = useApp();
  const { toast, confirm } = useUI();

  const [data, setData] = useState(hoje());
  const [turno, setTurno] = useState(prefs.turno === 'Noite' ? 'Jantar' : (TURNOS.includes(prefs.turno) ? prefs.turno : 'Almoço'));
  const [responsavel, setResponsavel] = useState(prefs.responsavel || '');
  const [sobras, setSobras] = useState({});
  const [salvando, setSalvando] = useState(false);

  // `ajustes` no módulo finalização = fechamentos de turno já gravados
  const aberto = useMemo(
    () => turnoAberto({ produtos, recebimentos, perdas: desperdicio, fechamentos: ajustes }),
    [produtos, recebimentos, desperdicio, ajustes]);

  const linhas = useMemo(() => consumoDoTurno(aberto.linhas, sobras), [aberto.linhas, sobras]);
  const temInconsistencia = linhas.some(l => l.inconsistente);
  const totalConsumo = linhas.reduce((s, l) => s + Math.max(0, l.consumo), 0);

  const setSobra = (id, v) => {
    const n = parseFloat(v);
    setSobras(prev => ({ ...prev, [id]: isNaN(n) || n < 0 ? '' : v }));
  };

  const fechar = async () => {
    if (salvando) return;
    if (!aberto.linhas.length) { toast('Nada recebido neste turno ainda.', 'aviso'); return; }
    setSalvando(true);
    if (temInconsistencia) {
      const quais = linhas.filter(l => l.inconsistente).map(l => `• ${l.nome}: contou ${fmtNum(l.sobra)}, disponível ${fmtNum(l.disponivel)}`).join('\n');
      const ok = await confirm({
        titulo: 'Sobra maior que o disponível',
        mensagem: `Estes itens têm sobra acima do que entrou:\n\n${quais}\n\nIsso costuma ser recebimento não registrado ou erro de contagem. Fechar assim mesmo?`,
        perigo: true, confirmar: 'Fechar assim mesmo',
      });
      if (!ok) { setSalvando(false); return; }
    }
    setTimeout(() => setSalvando(false), 800);

    addAjuste({
      data, hora: fmtHora(), responsavel, turno,
      // guarda a SOBRA (vira abertura do próximo turno) e o consumo calculado
      itens: linhasParaGravar(linhas).map(l => ({
        produtoId: l.produtoId,
        quantidade: l.sobra,
        recebido: l.recebido,
        abertura: l.abertura,
        perdido: l.perdido,
        consumo: l.consumo,
      })),
    });
    if (responsavel) setPref('responsavel', responsavel);
    setPref('turno', turno);
    setSobras({});
    toast(`Turno ${turno} fechado! Consumo calculado para ${linhas.length} item(ns).`, 'sucesso');
  };

  const fechados = useMemo(() => [...ajustes].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 5), [ajustes]);

  return (
    <Layout title="Fechar turno">
      <div className="space-y-4">
        <div className="bg-polo-navy text-white rounded-2xl p-4">
          <p className="text-polo-gold font-bold text-sm">🍳 Fechamento do turno</p>
          <p className="text-xs text-white/80 mt-1">
            Conte o que <strong>sobrou na bancada</strong>.
          </p>
        </div>

        <button onClick={fechar} disabled={salvando || !aberto.linhas.length}
          className="w-full bg-polo-navy text-polo-gold font-bold py-4 rounded-xl text-base disabled:opacity-40 active:scale-95 transition-transform">
          {salvando ? 'Fechando…' : '✓ Fechar turno'}
        </button>

        <div className="bg-white rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
              <input type="date" value={data} max={hoje()} onChange={e => setData(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Turno</label>
              <div className="grid grid-cols-2 gap-1.5">
                {TURNOS.map(t => (
                  <button key={t} type="button" onClick={() => setTurno(t)}
                    className={`py-2 rounded-lg text-xs font-semibold border-2 transition-colors
                      ${turno === t ? 'border-polo-gold bg-polo-navy text-polo-gold' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <ResponsavelSelect value={responsavel} onChange={setResponsavel} />
          {aberto.aberturaEm && (
            <p className="text-[11px] text-gray-600">
              Turno aberto desde o último fechamento ({fmtData(aberto.aberturaEm)}).
            </p>
          )}
        </div>

        {!aberto.linhas.length ? (
          <div className="bg-white rounded-xl p-6 text-center">
            <p className="text-sm text-gray-500">Nada recebido da produção ainda neste turno.</p>
            <p className="text-xs text-gray-600 mt-1">
              Assim que a produção registrar uma saída com destino <strong>Cozinha de Finalização</strong>,
              os itens aparecem aqui sozinhos.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-4">
            <p className="text-sm font-bold text-polo-navy mb-1">Contagem da bancada</p>
            <p className="text-[11px] text-gray-500 mb-3">Deixe em branco o que zerou — em branco vale como sobra 0.</p>
            <div className="space-y-2">
              {linhas.map(l => (
                <div key={l.produtoId} className={`border rounded-xl p-3 ${l.inconsistente ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">{l.nome}</p>
                      <p className="text-[11px] text-gray-500">
                        {l.abertura > 0 && <>abriu {fmtNum(l.abertura)} · </>}
                        recebeu {fmtNum(l.recebido)}
                        {l.perdido > 0 && <> · perdeu {fmtNum(l.perdido)}</>}
                        {' '}· <strong>disponível {fmtNum(l.disponivel)} {l.unidade}</strong>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input type="number" inputMode="decimal" min="0" step="0.5"
                        value={sobras[l.produtoId] ?? ''} onChange={e => setSobra(l.produtoId, e.target.value)}
                        aria-label={`Sobra de ${l.nome}`} placeholder="0"
                        className="w-20 text-center border border-gray-200 rounded-lg py-2 text-sm font-semibold" />
                      <span className="text-[11px] text-gray-600 w-8">{l.unidade}</span>
                    </div>
                  </div>
                  <p className={`text-[11px] mt-1.5 font-semibold ${l.inconsistente ? 'text-orange-700' : 'text-polo-navy'}`}>
                    {l.inconsistente
                      ? `⚠️ Sobra acima do disponível (${fmtNum(l.sobra)} > ${fmtNum(l.disponivel)})`
                      : `Consumo do turno: ${fmtNum(l.consumo)} ${l.unidade}`}
                  </p>
                </div>
              ))}
            </div>
            {!temInconsistencia && (
              <p className="text-xs text-gray-500 mt-3">Consumo total do turno: <strong className="text-polo-navy">{fmtNum(totalConsumo)}</strong></p>
            )}
          </div>
        )}

        {fechados.length > 0 && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-sm font-bold text-polo-navy mb-2">Últimos turnos fechados</p>
            <ul className="space-y-1.5">
              {fechados.map(f => (
                <li key={f.id} className="text-xs text-gray-600 flex justify-between gap-2 border-b border-gray-50 pb-1.5">
                  <span>{fmtData(f.data)} · {f.turno || '—'}{f.responsavel ? ` · ${f.responsavel}` : ''}</span>
                  <span className="text-gray-600 flex-shrink-0">{(f.itens || []).length} item(ns)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Layout>
  );
}
