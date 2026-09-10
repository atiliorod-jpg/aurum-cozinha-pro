// =====================================================================
//  restaurante — a Aurum abre a conta do cliente pelo painel
//
//  ⚠️ POR QUE ISTO EXISTE. O cadastro normal é o cliente quem faz, na tela de
//  entrada: ele cria a própria conta e o restaurante nasce junto, amarrado ao
//  `auth.uid()` dele. Só que a venda real acontece no WhatsApp — o dono fecha
//  com o restaurante e quer entregar a conta pronta, sem mandar ninguém
//  "preencher um cadastro". Fazer isso pelo cliente exige criar conta de
//  OUTRA pessoa, e isso exige a chave de administrador do Supabase, que abre
//  o banco inteiro. Ela vive nos segredos do projeto e nunca sai do servidor.
//
//  ⚠️ POR QUE NÃO REUSA `criar_restaurante` (M28). Aquela função é escrita em
//  cima de `auth.uid()`: ela cria o restaurante de QUEM ESTÁ CHAMANDO. Aqui
//  quem chama é o super-admin e o dono é outra pessoa — chamar de lá criaria
//  um restaurante para a conta da Aurum. As duas regras que importam daquela
//  função (CNPJ válido, CNPJ único com mensagem em português) estão repetidas
//  abaixo de propósito, com o comentário dizendo de onde vieram.
//
//  ⚠️ SENHA: NASCE SORTEADA E VOLTA PARA O PAINEL (decisão do dono, 10/09/2026).
//  Até aqui ela nascia aleatória e NINGUÉM a via — o painel mandava um link de
//  "escolher senha" para o e-mail do cliente. O dono pediu o contrário: ele
//  monta a conta, entra nela, deixa pronta e só então entrega; o cliente troca
//  a senha quando quiser (Administração → Trocar minha senha). Sem e-mail.
//
//  O que continua valendo da regra antiga:
//    • nunca uma "senha padrão" — cada conta nasce com a sua, sorteada aqui;
//    • ela volta SÓ para quem passou pela trava do super-admin (item 2 abaixo)
//      e aparece UMA vez na tela; o texto não é guardado em lugar nenhum.
//  O que se perdeu, e ficou aceito: o link provava que o e-mail existia. Agora
//  um e-mail digitado errado só aparece no dia em que o dono precisar recuperar
//  a senha — vale conferir o e-mail com o cliente na entrega.
//
//  O QUE ESTA FUNÇÃO CONFERE, uma por uma:
//    1. quem chama tem sessão válida
//    2. quem chama é O SUPER-ADMIN (mesma régua de sou_super_admin() no banco)
//    3. os dados batem (nome, e-mail, CNPJ quando vier)
//  Nenhuma pode sair daqui: o painel é só a tela, e tela não é trava.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

// ⚠️ ATENÇÃO — ESTA TRAVA E A DO BANCO NÃO SÃO A MESMA REGRA, e eu já
// documentei errado aqui uma vez. Conferido no banco em 02/09/2026:
//
//    aqui                → compara o E-MAIL do JWT
//    sou_super_admin()   → compara auth.uid() com um UUID cravado
//
// As duas apontam para a mesma pessoa hoje, e ter duas travas diferentes é
// até bom (uma não cai junto com a outra). O perigo é acreditar que mexer numa
// mexe na outra: trocar o e-mail da conta derruba ESTA e deixa a do banco de
// pé; recriar a conta muda o uid e derruba a de LÁ, deixando esta passando.
// Se um dia mudar, confira as duas — e o teste é abrir o painel, que usa ambas.
const SUPER_ADMIN = 'atiliopinpolho@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const limpo = (t: unknown) => String(t ?? '').trim();
const soNumeros = (t: unknown) => String(t ?? '').replace(/\D/g, '');

