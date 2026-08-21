// Roda migração no banco pela Management API do Supabase, sem SQL Editor.
//
// Por que existe: a chave `service_role` fala com o PostgREST, que só manipula
// DADOS — não roda DDL. Então toda migração dependia de alguém colar o arquivo
// no SQL Editor à mão, e foi assim que a 17 e a 18 ficaram semanas paradas com
// o app pedindo por elas. A Management API aceita SQL de verdade.
//
// Precisa de um Personal Access Token (sbp_...) em .env.local:
//   SUPABASE_ACCESS_TOKEN=sbp_...
// Criar em https://supabase.com/dashboard/account/tokens — revogável lá mesmo.
// É credencial de CONTA (mais forte que a service_role): não commitar. O
// .gitignore já cobre .env.local pelo padrão *.local.
//
// Uso:
//   node scripts/rodar-migracao.mjs 17 18     # roda nesta ordem, para no 1º erro
//   node scripts/rodar-migracao.mjs --lista   # mostra o que existe
//   node scripts/rodar-migracao.mjs 18 --dry  # imprime o SQL, não executa

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const DIR_SQL = path.join(RAIZ, 'src', 'lib');

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = (env.VITE_SUPABASE_URL || '').replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, '');

const migracoes = fs.readdirSync(DIR_SQL)
  .filter(f => /^migration(\d+)_.*\.sql$/.test(f))
  .map(f => ({ numero: Number(f.match(/^migration(\d+)_/)[1]), arquivo: f }))
  .sort((a, b) => a.numero - b.numero);

const args = process.argv.slice(2);
const seco = args.includes('--dry');
const pedidos = args.filter(a => /^\d+$/.test(a)).map(Number);

if (args.includes('--lista') || !pedidos.length) {
  console.log('\nMigrações no repositório:\n');
  migracoes.forEach(m => console.log(`  ${String(m.numero).padStart(2)}  ${m.arquivo}`));
  console.log('\nUso: node scripts/rodar-migracao.mjs 17 18');
  console.log('Depois confira sempre: node scripts/checar-migracoes.mjs\n');
  process.exit(pedidos.length ? 0 : 1);
}

if (!REF) { console.error('❌ Não achei VITE_SUPABASE_URL em .env.local.'); process.exit(1); }
if (!TOKEN && !seco) {
  console.error('\n❌ Falta SUPABASE_ACCESS_TOKEN em .env.local.\n');
  console.error('   1) https://supabase.com/dashboard/account/tokens → Generate new token');
  console.error('   2) SUPABASE_ACCESS_TOKEN=sbp_... no .env.local');
  console.error('\n   É credencial de conta: não commitar (o *.local do .gitignore já cobre).\n');
  process.exit(1);
}

async function executar(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const texto = await r.text();
  let corpo; try { corpo = JSON.parse(texto); } catch { corpo = texto; }
  return { ok: r.ok, status: r.status, corpo };
}

for (const numero of pedidos) {
  const alvo = migracoes.find(m => m.numero === numero);
  if (!alvo) { console.error(`❌ Não existe migração ${numero} em src/lib/.`); process.exit(1); }

  const sql = fs.readFileSync(path.join(DIR_SQL, alvo.arquivo), 'utf8');
  console.log(`\n━━━ migração ${numero} — ${alvo.arquivo} (${sql.split('\n').length} linhas) ━━━`);

  if (seco) { console.log(sql); continue; }

  const r = await executar(sql);
  if (!r.ok) {
    const msg = r.corpo?.message || JSON.stringify(r.corpo).slice(0, 600);
    console.error(`\n❌ FALHOU (${r.status}): ${msg}\n`);
    // A 18 termina com uma trava que aborta de propósito se sobrar policy antiga
    // — nesse caso a transação inteira volta atrás e NADA foi aplicado, que é o
    // desenho: melhor não aplicar do que aplicar pela metade e parecer seguro.
    if (/Policy antiga sobreviveu/i.test(msg)) {
      console.error('   Essa é a trava anti-drift da própria migração 18: o banco tem policy');
      console.error('   com nome que o script não derruba. Nada foi aplicado. Me mande a lista');
      console.error('   acima que eu ajusto os DROPs para os nomes reais.\n');
    }
    console.error('   Parando aqui: as migrações dependem da ordem.\n');
    process.exit(1);
  }
  console.log(`✅ aplicada`);
}

if (!seco) {
  console.log('\n━━━ agora confira contra o banco, não contra os arquivos ━━━');
  console.log('  node scripts/checar-migracoes.mjs\n');
}
