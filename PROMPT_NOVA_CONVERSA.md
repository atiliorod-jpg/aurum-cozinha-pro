# Aurum Cozinha Pro — Prompt para nova conversa

## O que é este projeto

App PWA para controle de estoque de cozinha industrial (Polo Beer / Aurum Serviços Gastronômicos).
- **Tech**: React 19 + Vite + Tailwind CSS v3, offline-first (vite-plugin-pwa), Supabase (multi-tenant, RLS, realtime)
- **Pasta local**: `C:\Users\atili\Downloads\Code\polo-estoque` (só o nome da pasta ainda é "polo-estoque"; o app/repo é `aurum-cozinha-pro`)
- **Branch/Deploy**: push direto na branch **`main`** → GitHub Actions builda e publica em GitHub Pages (`https://atiliorod-jpg.github.io/aurum-cozinha-pro/`). O workflow injeta os secrets Supabase/Stripe e define `VITE_BASE=/aurum-cozinha-pro/`. **Não há fluxo de PR** (projeto solo). O push para `main` pode ser bloqueado pelo classificador auto-mode — basta repetir com justificativa.
- **Repo único**: `origin` → `https://github.com/atiliorod-jpg/aurum-cozinha-pro.git`. Repo antigo `polo-estoque` foi DELETADO.
- **Super-admin**: email `atiliopinpolho@gmail.com` (campo `sessao.eSuperAdmin`); rota `/admin`, sem senha extra (usa o login normal). **Conta já criada no Supabase Auth (15/06/2026).**
- **Preview local**: `npm run dev` na porta 5173 (exige login Supabase — não dá para passar da tela de login no preview sem credenciais)

---

## Arquitetura geral

### Estado global (`src/store/AppContext.jsx`)
- Catálogos (documentos JSONB no Supabase): `produtos`, `categorias`, `pessoas`, `destinos`, `fichas`, `producoes`, `locais`, `listaManual`, `prefs`
- Registros operacionais (tabela `registros`): `compras`, `entradas`, `saidas`, `aparas`, `desperdicio`, `ajustes`, `auditoria`
- **Outbox pattern**: offline → `outboxAdd` → sync quando volta internet
- **`aplicaReg`**: merge server data + local-only items (race condition fix)
- **`calcEstoquePuro`**: estoque calculado (entradas − saídas − desperdício − aparas + ajustes)
- **`calcLotes`**: rastreio FEFO (first expired, first out) com validades por lote
- **`prefs.autoMinMax`**: recalcula mín/máx automaticamente pela média de saídas dos últimos 15 dias
- **`logAudit`**: grava trilha de auditoria (guard `(prev || []).slice(-1999)` — protegido contra null)
- **`soLeitura`**: `!!impersonando && !impersonando.podeMexer` — bloqueia toda escrita em modo suporte somente-leitura

### Preferências (`prefs`)
- **Aparelho** (não sincronizam): `responsavel`, `turno`, `destino`
- **Restaurante** (sobem para nuvem): `autoMinMax`, `diasMin`, `diasMax`, `guia`, `suporteAtivo`, `suportePermissao`
- `guia: true` por padrão — mostra o painel "Fluxo do turno" em todas as telas
- `suporteAtivo`: timestamp Unix (Date.now() + 24h) quando o cliente autoriza suporte
- `suportePermissao`: `'ver'` | `'mexer'` — o que o cliente permitiu ao super-admin fazer

