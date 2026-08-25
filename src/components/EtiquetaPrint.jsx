import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { useUI } from '../store/UIContext';
import { useAuth } from '../store/AuthContext';
import { useApp } from '../store/AppContext';
import { estabelecimentoDe } from '../utils/instancias';
import ResponsavelSelect from './ResponsavelSelect';
import { montarCamposEtiqueta, montarPayloadQR, configEtiqueta, gerarLoteId, podarEtiquetas } from '../utils/etiquetas';
import { hoje, fmtHora } from '../utils/formatters';
import { temRecurso } from '../utils/modulos';

// Tamanho impresso do QR, calculado a partir do NÚMERO DE MÓDULOS do código.
//
// Térmica de 203 DPI = 8 pontos/mm. Cada módulo do QR precisa de ~4 pontos para
// sair com a borda limpa (abaixo disso o leitor não pega, por mais correto que
// o conteúdo esteja) → cada módulo precisa de ~0,5mm.
//
// ⚠️ A conta usa o total do viewBox, que INCLUI a zona de silêncio (margin:2 de
// cada lado). Dimensionar só pelos módulos do código deixa o QR ~10% menor do
// que o necessário — foi o que fez o código continuar ilegível mesmo depois de
// encurtar o payload.
// 0,5mm dá exatamente 3,99 pontos/módulo (203dpi = 7,99 pontos/mm, não 8) —
// ou seja, em cima do limite, sem folga nenhuma para variação da impressora.
// 0,55mm sobe para ~4,4 pontos/módulo e deixa margem real.
const MM_POR_MODULO = 0.55;
const tamanhoQRmm = (modulosTotais, alturaMm) => {
  const ideal = (modulosTotais || 41) * MM_POR_MODULO;
  // não pode passar de metade da etiqueta (senão não sobra espaço pro texto)
  return Math.min(ideal, Math.max(alturaMm * 0.5, 18));
};

// Teto de cópias por item. Cada cópia é um bloco no DOM: digitar um zero a mais
// (100 → 1000) travava o tablet renderizando mil etiquetas. 200 já é mais do que
// cabe num rolo, então o teto não atrapalha uso real.
const MAX_COPIAS = 200;
const limitarCopias = (n) => Math.min(Math.max(0, parseInt(n) || 0), MAX_COPIAS);

