// =====================================================================
//  contas — o dono cria e administra as contas da própria equipe
//
//  ⚠️ POR QUE ISTO EXISTE FORA DO APP. Criar a conta de outra pessoa, ou trocar
//  a senha dela, exige a chave de administrador do Supabase. Essa chave abre o
//  banco inteiro, sem RLS, para qualquer restaurante — se estivesse no app,
//  estaria no aparelho de todo cliente e bastaria abrir o navegador para ler.
//  Aqui ela vive nos segredos do projeto e nunca sai do servidor.
//
//  ⚠️ E POR QUE NÃO EM SQL. Dá para escrever a senha direto nas tabelas
//  internas de autenticação com pgcrypto. É mexer por dentro de um sistema que
//  não é nosso: quebra sem aviso quando o Supabase atualiza, e um detalhe
//  errado ali vira falha de autenticação silenciosa. A API oficial de
//  administração faz a mesma coisa com contrato estável.
//
//  O QUE ESTA FUNÇÃO ASSUME — e confere, uma por uma:
//    1. quem chama tem sessão válida        (senão qualquer um chamaria)
//    2. quem chama é diretoria ATIVA        (gerência não mexe em conta)
//    3. o alvo é do MESMO restaurante       (senão um dono mexeria no outro)
//    4. o alvo não é diretoria              (ninguém derruba o dono)
//  Nenhuma delas pode sair daqui: o app é só a tela, e tela não é trava.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// O app é servido de outro domínio (GitHub Pages), então o navegador manda um
// OPTIONS antes de cada chamada. Sem responder a ele, nada funciona.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// O endereço interno que o Supabase exige. A pessoa nunca vê isto: ela digita
// "maria.polobeer". O domínio é inventado de propósito — não existe caixa de
// entrada, e não deve existir: são contas de uso interno da casa.
const enderecoDe = (usuario: string, apelido: string) =>
  `${usuario}.${apelido}@contas.aurum.app`;

const limpo = (t: unknown) => String(t ?? '').trim();
const soLetras = (t: string) =>
  t.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não suportado.' }, 405);

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // ── 1. quem está chamando ────────────────────────────────────
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ erro: 'Sem sessão.' }, 401);
  const { data: quem, error: eAuth } = await admin.auth.getUser(jwt);
  if (eAuth || !quem?.user) return json({ erro: 'Sessão inválida.' }, 401);

  // ── 2. e ele manda nesta casa? ───────────────────────────────
  const { data: eu } = await admin
    .from('perfis').select('restaurante_id, cargo, ativo')
    .eq('id', quem.user.id).maybeSingle();
  if (!eu || eu.ativo === false || eu.cargo !== 'diretoria') {
    return json({ erro: 'Apenas a conta dona administra as contas da equipe.' }, 403);
  }
  const rid = eu.restaurante_id;

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* corpo vazio */ }
  const acao = limpo(corpo.acao);

  // ── 3. o alvo, quando a ação tem alvo ────────────────────────
  //    Sempre relido do banco: confiar no que o app mandou permitiria
  //    trocar a senha de qualquer pessoa mandando o id dela.
  async function alvoValido(id: string) {
    const { data: alvo } = await admin
      .from('perfis').select('id, restaurante_id, cargo, nome')
      .eq('id', id).maybeSingle();
    if (!alvo) return { erro: 'Conta não encontrada.' };
    if (alvo.restaurante_id !== rid) return { erro: 'Essa conta não é da sua casa.' };
    if (alvo.cargo === 'diretoria') return { erro: 'A conta dona não pode ser alterada por aqui.' };
    return { alvo };
  }

  try {
    if (acao === 'criar') {
      const nome = limpo(corpo.nome);
      const usuario = soLetras(limpo(corpo.usuario));
      const senha = String(corpo.senha ?? '');
      const cargo = limpo(corpo.cargo) || 'cozinha';
      const rotulo = limpo(corpo.cargoRotulo) || null;

      if (nome.length < 2) return json({ erro: 'Escreva o nome da pessoa.' }, 400);
      if (usuario.length < 3) return json({ erro: 'O usuário precisa de ao menos 3 letras.' }, 400);
      if (senha.length < 6) return json({ erro: 'A senha precisa de ao menos 6 caracteres.' }, 400);
      // ⚠️ 'diretoria' NÃO entra: a conta dona é uma só, e quem a cria é o
      // cadastro do restaurante. Duas donas na mesma casa é briga de controle.
      if (cargo !== 'cozinha' && cargo !== 'gerencia') {
        return json({ erro: 'Cargo inválido.' }, 400);
      }

      const { data: casa } = await admin
        .from('restaurantes').select('apelido, max_usuarios').eq('id', rid).maybeSingle();
      if (!casa?.apelido) {
        return json({ erro: 'Defina primeiro o apelido da casa — ele é a segunda metade do login.' }, 400);
      }

      // ⚠️ O LIMITE DE VAGAS É CONFERIDO AQUI, não só na tela. A tela some
      // quando as vagas acabam; a função é o que impede a chamada direta.
      const { count } = await admin
        .from('perfis').select('id', { count: 'exact', head: true })
        .eq('restaurante_id', rid).neq('ativo', false);
      if ((count ?? 0) >= (casa.max_usuarios ?? 3)) {
        return json({ erro: 'Sem vagas no plano. Desative alguém ou fale com a Aurum.' }, 400);
      }

      const email = enderecoDe(usuario, casa.apelido);
      const { data: novo, error: eCriar } = await admin.auth.admin.createUser({
        email,
        password: senha,
        // Já nasce válida: não há caixa de entrada para confirmar, e a conta é
        // criada por quem responde pela casa.
        email_confirm: true,
        user_metadata: { nome, restaurante_id: rid },
      });
      if (eCriar) {
        const dup = /already|exists|registered/i.test(eCriar.message);
        return json({ erro: dup ? 'Já existe alguém com esse usuário nesta casa.' : eCriar.message }, 400);
      }

      const { error: ePerfil } = await admin.from('perfis').insert({
        id: novo.user.id, restaurante_id: rid, nome, cargo, usuario, cargo_rotulo: rotulo, ativo: true,
      });
      if (ePerfil) {
        // ⚠️ DESFAZ o usuário se o perfil falhar. Sem isto sobraria uma conta
        // que consegue autenticar e não pertence a restaurante nenhum — entra
        // no app e vê uma tela vazia que ninguém sabe explicar.
        await admin.auth.admin.deleteUser(novo.user.id);
        return json({ erro: ePerfil.message }, 400);
      }
      return json({ ok: true, id: novo.user.id, login: `${usuario}.${casa.apelido}` });
    }

    if (acao === 'senha') {
      const id = limpo(corpo.id);
      const senha = String(corpo.senha ?? '');
      if (senha.length < 6) return json({ erro: 'A senha precisa de ao menos 6 caracteres.' }, 400);
      const v = await alvoValido(id);
      if (v.erro) return json({ erro: v.erro }, 403);
      const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    if (acao === 'remover') {
      const id = limpo(corpo.id);
      const v = await alvoValido(id);
      if (v.erro) return json({ erro: v.erro }, 403);
      // O perfil sai junto pela cascata de auth.users.
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    return json({ erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ erro: (e as Error)?.message || 'Falha inesperada.' }, 500);
  }
});
