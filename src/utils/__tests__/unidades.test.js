// =====================================================================
//  Testes das UNIDADES — vários CNPJs na mesma conta (M46, 22/09/2026)
//
//  A unidade PRINCIPAL é a própria conta; a tabela `unidades` guarda só as
//  extras. Estes testes travam as regras que, se voltarem atrás, fazem a
//  etiqueta sair com o CNPJ de outra casa — que é o defeito que tudo isto
//  existe para impedir.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('M46 — as unidades no banco', () => {
  const sql = ler('../../lib/migration46_unidades.sql');
  const corpoDe = (f) => sql.slice(sql.indexOf(`function ${f}(`), sql.indexOf('end $$;', sql.indexOf(`function ${f}(`)));

  it('RLS ligada e SÓ policy de leitura: toda escrita passa pelas funções', () => {
    expect(sql).toMatch(/alter table unidades enable row level security/);
    expect(sql).toMatch(/create policy "unidades_sel_v46" on unidades for select/);
    expect(sql).not.toMatch(/create policy[^;]*on unidades for (insert|update|delete|all)/i);
    // e a própria migração aborta se alguém um dia acrescentar uma
    expect(sql).toMatch(/pg_policies where tablename = 'unidades' and cmd <> 'SELECT'/);
  });

  it('CNPJ único no sistema inteiro, nos dois sentidos, com o código que o cadastro já traduz', () => {
    expect(sql).toMatch(/create unique index if not exists unidades_cnpj_unico\s+on unidades \(cnpj\)/);
    expect(sql).toMatch(/before insert or update of cnpj on restaurantes/);
    expect(sql).toMatch(/before insert or update of cnpj on unidades/);
    expect((sql.match(/using errcode = '23505'/g) || []).length).toBe(2);
  });

  it('só o super-admin cria, edita e arquiva unidade', () => {
    for (const f of ['criar_unidade', 'editar_unidade', 'arquivar_unidade']) {
      expect(corpoDe(f), f).toMatch(/if not coalesce\(sou_super_admin\(\), false\) then/);
    }
  });

  it('o dono edita só o ENDEREÇO, só a diretoria, só nas unidades da própria conta', () => {
    const f = corpoDe('editar_endereco_unidade');
    expect(f).toMatch(/coalesce\(meu_cargo\(\), ''\) <> 'diretoria'/);
    expect(f).toMatch(/where id = p_id and restaurante_id = rid/);
    expect(f).not.toMatch(/set[^;]*\b(nome|cnpj)\s*=/);
  });

  it('a cozinha da unidade não repete id de outra unidade nem de instância do documento estoques', () => {
    const f = corpoDe('criar_unidade');
    expect(f).toMatch(/'producao#' \|\| substr\(md5/);
    expect(f).toMatch(/d\.chave = 'estoques'/);
    expect(sql).toMatch(/check \(cozinha ~ '\^producao#\[a-z0-9\]\{4\}\$'\)/);
  });

  it('o relatório só aceita unidade DA PRÓPRIA CONTA, e só converte o texto depois de conferir', () => {
    const f = corpoDe('registrar_impressoes');
    expect(f).toMatch(/where u\.restaurante_id = rid/);
    expect(f).toMatch(/u\.id = case\s+when coalesce\(e->>'unidade', ''\) ~/);
    expect(f).toMatch(/on conflict \(id\) do nothing/);
  });

  it('o relatório recriado devolve a unidade e tem o grant refeito, com sonda', () => {
    expect(sql).toMatch(/drop function if exists relatorio_etiquetas\(date, date, uuid\)/);
    expect(sql).toMatch(/returns table \(dia date, item text, responsavel text, reimpressao boolean, unidade_id uuid,/);
    expect(sql).toMatch(/grant execute on function relatorio_etiquetas\(date, date, uuid\)\s+to authenticated/);
    expect(sql).toMatch(/'relatorio_etiquetas\(date, date, uuid\)'\]/);
  });

  it('arquivar, nunca apagar', () => {
    expect(sql).not.toMatch(/function apagar_unidade/);
    expect(sql).not.toMatch(/delete from unidades/);
  });
});

describe('a conta aberta pelo painel confere o CNPJ das unidades', () => {
  it('a função restaurante recusa CNPJ de unidade antes de criar a conta de acesso', () => {
    const fn = ler('../../../supabase/functions/restaurante/index.ts');
    const checagem = fn.indexOf(".from('unidades').select('nome').eq('cnpj', cnpj)");
    expect(checagem).toBeGreaterThan(0);
    expect(checagem).toBeLessThan(fn.indexOf('admin.auth.admin.createUser('));
  });
});
