import { useState, useEffect } from 'react';
import { useAuth } from '../store/AuthContext';

// Canal de feedback do cliente (bug ou sugestão) direto pelo app.
// Guia o cliente a descrever direito — o que esperava, o que aconteceu e como
// repetir — e monta uma mensagem organizada no WhatsApp, com o contexto técnico
// (tela, cargo, navegador) que facilita o conserto/análise.
const WPP_NUMERO = '5581998184489';
// text-gray-900 é essencial: o modal é filho do cabeçalho (texto branco) e sem
// isto os campos herdam cor branca — o texto digitado fica invisível no fundo branco.
const campo = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900';

export default function BotaoFeedback() {
  const { sessao } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState('bug'); // 'bug' | 'sugestao'
  // bug
  const [onde, setOnde] = useState('');
  const [esperava, setEsperava] = useState('');
  const [aconteceu, setAconteceu] = useState('');
  const [repetir, setRepetir] = useState('');
  // sugestão
  const [ideia, setIdeia] = useState('');
  const [porque, setPorque] = useState('');

  useEffect(() => {
    if (!aberto) return;
    const onEsc = (e) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [aberto]);

  const navegador = (() => {
    try { return navigator.userAgent.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 60); }
    catch { return '—'; }
  })();
  const rodape = `— enviado pelo app · ${sessao?.restauranteNome || 'restaurante'} · ${sessao?.cargo || '?'} · ${navegador}`;

  const enviar = () => {
    let corpo;
    if (tipo === 'bug') {
      corpo = `🐛 PROBLEMA — Aurum Cozinha Pro
📍 Onde (qual tela/botão): ${onde || '(não informado)'}
🎯 O que eu esperava: ${esperava || '(não informado)'}
⚠️ O que aconteceu: ${aconteceu || '(não informado)'}
🔁 Como repetir (passo a passo): ${repetir || '(não informado)'}
📎 Vou anexar um print a seguir.
${rodape}`;
    } else {
      corpo = `💡 SUGESTÃO — Aurum Cozinha Pro
O que eu queria poder fazer: ${ideia || '(não informado)'}
Por que ajudaria no dia a dia: ${porque || '(não informado)'}
${rodape}`;
    }
    window.open(`https://wa.me/${WPP_NUMERO}?text=${encodeURIComponent(corpo)}`, '_blank', 'noopener,noreferrer');
    setAberto(false);
  };

  return (
    <>
      <button onClick={() => setAberto(true)} aria-label="Enviar problema ou sugestão"
        title="Relatar problema ou sugerir melhoria"
        className="flex flex-col items-center gap-0.5 text-polo-gold active:scale-90 transition-transform
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold rounded-lg">
        <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">💬</span>
        <span className="text-[8px] leading-none font-semibold text-white/70">Ajuda</span>
      </button>

      {aberto && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-3 print:hidden"
          onClick={() => setAberto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Relatar problema ou sugestão"
            className="bg-white text-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-polo-navy">Falar com a equipe Aurum</h2>
              <button onClick={() => setAberto(false)} aria-label="Fechar" className="text-gray-400 text-xl leading-none">✕</button>
            </div>

            {/* Tipo */}
            <div className="flex gap-2 mb-3">
              {[['bug', '🐛 Problema'], ['sugestao', '💡 Sugestão']].map(([v, l]) => (
                <button key={v} onClick={() => setTipo(v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2
                    ${tipo === v ? 'border-polo-gold bg-polo-beige text-polo-navy' : 'border-gray-200 text-gray-500'}`}>
                  {l}
                </button>
              ))}
            </div>

            {tipo === 'bug' ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Quanto mais detalhes, mais rápido a gente resolve. Preencha o que der:
                </p>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">📍 Em qual tela/botão aconteceu?</span>
                  <input className={campo} value={onde} onChange={e => setOnde(e.target.value)} placeholder="Ex.: Registrar → Produção" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">🎯 O que você esperava que acontecesse?</span>
                  <textarea className={campo} rows={2} value={esperava} onChange={e => setEsperava(e.target.value)} placeholder="Ex.: salvar a produção" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">⚠️ O que aconteceu de verdade?</span>
                  <textarea className={campo} rows={2} value={aconteceu} onChange={e => setAconteceu(e.target.value)} placeholder="Ex.: deu erro / travou / salvou duplicado" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">🔁 Como repetir? (passo a passo)</span>
                  <textarea className={campo} rows={2} value={repetir} onChange={e => setRepetir(e.target.value)} placeholder="Ex.: 1) abri Produção 2) toquei em salvar 3) ..." />
                </label>
                <p className="text-[11px] text-gray-400">
                  Dica: se der, tire um <strong>print da tela</strong> — você anexa no WhatsApp que vai abrir.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">O que você queria poder fazer?</span>
                  <textarea className={campo} rows={2} value={ideia} onChange={e => setIdeia(e.target.value)} placeholder="Ex.: filtrar o histórico por fornecedor" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Por que isso ajudaria no seu dia a dia?</span>
                  <textarea className={campo} rows={2} value={porque} onChange={e => setPorque(e.target.value)} placeholder="Ex.: agilizaria a conferência das compras" />
                </label>
              </div>
            )}

            <button onClick={enviar}
              className="w-full mt-4 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm">
              Enviar pelo WhatsApp →
            </button>
            <p className="text-[11px] text-gray-400 text-center mt-1.5">
              Abre o WhatsApp com sua mensagem já montada. Nada é enviado sem você confirmar lá.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
