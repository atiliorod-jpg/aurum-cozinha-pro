// =====================================================================
//  LOTE B — SEGURANÇA (28/09/2026)
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('catálogo só com a permissão (M56)', () => {
  const sql = ler('../../lib/migration56_catalogo_so_com_permissao.sql');
  it('o banco confere "gerenciar itens" nas listas de itens, categorias e fichas, de toda cozinha', () => {
    expect(sql).toMatch(/create or replace function pode_na_conta\(p_cap text\)/);
    expect((sql.match(/chave !~ '\(\^\|::\)\(produtos\|categorias\|fichas\)\$' or coalesce\(pode_na_conta\('gerenciarProdutos'\), false\)/g) || []).length).toBe(3);
    expect(sql).toMatch(/raise exception 'Sem permissão para alterar o cadastro de itens\.'/);
    // a mesma regra da tela: exceção por conta, cargo inventado, cargo, padrão
    expect(sql).toMatch(/-> 'porConta' -> auth\.uid\(\)::text ->> p_cap/);
    expect(sql).toMatch(/-> p\.cargo_rotulo ->> p_cap/);
    expect(sql).toMatch(/then meu_cargo\(\) = 'gerencia' else false end/);
  });

  it('as rotinas automáticas que gravam o catálogo só rodam em aparelho de quem pode', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/podeCatalogoRef\.current = !soLeitura && !!sessao && pode\(sessao, permissoes, 'gerenciarProdutos'\)/);
    expect((app.match(/if \(!podeCatalogoRef\.current\) return;/g) || []).length).toBe(3);
  });
});

describe('funções do servidor', () => {
  const contas = ler('../../../supabase/functions/contas/index.ts');
  const restaurante = ler('../../../supabase/functions/restaurante/index.ts');
  const stripe = ler('../../../supabase/functions/stripe-webhook/index.ts');

  it('só o endereço do app chama pelo navegador (não mais "*")', () => {
    for (const f of [contas, restaurante]) {
      expect(f).not.toMatch(/'Access-Control-Allow-Origin': '\*'/);
      expect(f).toMatch(/'https:\/\/app\.aurumcozinha\.com\.br'/);
      expect(f).toMatch(/corsPara\(req\);/);
    }
  });

  it('senha da equipe com 8 caracteres, e conta bloqueada não cria nem troca senha', () => {
    expect(contas).not.toMatch(/senha\.length < 6/);
    expect((contas.match(/senha\.length < 8/g) || []).length).toBe(2);
    expect(contas).toMatch(/admin\.rpc\('restaurante_pode_escrever', \{ rid \}\)/);
    expect(contas).toMatch(/\(acao === 'criar' \|\| acao === 'senha'\) && podeEscrever !== true/);
    expect(ler('../../components/config/CartoesConfig.jsx')).toMatch(/senha\.length < 8/);
  });

  it('Stripe: só libera pago, confere o valor e ignora evento repetido', () => {
    expect(stripe).toMatch(/if \(s\.payment_status !== 'paid'\)/);
    expect(stripe).toMatch(/checkout\.session\.async_payment_succeeded/);
    expect(stripe).toMatch(/STRIPE_VALOR_MINIMO_CENTAVOS/);
    expect(stripe).toMatch(/from\('stripe_eventos'\)\.insert\(\{ id \}\)/);
    expect(stripe).toMatch(/supabase-js@2\.45\.4/);
  });
});

describe('fila sem internet: cada item sabe de quem é', () => {
  it('a auditoria de outra pessoa espera ela voltar; o erro guardado também', () => {
    expect(ler('../../lib/cache.js')).toMatch(/_usuario: usuarioDaFila/);
    expect(ler('../../store/AppContext.jsx')).toMatch(/item\.kind === 'auditoria' && item\._usuario && item\._usuario !== sessaoRef\.current\?\.usuarioId\) continue;/);
    expect(ler('../../lib/relatarErro.js')).toMatch(/const deOutros = todos\.filter\(e => e\.usuario && e\.usuario !== usuarioAtual\);/);
  });
});

describe('o que vai no app publicado', () => {
  it('só variáveis públicas: endereço do banco, chave pública, Pix e versão', () => {
    const permitidas = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_PIX_CHAVE', 'VITE_PIX_NOME', 'VITE_PIX_CIDADE', 'VITE_VERSAO_APP'];
    const fontes = ['../../lib/supabase.js', '../../pages/Pagamento.jsx', '../../lib/relatarErro.js'];
    for (const f of fontes) {
      for (const v of (ler(f).match(/import\.meta\.env\.(VITE_[A-Z_]+)/g) || [])) {
        expect(permitidas).toContain(v.replace('import.meta.env.', ''));
      }
    }
  });
});
