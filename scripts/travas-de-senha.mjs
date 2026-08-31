// =====================================================================
//  Travas de senha do Supabase — C1, C2 e C3 da auditoria de 31/08/2026
//
//  Por que existe: são ajustes de projeto, não código. Ficariam num painel web
//  que ninguém revisa e que não deixa rastro em lugar nenhum. Aqui eles são um
//  arquivo no repositório: dá para ler o que mudou, por que mudou e voltar
//  atrás.
//
//  Uso:
//    node scripts/travas-de-senha.mjs           # mostra o que está hoje e o que mudaria
//    node scripts/travas-de-senha.mjs --aplicar # aplica
//
//  Precisa de SUPABASE_ACCESS_TOKEN no .env.local (o mesmo das migrações).
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
);
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = (env.VITE_SUPABASE_URL || '').replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, '');

if (!TOKEN || !REF) {
  console.error('\n❌ Falta SUPABASE_ACCESS_TOKEN ou VITE_SUPABASE_URL no .env.local.\n');
  process.exit(1);
}

// ── O que muda, e o motivo de cada um ────────────────────────────────
const MUDANCAS = [
  // ⚠️ O C1 SÓ ENTRA COM `--c1`, e a razão está aqui para não se perder:
  // `security_update_password_require_reauthentication` faz o Supabase exigir
  // um código de confirmação em `updateUser({password})` — e o app chama
  // EXATAMENTE essa função nos dois caminhos: na troca comum e na tela de nova
  // senha de quem chegou pelo link do e-mail (AuthContext.jsx:708). Ligar sem
  // testar arrisca quebrar a recuperação, que é a única forma de o dono voltar
  // à conta dele. Ligar numa hora em que dê para testar o link e desligar.
  ...(process.argv.includes('--c1') ? [{
    chave: 'security_update_password_require_reauthentication',
    valor: true,
    titulo: 'C1 · trocar senha passa a exigir confirmação',
    porque: 'O tablet fica logado em cima da bancada o dia inteiro. Sem isto, '
      + 'qualquer um que passe por ele troca a senha do dono.',
  }] : []),
  {
    chave: 'mailer_notifications_password_changed_enabled',
    valor: true,
    titulo: 'C2 · o cliente é avisado quando a senha muda',
    porque: 'Hoje a troca acontece em silêncio. Agora que o painel manda link de '
      + 'nova senha, o aviso é o que separa "a Aurum me ajudou" de "alguém mexeu '
      + 'na minha conta".',
  },
  {
    chave: 'mailer_notifications_mfa_factor_enrolled_enabled',
    valor: true,
    titulo: 'C2 · aviso quando alguém adiciona verificação em duas etapas',
    porque: 'Mesma razão do anterior: mudança silenciosa em como se entra na conta.',
  },
  {
    chave: 'mailer_notifications_mfa_factor_unenrolled_enabled',
    valor: true,
    titulo: 'C2 · aviso quando alguém REMOVE a verificação em duas etapas',
    porque: 'Este é o mais importante dos três: tirar o segundo fator é o passo '
      + 'que alguém dá antes de tomar a conta.',
  },
  {
    chave: 'password_min_length',
    valor: 8,
    titulo: 'C3 · mínimo de 8 caracteres',
    porque: 'Seis é o padrão de fábrica do Supabase. Esta conta guarda o cadastro '
      + 'inteiro, o CNPJ e o acesso da equipe. Só vale para senha NOVA — ninguém '
      + 'é derrubado nem obrigado a trocar.',
  },
  // ⚠️ `password_hibp_enabled` NÃO ENTRA, e não é esquecimento: a API devolve
  // 402 — "available on Pro Plans and up". A conferência contra senhas vazadas
  // é paga. Testado em 31/08/2026, com o projeto no plano gratuito. Se um dia
  // o plano subir, é só acrescentar aqui.
];

