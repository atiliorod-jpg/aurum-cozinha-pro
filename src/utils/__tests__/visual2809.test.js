// =====================================================================
//  LOTE A — VISUAL E ACESSIBILIDADE (28/09/2026)
//
//  Travas de regressão: nenhum emoji na interface (ícone sai de Icons.jsx),
//  nenhum campo ou botão sem nome para o leitor de tela, toques de 44 px nos
//  pontos da bancada, contraste nos avisos que mais importam.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { plural } from '../formatters';

const RAIZ = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

function arquivos(dir, ext = /\.jsx?$/) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== '__tests__') out.push(...arquivos(p, ext)); }
    else if (ext.test(f)) out.push(p);
  }
  return out;
}

// o código sem os comentários (é neles que os emojis de explicação ficam)
function semComentarios(s) {
  return s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
}

describe('sem emoji na interface', () => {
  it('nenhum arquivo de tela usa emoji fora de comentário', () => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23E9}-\u{23FA}]/u;
    const achados = [];
    for (const p of arquivos(RAIZ)) {
      semComentarios(readFileSync(p, 'utf8')).split('\n').forEach((l, i) => {
        if (EMOJI.test(l)) achados.push(`${p}:${i + 1}: ${l.trim().slice(0, 80)}`);
      });
    }
    expect(achados, achados.join('\n')).toEqual([]);
  });
});

describe('todo campo e todo botão tem nome para o leitor de tela', () => {
  it('campos: aria-label, id (ligado a um label) ou dentro de um <label>', () => {
    const achados = [];
    for (const p of arquivos(RAIZ, /\.jsx$/)) {
      const s = readFileSync(p, 'utf8');
      const re = /<(input|select|textarea)\b/g;
      let m;
      while ((m = re.exec(s))) {
        const resto = s.slice(m.index);
        const fim = Math.min(...['/>', '<option', '</select', '</textarea', '{opcoes', '{[', '{('].map(t => { const i = resto.indexOf(t, 1); return i < 0 ? 1e9 : i; }));
        const tag = resto.slice(0, fim);
        if (/type=["']?(hidden|file|checkbox|radio)/.test(tag)) continue;
        if (/aria-label|aria-labelledby|\bid=/.test(tag)) continue;
        const antes = s.slice(Math.max(0, m.index - 500), m.index);
        if (antes.lastIndexOf('<label') > antes.lastIndexOf('</label>')) continue;
        achados.push(`${p}:${s.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(achados, achados.join('\n')).toEqual([]);
  });
});

describe('toques e contraste nos pontos que importam', () => {
  it('janela de imprimir: + e − de 44 px, campos de 16 px (sem zoom no iPhone), vencimento em destaque', () => {
    const t = ler('../../components/EtiquetaPrint.jsx');
    expect(t).not.toMatch(/w-9 h-9 rounded-full/);
    expect(t).toMatch(/const inputCls = 'w-full min-h-11 border border-gray-200 rounded-lg px-3 py-2 text-base';/);
    expect(t).toMatch(/Vencimento na etiqueta: <strong className="text-base text-polo-navy">/);
  });

  it('filtros e categorias com 44 px e aria-pressed', () => {
    const e = ler('../../pages/Etiquetas.jsx');
    expect((e.match(/aria-pressed=\{catAtiva === /g) || []).length).toBe(2);
    expect(ler('../../pages/Validades.jsx')).toMatch(/aria-pressed=\{filtro === v\}/);
    expect(ler('../../pages/Pagamento.jsx')).toMatch(/role="radiogroup" aria-label="Duração do plano"/);
  });

  it('contraste: título branco no cartão vermelho, erro do login e prazo curto em tons fortes', () => {
    expect(ler('../../pages/Pagamento.jsx')).toMatch(/'text-white' : 'text-polo-gold'/);
    expect(ler('../../pages/Login.jsx')).toMatch(/text-sm text-red-700 font-semibold/);
    expect(ler('../../pages/Validades.jsx')).toMatch(/d <= 3 \? 'text-orange-800'/);
  });

  it('o aviso de vencimento não cobre os botões da direita, e fecha com 44 px', () => {
    const a = ler('../../components/AvisoVencimento.jsx');
    expect(a).toMatch(/fixed bottom-20 left-3/);
    expect(a).toMatch(/w-11 h-11 flex items-center justify-center/);
  });

  it('"carregando" não é "vazio": esqueleto enquanto a nuvem não responde', () => {
    expect(ler('../../pages/Etiquetas.jsx')).toMatch(/!nuvemCarregada && <Esqueleto rotulo="Carregando os itens" \/>/);
    expect(ler('../../pages/etiquetas/Impressas.jsx')).toMatch(/vazio && !nuvemCarregada \?/);
  });
});

describe('textos', () => {
  it('plural de verdade no lugar de "dia(s)"', () => {
    expect(plural(1, 'dia', 'dias')).toBe('1 dia');
    expect(plural(3, 'dia', 'dias')).toBe('3 dias');
    expect(ler('../../pages/Pagamento.jsx')).not.toMatch(/dia\(s\)/);
    expect(ler('../../App.jsx')).not.toMatch(/dia\(s\)/);
  });

  it('o plano se chama Cozinha Pro em todo lugar; sem "tablet"; sem menu "Config" que não existe', () => {
    expect(ler('../../pages/Admin.jsx')).not.toMatch(/'Completo'/);
    expect(ler('../../pages/Etiquetas.jsx')).not.toMatch(/tablet/);
    expect(ler('../../pages/Validades.jsx')).not.toMatch(/Config →/);
  });
});
