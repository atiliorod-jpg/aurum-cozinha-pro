import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { supabase } from '../lib/supabase';
import { statusRestaurante, TESTE_DIAS, PLANOS } from '../utils/assinatura';

const SUPER_ADMIN_EMAIL = 'atiliopinpolho@gmail.com';

const dataBR = (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—';

// Badge de situação comercial do restaurante (mesma régua do app do cliente)
function BadgeStatus({ st }) {
  const cfg = st.tipo === 'assinatura' ? ['🟢 Ativo', 'bg-green-100 text-green-700']
    : st.tipo === 'teste' ? [`🟡 Teste (${st.diasRestantes}d)`, 'bg-amber-100 text-amber-700']
    : st.tipo === 'bloqueado' ? ['🔒 Suspenso', 'bg-red-100 text-red-700']
    : ['🔴 Vencido', 'bg-red-100 text-red-700'];
  return <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${cfg[1]}`}>{cfg[0]}</span>;
}

export default function Admin() {
  const { sessao, verComoRestaurante } = useAuth();
  const { toast, confirm } = useUI();
  const navigate = useNavigate();
  const [restaurantes, setRestaurantes] = useState([]);
  const [carregando,   setCarregando]   = useState(true);
  const [erro,         setErro]         = useState(null);
  const [diasCustom,   setDiasCustom]   = useState({}); // rid -> string
  const [notasLocal,   setNotasLocal]   = useState({}); // rid -> string

  const carregar = useCallback(async () => {
    setCarregando(true);
    // select completo → fallback progressivo p/ bancos sem as colunas novas
    let { data: rests, error: errR } = await supabase
      .from('restaurantes')
      .select('id, nome, created_at, assinatura_ate, max_usuarios, bloqueado, aviso_pagamento_em, aviso_pagamento_plano')
      .order('created_at', { ascending: false });
    if (errR) {
      ({ data: rests, error: errR } = await supabase
        .from('restaurantes')
        .select('id, nome, created_at, assinatura_ate')
        .order('created_at', { ascending: false }));
    }
    if (errR) {
      ({ data: rests, error: errR } = await supabase
        .from('restaurantes')
        .select('id, nome, created_at')
        .order('created_at', { ascending: false }));
    }
    if (errR || !rests) {
      setErro(errR?.message || 'Sem acesso');
      setCarregando(false);
      return;
    }

    const ids = rests.map(r => r.id);
    // e-mails via RPC (migração 9); sem ela, cai no select básico (nome/cargo)
    let perfis = [];
    for (const rid of ids) {
      const { data: comEmail, error: eRpc } = await supabase.rpc('usuarios_do_restaurante', { p_restaurante: rid });
      if (!eRpc && comEmail) { perfis.push(...comEmail.map(u => ({ ...u, restaurante_id: rid }))); }
      else {
        const { data: basicos } = await supabase.from('perfis').select('id, nome, cargo').eq('restaurante_id', rid);
        perfis.push(...(basicos || []).map(u => ({ ...u, restaurante_id: rid })));
        break; // RPC ausente — não insiste nos demais
      }
    }

    // As prefs (incl. autorização de suporte) ficam em documentos.chave='prefs'
    const { data: docsPrefs } = ids.length
      ? await supabase.from('documentos').select('restaurante_id, dados').in('restaurante_id', ids).eq('chave', 'prefs')
      : { data: [] };
    const prefsPorRest = {};
    (docsPrefs || []).forEach(d => { prefsPorRest[d.restaurante_id] = d.dados || {}; });

    setRestaurantes(rests.map(r => {
      const conf = prefsPorRest[r.id] || {};
      const suporteAtivo = conf.suporteAtivo && conf.suporteAtivo > Date.now();
      return {
        ...r,
        usuarios: perfis.filter(p => p.restaurante_id === r.id),
        suporteAtivo,
        suporteAte: suporteAtivo ? conf.suporteAtivo : null,
        podeMexer: suporteAtivo && conf.suportePermissao === 'mexer',
      };
    }));
    // Notas internas: tabela admin_notas via RPC (migração 10) — o cliente não
    // tem mais como ler; fallback lê a coluna antiga em banco pré-m10.
    let notas = {};
    const { data: nTodas, error: eNotas } = await supabase.rpc('notas_admin_todas');
    if (!eNotas && nTodas) {
      notas = Object.fromEntries(nTodas.map(n => [n.restaurante_id, n.notas || '']));
    } else {
      const { data: antigas } = await supabase.from('restaurantes').select('id, notas_admin');
      (antigas || []).forEach(x => { notas[x.id] = x.notas_admin || ''; });
    }
    setNotasLocal(Object.fromEntries(rests.map(r => [r.id, notas[r.id] || ''])));
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!sessao?.eSuperAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount com flag de loading (padrão legítimo)
    carregar();
  }, [sessao, carregar]);

  // ── Ações comerciais ────────────────────────────────────────────
  const liberarDias = async (r, dias) => {
    const ok = await confirm({
      titulo: 'Liberar dias de acesso',
      mensagem: `Liberar ${dias} dia(s) para "${r.nome}"?\n\nA assinatura soma a partir do vencimento atual (renova sem perder dias).`,
      confirmar: `Liberar ${dias} dia(s)`,
    });
    if (!ok) return;
    const { data, error } = await supabase.rpc('ativar_assinatura', { p_restaurante: r.id, p_dias: dias });
    if (error) { toast('Erro ao liberar: ' + error.message, 'erro'); return; }
    // ativar_assinatura (migração 13) também limpa o aviso de pagamento
    setRestaurantes(prev => prev.map(x => x.id === r.id ? { ...x, assinatura_ate: data, aviso_pagamento_em: null, aviso_pagamento_plano: null } : x));
    toast(`✅ ${r.nome}: acesso liberado até ${dataBR(data)}.`, 'sucesso');
  };

  const dispensarAviso = async (r) => {
    const { error } = await supabase.rpc('limpar_aviso_pagamento', { p_restaurante: r.id });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setRestaurantes(prev => prev.map(x => x.id === r.id ? { ...x, aviso_pagamento_em: null, aviso_pagamento_plano: null } : x));
    toast('Aviso dispensado.', 'sucesso');
  };

  const mudarMax = async (r, novoMax) => {
    const { error } = await supabase.rpc('definir_max_usuarios', { p_restaurante: r.id, p_max: novoMax });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setRestaurantes(prev => prev.map(x => x.id === r.id ? { ...x, max_usuarios: novoMax } : x));
    toast(`Limite de usuários de "${r.nome}" agora é ${novoMax}.`, 'sucesso');
  };

  const alternarBloqueio = async (r) => {
    const bloquear = !r.bloqueado;
    const ok = await confirm({
      titulo: bloquear ? 'Suspender conta' : 'Reativar conta',
      mensagem: bloquear
        ? `Suspender o acesso de "${r.nome}"? Ninguém do restaurante consegue entrar até você reativar. Nenhum dado é apagado.`
        : `Reativar o acesso de "${r.nome}"?`,
      perigo: bloquear,
      confirmar: bloquear ? 'Suspender' : 'Reativar',
    });
    if (!ok) return;
    const { error } = await supabase.rpc('definir_bloqueio', { p_restaurante: r.id, p_bloqueado: bloquear });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setRestaurantes(prev => prev.map(x => x.id === r.id ? { ...x, bloqueado: bloquear } : x));
    toast(bloquear ? `🔒 "${r.nome}" suspenso.` : `✅ "${r.nome}" reativado.`, 'sucesso');
  };

  const salvarNotas = async (r) => {
    const { error } = await supabase.rpc('salvar_notas_admin', { p_restaurante: r.id, p_notas: notasLocal[r.id] || '' });
    if (error) { toast('Erro ao salvar notas: ' + error.message, 'erro'); return; }
    toast('Notas salvas (só você vê).', 'sucesso');
  };

  if (!sessao?.eSuperAdmin) {
    return (
      <Layout title="Admin">
        <div className="bg-white rounded-xl p-8 text-center">
          <p className="text-2xl mb-2">🚫</p>
          <p className="text-sm font-semibold text-gray-700">Acesso restrito</p>
          <p className="text-xs text-gray-400 mt-1">Esta página é exclusiva para administradores.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Admin — Visão geral">
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="bg-polo-navy rounded-xl p-4 text-polo-gold">
          <p className="font-bold text-sm">🔑 Painel super-admin</p>
          <p className="text-[11px] text-white/80 mt-0.5">Logado como {sessao.email}</p>
          <p className="text-[11px] text-polo-gold/90 mt-1.5">
            🔒 Conta crítica: ative a verificação em duas etapas (MFA) no Supabase Auth e use uma senha forte e exclusiva.
          </p>
        </div>

        {/* Erro de RLS */}
        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-red-700">Sem acesso aos dados ({erro})</p>
            <p className="text-xs text-red-600">
              Confira no README a ordem dos scripts SQL (migrations 1–11) e as policies do super-admin
              (e-mail {SUPER_ADMIN_EMAIL}) no Supabase.
            </p>
          </div>
        )}

        {carregando && (
          <div className="bg-white rounded-xl p-8 text-center">
            <p className="text-xs text-gray-400 animate-pulse">Carregando restaurantes…</p>
          </div>
        )}

        {!carregando && !erro && (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">
                Restaurantes ({restaurantes.length})
              </p>
              <span className="text-[10px] text-gray-400">
                {restaurantes.filter(r => r.suporteAtivo).length} com suporte ativo
              </span>
            </div>

            {restaurantes.length === 0 && (
              <div className="bg-white rounded-xl p-8 text-center">
                <p className="text-sm text-gray-400">Nenhum restaurante encontrado.</p>
              </div>
            )}

            {restaurantes.map(r => {
              // eslint-disable-next-line react-hooks/purity -- situação depende da hora atual; recalcular por render é o desejado
              const agora = Date.now();
              const st = statusRestaurante(r, agora);
              const fimTeste = r.created_at ? new Date(r.created_at).getTime() + TESTE_DIAS * 86400000 : null;
              const restanteH = r.suporteAte ? Math.ceil((r.suporteAte - agora) / 3600000) : 0;
              const maxU = r.max_usuarios || 3;
              return (
                <div key={r.id} className={`bg-white border rounded-xl overflow-hidden
                  ${r.bloqueado ? 'border-red-300' : r.suporteAtivo ? 'border-green-300' : 'border-gray-100'}`}>
                  {/* Header: nome + status comercial */}
                  <div className={`px-4 py-3 flex items-center justify-between gap-2
                    ${r.bloqueado ? 'bg-red-50' : r.suporteAtivo ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{r.nome}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Criado em {dataBR(r.created_at)}</p>
                    </div>
                    <BadgeStatus st={st} />
                  </div>

                  {/* Aviso de pagamento (o cliente tocou "Já paguei") */}
                  {r.aviso_pagamento_em && (
                    <div className="px-4 py-2 bg-polo-gold/15 border-b border-polo-gold/30 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-polo-navy font-semibold">
                        💰 Avisou pagamento — plano <strong>{r.aviso_pagamento_plano || 'mensal'}</strong> em {dataBR(r.aviso_pagamento_em)}
                      </p>
                      <button onClick={() => dispensarAviso(r)}
                        className="text-[10px] font-semibold text-gray-500 underline underline-offset-2 flex-shrink-0">dispensar</button>
                    </div>
                  )}

                  {/* Visão comercial */}
                  <div className="px-4 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-600 border-b border-gray-50">
                    <span>🧪 Teste até: <strong>{dataBR(fimTeste)}</strong></span>
                    <span>💳 Assinatura até: <strong>{dataBR(r.assinatura_ate)}</strong></span>
                    <span>👥 Usuários: <strong>{r.usuarios.length}/{maxU}</strong></span>
                    <span>🛠️ Suporte: <strong>{r.suporteAtivo ? `ativo ~${restanteH}h${r.podeMexer ? ' (editar)' : ' (ver)'}` : '—'}</strong></span>
                  </div>

                  {/* Usuários (com e-mail quando a migração 9 está no banco) */}
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    {r.usuarios.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Sem usuários</p>
                    ) : (
                      <div className="space-y-1">
                        {r.usuarios.map(u => (
                          <div key={u.id} className="flex items-center justify-between text-xs gap-2">
                            <span className="text-gray-700 truncate">{u.nome || '(sem nome)'}{u.email ? <span className="text-gray-400"> · {u.email}</span> : null}</span>
                            <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full flex-shrink-0">{u.cargo}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ativar plano pago (após confirmar o Pix) */}
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Ativar plano pago</p>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {PLANOS.map(p => (
                        <button key={p.id} onClick={() => liberarDias(r, p.dias)}
                          className="text-[11px] font-bold text-polo-gold bg-polo-navy rounded-lg px-2.5 py-1.5">
                          {p.label} (+{p.dias}d)
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Cortesia (dias avulsos)</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[7, 14, 30, 90].map(d => (
                        <button key={d} onClick={() => liberarDias(r, d)}
                          className="text-[11px] font-bold text-polo-navy border border-polo-navy rounded-lg px-2.5 py-1.5">
                          +{d}d
                        </button>
                      ))}
                      <input type="number" min="1" max="400" inputMode="numeric" placeholder="dias"
                        value={diasCustom[r.id] || ''}
                        onChange={e => setDiasCustom(p => ({ ...p, [r.id]: e.target.value }))}
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-[11px]" />
                      <button onClick={() => {
                          const d = parseInt(diasCustom[r.id]);
                          if (!d || d < 1 || d > 400) { toast('Digite entre 1 e 400 dias.', 'aviso'); return; }
                          liberarDias(r, d);
                        }}
                        className="text-[11px] font-bold bg-polo-navy text-polo-gold rounded-lg px-2.5 py-1.5">
                        Liberar
                      </button>
                    </div>
                  </div>

                  {/* VIP (limite de usuários) + bloqueio */}
                  <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between gap-2">
                    <label className="text-[11px] text-gray-600 flex items-center gap-1.5">
                      👥 Limite de usuários
                      <select value={maxU} onChange={e => mudarMax(r, parseInt(e.target.value))}
                        className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px] bg-white">
                        {[3, 4, 5].map(n => <option key={n} value={n}>{n}{n === 3 ? ' (padrão)' : ' (VIP)'}</option>)}
                      </select>
                    </label>
                    <button onClick={() => alternarBloqueio(r)}
                      className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 ${r.bloqueado ? 'bg-green-600 text-white' : 'bg-red-100 text-red-700'}`}>
                      {r.bloqueado ? '✅ Reativar conta' : '🔒 Suspender conta'}
                    </button>
                  </div>

                  {/* Notas internas (invisíveis ao cliente) */}
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Notas internas (só você vê)</p>
                    <div className="flex gap-1.5">
                      <input type="text" value={notasLocal[r.id] ?? ''} placeholder="Ex: VIP · WhatsApp (81) 9…"
                        onChange={e => setNotasLocal(p => ({ ...p, [r.id]: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-[11px]" />
                      <button onClick={() => salvarNotas(r)}
                        className="text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-lg px-2.5">Salvar</button>
                    </div>
                  </div>

                  {/* Acesso de suporte */}
                  <div className="px-4 py-3">
                    {r.suporteAtivo ? (
                      <button
                        onClick={() => { verComoRestaurante(r.id, r.nome, r.podeMexer); navigate('/'); }}
                        className={`w-full font-bold text-xs py-2.5 rounded-lg ${r.podeMexer ? 'bg-red-600 text-white' : 'bg-polo-navy text-polo-gold'}`}>
                        {r.podeMexer ? '✏️ Entrar como este restaurante (pode EDITAR)' : '👁️ Ver como este restaurante (somente leitura)'}
                      </button>
                    ) : (
                      <p className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        Para ver os dados deste restaurante, peça que ele autorize o suporte em Configurações → Sistema → Suporte remoto.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </Layout>
  );
}
