import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useUI } from '../store/UIContext';
import { useAuth } from '../store/AuthContext';
import { useApp } from '../store/AppContext';
import ResponsavelSelect from './ResponsavelSelect';
import { montarCamposEtiqueta, montarPayloadQR, configEtiqueta } from '../utils/etiquetas';
import { hoje, fmtHora } from '../utils/formatters';

// Uma linha "RÓTULO: valor" da etiqueta (formato ficha de pré-preparo)
function Linha({ rotulo, valor, forte = false }) {
  if (!valor) return null;
  return (
    <div className="flex justify-between gap-2" style={{ fontSize: '2.7mm' }}>
      <span style={{ fontWeight: 700 }}>{rotulo}:</span>
      <span style={{ fontWeight: forte ? 800 : 600, textAlign: 'right' }}>{valor}</span>
    </div>
  );
}

// Um bloco de etiqueta física (repetido N vezes conforme a quantidade de cópias).
function EtiquetaLabel({ campos, config, qrDataUrl, estabelecimento }) {
  const c = config.campos;
  const comQR = config.incluirQR && qrDataUrl;
  const est = estabelecimento || {};
  return (
    <div className="etiqueta-label bg-white text-black flex flex-col"
      style={{ width: `${config.larguraMm}mm`, height: `${config.alturaMm}mm`, padding: '1.6mm 2mm', boxSizing: 'border-box', lineHeight: 1.25, fontFamily: 'system-ui, sans-serif' }}>
      {/* Cabeçalho: produto + medida */}
      <div className="flex items-start justify-between gap-1 border-b border-black" style={{ paddingBottom: '0.8mm', marginBottom: '0.8mm' }}>
        <div style={{ fontSize: '3.6mm', fontWeight: 800, textTransform: 'uppercase' }}>{campos.nome}</div>
        {campos.medida && <div style={{ fontSize: '3.2mm', fontWeight: 800, whiteSpace: 'nowrap' }}>{campos.medida}</div>}
      </div>
      {c.armazenamento !== false && campos.armazenamentoLabel && (
        <div style={{ fontSize: '2.7mm', fontWeight: 700 }}>{campos.armazenamentoLabel}</div>
      )}
      {/* Datas e dados */}
      <div className="flex-1">
        {c.valOriginal !== false && <Linha rotulo="VAL. ORIGINAL" valor={campos.valOriginalFmt} />}
        {c.fabricacao !== false && <Linha rotulo={campos.rotuloData} valor={campos.dataFabricacaoFmt} />}
        {c.validade !== false && <Linha rotulo="VALIDADE" valor={campos.validadeFmt} forte />}
        {c.marca !== false && <Linha rotulo="MARCA / FORN" valor={campos.marca} />}
        {c.sif !== false && <Linha rotulo="SIF" valor={campos.sif} />}
        {c.responsavel !== false && <Linha rotulo="RESP." valor={campos.responsavel} />}
      </div>
      {/* Rodapé: estabelecimento + ID + QR */}
      <div className="flex items-end justify-between gap-1 border-t border-black" style={{ paddingTop: '0.8mm', marginTop: '0.8mm' }}>
        <div style={{ fontSize: '2.1mm', lineHeight: 1.3 }} className="min-w-0">
          {c.restaurante !== false && campos.restauranteNome && (
            <div style={{ fontWeight: 800, textTransform: 'uppercase' }}>{campos.restauranteNome}</div>
          )}
          {c.estabelecimento !== false && (
            <>
              {(est.cnpj || est.cep) && <div>{est.cnpj ? `CNPJ: ${est.cnpj}` : ''}{est.cnpj && est.cep ? '  ' : ''}{est.cep ? `CEP: ${est.cep}` : ''}</div>}
              {est.endereco && <div className="truncate">{est.endereco}</div>}
              {est.cidade && <div>{est.cidade}</div>}
            </>
          )}
        </div>
        {comQR && (
          <img src={qrDataUrl} alt=""
            style={{ width: `${Math.min(config.alturaMm * 0.32, 14)}mm`, height: `${Math.min(config.alturaMm * 0.32, 14)}mm`, flexShrink: 0 }} />
        )}
      </div>
    </div>
  );
}

