import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

  // Carrega o perfil do banco e monta a sessão
  const carregarPerfil = useCallback(async (userId) => {
    const { data: perfil } = await supabase
      .from('perfis')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (perfil) {
      setSessao({
        usuarioId:      userId,
        nome:           perfil.nome,
        cargo:          perfil.cargo,
        restauranteId:  perfil.restaurante_id,
        ts:             Date.now(),
      });
      const { data: todos } = await supabase
        .from('perfis')
        .select('id, nome, cargo')
        .eq('restaurante_id', perfil.restaurante_id);
      setUsuarios(todos || []);
    } else {
      // Auth criado mas perfil ainda não existe (setup incompleto)
      setSessao({ usuarioId: userId, nome: null, cargo: null, restauranteId: null, ts: Date.now() });
      setUsuarios([]);
    }
    setCarregando(false);
  }, []);

  // Escuta mudanças de sessão do Supabase Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) carregarPerfil(session.user.id);
      else setCarregando(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Usuário clicou no link de recuperação de senha → abre a tela de nova senha
      if (event === 'PASSWORD_RECOVERY') { setRecuperando(true); setCarregando(false); return; }
      if (session?.user) carregarPerfil(session.user.id);
      else { setSessao(null); setUsuarios([]); setCarregando(false); }
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
  }, []);

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
    const { data, error } = await supabase
      .from('convites')
      .insert({ restaurante_id: sessao.restauranteId, cargo })
      .select()
      .single();
    return error ? null : data.token;
  }, [sessao]);

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
    await supabase
      .from('perfis')
      .update({ cargo: novoCargo })
      .eq('id', usuarioId)
      .eq('restaurante_id', sessao.restauranteId);
    setUsuarios(prev => prev.map(u => u.id === usuarioId ? { ...u, cargo: novoCargo } : u));
  }, [sessao]);

  // ── Definir/trocar a própria senha ───────────────────────────
  const atualizarSenha = useCallback(async (novaSenha) => {
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) return error.message;
    setRecuperando(false);
    return null;
  }, []);

  const temPermissao = useCallback((cargoMinimo) => {
    if (!sessao?.cargo) return false;
    return nivelDoCargo(sessao.cargo) >= nivelDoCargo(cargoMinimo);
  }, [sessao]);

  return (
    <AuthContext.Provider value={{
      sessao, carregando, usuarios, recuperando,
      login, logout, esqueceuSenha, atualizarSenha,
      criarPrimeiroAdmin, criarConvite, usarConvite, alterarCargo,
      temPermissao,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
