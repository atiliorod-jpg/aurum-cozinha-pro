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
export async function abrir(page, rota) {
  await page.evaluate((r) => {
    window.history.pushState({}, '', r);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, rota);
  await expect(page.locator('main')).not.toBeEmpty({ timeout: 15_000 });
  await expect(page.getByText('Esta tela travou')).toHaveCount(0);
}

// "Quem vai imprimir?" — toca no nome se a tela pedir (da segunda vez no mesmo
// teste a pessoa já está escolhida: vale por 5 minutos)
export async function entrarComo(page, nome = 'Maria') {
  const botao = page.getByRole('button', { name: nome, exact: true });
  if (await botao.isVisible({ timeout: 2_000 }).catch(() => false)) await botao.click();
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
