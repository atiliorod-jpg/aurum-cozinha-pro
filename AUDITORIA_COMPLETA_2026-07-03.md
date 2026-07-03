# Auditoria Técnica e Gastronômica Completa — Aurum Cozinha Pro

**Data:** 03/07/2026 · **Commit base:** `5e9e862` (main) · **Método:** leitura integral do código-fonte, execução de testes (32/32 ✓), build de produção, `npm audit`, `npm outdated`, ESLint, análise das policies SQL.

> Convenção de severidade: **P0** crítico · **P1** alto · **P2** médio · **P3** baixo · **P4** melhoria.

---

## Sumário executivo

O app é um produto **maduro para o estágio em que está**: offline-first bem resolvido (cache + outbox + realtime), RLS multi-tenant pensado, lógica gastronômica correta e testada (FEFO, FC, cocção, mín/máx), UX de tablet acima da média. As auditorias anteriores (jun/2026) fecharam a maioria dos bugs funcionais.

Os riscos que restam são de outra natureza: **(1)** segurança que depende de um script SQL cujo estado no banco não é verificável pelo repo; **(2)** um bug real de duplo clique na Produção; **(3)** contas órfãs no fluxo de convite; **(4)** dívidas de crescimento (fetch sem janela, bundle único, god component de 1.729 linhas) que não doem hoje mas doem com o 5º cliente pagante.

**Nota geral: 70/100** — bom produto, base sólida, com uma lista curta de correções P0/P1 e um roadmap claro.

| Categoria | Nota | Categoria | Nota |
|---|---|---|---|
| Arquitetura | 72 | Testes | 55 |
| Qualidade de código | 70 | Observabilidade | 40 |
| Segurança | 65 | Dependências | 60 |
| Performance | 68 | SEO | n/a |
| UX | 82 | Responsividade/Mobile | 75 |
| UI | 80 | Conformidade (LGPD) | 55 |
| Acessibilidade | 66 | Documentação | 70 |
| Banco de dados | 72 | **Gastronomia/adequação operacional** | **78** |
| APIs (Supabase) | 75 | CI/CD e Automações | 60 |

---

## 1. Arquitetura — 72/100

**Pontos fortes**
- Padrão offline-first coerente e raro de ver bem feito nesse porte: `cache.js` (localStorage namespaced por restaurante) + outbox de pendências + realtime + merge `aplicaReg` que preserva itens locais durante o fetch (race condition tratada).
- Separação limpa das regras de negócio em `src/utils/*` puros e testados (estoque, lotes, sugestões, produção, análise) — as páginas não recalculam nada crítico.
- Modelo de dados pragmático: 1 tabela `registros` (tipo + JSONB) + `documentos` (catálogos JSONB). Simples de sincronizar, simples de fazer backup.
- Estoque calculado uma vez (`useMemo` no contexto) e compartilhado.

**Problemas**
- **[P2] `Configuracoes.jsx` tem 1.729 linhas** — god component com 10+ responsabilidades (produtos, categorias, receitas, equipe, convites, rendimento/FC, suporte remoto, backup, importação xlsx, instalação PWA, zona de perigo). Qualquer mudança ali é arriscada e o diff é ilegível. *Correção:* extrair cada aba para `src/pages/config/…` (extração mecânica, sem mudança de lógica). Esforço: Médio.
- **[P2] `AppContext.jsx` (619 linhas) mistura 5 papéis** — estado, persistência, sync/outbox, auditoria, backup. Funciona, mas o efeito de hidratação de ~185 linhas é o código mais crítico e menos testado do app. *Correção mínima:* extrair `flush`/hidratação para `src/lib/sync.js` puro e testável. Esforço: Médio.
- **[P2] Escrita concorrente em catálogos = last-writer-wins.** `documentos` é upsert do array inteiro; dois aparelhos editando produtos ao mesmo tempo → a escrita mais lenta sobrescreve a outra silenciosamente (o realtime reduz a janela, não elimina). *Correção:* coluna `versao int` + upsert condicional (`eq('versao', atual)`), com re-merge no conflito. Esforço: Médio.
- **[P3] Produção não-atômica** (saída → entrada em 2 inserts). Decisão consciente (RPC quebraria o offline-first) e o pior caso é conservador (ingredientes sobram em estoque). Documentado; aceitável. Alternativa futura: gravar a produção como **1 registro** `tipo='producao'` com itens de entrada+saída dentro, e derivar os dois efeitos no cálculo — atômico por construção e offline-friendly.
- SOLID/DRY/KISS: bem no geral; `MAPA_RESTAURO` recriado a cada render (irrelevante na prática), wrappers add/remove são repetitivos mas legíveis. YAGNI respeitado (features dispensadas pelo cliente foram removidas, não escondidas).

