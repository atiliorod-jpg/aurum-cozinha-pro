// =====================================================================
//  Erros dos aparelhos no painel (M50) e verificação em duas etapas do
//  super-admin (M51) — 24/09/2026.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { agruparErros, ehRuido, TIPOS_DE_ERRO } from '../errosApp';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('erros dos aparelhos: o que conta e como aparece', () => {
  it('rede caindo e extensão do navegador não são defeito do app', () => {
    expect(ehRuido('TypeError: Failed to fetch')).toBe(true);
    expect(ehRuido('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(ehRuido('x is undefined', 'chrome-extension://abc/script.js:1')).toBe(true);
    expect(ehRuido("Cannot read properties of undefined (reading 'map')")).toBe(false);
  });

  it('o mesmo erro em vários aparelhos vira UM grupo, com vezes, contas e versões', () => {
    const g = agruparErros([
      { tipo: 'tela', mensagem: 'x is null', restaurante_id: 'r1', vezes: 3, visto_em: '2026-09-24T10:00:00Z', versao: '2026-09-24 10:00 UTC', tela: '/etiquetas' },
      { tipo: 'tela', mensagem: 'x is null', restaurante_id: 'r2', vezes: 1, visto_em: '2026-09-24T12:00:00Z', versao: '2026-08-30 09:00 UTC', tela: '/itens', onde: 'at Itens' },
      { tipo: 'fila', mensagem: 'registro/insert: violates check', restaurante_id: 'r1', visto_em: '2026-09-23T09:00:00Z' },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ tipo: 'tela', mensagem: 'x is null', vezes: 4, ultimo: '2026-09-24T12:00:00Z', onde: 'at Itens' });
    expect(g[0].contas.sort()).toEqual(['r1', 'r2']);
    expect(g[0].versoes).toEqual(['2026-09-24 10:00 UTC', '2026-08-30 09:00 UTC']); // a mais nova primeiro
    expect(g[1].vezes).toBe(1);
    expect(TIPOS_DE_ERRO.fila).toMatch(/Lançamento/);
    expect(agruparErros(null)).toEqual([]);
  });

  it('o app manda os quatro tipos: tela, erro de programa, promessa e fila que desistiu', () => {
    expect(ler('../../main.jsx')).toMatch(/ouvirErrosGlobais\(\)/);
    expect(ler('../../components/BarreiraDeErro.jsx')).toMatch(/relatarErro\(\{\s*tipo: 'tela'/);
    const erro = ler('../../lib/relatarErro.js');
    expect(erro).toMatch(/window\.addEventListener\('error'/);
    expect(erro).toMatch(/window\.addEventListener\('unhandledrejection'/);
    expect(ler('../../store/AppContext.jsx')).toMatch(/if \(falhou\._morto && !item\._morto\) relatarErro\(\{ tipo: 'fila'/);
    // sem internet guarda e manda depois (ao confirmar a assinatura e ao voltar a rede)
    expect(ler('../../store/AuthContext.jsx')).toMatch(/enviarPendentes\(\);/);
  });

  it('o banco: só o super-admin lê, ninguém escreve direto, com limite, soma e limpeza', () => {
    const sql = ler('../../lib/migration50_erros_dos_aparelhos.sql');
    expect(sql).toMatch(/create policy "erros_app_sel_v50" on erros_app for select using \(coalesce\(sou_super_admin\(\), false\)\);/);
    expect(sql).toMatch(/>= 30 then/);
    expect(sql).toMatch(/update erros_app set vezes = vezes \+ 1/);
    expect(sql).toMatch(/delete from erros_app where criado_em < now\(\) - interval '60 days'/);
  });

  it('o painel mostra o cartão', () => {
    expect(ler('../../pages/Admin.jsx')).toMatch(/<ErrosDosAparelhos restaurantes=\{restaurantes\} \/>/);
  });
});

describe('verificação em duas etapas do super-admin', () => {
  it('o banco só reconhece o super-admin com o login em duas etapas (aal2)', () => {
    const sql = ler('../../lib/migration51_super_admin_duas_etapas.sql');
    expect(sql).toMatch(/auth\.uid\(\) = '318071c2-49c0-41d0-89aa-235f0672e1ad'::uuid\s*and coalesce\(auth\.jwt\(\) ->> 'aal', ''\) = 'aal2'/);
  });

  it('a função que abre conta de cliente confere o mesmo nível', () => {
    const fn = ler('../../../supabase/functions/restaurante/index.ts');
    expect(fn).toMatch(/if \(aal !== 'aal2'\) \{/);
  });

  it('o app pede o código ANTES de qualquer tela do super-admin', () => {
    const app = ler('../../App.jsx');
    expect(app).toMatch(/if \(sessao\.eSuperAdmin && !sessao\.demo\) \{\s*if \(nivelLogin === null\) return <Splash \/>;[\s\S]{0,300}?if \(nivelLogin !== 'aal2'\) return <DuasEtapas/);
    expect(app.indexOf("if (nivelLogin !== 'aal2')")).toBeLessThan(app.indexOf('const plano = impersonando'));
    const tela = ler('../../components/DuasEtapas.jsx');
    expect(tela).toMatch(/supabase\.auth\.mfa\.enroll\(\{ factorType: 'totp'/);
    expect(tela).toMatch(/supabase\.auth\.mfa\.challengeAndVerify\(\{ factorId: fator\.id, code: c \}\)/);
    // cadastro começado e não terminado sai antes do novo
    expect(tela).toMatch(/supabase\.auth\.mfa\.unenroll\(\{ factorId: f\.id \}\)/);
  });
});
