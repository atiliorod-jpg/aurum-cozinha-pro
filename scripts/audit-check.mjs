// Roda `npm audit` e falha o CI em qualquer vulnerabilidade high/critical —
// EXCETO as listadas em IGNORAR_GHSA abaixo, documentadas caso a caso.
// Isso evita travar o deploy por uma falha que não afeta este app, sem
// enfraquecer a checagem pra vulnerabilidades novas/reais.
import { execSync } from 'node:child_process';

// GHSA-qwww-vcr4-c8h2 (react-router, "RSC Mode CSRF Bypass"): o próprio
// aviso oficial diz "This only affects your application if you are using
// the unstable RSC APIs". Este app é 100% client-side (BrowserRouter puro,
// sem servidor, sem RSC) — não se aplica. Não existe versão 7.x corrigida
// ainda (patch é 8.3.0+, ainda não lançado); a "correção" do npm seria
// REBAIXAR para 7.11.0, o que é mais arriscado que manter e documentar.
// Revisitar quando react-router-dom 8.3.0+ (ou um backport 7.x) sair.
const IGNORAR_GHSA = new Set(['GHSA-qwww-vcr4-c8h2']);

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
// Passo 2 (repete pra cadeias transitivas de mais de 1 nível): pacotes cujo
// `via` é só nomes de outros pacotes (string) — ignorável se todos esses
// pacotes-causa já foram marcados ignoráveis.
for (let i = 0; i < 3; i++) {
  for (const [nome, v] of graves) {
    if (ignoravel.has(nome)) continue;
    const refs = (v.via || []).filter(x => typeof x === 'string');
    if (refs.length === (v.via || []).length && refs.length && refs.every(r => ignoravel.has(r))) {
      ignoravel.add(nome);
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