### Rodada 18/07/2026 — Pagamento por Pix manual + banner de vencimento + feedback
- **Decisão do dono:** NÃO usar Stripe agora; **Pix manual** é mais simples. (Stripe fica de backlog — código do webhook/Fase 2 já commitado antes, dormindo.)
- **Planos** (`assinatura.js`): Mensal R$149, Semestral −10% (R$804,60 / R$134,10/mês), Anual −20% (R$1.430,40 / R$119,20/mês). `PLANOS`, `precoPlano`, `precoMensalEquivalente`, `economiaPlano`.
- **Pix** (`utils/pix.js`): gera o BR Code (copia e cola) + QR com CRC16-CCITT correto (testado, 29B1). Chave via env `VITE_PIX_CHAVE`/`VITE_PIX_NOME`/`VITE_PIX_CIDADE` (recomendado chave ALEATÓRIA, não CPF — fica público). Sem chave → fallback WhatsApp.
- **Tela Assinatura** refeita: 3 planos selecionáveis, seção Pix (chave copiar + QR + valor + copia-e-cola), aviso "pague com 24h de antecedência", botão "Já paguei" que chama `avisar_pagamento(plano)` + abre WhatsApp p/ comprovante.
- **migration13 (RODADO em produção 18/07):** colunas `aviso_pagamento_em/plano` + RPC `avisar_pagamento` (SECURITY DEFINER, funciona mesmo vencido/bloqueado — é quando o cliente paga) + `ativar_assinatura` agora LIMPA o aviso + `limpar_aviso_pagamento` (super-admin).
- **Admin:** botões de plano (Mensal +30 / Semestral +180 / Anual +365) além da cortesia avulsa; badge "💰 avisou pagamento — plano X em data" com "dispensar"; ativar limpa o aviso.
- **Banner de vencimento** (`components/AvisoVencimento.jsx`): faixa no canto inferior-direito quando faltam ≤3 dias (teste ou assinatura), com X que dispensa POR DIA (volta no dia seguinte com menos dias), não cobre a navbar; link p/ pagamento.
- **Canal de feedback** (`components/BotaoFeedback.jsx`): botão 💬 no cabeçalho (todos os cargos) → modal Bug/Sugestão com guia (onde/o que esperava/o que aconteceu/como repetir/print) → monta mensagem organizada no WhatsApp com contexto (restaurante/cargo/navegador).
- 64 testes, lint 0, build ok; smoke no preview (planos, 24h, feedback) sem erros.

### Rodada 17/07/2026 (parte 3) — permissões por função + M1/O2/P1 + pentest real
- **Matriz de permissões (pedido do dono):** diretoria (criador = diretoria automática) configura em Config→Acessos o que cozinha/gerência podem (ver relatório, configurar, remover lançamentos, inventário, produtos, auditoria). `src/utils/permissoes.js` (`pode()`, `CAPACIDADES`, `PERMISSOES_PADRAO`), guardado em `prefs.permissoes`, defaults = comportamento antigo. Gateia rotas (App.jsx), NavBar, Layout, Config (abas + links), Historico (remover), Producao. **Trava de UI** (barreiras duras seguem no RLS por cargo)
- **M1 (migration11):** `conv_ins_v11`/`conv_del_v11` exigem `restaurante_pode_escrever` — conta bloqueada/vencida não gera/revoga convite; client `criarConvite` também checa `statusAssinatura`
- **O2 (fila morta):** `src/utils/outbox.js` (`registrarFalha`/`ressuscitar`, MAX 8); flush não retenta itens mortos; `outboxCount` só conta vivos; card em Config→Sistema com "Tentar de novo"/"Descartar"; evento `forcar-sync`
- **P1 (migration11):** RPCs `desativar_usuario`/`reativar_usuario` (gerência+; não a si mesmo; não a última diretoria; respeita vagas ao reativar); UI em Config→Acessos (desativar + seção colapsável de inativos); vagas contam só ativos
- **Miudezas:** P2 (comentário de paridade TESTE_DIAS↔SQL + testes de borda 7 dias), P3 (toggle mostrar senha nos 3 campos do Login), M2 (aviso de MFA no Admin), M3 (aviso "use e-mail que só você controla" no cadastro), M4 (avisos "não reaplicar" no topo de schema.sql/SUPABASE_SETUP.sql), seed "Empanado (porção)"
- **Pentest REAL rodado ao vivo (17/07):** `scripts/pentest-adversarial.mjs` 13/13, `pentest-convite.mjs` OK, `pentest-m11.mjs` 9/9 — S1/S2/S3/S4, cross-tenant, convite, M1, P1 todos PASS; 12 contas `pentest.*` apagadas via service role (só super-admin restou). **NOTA:** o prompt do dono alegava "13/13 já rodado" mas os scripts nem existiam quando escrito — agora existem e RODARAM de verdade
- **NÃO feito (recusas confirmadas):** Sentry sem DSN (stub adiado), staging separado, Playwright E2E, backup pg_dump, LGPD doc formal — documentação/infra de baixo ROI com 0 usuários reais; ficam no backlog
- 57/57 testes, lint 0, build ok; migration11 rodada em produção

