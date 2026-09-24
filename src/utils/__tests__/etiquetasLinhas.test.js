// =====================================================================
//  ETIQUETAS IMPRESSAS EM LINHAS (M49, 24/09/2026) — o sistema mais leve
//
//  Antes: a lista de impressas de cada cozinha era UM documento regravado
//  inteiro a cada etiqueta (até 1,5 MB), mandado inteiro aos outros
//  aparelhos. Agora: uma linha por etiqueta; imprimir manda só as novas, o
//  tempo real só a linha que mudou.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ehChaveImpressas, cozinhaDaChaveImpressas, linhaParaEtiqueta, janelaDaLista,
  etiquetasDoDocumentoAntigo, juntarNaLista, aplicarLinhaNaLista, emLotes,
} from '../etiquetasLinhas';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const HOJE = '2026-09-24';
const etq = (id, extra = {}) => ({
  id, produtoId: 'p1', nome: `Item ${id}`, medida: '1 kg', validade: '2026-09-27', fabricacao: HOJE,
  armazenamento: 'refrigerado', tipoData: 'fabricacao', hora: '10:00', impressoEmHora: '10:00',
  responsavel: 'Maria', impressoEm: HOJE, impressaoId: null, status: 'valida', copias: 1, ...extra,
});

describe('o peso: cada etiqueta manda uma linha, não a lista', () => {
  it('um mês de uso: a lista antiga passava de meio MB; a linha de uma etiqueta tem menos de 1 KB', () => {
    const mes = Array.from({ length: 1500 }, (_, i) => etq(`l${i}`));
    const listaInteira = JSON.stringify(mes).length;
    const umaLinha = JSON.stringify({ ...etq('nova'), cozinha: 'producao' }).length;
    expect(listaInteira).toBeGreaterThan(400_000);
    expect(umaLinha).toBeLessThan(1_000);
    // o que viaja a cada etiqueta caiu mais de 1.000 vezes
    expect(listaInteira / umaLinha).toBeGreaterThan(1_000);
  });

  it('imprimir chama o banco só com as NOVAS (e a cozinha), em lotes', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/for \(const lote of emLotes\(novas\.map\(e => \(\{ \.\.\.e, cozinha \}\)\)\)\) \{/);
    expect(app).toMatch(/supabase\.rpc\('registrar_etiquetas', \{ p_itens: lote \}\)/);
    // e a lista inteira não é mais gravada como documento
    expect(app).not.toMatch(/persistCatalogo\('etiquetasImpressas'/);
    expect(app).not.toMatch(/setEtiquetasImpressas = /);
  });

  it('o tempo real traz só a linha nova ou alterada — e não ouve DELETE (não passa pela policy)', () => {
    const app = ler('../../store/AppContext.jsx');
    expect(app).toMatch(/event: 'INSERT', schema: 'public', table: 'etiquetas'/);
    expect(app).toMatch(/event: 'UPDATE', schema: 'public', table: 'etiquetas'/);
    expect(app).not.toMatch(/event: 'DELETE', schema: 'public', table: 'etiquetas'/);
    expect(app).not.toMatch(/event: '\*', schema: 'public', table: 'etiquetas'/);
  });
});

describe('as peças', () => {
  it('reconhece o documento antigo de qualquer cozinha e a cozinha dona dele', () => {
    expect(ehChaveImpressas('etiquetasImpressas')).toBe(true);
    expect(ehChaveImpressas('seco#ab12::etiquetasImpressas')).toBe(true);
    expect(ehChaveImpressas('etiquetasAvulsas')).toBe(false);
    expect(cozinhaDaChaveImpressas('etiquetasImpressas')).toBe('producao');
    expect(cozinhaDaChaveImpressas('seco#ab12::etiquetasImpressas')).toBe('seco#ab12');
  });

  it('a linha vira a etiqueta que as telas conhecem (a situação vem da coluna)', () => {
    const linha = { id: 'x1', status: 'consumida', dados: { ...etq('x1'), status: 'valida' } };
    expect(linhaParaEtiqueta(linha)).toMatchObject({ id: 'x1', status: 'consumida', nome: 'Item x1', medida: '1 kg' });
    expect(linhaParaEtiqueta({ id: 'y', dados: null })).toEqual({ id: 'y', status: 'valida' });
  });

  it('a janela da tela: impressas nos últimos 120 dias, ou vencimento de 30 dias atrás em diante', () => {
    expect(janelaDaLista(HOJE)).toEqual({ impressasDesde: '2026-05-27', vencidasDesde: '2026-08-25' });
  });

  it('imprimir de novo na mesma janela (mesmo QR) não duplica a linha na lista', () => {
    const lista = juntarNaLista([etq('a')], [etq('a'), etq('b'), etq('b')], HOJE);
    expect(lista.map(e => e.id)).toEqual(['a', 'b']);
  });

  it('o tempo real aplica nova, alterada e apagada', () => {
    let lista = [etq('a')];
    lista = aplicarLinhaNaLista(lista, { id: 'b', status: 'valida', dados: etq('b') });
    expect(lista.map(e => e.id)).toEqual(['a', 'b']);
    lista = aplicarLinhaNaLista(lista, { id: 'a', status: 'descartada', dados: etq('a') });
    expect(lista.find(e => e.id === 'a').status).toBe('descartada');
    expect(lista.map(e => e.id)).toEqual(['a', 'b']); // alterada fica no lugar
    lista = aplicarLinhaNaLista(lista, { id: 'b', status: 'valida', apagada_em: '2026-09-24T12:00:00Z', dados: etq('b') });
    expect(lista.map(e => e.id)).toEqual(['a']);
    const mesma = aplicarLinhaNaLista(lista, { id: 'zz', apagada_em: 'x' });
    expect(mesma).toBe(lista); // nada mudou: a mesma lista (não regrava o cache)
  });

  it('o documento antigo: só entra o que ainda não é linha, uma vez, e dentro da janela', () => {
    const doc = [etq('ja-e-linha'), etq('nova'), etq('nova'), etq('velha', { impressoEm: '2025-01-01', validade: '2025-01-05' })];
    const r = etiquetasDoDocumentoAntigo(doc, new Set(['ja-e-linha']), HOJE);
    expect(r.map(e => e.id)).toEqual(['nova']);
    expect(etiquetasDoDocumentoAntigo(undefined, [], HOJE)).toEqual([]);
  });

  it('lotes do tamanho que o banco aceita (400)', () => {
    const lotes = emLotes(Array.from({ length: 950 }, (_, i) => i));
    expect(lotes.map(l => l.length)).toEqual([400, 400, 150]);
    expect(emLotes([])).toEqual([]);
  });
});