// ⚠️ Os modelos de e-mail vêm em INGLÊS de fábrica, e são justamente os que o
// cliente recebe. Todos os outros e-mails do app já estão em português.
const TEXTOS = {
  mailer_subjects_password_changed_notification: 'Sua senha do Aurum foi alterada',
  mailer_templates_password_changed_notification_content:
    '<h2>Sua senha foi alterada</h2>'
    + '<p>A senha da sua conta Aurum acabou de ser trocada.</p>'
    + '<p>Se não foi você, peça uma nova senha na tela de entrada e fale com a Aurum pelo WhatsApp.</p>',
  mailer_subjects_mfa_factor_enrolled_notification: 'Nova verificação em duas etapas na sua conta Aurum',
  mailer_templates_mfa_factor_enrolled_notification_content:
    '<h2>Uma verificação em duas etapas foi adicionada</h2>'
    + '<p>A partir de agora sua conta Aurum pede um código a mais para entrar.</p>'
    + '<p>Se não foi você, fale com a Aurum pelo WhatsApp agora.</p>',
  mailer_subjects_mfa_factor_unenrolled_notification: 'Verificação em duas etapas removida da sua conta Aurum',
  mailer_templates_mfa_factor_unenrolled_notification_content:
    '<h2>A verificação em duas etapas foi removida</h2>'
    + '<p>Sua conta Aurum voltou a entrar só com a senha.</p>'
    + '<p>Se não foi você, fale com a Aurum pelo WhatsApp agora.</p>',
};

const api = (metodo, corpo) => fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: metodo,
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  ...(corpo ? { body: JSON.stringify(corpo) } : {}),
});

const atual = await (await api('GET')).json();
const aplicar = process.argv.includes('--aplicar');

console.log(`\n━━━ Travas de senha — projeto ${REF} ━━━\n`);

let mexer = 0;
for (const m of MUDANCAS) {
  const hoje = atual[m.chave];
  const igual = hoje === m.valor;
  if (!igual) mexer++;
  console.log(`${igual ? '  ✓' : '  →'} ${m.titulo}`);
  console.log(`     ${m.chave}: ${JSON.stringify(hoje)}${igual ? ' (já está assim)' : ` → ${JSON.stringify(m.valor)}`}`);
  if (!igual) console.log(`     ${m.porque}\n`);
  else console.log('');
}

const textosDiferentes = Object.entries(TEXTOS).filter(([k, v]) => atual[k] !== v);
if (textosDiferentes.length) {
  console.log(`  → ${textosDiferentes.length} texto(s) de e-mail passam de inglês para português\n`);
}

if (!process.argv.includes('--c1')) {
  console.log('  ⏳ C1 (exigir confirmação para trocar senha) NÃO está incluído.');
  console.log('     Ele mexe no mesmo caminho da recuperação por e-mail — ligue com');
  console.log('     --c1 numa hora em que dê para testar o link e desligar se quebrar.\n');
}

if (!aplicar) {
  console.log(`  ${mexer + textosDiferentes.length} ajuste(s) para fazer.`);
  console.log('  Rode com --aplicar quando quiser valer.\n');
  process.exit(0);
}

const patch = Object.fromEntries([
  ...MUDANCAS.map(m => [m.chave, m.valor]),
  ...Object.entries(TEXTOS),
]);
const r = await api('PATCH', patch);
if (!r.ok) {
  console.error(`\n❌ FALHOU (${r.status}): ${(await r.text()).slice(0, 400)}\n`);
  process.exit(1);
}

// ⚠️ Confere no servidor em vez de confiar no 200: a API aceita chave que não
// existe sem reclamar, e aí o ajuste "passou" sem ter passado.
const depois = await (await api('GET')).json();
const falharam = MUDANCAS.filter(m => depois[m.chave] !== m.valor);
console.log(falharam.length
  ? `\n⚠️  Aplicado, mas ${falharam.length} não pegaram: ${falharam.map(f => f.chave).join(', ')}\n`
  : '\n✅ Tudo aplicado e conferido no servidor.\n');