### Rodada 17/07/2026 (parte 2) — auditoria de SEGURANÇA (migration10)
- **S1 (P0)**: INSERT direto em `perfis` FECHADO — a policy `perfis_ins_v4` (`id = auth.uid()`) deixava qualquer conta autenticada se inserir no restaurante de outro cliente como diretoria via API; agora perfis só nascem pelas RPCs
- **S2 (P1)**: notas internas do admin saíram de `restaurantes` (o dono lia via `?select=notas_admin`) para tabela `admin_notas` sem policy de cliente; leitura via RPC `notas_admin_todas()`, escrita via `salvar_notas_admin` (ambas só super-admin); coluna antiga DROPADA (dados migrados)
- **S3 (P1)**: corte de plano/bloqueio agora vale no BANCO — `restaurante_pode_escrever(rid)` nas policies de escrita de `registros`/`documentos` (leitura livre; escrita exige não-bloqueado E teste 7d OU assinatura vigente); suporte continua condicionado a `suporte_pode_editar` (m7)
- **S4 (P2)**: token de convite 8→16 chars hex (`gen_random_bytes(8)`); tokens antigos pendentes valem até expirar
- **S5**: fallback de insert direto removido do `criarPrimeiroAdmin` (era código morto pós-m4 e reabriria spam se alguém reaplicasse schema antigo); seed renomeado ("Empanado de filé/frango (porção)" no lugar de "parmegiana")
- **NÃO feito por decisão consciente** (mantidas as recusas do prompt): hidratação 120d, trocar setTimeout(800), parmegiana nos Termos, impersonar sem autorização, Sentry sem DSN, CMV, default max_usuarios>3

### Rodada 17/07/2026 — auditoria "Bloco de Notas" (admin rico, VIP, convites, onboarding) + E2E em produção
- **migration9_admin_convites.sql RODADO em produção 17/07**: `aceitar_convite` v9 (conta que já tem restaurante NÃO queima o token — erro claro antes de consumir), RPC `definir_max_usuarios` (1–5, só super-admin), coluna `bloqueado` + RPC `definir_bloqueio`, RPC `usuarios_do_restaurante` (lista com e-mails via auth.users, só super-admin), coluna `notas_admin` + RPC `salvar_notas_admin`
- **Admin.jsx reescrito**: badge de status comercial (🧪 teste/💳 assinatura/⛔ vencido/🔒 bloqueado), grid com datas + 👥 X/max + suporte, usuários com e-mail (fallback se RPC faltar), liberar dias (+7/+14/+30/+90 e campo livre 1–400), seletor VIP max_usuarios 3/4/5, bloquear/desbloquear com confirmação, notas internas por restaurante
- **Limite de usuários dinâmico**: `sessao.maxUsuarios` (default 3) — guard do `criarConvite` conta usuários + convites pendentes; contador "X/max · convites — restam N vagas" em Config→Acessos. Marketing continua "até 3 usuários"; VIP 4–5 é concessão manual por restaurante
- **Convites melhores**: botão copiar link (`?convite=TOKEN` deep-link pré-preenche o modo convite no Login) + compartilhar no WhatsApp com texto pronto
- **Onboarding**: cadastro mostra "✨ 7 dias grátis…"; toast de boas-vindas pós-cadastro/convite (sessionStorage `aurum_boasvindas`); tela de bloqueio distingue vencido × 🔒 suspenso (conta bloqueada não vê botão de assinar)
- **Code-split**: React.lazy em Relatorio/Configuracoes/Admin + Suspense com Splash
- **E2E EM PRODUÇÃO EXECUTADO E LIMPO 17/07**: criou Restaurante A + convite aceito (B, cozinha) + Restaurante C isolado; validou faixa de teste, vagas, deep-link, isolamento multi-tenant, bloqueio (C suspenso), assinatura (A sem faixa), token inválido e token reusado barrados sem conta órfã. Depois **tudo apagado via SQL** — só `atiliopinpolho@gmail.com` no banco (0 restaurantes)
- **Não existe mais login de teste** — qualquer conta `teste-*` citada em versões antigas deste arquivo foi apagada

