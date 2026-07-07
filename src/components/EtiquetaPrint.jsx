import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useUI } from '../store/UIContext';
import { useAuth } from '../store/AuthContext';
import { useApp } from '../store/AppContext';
import { montarCamposEtiqueta, montarPayloadQR, configEtiqueta } from '../utils/etiquetas';
import { hoje } from '../utils/formatters';

// Um bloco de etiqueta física (repetido N vezes conforme a quantidade de cópias).
function EtiquetaLabel({ campos, config, qrDataUrl }) {
  const comQR = config.incluirQR && qrDataUrl;
  return (
    <div className="etiqueta-label bg-white text-black flex"
      style={{ width: `${config.larguraMm}mm`, height: `${config.alturaMm}mm`, padding: '2mm', boxSizing: 'border-box' }}>
      <div className="flex-1 min-w-0 flex flex-col justify-between" style={{ lineHeight: 1.15 }}>
        {config.campos.restaurante !== false && campos.restauranteNome && (
          <div style={{ fontSize: '2.6mm', fontWeight: 700, textTransform: 'uppercase' }} className="truncate">{campos.restauranteNome}</div>
        )}
        <div style={{ fontSize: '4mm', fontWeight: 800 }} className="uppercase">{campos.nome}</div>
        <div>
          {config.campos.fabricacao !== false && campos.dataFabricacaoFmt && (
            <div style={{ fontSize: '3mm' }}>{campos.rotuloData}: <strong>{campos.dataFabricacaoFmt}</strong></div>
          )}
          {config.campos.validade !== false && campos.validadeFmt && (
            <div style={{ fontSize: '3.4mm', fontWeight: 800 }}>VENC: {campos.validadeFmt}</div>
          )}
          <div style={{ fontSize: '2.6mm' }} className="flex gap-2">
            {config.campos.armazenamento !== false && campos.armazenamentoLabel && <span>{campos.armazenamentoLabel}</span>}
            {config.campos.responsavel !== false && campos.responsavel && <span>Resp: {campos.responsavel}</span>}
          </div>
        </div>
      </div>
      {comQR && (
        <img src={qrDataUrl} alt="" style={{ width: `${Math.min(config.alturaMm - 4, 18)}mm`, height: `${Math.min(config.alturaMm - 4, 18)}mm`, alignSelf: 'center', marginLeft: '1mm' }} />
      )}
    </div>
  );
}