## 2. Qualidade de código — 70/100

- **[P2] ESLint: 41 erros, 5 avisos.** Nada disso roda no CI (só `npm test`), então regride sem ninguém ver. Grupos: `react-hooks/purity|refs|set-state-in-effect` (19), `no-unused-vars` (10, código morto real — ex.: `locais` importado e não usado), `no-undef` (6, `process` no vite.config → usar `import.meta.env` ou configurar env node no eslint). *Correção:* zerar (maioria é mecânica) e adicionar `npx eslint .` ao workflow. Esforço: Médio.
- **Positivo raro:** comentários explicam *porquês* operacionais ("o Supabase só envia a query com await/.then", "não sobrescrever catálogo com falha de rede") — memória institucional dentro do código. Zero `console.log` esquecido. Nomenclatura em PT consistente com o domínio.
- **[P3] Código morto residual:** `src/assets/react.svg`, `hero.png` (não referenciados), abas de histórico legadas nas telas de registro (nota antiga: "limpar depois" — nunca limpo).

## 3. Segurança — 65/100

### ✅ O que já está certo
- React escapa tudo por padrão; **zero** `dangerouslySetInnerHTML`/`eval`/`innerHTML` no código.
- Anon key no bundle é esperado (segurança real = RLS). Nenhuma service key no client. `.env.local` gitignored (`*.local`).
- RPCs `SECURITY DEFINER` com `set search_path` fixo; anti-autopromoção via trigger + RPC; auditoria imutável (insert-only) no migration4; `FOR UPDATE` no aceite de convite (anti-corrida de token); sessão única por conta.
- Formula injection em export xlsx: baixo risco (aoa_to_sheet grava strings como tipo `s`, não fórmula).

### ⚠️ Achados

**[P0] Estado do RLS no banco não é verificável — `migration4_hardening.sql` pode não ter sido rodado.**
Sem ele, valem os vetores que ele fecha: **cozinha cria convite de `diretoria` via API e escala privilégio**, INSERT aberto em `restaurantes`, trilha de auditoria adulterável. *Como verificar (1 min, SQL Editor):*
```sql
select polname from pg_policies where tablename = 'convites';
-- Esperado: conv_sel_v4, conv_ins_v4, conv_del_v4. Se aparecer "conv_insert" (antiga), RODAR migration4.
```
*Atenção ao rodar:* `aceitar_convite` do migration4 referencia `perfis.ativo` e `restaurantes.max_usuarios` — confirme que essas colunas existem no schema real, senão a RPC quebra no primeiro convite (`alter table perfis add column if not exists ativo boolean default true;` etc.).

**[P1] Conta órfã no cadastro por convite** (`AuthContext.usarConvite`): o `signUp` acontece **antes** de validar o token. Token inválido/expirado → a conta Auth já foi criada sem perfil; o e-mail fica "já registrado" e a pessoa cai em "Cadastro incompleto" para sempre (só o admin do Supabase limpa). *Correção:* validar antes, com RPC de leitura:
```sql
create or replace function convite_valido(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from convites where token = p_token and usado = false and expira_em > now());
$$;
```
```js
// usarConvite — ANTES do signUp:
const { data: valido } = await supabase.rpc('convite_valido', { p_token: token });
if (!valido) return 'Código de convite inválido ou expirado.';
```
Esforço: Baixo.