// Uma linha "RÓTULO: valor" da etiqueta (formato ficha de pré-preparo)
function Linha({ rotulo, valor, forte = false }) {
  if (!valor) return null;
  return (
    <div className="flex justify-between gap-2" style={{ fontSize: '2.7mm' }}>
      <span style={{ fontWeight: 700 }}>{rotulo}:</span>
      <span style={{ fontWeight: forte ? 800 : 600, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valor}</span>
    </div>
  );
}

// Um bloco de etiqueta física (repetido N vezes conforme a quantidade de cópias).
function EtiquetaLabel({ campos, config, qr, estabelecimento }) {
  const c = config.campos;
  const comQR = config.incluirQR && qr?.svg;
  const est = estabelecimento || {};
  const qrMm = comQR ? tamanhoQRmm(qr.modulos, config.alturaMm) : 0;
  return (
    <div className="etiqueta-label bg-white text-black flex flex-col"
      style={{ width: `${config.larguraMm}mm`, height: `${config.alturaMm}mm`, padding: '1.6mm 2mm', boxSizing: 'border-box', lineHeight: 1.25, fontFamily: 'system-ui, sans-serif' }}>
      {/* Cabeçalho: produto + medida */}
      {/* ⚠️ flexShrink 0 + limite de 2 linhas. A etiqueta tem ALTURA FIXA e o
          print CSS aplica overflow:hidden nela; sem esta trava um nome longo
          ("FILÉ MIGNON PORCIONADO 180G") empurrava o miolo e o RODAPÉ para fora
          do papel — sumia justamente o QR e o lote, numa etiqueta que fica
          colada no pote circulando na frente do cliente do restaurante. */}
      <div className="flex items-start justify-between gap-1 border-b border-black"
        style={{ paddingBottom: '0.8mm', marginBottom: '0.8mm', flexShrink: 0 }}>
        <div style={{
          fontSize: (campos.nome || '').length > 24 ? '3.0mm' : '3.6mm',
          fontWeight: 800, textTransform: 'uppercase',
          // Duas travas somadas de propósito: o line-clamp corta com reticências
          // onde o -webkit-box vale, e o maxHeight garante o corte mesmo onde
          // ele não vale (medi no navegador: o display computou flow-root, e aí
          // o clamp sozinho não corta nada).
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          maxHeight: '9.5mm', overflow: 'hidden', wordBreak: 'break-word',
        }}>{campos.nome}</div>
        {campos.medida && <div style={{ fontSize: '3.2mm', fontWeight: 800, whiteSpace: 'nowrap' }}>{campos.medida}</div>}
      </div>
      {c.armazenamento !== false && campos.armazenamentoLabel && (
        <div style={{ fontSize: '2.7mm', fontWeight: 700 }}>{campos.armazenamentoLabel}</div>
      )}
      {/* Datas e dados */}
      <div className="flex-1" style={{ minHeight: 0, overflow: 'hidden' }}>
        {c.valOriginal !== false && <Linha rotulo="VAL. ORIGINAL" valor={campos.valOriginalFmt} />}
        {c.fabricacao !== false && <Linha rotulo={campos.rotuloData} valor={campos.dataFabricacaoFmt} />}
        {c.validade !== false && <Linha rotulo="VALIDADE" valor={campos.validadeFmt} forte />}
        {c.marca !== false && <Linha rotulo="MARCA / FORN" valor={campos.marca} />}
        {c.sif !== false && <Linha rotulo="SIF" valor={campos.sif} />}
        {c.responsavel !== false && <Linha rotulo="RESP." valor={campos.responsavel} />}
      </div>
      {/* Rodapé: estabelecimento + ID + QR */}
      <div className="flex items-end justify-between gap-1 border-t border-black" style={{ paddingTop: '0.8mm', marginTop: '0.8mm', flexShrink: 0 }}>
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
          // QR em SVG (vetor), não imagem: a impressora térmica é 1 bit (ponto
          // preto ou branco). Um PNG reduzido para ~20mm chega borrado/cinza,
          // vira meio-tom e o leitor não pega. O SVG é rasterizado direto na
          // resolução da impressora, com borda dura (shape-rendering=crispEdges).
          <div aria-hidden="true"
            style={{ width: `${qrMm}mm`, height: `${qrMm}mm`, flexShrink: 0 }}
            className="[&>svg]:w-full [&>svg]:h-full [&>svg]:block"
            dangerouslySetInnerHTML={{ __html: qr.svg }} />
        )}
      </div>
    </div>
  );
}

