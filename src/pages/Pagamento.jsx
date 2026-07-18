import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import Layout from '../components/Layout';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { statusAssinatura, PLANOS, precoPlano, precoMensalEquivalente, economiaPlano } from '../utils/assinatura';
import { montarPixBRCode } from '../utils/pix';
import { fmtData } from '../utils/formatters';

const WPP_NUMERO = '5581998184489';
const PIX_CHAVE  = import.meta.env.VITE_PIX_CHAVE  || '';
const PIX_NOME   = import.meta.env.VITE_PIX_NOME   || 'Aurum Servicos Gastronomicos';
const PIX_CIDADE = import.meta.env.VITE_PIX_CIDADE || 'Recife';

const brl = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const dataISO = (ts) => new Date(ts).toISOString().slice(0, 10);

const RECURSOS = [
  '✅ Estoque completo (FEFO, mín/máx automático)',
  '✅ Entradas, saídas, produção e receitas',
  '✅ Etiquetas de validade com impressão',
  '✅ Relatórios + exportação Excel',
  '✅ Até 3 usuários com permissões por função',
  '✅ Funciona offline e sincroniza na nuvem',
];

export default function Pagamento() {
  const { sessao, avisarPagamento } = useAuth();
  const { toast } = useUI();
  const st = statusAssinatura(sessao);

  const [planoId, setPlanoId] = useState('mensal');
  const plano = PLANOS.find(p => p.id === planoId) || PLANOS[0];
  const valor = precoPlano(plano);
  const brcode = PIX_CHAVE
    ? montarPixBRCode({ chave: PIX_CHAVE, nome: PIX_NOME, cidade: PIX_CIDADE, valor, txid: plano.id.toUpperCase() })
    : '';

  const [qr, setQr] = useState('');
  const [avisando, setAvisando] = useState(false);
  const [confirmando, setConfirmando] = useState(false); // revela o campo do nome
  const [nomePagador, setNomePagador] = useState('');

  useEffect(() => {
    let vivo = true;
    // setState só nos callbacks assíncronos (nunca síncrono no corpo do efeito)
    const p = brcode ? QRCode.toDataURL(brcode, { margin: 1, width: 220 }) : Promise.resolve('');
    p.then(u => { if (vivo) setQr(u); }).catch(() => { if (vivo) setQr(''); });
    return () => { vivo = false; };
  }, [brcode]);

  const copiar = async (texto, msg) => {
    try { await navigator.clipboard.writeText(texto); toast(msg, 'sucesso'); }
    catch { toast('Não consegui copiar automaticamente — segure o dedo no texto.', 'erro'); }
  };

  const confirmarPagamento = async () => {
    if (!nomePagador.trim()) { toast('Diga o nome de quem fez o Pix.', 'erro'); return; }
    setAvisando(true);
    const erro = await avisarPagamento(plano.id, nomePagador.trim());
    if (erro) toast('Não registrou o aviso: ' + erro, 'erro');
    else toast('Recebemos seu aviso! Mande o comprovante no WhatsApp que ativamos rapidinho.', 'sucesso', { duracao: 6000 });
    const msg = encodeURIComponent(
      `Olá! Paguei o plano ${plano.label} (${brl(valor)}) do Aurum Cozinha Pro — restaurante ${sessao?.restauranteNome || ''}. Pagamento feito por ${nomePagador.trim()}. Segue o comprovante:`);
    window.open(`https://wa.me/${WPP_NUMERO}?text=${msg}`, '_blank', 'noopener,noreferrer');
    setTimeout(() => { setAvisando(false); setConfirmando(false); setNomePagador(''); }, 800);
  };

  return (
    <Layout title="Assinatura">
      {/* Situação atual */}
      <div className={`rounded-2xl p-5 mb-6 flex items-center gap-4 ${st.tipo === 'vencido' ? 'bg-red-700' : 'bg-polo-navy'}`}>
        <div className="w-14 h-14 bg-polo-gold/20 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
          {st.tipo === 'assinatura' ? '✅' : st.tipo === 'teste' ? '⏳' : st.tipo === 'vencido' ? '⚠️' : '🏪'}
        </div>
        <div>
          <p className="text-xs text-white/80 uppercase tracking-wide">Situação</p>
          <p className="text-polo-gold font-bold text-xl">
            {st.tipo === 'assinatura' ? 'Assinatura ativa'
              : st.tipo === 'teste' ? `Período de teste — ${st.diasRestantes} dia(s)`
              : st.tipo === 'vencido' ? 'Teste encerrado'
              : 'Conta administrativa'}
          </p>
          <p className="text-white/80 text-xs mt-0.5">
            {st.tipo === 'assinatura' ? `Válida até ${fmtData(dataISO(st.ate))}`
              : st.tipo === 'teste' ? `Teste grátis até ${fmtData(dataISO(st.ate))} — depois, assine para continuar`
              : st.tipo === 'vencido' ? 'Assine para voltar a usar o sistema'
              : 'Sem cobrança para esta conta'}
          </p>
        </div>
      </div>

      {/* Aviso de antecedência — a reativação é manual */}
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-5 flex items-start gap-2">
        <span className="text-base flex-shrink-0">⏰</span>
        <p className="text-xs text-amber-800">
          <strong>Pague com 24h de antecedência.</strong> A confirmação do Pix e a reativação são feitas
          pela equipe (em até 24h úteis) — não deixe para o último dia para não ficar sem o sistema.
        </p>
      </div>

      {/* Escolha do plano */}
      <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2">Escolha o plano</p>
      <div className="space-y-2 mb-5">
        {PLANOS.map(p => {
          const sel = p.id === planoId;
          const total = precoPlano(p);
          return (
            <button key={p.id} onClick={() => setPlanoId(p.id)}
              className={`w-full text-left rounded-2xl p-4 border-2 transition-colors
                ${sel ? 'border-polo-gold bg-polo-beige' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-polo-navy">{p.label}</span>
                    {p.desconto > 0 && (
                      <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                        −{Math.round(p.desconto * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {p.meses === 1 ? 'Cobrado todo mês'
                      : `${brl(precoMensalEquivalente(p))}/mês · economize ${brl(economiaPlano(p))}`}
                  </p>
                </div>
                <div className="text-right flex items-center gap-2">
                  <div>
                    <span className="text-lg font-bold text-polo-navy">{brl(total)}</span>
                    <span className="block text-[10px] text-gray-500">
                      {p.meses === 1 ? 'por mês' : `a cada ${p.meses} meses`}
                    </span>
                  </div>
                  <span className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                    ${sel ? 'border-polo-gold bg-polo-gold' : 'border-gray-300'}`}>
                    {sel && <span className="w-2 h-2 rounded-full bg-polo-navy" />}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pagamento por Pix */}
      {PIX_CHAVE ? (
        <div className="border-2 border-polo-gold bg-white rounded-2xl p-5 mb-5">
          <p className="font-bold text-polo-navy">💠 Pague por Pix — {brl(valor)}</p>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Plano {plano.label}. <strong>O valor já vem preenchido</strong> ao escanear o QR ou colar o código —
            você não precisa digitar o valor. É só confirmar {brl(valor)} no seu banco.
          </p>

          {qr && (
            <div className="flex justify-center mb-3">
              <img src={qr} alt="QR Code do Pix" className="w-52 h-52 rounded-lg border border-gray-200" />
            </div>
          )}

          <button onClick={() => copiar(brcode, 'Código Pix copiado! Cole no app do seu banco.')}
            className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm mb-2">
            📋 Copiar código Pix (copia e cola)
          </button>

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
            <p><strong>Recebedor:</strong> {PIX_NOME}</p>
            <p className="flex items-center gap-2">
              <strong>Chave:</strong>
              <span className="font-mono break-all">{PIX_CHAVE}</span>
              <button onClick={() => copiar(PIX_CHAVE, 'Chave Pix copiada!')}
                className="text-polo-navy font-semibold underline underline-offset-2 flex-shrink-0">copiar</button>
            </p>
            <p><strong>Valor:</strong> {brl(valor)}</p>
          </div>

          {!confirmando ? (
            <button onClick={() => setConfirmando(true)}
              className="w-full mt-3 border-2 border-polo-navy text-polo-navy font-bold py-3 rounded-xl text-sm">
              ✅ Já paguei
            </button>
          ) : (
            <div className="mt-3 bg-polo-beige rounded-xl p-3">
              <label className="block text-xs font-semibold text-polo-navy mb-1">Nome de quem fez o Pix</label>
              <input value={nomePagador} onChange={e => setNomePagador(e.target.value)}
                placeholder="Ex.: João da Silva" autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 mb-2" />
              <button onClick={confirmarPagamento} disabled={avisando}
                className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm disabled:opacity-60">
                {avisando ? 'Enviando…' : 'Confirmar e enviar comprovante'}
              </button>
            </div>
          )}
          <p className="text-[11px] text-gray-400 text-center mt-1.5">
            Ao confirmar, a equipe Aurum é avisada (com o nome e o horário) e o WhatsApp abre para você
            anexar o comprovante. A ativação sai em até 24h úteis.
          </p>
        </div>
      ) : (
        /* Sem chave Pix configurada ainda → só WhatsApp */
        <div className="border-2 border-polo-gold bg-polo-beige rounded-2xl p-5 mb-5">
          <p className="font-bold text-polo-navy mb-1">Assinar o plano {plano.label} — {brl(valor)}</p>
          <p className="text-xs text-gray-600 mb-3">Fale com a equipe Aurum pelo WhatsApp para receber os dados do Pix e ativar.</p>
          {!confirmando ? (
            <button onClick={() => setConfirmando(true)}
              className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm">
              💬 Falar no WhatsApp
            </button>
          ) : (
            <div className="bg-white rounded-xl p-3">
              <label className="block text-xs font-semibold text-polo-navy mb-1">Seu nome (de quem vai pagar)</label>
              <input value={nomePagador} onChange={e => setNomePagador(e.target.value)}
                placeholder="Ex.: João da Silva" autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 mb-2" />
              <button onClick={confirmarPagamento} disabled={avisando}
                className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm disabled:opacity-60">
                {avisando ? 'Abrindo…' : 'Continuar no WhatsApp'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* O que está incluído */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
        <p className="font-bold text-polo-navy text-sm mb-2">Tudo incluído em qualquer plano</p>
        <ul className="space-y-1.5">
          {RECURSOS.map((r, i) => <li key={i} className="text-sm text-gray-700">{r}</li>)}
        </ul>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-bold mb-1">ℹ️ Como funciona</p>
        <p>Todo restaurante novo tem <strong>7 dias de teste grátis</strong> com tudo liberado.
        Depois, escolha um plano e pague por Pix. A equipe Aurum confirma o pagamento e ativa sua
        assinatura — você recebe a confirmação pelo WhatsApp.</p>
      </div>
    </Layout>
  );
}