describe('o app usa as linhas em todos os caminhos', () => {
  const app = ler('../../store/AppContext.jsx');

  it('ao abrir: busca as linhas DESTA cozinha, na janela, sem as apagadas — em páginas', () => {
    expect(app).toMatch(/buscarTodas\(\(\) => supabase\.from\('etiquetas'\)/);
    expect(app).toMatch(/\.eq\('restaurante_id', rid\)\.eq\('cozinha', moduloEfetivo\)\.is\('apagada_em', null\)/);
    expect(app).toMatch(/\.or\(`impresso_em\.gte\.\$\{impressasDesde\},validade\.gte\.\$\{vencidasDesde\}`\)/);
    // sem internet: a lista do cache fica (só troca quando a busca deu certo)
    expect(app).toMatch(/if \(!errEtq\) \{/);
  });

  it('o que um aparelho com a versão velha gravou no documento é absorvido', () => {
    expect(app).toMatch(/etiquetasDoDocumentoAntigo\(mapaDocs\?\.\[k\('etiquetasImpressas'\)\]/);
    expect(app).toMatch(/const absorverImpressas = async \(item\) => \{/);
    expect(app).toMatch(/ehChaveImpressas\(item\.payload\?\.chave\)\)\s*\(\{ error \} = await absorverImpressas\(item\)\);/);
  });

  it('sem internet vai para a fila e sobe depois (etiquetas e situação)', () => {
    expect(app).toMatch(/outboxAdd\(r, \{ kind: 'etiquetas', op: 'rpc', payload: \{ itens: lote \} \}\)/);
    expect(app).toMatch(/item\.kind === 'etiquetas' && item\.op === 'rpc'\)\s*\(\{ error \} = await supabase\.rpc\('registrar_etiquetas'/);
    expect(app).toMatch(/item\.kind === 'etiquetaStatus' && item\.op === 'rpc'\)\s*\(\{ error \} = await supabase\.rpc\('mudar_status_etiqueta'/);
  });

  it('as telas usam os gestos novos', () => {
    expect(ler('../../components/EtiquetaPrint.jsx')).toMatch(/adicionarEtiquetas\(novas\);/);
    expect(ler('../../pages/Validades.jsx')).toMatch(/mudarStatusEtiqueta\(etq\.id, status\);/);
    expect(ler('../../pages/etiquetas/Impressas.jsx')).toMatch(/tirarEtiquetaDaLista\(e\.id\);/);
    for (const tela of ['../../components/EtiquetaPrint.jsx', '../../pages/Validades.jsx', '../../pages/etiquetas/Impressas.jsx']) {
      expect(ler(tela), tela).not.toMatch(/setEtiquetasImpressas/);
    }
  });

  it('o banco: só leitura pela tabela, gravação idempotente, apagar é marcar, e o que existia foi copiado', () => {
    const sql = ler('../../lib/migration49_etiquetas_em_linhas.sql');
    expect(sql).toMatch(/create policy "etiquetas_sel_v49" on etiquetas for select/);
    expect(sql).toMatch(/on conflict \(restaurante_id, id\) do nothing;\s*get diagnostics novas = row_count;/);
    expect(sql).toMatch(/update etiquetas set apagada_em = now\(\), atualizado_em = now\(\)/);
    expect(sql).toMatch(/if coalesce\(meu_cargo\(\), ''\) <> 'diretoria' then\s*raise exception 'Só a conta dona do restaurante apaga uma etiqueta impressa\.'/);
    expect(sql).toMatch(/cross join lateral jsonb_array_elements\(/);
    expect(sql).toMatch(/alter publication supabase_realtime add table etiquetas;/);
  });
});