**[P1] `xlsx` 0.18.5 com vulnerabilidade HIGH sem fix no npm** (Prototype Pollution GHSA-4r6h-8v6p-xvw6 + ReDoS). O vetor é real: o app **convida o usuário a importar planilhas** — um arquivo malicioso explora exatamente o `XLSX.read`. O SheetJS ≥0.20 (corrigido) só existe no registry deles. *Correção:*
```bash
npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```
(API compatível.) E `npm audit fix` para o dompurify (moderate, via jspdf). Esforço: Baixo.

**[P2] Confirmação de e-mail desligada** (necessária para o onboarding com sessão imediata, eu sei) tem um efeito colateral: qualquer um cadastra restaurante com **e-mail de terceiro**; o dono real do e-mail pode depois usar "esqueci a senha" e assumir a conta — e vice-versa, o e-mail fica queimado. *Mitigação sem religar a confirmação:* enviar e-mail de boas-vindas (o dono real percebe) e/ou exigir confirmação apenas para o fluxo "novo restaurante" (o de convite pode ficar imediato). Esforço: Médio.

**[P2] Sem MFA para diretoria.** Supabase Auth tem TOTP nativo. A conta de diretoria apaga tudo (zona de perigo) com senha de 6 caracteres. *Correção:* mínimo 8 caracteres já ajuda (`Login.jsx`: `senha.length < 8`) e MFA opcional em Config→Sistema. Esforço: Baixo/Médio.

**[P3] `window.open(url, '_blank')` sem `noopener`** (Pagamento.jsx:33,39) — reverse tabnabbing; alvos hoje são confiáveis (Stripe/WhatsApp), mas o fix é grátis: `window.open(url, '_blank', 'noopener,noreferrer')`.

**[P3] Dados de negócio inteiros em localStorage sem criptografia** num tablet compartilhado + token de sessão idem. Inerente ao offline-first; documentar como premissa ("tablet é dispositivo confiável da cozinha") e orientar bloqueio de tela.

**[P3] E-mail do super-admin hardcoded** no client E nas policies. Trocar de e-mail = SQL + redeploy. Aceitável para 1 operador; centralize num único lugar se crescer.

**[P3] Sem CSP.** GitHub Pages não permite headers; dá para usar `<meta http-equiv="Content-Security-Policy">` restringindo `connect-src` ao Supabase + Stripe. Esforço: Baixo (testar bem — SW e Stripe.js).

## 4. Performance — 68/100

- **[P1] Logo de 1,8 MB precacheada em todo aparelho.** `logo-aurum.png` (1254×1254) domina os 3,9 MB de precache do SW e é baixada no primeiro acesso de cada dispositivo (rede de cozinha ≠ fibra). *Correção:* reescalar para 512px/WebP (~60 KB), regenerar. Maior ganho por esforço de toda a auditoria. Esforço: Baixo.
- **[P2] Bundle principal 694 KB (186 KB gzip) sem code-splitting de rotas.** O xlsx já é lazy (chunk separado ✓), mas jsPDF+autotable e todas as 16 páginas vão juntas. *Correção:* `React.lazy` nas rotas pesadas (Relatorio, Configuracoes, Admin) + `await import('jspdf')` no handler de PDF. Esforço: Médio.
- **[P2] Hidratação busca TODOS os `registros` da história** (`select * ... eq deleted false`) sem janela nem paginação. Com 1 ano de operação (~10–30 mil registros) o boot fica lento, o localStorage estoura a cota (5 MB) e o `cacheSet` reserializa o array inteiro a cada lançamento. *Correção incremental:* buscar por janela (`gte('ts', Date.now() - 120d)`) mantendo o resto sob demanda no Histórico/Relatório; a auditoria já é capada em 2.000 no estado — capar também na busca (`limit`). Esforço: Médio. (IndexedDB só quando doer.)
- **[P3]** Índice composto recomendado no banco: `create index if not exists idx_reg_rest_tipo on registros (restaurante_id, deleted, tipo, ts);`
- Pontos bons: debounce no autoMinMax, `useMemo` nas listas ordenadas, gráficos SVG puros sem lib, realtime com 1 canal por restaurante.

