// =====================================================================
//  LOTE 1 DA AUDITORIA GERAL (14/10/2026) — correções rápidas.
//  Ver AUDITORIA_GERAL_2026-10-14.md. Sempre que dá, o teste confere o
//  COMPORTAMENTO (a função), não o texto do código.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fmtNum } from '../formatters';
import { nomeProduto, nomeDestino, ITEM_APAGADO, DESTINO_REMOVIDO } from '../calculos';
import { saidasPorDestinoDia, producaoPorItem } from '../relatorios';
import { topProdutosSaida } from '../analise';
import { rotuloMotivo } from '../../data/produtos';

const ler = (c) => readFileSync(new URL(c, import.meta.url), 'utf8');
const semComentarios = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('D1 — números com vírgula', () => {
  it('vírgula decimal, sem zero sobrando e sem separador de milhar', () => {
    expect(fmtNum(7.5)).toBe('7,5');
    expect(fmtNum('3.80')).toBe('3,8');
    expect(fmtNum(1.4)).toBe('1,4');
    expect(fmtNum(4)).toBe('4');
    expect(fmtNum(1500)).toBe('1500');
    expect(fmtNum(1.234)).toBe('1,23');
    expect(fmtNum(93.04, 1)).toBe('93');
    expect(fmtNum('abc')).toBe('0');
  });
});

describe('D2 — nome no lugar do código', () => {
  const produtos = [{ id: 'p1', nome: 'Picanha (porção)', unidade: 'unid' }];
  const locais = [{ id: 'fin', nome: 'Cozinha de Finalização' }];

  it('item ou destino que saiu do catálogo aparece por extenso, nunca pelo id', () => {
    expect(nomeProduto(produtos, 'p1')).toBe('Picanha (porção)');
    expect(nomeProduto(produtos, 'bib_frango_desfiado')).toBe(ITEM_APAGADO);
    expect(nomeDestino(locais, 'fin')).toBe('Cozinha de Finalização');
    expect(nomeDestino(locais, 'unidade_centro')).toBe(DESTINO_REMOVIDO);
    expect(nomeDestino(locais, 'producao')).toBe('Produção');
  });

  it('os relatórios usam essa regra', () => {
    const saidas = [{ data: '2026-10-10', destino: 'unidade_centro', itens: [{ produtoId: 'sumiu', quantidade: 2 }] }];
    const [bloco] = saidasPorDestinoDia(saidas, produtos, locais);
    expect(bloco.destinoNome).toBe(DESTINO_REMOVIDO);
    expect(bloco.dias[0].itens[0].nome).toBe(ITEM_APAGADO);
    expect(bloco.totalPorItem[0].nome).toBe(ITEM_APAGADO);
    const prod = producaoPorItem([{ producaoId: 'x', itens: [{ produtoId: 'sumiu', quantidade: 3 }] }], produtos);
    expect(prod[0].nome).toBe(ITEM_APAGADO);
    expect(topProdutosSaida(produtos, [{ destino: 'fin', itens: [{ produtoId: 'sumiu', quantidade: 1 }] }])[0].nome).toBe(ITEM_APAGADO);
  });

  it('o Relatório da demonstração lê o catálogo da demo, não o padrão', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/const prodDemo = soEtiqRef\.current \? PRODUTOS_DEMO_ETIQUETAS : seedCat\.produtos;/);
  });
});

describe('D10 — motivo da perda por extenso', () => {
  it('a letra vira o nome; "Outro" usa o texto digitado', () => {
    expect(rotuloMotivo('V')).toBe('Vencimento');
    expect(rotuloMotivo('O', 'caiu no chão')).toBe('caiu no chão');
    expect(rotuloMotivo('O')).toBe('Outro');
  });
});

describe('D3 e D4 — um só "Minha senha"; catálogo nasce vazio; sem "Restaurar produtos padrão"', () => {
  const cfg = semComentarios(ler('../../pages/Configuracoes.jsx'));
  const app = semComentarios(ler('../../store/AppContext.jsx'));

  it('Configurações não tem mais o cartão de senha escrito à mão (só o CartaoMinhaSenha, da conta dona)', () => {
    expect(cfg).not.toMatch(/NovaSenha/);
    expect(cfg).toMatch(/<CartaoMinhaSenha toast=\{toast\} \/>/);
    expect(ler('../../components/config/CartaoMinhaSenha.jsx')).toMatch(/sessao\.eSuperAdmin \|\| sessao\.cargo !== 'diretoria'\) return null;/);
  });

  it('a conta nova começa sem itens e com as categorias da biblioteca', () => {
    expect(app).toMatch(/produtos: {3}\[\],\s*categorias: \[\.\.\.CATEGORIAS_BIBLIOTECA\],/);
    expect(app).not.toMatch(/PRODUTOS_BASE/);
  });

  it('não existe mais "Restaurar produtos padrão"', () => {
    expect(cfg).not.toMatch(/Restaurar produtos padrão|resetarProdutos/);
    expect(app).not.toMatch(/resetarProdutos/);
  });
});

describe('D7 — o aviso de vencimento usa o dia do aparelho', () => {
  it('sem toISOString (que vira o dia seguinte depois das 21h)', () => {
    const t = semComentarios(ler('../../components/AvisoVencimento.jsx'));
    expect(t).not.toMatch(/toISOString/);
    expect(t).toMatch(/const hojeStr = \(\) => hoje\(\);/);
  });
});

describe('toque e leitura', () => {
  it('nenhuma letra menor que 12 px nas telas', () => {
    for (const tela of ['../../pages/Configuracoes.jsx', '../../pages/Dashboard.jsx', '../../pages/Relatorio.jsx',
      '../../pages/Historico.jsx', '../../pages/etiquetas/Ajustes.jsx', '../../components/Layout.jsx', '../../components/NavBar.jsx']) {
      expect(ler(tela), tela).not.toMatch(/text-\[(8|9|10|11)px\]/);
    }
  });

  it('campos com 44 px por regra global, e o Imprimir da lista com 44 px', () => {
    expect(ler('../../index.css')).toMatch(/select \{\s*min-height: 2\.75rem;/);
    expect(ler('../../pages/Etiquetas.jsx')).toMatch(/font-bold text-sm px-4 min-h-11 rounded-xl flex-shrink-0 active:scale-95 transition-transform">\s*Imprimir/);
  });
});
