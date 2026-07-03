import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../store/AuthContext';
import { supabase } from '../lib/supabase';

const SUPER_ADMIN_EMAIL = 'atiliopinpolho@gmail.com';

export default function Admin() {
  const { sessao, verComoRestaurante } = useAuth();
  const navigate = useNavigate();
  const [restaurantes, setRestaurantes] = useState([]);
  const [carregando,   setCarregando]   = useState(true);
  const [erro,         setErro]         = useState(null);

  useEffect(() => {
    if (!sessao?.eSuperAdmin) return;
    async function carregar() {
      setCarregando(true);
      const { data: rests, error: errR } = await supabase
        .from('restaurantes')
        .select('id, nome, created_at')
        .order('created_at', { ascending: false });

      if (errR || !rests) {
        setErro(errR?.message || 'Sem acesso');
        setCarregando(false);
        return;
      }

      const ids = rests.map(r => r.id);
      const { data: perfis } = ids.length
        ? await supabase.from('perfis').select('id, nome, cargo, restaurante_id').in('restaurante_id', ids)
        : { data: [] };

      // As prefs (incl. autorização de suporte) ficam em documentos.chave='prefs'
      const { data: docsPrefs } = ids.length
        ? await supabase
            .from('documentos')
            .select('restaurante_id, dados')
            .in('restaurante_id', ids)
            .eq('chave', 'prefs')
        : { data: [] };

      const prefsPorRest = {};
      (docsPrefs || []).forEach(d => { prefsPorRest[d.restaurante_id] = d.dados || {}; });

      setRestaurantes(rests.map(r => {
        const conf = prefsPorRest[r.id] || {};
        const suporteAtivo = conf.suporteAtivo && conf.suporteAtivo > Date.now();
        return {
          ...r,
          usuarios: (perfis || []).filter(p => p.restaurante_id === r.id),
          suporteAtivo,
          suporteAte: suporteAtivo ? conf.suporteAtivo : null,
        };
      }));
      setCarregando(false);
    }
    carregar();
  }, [sessao]);

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
        </div>

        {/* Erro de RLS */}
        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-red-700">Sem acesso aos dados ({erro})</p>
            <p className="text-xs text-red-600">
              Para ver todos os restaurantes, adicione estas policies no Supabase (SQL Editor):
            </p>
            <pre className="text-[10px] bg-red-100 rounded-lg p-3 overflow-x-auto text-red-800 whitespace-pre-wrap">{`-- Libera SELECT em restaurantes para o super-admin
CREATE POLICY "super_admin_restaurantes" ON restaurantes
  FOR SELECT USING (auth.jwt() ->> 'email' = '${SUPER_ADMIN_EMAIL}');

-- Libera SELECT em perfis para o super-admin
CREATE POLICY "super_admin_perfis" ON perfis
  FOR SELECT USING (auth.jwt() ->> 'email' = '${SUPER_ADMIN_EMAIL}');

-- Libera SELECT em registros para o super-admin
CREATE POLICY "super_admin_registros" ON registros
  FOR SELECT USING (auth.jwt() ->> 'email' = '${SUPER_ADMIN_EMAIL}');

-- Libera SELECT em documentos (catálogos) para o modo suporte
CREATE POLICY "super_admin_documentos" ON documentos
  FOR SELECT USING (auth.jwt() ->> 'email' = '${SUPER_ADMIN_EMAIL}');`}
            </pre>
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
              const restanteH = r.suporteAte
                // eslint-disable-next-line react-hooks/purity -- prazo restante do suporte: recalcular a cada render é o desejado
                ? Math.ceil((r.suporteAte - Date.now()) / 3600000)
                : 0;
              return (
                <div key={r.id} className={`bg-white border rounded-xl overflow-hidden
                  ${r.suporteAtivo ? 'border-green-300' : 'border-gray-100'}`}>
                  {/* Header */}
                  <div className={`px-4 py-3 flex items-center justify-between
                    ${r.suporteAtivo ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{r.nome}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Criado em {r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '—'}
                      </p>
                    </div>
                    {r.suporteAtivo ? (
                      <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full flex-shrink-0">
                        🛠️ Suporte ativo ~{restanteH}h
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">
                        sem suporte
                      </span>
                    )}
                  </div>

                  {/* Usuários */}
                  <div className="px-4 py-3">
                    {r.usuarios.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Sem usuários</p>
                    ) : (
                      <div className="space-y-1">
                        {r.usuarios.map(u => (
                          <div key={u.id} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700">{u.nome || '(sem nome)'}</span>
                            <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{u.cargo}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Acesso de suporte */}
                  <div className="px-4 pb-3">
                    {r.suporteAtivo ? (
                      <button
                        onClick={() => { verComoRestaurante(r.id, r.nome); navigate('/'); }}
                        className="w-full font-bold text-xs py-2.5 rounded-lg bg-polo-navy text-polo-gold">
                        👁️ Ver como este restaurante (somente leitura)
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
