import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { statusAssinatura } from '../utils/assinatura';

export const CARGOS = [
  { id: 'cozinha',  label: 'Cozinha',   nivel: 0 },
  { id: 'gerencia', label: 'Gerência',  nivel: 1 },
  { id: 'diretoria',label: 'Diretoria', nivel: 2 },
];

export const nivelDoCargo = (cargo) => CARGOS.find(c => c.id === cargo)?.nivel ?? 0;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sessao,     setSessao]     = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [usuarios,   setUsuarios]   = useState([]);
  const [convites,   setConvites]   = useState([]); // convites pendentes (não usados/não expirados)
  const [recuperando, setRecuperando] = useState(false); // veio do link "esqueci a senha"
  // Modo suporte: super-admin vendo os dados de OUTRO restaurante
  const [impersonando, setImpersonando] = useState(null); // { restauranteId, restauranteNome } | null (suporte = só leitura)
  const [derrubado, setDerrubado] = useState(false); // a conta foi aberta em outro aparelho
  const tokenRef = useRef(null); // token desta sessão (sessão única por conta)

  // Registra esta sessão como a ativa (sessão única): grava um token novo em
  // `sessoes`. Outros aparelhos da mesma conta veem o token mudar (realtime) e
  // se deslogam. Falha em silêncio se a tabela ainda não existe no banco.
  const registrarSessaoAtiva = useCallback(async (userId) => {
    const token = (crypto?.randomUUID?.() || `t_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    tokenRef.current = token;
    // O Supabase NÃO lança em erro PostgREST normal — retorna { error }. Por isso
    // checamos o retorno (o catch só pega falha de rede/exceção).
    try {
      const { error } = await supabase.from('sessoes').upsert({ user_id: userId, token, updated_at: new Date().toISOString() });
      if (error) console.warn('[sessão única] não foi possível registrar a sessão ativa:', error.message);
    }
    catch { /* tabela sessoes ainda não criada — recurso fica inerte */ }
  }, []);

  // Carrega o perfil do banco e monta a sessão
  const carregarPerfil = useCallback(async (userId) => {
    const { data: perfil } = await supabase
      .from('perfis')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const email = authUser?.email || '';

    if (perfil) {
      // select completo → fallback progressivo p/ bancos sem as colunas novas
      let { data: rest, error: errRest } = await supabase
        .from('restaurantes')
        .select('nome, created_at, assinatura_ate, max_usuarios, bloqueado')
        .eq('id', perfil.restaurante_id)
        .maybeSingle();
      if (errRest) {
        ({ data: rest, error: errRest } = await supabase
          .from('restaurantes')
          .select('nome, created_at, assinatura_ate')
          .eq('id', perfil.restaurante_id)
          .maybeSingle());
      }
      if (errRest) {
        ({ data: rest } = await supabase
          .from('restaurantes')
          .select('nome, created_at')
          .eq('id', perfil.restaurante_id)
          .maybeSingle());
      }
      setSessao({
        usuarioId:        userId,
        email,
        nome:             perfil.nome,
        cargo:            perfil.cargo,
        restauranteId:    perfil.restaurante_id,
        restauranteNome:  rest?.nome || '',
        // Assinatura/teste (migration7) + limite/bloqueio (migration9)
        restauranteCriadoEm: rest?.created_at || null,
        assinaturaAte:    rest?.assinatura_ate || null,
        maxUsuarios:      rest?.max_usuarios || 3,
        bloqueado:        !!rest?.bloqueado,
        eSuperAdmin:      email === 'atiliopinpolho@gmail.com',
        ts:               Date.now(),
      });
      const { data: todos } = await supabase
        .from('perfis')
        .select('id, nome, cargo, ativo')
        .eq('restaurante_id', perfil.restaurante_id);
      setUsuarios(todos || []);
    } else {
      // Auth criado mas perfil ainda não existe (setup incompleto)
      setSessao({ usuarioId: userId, email, nome: null, cargo: null, restauranteId: null, eSuperAdmin: email === 'atiliopinpolho@gmail.com', ts: Date.now() });
      setUsuarios([]);
    }
    registrarSessaoAtiva(userId); // marca este aparelho como o ativo
    setCarregando(false);
  }, [registrarSessaoAtiva]);

  // Sessão única: escuta o token desta conta. Se mudar (outro aparelho logou),
  // este aparelho cai e mostra a mensagem. (Demo não toca o Supabase.)
  useEffect(() => {
    const uid = sessao?.usuarioId;
    if (!uid || sessao?.demo) return;
    const canal = supabase.channel(`sessao-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessoes', filter: `user_id=eq.${uid}` },
        (p) => {
          const novoToken = p.new?.token;
          if (novoToken && tokenRef.current && novoToken !== tokenRef.current) {
            setDerrubado(true);
            supabase.auth.signOut();
          }
        })
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, [sessao?.usuarioId, sessao?.demo]);

  // Escuta mudanças de sessão do Supabase Auth.
  // IMPORTANTE: não chamar o banco DENTRO do callback do onAuthStateChange
  // (causa reentrância/loop no GoTrue). Adiamos com setTimeout(0) e evitamos
  // recarregar o mesmo usuário que já está logado.
  const carregadoRef = useRef(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { carregadoRef.current = session.user.id; carregarPerfil(session.user.id); }
      else setCarregando(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { setRecuperando(true); setCarregando(false); return; }
      const uid = session?.user?.id || null;
      setTimeout(() => {
        if (uid) {
          if (carregadoRef.current === uid) return; // já carregado — ignora eventos repetidos
          carregadoRef.current = uid;
          carregarPerfil(uid);
        } else {
          carregadoRef.current = null;
          setSessao(null); setUsuarios([]); setCarregando(false);
        }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [carregarPerfil]);

  // ── Login por email + senha ──────────────────────────────────
  const login = useCallback(async (email, senha) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return error?.message || null; // null = sucesso
  }, []);

  // ── Modo demonstração (100% local — nada toca o banco real) ──
  // Sessão fake com cargo diretoria para o visitante ver todas as telas;
  // o AppContext detecta rid==='demo' e nunca fala com o Supabase.
  const entrarDemo = useCallback(() => {
    setSessao({
      usuarioId: 'demo', email: '', nome: 'Visitante',
      cargo: 'diretoria', restauranteId: 'demo', restauranteNome: 'Restaurante Exemplo',
      demo: true, eSuperAdmin: false, ts: Date.now(),
    });
    setUsuarios([{ id: 'demo', nome: 'Visitante', cargo: 'diretoria' }]);
    setCarregando(false);
  }, []);

  // ── Logout ───────────────────────────────────────────────────
  const logout = useCallback(async () => {
    if (sessao?.demo) {
      // reset do demo: apaga o rascunho local para o próximo visitante começar limpo
      try {
        Object.keys(localStorage).filter(k => k.startsWith('pe::demo::')).forEach(k => localStorage.removeItem(k));
      } catch { /* storage indisponível — ignora */ }
    } else {
      await supabase.auth.signOut();
    }
    setSessao(null);
    setUsuarios([]);
    setImpersonando(null);
    setDerrubado(false);
  }, [sessao]);

  // ── Modo suporte (super-admin vê outro restaurante) ──
  // podeMexer=true só quando o CLIENTE autorizou "ver e editar" (24h) — a
  // escrita real depende das policies do migration7 (suporte_pode_editar).
  const verComoRestaurante = useCallback((restauranteId, restauranteNome, podeMexer = false) => {
    if (!sessao?.eSuperAdmin || !restauranteId) return;
    setImpersonando({ restauranteId, restauranteNome: restauranteNome || '', podeMexer: !!podeMexer });
  }, [sessao]);
  const sairImpersonacao = useCallback(() => setImpersonando(null), []);
  const limparDerrubado = useCallback(() => setDerrubado(false), []);

  // ── Esqueci minha senha (envia email de recuperação) ─────────
  const esqueceuSenha = useCallback(async (email) => {
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return error?.message || null;
  }, []);

  // ── Primeiro acesso: cria restaurante + conta diretoria ───────
  const criarPrimeiroAdmin = useCallback(async ({ nome, email, senha, nomeRestaurante }) => {
    const { data, error } = await supabase.auth.signUp({ email, password: senha });
    if (error) return error.message;
    if (!data.user) return 'Erro inesperado ao criar conta.';

    // Onboarding ATÔMICO no servidor (RPC SECURITY DEFINER): cria restaurante +
    // perfil diretoria de uma vez. Evita uma policy de INSERT aberta em
    // restaurantes (que deixaria qualquer um criar restaurantes à toa).
    const { error: errRpc } = await supabase.rpc('criar_restaurante', {
      p_nome_restaurante: nomeRestaurante || `${nome} — Restaurante`,
      p_nome_admin: nome,
    });
    if (errRpc) {
      // Sem fallback de insert direto: desde a migração 10 o RLS não aceita
      // INSERT em restaurantes/perfis pelo client — cadastro é SÓ pela RPC.
      if (/criar_restaurante|function|does not exist|schema cache|not find/i.test(errRpc.message || '')) {
        return 'Cadastro indisponível no momento (banco sem a migração 4). Fale com o suporte Aurum.';
      }
      return errRpc.message;
    }

    try { sessionStorage.setItem('aurum_boasvindas', 'novo'); } catch { /* storage indisponível */ }
    await carregarPerfil(data.user.id);
    return null;
  }, [carregarPerfil]);

  // ── Gera token de convite para novo funcionário ───────────────
  const criarConvite = useCallback(async (cargo) => {
    if (!sessao?.restauranteId || sessao?.demo) return null;
    // Conta suspensa ou plano vencido não gera convite (a migração 11 também
    // barra no banco; aqui é só para não oferecer o botão à toa).
    const plano = statusAssinatura(sessao);
    if (!plano.ok) return null;
    // Limite REAL do restaurante (3 padrão; VIP pode ter 4-5 — migração 9),
    // contando também convites pendentes: não gerar código sem vaga para ele.
    // A checagem definitiva continua no banco (RPC aceitar_convite).
    const max = sessao.maxUsuarios || 3;
    const ativos = usuarios.filter(u => u.ativo !== false).length;
    if (ativos + convites.length >= max) return null;
    const { data, error } = await supabase
      .from('convites')
      .insert({ restaurante_id: sessao.restauranteId, cargo })
      .select()
      .single();
    if (error) return null;
    setConvites(prev => [{ ...data }, ...prev]); // mostra na lista de pendentes
    return data.token;
  }, [sessao, usuarios, convites]);

  // ── Lista os convites pendentes (não usados e não expirados) ──
  const carregarConvites = useCallback(async () => {
    if (!sessao?.restauranteId || sessao?.demo) { setConvites([]); return; }
    const { data } = await supabase
      .from('convites')
      .select('token, cargo, expira_em, usado, created_at')
      .eq('restaurante_id', sessao.restauranteId)
      .eq('usado', false)
      .order('created_at', { ascending: false });
    const agora = Date.now();
    setConvites((data || []).filter(c => new Date(c.expira_em).getTime() > agora));
  }, [sessao]);

  // ── Revoga (apaga) um convite ainda não usado ──
  const revogarConvite = useCallback(async (token) => {
    const { error } = await supabase.from('convites').delete().eq('token', token);
    if (error) return error.message;
    setConvites(prev => prev.filter(c => c.token !== token));
    return null;
  }, []);

  // ── Funcionário usa token de convite para se cadastrar ────────
  // A validação roda numa função segura no banco (aceitar_convite), que NÃO
  // expõe a tabela de convites — evita que alguém liste/adivinhe os códigos.
  const usarConvite = useCallback(async ({ token, nome, email, senha }) => {
    // Valida o convite ANTES do signUp: sem isto, um token errado deixava uma
    // conta Auth órfã (e-mail "já registrado" preso em "Cadastro incompleto").
    // Se a RPC ainda não existe no banco (migração 5 não rodada), segue o fluxo
    // antigo — a validação definitiva continua sendo o aceitar_convite abaixo.
    const { data: valido, error: errVal } = await supabase.rpc('convite_valido', { p_token: token });
    if (!errVal && valido === false) return 'Código de convite inválido ou expirado.';

    const { data, error } = await supabase.auth.signUp({ email, password: senha });
    if (error) return error.message;
    if (!data.user) return 'Erro ao criar conta.';

    const { data: aceito, error: errRpc } = await supabase.rpc('aceitar_convite', { p_token: token, p_nome: nome });
    if (errRpc) return errRpc.message;
    if (aceito === false) return 'Código de convite inválido ou expirado.';

    try { sessionStorage.setItem('aurum_boasvindas', 'convite'); } catch { /* storage indisponível */ }
    await carregarPerfil(data.user.id);
    return null;
  }, [carregarPerfil]);

  // ── Alterar cargo de um usuário do mesmo restaurante ─────────
  const alterarCargo = useCallback(async (usuarioId, novoCargo) => {
    if (sessao?.demo) return 'Indisponível na demonstração.';
    if (!sessao?.restauranteId) return;
    // Usa a função segura no banco (valida quem chama e impede autopromoção).
    const { error } = await supabase.rpc('alterar_cargo', { p_usuario: usuarioId, p_cargo: novoCargo });
    if (error) return error.message;
    setUsuarios(prev => prev.map(u => u.id === usuarioId ? { ...u, cargo: novoCargo } : u));
    return null;
  }, [sessao]);

  // ── Desativar / reativar acesso (libera vaga sem apagar histórico) ──
  const desativarUsuario = useCallback(async (usuarioId) => {
    if (sessao?.demo) return 'Indisponível na demonstração.';
    if (!sessao?.restauranteId) return 'Sem restaurante.';
    const { error } = await supabase.rpc('desativar_usuario', { p_usuario: usuarioId });
    if (error) return error.message;
    setUsuarios(prev => prev.map(u => u.id === usuarioId ? { ...u, ativo: false } : u));
    return null;
  }, [sessao]);

  const reativarUsuario = useCallback(async (usuarioId) => {
    if (sessao?.demo) return 'Indisponível na demonstração.';
    if (!sessao?.restauranteId) return 'Sem restaurante.';
    const { error } = await supabase.rpc('reativar_usuario', { p_usuario: usuarioId });
    if (error) return error.message;
    setUsuarios(prev => prev.map(u => u.id === usuarioId ? { ...u, ativo: true } : u));
    return null;
  }, [sessao]);

  // ── Cliente avisa que pagou por Pix (super-admin ativa depois) ──
  // Funciona mesmo com a conta vencida/bloqueada (RPC SECURITY DEFINER).
  const avisarPagamento = useCallback(async (plano) => {
    if (sessao?.demo) return 'Indisponível na demonstração.';
    if (!sessao?.restauranteId) return 'Sem restaurante.';
    const { error } = await supabase.rpc('avisar_pagamento', { p_plano: plano || 'mensal' });
    return error ? error.message : null;
  }, [sessao]);

  // ── Definir/trocar a própria senha ───────────────────────────
  const atualizarSenha = useCallback(async (novaSenha) => {
    if (sessao?.demo) return 'Indisponível na demonstração.';
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) return error.message;
    setRecuperando(false);
    return null;
  }, [sessao?.demo]);

  const temPermissao = useCallback((cargoMinimo) => {
    if (sessao?.eSuperAdmin) return true; // super-admin acessa tudo (inclusive em modo suporte)
    if (!sessao?.cargo) return false;
    return nivelDoCargo(sessao.cargo) >= nivelDoCargo(cargoMinimo);
  }, [sessao]);

  return (
    <AuthContext.Provider value={{
      sessao, carregando, usuarios, recuperando,
      convites, carregarConvites, revogarConvite,
      login, logout, entrarDemo, esqueceuSenha, atualizarSenha,
      criarPrimeiroAdmin, criarConvite, usarConvite, alterarCargo,
      desativarUsuario, reativarUsuario, avisarPagamento,
      temPermissao,
      impersonando, verComoRestaurante, sairImpersonacao,
      derrubado, limparDerrubado,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