export default function EtiquetaPrint() {
  const { etiquetaState, fecharEtiquetas } = useUI();
  const { sessao } = useAuth();
  const { prefs } = useApp();
  const config = configEtiqueta(prefs);

  // Cópia local editável dos itens (data/armazenamento/quantidade ajustáveis antes de imprimir)
  const [itens, setItens] = useState([]);
  const [qrs, setQrs] = useState({}); // idx -> dataURL

  // Espelha o estado externo numa cópia local editável — setState síncrono intencional.
  useEffect(() => {
    if (etiquetaState) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- espelho de valor externo (mesmo padrão de Configuracoes)
      setItens(etiquetaState.map(i => {
        const resolvido = {
          tipoData: 'fabricacao',
          dataFabricacao: hoje(),
          armazenamento: null,
          diasValidade: null,
          validade: null,
          quantidade: 1,
          ...i,
        };
        // guarda data/armazenamento originais: se o usuário mudar qualquer um no
        // modal, a validade pré-calculada (do registro real) deixa de valer
        return { ...resolvido, _dataOriginal: resolvido.dataFabricacao, _armazOriginal: resolvido.armazenamento };
      }));
    } else {
      setItens([]); setQrs({});
    }
  }, [etiquetaState]);

  // Classe no <body> que ativa o CSS de impressão isolada (removida ao fechar)
  useEffect(() => {
    if (!etiquetaState) return;
    document.body.classList.add('imprimindo-etiqueta');
    return () => document.body.classList.remove('imprimindo-etiqueta');
  }, [etiquetaState]);

  // Esc fecha (mesmo padrão dos outros modais)
  useEffect(() => {
    if (!etiquetaState) return;
    const h = (e) => { if (e.key === 'Escape') fecharEtiquetas(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [etiquetaState, fecharEtiquetas]);

  // Campos calculados de cada item (validade reage à data/armazenamento editados).
  // Prazo em dias: avulsas trazem `diasValidade` fixo; itens do catálogo trazem
  // `diasCongelado`/`diasResfriado` e o prazo acompanha o armazenamento escolhido.
  const camposDe = (item) => {
    const dias = item.diasValidade != null ? item.diasValidade
      : item.armazenamento === 'congelado' ? (item.diasCongelado || 0)
      : item.armazenamento === 'resfriado' ? (item.diasResfriado || 0)
      : 0;
    const naoEditado = item._dataOriginal === item.dataFabricacao && item._armazOriginal === item.armazenamento;
    return montarCamposEtiqueta({
      nome: item.nome,
      dataFabricacao: item.dataFabricacao,
      tipoData: item.tipoData,
      armazenamento: item.armazenamento,
      restauranteNome: sessao?.restauranteNome || '',
      responsavel: item.responsavel || '',
      // validade pronta (de registro real) só vale enquanto data/armazenamento não mudarem
      validade: naoEditado ? item.validade : null,
      diasValidade: dias,
    });
  };

  // Gera os QR codes quando ligado (async — toDataURL é Promise)
  useEffect(() => {
    if (!config.incluirQR || !itens.length) return;
    let ativo = true;
    (async () => {
      const novos = {};
      for (let i = 0; i < itens.length; i++) {
        try {
          novos[i] = await QRCode.toDataURL(montarPayloadQR(camposDe(itens[i])), { margin: 0, width: 160 });
        } catch { /* QR falhou — etiqueta sai sem ele */ }
      }
      if (ativo) setQrs(novos);
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camposDe lê só props estáveis + itens (já na lista)
  }, [itens, config.incluirQR]);

  if (!etiquetaState) return null;

  const setItem = (idx, patch) => setItens(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  // Stepper com update funcional: toques rápidos seguidos não podem ler closure velha
  const mudarQtd = (idx, delta) => setItens(prev => prev.map((it, i) =>
    i === idx ? { ...it, quantidade: Math.max(0, (parseInt(it.quantidade) || 0) + delta) } : it));
  const totalEtiquetas = itens.reduce((s, i) => s + (parseInt(i.quantidade) || 0), 0);

  return (
    <>
      {/* Modal on-screen (não imprime — print:hidden) */}
      <div className="fixed inset-0 bg-black/50 z-[120] overflow-y-auto p-4 print:hidden"
        onClick={e => { if (e.target === e.currentTarget) fecharEtiquetas(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="etq-titulo"
          className="bg-white rounded-2xl w-full max-w-md mx-auto my-8 p-5 space-y-4">
          <div className="flex items-start justify-between">
            <h2 id="etq-titulo" className="font-bold text-polo-navy text-lg">🏷️ Imprimir etiquetas</h2>
            <button onClick={fecharEtiquetas} aria-label="Fechar"
              className="text-gray-400 text-2xl leading-none px-1 -mt-1">×</button>
          </div>

          <div className="space-y-3">
            {itens.map((item, idx) => {
              const campos = camposDe(item);
              return (
                <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm text-gray-800 truncate">{item.nome}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button aria-label={`Menos etiquetas de ${item.nome}`}
                        onClick={() => mudarQtd(idx, -1)}
                        className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center">−</button>
                      <input type="number" min="0" inputMode="numeric" value={item.quantidade}
                        onChange={e => setItem(idx, { quantidade: e.target.value })}
                        aria-label={`Quantidade de etiquetas de ${item.nome}`}
                        className="w-12 text-center border border-gray-200 rounded-lg py-1.5 text-sm font-semibold" />
                      <button aria-label={`Mais etiquetas de ${item.nome}`}
                        onClick={() => mudarQtd(idx, +1)}
                        className="w-9 h-9 rounded-full bg-polo-navy text-polo-gold font-bold flex items-center justify-center">+</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">
                        {item.tipoData === 'abertura' ? 'Data de abertura' : 'Data de fabricação'}
                      </label>
                      <input type="date" value={item.dataFabricacao} max={hoje()}
                        onChange={e => setItem(idx, { dataFabricacao: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                    </div>
                    {item.armazenamento !== null && (
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Armazenamento</label>
                        <select value={item.armazenamento || 'congelado'}
                          onChange={e => setItem(idx, { armazenamento: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                          <option value="congelado">❄️ Congelado</option>
                          <option value="resfriado">🧊 Resfriado</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {campos.validadeFmt
                      ? <>Vencimento na etiqueta: <strong className="text-polo-navy">{campos.validadeFmt}</strong></>
                      : 'Sem validade — etiqueta só de identificação.'}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-gray-400">
            Tamanho: {config.larguraMm}×{config.alturaMm}mm (ajuste em Config → Sistema).
            Na janela de impressão, confira se o papel está no tamanho da etiqueta.
          </div>

          <div className="flex gap-3">
            <button onClick={fecharEtiquetas}
              className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">Agora não</button>
            <button onClick={() => window.print()} disabled={totalEtiquetas === 0}
              className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl disabled:opacity-40">
              🖨️ Imprimir {totalEtiquetas > 0 ? `${totalEtiquetas} etiqueta(s)` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Tamanho físico da página de impressão (vem das prefs — Tailwind não expressa @page) */}
      <style>{`@media print { @page { size: ${config.larguraMm}mm ${config.alturaMm}mm; margin: 0; } }`}</style>

      {/* Área que realmente imprime: invisível na tela, visível só no print (CSS em index.css) */}
      <div className="etiqueta-print-area" aria-hidden="true">
        {itens.flatMap((item, idx) =>
          Array.from({ length: Math.max(0, parseInt(item.quantidade) || 0) }, (_, c) => (
            <EtiquetaLabel key={`${idx}_${c}`} campos={camposDe(item)} config={config} qrDataUrl={qrs[idx]} />
          ))
        )}
      </div>
    </>
  );
}
