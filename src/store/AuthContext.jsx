import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { limparCacheLocal } from '../lib/cache';
import { statusAssinatura } from '../utils/assinatura';

// ⚠️ ESTES TRÊS SÃO NÍVEIS DE SEGURANÇA, não rótulos. Estão numa trava da
// tabela `perfis` e em mais de cem verificações das regras de acesso do banco
// (quem convida, quem desativa, quem grava a matriz de permissões, quem vê o
// financeiro). Os cargos que o DONO inventa se apoiam num destes — o que vai na
// coluna `cargo` continua sendo o nível, e o nome dele é só rótulo.
// `nome` e `base` existem para o cargo padrão falar a mesma língua do
// personalizado, sem a tela precisar saber de qual dos dois veio.
export const CARGOS = [
  { id: 'cozinha',  label: 'Cozinha',   nome: 'Cozinha',   base: 'cozinha',   nivel: 0 },
  { id: 'gerencia', label: 'Gerência',  nome: 'Gerência',  base: 'gerencia',  nivel: 1 },
  { id: 'diretoria',label: 'Diretoria', nome: 'Diretoria', base: 'diretoria', nivel: 2 },
];

export const nivelDoCargo = (cargo) => CARGOS.find(c => c.id === cargo)?.nivel ?? 0;

const AuthContext = createContext(null);

/**
 * O endereço já traz a recuperação de senha?
 *
 * ⚠️ Lido ANTES do React montar qualquer coisa. O Supabase limpa o endereço
 * assim que troca o token por uma sessão, então quem ler tarde não acha mais
 * nada — e o `type=recovery` some junto.
 */
const recuperacaoNaURL = (() => {
  try {
    const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    return h.get('type') === 'recovery';
  } catch { return false; }
})();

/**
 * O link veio quebrado? (expirado, já usado, endereço não autorizado)
 *
 * ⚠️ Sem isto o app mostra a tela de login limpa, como se nada tivesse
 * acontecido — e a pessoa fica clicando no mesmo link velho do e-mail sem
 * entender por que "não faz nada".
 */
const erroNaURL = (() => {
  try {
    const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    if (!h.get('error')) return '';
    const codigo = h.get('error_code') || '';
    if (/expired/i.test(codigo)) return 'Este link expirou. Peça um novo em "Esqueci minha senha".';
    if (/used|already/i.test(codigo)) return 'Este link já foi usado. Peça um novo em "Esqueci minha senha".';
    return h.get('error_description')?.replace(/\+/g, ' ') || 'O link não funcionou. Peça um novo.';
  } catch { return ''; }
})();

