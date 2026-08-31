// Aponta o app para o domínio próprio, sem derrubar o endereço antigo.
//
// ⚠️ ORDEM IMPORTA, e errar a ordem tira o app do ar:
//   1. o DNS `app.aurumcozinha.com.br` tem que existir e responder ANTES;
//   2. só então o arquivo CNAME entra no repositório — a partir dele o GitHub
//      passa a REDIRECIONAR o endereço antigo para o novo, e se o novo ainda
//      não resolver, ninguém entra em lugar nenhum.
// Este script confere o passo 1 antes de deixar seguir.
//
// Uso:
//   node scripts/dominio-app.mjs            # só confere
//   node scripts/dominio-app.mjs --aplicar  # confere e aplica

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
);
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = (env.VITE_SUPABASE_URL || '').replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, '');

const DOMINIO = 'app.aurumcozinha.com.br';
const PAGES = 'atiliorod-jpg.github.io';
const ANTIGO = `https://${PAGES}/aurum-cozinha-pro/`;
const NOVO = `https://${DOMINIO}/`;

console.log(`1) o DNS de ${DOMINIO} já responde?`);
let ok = false;
try {
  const r = await dns.resolveCname(DOMINIO);
  ok = r.some(x => x.toLowerCase().includes(PAGES));
  console.log(`   ${ok ? '✅' : '⚠️ '} CNAME -> ${r.join(', ')}`);
  if (!ok) console.log(`   esperado: ${PAGES}`);
} catch (e) {
  console.log(`   ❌ ainda não resolve (${e.code})`);
}

if (!ok) {
  console.log(`\n   Falta o registro na zona do Registro.br:\n`);
  console.log(`     Tipo   CNAME`);
  console.log(`     Nome   app`);
  console.log(`     Dados  ${PAGES}\n`);
  console.log('   Sem ele, aplicar aqui tiraria o app do ar. Parando.\n');
  process.exit(1);
}

if (!process.argv.includes('--aplicar')) {
  console.log('\n(nada foi alterado — rode com --aplicar)\n');
  process.exit(0);
}

// 2) O arquivo que diz ao GitHub Pages qual é o endereço oficial.
//    Vai em `public/` porque o Vite copia essa pasta crua para a saída — em
//    `dist/` seria apagado no próximo build.
fs.writeFileSync(path.join(RAIZ, 'public', 'CNAME'), `${DOMINIO}\n`);
console.log('2) public/CNAME escrito');

// 3) O app deixa de morar numa subpasta.
//    ⚠️ Com domínio próprio o site serve na RAIZ. Manter /aurum-cozinha-pro/
//    faria todo caminho de arquivo (ícones, JS, service worker) apontar para
//    uma pasta que não existe mais — tela branca, sem erro visível.
const wf = path.join(RAIZ, '.github', 'workflows', 'deploy.yml');
const antes = fs.readFileSync(wf, 'utf8');
const depois = antes.replace('VITE_BASE: /aurum-cozinha-pro/', 'VITE_BASE: /');
if (antes === depois) console.log('3) VITE_BASE já estava na raiz');
else { fs.writeFileSync(wf, depois); console.log('3) VITE_BASE -> /'); }

// 4) O Supabase precisa aceitar o endereço novo nos links de e-mail.
//    ⚠️ O ANTIGO CONTINUA NA LISTA de propósito: enquanto o DNS propaga, gente
//    pode cair no endereço velho, e link de recuperação recusado é pior que
//    link feio.
const PERMITIDOS = [`${NOVO}**`, NOVO, `${ANTIGO}**`, ANTIGO,
  'http://localhost:5173/**', 'http://localhost:5173/'].join(',');
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ site_url: NOVO, uri_allow_list: PERMITIDOS }),
});
if (!r.ok) { console.error(`4) ❌ Supabase (${r.status}): ${(await r.text()).slice(0, 400)}`); process.exit(1); }
const cfg = await r.json();
console.log('4) Supabase site_url ->', cfg.site_url);

console.log(`\n✅ pronto. Falta o commit e, no GitHub, Settings -> Pages -> Custom domain: ${DOMINIO}`);
console.log('   (o arquivo CNAME já faz isso sozinho no deploy, mas confira o "Enforce HTTPS")\n');
