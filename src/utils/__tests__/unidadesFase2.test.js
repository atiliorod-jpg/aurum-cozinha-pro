// =====================================================================
//  UNIDADES, SEGUNDA FASE (M48, 23/09/2026): equipe presa a uma unidade e
//  lista de itens (catálogo) por unidade.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { listarEstoques } from '../instancias';
import {
  baseDoCatalogo, unidadeFixaDe, cozinhasDaFixa, cozinhaDaFixa, bloqueioDaFixa,
} from '../unidades';
import { chaveModulo } from '../modulos';
import { visaoDoEstoque } from '../visaoEstoque';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

const U1 = { id: 'u-1', nome: 'Centro', cnpj: '11444777000161', cozinha: 'producao#ab12', criada_em: '2026-09-22T10:00:00Z' };
const U1P = { ...U1, catalogo_proprio: true };
const doc = { itens: [
  { id: 'seco#zz99', nome: 'Seco do Centro', unidade: 'u-1', criadoEm: 1 },
  { id: 'finalizacao#qq11', nome: 'Salão do Centro', unidade: 'u-1', criadoEm: 2 },
  { id: 'seco#pp22', nome: 'Seco da Matriz', criadoEm: 3 },
] };

describe('lista de itens por unidade: de onde cada cozinha lê', () => {
  it('sem lista própria, é a de sempre (por tipo)', () => {
    const est = listarEstoques(doc, [U1]);
    expect(baseDoCatalogo(est, [U1], 'producao')).toBe('producao');
    expect(baseDoCatalogo(est, [U1], 'producao#ab12')).toBe('producao');
    expect(baseDoCatalogo(est, [U1], 'seco#zz99')).toBe('seco');
    expect(baseDoCatalogo(est, [U1], 'finalizacao#qq11')).toBe('producao');
  });

  it('com lista própria, as cozinhas DA unidade leem a dela — e as chaves batem com as que a M48 copia', () => {
    const est = listarEstoques(doc, [U1P]);
    expect(baseDoCatalogo(est, [U1P], 'producao#ab12')).toBe('producao#ab12');
    expect(baseDoCatalogo(est, [U1P], 'finalizacao#qq11')).toBe('producao#ab12');
    expect(baseDoCatalogo(est, [U1P], 'seco#zz99')).toBe('seco#ab12');
    expect(chaveModulo(baseDoCatalogo(est, [U1P], 'producao#ab12'), 'produtos')).toBe('producao#ab12::produtos');
    expect(chaveModulo(baseDoCatalogo(est, [U1P], 'seco#zz99'), 'produtos')).toBe('seco#ab12::produtos');
    const sql = ler('../../lib/migration48_equipe_e_catalogo_por_unidade.sql');
    expect(sql).toMatch(/when d\.chave like 'seco::%' then 'seco#' \|\| v_suf \|\| '::' \|\| substr\(d\.chave, 7\)/);
    expect(sql).toMatch(/else v_u\.cozinha \|\| '::' \|\| d\.chave end/);
  });

  it('as cozinhas da principal continuam na lista da conta', () => {
    const est = listarEstoques(doc, [U1P]);
    expect(baseDoCatalogo(est, [U1P], 'producao')).toBe('producao');
    expect(baseDoCatalogo(est, [U1P], 'seco#pp22')).toBe('seco');
    expect(baseDoCatalogo(est, [U1P], 'seco')).toBe('seco');
  });

  it('o balanço lê a lista certa de cada cozinha', () => {
    const docs = { produtos: [{ id: 'a', nome: 'Da conta' }], 'producao#ab12::produtos': [{ id: 'b', nome: 'Do Centro' }] };
    const base = { id: 'producao#ab12', docs, registrosFatiados: {}, padroes: {}, aplicarMetas: (c) => c };
    const nomes = (v) => JSON.stringify(v);
    expect(nomes(visaoDoEstoque({ ...base, baseCatalogo: 'producao#ab12' }))).toContain('Do Centro');
    expect(nomes(visaoDoEstoque(base))).toContain('Da conta');
  });

  it('o app troca a chave do catálogo pela base da unidade e recarrega quando ela muda', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/const kc = useCallback\(\(chave\) => chaveModulo\(catalogoRef\.current, chave\), \[\]\);/);
    expect(app).toMatch(/\}, \[rid, salvarDocNuvem, moduloEfetivo, chaveDestinos, k, kc, baseCatalogo\]\);/);
    expect(app).toMatch(/baseCatalogo: baseDoCatalogo\(estoques, unidades, id\),/);
    expect(app).toMatch(/cozinha, arquivada_em, criada_em, catalogo_proprio'\)/);
  });

  it('só a Aurum liga a lista própria, no painel', () => {
    const adm = ler('../../pages/Admin.jsx');
    expect(adm).toMatch(/supabase\.rpc\('definir_catalogo_da_unidade', \{ p_id: u\.id, p_proprio: proprio \}\)/);
    const sql = ler('../../lib/migration48_equipe_e_catalogo_por_unidade.sql');
    expect(sql).toMatch(/if not coalesce\(sou_super_admin\(\), false\) then\s*raise exception 'Apenas o administrador do sistema muda a lista de itens/);
    expect(sql).toMatch(/on conflict \(restaurante_id, chave\) do nothing;/);
  });
});