## 5. UX — 82/100

**Fortes:** GuideTour com progresso do turno; desfazer em toda remoção; badge offline/pendências; confirmações com linguagem de cozinha ("Produzir assim mesmo?"); erros do Supabase traduzidos; autocomplete próprio (o datalist nativo era ilegível no Android); hub Registrar reduzindo a nav para 5 itens.

**Achados:**
- **[P1] Duplo clique em "Produzir" registra produção DUPLA.** `handleProduzir` não desabilita o botão. Pior: após o 1º clique, `setQuantidade('')` faz o 2º clique cair no fallback `qtdFinal = rendimentoBase` — ou seja, o 2º registro passa na validação com a quantidade base da receita. Num tablet com toque duplo acidental isso é questão de tempo. *Correção:*
```jsx
const [salvando, setSalvando] = useState(false);
const handleProduzir = async () => {
  if (salvando) return;
  setSalvando(true);
  try { /* …fluxo atual… */ } finally { setSalvando(false); }
};
// no botão: disabled={salvando}
```
E o fallback silencioso para `rendimentoBase` merece revisão à parte: registrar quantidade que o usuário não digitou é surpresa; melhor exigir a quantidade explícita. Esforço: Baixo.
- **[P2] Tela de Pagamento mostra plano "Básico" fixo** — não lê estado real de assinatura (não existe campo `plano`), e promete "até 10 usuários" no Pro enquanto o limite implementado é 3 fixo. Sem webhook do Stripe, pagar não muda nada automaticamente. Enquanto o live mode não chega, deixe explícito: "ativação manual em até X horas após o pagamento". Esforço: Baixo (texto) / Alto (webhook de verdade — precisa de função serverless, GitHub Pages não roda backend).
- **[P3]** Sem toggle "mostrar senha" no Login; teclado numérico (`inputMode="decimal"`) vale conferir em todos os campos de quantidade.

## 6. UI — 80/100

Consistente: paleta navy/gold/beige aplicada com disciplina, cards arredondados, estados disabled/active nos botões, modais padronizados (z-index corrigido, overlay-scroll). Pontos menores: mistura de emoji + ícones SVG como linguagem visual (aceitável no domínio, mas padronizar por contexto); alguns textos `text-xs` demais para cozinha com pouca luz — ver contraste abaixo.

## 7. Acessibilidade (WCAG 2.2) — 66/100

- **[P1] `user-scalable=no, maximum-scale=1.0`** no index.html **bloqueia zoom por pinça** — falha direta do critério 1.4.4 (Resize Text, nível AA) e péssimo para funcionários 45+ em cozinha. iOS já ignora; Android obedece. *Correção:* `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`. O "gelinho" de double-tap-zoom se resolve com `touch-action: manipulation` no CSS, não matando o zoom. Esforço: Baixo.
- **[P2] Contraste:** `text-white/60` sobre `#1B2A41` ≈ 3,9:1 — reprova AA para texto pequeno (mín. 4,5:1). Subir para `white/75`+ nos textos informativos sobre navy. Vale varredura nos `text-gray-400/500` sobre beige também.
- **[P3]** Inputs do Login usam placeholder como label (têm `aria-label` ✓, mas label visível é melhor — placeholder some ao digitar); mensagens de erro não têm `role="alert"` no `<Msg>` (toasts já têm aria-live ✓).
- Bons: foco visível global, dialogs com role/aria-modal, alvos 44px, switches com `role="switch"`.

## 8. Banco de dados — 72/100

- Modelagem intencionalmente desnormalizada (JSONB) — correta para o padrão de sync escolhido; integridade referencial fica no app (produtos são soft-deleted, então ids em registros antigos nunca quebram ✓).
- `registros_tipo_check` e `convites_cargo_check` no migration4 ✓.
- **[P2]** Falta índice composto (ver §4) — hoje toda query filtra `restaurante_id` + `deleted`.
- **[P2]** Concorrência de catálogos sem versão (ver §1).
- **[P3]** `sessoes` sem policy de DELETE (usuário não limpa a própria linha; inofensivo, mas incompleto). `registros.ts` como número epoch + `dados.data` string — timezone tratado no app (`isoLocal`), ok.
- **[Verificar]** Colunas `perfis.ativo` e `restaurantes.max_usuarios` precisam existir para o `aceitar_convite` v4 (ver §3-P0).

