// Publica uma edge function no Supabase pela Management API, sem CLI.
//
// Por que existe: a função `contas` guarda a chave de administrador do projeto
// e é o único lugar de onde se cria conta de outra pessoa. Depender do
// `supabase` CLI instalado na máquina certa é como as migrações 17 e 18
// ficaram semanas paradas — melhor um script que roda de qualquer lugar com o
// mesmo token que já usamos para as migrações.
//
// Uso:
//   node scripts/publicar-funcao.mjs contas
//   node scripts/publicar-funcao.mjs --lista

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const DIR = path.join(RAIZ, 'supabase', 'functions');

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
);
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = (env.VITE_SUPABASE_URL || '').replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, '');

const alvo = process.argv[2];
const existentes = fs.existsSync(DIR) ? fs.readdirSync(DIR) : [];

if (!alvo || alvo === '--lista') {
  console.log('\nFunções no repositório:\n');
  existentes.forEach(f => console.log(`  ${f}`));
  console.log('\nUso: node scripts/publicar-funcao.mjs contas\n');
  process.exit(alvo ? 0 : 1);
}
if (!TOKEN) { console.error('❌ Falta SUPABASE_ACCESS_TOKEN em .env.local.'); process.exit(1); }
if (!existentes.includes(alvo)) { console.error(`❌ Não achei supabase/functions/${alvo}`); process.exit(1); }

const arquivo = path.join(DIR, alvo, 'index.ts');
const codigo = fs.readFileSync(arquivo, 'utf8');

// ⚠️ verify_jwt = false DE PROPÓSITO, e não é descuido: a própria função lê o
// token, confere que quem chama é diretoria ATIVA da casa e que o alvo é da
// mesma casa. Deixar o gateway barrar antes só trocaria uma mensagem clara
// ("apenas a conta dona…") por um 401 seco — e a trava de verdade continuaria
// sendo a de dentro, que é onde ela precisa estar.
const forma = new FormData();
forma.append('metadata', JSON.stringify({
  name: alvo, entrypoint_path: 'index.ts', verify_jwt: false,
}));
forma.append('file', new File([codigo], 'index.ts', { type: 'application/typescript' }));

const r = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=${alvo}`,
  { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: forma },
);
const txt = await r.text();
if (!r.ok) {
  console.error(`\n❌ FALHOU (${r.status}): ${txt.slice(0, 800)}\n`);
  process.exit(1);
}
const dados = JSON.parse(txt);
console.log(`\n✅ ${alvo} publicada — versão ${dados.version ?? '?'}, status ${dados.status ?? '?'}`);
console.log(`   URL: https://${REF}.supabase.co/functions/v1/${alvo}\n`);