export function AuthProvider({ children }) {
  const [sessao,     setSessao]     = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [usuarios,   setUsuarios]   = useState([]);
  const [convites,   setConvites]   = useState([]); // convites pendentes (não usados/não expirados)
  // ⚠️ LIDO DO ENDEREÇO, NÃO DO EVENTO — e isto conserta um defeito que só
  // aparecia no cliente. O link do e-mail chega como
  // `https://app.aurumcozinha.com.br/#type=recovery&access_token=...`, e o
  // Supabase avisa por um evento (`PASSWORD_RECOVERY`). Só que ele processa o
  // endereço quando o CLIENTE é criado, no carregamento do arquivo, e a gente
  // só se inscreve para ouvir depois — dentro de um efeito do React, que roda
  // após a primeira renderização. Quando o aviso chega cedo demais, ninguém
  // está escutando: a pessoa clicava no link do e-mail e caía na tela de
  // login, sem nunca ver onde digitar a senha nova.
  // Ler o endereço é síncrono e não depende de ordem nenhuma. O evento
  // continua ouvido logo abaixo, como segundo caminho.
  const [recuperando, setRecuperando] = useState(recuperacaoNaURL);
  // Modo suporte: super-admin vendo os dados de OUTRO restaurante
  const [impersonando, setImpersonando] = useState(null); // { restauranteId, restauranteNome } | null (suporte = só leitura)
  // Cadastro que confirmou o e-mail mas a criação do restaurante falhou
  // (ex.: o CNPJ foi tomado no intervalo). Guarda o motivo para a tela explicar.
  const [cadastroPendenteErro, setCadastroPendenteErro] = useState(null);
  const [derrubado, setDerrubado] = useState(false); // a conta foi aberta em outro aparelho
  const tokenRef = useRef(null); // token desta sessão (sessão única por conta)
  const registradoEmRef = useRef(null); // quando ESTA sessão se registrou

  // Registra esta sessão como a ativa (sessão única): grava um token novo em
  // `sessoes`. Outros aparelhos da mesma conta veem o token mudar (realtime) e
  // se deslogam. Falha em silêncio se a tabela ainda não existe no banco.
  const registrarSessaoAtiva = useCallback(async (userId) => {
    const token = (crypto?.randomUUID?.() || `t_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const agora = new Date().toISOString();
    tokenRef.current = token;
    registradoEmRef.current = agora;
    // O Supabase NÃO lança em erro PostgREST normal — retorna { error }. Por isso
    // checamos o retorno (o catch só pega falha de rede/exceção).
    try {
      const { error } = await supabase.from('sessoes').upsert({ user_id: userId, token, updated_at: agora });
      if (error) console.warn('[sessão única] não foi possível registrar a sessão ativa:', error.message);
    }
    catch { /* tabela sessoes ainda não criada — recurso fica inerte */ }
  }, []);

  // Carrega o perfil do banco e monta a sessão
  // Semeia prefs.estabelecimento com os dados do cadastro. Esses campos saem
  // no RODAPÉ DA ETIQUETA; sem isto o cliente digitaria o CNPJ duas vezes.
  // Nunca derruba o cadastro: entrar é mais importante que o rodapé.
  const semearEstabelecimento = useCallback(async (userId, c) => {
    try {
      const est = {};
      if (c.cnpj) est.cnpj = c.cnpj;
      if (c.cidade || c.uf) est.cidade = [c.cidade, c.uf].filter(Boolean).join(' - ');
      if (!Object.keys(est).length) return;
      const { data: perfilNovo } = await supabase
        .from('perfis').select('restaurante_id').eq('id', userId).maybeSingle();
      if (!perfilNovo?.restaurante_id) return;
      // ⚠️ p_restaurante é OBRIGATÓRIO — a assinatura é
      // salvar_documento(uuid,text,jsonb,integer). Sem ele a chamada falha
      // calada e o rodapé da etiqueta fica vazio.
      await supabase.rpc('salvar_documento', {
        p_restaurante: perfilNovo.restaurante_id,
        p_chave: 'prefs',
        p_dados: {
          estabelecimento: est,
          termosVersao: c.termosVersao || null,
          termosAceitosEm: new Date().toISOString(),
        },
        p_versao: 0,
      });
    } catch { /* etiqueta sai sem o rodapé; o cliente completa em Ajustes */ }
  }, []);

  const carregarPerfil = useCallback(async (userId) => {
    let { data: perfil } = await supabase
      .from('perfis')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const email = authUser?.email || '';

    // ⚠️ GANCHO DO CADASTRO PENDENTE.
    // Com a confirmação de e-mail LIGADA, o signUp não devolve sessão — não há
    // como criar o restaurante na hora, porque criar_restaurante depende de
    // auth.uid(). Os dados do formulário viajam no user_metadata do signUp e
    // são usados AQUI, no primeiro acesso autenticado (depois que a pessoa
    // clica no link do e-mail). Sem isto ela confirmaria o e-mail e cairia na
    // tela "Cadastro incompleto", com a conta morta.
    //
    // O metadata é escrito pelo cliente e NÃO é confiável — não tem problema:
    // ele só descreve o próprio restaurante da pessoa, e o que precisa ser
    // garantido (CNPJ válido e não repetido) é validado no servidor, dentro da
    // RPC. Nada aqui decide permissão.
    if (!perfil && authUser?.user_metadata?.aurum_cadastro) {
      const c = authUser.user_metadata.aurum_cadastro;
      const { error: errPend } = await supabase.rpc('criar_restaurante', {
        p_nome_restaurante: c.nomeRestaurante,
        p_nome_admin: c.nome,
        p_produto: c.produto || 'completo',
        p_cnpj: c.cnpj || null,
        p_whatsapp: c.whatsapp || null,
        p_cidade: c.cidade || null,
        p_uf: c.uf || null,
      });
      if (!errPend) {
        await semearEstabelecimento(userId, c);
        ({ data: perfil } = await supabase.from('perfis').select('*').eq('id', userId).maybeSingle());
      } else {
        // Falhou (ex.: CNPJ que outra conta pegou nesse intervalo). A pessoa
        // fica autenticada e SEM restaurante — a tela precisa dizer o que
        // houve, não mandar "fale com o suporte" e deixar a conta morta.
        setCadastroPendenteErro(errPend.message);
      }
    }

    if (perfil) {
      // select completo → fallback progressivo p/ bancos sem as colunas novas
      let { data: rest, error: errRest } = await supabase
        .from('restaurantes')
        .select('nome, created_at, assinatura_ate, max_usuarios, bloqueado, produto, apelido, cnpj')
        .eq('id', perfil.restaurante_id)
        .maybeSingle();
      if (errRest) {
        // ⚠️ Cair para cá significa banco SEM a migração 27, e aí toda conta
        // vira 'completo' — que é o fallback seguro (ninguém perde tela por
        // acidente). Mas se a queda for por outro motivo, um cliente do plano
        // Etiquetas ganha o app inteiro EM SILÊNCIO. O aviso existe para esse
        // defeito não ser invisível no console de quem for investigar.
        console.warn('[sessão] fallback do select de restaurantes — banco sem a coluna `produto` (migração 27)?', errRest?.message);
        ({ data: rest, error: errRest } = await supabase
          .from('restaurantes')
          .select('nome, created_at, assinatura_ate, max_usuarios, bloqueado')
          .eq('id', perfil.restaurante_id)
          .maybeSingle());
      }
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
        // Acesso revogado pela gerência. O banco também barra (migração 18
        // fez meu_restaurante_id() ignorar quem está inativo), mas sem isto
        // a pessoa entrava numa tela vazia sem entender o porquê.
        desativado:       perfil.ativo === false,
        nome:             perfil.nome,
        cargo:            perfil.cargo,
        // Cargo que o DONO inventou ("Confeiteiro"). O `cargo` acima continua
        // sendo o nível de segurança que o banco reconhece.
        cargoRotulo:      perfil.cargo_rotulo || null,
        restauranteId:    perfil.restaurante_id,
        restauranteNome:  rest?.nome || '',
        // Segunda metade do login da equipe. Sem isto a tela de contas não
        // consegue mostrar "o login da Maria é maria.polobeer".
        apelido:          rest?.apelido || '',
        // ⚠️ FONTE DA VERDADE DO CNPJ. Ele é o do CADASTRO, e é o que sai
        // impresso no rodapé da etiqueta. Antes vivia numa preferência que o
        // próprio restaurante editava — e CNPJ digitado errado numa etiqueta
        // que viaja com o alimento é problema de fiscalização, não de tela.
        cnpj:             rest?.cnpj || '',
        // Assinatura/teste (migration7) + limite/bloqueio (migration9)
        restauranteCriadoEm: rest?.created_at || null,
        assinaturaAte:    rest?.assinatura_ate || null,
        maxUsuarios:      rest?.max_usuarios || 3,
        bloqueado:        !!rest?.bloqueado,
        // Produto contratado (migração 27) — 'etiquetas' | 'completo'.
        // O `|| 'completo'` cobre banco sem a coluna E linha antiga sem valor:
        // na dúvida, o cliente vê o app inteiro. O contrário esconderia telas
        // de quem paga por elas, que é o erro caro deste par.
        produto:          rest?.produto || 'completo',
        eSuperAdmin:      email === 'atiliopinpolho@gmail.com',
        ts:               Date.now(),
      });
      const { data: todos } = await supabase
        .from('perfis')
        .select('id, nome, cargo, ativo, usuario, cargo_rotulo')
        .eq('restaurante_id', perfil.restaurante_id);
      setUsuarios(todos || []);
    } else {
      // Auth criado mas perfil ainda não existe (setup incompleto)
      setSessao({ usuarioId: userId, email, nome: null, cargo: null, restauranteId: null, eSuperAdmin: email === 'atiliopinpolho@gmail.com', ts: Date.now() });
      setUsuarios([]);
    }
    registrarSessaoAtiva(userId); // marca este aparelho como o ativo
    setCarregando(false);
  }, [registrarSessaoAtiva, semearEstabelecimento]);

  // Sessão única: escuta o token desta conta. Se mudar (outro aparelho logou),
  // este aparelho cai e mostra a mensagem. (Demo não toca o Supabase.)
  useEffect(() => {
    const uid = sessao?.usuarioId;
    if (!uid || sessao?.demo) return;
    const canal = supabase.channel(`sessao-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessoes', filter: `user_id=eq.${uid}` },
        (p) => {
          const novoToken = p.new?.token;
          if (!novoToken || !tokenRef.current || novoToken === tokenRef.current) return;
          // Só cai se o outro registro for MAIS NOVO que o nosso. Sem esta
          // comparação, recarregar a página logo depois de entrar derrubava o
          // usuário: a aba antiga ainda estava gravando o token dela e a nova,
          // já assinada no realtime, lia aquilo como "abriram em outro
          // aparelho". Aparecia um aviso de segurança assustador num reload.
          const quando = p.new?.updated_at;
          if (quando && registradoEmRef.current && quando <= registradoEmRef.current) return;
          setDerrubado(true);
          // ⚠️ O cache local precisa morrer aqui também. limparCacheLocal() só
          // era chamado no botão Sair; numa queda por sessão única — que é
          // JUSTAMENTE o caso de "abriram minha conta em outro aparelho" — os
          // dados do restaurante ficavam no tablet, lisíveis pelo DevTools sem
          // senha nenhuma.
          limparCacheLocal();
          supabase.auth.signOut();
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
          // Sessão encerrada por QUALQUER caminho — token expirado, signOut de
          // outra aba, revogação no servidor. Todos passavam longe da limpeza.
          carregadoRef.current = null;
          limparCacheLocal();
          setSessao(null); setUsuarios([]); setCarregando(false);
        }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [carregarPerfil]);

  // ── Login: e-mail OU usuário da casa ─────────────────────────
  //
  // ⚠️ DUAS FORMAS DE ENTRAR, um campo só. O dono do restaurante entra com o
  // e-mail dele, que é como a conta nasceu no cadastro. O colaborador entra com
  // `maria.polobeer` — porque cozinheiro não tem, ou não lembra, um e-mail, e
  // exigir um era barrar metade da equipe na porta.
  //
  // ⚠️ O ENDEREÇO INTERNO NÃO É SEGREDO NEM ENFEITE: o Supabase exige e-mail
  // para autenticar, ponto. Então `maria.polobeer` vira
  // `maria.polobeer@contas.aurum.app` aqui, e some. A pessoa nunca vê, nunca
  // digita e nunca recebe nada nesse endereço — o domínio é inventado de
  // propósito, justamente para não haver caixa de entrada.
  const login = useCallback(async (identificacao, senha) => {
    const bruto = String(identificacao || '').trim();
    // A presença do @ é o que separa os dois mundos. Um usuário nunca tem @
    // (a criação da conta remove tudo que não é letra ou número).
    const email = bruto.includes('@') ? bruto : `${bruto.toLowerCase()}@contas.aurum.app`;
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (!error) return null;
    // ⚠️ A mensagem crua do Supabase é "Invalid login credentials". Para quem
    // digitou um usuário, ela não diz nada — e o erro mais provável é ter
    // esquecido a segunda metade ("maria" em vez de "maria.polobeer").
    if (!bruto.includes('@') && /invalid login/i.test(error.message)) {
      return bruto.includes('.')
        ? 'Usuário ou senha não conferem.'
        : 'Falta o nome da casa no usuário — algo como "maria.polobeer".';
    }
    return error.message;
  }, []);

  // ── Modo demonstração (100% local — nada toca o banco real) ──
  // Sessão fake com cargo diretoria para o visitante ver todas as telas;
  // o AppContext detecta rid==='demo' e nunca fala com o Supabase.
  // `produto` deixa demonstrar o Aurum Etiquetas separado do completo — é o
  // que o dono abre numa visita comercial, e é também como o plano menor fica
  // testável sem criar conta no banco.
  const entrarDemo = useCallback((produto = 'completo') => {
    setSessao({
      usuarioId: 'demo', email: '', nome: 'Visitante',
      cargo: 'diretoria', restauranteId: 'demo', restauranteNome: 'Restaurante Exemplo',
      produto: produto === 'etiquetas' ? 'etiquetas' : 'completo',
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
    // ⚠️ SEGURANÇA: antes daqui o logout de uma conta REAL não apagava nada —
    // produtos, entradas, saídas, histórico e auditoria continuavam no
    // aparelho. Num tablet de cozinha, que é compartilhado por definição, o
    // próximo usuário lia tudo pelo DevTools sem senha nenhuma. Pior no modo
    // suporte: dados do CLIENTE ficavam no aparelho do super-admin.
    //
    // A fila do outbox com item vivo é preservada de propósito: é trabalho que
    // o servidor ainda não recebeu. Quem chama avisa antes (ver Layout.sair).
    limparCacheLocal();
    setSessao(null);
    setUsuarios([]);
    setImpersonando(null);
    setDerrubado(false);
  }, [sessao]);

  // ── Contas da equipe: criar, trocar senha, remover ───────────
  //
  // ⚠️ ISTO NÃO ACONTECE AQUI. Criar a conta de outra pessoa e trocar a senha
  // dela exigem a chave de administrador do Supabase, que abre o banco inteiro
  // de TODOS os restaurantes, sem RLS. No app ela estaria no aparelho de cada
  // cliente, legível pelo navegador. Quem faz é a função `contas`, hospedada
  // no próprio Supabase, com a chave nos segredos do projeto.
  //
  // ⚠️ E a função NÃO confia no que mandamos daqui: ela relê no banco quem
  // está chamando e de quem é a conta alvo. Tela não é trava.
  const chamarContas = useCallback(async (corpo) => {
    const { data: s } = await supabase.auth.getSession();
    const jwt = s?.session?.access_token;
    if (!jwt) return { erro: 'Sua sessão expirou. Entre de novo.' };
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) return { erro: dados?.erro || 'Não consegui falar com o servidor.' };
      return dados;
    } catch {
      // ⚠️ Sem internet a mensagem tem que dizer isso. "Falha ao criar conta"
      // manda o dono procurar erro no nome, na senha, no cargo — e o problema
      // era o wi-fi da cozinha.
      return { erro: 'Sem conexão. Tente de novo quando a internet voltar.' };
    }
  }, []);

  const criarConta = useCallback(async ({ nome, usuario, senha, cargo, cargoRotulo }) => {
    const r = await chamarContas({ acao: 'criar', nome, usuario, senha, cargo, cargoRotulo });
    if (r.erro) return r;
    // Entra na lista sem esperar recarregar do servidor: o dono acabou de
    // criar e precisa ver a conta ali para anotar o login.
    setUsuarios(prev => [...prev, { id: r.id, nome, cargo, usuario, cargo_rotulo: cargoRotulo, ativo: true }]);
    return r;
  }, [chamarContas]);

  const trocarSenhaDe = useCallback(
    (id, senha) => chamarContas({ acao: 'senha', id, senha }), [chamarContas]);

  const removerConta = useCallback(async (id) => {
    const r = await chamarContas({ acao: 'remover', id });
    if (!r.erro) setUsuarios(prev => prev.filter(u => u.id !== id));
    return r;
  }, [chamarContas]);

  // Apelido da casa — a segunda metade do login de todo mundo.
  const definirApelido = useCallback(async (apelido) => {
    const { data, error } = await supabase.rpc('definir_apelido', { p_apelido: apelido });
    if (error) return { erro: error.message };
    setSessao(prev => (prev ? { ...prev, apelido: data } : prev));
    return { ok: true, apelido: data };
  }, []);

  // ── Modo suporte (super-admin vê outro restaurante) ──
  // podeMexer=true só quando o CLIENTE autorizou "ver e editar" (24h) — a
  // escrita real depende das policies do migration7 (suporte_pode_editar).
  // ⚠️ `produto` entra aqui porque a sessão do suporte continua sendo a do
  // super-admin, que não tem restauranteId nem produto — sem isto o produto
  // efetivo cairia em 'completo' e o suporte abriria estoque, compras e
  // relatórios DENTRO de uma conta que só comprou etiquetas. Como aquele
  // cliente nunca lançou nada, tudo apareceria zerado e o suporte sairia
  // investigando um problema que não existe. Ver produtoAtivo() em utils/produto.js.
  const verComoRestaurante = useCallback((restauranteId, restauranteNome, podeMexer = false, produto = null) => {
    if (!sessao?.eSuperAdmin || !restauranteId) return;
    // ⚠️ O acesso do suporte DEIXA RASTRO na trilha do cliente (migração 25).
    // Antes, o super-admin lia os dados de qualquer restaurante sem o cliente
    // autorizar e sem registrar nada — e o app mostra a ele um texto de
    // privacidade que, por isso, não era verdade. `registrar_auditoria` não
    // servia aqui: ela exige perfil ativo, e o super-admin não tem perfil.
    //
    // Não bloqueia a entrada se a gravação falhar: ficar sem suporte por causa
    // de uma falha de rede seria pior que o registro atrasado. Mas o erro vai
    // para o console em vez de sumir.
    supabase.rpc('registrar_acesso_suporte', {
      p_restaurante: restauranteId,
      p_motivo: podeMexer ? 'Acesso com edição autorizada pelo cliente.' : 'Acesso somente leitura.',
    }).then(({ error }) => {
      if (error) console.error('Falha ao registrar o acesso de suporte:', error.message);
    });
    setImpersonando({
      restauranteId, restauranteNome: restauranteNome || '', podeMexer: !!podeMexer,
      produto: produto || 'completo',
    });
  }, [sessao]);
  const sairImpersonacao = useCallback(() => setImpersonando(null), []);
  const limparDerrubado = useCallback(() => setDerrubado(false), []);

  // ── Esqueci minha senha (envia email de recuperação) ─────────
  /**
   * ⚠️ CONFERE E-MAIL + CNPJ ANTES DE MANDAR QUALQUER COISA.
   *
   * Antes bastava saber o e-mail de alguém para disparar um link de nova senha
   * na caixa daquela pessoa. O link ia para o e-mail dela, então não era falha
   * grave — era ruído que dá para eliminar. Com o CNPJ junto, quem não é da
   * casa não consegue nem incomodar.
   *
   * ⚠️ A CONFERÊNCIA É NO BANCO, não aqui. Fazer no app seria trava de tela:
   * bastaria chamar o Supabase direto. A função `recuperacao_permitida`
   * devolve só true/false, nunca o nome do restaurante nem se o e-mail existe,
   * e tem trava de tentativas — CNPJ é público, e sem ela exigir CNPJ viraria
   * convite para varredura.
   *
   * ⚠️ SÓ A CONTA DONA. As contas de equipe entram com `maria.polobeer` e um
   * endereço interno SEM CAIXA DE ENTRADA: link de recuperação para elas nunca
   * chegaria. Quem troca a senha delas é o dono, em Administração → Contas da
   * equipe. O banco devolve false para elas e a tela explica o caminho, em vez
   * de mandar a pessoa esperar um e-mail que não vem.
   */
  const esqueceuSenha = useCallback(async (email, cnpj) => {
    const { data: pode, error: eChecar } = await supabase
      .rpc('recuperacao_permitida', { p_email: email, p_cnpj: cnpj });
    if (eChecar) return eChecar.message;
    if (!pode) {
      return 'E-mail e CNPJ não conferem, ou esta conta não é a do responsável pelo restaurante. '
        + 'Contas de equipe não recuperam senha por e-mail — quem troca é o dono, em Administração.';
    }
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return error?.message || null;
  }, []);

  // ── Primeiro acesso: cria restaurante + conta diretoria ───────
  const criarPrimeiroAdmin = useCallback(async ({ nome, email, senha, nomeRestaurante, produto,
    cnpj, whatsapp, cidade, uf, termosVersao }) => {
    const cadastro = { nome, nomeRestaurante, produto, cnpj, whatsapp, cidade, uf, termosVersao };

    // ⚠️ Os dados do cadastro viajam no user_metadata. Com a confirmação de
    // e-mail LIGADA o signUp não devolve sessão, e criar_restaurante depende de
    // auth.uid() — não há como criar o restaurante agora. Eles são usados no
    // primeiro acesso autenticado (ver o gancho em carregarPerfil).
    //
    // `emailRedirectTo` é obrigatório: sem ele o link do e-mail volta para a
    // raiz do domínio, e o app vive em /aurum-cozinha-pro/ no GitHub Pages.
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
        data: { aurum_cadastro: cadastro },
      },
    });
    if (error) return error.message;
    if (!data.user) return 'Erro inesperado ao criar conta.';

    // ⚠️ SEM SESSÃO = confirmação de e-mail ligada. Não é erro: é o fluxo
    // normal. Devolve um marcador para a tela mostrar "confirme seu e-mail" em
    // vez de uma mensagem de falha. O restaurante nasce quando a pessoa voltar.
    if (!data.session) return { confirmarEmail: true };

    // Confirmação DESLIGADA: sessão veio na hora, cria o restaurante já.
    const args = {
      p_nome_restaurante: nomeRestaurante || `${nome} — Restaurante`,
      p_nome_admin: nome,
    };
    const argsCompletos = {
      ...args,
      p_produto: produto || 'completo',
      p_cnpj: cnpj || null,
      p_whatsapp: whatsapp || null,
      p_cidade: cidade || null,
      p_uf: uf || null,
    };
    let { error: errRpc } = await supabase.rpc('criar_restaurante', argsCompletos);
    // Banco sem a migração 28 não conhece os parâmetros novos e recusa a
    // chamada inteira. Degrada em DOIS passos para o cadastro nunca falhar por
    // migração não rodada — o super-admin ajusta os dados depois no painel.
    if (errRpc && /p_cnpj|p_whatsapp|p_cidade|p_uf|does not exist|schema cache|not find|function/i.test(errRpc.message || '')) {
      ({ error: errRpc } = await supabase.rpc('criar_restaurante', { ...args, p_produto: produto || 'completo' }));
    }
    if (errRpc && /p_produto|does not exist|schema cache|not find|function/i.test(errRpc.message || '')) {
      ({ error: errRpc } = await supabase.rpc('criar_restaurante', args));
    }
    if (errRpc) {
      // A conta Auth já foi criada acima. Se a RPC falha, ela fica ÓRFÃ (sem
      // restaurante/perfil) e o e-mail passa a dar "já registrado" — a pessoa
      // não consegue nem entrar nem recadastrar. Desloga para o e-mail poder
      // ser reaproveitado numa nova tentativa.
      try { await supabase.auth.signOut(); } catch { /* já sem sessão */ }
      if (/criar_restaurante|function|does not exist|schema cache|not find/i.test(errRpc.message || '')) {
        return 'Cadastro indisponível no momento. Fale com o suporte Aurum.';
      }
      return errRpc.message;
    }

    await semearEstabelecimento(data.user.id, cadastro);
    try { sessionStorage.setItem('aurum_boasvindas', 'novo'); } catch { /* storage indisponível */ }
    await carregarPerfil(data.user.id);
    return null;
  }, [carregarPerfil, semearEstabelecimento]);

  // Reenvia o e-mail de confirmação. A trava de tempo é do lado do Supabase,
  // então aqui só traduzimos o erro para algo legível.
  const reenviarConfirmacao = useCallback(async (email) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
    return error?.message || null;
  }, []);

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
  const avisarPagamento = useCallback(async (plano, nomePagador) => {
    if (sessao?.demo) return 'Indisponível na demonstração.';
    if (!sessao?.restauranteId) return 'Sem restaurante.';
    // p_nome: fallback silencioso se o banco ainda não tem a migração 14
    let { error } = await supabase.rpc('avisar_pagamento', { p_plano: plano || 'mensal', p_nome: nomePagador || null });
    if (error && /p_nome|function|does not exist|schema cache|not find/i.test(error.message || '')) {
      ({ error } = await supabase.rpc('avisar_pagamento', { p_plano: plano || 'mensal' }));
    }
    return error ? error.message : null;
  }, [sessao]);

  // ── Definir/trocar a própria senha ───────────────────────────
  const atualizarSenha = useCallback(async (novaSenha) => {
    if (sessao?.demo) return 'Indisponível na demonstração.';
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) return error.message;
    setRecuperando(false);
    // ⚠️ ENTRA NO APP, não só sai da tela. Quem chegou pelo link do e-mail já
    // tem sessão válida, mas o perfil nunca foi carregado — o caminho da
    // recuperação sai cedo justamente para mostrar a tela de senha. Sem esta
    // parte, trocar a senha deixava a pessoa parada numa tela que não é mais
    // nada: nem senha, nem app.
    if (!sessao) {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id;
      if (uid) { carregadoRef.current = uid; carregarPerfil(uid); }
    }
    return null;
  }, [sessao, carregarPerfil]);

  const temPermissao = useCallback((cargoMinimo) => {
    if (sessao?.eSuperAdmin) return true; // super-admin acessa tudo (inclusive em modo suporte)
    if (!sessao?.cargo) return false;
    return nivelDoCargo(sessao.cargo) >= nivelDoCargo(cargoMinimo);
  }, [sessao]);

  return (
    <AuthContext.Provider value={{
      sessao, carregando, usuarios, recuperando, erroDoLink: erroNaURL,
      convites, carregarConvites, revogarConvite,
      login, logout, entrarDemo, esqueceuSenha, atualizarSenha,
      criarPrimeiroAdmin, reenviarConfirmacao, cadastroPendenteErro,
      criarConvite, usarConvite, alterarCargo,
      desativarUsuario, reativarUsuario, avisarPagamento,
      criarConta, trocarSenhaDe, removerConta, definirApelido,
      temPermissao,
      impersonando, verComoRestaurante, sairImpersonacao,
      derrubado, limparDerrubado,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