### Rodada 11/07/2026 (parte 2) — Camada 2 pesada + refinamentos do dono
- **Termos**: "Modo de uso" reescrito profissional (itens porcionados/semiacabados, sem exemplos coloquiais); **Privacidade** reescrita formal (dados tratados/finalidade/segurança/direitos, exclusão em **4 dias úteis**, reflete suporte ver OU editar)
- **Etiquetas**: seletor de **Responsável** no modal de impressão (ResponsavelSelect da equipe; sai no RESP. de todas as etiquetas; QR regenera ao trocar)
- **T1.6 match FC/fornecedor**: helper `nomesCasam()` (igual OU prefixo/sufixo em fronteira de palavra — fim do falso positivo "sal"×"salmão"); compras novas gravam `produtoId` quando o item digitado é igual a um produto ativo (match por id tem prioridade absoluta)
- **T1.3 produção incompleta**: `producoesIncompletas()` detecta saída interna órfã (ingrediente baixado sem entrada do produto, carência de 10min); card vermelho no Dashboard + a saída órfã aparece no Histórico como "PRODUÇÃO INCOMPLETA" para remover/desfazer
- **T1.4 anti-sobrescrita de catálogos (migration8 RODADO em produção 11/07)**: coluna `versao` em documentos + RPC `salvar_documento` (SECURITY INVOKER, RLS normal); AppContext grava versionado (versoesRef via hidratação/realtime), conflito → aplica a versão vigente + toast explicativo; replay offline usa p_versao=-1 (força com bump); fallback total para upsert se a migração faltar
- **T1.5 (janela de hidratação) segue ADIADO**: exige design de snapshot — calcEstoquePuro precisa do histórico completo
- 45/45 testes, lint 0, build ok; verificado ao vivo (termos, privacidade, responsável na etiqueta trocando o RESP.)

### Rodada 11/07/2026 — auditoria "10-10" aplicada (Camada 1 + básicos da 2)
- **DOMÍNIO ESCLARECIDO pelo dono:** o app é de PRODUÇÃO INTERNA/porcionamento (empanado = porção; molho = outro semiacabado; NUNCA prato montado armazenado). Demo reescrita nesse modelo (Empanado de Filé + molho separado; saídas = Cozinha principal/Polo Central; sem "delivery")
- **Login:** modal "Termos de uso e modo de uso" (para quem é / o que não é / exemplo empanado), link ao lado da Privacidade, subtítulo "Produção interna e estoque de cozinha profissional", checkbox obrigatório no cadastro de restaurante (não trava demo), role="alert" nas mensagens
- **GuideTour reescrito:** essenciais = [Produção/entrada, Saídas] (produção CONTA como entrada do dia); Etiquetas e Aparas são chips opcionais que não travam o 100%; copy de porcionamento; "Essenciais do turno ok"
- **Produção:** quantidade EXPLÍCITA obrigatória (sem fallback silencioso pro rendimentoBase — era bug); botão "Usar rendimento da ficha" preenche como sugestão
- **Lotes fantasma corrigido:** `lotesVencendo()` em utils/lotes.js reconcilia com o estoque calculado — produto zerado por contagem física não gera mais alerta de lote vencendo (Dashboard usa; 2 testes novos)
- **Ajuda Mín/Máx:** `<details>` "Como funciona" (usa saídas ~15d, gate de 15 dias explicado, cobertura/reposição — sem "meta de compra") + "Quando ligar" no dia da semana
- **Backup restaura de verdade:** importarBackup soft-deleta os registros atuais antes de subir os do backup (sem zumbis); auditoria não sobe (imutável no RLS — upsert entupia o outbox)
- **Anti-duplo-toque em TODOS os lançamentos:** Entradas, Saídas, Compras, Inventário, Aparas/Perdas (padrão `salvando` da Produção)
- **Etiquetas:** zero menção a concorrente no código; código #ID REMOVIDO de vez (decisão do dono — era só visual); QR agora trava o botão Imprimir até os QRs ficarem prontos ("⏳ Gerando QR…")
- **Camada 2 pesada ADIADA por decisão do dono (próxima rodada):** produção atômica, versão/anti-LWW nos catálogos, janela de hidratação (PERIGOSO sem design — estoque precisa do histórico completo), refino do match FC/fornecedor
- 39/39 testes, lint 0, build ok; verificado ao vivo (termos, demo nova, guia 2/2 sem apara, produção sem qtd não grava, zero chamadas Supabase na demo)