describe('equipe presa a uma unidade', () => {
  const est = listarEstoques(doc, [U1]);

  it('o perfil vira a trava da sessão: null = todas; { id } = só aquela (null = principal)', () => {
    expect(unidadeFixaDe({ unidade_fixa: false, unidade_id: 'u-1' })).toBe(null);
    expect(unidadeFixaDe({ unidade_fixa: true, unidade_id: 'u-1' })).toEqual({ id: 'u-1' });
    expect(unidadeFixaDe({ unidade_fixa: true, unidade_id: null })).toEqual({ id: null });
    expect(unidadeFixaDe(null)).toBe(null);
  });

  it('a conta presa só enxerga as cozinhas da unidade dela', () => {
    expect(cozinhasDaFixa(est, { id: 'u-1' }).map(e => e.id).sort()).toEqual(['finalizacao#qq11', 'producao#ab12', 'seco#zz99']);
    expect(cozinhasDaFixa(est, { id: null }).every(e => !e.unidade)).toBe(true);
    expect(cozinhasDaFixa(est, null)).toHaveLength(est.length);
  });

  it('a cozinha guardada no aparelho só vale se for da unidade; senão, a Produção principal dela', () => {
    expect(cozinhaDaFixa(est, { id: 'u-1' }, 'seco#zz99')).toBe('seco#zz99');
    expect(cozinhaDaFixa(est, { id: 'u-1' }, 'producao')).toBe('producao#ab12');
    expect(cozinhaDaFixa(est, { id: 'u-1' }, 'seco#pp22')).toBe('producao#ab12');
    expect(cozinhaDaFixa(est, { id: null }, 'producao#ab12')).toBe('producao');
  });

  it('a etiqueta só sai quando o aparelho já conhece a unidade — e nunca com unidade arquivada', () => {
    expect(bloqueioDaFixa(null, [U1], null)).toBe('');
    expect(bloqueioDaFixa({ id: null }, [U1], null)).toBe('');
    expect(bloqueioDaFixa({ id: 'u-1' }, [U1], 'u-1')).toBe('');
    expect(bloqueioDaFixa({ id: 'u-1' }, [], null)).toMatch(/Carregando/);
    expect(bloqueioDaFixa({ id: 'u-1' }, [{ ...U1, arquivada_em: '2026-09-23' }], null)).toMatch(/arquivada/);
  });

  it('o banco trava: a pessoa não se solta sozinha, a diretoria não é presa, a impressão grava a unidade dela', () => {
    const sql = ler('../../lib/migration48_equipe_e_catalogo_por_unidade.sql');
    expect(sql).toMatch(/create trigger trg_unidade_da_conta before update on perfis/);
    expect(sql).toMatch(/coalesce\(current_setting\('aurum\.muda_unidade', true\), ''\) <> '1'/);
    expect(sql).toMatch(/raise exception 'A diretoria trabalha em todas as unidades\.'/);
    expect(sql).toMatch(/case when coalesce\(v_fixa, false\)\s*then \(select u\.id from unidades u where u\.restaurante_id = rid and u\.id = v_uni\)/);
    expect(sql).toMatch(/and \(not coalesce\(v_fixa, false\) or e\.unidade_id is not distinct from v_uni\)/);
  });

  it('as telas respeitam a trava', () => {
    expect(ler('../../components/SeletorModulo.jsx')).toMatch(/const visiveis = estoquesAtivos\(estoquesPermitidos \|\| estoques\);/);
    expect(ler('../../components/Layout.jsx')).toMatch(/\(soEtiq && \(!variasUnidades \|\| unidadeFixa\)\) \|\| semCozinhas/);
    const ep = ler('../../components/EtiquetaPrint.jsx');
    expect(ep).toMatch(/const bloqueioUnidade = bloqueioDaFixa\(unidadeFixa, unidades, unidadeAtual\?\.id \|\| null\);/);
    expect(ep).toMatch(/faltaResponsavel \|\| !!bloqueioUnidade\}>/);
    expect(ler('../../pages/RelatorioEtiquetas.jsx')).toMatch(/const comUnidades = !unidadeFixa && /);
    expect(ler('../../pages/Balanco.jsx')).toMatch(/const variasUnidades = temUnidadesExtras\(unidades\) && !unidadeFixa;/);
    expect(ler('../../components/SeletorVisao.jsx')).toMatch(/estoquesAtivos\(estoquesPermitidos \|\| estoques\)/);
  });

  it('a conta dona escolhe a unidade de cada conta, nos dois planos', () => {
    expect(ler('../../pages/etiquetas/Ajustes.jsx')).toMatch(/<CartaoEquipeDasUnidades \/>/);
    expect(ler('../../pages/Estoques.jsx')).toMatch(/<CartaoEquipeDasUnidades \/>/);
    const auth = ler('../../store/AuthContext.jsx');
    expect(auth).toMatch(/supabase\.rpc\('definir_unidade_da_conta'/);
    expect(auth).toMatch(/unidadeFixa:\s+unidadeFixaDe\(perfil\)/);
    // a mudança chega ao aparelho da equipe sem precisar entrar de novo
    expect(auth).toMatch(/if \(meuPerfil\) campos\.unidadeFixa = unidadeFixaDe\(meuPerfil\);/);
  });
});