// ⚠️ MESMO cálculo do `cnpj_valido` do banco (M28). Repetido aqui para a
// mensagem sair em português antes de criar coisa nenhuma — o banco continua
// sendo a trava, este é o aviso.
function cnpjValido(c: string) {
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const digito = (base: string) => {
    let soma = 0;
    let peso = base.length - 7;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return String(r < 2 ? 0 : 11 - r);
  };
  const d1 = digito(c.slice(0, 12));
  const d2 = digito(c.slice(0, 12) + d1);
  return c.slice(12) === d1 + d2;
}

// ⚠️ SEM 0/O E SEM 1/l/I: esta senha é LIDA na tela e DIGITADA à mão no
// aparelho do cliente. Letra ambígua vira "senha errada" na frente dele, na
// hora da entrega. 31 símbolos × 12 posições ≈ 59 bits — sorteio de verdade
// (crypto), não Math.random.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
const senhaInicial = () => {
  const s: string[] = [];
  while (s.length < 12) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      // 248 = 31 × 8: descartar o resto evita que as primeiras letras saiam
      // mais do que as outras
      if (b < 248 && s.length < 12) s.push(ALFABETO[b % 31]);
    }
  }
  return `${s.slice(0, 4).join('')}-${s.slice(4, 8).join('')}-${s.slice(8).join('')}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não suportado.' }, 405);

  const admin = createClient(URL_SUPABASE, SERVICE, { auth: { persistSession: false } });

  // ── 1. quem está chamando ────────────────────────────────────
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ erro: 'Sem sessão.' }, 401);
  const { data: quem, error: eAuth } = await admin.auth.getUser(jwt);
  if (eAuth || !quem?.user) return json({ erro: 'Sessão inválida.' }, 401);

  // ── 2. e é a Aurum? ──────────────────────────────────────────
  if ((quem.user.email || '').toLowerCase() !== SUPER_ADMIN) {
    return json({ erro: 'Apenas a Aurum abre contas por aqui.' }, 403);
  }

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* corpo vazio */ }

  // ⚠️ 'criar' é o padrão para não quebrar quem já chama esta função sem
  // mandar ação nenhuma — era o único comportamento que existia.
  const acao = limpo(corpo.acao) || 'criar';

  // ── APAGAR ────────────────────────────────────────────────────
  if (acao === 'apagar') {
    const alvo = limpo(corpo.id);
    const confirmacao = limpo(corpo.confirmacao);
    if (!alvo || !confirmacao) return json({ erro: 'Falta o restaurante ou o nome de confirmação.' }, 400);

    // ⚠️ A RPC É CHAMADA COMO O USUÁRIO, não com a chave de administrador. A
    // trava dela é `sou_super_admin()`, que lê o e-mail do JWT — com a chave de
    // administrador não há JWT nenhum e a trava recusaria. Passar por aqui
    // mantém a verificação do BANCO valendo, em vez de confiar só neste
    // arquivo. Duas travas, não uma.
    const comoUsuario = createClient(URL_SUPABASE, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: usuarios, error: eApagar } = await comoUsuario
      .rpc('apagar_restaurante', { p_restaurante: alvo, p_confirmacao: confirmacao });
    if (eApagar) return json({ erro: eApagar.message }, 400);

    // ⚠️ AS CONTAS DE ACESSO SAEM POR ÚLTIMO e só depois que o banco confirmou.
    // `perfis` cascateia, mas `auth.users` não: sem esta parte sobrariam contas
    // que ainda entram no app e não pertencem a restaurante nenhum.
    const ids = (usuarios || []).map((u: { usuario_id: string }) => u.usuario_id).filter(Boolean);
    const sobraram: string[] = [];
    for (const id of ids) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) sobraram.push(id);
    }
    // O restaurante já foi apagado; se alguma conta resistiu, é preciso dizer —
    // ficar calado deixaria uma conta órfã que ninguém sabe que existe.
    return json({ ok: true, usuariosApagados: ids.length - sobraram.length, sobraram });
  }

  // ── TROCAR O E-MAIL DA CONTA DONA ─────────────────────────────
  //  Pedido do dono (10/09/2026): o cliente pede para trocar o e-mail da conta
  //  principal, e a Aurum troca pelo painel.
  //
  //  ⚠️ POR QUE AQUI E NÃO EM SQL: o e-mail mora em `auth.users`, esquema do
  //  Supabase — mesmo motivo da senha (ver functions/contas). A API de
  //  administração troca com contrato estável.
  //
  //  ⚠️ O QUE MUDA JUNTO, SEM MAIS NADA: o login, a recuperação de senha
  //  (`recuperacao_permitida`, M35) e a lista do painel
  //  (`usuarios_do_restaurante`, M9) leem o e-mail de `auth.users` NA HORA.
  //  A única CÓPIA que existe é `onboarding.contato_email`, atualizada abaixo.
  //
  //  Travas:
  //    • só a conta DONA (diretoria) — as de equipe são `@contas.aurum.app`,
  //      login interno, e quem troca o acesso delas é o dono do restaurante;
  //    • NUNCA a conta da Aurum: a trava deste arquivo compara o E-MAIL
  //      (SUPER_ADMIN, acima) — trocá-lo por aqui trancaria o painel inteiro;
  //    • domínio interno recusado, e e-mail já usado também.
  //  Sem link de confirmação, como na criação: quem confirma é a Aurum, que
  //  falou com o cliente. É por isso que o painel pede o e-mail duas vezes.
  if (acao === 'email') {
    const alvo = limpo(corpo.usuarioId);
    const novo = limpo(corpo.email).toLowerCase();
    if (!alvo) return json({ erro: 'Falta a conta.' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo)) return json({ erro: 'E-mail inválido.' }, 400);
    if (novo.endsWith('@contas.aurum.app')) {
      return json({ erro: 'Esse domínio é das contas de equipe. Use um e-mail de verdade.' }, 400);
    }
    if (novo === SUPER_ADMIN) return json({ erro: 'Esse é o e-mail da Aurum.' }, 400);

    const { data: perfil } = await admin.from('perfis')
      .select('id, restaurante_id, cargo').eq('id', alvo).maybeSingle();
    if (!perfil) return json({ erro: 'Conta não encontrada.' }, 404);
    if (perfil.cargo !== 'diretoria') {
      return json({ erro: 'Só a conta dona do restaurante troca de e-mail por aqui.' }, 400);
    }
    const { data: atual, error: eAtual } = await admin.auth.admin.getUserById(alvo);
    if (eAtual || !atual?.user) return json({ erro: 'Conta de acesso não encontrada.' }, 404);
    const antigo = (atual.user.email || '').toLowerCase();
    if (antigo === SUPER_ADMIN) {
      return json({ erro: 'Esta é a conta da Aurum — trocar o e-mail dela trancaria o painel.' }, 400);
    }
    if (antigo === novo) return json({ erro: 'Esse já é o e-mail da conta.' }, 400);

    const { error: eUpd } = await admin.auth.admin.updateUserById(alvo, { email: novo, email_confirm: true });
    if (eUpd) {
      const dup = /already|exists|registered/i.test(eUpd.message);
      return json({ erro: dup ? 'Já existe uma conta com esse e-mail.' : eUpd.message }, 400);
    }

    // A cópia do contato (M3). Falhar aqui não desfaz a troca — é só o contato.
    await admin.from('onboarding').update({ contato_email: novo }).eq('restaurante_id', perfil.restaurante_id);

    // ⚠️ NO LIVRO DA M39 À MÃO: o gatilho de lá vigia tabelas do app, e o
    // e-mail mora em `auth.users`, onde ele não alcança. Sem esta linha, a
    // troca seria justamente a ação da Aurum que não deixa rastro — e é a que
    // mais precisa ("quem mudou o e-mail da minha conta?").
    const { data: casa } = await admin.from('restaurantes')
      .select('nome').eq('id', perfil.restaurante_id).maybeSingle();
    await admin.from('admin_log').insert({
      restaurante_id: perfil.restaurante_id, restaurante: casa?.nome || null,
      tabela: 'auth.users', acao: 'UPDATE',
      mudancas: { email: { de: antigo, para: novo } },
      feito_por: (quem.user.email || '').toLowerCase(),
    });

    return json({ ok: true, email: novo });
  }

  const nomeRestaurante = limpo(corpo.nomeRestaurante);
  const nomeDono = limpo(corpo.nomeDono);
  const email = limpo(corpo.email).toLowerCase();
  const produto = limpo(corpo.produto) === 'etiquetas' ? 'etiquetas' : 'completo';
  const cnpj = soNumeros(corpo.cnpj);
  const whatsapp = soNumeros(corpo.whatsapp);
  const cidade = limpo(corpo.cidade);
  const uf = limpo(corpo.uf).toUpperCase();

  if (nomeRestaurante.length < 2) return json({ erro: 'Escreva o nome do restaurante.' }, 400);
  if (nomeDono.length < 2) return json({ erro: 'Escreva o nome do responsável.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: 'E-mail inválido.' }, 400);
  if (cnpj && !cnpjValido(cnpj)) return json({ erro: 'CNPJ inválido. Confira os números.' }, 400);

  // ⚠️ CNPJ ÚNICO, conferido ANTES de criar a conta. A constraint no banco
  // pegaria depois — mas aí já haveria um usuário de autenticação criado, e
  // desfazer é sempre pior do que não fazer.
  if (cnpj) {
    const { data: jaTem } = await admin.from('restaurantes').select('id, nome').eq('cnpj', cnpj).maybeSingle();
    if (jaTem) return json({ erro: `Esse CNPJ já é de "${jaTem.nome}".` }, 400);
  }

  try {
    // ── 3. a conta do dono ─────────────────────────────────────
    const senha = senhaInicial();
    const { data: novo, error: eUser } = await admin.auth.admin.createUser({
      email,
      password: senha,
      // Já nasce confirmada: quem confirma é a Aurum, que falou com a pessoa.
      email_confirm: true,
      user_metadata: { nome: nomeDono },
    });
    if (eUser) {
      const dup = /already|exists|registered/i.test(eUser.message);
      return json({ erro: dup ? 'Já existe uma conta com esse e-mail.' : eUser.message }, 400);
    }

    // ── 4. o restaurante ───────────────────────────────────────
    const { data: casa, error: eCasa } = await admin.from('restaurantes').insert({
      nome: nomeRestaurante,
      produto,
      cnpj: cnpj || null,
      whatsapp: whatsapp || null,
      cidade: cidade || null,
      uf: uf || null,
    }).select('id').single();
    if (eCasa) {
      // ⚠️ DESFAZ. Sem isto sobraria uma conta que autentica e não pertence a
      // restaurante nenhum: entra no app, vê tela vazia, e o e-mail passa a dar
      // "já registrado" numa segunda tentativa.
      await admin.auth.admin.deleteUser(novo.user.id);
      return json({ erro: eCasa.message }, 400);
    }

    // ── 5. o perfil de diretoria ───────────────────────────────
    const { error: ePerfil } = await admin.from('perfis').insert({
      id: novo.user.id, restaurante_id: casa.id, nome: nomeDono, cargo: 'diretoria', ativo: true,
    });
    if (ePerfil) {
      await admin.from('restaurantes').delete().eq('id', casa.id);
      await admin.auth.admin.deleteUser(novo.user.id);
      return json({ erro: ePerfil.message }, 400);
    }

    // A senha só sai daqui, nesta resposta, para o super-admin que pediu.
    return json({ ok: true, id: casa.id, usuarioId: novo.user.id, senha });
  } catch (e) {
    return json({ erro: (e as Error)?.message || 'Falha inesperada.' }, 500);
  }
});