### Rodada 07/07/2026 (tarde) — etiqueta profissional, demo, plano único, suporte-edição
- **Etiqueta profissional de validade**: MANIPULAÇÃO/ABERTURA + hora da impressão, VALIDADE com hora, VAL. ORIGINAL (opcional), MARCA/FORN + SIF (cadastro do produto), medida por item, rodapé com estabelecimento (prefs.estabelecimento: CNPJ/CEP/endereço/cidade em Config→Sistema→Etiquetas), #ID de rastreio por etiqueta, QR legível linha a linha (Chave: valor)
- **Guia de impressoras**: aba 🖨️ Impressora na página Etiquetas (4 cenários com passo a passo + links; botão salvar em PDF via print)
- **Modo DEMO 100% local**: botão "🎬 Ver demonstração" no Login → rid='demo', dados de `src/data/demo.js`, ZERO chamadas Supabase (verificado), reset ao sair; banner dourado fixo
- **Plano único R$149 + teste 7 dias**: sem plano grátis; trial = created_at+7d; faixa de contagem; bloqueio visual ao vencer (só /pagamento acessível); ativação manual no /admin (botão +30 dias → RPC ativar_assinatura)
- **Suporte com edição real**: cliente escolhe 👁️ ver ou ✏️ editar (24h); policies v7 liberam escrita do super-admin SÓ com autorização 'mexer' vigente; banner vermelho ao editar; suporte nunca altera a linha prefs do cliente
- **migration7_suporte_assinatura.sql RODADO em produção 07/07**; **contas de teste APAGADAS** (só atiliopinpolho@gmail.com resta; banco zerado)
- **Excel do relatório**: 8 abas com Leia-me + autofiltros; planilha modelo de produtos ganhou colunas Marca/SIF
- Removidos: jspdf, jspdf-autotable (nunca usados), deploy.ps1 (obsoleto)

### Módulo de Etiquetas (07/07/2026 — Fase 1, impressão via navegador)
- **Motor:** `components/EtiquetaPrint.jsx` montado na raiz do App; aberto via `abrirEtiquetas(itens)` do `useUI()` (estado central no UIContext, padrão do confirm)
- **Página `/etiquetas`** (card no hub Registrar): aba "📦 Do estoque" (imprime qualquer produto a qualquer momento) + aba "📝 Avulsas" (catálogo `etiquetasAvulsas` no AppContext — itens fora do estoque, ex. "Leite aberto", com data de fabricação OU abertura + dias de validade)
- **Gatilhos automáticos:** após salvar Entrada e Produção o modal abre pré-preenchido (opcional, dá pra pular); Histórico tem botão 🏷️ de reimpressão em entradas/produções
- **Impressão:** diálogo nativo do navegador (`window.print()`); CSS de isolamento via `body.imprimindo-etiqueta` + hack de visibility em index.css; `@page` dinâmico com o tamanho configurado (padrão 60×40mm)
- **Config → Sistema → 🏷️ Etiquetas:** tamanho em mm, toggle QR (desligado por padrão, payload `restaurante|nome|fabricacao|validade` via lib `qrcode`), checkboxes de campos — em `prefs.etiquetaConfig`
- **Cálculo:** `utils/etiquetas.js` (`montarCamposEtiqueta`, testado) — validade pronta de registro real tem prioridade; senão calcula por prazos do produto/diasValidade
- **FASE 2 (futura, decisão de hardware pendente):** impressão silenciosa sem diálogo exige agente local (Zebra Browser Print/QZ Tray) — é como os sistemas profissionais de etiquetagem fazem (integração presa a um modelo de impressora). Recomendação de impressora: transferência térmica com ribbon de resina (Zebra ZD220 TT / Argox OS-214 Plus / Elgin L42 Pro) — térmica direta desbota em congelador

