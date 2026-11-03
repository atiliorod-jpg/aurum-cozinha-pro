import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  nomeDeGrupo, gruposDoProduto, comGrupos, estaNoGrupo, ordemDosGrupos, moverGrupo,
  renomearGrupo, removerGrupo, itensNoGrupo, gruposDoTexto,
} from '../grupos';
import { CATEGORIAS_BIBLIOTECA } from '../../data/bibliotecaEtiquetas';
import { lerPlanilhaDeItens, linhaDoItem, mesclarItens } from '../planilhaItens';

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// =====================================================================
//  LOTE 11, PARTE 2 (03/11/2026) — grupos da casa, vistos no Suflex: o dono
//  cria, renomeia, ordena e apaga; o item fica em VÁRIOS, escolhidos na
//  ficha; a tela de imprimir filtra por eles. O primeiro é o principal e
//  continua gravado em `categoria`, que o estoque lê.
// =====================================================================

const frango = { id: 'f', nome: 'Frango', ativo: true, categoria: 'AVES' };
const picanha = { id: 'p', nome: 'Picanha', ativo: true, categoria: 'BOVINOS' };

describe('os grupos do item', () => {
  it('item antigo: só a categoria', () => {
    expect(gruposDoProduto(frango)).toEqual(['AVES']);
    expect(gruposDoProduto({})).toEqual([]);
  });
  it('a lista nova vale, e a categoria acompanha o principal', () => {
    const f = comGrupos(frango, ['almoço de funcionários', 'AVES', 'AVES']);
    expect(f.grupos).toEqual(['ALMOÇO DE FUNCIONÁRIOS', 'AVES']);
    expect(f.categoria).toBe('ALMOÇO DE FUNCIONÁRIOS');
    expect(estaNoGrupo(f, 'AVES')).toBe(true);
  });
  it('o nome é guardado em maiúsculas, sem espaço sobrando', () => {
    expect(nomeDeGrupo('  almoço   de funcionários ')).toBe('ALMOÇO DE FUNCIONÁRIOS');
  });
});

describe('a ordem dos grupos', () => {
  it('conta nova: a da biblioteca, como antes desta versão', () => {
    expect(ordemDosGrupos([...CATEGORIAS_BIBLIOTECA, 'VEGANOS'])).toEqual([...CATEGORIAS_BIBLIOTECA, 'VEGANOS']);
  });
  it('a lista da casa manda; os da biblioteca fora dela vão para o fim', () => {
    const o = ordemDosGrupos(['VEGANOS', 'AVES']);
    expect(o.slice(0, 2)).toEqual(['VEGANOS', 'AVES']);
    expect(o).toContain('BOVINOS');
  });
  it('sobe e desce, e não passa das pontas', () => {
    expect(moverGrupo(['A', 'B', 'C'], 'C', -1)).toEqual(['A', 'C', 'B']);
    expect(moverGrupo(['A', 'B'], 'A', -1)).toEqual(['A', 'B']);
  });
});