## 9. APIs (Supabase) — 75/100

- Acesso direto via PostgREST com RLS — padrão correto para essa stack; sem endpoint próprio, não há superfície REST a versionar.
- Idempotência do outbox bem resolvida: retry de insert usa `upsert` (replay seguro), delete é soft e idempotente ✓.
- **[P3]** `flush` processa a fila item a item sequencialmente sem limite de tentativas — um item eternamente inválido (ex.: payload que viola constraint) fica preso para sempre e segura o badge. *Correção:* contador `_tentativas` no item; após N falhas, mover para uma "fila morta" visível em Config. Esforço: Baixo.
- Rate limiting: fica com o GoTrue (login) e PostgREST — sem controle extra no client; aceitável.

## 10. Automações e CI/CD — 60/100

- Deploy: Actions com `npm test` → build → Pages, secrets injetados, 404.html SPA ✓. Reproduzível ✓.
- **Faltam no pipeline:** lint (41 erros invisíveis), `npm audit --audit-level=high` (pegaria o xlsx), verificação de build da PWA, E2E mínimo. *Sugestão de workflow:* test → lint → audit → build → deploy, cada um bloqueante. Esforço: Baixo (depois de zerar o lint).
- **[P3]** Sem Dependabot/Renovate (`.github/dependabot.yml` de 10 linhas resolve).
- **[P4]** Automação operacional que falta de verdade: backup automático agendado dos dados do Supabase (hoje o backup é botão manual no app; o plano free do Supabase não tem PITR). Um workflow semanal com `pg_dump` via connection string em secret cobre o desastre real ("apaguei tudo sem querer e o outbox sincronizou").

## 11. Testes — 55/100

- 32 testes unitários passando, mas **1 arquivo só**, cobrindo apenas `utils/`. O código mais arriscado — hidratação/outbox/merge do AppContext, RLS, fluxos de auth — tem **zero** teste.
- *Prioridade de novos testes:* (1) `cache.js`/outbox puro (fácil, alto valor); (2) extrair `flush` e testar replays/falhas; (3) Playwright smoke: login → registrar entrada → conferir Dashboard (1 fluxo já pega 80% das regressões de integração); (4) teste de RLS com dois usuários de restaurantes diferentes via service key em banco de teste. Esforço: Médio.

## 12. Observabilidade — 40/100

A nota mais baixa da auditoria. Hoje: `console.warn` + trilha de auditoria de negócio (boa!) + badge de pendências. **Não existe nenhum canal que avise quando um erro acontece no tablet do cliente** — você descobre por WhatsApp. Com clientes pagantes isso vira SLA cego. *Correção de menor esforço:* Sentry free tier (5k eventos/mês) — `Sentry.init` + ErrorBoundary, ~20 linhas, e dá release tracking de graça. Esforço: Baixo. **É a melhoria nº 1 antes de vender para o 2º cliente.**

## 13. Dependências — 60/100

| Item | Situação | Ação |
|---|---|---|
| `xlsx` 0.18.5 | **HIGH sem fix no npm** | Trocar pela dist oficial do SheetJS (§3) |
| `dompurify` (via jspdf) | moderate | `npm audit fix` |
| React 19, Vite 8, supabase-js 2 | atuais ✓ | — |
| `tailwindcss` 3.4 → 4.x | major disponível | **Não** migrar agora (breaking, zero ganho funcional) |
| `stripe` (server SDK) em devDependencies | usado só p/ criar o payment link via script | ok, mas documentar por quê está ali |

## 14. SEO — n/a

App interno atrás de login; sem necessidade real. Higiene barata: `<meta name="description" content="Controle de estoque e produção para cozinhas profissionais">` (melhora o unfurl de link no WhatsApp — que é como o app é vendido!). Um dia, uma landing page pública separada do app.