### Fluxo de produção
- `producoes[]`: receitas com `produtoFinalId`, `rendimentoBase`, `armazenamento`, `ingredientes[]`
- Ingrediente com `abate: true` → produto com estoque controlado (dá baixa)
- Ingrediente com `abate: false` → monitorado/rastreado apenas (não dá baixa no estoque)
- Registrar produção (em `/registrar`) → cria 1 `entrada` (produto final) + 1 `saida` vinculada (`producaoId`)

---

## Páginas e rotas

| Rota | Página | Cargo mínimo |
|------|--------|-------------|
| `/` | Dashboard (Início) | cozinha |
| `/entradas` | Entrada de Mercadoria | cozinha |
| `/saidas` | Saídas para Restaurantes | cozinha |
| `/aparas` | Aparas & Perdas | cozinha |
| `/etiquetas` | Etiquetas (catálogo + avulsas) | cozinha |
| `/registrar` | Produção (receitas) | cozinha |
| `/compras` | Compras / Recebimento | cozinha |
| `/inventario` | Inventário / Contagem física | cozinha |
| `/historico` | Histórico | cozinha |
| `/relatorio` | Relatório | gerencia |
| `/configuracoes` | Configurações | gerencia |
| `/auditoria` | Histórico de Mudanças | gerencia |
| `/admin` | Painel super-admin | só `eSuperAdmin` |

Cargos: `cozinha` < `gerencia` < `diretoria`

---

## Componentes-chave

- **`Layout.jsx`**: header, marca d'água, NavBar, injeta `<GuideTour />` no topo do `<main>`. Guard `(sessao.nome || '?').slice(0,1)` — protegido contra nome null (super-admin sem perfil completo).
- **`GuideTour.jsx`**: painel "Fluxo do turno" (Entradas → Aparas → Produção → Saídas), dispensável por dia via localStorage, controlado por `prefs.guia`
- **`NavBar.jsx`**: badge numérico no Início (produtos abaixo do mín), badge "🍲" quando há receitas a produzir
- **`AutocompleteInput.jsx`**: substituiu o `<datalist>` nativo (era preto no Android). Lista estilizada com busca, setas ↑↓, Enter/Esc, click-outside. Usado em "item comprado" e "fornecedor".
- **`Charts.jsx`**: gráficos com guard `v == null ? '—'` e `?.data?.slice(5)` para evitar NaN/null.
- **`UIContext.jsx`**: toasts, modal confirm (Escape + backdrop click fecha se não `perigo`)

---

## Utilitários principais

| Arquivo | O que faz |
|---------|-----------|
| `src/utils/estoque.js` — `calcEstoquePuro` | Calcula estoque atual por produto |
| `src/utils/lotes.js` — `calcLotes` | FEFO: rastreia lotes por validade |
| `src/utils/analise.js` — `listaDeCompras` | Lista de compras automática (abaixo do mín) |
| `src/utils/analise.js` — `agruparListaPorMateriaPrima` | Agrupa lista de compras por `produto.materiaPrima` |
| `src/utils/analise.js` — `fatorCorrecaoItem` | FC histórico (aparas/perdas por compra) |
| `src/utils/analise.js` — `fatorCorrecaoProduto`/`fcEfetivo` | FC calculado AO VIVO |
| `src/utils/sugestoes.js` — `calcSugestoesMinMax` | Sugere mín/máx por consumo real |
| `src/utils/datas.js` — `validarDataRegistro` | Valida datas (não futuras, confirma se muito antigas) |

---

## Decisões de design importantes

1. **`prefs.guia`**: ligado por padrão (`prefs.guia === false` é o único estado "desligado"); toggle em Config → Sistema.
2. **Cocção (`coccao`)**: campo só aparece no modal de produto quando há alguma receita (`producoes`) que usa o produto.
3. **`entradaCozida`**: flag separada — produto entra no estoque já cozido — afeta cálculo de bruto na lista de compras.
4. **Excluir produto → desativar**: preserva histórico; o "×" nas configurações faz `ativo: false`.
5. **`autoMinMax` com `useRef`**: evita loop `useEffect` — lê `produtos` via ref sem colocá-lo como dependência.
6. **FC por ingrediente/matéria-prima**: um FC do filé cobre todas as preparações que usam filé (todas saem do mesmo estoque limpo).
7. **`materiaPrima`** no produto: campo livre editável na TabelaRendimento (Config→Sistema). Produtos com a mesma `materiaPrima` (case-insensitive) são agrupados na lista de compras.