describe('renomear e remover', () => {
  it('renomear troca na lista E nos itens (categoria e grupos)', () => {
    const itens = [comGrupos(frango, ['AVES', 'ALMOÇO']), picanha];
    const r = renomearGrupo(itens, ['AVES', 'BOVINOS', 'ALMOÇO'], 'ALMOÇO', 'almoço da equipe');
    expect(r.categorias).toEqual(['AVES', 'BOVINOS', 'ALMOÇO DA EQUIPE']);
    expect(r.produtos[0].grupos).toEqual(['AVES', 'ALMOÇO DA EQUIPE']);
    expect(r.produtos[1]).toBe(picanha);
    const r2 = renomearGrupo(itens, ['AVES', 'BOVINOS', 'ALMOÇO'], 'AVES', 'Aves 2');
    expect(r2.produtos[0].categoria).toBe('AVES 2');
  });
  it('nome vazio ou de outro grupo não passa', () => {
    expect(renomearGrupo([], ['A', 'B'], 'A', ' ').erro).toMatch(/Dê um nome/);
    expect(renomearGrupo([], ['A', 'B'], 'A', 'b').erro).toMatch(/Já existe/);
  });
  it('⚠️ remover trava se algum item ficaria sem grupo', () => {
    const r = removerGrupo([frango, picanha], ['AVES', 'BOVINOS'], 'BOVINOS');
    expect(r.presos.map(p => p.id)).toEqual(['p']);
    expect(r.categorias).toBeUndefined();
  });
  it('remover tira o grupo do item que tem outros, e o principal passa adiante', () => {
    const itens = [comGrupos(frango, ['AVES', 'ALMOÇO'])];
    const r = removerGrupo(itens, ['AVES', 'ALMOÇO'], 'AVES');
    expect(r.categorias).toEqual(['ALMOÇO']);
    expect(r.produtos[0].grupos).toEqual(['ALMOÇO']);
    expect(r.produtos[0].categoria).toBe('ALMOÇO');
  });
  it('item removido (inativo) não trava nem conta', () => {
    const inativo = { ...picanha, ativo: false };
    expect(removerGrupo([inativo], ['BOVINOS'], 'BOVINOS').presos).toEqual([]);
    expect(itensNoGrupo([inativo, frango], 'AVES')).toBe(1);
  });
});

describe('a planilha de itens com vários grupos', () => {
  const colunas = [{ k: 'nome' }, { k: 'categoria' }];
  it('baixa com ";" e o principal primeiro', () => {
    expect(linhaDoItem(comGrupos(frango, ['AVES', 'ALMOÇO']), colunas)).toEqual(['Frango', 'AVES; ALMOÇO']);
    expect(linhaDoItem(frango, colunas)).toEqual(['Frango', 'AVES']);
  });
  it('lê de volta: grupos e categoria', () => {
    const { itens } = lerPlanilhaDeItens([['Nome *', 'Grupo *'], ['Frango', 'aves; almoço da equipe']]);
    expect(itens[0].grupos).toEqual(['AVES', 'ALMOÇO DA EQUIPE']);
    expect(itens[0].categoria).toBe('AVES');
    expect(gruposDoTexto('A;;b ')).toEqual(['A', 'B']);
  });
  it('a importação troca os grupos do item casado', () => {
    const { produtos } = mesclarItens([frango], [{ nome: 'Frango', grupos: ['ALMOÇO', 'AVES'], categoria: 'ALMOÇO' }]);
    expect(gruposDoProduto(produtos[0])).toEqual(['ALMOÇO', 'AVES']);
    expect(produtos[0].categoria).toBe('ALMOÇO');
  });
});

describe('as telas usam os grupos', () => {
  it('a ficha grava os grupos com a categoria espelhada, e todo grupo novo entra na lista da casa', () => {
    const t = ler('../../pages/etiquetas/Itens.jsx');
    expect(t).toMatch(/\.\.\.comGrupos\(\{\}, form\.grupos\?\.length \? form\.grupos : \[form\.categoria\]\)/);
    expect(t).toMatch(/const novos = dados\.grupos\.filter\(g => !categorias\.includes\(g\)\);/);
    // o item precisa de pelo menos um grupo
    expect(t).toMatch(/if \(p\.grupos\.length === 1\) return p;/);
  });
  it('a tela de imprimir filtra por QUALQUER grupo do item e busca por eles', () => {
    const e = ler('../../pages/Etiquetas.jsx');
    expect(e).toMatch(/produtosAtivos\.filter\(p => estaNoGrupo\(p, catAtiva\)\)/);
    expect(e).toMatch(/casaBusca\(busca, p\.nome, \.\.\.gruposDoProduto\(p\)\)/);
    expect(e).toMatch(/ordemDosGrupos\(categorias\)/);
  });
  it('a planilha põe na lista da casa todos os grupos, não só o principal', () => {
    expect(ler('../../components/PlanilhaDeItens.jsx')).toMatch(/itens\.flatMap\(i => i\.grupos \|\| \[i\.categoria\]\)/);
  });
});
