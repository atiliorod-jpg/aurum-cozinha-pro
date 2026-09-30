import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import LeitorQR from '../components/LeitorQR';
import BaixaEtiqueta from '../components/BaixaEtiqueta';
import Dialogo from '../components/Dialogo';
import Botao from '../components/Botao';
import Icon from '../components/Icons';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { hoje } from '../utils/formatters';
import { lerLoteIdDoQR } from '../utils/etiquetas';
import {
  acoesDaCozinha, ROTULO_ACAO, proximaEmbalagem, codigoLegivel, podeDesfazer,
  motivoParaPerguntar, AVISO_PARA_PERGUNTAR, normalizarCodigo,
} from '../utils/baixaEtiqueta';

// =====================================================================
//  LER ETIQUETAS (M59, 30/09/2026) — a baixa pela etiqueta
//
//  Três portas, uma tela:
//   • a câmera do app, CONTÍNUA: passa uma embalagem atrás da outra;
//   • o QR aberto pela câmera comum do celular (/q/CÓDIGO) — chega aqui
//     com o código na rota;
//   • o código de 8 letras escrito embaixo do QR, digitado.
//
//  MODO RÁPIDO (decisão do dono): escolhe a ação uma vez e cada leitura já
//  é lançada, com Desfazer na lista. O que pedir um olhar (vencida, sem
//  medida, outra cozinha) abre a folha em vez de lançar.
// =====================================================================

const MODOS = [['perguntar', 'Perguntar a cada uma'], ['saida', 'Saída'], ['perda', 'Perda'], ['usada', 'Usado']];