---

## Segurança e multi-tenant

### Supabase (`SUPABASE_SETUP.sql` — JÁ RODADO em 15/06/2026)
- **RLS ativo** em: `restaurantes`, `perfis`, `registros`, `documentos`, `convites`, `sessoes`
- **`meu_restaurante()`**: função STABLE SECURITY DEFINER que retorna `restaurante_id` do usuário logado (evita recursão de policy)
- **`sou_super_admin()`**: verifica `auth.jwt() ->> 'email' = 'atiliopinpolho@gmail.com'`
- **`alterar_cargo(p_usuario, p_cargo)`**: RPC SECURITY DEFINER — valida quem chama, impede autopromoção
- **Tabela `sessoes`**: sessão única por conta (1 aparelho por vez); Realtime ativo
- **Limite 3 contas/restaurante**: guard em `criarConvite` (frontend) + esboço de RPC `aceitar_convite` no SQL

### Modo suporte (impersonação)
- **`AuthContext`**: `impersonando = { restauranteId, restauranteNome, podeMexer }` | null
- **`verComoRestaurante(id, nome, podeMexer)`**: só funciona se `sessao.eSuperAdmin`
- **`AppContext`**: `rid = impersonando?.restauranteId || sessao?.restauranteId` — troca o restaurante lido
- **`soLeitura = !!impersonando && !impersonando.podeMexer`**: bloqueia toda escrita se cliente só autorizou "ver"
- **`BannerSuporte`** (App.jsx): faixa âmbar (somente leitura) ou vermelha (pode editar) + botão "Sair"
- **Admin.jsx**: lê `documentos.chave='prefs'` para obter `suporteAtivo` e `suportePermissao` — NÃO lê de `registros`

### Sessão única
- **`registrarSessaoAtiva(userId)`**: chamado em todo login; upsert em `sessoes` com token novo
- **Realtime**: effect escuta mudanças em `sessoes` para o próprio `user_id`; token diferente → `setDerrubado(true)` + signOut
- **Tela "Conta aberta em outro aparelho"**: renderizada antes do Login quando `derrubado === true`
- **Inerte** se a tabela `sessoes` não existir (try/catch silencioso)

### Conta super-admin
- Email: `atiliopinpolho@gmail.com`
- **Conta criada** no Supabase Auth em 15/06/2026 (via Dashboard → Authentication → Users → Add user)
- Sem restaurante próprio → `"/"` redireciona direto para `"/admin"` (não trava em "cadastro incompleto")

---

## Features recentes (15/06/2026 — sétima/oitava rodada)

- **Modo suporte ver/editar**: cliente escolhe "👁️ Só visualizar" ou "✏️ Ver e editar" antes de autorizar. `prefs.suportePermissao` armazena a escolha. Banner do admin muda de cor.
- **Sessão única (1 aparelho/conta)**: tabela `sessoes` + realtime. Derruba automaticamente o aparelho anterior ao logar em outro.
- **Máximo 3 contas por restaurante**: guard em `criarConvite` + toast de aviso.
- **`alterarCargo` via RPC segura**: não faz UPDATE direto; chama `alterar_cargo()` SECURITY DEFINER.
- **RLS completo** rodado no Supabase (ver `SUPABASE_SETUP.sql`).
- **APK gerado via PWABuilder** (Package ID: `io.github.atiliorod.aurum`, aba "Other Android"). Arquivo `.zip` baixado em `Downloads/`. Instalar `app-release-signed.apk` no tablet.
- **Bug corrigido — tela branca**: `sessao.nome` era null para o super-admin (sem perfil no banco) → `(sessao.nome || '?').slice(0,1)` em Layout.jsx. `(prev || []).slice(-1999)` em AppContext.jsx.
- **`AutocompleteInput`**: substitui `<datalist>` nativo (preto no Android) por lista estilizada.
- **TabelaRendimento colapsável**: estado `aberto` (default false), cabeçalho-botão com setinha.
- **Busca na lista de compras**: filtra por nome e `materiaPrima`.
- **Agrupamento por matéria-prima**: `agruparListaPorMateriaPrima` em analise.js; grupo expansível na lista.
- **Renomear ingrediente**: botão ✏️ inline no card da TabelaRendimento.
- **"suporte (Aurum)"**: substituiu "suporte (Atílio)" em todos os textos.

