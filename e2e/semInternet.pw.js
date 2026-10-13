import { test, expect } from '@playwright/test';

// =====================================================================
//  O APP SEM INTERNET (23/09/2026) — no navegador de verdade, sem conta real.
//
//  O robô deixa no aparelho uma sessão do Supabase com o token VENCIDO (o
//  caso de toda manhã: app fechado à noite) e corta só a conexão com o banco
//  — o app em si abre do servidor local. Depois confere as três situações:
//    • aparelho que nunca entrou com internet → "Conecte à internet";
//    • cópia confirmada há 1 hora → o app abre e imprime;
//    • cópia confirmada há mais de 72 horas → "Conecte à internet".
//  Antes desta mudança, as três davam a tela de LOGIN (ou "Cadastro
//  incompleto"), e a cozinha sem Wi-Fi não imprimia etiqueta nenhuma.
//
//  O nome da chave da sessão depende do endereço do banco
//  (VITE_SUPABASE_URL); sem ele os testes são pulados.
// =====================================================================

const URL_BANCO = process.env.VITE_SUPABASE_URL || '';
const CHAVE_SESSAO = URL_BANCO ? `sb-${new URL(URL_BANCO).hostname.split('.')[0]}-auth-token` : '';
const H = 60 * 60 * 1000;
const ruidoDeRede = /Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|supabase|WebSocket|Fetch/i;

test.skip(!CHAVE_SESSAO, 'sem VITE_SUPABASE_URL: não dá para montar a sessão guardada');

const RID_ROBO = '00000000-0000-4000-8000-00000000robo'.slice(0, 36);

async function abrirSemInternet(page, { horasDaCopia = null, assinaturaAte = null, guardado = {} } = {}) {
  const erros = [];
  page.on('pageerror', (e) => { if (!ruidoDeRede.test(e.message)) erros.push(`erro de JavaScript: ${e.message}`); });
  // sem internet: tudo que vai ao banco falha como falharia com o Wi-Fi fora
  await page.route(/supabase\.co/, (r) => r.abort('internetdisconnected'));
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  const agora = Date.now();
  await page.addInitScript(({ chave, copia, agora, guardado }) => {
    window.open = () => null; window.print = () => {};
    // só na primeira abertura: recarregar tem de ver o que o app deixou
    if (sessionStorage.getItem('robo-montado')) return;
    sessionStorage.setItem('robo-montado', '1');
    localStorage.setItem(chave, JSON.stringify({
      access_token: 'robo', refresh_token: 'robo', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(agora / 1000) - 3600, // vencido há 1 hora
      user: { id: 'u-robo', email: 'robo@teste.invalid' },
    }));
    if (copia) localStorage.setItem('pe::_sessao::ultima', JSON.stringify(copia));
    // o que o aparelho já tinha guardado da conta (equipe, senhas…)
    for (const [k, v] of Object.entries(guardado)) localStorage.setItem(k, JSON.stringify(v));
  }, {
    chave: CHAVE_SESSAO,
    agora,
    guardado,
    copia: horasDaCopia == null ? null : {
      usuarioId: 'u-robo',
      confirmadoEm: agora - horasDaCopia * H,
      desvioMs: 0,
      usuarios: [{ id: 'u-robo', nome: 'Robô', cargo: 'diretoria', ativo: true }],
      sessao: {
        usuarioId: 'u-robo', email: 'robo@teste.invalid', nome: 'Robô', cargo: 'diretoria',
        restauranteId: RID_ROBO, restauranteNome: 'Casa do Robô',
        assinaturaLida: true, assinaturaAte: assinaturaAte || new Date(agora + 20 * 24 * H).toISOString(),
        regime: 'pagante', produto: 'etiquetas', maxUsuarios: 3, bloqueado: false, eSuperAdmin: false,
      },
    },
  });
  await page.goto('/');
  return erros;
}

test('sem internet e sem cópia guardada: pede internet (antes: login ou "Cadastro incompleto")', async ({ page }) => {
  const erros = await abrirSemInternet(page);
  // sem cópia: em 12 s a tela pede internet (antes: ~1 minuto de "Carregando…" e depois o login)
  await expect(page.getByText('Conecte à internet para continuar', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/primeira entrada precisa de internet/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  // tentar de novo ainda sem internet: diz que segue sem conexão, não trava
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByText(/Ainda sem conexão/)).toBeVisible({ timeout: 20_000 });
  expect(erros, erros.join('\n')).toEqual([]);
});

test('sem internet com a assinatura confirmada há 1 hora: o app abre e dá para imprimir', async ({ page }) => {
  const erros = await abrirSemInternet(page, { horasDaCopia: 1 });
  await expect(page.getByRole('button', { name: 'Etiquetar' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Conecte à internet para continuar', { exact: true })).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('sem internet há mais de 72 horas: pede internet', async ({ page }) => {
  const erros = await abrirSemInternet(page, { horasDaCopia: 80 });
  await expect(page.getByText('Conecte à internet para continuar', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/mais de 3 dias/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Etiquetar' })).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('sem internet com a cópia recente mas a assinatura já vencida: não libera', async ({ page }) => {
  const erros = await abrirSemInternet(page, { horasDaCopia: 2, assinaturaAte: new Date(Date.now() - 24 * H).toISOString() });
  await expect(page.locator('body')).toContainText(/Assine|assinatura|venc|terminou/i, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Etiquetar' })).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

test('sem internet: "Sair da conta" apaga a sessão do aparelho (antes: a conta voltava sozinha)', async ({ page }) => {
  const erros = await abrirSemInternet(page);
  await expect(page.getByText('Conecte à internet para continuar', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  // em poucos segundos (antes: ~30 s de botão parado) cai no login
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible({ timeout: 10_000 });
  // e a sessão guardada saiu mesmo: sem ela, a conta não volta com a internet
  expect(await page.evaluate((c) => localStorage.getItem(c), CHAVE_SESSAO)).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Conecte à internet para continuar', { exact: true })).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});

// ⚠️ A SENHA DA EQUIPE CONFERE SEM INTERNET (13/10/2026): ela vem da cópia
// guardada no aparelho. E quem entrou pelo nome NÃO fica guardado —
// recarregar o app volta para "Quem vai imprimir?".
test('sem internet: a senha da equipe confere, e recarregar volta para os nomes', async ({ page }) => {
  const erros = await abrirSemInternet(page, {
    horasDaCopia: 1,
    guardado: {
      [`pe::${RID_ROBO}::pessoas`]: ['Ana', 'Bia'],
      // a mesma senha de exemplo da demonstração (1234), já codificada
      [`pe::${RID_ROBO}::senhasEquipe`]: { Ana: {
        s: '5e1a7d0c2b9f4e3a8c6d1f0b7a2e9c4d',
        h: 'e27a1cb151fb9b1f325be4d237a6cd3ded3ca13a148e082e3344b26b7b3904a3',
        i: 100000,
      } },
    },
  });
  await expect(page.getByRole('heading', { name: 'Quem vai imprimir?' })).toBeVisible({ timeout: 20_000 });
  // a conta "nova" no aparelho mostra as novidades por cima
  const entendi = page.getByRole('button', { name: 'Entendi' });
  if (await entendi.isVisible({ timeout: 3_000 }).catch(() => false)) await entendi.click();
  await page.getByRole('button', { name: /^Ana/ }).click();
  for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('Imprimindo como Ana')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Quem vai imprimir?' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Imprimindo como Ana')).toHaveCount(0);
  expect(erros, erros.join('\n')).toEqual([]);
});
