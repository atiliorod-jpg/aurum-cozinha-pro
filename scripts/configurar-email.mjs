// Liga o envio de e-mail do Supabase no Resend, e ativa a confirmação de
// cadastro.
//
// Por que existe: o remetente embutido do Supabase manda 2 e-mails por HORA no
// projeto inteiro e é declaradamente para teste. Com ele, "esqueci minha senha"
// funciona de vez em quando — o que é pior que não funcionar, porque a tela diz
// "enviamos o link" de qualquer jeito.
//
// ⚠️ A CHAVE DO RESEND NÃO ENTRA NO CÓDIGO NEM NO CHAT. Ela é lida do
// .env.local (que o .gitignore já cobre pelo padrão *.local) e vai direto para
// a configuração do projeto no Supabase. Some da máquina no momento em que
// você apagar a linha.
//
// Antes de rodar, ponha no .env.local:
//   RESEND_API_KEY=re_...
//
// ⚠️ SE FOR GRAVAR ESSA LINHA PELO POWERSHELL, cuidado com o `Set-Content
// -Encoding utf8`: ele escreve um marcador invisível (BOM) no começo do
// arquivo. O Node sobrevive (o `.trim()` engole o marcador), mas o Vite não —
// a primeira variável vira um nome com lixo na frente, e o app quebra com
// "supabaseUrl is required" sem nada apontar para o arquivo de ambiente.
// Aconteceu aqui em 31/08/2026. Use `-Encoding utf8NoBOM`, ou grave pelo Node.
//
// Uso:
//   node scripts/configurar-email.mjs            # confere e mostra o que fará
//   node scripts/configurar-email.mjs --aplicar  # aplica

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
const CHAVE = env.RESEND_API_KEY;
const REF = (env.VITE_SUPABASE_URL || '').replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, '');

// O remetente PRECISA ser do subdomínio verificado no Resend. Qualquer outro
// endereço é recusado no envio — e a recusa não aparece para o cliente, que só
// vê o e-mail não chegar.
const REMETENTE = 'nao-responda@conta.aurumcozinha.com.br';
const NOME = 'Aurum Cozinha';

if (!TOKEN) { console.error('❌ Falta SUPABASE_ACCESS_TOKEN em .env.local.'); process.exit(1); }
if (!CHAVE) {
  console.error('\n❌ Falta RESEND_API_KEY em .env.local.\n');
  console.error('   1) resend.com → API keys → Create API key (permissão de envio)');
  console.error('   2) copie NA HORA: o Resend mostra o valor uma vez só');
  console.error('   3) RESEND_API_KEY=re_... no .env.local\n');
  process.exit(1);
}

const aplicar = process.argv.includes('--aplicar');
const config = {
  smtp_host: 'smtp.resend.com',
  // ⚠️ STRING, não número: a API do Supabase recusa 587 com "expected string,
  // received number". Erro de digitação silencioso se ninguém ler a resposta.
  smtp_port: '587',
  smtp_user: 'resend',            // usuário fixo do Resend; a senha é a chave
  smtp_pass: CHAVE,
  smtp_admin_email: REMETENTE,
  smtp_sender_name: NOME,
  // O limite de 2/hora era do remetente de teste. Com SMTP próprio ele deixa de
  // fazer sentido — e ele é por PROJETO, então dois clientes esquecendo a senha
  // na mesma hora já estouravam.
  rate_limit_email_sent: 100,
  // ⚠️ LIGA A CONFIRMAÇÃO DE CADASTRO. Estava desligada desde julho porque não
  // havia como enviar o e-mail. As contas que o dono cria para a equipe NÃO são
  // afetadas: nascem confirmadas, porque quem cria é ele e o endereço interno
  // não tem caixa de entrada.
  mailer_autoconfirm: false,
};

console.log(`projeto: ${REF}`);
console.log('vai aplicar:');
for (const [k, v] of Object.entries(config)) {
  console.log(`  ${k.padEnd(22)} ${k === 'smtp_pass' ? `re_… (${String(v).length} caracteres)` : v}`);
}

if (!aplicar) {
  console.log('\n(nada foi alterado — rode com --aplicar)\n');
  process.exit(0);
}

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(config),
});
const txt = await r.text();
if (!r.ok) { console.error(`\n❌ FALHOU (${r.status}): ${txt.slice(0, 600)}\n`); process.exit(1); }
const fim = JSON.parse(txt);
console.log('\n✅ aplicado');
console.log('  smtp_host         :', fim.smtp_host);
console.log('  remetente         :', fim.smtp_admin_email);
console.log('  confirmação ligada:', fim.mailer_autoconfirm === false ? 'sim' : 'NÃO — conferir');
console.log('\nTeste agora: "Esqueci minha senha" com o seu e-mail.\n');