## 15–16. Responsividade e Mobile — 75/100

- Layout testado em 768px (tablet) e funciona bem em celular; `lg:max-w-4xl` evita linhas quilométricas em desktop ✓.
- **[P2] `orientation: 'portrait'` no manifest trava a PWA instalada em retrato.** Tablet em suporte de bancada fica muitas vezes em **paisagem**; o app instalado (e o APK gerado dele) vai abrir de lado. *Correção:* `orientation: 'any'` (o layout já é fluido). Esforço: Baixo — regenerar APK depois.
- **[P3]** Sem `env(safe-area-inset-*)` para iPhone com notch em standalone (header pode colar na status bar). Baixa prioridade (público-alvo é Android/tablet).
- Zoom bloqueado: ver §7 (mesma correção).

## 17. Conformidade (LGPD) — 55/100

Dados pessoais tratados: nomes de funcionários, e-mails, trilha de auditoria com quem-fez-o-quê. Multi-tenant → Aurum é operadora dos dados dos restaurantes clientes.
- **[P2]** Não há política de privacidade/termos no cadastro, nem fluxo de **exclusão de conta** (titular tem direito à eliminação — art. 18). O backup JSON exporta dados pessoais em claro (ok como portabilidade, mas avisar).
- *Correção pragmática:* página estática "Privacidade" linkada no Login + processo documentado de exclusão (mesmo que manual via suporte) + cláusula no contrato de assinatura. Esforço: Baixo. Não precisa de DPO nem de juridiquês para esse porte, mas precisa existir **antes de cobrar mensalidade**.

## 18. IA — n/a (não há componentes de IA no app).

## 19. Documentação — 70/100

- `PROMPT_NOVA_CONVERSA.md` é excelente ideia e está 90% correto, mas **desatualizado vs. git log** (para em 15/06; commits até 25/06) e **com alteração não commitada** agora.
- `GUIA_APK_TABLET.md` ✓. `SUPABASE_SETUP.sql` bem comentado ✓.
- **[P2] Falta o essencial para "eu daqui a 6 meses":** README real com (1) ordem exata dos SQLs (schema → SETUP → migration2? → migration4 — hoje há 4 arquivos SQL e nenhum documento diz quais já rodaram e em que ordem!); (2) lista dos secrets do Actions; (3) como criar ambiente de teste. *Este é o mesmo problema que causou o P0 do §3.* Esforço: Baixo.

---

## 21. Auditoria Especializada — Gastronomia e Gestão de Produção — 78/100

*Avaliação como implantação real em restaurante/pizzaria/padaria/dark kitchen.*

### O que está genuinamente certo (e é raro em sistema de estoque)
1. **Apara ≠ Perda com semântica de cozinha real** — apara monitora (vira STG/HAM…), perda abate com motivo. A maioria dos sistemas trata tudo como "quebra" e o rendimento vira ficção.
2. **FC por matéria-prima, não por preparação** — decisão tecnicamente correta: o filé limpo é um só estoque, todas as preparações herdam o FC dele.
3. **Cocção separada de correção**, com campo só quando há receita — evita o erro clássico de aplicar perda de cocção em produto cru.
4. **FEFO com lotes por validade e etiqueta prevista na entrada** — induz a etiquetagem, que é o hábito que as consultorias cobram.
5. **Produção abate/monitora** — reconhece que ninguém vai controlar estoque de orégano, sem por isso perder o registro da receita.
6. **Mín/máx por consumo real (15 dias, opcional por dia da semana)** — melhor que o "mín fixo chutado" universal.
7. **GuideTour espelha o turno real** (Entradas → Aparas → Produção → Saídas) — onboarding operacional, não de software.
8. **Sub-receita funciona implicitamente**: o molho base produzido entra no estoque e outra receita pode abatê-lo como ingrediente. (O planejamento não "explode" a cadeia — planejar 100 parmegianas não diz quanto molho base produzir antes — evolução natural do planejador.)