---

## Pendências abertas

- **SQL no Supabase: ✅ RESOLVIDO 03/07/2026** — migrations 4 (hardening RLS), 5 (convite_valido) e 6 (índice) **executadas em produção** via SQL Editor e verificadas (`pg_policies` mostra só as `*_v4`). No processo foi removido 1 convite-lixo da auditoria Codex (token `15abd64e`, cargo `codex_cargo_invalido`, usado/expirado) que bloqueava a constraint.
- **APK no tablet**: arquivo baixado em Downloads/. Passar para o tablet via USB/Google Drive e instalar. Aceitar "instalar de fontes desconhecidas" se pedido. Package ID salvo: `io.github.atiliorod.aurum` — **guardar o .zip e a chave de assinatura** para futuros updates de APK. **Obs:** manifest mudou (`orientation: any`) — vale regenerar o APK no PWABuilder quando for atualizar.
- **Stripe ainda em test mode**: falta ativar live mode + conta bancária BRL para saque.
- **Sentry (observabilidade)**: pendente — precisa de conta em sentry.io (free tier); com o DSN são ~20 linhas de integração.
- **M9 (Compra + Entrada unificada)**: adiado pelo próprio dono; a auditoria gastronômica apontou como dor nº 1 de campo — caminho leve sugerido: botão "compra → virou entrada".
- **Auditoria completa 03/07/2026** em `AUDITORIA_COMPLETA_2026-07-03.md` (nota 70/100, roadmap 30/60/90d). Blocos P0/P1 e 30 dias APLICADOS e DEPLOYADOS (commits `930f049` + `ea63500`): duplo clique produção, conta órfã de convite, xlsx 0.20.3 (0 vulnerabilidades), zoom WCAG, logo 1,8MB→366KB, orientation any, noopener, lint 46→0, CI test→lint→audit→build, LGPD no Login, senha mín. 8, contraste AA, README de implantação, Dependabot. **Custos/CMV = fora de escopo por decisão do dono** (app é de produção/estoque; custos ficam na planilha Ficha Técnica).

---

## Como testar / deploy

```bash
npm install            # se necessário
npm run dev            # dev server → http://localhost:5173
npx vitest run         # testes (32/32)
npx vite build         # build local de sanidade

# Deploy = só commitar e dar push na main; o GitHub Actions faz o resto.
# NUNCA usar git add -A (o classificador bloqueia por causa do .env.local) — adicionar arquivos por nome.
git add <arquivos> && git commit -m "mensagem" && git push origin main
```

**Não há login de teste** — o banco de produção tem só o super-admin (limpeza 17/07/2026). Para testar fluxos completos, criar contas descartáveis `teste-e2e-*@aurum.app` e apagá-las via SQL ao final (padrão: delete em auth.users por email + limpar restaurantes órfãos sem perfis).

---

## Arquivos importantes

| Arquivo | O que é |
|---------|---------|
| `SUPABASE_SETUP.sql` | SQL completo de RLS, sessões, funções seguras — JÁ RODADO |
| `GUIA_APK_TABLET.md` | Passo a passo PWABuilder → APK → tablet |
| `src/store/AuthContext.jsx` | Auth + impersonação + sessão única |
| `src/store/AppContext.jsx` | Estado global + guards soLeitura |
| `src/pages/Admin.jsx` | Painel super-admin (lista restaurantes, suporte) |
| `src/pages/Configuracoes.jsx` | Config sistema: TabelaRendimento, suporte, instalar app |
| `src/utils/analise.js` | FC, lista de compras, agrupamento por matéria-prima |
