// Roda `npm audit` e falha o CI em qualquer vulnerabilidade high/critical —
// EXCETO as listadas em IGNORAR_GHSA abaixo, documentadas caso a caso.
// Isso evita travar o deploy por uma falha que não afeta este app, sem
// enfraquecer a checagem pra vulnerabilidades novas/reais.
import { execSync } from 'node:child_process';

const IGNORAR_GHSA = new Set([
  // (removida em 05/08/2026) GHSA-mh99-v99m-4gvg, brace-expansion: saiu um
  // patch de verdade e o `npm audit fix` resolveu, então a exceção deixou de
  // existir. Exceção obsoleta é pior que exceção nenhuma — ela continuaria
  // aceitando o aviso em silêncio se ele voltasse.
  //
  // (removida em 21/08/2026) GHSA-qwww-vcr4-c8h2, react-router "RSC Mode CSRF
  // Bypass": a exceção previa "revisitar quando sair 8.3.0+ ou um backport
  // 7.x". O backport saiu — estamos em react-router 7.18.2 e o advisory não é
  // mais reportado. Mesma regra de sempre: exceção que não protege mais nada
  // sai, senão volta a aceitar o aviso em silêncio se ele reaparecer.
]);

let saida;
try {
  saida = execSync('npm audit --audit-level=high --json', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
} catch (e) {
  saida = e.stdout; // npm audit sai com código != 0 quando acha algo — o JSON vem no stdout mesmo assim
}

const relatorio = JSON.parse(saida);
const vulns = relatorio.vulnerabilities || {};
const graves = Object.entries(vulns).filter(([, v]) => ['high', 'critical'].includes(v.severity));

// Passo 1: pacotes cujo `via` é só avisos DIRETOS (objetos) — ignorável se
// TODOS os avisos diretos estão na lista.
const ignoravel = new Set();
for (const [nome, v] of graves) {
  const diretos = (v.via || []).filter(x => typeof x === 'object');
  if (diretos.length && diretos.every(a => IGNORAR_GHSA.has((a.url || '').split('/').pop()))) {
    ignoravel.add(nome);
  }
}
// Passo 2 (repete pra cadeias transitivas de N níveis, até estabilizar):
// pacotes cujo `via` é só nomes de outros pacotes (string) — ignorável se
// todos esses pacotes-causa já foram marcados ignoráveis. Loop de ponto
// fixo (não um número fixo de passadas) porque cadeias reais chegam a
// 8+ níveis (ex.: vite-plugin-pwa → workbox-build → … → brace-expansion).
let mudou = true;
while (mudou) {
  mudou = false;
  for (const [nome, v] of graves) {
    if (ignoravel.has(nome)) continue;
    const refs = (v.via || []).filter(x => typeof x === 'string');
    if (refs.length === (v.via || []).length && refs.length && refs.every(r => ignoravel.has(r))) {
      ignoravel.add(nome);
      mudou = true;
    }
  }
}

const naoIgnoradas = graves.filter(([nome]) => !ignoravel.has(nome));

if (naoIgnoradas.length) {
  console.error(`❌ ${naoIgnoradas.length} vulnerabilidade(s) high/critical não ignorada(s):`);
  naoIgnoradas.forEach(([nome, v]) => console.error(`  - ${nome} (${v.severity})`));
  process.exit(1);
}

console.log(`✅ npm audit ok (${graves.length} vulnerabilidade(s) documentada(s) e ignorada(s): ${[...ignoravel].join(', ') || '—'} — ver IGNORAR_GHSA em scripts/audit-check.mjs).`);
