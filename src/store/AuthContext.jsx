import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

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
  const [recuperando, setRecuperando] = useState(false); // veio do link "esqueci a senha"
  // Modo suporte: super-admin vendo os dados de OUTRO restaurante
  const [impersonando, setImpersonando] = useState(null); // { restauranteId, restauranteNome, podeMexer } | null
  const [derrubado, setDerrubado] = useState(false); // a conta foi aberta em outro aparelho
  const tokenRef = useRef(null); // token desta sessão (sessão única por conta)

  // Registra esta sessão como a ativa (sessão única): grava um token novo em
  // `sessoes`. Outros aparelhos da mesma conta veem o token mudar (realtime) e
  // se deslogam. Falha em silêncio se a tabela ainda não existe no banco.
  const registrarSessaoAtiva = useCallback(async (userId) => {
    const token = (crypto?.randomUUID?.() || `t_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    tokenRef.current = token;
    try { await supabase.from('sessoes').upsert({ user_id: userId, token, updated_at: new Date().toISOString() }); }
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
      const { data: rest } = await supabase
        .from('restaurantes')
        .select('nome')
        .eq('id', perfil.restaurante_id)
        .maybeSingle();
      setSessao({
        usuarioId:        userId,
        email,
        nome:             perfil.nome,
        cargo:            perfil.cargo,
        restauranteId:    perfil.restaurante_id,
        restauranteNome:  rest?.nome || '',
        eSuperAdmin:      email === 'atiliopinpolho@gmail.com',
        ts:               Date.now(),
      });
      const { data: todos } = await supabase
        .from('perfis')
        .select('id, nome, cargo')
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
  // este aparelho cai e mostra a mensagem.
  useEffect(() => {
    const uid = sessao?.usuarioId;
    if (!uid) return;
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
  }, [sessao?.usuarioId]);

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

  // ── Logout ───────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSessao(null);
    setUsuarios([]);
    setImpersonando(null);
    setDerrubado(false);
  }, []);

  // ── Modo suporte (super-admin vê outro restaurante) ──
  // podeMexer reflete o que o CLIENTE autorizou ("ver" ou "mexer").
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

    // Geramos o id aqui para não depender de ler a linha de volta
    // (o RLS só libera a leitura depois que o perfil de vínculo existe).
    const restauranteId = (crypto?.randomUUID?.() || `r_${Date.now()}`);
    const { error: errR } = await supabase
      .from('restaurantes')
      .insert({ id: restauranteId, nome: nomeRestaurante || nome + ' — Restaurante' });
    if (errR) return errR.message;

    const { error: errP } = await supabase
      .from('perfis')
      .insert({ id: data.user.id, nome, cargo: 'diretoria', restaurante_id: restauranteId });
    if (errP) return errP.message;

    await carregarPerfil(data.user.id);
    return null;
  }, [carregarPerfil]);

  // ── Gera token de convite para novo funcionário ───────────────
  const criarConvite = useCallback(async (cargo) => {
    if (!sessao?.restauranteId) return null;
    // Limite de 3 contas por restaurante (a checagem definitiva é no banco —
    // RPC aceitar_convite — mas barramos cedo aqui para não gerar convite à toa).
    if (usuarios.length >= 3) return null;
    const { data, error } = await supabase
      .from('convites')
      .insert({ restaurante_id: sessao.restauranteId, cargo })
      .select()
      .single();
    return error ? null : data.token;
  }, [sessao, usuarios]);

  // ── Funcionário usa token de convite para se cadastrar ────────
  // A validação roda numa função segura no banco (aceitar_convite), que NÃO
  // expõe a tabela de convites — evita que alguém liste/adivinhe os códigos.
  const usarConvite = useCallback(async ({ token, nome, email, senha }) => {
    const { data, error } = await supabase.auth.signUp({ email, password: senha });
    if (error) return error.message;
    if (!data.user) return 'Erro ao criar conta.';

    const { data: aceito, error: errRpc } = await supabase.rpc('aceitar_convite', { p_token: token, p_nome: nome });
    if (errRpc) return errRpc.message;
    if (aceito === false) return 'Código de convite inválido ou expirado.';

    await carregarPerfil(data.user.id);
    return null;
  }, [carregarPerfil]);

  // ── Alterar cargo de um usuário do mesmo restaurante ─────────
  const alterarCargo = useCallback(async (usuarioId, novoCargo) => {
    if (!sessao?.restauranteId) return;
    // Usa a função segura no banco (valida quem chama e impede autopromoção).
    const { error } = await supabase.rpc('alterar_cargo', { p_usuario: usuarioId, p_cargo: novoCargo });
    if (error) return error.message;
    setUsuarios(prev => prev.map(u => u.id === usuarioId ? { ...u, cargo: novoCargo } : u));
    return null;
  }, [sessao]);

  // ── Definir/trocar a própria senha ───────────────────────────
  const atualizarSenha = useCallback(async (novaSenha) => {
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) return error.message;
    setRecuperando(false);
    return null;
  }, []);

  const temPermissao = useCallback((cargoMinimo) => {
    if (sessao?.eSuperAdmin) return true; // super-admin acessa tudo (inclusive em modo suporte)
    if (!sessao?.cargo) return false;
    return nivelDoCargo(sessao.cargo) >= nivelDoCargo(cargoMinimo);
  }, [sessao]);

  return (
    <AuthContext.Provider value={{
      sessao, carregando, usuarios, recuperando,
      login, logout, esqueceuSenha, atualizarSenha,
      criarPrimeiroAdmin, criarConvite, usarConvite, alterarCargo,
      temPermissao,
      impersonando, verComoRestaurante, sairImpersonacao,
      derrubado, limparDerrubado,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
