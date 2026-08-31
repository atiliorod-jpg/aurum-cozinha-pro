import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

// Canal de feedback do cliente (bug ou sugestão) direto pelo app.
// Guia o cliente a descrever direito e envia para a aba do super-admin (RPC
// enviar_feedback),
// com o contexto técnico (cargo, navegador) que facilita o conserto/análise.
// text-gray-900 é essencial: o modal é filho do cabeçalho (texto branco) e sem
// isto os campos herdam cor branca — o texto digitado fica invisível no fundo branco.
const campo = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900';

export default function BotaoFeedback() {
  const { sessao } = useAuth();
  const { toast, confirm, ajudaPedida, abrirAjuda, fecharAjuda } = useUI();
  const [enviando, setEnviando] = useState(false);
  // ⚠️ ABERTURA E ABA VIVEM NO CONTEXTO, como `etiquetaState` — não em estado
  // local. Não é preferência: outras telas precisam abrir a Ajuda já na aba
  // certa (o cartão do plano completo faz isso), e a ponte por efeito seria
  // setState em cascata dentro de efeito, que é o que o comentário do `abrir`
  // logo abaixo já mandava evitar. Derivando do contexto, quem abre define o
  // tipo no próprio toque.
  const aberto = !!ajudaPedida;
  const tipo = ajudaPedida || 'bug'; // 'bug' | 'sugestao' | 'pedido'
  // bug
  const [onde, setOnde] = useState('');
  const [aconteceu, setAconteceu] = useState('');
  // sugestão
  const [ideia, setIdeia] = useState('');
  const [porque, setPorque] = useState('');
  // pedido — mudanças que a Aurum precisa autorizar (hoje: o nome do
  // estabelecimento, que sai impresso na etiqueta e identifica a conta)
  const [pedidoMotivo, setPedidoMotivo] = useState('');
  // Conversa: o que este restaurante já enviou e o que a Aurum respondeu
  const [conversa, setConversa] = useState([]);
  const [aba, setAba] = useState('novo'); // 'novo' | 'conversa'

  // ⚠️ ABERTO DE OUTRA TELA. O cartão do plano completo, por exemplo, precisa
  // trazer a pessoa para cá já na aba certa — "procure o botão de Ajuda no
  // topo" é instrução que se lê e não se cumpre.

  const [resposta, setResposta] = useState({}); // { [id]: texto } — rascunho por assunto
  const [enviandoResp, setEnviandoResp] = useState('');

  // ⚠️ CARREGA MESMO COM O MODAL FECHADO: é o que permite o aviso no botão.
  // Sem isso a pessoa só descobriria a resposta se abrisse por conta própria —
  // e ninguém abre um canal que nunca respondeu antes.
  const carregarConversa = useCallback(async () => {
    // ⚠️ Sai ANTES de qualquer setState. Zerar a lista aqui era um setState
    // síncrono dentro do efeito, e isso dispara renderização em cascata — a
    // lista já nasce vazia, então não havia nada para zerar.
    if (!sessao?.restauranteId || sessao?.demo) return;
    const { data, error } = await supabase.rpc('meus_feedbacks');
    if (!error) setConversa(data || []);
  }, [sessao]);

  // ⚠️ A BUSCA INICIAL TEM CORPO PRÓPRIO, com trava de vida. Chamar a função
  // de recarga aqui era setState síncrono dentro de efeito (cascata de
  // renderização) e, pior, não tinha guarda: sair da tela no meio da consulta
  // deixava a resposta chegar depois e gravar estado num componente que já
  // não existe.
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!sessao?.restauranteId || sessao?.demo) return;
      const { data, error } = await supabase.rpc('meus_feedbacks');
      if (vivo && !error) setConversa(data || []);
    })();
    return () => { vivo = false; };
  }, [sessao]);

  const naoLidas = conversa.filter(f => f.resposta && !f.resposta_lida).length;

  useEffect(() => {
    if (!aberto) return;
    const onEsc = (e) => { if (e.key === 'Escape') fecharAjuda(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [aberto, fecharAjuda]);

  // Abriu com resposta pendente? Cai direto na conversa — quem tem resposta
  // esperando não quer o formulário em branco na frente.
  // ⚠️ No CLIQUE, não num efeito: decidir a aba dentro de um efeito é setState
  // síncrono em cascata, e aqui a informação já existe no momento do toque.
  const abrir = () => {
    setAba(naoLidas > 0 ? 'conversa' : 'novo');
    abrirAjuda('bug');
    carregarConversa();
  };

  const marcarLida = async (f) => {
    if (!f.resposta || f.resposta_lida) return;
    await supabase.rpc('marcar_resposta_lida', { p_id: f.id });
    setConversa(prev => prev.map(x => x.id === f.id ? { ...x, resposta_lida: true } : x));
  };

  // ⚠️ CAMPO ÚNICO, sem as três perguntas do formulário. Continuar um assunto
  // é conversa; repetir "onde aconteceu / o que esperava / como repetir" a cada
  // frase transformaria uma resposta de uma linha num interrogatório.
  const continuar = async (f) => {
    const txt = (resposta[f.id] || '').trim();
    if (!txt) { toast('Escreva a mensagem.', 'aviso'); return; }
    if (sessao?.demo) { toast('Demonstração: nada foi enviado de verdade.', 'aviso'); return; }
    setEnviandoResp(f.id);
    const { error } = await supabase.rpc('continuar_feedback', { p_id: f.id, p_texto: txt });
    setEnviandoResp('');
    if (error) { toast('Não consegui enviar agora.', 'erro'); return; }
    setResposta(r => ({ ...r, [f.id]: '' }));
    toast('Enviado.', 'sucesso');
    carregarConversa();
  };

  const concluir = async (f) => {
    if (sessao?.demo) { toast('Demonstração: nada é salvo.', 'aviso'); return; }
    const ok = await confirm({
      titulo: 'Encerrar este assunto?',
      mensagem: 'Ele sai da lista e fica guardado em Encerrados. Se voltar a acontecer, é só abrir um novo em Escrever.',
      confirmar: 'Encerrar',
    });
    if (!ok) return;
    const { error } = await supabase.rpc('concluir_feedback', { p_id: f.id });
    if (error) { toast('Não consegui encerrar agora.', 'erro'); return; }
    carregarConversa();
  };

  const navegador = (() => {
    try { return navigator.userAgent.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 60); }
    catch { return '—'; }
  })();
  const limpar = () => { setOnde(''); setAconteceu(''); setIdeia(''); setPorque(''); setPedidoMotivo(''); };

  const enviar = async () => {
    const dados = tipo === 'bug'
      ? { onde, aconteceu }
      : tipo === 'pedido'
        // ⚠️ O NOME ATUAL VAI JUNTO. Sem ele o pedido chega como "mudar para
        // X" e a equipe não sabe qual conta é — o nome é justamente o que
        // identifica o restaurante no painel, e ele é o que vai mudar.
        // O nome atual e o produto viajam junto: sem eles a equipe recebe
        // "quero mudar o plano" sem saber de qual conta nem de qual plano.
        ? { pedido: pedidoMotivo, casaHoje: sessao?.restauranteNome || '', plano: sessao?.produto || '' }
        : { ideia, porque };
    // ⚠️ O pedido tem validação PRÓPRIA. A checagem genérica abaixo olha se
    // TODO campo está vazio, e `dados.pedido` já vem preenchido pelo código —
    // então um pedido sem o nome novo passaria batido e chegaria à equipe
    // dizendo apenas "quero mudar o nome", sem dizer para quê.
    if (tipo === 'pedido' && !pedidoMotivo.trim()) {
      toast('Escreva o que você precisa.', 'aviso'); return;
    }
    const vazio = Object.values(dados).every(v => !String(v || '').trim());
    if (vazio) { toast('Escreva pelo menos um campo antes de enviar.', 'aviso'); return; }

    // Na demonstração não há restaurante real para vincular — envio simulado.
    // Sai como AVISO, não como sucesso: um toast verde depois de a pessoa
    // escrever tudo é lido como "enviado", e o feedback nunca existiu. O
    // banner dentro do formulário avisa antes de digitar.
    if (sessao?.demo) { toast('Demonstração: nada foi enviado de verdade.', 'aviso'); limpar(); fecharAjuda(); return; }

    setEnviando(true);
    const contexto = `${sessao?.cargo || '?'} · ${navegador}`;
    const { error } = await supabase.rpc('enviar_feedback', { p_tipo: tipo, p_dados: dados, p_contexto: contexto });
    setEnviando(false);
    if (error) { toast('Não consegui enviar agora. Tente de novo em instantes.', 'erro'); return; }
    toast('Enviado. A resposta aparece aqui mesmo, na aba Ajuda.', 'sucesso', { duracao: 6000 });
    limpar();
    carregarConversa();
    fecharAjuda();
  };

  return (
    <>
      <button onClick={abrir}
        aria-label={naoLidas > 0 ? `Ajuda — ${naoLidas} resposta(s) nova(s)` : 'Enviar problema ou sugestão'}
        title="Relatar problema ou sugerir melhoria"
        className="flex flex-col items-center gap-0.5 text-polo-gold active:scale-90 transition-transform
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold rounded-lg">
        <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center relative">
          <Icon name="suporte" size={18} />
          {naoLidas > 0 && (
            <span aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {naoLidas}
            </span>
          )}
        </span>
        <span className="text-[8px] leading-none font-semibold text-white/70">Ajuda</span>
      </button>

      {aberto && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-3 print:hidden"
          onClick={fecharAjuda}>
          <div role="dialog" aria-modal="true" aria-label="Relatar problema ou sugestão"
            className="bg-white text-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-polo-navy">Falar com a equipe Aurum</h2>
              <button onClick={fecharAjuda} aria-label="Fechar" className="text-gray-600 text-xl leading-none">✕</button>
            </div>

            {sessao?.demo && (
              <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-xs font-bold text-amber-800">Você está na demonstração</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Aqui o envio é só de exemplo — nada chega à equipe. Para falar com a gente de
                  verdade, entre na sua conta e use este mesmo botão.
                </p>
              </div>
            )}

            {/* ⚠️ DUAS ABAS. Sem a de conversa o cliente escrevia e não tinha
                para onde voltar: a resposta existia no banco e ele nunca via.
                Com resposta pendente o modal já abre nesta aba. */}
            <div className="flex gap-2 mb-3 border-b border-gray-100 pb-3">
              {[['novo', 'Escrever'], ['conversa', `Conversa${conversa.length ? ` (${conversa.length})` : ''}`]].map(([v, l]) => (
                <button key={v} onClick={() => setAba(v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold
                    ${aba === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
                  {l}
                  {v === 'conversa' && naoLidas > 0 && (
                    <span className="ml-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5 py-0.5">
                      {naoLidas}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {aba === 'conversa' ? (
              <div className="space-y-3">
                {conversa.length === 0 && (
                  <p className="text-xs text-gray-600 py-4 text-center">
                    Você ainda não enviou nada. O que enviar aparece aqui, junto com a resposta.
                  </p>
                )}
                {/* ⚠️ ENCERRADOS FICAM SEPARADOS, embaixo e recolhidos. Assunto
                    que acabou continua acessível — é o histórico — mas não pode
                    disputar espaço com o que ainda está aberto. */}
                {[['abertos', conversa.filter(f => f.status !== 'resolvido')],
                  ['encerrados', conversa.filter(f => f.status === 'resolvido')]].map(([grupo, lista]) => {
                  if (!lista.length) return null;
                  const corpo = lista.map(f => {
                    const d = f.dados || {};
                    const abertura = f.tipo === 'bug'
                      // esperava/repetir existiam no formulario antigo: assunto ja
                      // enviado continua com eles, e sumir aqui apagaria o relato.
                      ? [d.onde, d.esperava, d.aconteceu, d.repetir].filter(Boolean).join(' · ')
                      : f.tipo === 'pedido'
                        ? (d.pedido || '—')
                        : [d.ideia, d.porque].filter(Boolean).join(' · ');
                    const falas = Array.isArray(f.mensagens) ? f.mensagens : [];
                    const encerrado = f.status === 'resolvido';
                    return (
                      <div key={f.id} className={`border rounded-lg p-3 ${encerrado ? 'border-gray-200 bg-gray-50' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-polo-navy">
                            {f.tipo === 'bug' ? 'Problema' : f.tipo === 'pedido' ? 'Pedido' : 'Sugestão'}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {new Date(f.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 mt-1">{abertura || '—'}</p>

                        {falas.length === 0 && !encerrado && (
                          <p className="text-[11px] text-gray-500 mt-1.5">Ainda sem resposta.</p>
                        )}
                        {falas.map((m, i) => (
                          <div key={i}
                            ref={el => { if (el && m.de === 'aurum' && i === falas.length - 1) marcarLida(f); }}
                            className={`mt-2 rounded-lg px-2.5 py-2 ${m.de === 'aurum' ? 'bg-polo-beige' : 'bg-gray-100'}`}>
                            <p className="text-[11px] font-bold text-polo-navy">
                              {m.de === 'aurum' ? 'Aurum' : 'Você'}
                            </p>
                            <p className="text-xs text-gray-700 whitespace-pre-wrap mt-0.5">{m.texto}</p>
                          </div>
                        ))}

                        {encerrado ? (
                          <p className="text-[11px] text-gray-500 mt-2">Encerrado por você.</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {/* ⚠️ UM CAMPO SÓ, sem as três perguntas do
                                formulário: continuar um assunto é conversa, e
                                repetir "onde aconteceu / o que esperava / como
                                repetir" a cada frase transformaria uma resposta
                                de uma linha num interrogatório. */}
                            <textarea rows={2} value={resposta[f.id] || ''}
                              onChange={e => setResposta(r => ({ ...r, [f.id]: e.target.value }))}
                              placeholder="Responder…" aria-label="Continuar a conversa"
                              className={campo} />
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => continuar(f)} disabled={enviandoResp === f.id}
                                className="text-[11px] font-bold bg-polo-navy text-polo-gold rounded-lg px-3 py-1.5 disabled:opacity-60">
                                {enviandoResp === f.id ? 'Enviando…' : 'Enviar'}
                              </button>
                              <button onClick={() => concluir(f)}
                                className="text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5">
                                Encerrar assunto
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                  if (grupo === 'abertos') return <div key={grupo} className="space-y-3">{corpo}</div>;
                  return (
                    <details key={grupo} className="pt-1">
                      <summary className="cursor-pointer text-[11px] font-semibold text-gray-600">
                        Encerrados ({lista.length})
                      </summary>
                      <div className="space-y-3 pt-2">{corpo}</div>
                    </details>
                  );
                })}
                <p className="text-[11px] text-gray-600 text-center">
                  Assunto novo é na aba <strong>Escrever</strong>.
                </p>
              </div>
            ) : (
            <>
            {/* Tipo */}
            <div className="flex gap-2 mb-3">
              {[['bug', 'Problema'], ['sugestao', 'Sugestão'], ['pedido', 'Pedido']].map(([v, l]) => (
                <button key={v} onClick={() => abrirAjuda(v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2
                    ${tipo === v ? 'border-polo-gold bg-polo-beige text-polo-navy' : 'border-gray-200 text-gray-500'}`}>
                  {l}
                </button>
              ))}
            </div>

            {tipo === 'bug' ? (
              <div className="space-y-3">
                {/* ⚠️ ERAM QUATRO PERGUNTAS E VIRARAM DUAS. "Como repetir" pedia
                    um roteiro numerado de quem está no meio do serviço com o
                    pote na mão — e quase sempre voltava vazio ou repetindo a
                    anterior. Ela virou parte da pergunta principal, que é onde
                    a pessoa já ia escrever isso naturalmente. */}
                <p className="text-xs text-gray-500">
                  Escreva do seu jeito. Quanto mais detalhe, mais rápido a gente resolve.
                </p>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Em que tela aconteceu</span>
                  <input className={campo} value={onde} onChange={e => setOnde(e.target.value)}
                    placeholder="Onde você estava quando deu errado" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">O que aconteceu</span>
                  <textarea className={campo} rows={4} value={aconteceu} onChange={e => setAconteceu(e.target.value)}
                    placeholder={'Conte o que você fez, o que o app fez, e o que você esperava que acontecesse.\n\nSe souber repetir, diga como.'} />
                </label>
              </div>
            ) : tipo === 'pedido' ? (
              /* ⚠️ ABA DE PEDIDO, não "formulário de trocar nome". Ela nasceu para
                 o nome do estabelecimento e ficou presa nisso — mas o que ela
                 resolve é qualquer alteração que dependa da Aurum: plano, vagas
                 de usuário, dados de cobrança, reativação. O primeiro texto
                 explicava a limitação técnica para o cliente, que não tem nada
                 a ver com isso; o que ele precisa saber é o que pedir e o que
                 vai acontecer depois. */
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Alterações que dependem da equipe Aurum: nome do estabelecimento, mudança de
                  plano, mais vagas de usuário, dados de cobrança.
                </p>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">O que você precisa</span>
                  <textarea className={campo} rows={4} value={pedidoMotivo}
                    onChange={e => setPedidoMotivo(e.target.value)}
                    placeholder="Descreva o pedido. Se for troca de nome, escreva exatamente como deve sair na etiqueta." />
                </label>
                <p className="text-[11px] text-gray-600">
                  Seguem junto o nome atual do estabelecimento e os dados da conta — você não
                  precisa repetir nada disso.
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

            <button onClick={enviar} disabled={enviando}
              className="w-full mt-4 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm disabled:opacity-60">
              {enviando ? 'Enviando…' : 'Enviar para a equipe Aurum'}
            </button>
            <p className="text-[11px] text-gray-600 text-center mt-1.5">
              A resposta chega aqui mesmo, na aba <strong>Conversa</strong>.
            </p>
            </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
