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
//  ⚠️ SENHA: A FUNÇÃO NÃO ACEITA UMA. Nasce aleatória e ninguém a conhece —
//  nem o cliente, nem a Aurum. Quem entrega a conta é o link de "escolher
//  senha", que o painel dispara logo em seguida para o e-mail do dono. Senha
//  ditada por telefone é senha que vaza, e "senha padrão" é a que fica.
//  De quebra, o link prova que o e-mail existe: ele é o ÚNICO caminho de
//  recuperação do dono, e descobrir que estava errado seis meses depois é
//  descobrir tarde.
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

// ⚠️ A MESMA linha de sou_super_admin() (M19). Se um dia virar tabela, os dois
// lados mudam no mesmo commit — senão o painel deixa de abrir contas e o erro
// aparece como "não autorizado" sem explicação.
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

// Senha que ninguém escolheu e ninguém guarda: existe só para a conta nascer
// válida até o dono usar o link.
const senhaDescartavel = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

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
    const { data: novo, error: eUser } = await admin.auth.admin.createUser({
      email,
      password: senhaDescartavel(),
      // Já nasce confirmada: quem confirma é a Aurum, que falou com a pessoa.
      // O link de senha logo em seguida é o que prova o e-mail na prática.
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

    return json({ ok: true, id: casa.id, usuarioId: novo.user.id });
  } catch (e) {
    return json({ erro: (e as Error)?.message || 'Falha inesperada.' }, 500);
  }
});