export default function EtiquetaPrint() {
  const { etiquetaState, fecharEtiquetas } = useUI();
  const { sessao } = useAuth();
  const { prefs, produtos, modulo, estoqueAtual, etiquetasImpressas, setEtiquetasImpressas } = useApp();
  // ⚠️ Nome que SAI IMPRESSO no pote. Com dois restaurantes na mesma conta, o
  // nome da conta sairia na etiqueta dos dois — erro visível na frente do
  // cliente, e o pote ainda circula. O nome do ESTOQUE manda quando o dono
  // preencheu; senão cai no da conta, que é o caso de quem tem uma casa só e
  // não precisa configurar nada.
  const nomeImpresso = estabelecimentoDe(estoqueAtual, sessao?.restauranteNome);
  // despensa não tem congelado/resfriado: a etiqueta do seco não pergunta isso
  const comArmazenamento = temRecurso(modulo, 'armazenamento');
  const config = configEtiqueta(prefs);
  const estabelecimento = prefs.estabelecimento || {};

  // Cópia local editável dos itens + hora congelada na abertura do modal
  const [itens, setItens] = useState([]);
  // Cache de QR indexado pelo PRÓPRIO CONTEÚDO (payload), não pela posição do
  // item: assim um QR só é considerado pronto se foi gerado para os dados que
  // estão na tela agora. Indexado por índice, editar a data deixava o QR antigo
  // no lugar (texto novo + QR velho) até o laço assíncrono terminar.
  const [qrs, setQrs] = useState({}); // payload -> dataURL
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
        const n = Math.min(Math.max(0, parseInt(resolvido.quantidade) || 0), 200);
        return {
          ...resolvido,
          _lotes: Array.from({ length: n }, () => gerarLoteId()),
          _dataOriginal: resolvido.dataFabricacao,
          _armazOriginal: resolvido.armazenamento,
        };
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
  const camposDe = (item, loteId = null) => {
    const dias = item.diasValidade != null ? item.diasValidade
      // sem câmara fria (despensa): o prazo de prateleira é único e fica em
      // diasCongelado. Sem esta linha a etiqueta do seco saía SEM validade.
      : !comArmazenamento ? (item.diasCongelado || 0)
      : item.armazenamento === 'congelado' ? (item.diasCongelado || 0)
      : item.armazenamento === 'resfriado' ? (item.diasResfriado || 0)
      : 0;
    const naoEditado = item._dataOriginal === item.dataFabricacao && item._armazOriginal === item.armazenamento;
    return montarCamposEtiqueta({
      nome: item.nome,
      dataFabricacao: item.dataFabricacao,
      tipoData: item.tipoData,
      armazenamento: item.armazenamento,
      restauranteNome: nomeImpresso,
      responsavel,
      // validade pronta (de registro real) só vale enquanto data/armazenamento não mudarem
      validade: naoEditado ? item.validade : null,
      diasValidade: dias,
      medida: item.medida,
      valOriginal: item.valOriginal || null,
      marca: item.marca,
      sif: item.sif,
      hora: horaImpressao,
      loteId,
    });
  };

  // Id de lote POR CÓPIA física. Vive DENTRO do item (`_lotes`), criado nos
  // manipuladores de evento — nunca durante o render. Precisa ser estável: se
  // mudasse a cada tecla, o QR seria regerado sem parar e a etiqueta que sai na
  // impressora teria um id diferente do registrado no catálogo.
  const loteDaCopia = (item, copia) => item._lotes?.[copia] || '';

  // Payload do QR de cada item — é também a chave do cache de QR
  const payloadDe = (item, loteId) => montarPayloadQR(camposDe(item, loteId));

  // Gera os QR codes quando ligado (async — toDataURL é Promise).
  // Só gera o que ainda não está em cache: editar um item de um lote não
  // refaz o QR dos outros.
  useEffect(() => {
    if (!config.incluirQR || !itens.length) return;
    let ativo = true;
    (async () => {
      const todos = [];
      itens.forEach((it) => {
        for (let c = 0; c < limitarCopias(it.quantidade); c++) todos.push(payloadDe(it, loteDaCopia(it, c)));
      });
      const pendentes = [...new Set(todos)].filter(p => !qrs[p]);
      if (!pendentes.length) return;
      const novos = {};
      for (const payload of pendentes) {
        try {
          const svg = await QRCode.toString(payload, {
            type: 'svg',
            // margin em "módulos" — a zona de silêncio faz parte do padrão QR;
            // sem ela a câmera não acha a borda do código.
            margin: 2,
            // 'M' recupera ~15% de dano (vinco, condensação do freezer, borrão)
            // sem inflar demais o número de módulos. Ver montarPayloadQR.
            errorCorrectionLevel: 'M',
          });
          // o viewBox traz os módulos JÁ com a zona de silêncio — é essa conta
          // que define o tamanho físico mínimo para o código sair legível
          const modulos = parseInt((svg.match(/viewBox="0 0 (\d+)/) || [])[1], 10) || 41;
          novos[payload] = { svg, modulos };
        } catch { /* QR falhou — etiqueta sai sem ele */ }
      }
      // acumula no cache (não substitui): os QRs já prontos continuam valendo
      if (ativo) setQrs(prev => ({ ...prev, ...novos }));
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camposDe lê só props estáveis + itens/responsavel (já na lista); qrs é lido só como cache
  }, [itens, config.incluirQR, responsavel]);

  if (!etiquetaState) return null;

  // Mantém um id por cópia: crescer a quantidade cria ids novos; diminuir
  // corta os do fim, sem mexer nos que já estavam (o QR deles não muda).
  const comLotes = (it) => {
    const n = limitarCopias(it.quantidade);
    const atuais = it._lotes || [];
    if (atuais.length === n) return it;
    const novos = atuais.slice(0, n);
    while (novos.length < n) novos.push(gerarLoteId());
    return { ...it, _lotes: novos };
  };

  const setItem = (idx, patch) => setItens(prev => prev.map((it, i) => i === idx ? comLotes({ ...it, ...patch }) : it));
  // Stepper com update funcional: toques rápidos seguidos não podem ler closure velha
  const mudarQtd = (idx, delta) => setItens(prev => prev.map((it, i) =>
    i === idx ? comLotes({ ...it, quantidade: limitarCopias((parseInt(it.quantidade) || 0) + delta) }) : it));
  const totalEtiquetas = itens.reduce((s, i) => s + (parseInt(i.quantidade) || 0), 0);
  // QR ligado: segura o Imprimir até TODOS os QRs dos itens a imprimir ficarem
  // prontos (toDataURL é assíncrono — sem isso a etiqueta podia sair sem QR)
  // Checa pelo CONTEÚDO: se a data/armazenamento acabou de mudar, o QR daquele
  // conteúdo ainda não existe e o Imprimir fica travado até ele ficar pronto —
  // nunca sai etiqueta com texto novo e QR velho.
  const qrPendente = config.incluirQR && itens.some(it => {
    const n = limitarCopias(it.quantidade);
    for (let c = 0; c < n; c++) if (!qrs[payloadDe(it, loteDaCopia(it, c))]) return true;
    return false;
  });
  const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs';

  // Ao imprimir, cada cópia vira uma ETIQUETA FÍSICA registrada: é o que
  // permite depois contar por leitura de QR e saber o que ainda está na
  // prateleira. Sem isto o id no código seria só enfeite.
  const imprimir = () => {
    const hojeISO = hoje();
    const novas = [];
    itens.forEach(item => {
      const n = limitarCopias(item.quantidade);
      if (!n) return;
      const c = camposDe(item);
      for (let i = 0; i < n; i++) {
        const loteId = loteDaCopia(item, i);
        if (!loteId) continue;
        novas.push({
          id: loteId,
          produtoId: item.produtoId || null,
          nome: c.nome,
          medida: c.medida || '',
          validade: c.validade || null,
          fabricacao: c.dataFabricacao || null,
          responsavel: c.responsavel || '',
          impressoEm: hojeISO,
          status: 'valida',
        });
      }
    });
    if (novas.length) {
      setEtiquetasImpressas(podarEtiquetas([...etiquetasImpressas, ...novas], hojeISO));
    }
    window.print();
  };

  return (
    <>
      {/* Modal on-screen (não imprime — print:hidden) */}
      <div className="fixed inset-0 bg-black/50 z-[120] overflow-y-auto p-4 print:hidden"
        onClick={e => { if (e.target === e.currentTarget) fecharEtiquetas(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="etq-titulo"
          className="bg-white rounded-2xl w-full max-w-md mx-auto my-8 p-5 space-y-4">
          <div className="flex items-start justify-between">
            <h2 id="etq-titulo" className="font-bold text-polo-navy text-lg">Imprimir etiquetas</h2>
            <button onClick={fecharEtiquetas} aria-label="Fechar"
              className="text-gray-600 text-2xl leading-none px-1 -mt-1">×</button>
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
                      <input type="number" min="0" max={MAX_COPIAS} inputMode="numeric" value={item.quantidade}
                        onChange={e => setItem(idx, { quantidade: e.target.value === '' ? '' : limitarCopias(e.target.value) })}
                        aria-label={`Quantidade de etiquetas de ${item.nome}`}
                        className="w-12 text-center border border-gray-200 rounded-lg py-1.5 text-sm font-semibold" />
                      <button aria-label={`Mais etiquetas de ${item.nome}`}
                        onClick={() => mudarQtd(idx, +1)}
                        className="w-9 h-9 rounded-full bg-polo-navy text-polo-gold font-bold flex items-center justify-center">+</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">
                        {item.tipoData === 'abertura' ? 'Data de abertura' : 'Data de manipulação'}
                      </label>
                      <input type="date" value={item.dataFabricacao} max={hoje()}
                        onChange={e => setItem(idx, { dataFabricacao: e.target.value })} className={inputCls} />
                    </div>
                    {comArmazenamento && item.armazenamento !== null ? (
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">Armazenamento</label>
                        <select value={item.armazenamento || 'congelado'}
                          onChange={e => setItem(idx, { armazenamento: e.target.value })}
                          className={`${inputCls} bg-white`}>
                          <option value="congelado">❄️ Congelado</option>
                          <option value="resfriado">🧊 Resfriado</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">Medida (ex: 1 kg)</label>
                        <input type="text" value={item.medida} placeholder={item._unidade || 'ex: 1 kg'}
                          onChange={e => setItem(idx, { medida: e.target.value })} className={inputCls} />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {comArmazenamento && item.armazenamento !== null && (
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">Medida (ex: 1 kg)</label>
                        <input type="text" value={item.medida} placeholder={item._unidade || 'ex: 1 kg'}
                          onChange={e => setItem(idx, { medida: e.target.value })} className={inputCls} />
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">Val. original (fornecedor)</label>
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

          {/* ⚠️ PREVIEW em tamanho real. A área que de fato imprime é
              visibility:hidden (index.css), então até aqui a pessoa só descobria
              como a etiqueta ficou DEPOIS de gastar rolo — e o layout é
              configurável (9 campos ligáveis + largura/altura), o que torna o
              erro provavel. É a MESMA marcação da impressa, só que visível. */}
          {itens[0] && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1.5">
                Como vai sair — {config.larguraMm}×{config.alturaMm} mm
              </p>
              <div className="bg-gray-100 rounded-xl p-3 flex justify-center overflow-x-auto">
                <div className="shadow-md flex-shrink-0">
                  <EtiquetaLabel
                    campos={camposDe(itens[0], loteDaCopia(itens[0], 0))}
                    config={config}
                    qr={qrs[payloadDe(itens[0], loteDaCopia(itens[0], 0))]}
                    estabelecimento={estabelecimento} />
                </div>
              </div>
              {itens.length > 1 && (
                <p className="text-[11px] text-gray-600 mt-1">Mostrando a primeira de {totalEtiquetas}.</p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={fecharEtiquetas}
              className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">Agora não</button>
            <button onClick={imprimir} disabled={totalEtiquetas === 0 || qrPendente}
              className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl disabled:opacity-40">
              {qrPendente
                ? 'Gerando QR…'
                : `Imprimir ${totalEtiquetas > 0 ? (totalEtiquetas === 1 ? '1 etiqueta' : `${totalEtiquetas} etiquetas`) : ''}`}
            </button>
          </div>
        </div>
      </div>

      {/* Tamanho físico da página de impressão (vem das prefs — Tailwind não expressa @page) */}
      <style>{`@media print { @page { size: ${config.larguraMm}mm ${config.alturaMm}mm; margin: 0; } }`}</style>

      {/* ⚠️ PORTAL para o <body>, e isto NÃO é preferência de estilo.
          A área de impressão vivia dentro do #root, e o CSS escondia o resto do
          app com `visibility: hidden`. Só que `visibility` esconde SEM TIRAR DO
          LAYOUT: o app inteiro continuava ocupando a altura dele, e o navegador
          paginava essa altura em folhas do tamanho da etiqueta. Medido no
          navegador: documento de 933 px ÷ etiqueta de 151 px = 7 folhas, uma com
          a etiqueta e SEIS EM BRANCO — e numa tela com lista longa, muito mais.
          Foi exatamente o que saiu na primeira impressão real.

          Com o portal, a etiqueta é filha direta do <body> e o #root pode ser
          `display: none` no print — aí ele sai do layout de verdade e sobra
          só a etiqueta. */}
      {createPortal(
        <div className="etiqueta-print-area" aria-hidden="true">
          {itens.flatMap((item, idx) =>
            Array.from({ length: limitarCopias(item.quantidade) }, (_, c) => {
              const lote = loteDaCopia(item, c);
              return (
                <EtiquetaLabel key={`${idx}_${c}`} campos={camposDe(item, lote)} config={config}
                  qr={qrs[payloadDe(item, lote)]} estabelecimento={estabelecimento} />
              );
            })
          )}
        </div>,
        document.body
      )}
    </>
  );
}