export default function LerEtiquetas() {
  const { codigo: codigoDaRota } = useParams();
  const navigate = useNavigate();
  const { etiquetasImpressas, buscarEtiqueta, baixarEtiqueta, desfazerBaixa, modulo, produtos, locais, prefs, setPref, online } = useApp();
  const { toast } = useUI();
  const [lendo, setLendo] = useState(!codigoDaRota);
  const [digitado, setDigitado] = useState('');
  const [aberta, setAberta] = useState(null);       // etiqueta na folha "Dar baixa"
  const [modo, setModo] = useState('perguntar');
  const [destinoRapido, setDestinoRapido] = useState(prefs.destino && locais.some(l => l.id === prefs.destino) ? prefs.destino : (locais[0]?.id || ''));
  const [feitas, setFeitas] = useState([]);         // baixas desta visita, com Desfazer
  const [procurando, setProcurando] = useState(false);
  const acoesAqui = acoesDaCozinha(modulo);

  // a etiqueta pelo código: primeiro a lista da cozinha aberta, depois o banco
  const achar = useCallback(async (id) => {
    const lista = etiquetasImpressas || [];
    // o exato; senão, com letra parecida (O/0, I/L/1), se for uma só
    const parecidas = lista.filter(e => normalizarCodigo(e.id) === normalizarCodigo(id));
    const local = lista.find(e => e.id === id) || (parecidas.length === 1 ? parecidas[0] : null);
    if (local) return { ...local, cozinha: modulo };
    if (online === false) return null;
    return buscarEtiqueta(id);
  }, [etiquetasImpressas, modulo, buscarEtiqueta, online]);

  const anotar = useCallback((b, etq) => {
    const prox = proximaEmbalagem(etq);
    const destino = b.registro?.destino ? (locais.find(l => l.id === b.registro.destino)?.nome || b.registro.destino) : '';
    setFeitas(f => [{
      b, nome: etq.nome, embalagem: prox.de > 1 ? `${prox.numero}${b.potes > 1 ? `–${prox.numero + b.potes - 1}` : ''} de ${prox.de}` : '',
      texto: `${ROTULO_ACAO[b.acao]}${destino ? ` → ${destino}` : ''}`,
    }, ...f].slice(0, 30));
  }, [locais]);

  const processar = useCallback(async (texto) => {
    if (aberta || procurando) return;  // uma de cada vez
    const id = lerLoteIdDoQR(texto);
    if (!id) { toast('Esse código não é de uma etiqueta do Aurum.', 'aviso'); return; }
    setProcurando(true);
    const etq = await achar(id);
    setProcurando(false);
    if (!etq) {
      toast(online === false
        ? 'Sem internet, só aparecem as etiquetas desta cozinha. Confira o código ou conecte o aparelho.'
        : 'Etiqueta não encontrada nesta conta. Confira o código.', 'aviso', { duracao: 5000 });
      return;
    }
    if (modo === 'perguntar') { setAberta(etq); return; }
    const produto = etq.produtoId ? produtos.find(p => p.id === etq.produtoId) : null;
    const motivo = motivoParaPerguntar(etq, modo, { modulo, produto, hojeISO: hoje() });
    if (motivo) {
      toast(AVISO_PARA_PERGUNTAR[motivo], 'aviso', { duracao: 4000 });
      setAberta(etq);
      return;
    }
    if (modo === 'saida') setPref('destino', destinoRapido);
    const b = baixarEtiqueta({
      etq, acao: modo, potes: 1, destino: destinoRapido, produto,
      responsavel: prefs.responsavel || '', turno: prefs.turno || '',
    });
    if (!b) return;
    anotar(b, etq);
    toast(`${etq.nome}: ${ROTULO_ACAO[modo].toLowerCase()}`, 'sucesso', { duracao: 1500 });
  }, [aberta, procurando, achar, modo, produtos, modulo, destinoRapido, setPref, baixarEtiqueta, prefs.responsavel, prefs.turno, anotar, toast, online]);

  // a câmera chama sempre a versão mais nova, sem reabrir a cada render
  const processarRef = useRef(processar);
  useEffect(() => { processarRef.current = processar; }, [processar]);
  const aoLer = useCallback((texto) => processarRef.current?.(texto), []);

  // chegou pelo QR aberto na câmera comum do celular: /q/CÓDIGO
  const rotaLida = useRef('');
  useEffect(() => {
    if (!codigoDaRota || rotaLida.current === codigoDaRota) return;
    rotaLida.current = codigoDaRota;
    processarRef.current?.(codigoDaRota);
  }, [codigoDaRota]);

  const buscarDigitado = (e) => {
    e?.preventDefault();
    if (!digitado.trim()) return;
    processar(digitado);
    setDigitado('');
  };

  const desfazer = (item) => {
    desfazerBaixa(item.b);
    setFeitas(f => f.filter(x => x !== item));
    toast('Baixa desfeita.', 'sucesso');
  };

  return (
    <Layout title="Ler etiquetas">
      <p className="text-sm text-gray-600 mb-3">
        Aponte a câmera para o QR da etiqueta ou digite o código escrito embaixo dele.
      </p>

      {/* modo: perguntar a cada uma, ou lançar direto */}
      <div role="radiogroup" aria-label="O que fazer a cada leitura" className="flex gap-1.5 overflow-x-auto pb-1 mb-2">
        {MODOS.filter(([v]) => v === 'perguntar' || acoesAqui.includes(v)).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={modo === v} onClick={() => setModo(v)}
            className={`whitespace-nowrap min-h-11 px-3 rounded-full text-sm font-bold border flex-shrink-0
              ${modo === v ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'bg-white text-gray-600 border-gray-200'}`}>
            {l}
          </button>
        ))}
      </div>
      {modo === 'saida' && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2" aria-label="Destino da saída">
          {locais.map(l => (
            <button key={l.id} type="button" onClick={() => setDestinoRapido(l.id)} aria-pressed={destinoRapido === l.id}
              className={`whitespace-nowrap min-h-11 px-3 rounded-lg text-sm font-semibold border flex-shrink-0
                ${destinoRapido === l.id ? 'bg-polo-beige text-polo-navy border-polo-gold' : 'bg-white text-gray-600 border-gray-200'}`}>
              → {l.nome}
            </button>
          ))}
        </div>
      )}
      {modo !== 'perguntar' && (
        <p className="text-[11px] text-gray-600 mb-3">
          Modo rápido: cada embalagem lida já é lançada como <strong>{ROTULO_ACAO[modo].toLowerCase()}</strong>.
          Vencida, sem medida ou de outra cozinha abre a tela para você conferir.
        </p>
      )}

      <div className="mb-3">
        {lendo ? (
          <LeitorQR onLer={aoLer} onFechar={() => setLendo(false)} />
        ) : (
          <Botao variante="secundario" onClick={() => setLendo(true)}>
            <span className="inline-flex items-center gap-2"><Icon name="camera" size={18} />Abrir a câmera</span>
          </Botao>
        )}
      </div>

      <form onSubmit={buscarDigitado} className="flex gap-2 mb-5">
        <input type="text" value={digitado} onChange={e => setDigitado(e.target.value.toUpperCase())} maxLength={12}
          aria-label="Código da etiqueta" placeholder="Código (ex.: K3F9-X2AB)" autoCapitalize="characters"
          className="flex-1 min-w-0 min-h-11 border border-gray-200 rounded-lg px-3 py-2 text-base font-mono tracking-wider" />
        <button type="submit" disabled={!digitado.trim() || procurando}
          className="min-h-11 px-4 rounded-lg bg-polo-navy text-polo-gold font-bold text-sm disabled:opacity-50">
          {procurando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {feitas.length > 0 && (
        <section aria-label="Baixas desta leitura">
          <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2">Agora há pouco</p>
          <ul className="bg-white rounded-xl divide-y divide-gray-100">
            {feitas.map((f, i) => (
              <li key={`${f.b.baixaId}-${i}`} className="px-3 py-2 flex items-center justify-between gap-2">
                <span className="min-w-0 text-sm text-gray-800">
                  <strong className="text-polo-navy">{f.nome}</strong>
                  {f.embalagem && <span className="text-gray-500"> · embalagem {f.embalagem}</span>}
                  <span className="block text-[11px] text-gray-600">{f.texto} · {codigoLegivel(f.b.etiquetaId)}</span>
                </span>
                {podeDesfazer(f.b.quando) && (
                  <button type="button" onClick={() => desfazer(f)}
                    className="min-h-11 px-3 text-sm font-semibold text-polo-navy underline underline-offset-2 flex-shrink-0">
                    Desfazer
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" onClick={() => navigate('/validades')}
        className="mt-5 min-h-11 text-sm font-semibold text-polo-navy underline underline-offset-2">
        Ver a lista de validades
      </button>

      {aberta && (
        <Dialogo aoFechar={() => setAberta(null)} titulo="Dar baixa" forma="folha" largura="md">
          <BaixaEtiqueta etq={aberta} acaoInicial={modo !== 'perguntar' ? modo : null}
            onFeito={(b) => { anotar(b, aberta); setAberta(null); toast('Baixa registrada.', 'sucesso', { duracao: 1500 }); }} />
        </Dialogo>
      )}
    </Layout>
  );
}