export default function EtiquetaPrint() {
  const { etiquetaState, fecharEtiquetas } = useUI();
  const { sessao } = useAuth();
  const { prefs, produtos } = useApp();
  const config = configEtiqueta(prefs);
  const estabelecimento = prefs.estabelecimento || {};

  // Cópia local editável dos itens + hora congelada na abertura do modal
  const [itens, setItens] = useState([]);
  const [qrs, setQrs] = useState({}); // idx -> dataURL
  const [horaImpressao, setHoraImpressao] = useState('');
  // Responsável ÚNICO da impressão (sai no RESP. de todas as etiquetas) —
  // escolhido entre as pessoas da equipe, como nas telas de registro
  const [responsavel, setResponsavel] = useState('');

  // Espelha o estado externo numa cópia local editável — setState síncrono intencional.
  useEffect(() => {
    if (etiquetaState) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- espelho de valor externo (mesmo padrão de Configuracoes)
      setItens(etiquetaState.map(i => {
        const p = i.produtoId ? produtos.find(x => x.id === i.produtoId) : null;
        const resolvido = {
          tipoData: 'fabricacao',
          dataFabricacao: hoje(),
          armazenamento: null,
          diasValidade: null,
          validade: null,
          valOriginal: '',
          medida: '',
          quantidade: 1,
          // marca/SIF vêm do cadastro do produto (Config → Produtos), editáveis por impressão
          marca: p?.marca || '',
          sif: p?.sif || '',
          _unidade: p?.unidade || '',
          ...i,
        };
        // guarda data/armazenamento originais: se o usuário mudar qualquer um no
        // modal, a validade pré-calculada (do registro real) deixa de valer
        return { ...resolvido, _dataOriginal: resolvido.dataFabricacao, _armazOriginal: resolvido.armazenamento };
      }));
      setHoraImpressao(fmtHora());
      setResponsavel(etiquetaState[0]?.responsavel || prefs.responsavel || '');
    } else {
      setItens([]); setQrs({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- produtos só enriquece marca/sif na abertura; não deve reabrir o modal
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
      responsavel,
      // validade pronta (de registro real) só vale enquanto data/armazenamento não mudarem
      validade: naoEditado ? item.validade : null,
      diasValidade: dias,
      medida: item.medida,
      valOriginal: item.valOriginal || null,
      marca: item.marca,
      sif: item.sif,
      hora: horaImpressao,
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
          novos[i] = await QRCode.toDataURL(
            montarPayloadQR(camposDe(itens[i]), { estabelecimento }),
            { margin: 0, width: 180 });
        } catch { /* QR falhou — etiqueta sai sem ele */ }
      }
      if (ativo) setQrs(novos);
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camposDe lê só props estáveis + itens/responsavel (já na lista)
  }, [itens, config.incluirQR, responsavel]);

  if (!etiquetaState) return null;

  const setItem = (idx, patch) => setItens(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  // Stepper com update funcional: toques rápidos seguidos não podem ler closure velha
  const mudarQtd = (idx, delta) => setItens(prev => prev.map((it, i) =>
    i === idx ? { ...it, quantidade: Math.max(0, (parseInt(it.quantidade) || 0) + delta) } : it));
  const totalEtiquetas = itens.reduce((s, i) => s + (parseInt(i.quantidade) || 0), 0);
  // QR ligado: segura o Imprimir até TODOS os QRs dos itens a imprimir ficarem
  // prontos (toDataURL é assíncrono — sem isso a etiqueta podia sair sem QR)
  const qrPendente = config.incluirQR &&
    itens.some((it, i) => (parseInt(it.quantidade) || 0) > 0 && !qrs[i]);
  const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs';

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

          <ResponsavelSelect value={responsavel} onChange={setResponsavel} />

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
                        {item.tipoData === 'abertura' ? 'Data de abertura' : 'Data de manipulação'}
                      </label>
                      <input type="date" value={item.dataFabricacao} max={hoje()}
                        onChange={e => setItem(idx, { dataFabricacao: e.target.value })} className={inputCls} />
                    </div>
                    {item.armazenamento !== null ? (
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Armazenamento</label>
                        <select value={item.armazenamento || 'congelado'}
                          onChange={e => setItem(idx, { armazenamento: e.target.value })}
                          className={`${inputCls} bg-white`}>
                          <option value="congelado">❄️ Congelado</option>
                          <option value="resfriado">🧊 Resfriado</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Medida (ex: 1 kg)</label>
                        <input type="text" value={item.medida} placeholder={item._unidade || 'ex: 1 kg'}
                          onChange={e => setItem(idx, { medida: e.target.value })} className={inputCls} />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {item.armazenamento !== null && (
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Medida (ex: 1 kg)</label>
                        <input type="text" value={item.medida} placeholder={item._unidade || 'ex: 1 kg'}
                          onChange={e => setItem(idx, { medida: e.target.value })} className={inputCls} />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Val. original (fornecedor)</label>
                      <input type="date" value={item.valOriginal}
                        onChange={e => setItem(idx, { valOriginal: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {campos.validadeFmt
                      ? <>Vencimento na etiqueta: <strong className="text-polo-navy">{campos.validadeFmt}</strong></>
                      : 'Sem validade — etiqueta só de identificação.'}
                    {(item.marca || item.sif) && <> · {item.marca}{item.sif ? ` · SIF ${item.sif}` : ''}</>}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-gray-400">
            Tamanho: {config.larguraMm}×{config.alturaMm}mm · impressão {horaImpressao}
            — ajuste campos e tamanho em Config → Sistema → 🏷️ Etiquetas.
          </div>

          <div className="flex gap-3">
            <button onClick={fecharEtiquetas}
              className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">Agora não</button>
            <button onClick={() => window.print()} disabled={totalEtiquetas === 0 || qrPendente}
              className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl disabled:opacity-40">
              {qrPendente ? '⏳ Gerando QR…' : `🖨️ Imprimir ${totalEtiquetas > 0 ? `${totalEtiquetas} etiqueta(s)` : ''}`}
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
            <EtiquetaLabel key={`${idx}_${c}`} campos={camposDe(item)} config={config}
              qrDataUrl={qrs[idx]} estabelecimento={estabelecimento} />
          ))
        )}
      </div>
    </>
  );
}