### Onde a operação real vai esbarrar (em ordem de dor)
1. **[Dor nº 1] Compra e Entrada são dois lançamentos** (M9, adiado). Na prática do recebimento — caminhão na porta, cozinha no fogo — ninguém digita duas vezes. O que acontece em campo: registram só um dos dois, e o rendimento por fornecedor (que depende da compra) morre por falta de dado. **Recomendo tirar o M9 da geladeira antes de vender para fora do Polo**: um botão "→ virou entrada" na compra já resolve 80% sem reescrever o fluxo.
2. **Unidade de compra vs. consumo.** Pizzaria compra farinha em saco de 25 kg, queijo em barra de 3,8 kg, e consome em g. Hoje a unidade da compra é texto livre e não converte. `pesoUnidade`/`unidEmbalagem` cobrem parte; falta a conversão fechada no recebimento. É a primeira parede que um cliente não-Polo encontra no dia 1.
3. ~~Sem custos/CMV~~ — **FORA DE ESCOPO por decisão do dono (03/07/2026):** o app é de produção/estoque (entradas, saídas, cálculo de estoque), não de gestão financeira. Custos/CMV ficam na planilha Ficha Técnica, que é o produto certo para isso.
4. **Alertas passivos.** Lote vencendo aparece no Dashboard — se alguém abrir. Cozinha vive de gatilho: um resumo diário por WhatsApp ("2 lotes vencem hoje; charque abaixo do mín") transformaria o app de consulta em rotina. (Usuário já vetou lista de compras por WhatsApp uma vez — revisitar como resumo do turno, que é outra proposta.)
5. **Contagem física não reconcilia lotes** (LOT-001, conhecido): após inventário que zera um produto, a UI ainda mostra lote vencendo. Para o operador isso lê como "o sistema mente". Mesmo sem resolver a atribuição por lote, esconder lotes de produto zerado por ajuste já elimina a contradição visível.
6. **Inventário sem contagem cega** — a contagem mostrando o saldo teórico induz o contador a "bater o número". Para o porte atual (3 contas, dono presente) é ok; para buffet/indústria seria exigência.
7. **Segurança dos alimentos (temperaturas, POPs)** — fora do escopo por decisão. Correto não inchar este app; **a Aurum já tem o polo-checklist-app** para isso. Oportunidade comercial: vender os dois como suíte, não construir um terceiro.

### Veredito operacional
Para o perfil-alvo (cozinha profissional pequena/média, tablet compartilhado, pouca digitação), o sistema **melhora a operação de verdade** — reduz ruptura, dá rastro de perda e tira a produção do caderno. As duas lacunas que separam "ferramenta do Polo" de "produto vendável" são: **recebimento unificado (M9) e conversão de unidades** (custos/CMV descartado por decisão de escopo).

---

## Relatório final

### Problemas por severidade

| # | Sev | Problema | Esforço |
|---|-----|----------|---------|
| 1 | **P0** | Estado do RLS no banco não confirmado (migration4) — inclui escalada de privilégio via convite | Baixo (verificar+rodar) |
| 2 | **P1** | Duplo clique em Produzir duplica produção (com fallback p/ rendimentoBase) | Baixo |
| 3 | **P1** | Conta Auth órfã quando convite é inválido (signUp antes de validar) | Baixo |
| 4 | **P1** | `xlsx` vulnerável (HIGH) justamente no fluxo de importação | Baixo |
| 5 | **P1** | Zoom bloqueado (`user-scalable=no`) — WCAG 1.4.4 | Baixo |
| 6 | **P1** | Logo 1,8 MB precacheada em todo aparelho | Baixo |
| 7 | P2 | Fetch de registros sem janela → degrada com o tempo | Médio |
| 8 | P2 | Catálogos sem controle de concorrência (last-writer-wins) | Médio |
| 9 | P2 | `orientation: portrait` trava tablet em paisagem | Baixo |
| 10 | P2 | Zero observabilidade de erros em produção | Baixo |
| 11 | P2 | 41 erros de lint fora do CI | Médio |
| 12 | P2 | Confirmação de e-mail off → risco de conta com e-mail alheio | Médio |
| 13 | P2 | Pagamento: plano fixo/limites divergentes/sem webhook | Baixo (texto) / Alto (webhook) |
| 14 | P2 | Configuracoes.jsx 1.729 linhas | Médio |
| 15 | P2 | LGPD: sem política de privacidade nem exclusão de conta | Baixo |
| 16 | P2 | README/ordem dos SQLs não documentada (causa raiz do item 1) | Baixo |
| 17 | P2 | Contraste `white/60` reprova AA | Baixo |
| 18 | P3 | noopener, fila morta do outbox, índice composto, senha 6→8, código morto, dependabot, safe-area | Baixo cada |

