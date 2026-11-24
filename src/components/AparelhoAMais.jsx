import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Icon from './Icons';
import Aviso from './Aviso';
import { TecladoVariavel } from './SenhaDaAdministracao';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { montarPixBRCode } from '../utils/pix';
import { ADICIONAL_APARELHO, fmtPreco } from '../utils/assinatura';
import { textoDaRecusa } from '../utils/senhaAdministracao';
import { WHATSAPP_SUPORTE } from '../utils/suporte';
import { quandoFoiVisto } from '../lib/aparelhos';

const PIX_CHAVE  = import.meta.env.VITE_PIX_CHAVE  || '';
const PIX_NOME   = import.meta.env.VITE_PIX_NOME   || 'Aurum Servicos Gastronomicos';
const PIX_CIDADE = import.meta.env.VITE_PIX_CIDADE || 'Recife';

// =====================================================================
//  O 4º APARELHO (M64, 24/11/2026 — pedido do dono)
//
//  A conta Etiquetas inclui 3 aparelhos conectados. O próximo para AQUI, e
//  tem dois caminhos:
//    • pagar o aparelho a mais (R$ 20 por mês): o 1º mês pelo Pix agora; a
//      Aurum confirma no painel e este aparelho entra sozinho — daí em
//      diante os R$ 20 vêm junto da mensalidade;
//    • liberar a vaga de um aparelho que não se usa mais (pede a senha da
//      Administração).
//  ⚠️ Quem decide é o banco: tocar "Já paguei" não solta nada, só avisa.
// =====================================================================
export default function AparelhoAMais({ aoSair }) {
  const {
    sessao, aparelho, conferirAparelho, pedirAparelhoExtra, listarAparelhos, removerAparelho,
    abrirAdministracao, administracaoAberta,
  } = useAuth();
  const { toast } = useUI();
  const limite = aparelho?.limite || 3;
  const pediu = !!aparelho?.pedido_em;
  const valor = fmtPreco(ADICIONAL_APARELHO);

  const [qr, setQr] = useState('');
  const [pagando, setPagando] = useState(false);   // mostra o Pix
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [lista, setLista] = useState(null);       // null = fechada
  const [alvo, setAlvo] = useState(null);         // o aparelho a tirar, esperando a senha
  const [tirando, setTirando] = useState('');

  const brcode = PIX_CHAVE
    ? montarPixBRCode({ chave: PIX_CHAVE, nome: PIX_NOME, cidade: PIX_CIDADE, valor: ADICIONAL_APARELHO, txid: 'APARELHO' })
    : '';
  useEffect(() => {
    let vivo = true;
    (pagando && brcode ? QRCode.toDataURL(brcode, { margin: 1, width: 220 }) : Promise.resolve(''))
      .then(u => { if (vivo) setQr(u); }).catch(() => { if (vivo) setQr(''); });
    return () => { vivo = false; };
  }, [pagando, brcode]);

  const msgWpp = (quem) => encodeURIComponent(
    `Olá! Paguei R$ ${valor} do aparelho a mais (Aurum Etiquetas) — ${sessao?.restauranteNome || ''}.`
    + `${quem ? ` Pix feito por ${quem}.` : ''} Segue o comprovante:`);

  const avisar = async () => {
    if (enviando) return;
    const quem = nome.trim();
    if (!quem) { toast('Diga o nome de quem fez o Pix.', 'erro'); return; }
    // ⚠️ ABRE ANTES DE ESPERAR: o celular bloqueia janela aberta depois de um await
    try { window.open(`https://wa.me/${WHATSAPP_SUPORTE}?text=${msgWpp(quem)}`, '_blank', 'noopener,noreferrer'); } catch { /* bloqueado */ }
    setEnviando(true);
    const erro = await pedirAparelhoExtra(quem);
    setEnviando(false);
    if (erro) { toast(erro, 'erro'); return; }
    toast('Aviso enviado. Mande o comprovante no WhatsApp.', 'sucesso', { duracao: 6000 });
  };

  const conferir = async () => {
    setConferindo(true);
    const r = await conferirAparelho();
    setConferindo(false);
    if (r?.situacao === 'aguardando') toast('Ainda não confirmado. Este aparelho entra sozinho quando a Aurum confirmar.', 'aviso');
  };

  const abrirLista = async () => {
    setLista('carregando');
    const r = await listarAparelhos();
    setLista(r ? (r.lista || []).filter(a => !a.este && a.situacao === 'ativo') : 'erro');
  };

  const tirar = async (a) => {
    setTirando(a.id);
    const erro = await removerAparelho(a.id);
    setTirando('');
    setAlvo(null);
    if (erro) { toast(erro, 'erro'); return; }
    toast(`${a.nome} saiu da conta.`, 'sucesso');
    // a vaga abriu: o banco põe ESTE aparelho para dentro na próxima conferência
    await conferirAparelho();
  };
  const pedirTirar = (a) => { if (administracaoAberta) tirar(a); else setAlvo(a); };
  const entrarComSenha = async (pin) => {
    const r = await abrirAdministracao(pin);
    if (!r?.ok) return textoDaRecusa(r);
    await tirar(alvo);
    return '';
  };

  const botao = 'w-full min-h-12 rounded-xl font-bold text-sm';

  return (
    <div className="min-h-screen bg-polo-beige">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <div className="text-center space-y-2">
          <span className="w-14 h-14 rounded-2xl bg-polo-navy text-polo-gold inline-flex items-center justify-center" aria-hidden="true">
            <Icon name="celular" size={28} />
          </span>
          <h1 className="text-xl font-titulo font-black uppercase tracking-wide text-polo-navy">Limite de aparelhos</h1>
          <p className="text-sm text-gray-700">Esta conta já tem {limite} aparelhos conectados.</p>
        </div>

        {alvo ? (
          <div className="cartao space-y-3">
            <TecladoVariavel titulo="Senha da Administração" rotuloCampo="Senha da Administração"
              subtitulo={`Para tirar ${alvo.nome} da conta.`} textoBotao="Tirar" aoEnviar={entrarComSenha}
              rodape={(
                <button type="button" onClick={() => setAlvo(null)} className="w-full min-h-11 text-sm font-semibold text-polo-navy">
                  Voltar
                </button>
              )} />
          </div>
        ) : (<>
          {/* ── mais um aparelho ── */}
          <section className="cartao space-y-3" aria-labelledby="ap-mais">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="ap-mais" className="font-bold text-polo-navy">Mais um aparelho</h2>
              <span className="text-polo-navy font-bold whitespace-nowrap">R$ {valor}/mês</span>
            </div>
            {pediu ? (
              <>
                <Aviso tom="neutro">Pagamento avisado. Quando a Aurum confirmar, este aparelho entra sozinho.</Aviso>
                <button onClick={conferir} disabled={conferindo} className={`${botao} bg-polo-navy text-polo-gold disabled:opacity-60`}>
                  {conferindo ? 'Conferindo…' : 'Conferir agora'}
                </button>
              </>
            ) : !pagando ? (
              <>
                <p className="text-xs text-gray-600">O 1º mês agora, pelo Pix. Depois, vem junto da mensalidade.</p>
                <button onClick={() => setPagando(true)} className={`${botao} bg-polo-navy text-polo-gold`}>Pagar R$ {valor} pelo Pix</button>
              </>
            ) : brcode ? (
              <>
                {qr && <img src={qr} alt="QR Code do Pix do aparelho a mais" className="w-48 h-48 mx-auto rounded-lg border border-gray-200" />}
                <button onClick={async () => {
                  try { await navigator.clipboard.writeText(brcode); toast('Código Pix copiado.', 'sucesso'); }
                  catch { toast('Não consegui copiar — segure o dedo no código.', 'erro'); }
                }} className={`${botao} border-2 border-polo-navy text-polo-navy`}>Copiar código Pix</button>
                <label htmlFor="ap-pagador" className="block text-xs font-semibold text-polo-navy">Nome de quem fez o Pix</label>
                <input id="ap-pagador" value={nome} onChange={e => setNome(e.target.value)} maxLength={80}
                  placeholder="Ex.: João da Silva" className="w-full border border-gray-200 rounded-lg px-3 min-h-11 text-sm" />
                <button onClick={avisar} disabled={enviando} className={`${botao} bg-polo-navy text-polo-gold disabled:opacity-60`}>
                  {enviando ? 'Enviando…' : 'Já paguei'}
                </button>
              </>
            ) : (
              <a href={`https://wa.me/${WHATSAPP_SUPORTE}?text=${msgWpp('')}`} target="_blank" rel="noopener noreferrer"
                className={`${botao} bg-green-600 text-white flex items-center justify-center`}>
                Falar com a Aurum no WhatsApp
              </a>
            )}
          </section>

          {/* ── ou liberar uma vaga ── */}
          <section className="cartao space-y-3" aria-labelledby="ap-vaga">
            <h2 id="ap-vaga" className="font-bold text-polo-navy">Ou libere uma vaga</h2>
            {lista === null && (
              <button onClick={abrirLista} className={`${botao} border-2 border-polo-navy text-polo-navy`}>Ver aparelhos conectados</button>
            )}
            {lista === 'carregando' && <p className="text-sm text-gray-600">Carregando…</p>}
            {lista === 'erro' && <Aviso tom="erro">Sem internet para ver a lista. Tente de novo.</Aviso>}
            {Array.isArray(lista) && (
              lista.length ? (
                <ul className="divide-y divide-gray-100">
                  {lista.map(a => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-polo-navy truncate">{a.nome}</span>
                        <span className="block text-xs text-gray-600">visto {quandoFoiVisto(a.visto_em)}</span>
                      </span>
                      <button onClick={() => pedirTirar(a)} disabled={tirando === a.id}
                        aria-label={`Tirar ${a.nome} da conta`}
                        className="min-h-11 px-3 rounded-xl border border-red-200 text-red-700 text-sm font-bold disabled:opacity-50 flex-shrink-0">
                        {tirando === a.id ? 'Tirando…' : 'Tirar'}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-gray-600">Nenhum outro aparelho conectado.</p>
            )}
          </section>
        </>)}

        <button onClick={aoSair} className="w-full min-h-11 text-sm font-semibold text-gray-600">Sair desta conta</button>
      </div>
    </div>
  );
}
