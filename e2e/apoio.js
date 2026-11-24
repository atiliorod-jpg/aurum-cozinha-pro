import { expect } from '@playwright/test';

// =====================================================================
//  APOIO DO ROBÔ (Lote 0 da auditoria, 14/10/2026)
//
//  O que todo cenário repete: entrar na demonstração, navegar sem recarregar,
//  tocar no nome em "Quem vai imprimir?", ler o saldo de um item. Os arquivos
//  antigos têm cópias destas funções; os novos usam estas. (O nome do arquivo
//  não termina em .pw.js de propósito: não é um teste.)
// =====================================================================

// Rede que falha no ambiente de teste não é defeito do app (a demonstração
// nem fala com o banco); erro de JavaScript é.
export const RUIDO_DE_REDE = /Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|supabase/i;

// Entra na demonstração do plano ('Aurum Etiquetas' ou 'Aurum Cozinha Pro') e
// devolve a lista de erros da página, para o teste conferir no fim.
export async function entrarNaDemo(page, plano, cozinha = /^Cozinha de Produção/) {
  const erros = [];
  page.on('pageerror', (e) => erros.push(`erro de JavaScript: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !RUIDO_DE_REDE.test(m.text())) erros.push(`console: ${m.text()}`);
  });
  // a demonstração abre o WhatsApp da Aurum para avisar do visitante — no
  // robô, não; e a janela de impressão do navegador travaria o teste
  await page.addInitScript(() => { window.open = () => null; window.print = () => {}; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver demonstração' }).click();
  await page.getByPlaceholder('Seu nome').fill('Robô de teste');
  await page.getByPlaceholder('WhatsApp com DDD').fill('81999999999');
  await page.getByRole('button', { name: new RegExp(plano) }).click();
  // o Pro pergunta primeiro onde o aparelho vai trabalhar
  const escolha = page.getByRole('heading', { name: 'Onde você vai trabalhar?' });
  if (await escolha.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('button', { name: cozinha }).click();
  }
  await expect(page.locator('main')).toBeVisible();
  return erros;
}

// ⚠️ A sessão da demonstração vive SÓ NA MEMÓRIA — recarregar a página a
// perderia. Por isso a navegação é pelo histórico (o que um toque num link
// faz), nunca por `page.goto` depois de entrar.
// ⚠️ ESPERA A TELA NOVA DE VERDADE (23/11/2026): a troca de tela é uma
// transição, e enquanto a nova carrega a ANTERIOR continua na tela, aceitando
// toques. Com a senha obrigatória, o robô tocava no nome da tela velha, e o
// teclado sumia quando a nova chegava. O app marca a tela aberta em
// <html data-trocas-de-tela> (TopoAoTrocarDeTela, em App.jsx): um contador,
// porque um redirecionamento pode voltar ao endereço de antes.
export async function trocarDeTela(page, rota) {
  const { trocas, mesma } = await page.evaluate((r) => {
    const antes = {
      trocas: document.documentElement.dataset.trocasDeTela || '',
      mesma: window.location.pathname === r.split(/[?#]/)[0],
    };
    window.history.pushState({}, '', r);
    window.dispatchEvent(new PopStateEvent('popstate'));
    return antes;
  }, rota);
  // para a mesma tela não há troca a esperar
  if (trocas && !mesma) {
    await expect(page.locator('html')).not.toHaveAttribute('data-trocas-de-tela', trocas, { timeout: 15_000 });
  }
  await expect(page.locator('main')).not.toBeEmpty({ timeout: 15_000 });
}

export async function abrir(page, rota) {
  await trocarDeTela(page, rota);
  await expect(page.getByText('Esta tela travou')).toHaveCount(0);
  await liberarSeTravada(page);
}

// ⚠️ A SENHA DA ADMINISTRAÇÃO (23/11/2026, jeito do Magurō): Meus itens, a
// Administração e os relatórios abrem travados até alguém digitar a senha —
// na demonstração, 1234. O robô digita quando a tela pede (abrir faz isso
// sozinho); quem testa a própria trava chama digitarSenhaAdm direto.
export const SENHA_ADM_DEMO = '1234';
export async function digitarSenhaAdm(page, senha = SENHA_ADM_DEMO) {
  const tela = page.locator('main');
  for (const d of senha) await tela.getByRole('button', { name: d, exact: true }).click();
  await tela.getByRole('button', { name: 'Entrar', exact: true }).click();
}
// ⚠️ o SINAL é o campo da senha da tela travada — o cartão de trocar a senha
// (Administração → Equipe) tem um título igual e não pode ser confundido
export const telaTravada = (page) => page.getByRole('textbox', { name: 'Senha da Administração', exact: true });
export async function liberarSeTravada(page) {
  const trava = telaTravada(page);
  if (!(await trava.isVisible().catch(() => false))) return;
  await digitarSenhaAdm(page);
  await expect(trava).toHaveCount(0);
}

// ⚠️ SENHA OBRIGATÓRIA DESDE 23/11/2026 (jeito do Magurō): todo nome pede
// senha. Na demonstração, João já tem a 12; os outros nomes são "1º acesso", e
// o robô cria para eles a SENHA_DO_ROBO (digitada duas vezes). Da segunda vez
// no mesmo teste, o nome já tem senha e o robô só digita.
export const SENHA_DO_ROBO = '24';
export const senhaDe = (nome) => (nome === 'João' ? '12' : SENHA_DO_ROBO);

export async function digitarNumeros(page, numeros) {
  for (const d of numeros) await page.getByRole('button', { name: d, exact: true }).click();
}

// Depois do toque no nome: cria a senha (1º acesso) ou digita a que existe.
export async function passarPelaSenha(page, nome) {
  const criar = page.getByRole('heading', { name: `Crie sua senha, ${nome}` });
  const digitar = page.getByRole('heading', { name: `Senha de ${nome}` });
  const repetir = page.getByRole('heading', { name: 'Repita a senha' });
  await expect(criar.or(digitar).first()).toBeVisible();
  if (await criar.isVisible()) {
    await digitarNumeros(page, SENHA_DO_ROBO);
    await expect(repetir).toBeVisible();
    await digitarNumeros(page, SENHA_DO_ROBO);
  } else {
    await digitarNumeros(page, senhaDe(nome));
  }
  await expect(criar.or(digitar).or(repetir)).toHaveCount(0);
}

// "Quem vai imprimir?" / "Quem está registrando?" — toca no nome e passa pela
// senha, se a tela pedir (da segunda vez no mesmo teste a pessoa pode já estar
// escolhida). Espera a tela mostrar UM dos dois — a grade ou o nome já
// escolhido — antes de decidir, para não passar direto por uma tela que ainda
// está abrindo.
export async function entrarComo(page, nome = 'Maria') {
  const botao = page.getByRole('button', { name: nome, exact: true });
  const jaEscolhido = page.getByText(new RegExp(`(Registrando|Imprimindo) como ${nome}|Assina: ${nome}`));
  await expect(botao.or(jaEscolhido).first()).toBeVisible({ timeout: 10_000 });
  if (!(await botao.isVisible())) return;
  await botao.click();
  await passarPelaSenha(page, nome);
}

// ⚠️ A MEDIDA PELO TECLADO GRANDE (23/11/2026, jeito do Magurō): o robô toca
// no campo da medida, digita o número e escolhe a unidade — como a pessoa faz.
// `numero` com vírgula ("1,5"); `unidade` como no botão ("kg", "un").
export async function porMedida(page, numero, unidade) {
  await page.getByRole('dialog').getByRole('button', { name: /^Medida de / }).first().click();
  const teclado = page.getByRole('dialog', { name: /^Medida — / });
  await expect(teclado).toBeVisible();
  for (const d of numero) {
    await teclado.getByRole('button', { name: d === ',' ? 'Vírgula' : d, exact: true }).click();
  }
  if (unidade) await teclado.getByRole('button', { name: unidade, exact: true }).click();
  await teclado.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(teclado).toHaveCount(0);
}

// ⚠️ DEPOIS DE IMPRIMIR PELA TELA IMPRIMIR (03/11/2026): "Continuar imprimindo,
// Maria?", com 5 s para responder. O robô continua, como quem segue no serviço.
export async function continuarImprimindo(page) {
  const pergunta = page.getByRole('dialog', { name: /^Continuar imprimindo/ });
  await expect(pergunta).toBeVisible();
  await pergunta.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// fecha a janela de imprimir que algumas telas abrem depois de registrar
// (pelo Esc: o botão de baixo muda de nome conforme o aparelho — "Agora não"
// ou "Fechar" — e o × de cima também se chama "Fechar")
export async function fecharJanelaDeImprimir(page) {
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// Saldo de um item, lido na tela de Saídas ("Em estoque: 7,5 kg").
export async function saldoDe(page, nome) {
  await abrir(page, '/saidas');
  const linha = page.locator('main div').filter({ hasText: nome }).filter({ hasText: 'Em estoque:' }).last();
  const texto = await linha.innerText();
  const m = texto.match(/Em estoque:\s*(-?[\d.,]+)/);
  return m ? Number(m[1].replace(',', '.')) : NaN;
}

// ── Medição de acessibilidade (a da auditoria, agora permanente) ─────────
// Dentro das raízes dadas: alvos de toque menores que 44 px, texto com
// contraste abaixo do mínimo da WCAG (4,5:1; 3:1 para letra grande) e letras
// menores que 12 px. Roda NO NAVEGADOR (page.evaluate).
export async function medirAcessibilidade(page, raizes = ['main', 'nav', 'header']) {
  // sem animação: uma aba que ainda está trocando de cor mediria um contraste
  // que ninguém vê parado
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  return page.evaluate((raizes) => {
    const lum = (r, g, b) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    // o fundo opaco mais próximo; com imagem/gradiente no caminho, não mede
    const fundo = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== 'none') return null;
        const c = rgb(cs.backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c;
      }
      return [243, 239, 230]; // o bege do body
    };
    const nomeDe = (el) => ((el.getAttribute('aria-label') || el.innerText || el.placeholder || el.tagName) + '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const visivel = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('.sr-only')) return null;
      return r;
    };
    const pequenos = [];
    const contraste = [];
    const letrasPequenas = [];
    const vistos = new Set();
    for (const raiz of raizes) {
      for (const base of document.querySelectorAll(raiz)) {
        for (const el of base.querySelectorAll('button, a, input, select, [role=radio], [role=switch]')) {
          const r = visivel(el);
          if (!r) continue;
          if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type)) {
            // dentro de um rótulo de 44 px, o rótulo inteiro é o alvo do toque
            const rotulo = el.closest('label')?.getBoundingClientRect();
            if (r.height < 23.5 && !(rotulo && rotulo.height >= 43.5)) pequenos.push(`caixa de marcar ${Math.round(r.width)}x${Math.round(r.height)}`);
            continue;
          }
          if (r.height < 43.5 || (r.width < 43.5 && el.tagName !== 'INPUT')) {
            pequenos.push(`${nomeDe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        for (const el of base.querySelectorAll('*')) {
          if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
          if (!visivel(el)) continue;
          // ⚠️ a prévia da etiqueta reproduz o PAPEL (60×50 mm): a letra dela é
          // a do rolo, não a da tela. E o que é só enfeite (aria-hidden) não
          // é texto para ler.
          if (el.closest('.etiqueta-label, [aria-hidden="true"]')) continue;
          const cs = getComputedStyle(el);
          if (+cs.opacity < 0.5 || el.closest('[disabled], [aria-disabled="true"]')) continue;
          const tam = parseFloat(cs.fontSize);
          const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
          if (tam < 12) letrasPequenas.push(`${t} (${tam}px)`);
          const c = rgb(cs.color);
          const b = fundo(el);
          if (!b) continue;
          const a = c[3] === undefined ? 1 : c[3];
          const mistura = c.slice(0, 3).map((v, i) => v * a + b[i] * (1 - a));
          const L1 = lum(...mistura);
          const L2 = lum(...b.slice(0, 3));
          const razao = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const grande = tam >= 24 || (tam >= 18.66 && +cs.fontWeight >= 700);
          if (razao < (grande ? 3 : 4.5) && !vistos.has(t)) {
            vistos.add(t);
            contraste.push(`${t} — ${razao.toFixed(2)}:1`);
          }
        }
      }
    }
    return { pequenos, contraste, letrasPequenas };
  }, raizes);
}

// ── O MICROFONE DE MENTIRA (04/11/2026; aqui desde 24/11/2026) ─────────
// O robô não tem microfone: um reconhecimento de fala de mentira devolve a
// frase combinada (window.__fala) quando o app liga o microfone, do mesmo
// jeito que o navegador devolve. `falar(page, { textos: ['...'] })` antes
// de tocar no microfone; `{ erro: 'network' }` simula a falha.
export async function comVozDeMentira(page) {
  await page.addInitScript(() => {
    class ReconhecimentoDeMentira {
      start() {
        const fala = window.__fala || {};
        setTimeout(() => {
          if (fala.erro) { this.onerror?.({ error: fala.erro }); this.onend?.(); return; }
          // `partes`: a frase com pausa — o navegador fecha cada parte à parte
          const partes = fala.partes || [fala.textos || []];
          const results = partes.map(versoes => Object.assign(versoes.map(t => ({ transcript: t })), { isFinal: true }));
          this.onresult?.({ results });
          this.onend?.();
        }, 30);
      }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    window.SpeechRecognition = ReconhecimentoDeMentira;
  });
}
export const falar = (page, fala) => page.evaluate((f) => { window.__fala = f; }, fala);