### Roadmap sugerido

**Agora (dia 1–2) — segurança e bugs — ✅ APLICADO em 03/07/2026:**
- ✅ (2) Duplo clique em Produzir — trava `salvando` + botão desabilitado (`Producao.jsx`)
- ✅ (3) Conta órfã no convite — validação antes do signUp (`AuthContext.jsx`) + **`migration5_convite_valido.sql` (RODAR no Supabase)**
- ✅ (4) `xlsx` → SheetJS 0.20.3 oficial + `npm audit fix` → **0 vulnerabilidades**
- ✅ (5) Zoom liberado (viewport) + `touch-action: manipulation` no CSS
- ✅ (6) Logo 1,8 MB → 366 KB (512px)
- ✅ (9) `orientation: 'any'` no manifest (tablet em paisagem)
- ✅ noopener nos `window.open` (Pagamento.jsx)
- ⬜ (1) **PENDENTE — ação do usuário:** verificar/rodar `migration4_hardening.sql` e agora também `migration5_convite_valido.sql` no Supabase SQL Editor

**30 dias — confiabilidade para vender — ✅ APLICADO em 03/07/2026 (exceto 2 itens):**
- ✅ (11) Lint **zerado** (46 → 0: código morto removido — inclusive ModalFicha inteiro; deps de hooks corrigidas com memoização real; padrões deliberados com disable documentado) + **CI completo**: test → lint → `npm audit --audit-level=high` → build, todos bloqueantes
- ✅ (16) README reescrito: ordem dos 5 SQLs com status, query de verificação, secrets, arquitetura
- ✅ (15) LGPD básico: modal "Privacidade e proteção de dados" no Login (o que guardamos, direitos, exclusão em 15 dias)
- ✅ (13a) Pagamento: texto honesto de ativação manual em até 24h úteis
- ✅ (17) Contraste: `text-white/40–60` → `/70–80` em todas as telas (AA)
- ✅ senha mínima 6 → 8 caracteres (Login, convite, NovaSenha) + Dependabot semanal + `migration6_indices.sql` (índice composto de registros — **RODAR no Supabase**)
- ⬜ (10) Sentry — **precisa de conta do usuário** (free tier); ~20 linhas depois do DSN
- ⬜ (7) Janela de fetch — **adiado com razão técnica**: `calcEstoquePuro` precisa do histórico COMPLETO (estoque = Σ movimentos desde o início); janela exige antes um design de snapshot (ex.: contagem física como base de corte). Não aplicar ingenuamente.

**60 dias — produto vendável fora do Polo:** M9 recebimento unificado ("compra → virou entrada"), conversão de unidades de compra, versão nos catálogos (8), quebra do Configuracoes.jsx (14), Playwright smoke.

**90 dias — diferenciação e receita:** ~~módulo de custos/CMV~~ (**descartado — fora de escopo por decisão do dono**), resumo diário do turno (push/WhatsApp), webhook Stripe com função serverless (Supabase Edge Function — o Pages não roda backend), reconciliação lote×inventário.

### Impacto esperado
- Bloco "agora": elimina os 2 vetores de corrupção de dados (produção dupla, escalada RLS) e o maior custo de rede; risco residual cai de médio para baixo.
- Bloco 30d: você fica **sabendo** quando algo quebra no cliente — pré-requisito de mensalidade.
- Blocos 60/90d: removem as objeções de venda identificadas na auditoria gastronômica.
