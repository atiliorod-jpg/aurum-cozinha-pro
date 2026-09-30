// =====================================================================
//  BAIXA PELA ETIQUETA (M59, 30/09/2026)
//  QR + código na etiqueta do Pro; leitura contínua; saída/perda/usado
//  atômicos no banco, com desfazer; estoque abatido pela validade da
//  embalagem.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  embalagensRestantes, proximaEmbalagem, acoesDaCozinha, quantidadeDaEmbalagem, validadeDaEmbalagem,
  deOutraCozinha, registroDaBaixa, codigoLegivel, novaBaixaId, podeDesfazer, motivoParaPerguntar,
  normalizarCodigo, candidatosDoCodigo,
} from '../baixaEtiqueta';
import { calcLotes } from '../lotes';
import { bitmapDoQR } from '../tsplBitmap';
import { etiquetaTSPL, medirEtiqueta } from '../tspl';
import { interpretarTSPL } from '../tsplPreview';
import { montarCamposEtiqueta, montarPayloadQR } from '../etiquetas';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const HOJE = '2026-09-30';
const etq = (extra = {}) => ({
  id: 'k3f9x2ab', nome: 'Frango desfiado', produtoId: 'frango', medida: '1 kg', validade: '2026-10-03',
  copias: 5, baixadas: 0, status: 'valida', ...extra,
});
const frango = { id: 'frango', nome: 'Frango desfiado', unidade: 'kg' };

describe('quantas embalagens restam (um código por lote)', () => {
  it('conta pelo contador do banco', () => {
    expect(embalagensRestantes(etq())).toBe(5);
    expect(embalagensRestantes(etq({ baixadas: 2 }))).toBe(3);
    expect(embalagensRestantes(etq({ baixadas: 5, status: 'consumida' }))).toBe(0);
    expect(proximaEmbalagem(etq({ baixadas: 1 }))).toEqual({ numero: 2, de: 5 });
  });

  it('linha antiga sem cópias vale 1; marcada à mão antes da M59 vale como toda baixada', () => {
    expect(embalagensRestantes({ id: 'x', status: 'valida' })).toBe(1);
    expect(embalagensRestantes({ id: 'x', copias: 3, status: 'descartada' })).toBe(0);
    expect(embalagensRestantes(null)).toBe(0);
  });
});

describe('os botões de cada cozinha (decisão do dono)', () => {
  it('Produção e Seco: saída, perda e usado; Finalização: perda e usado', () => {
    expect(acoesDaCozinha('producao')).toEqual(['saida', 'perda', 'usada']);
    expect(acoesDaCozinha('seco')).toEqual(['saida', 'perda', 'usada']);
    expect(acoesDaCozinha('finalizacao')).toEqual(['perda', 'usada']);
  });

  it('etiqueta de outra cozinha é reconhecida', () => {
    expect(deOutraCozinha(etq({ cozinha: 'seco' }), 'producao')).toBe(true);
    expect(deOutraCozinha(etq({ cozinha: 'producao' }), 'producao')).toBe(false);
    expect(deOutraCozinha(etq(), 'producao')).toBe(false); // sem cozinha = a aberta
  });
});

describe('quantidade e validade da embalagem', () => {
  it('a medida da etiqueta, na unidade do item; sem medida, pergunta', () => {
    expect(quantidadeDaEmbalagem(etq(), frango)).toBe(1);
    expect(quantidadeDaEmbalagem(etq({ medida: '150 g' }), frango)).toBe(0.15);
    expect(quantidadeDaEmbalagem(etq({ medida: '' }), frango)).toBeNull();
    expect(quantidadeDaEmbalagem(etq({ medida: '' }), { unidade: 'unid' })).toBe(1); // em unidades, 1 por embalagem
  });

  it('vencida e dias', () => {
    expect(validadeDaEmbalagem(etq(), HOJE)).toMatchObject({ vencida: false, dias: 3, texto: 'vence em 3 dias' });
    expect(validadeDaEmbalagem(etq({ validade: '2026-09-28' }), HOJE)).toMatchObject({ vencida: true, texto: 'venceu há 2 dias' });
    expect(validadeDaEmbalagem(etq({ validade: HOJE }), HOJE).texto).toBe('vence hoje');
  });
});

describe('o lançamento que a baixa gera tem o formato dos manuais', () => {
  const base = { etq: etq(), produto: frango, quantidade: 1, responsavel: 'Maria', turno: 'Manhã', dia: HOJE, hora: '10:00', baixaId: 'bx_teste123' };

  it('saída: um item com a validade da embalagem e o destino', () => {
    const r = registroDaBaixa({ ...base, acao: 'saida', destino: 'finalizacao' });
    expect(r).toMatchObject({ data: HOJE, destino: 'finalizacao', etiquetaId: 'k3f9x2ab', baixaId: 'bx_teste123' });
    expect(r.itens).toEqual([{ produtoId: 'frango', quantidade: 1, validade: '2026-10-03', etiquetaId: 'k3f9x2ab' }]);
  });

  it('perda: origem estoque, na unidade do item; vencida vira motivo "vencimento"', () => {
    const r = registroDaBaixa({ ...base, acao: 'perda' });
    expect(r).toMatchObject({ origem: 'estoque', produtoId: 'frango', quantidade: 1, unidade: 'kg', motivo: 'O', validade: '2026-10-03' });
    expect(registroDaBaixa({ ...base, acao: 'perda', etq: etq({ validade: '2026-09-01' }) }).motivo).toBe('V');
    expect(registroDaBaixa({ ...base, acao: 'perda', motivo: 'A' }).motivo).toBe('A');
  });

  it('usado não gera lançamento (só marca a embalagem)', () => {
    expect(registroDaBaixa({ ...base, acao: 'usada' })).toBeNull();
  });

  it('código legível, id de baixa no formato do banco, desfazer em 24 horas', () => {
    expect(codigoLegivel('k3f9x2ab')).toBe('K3F9-X2AB');
    expect(novaBaixaId()).toMatch(/^bx_[a-z0-9_]{6,40}$/);
    const agora = Date.now();
    expect(podeDesfazer(agora - 23 * 3600e3, agora)).toBe(true);
    expect(podeDesfazer(agora - 25 * 3600e3, agora)).toBe(false);
  });
});

describe('código digitado com letra parecida (O/0, I/L/1)', () => {
  it('normaliza e gera as variações, com teto', () => {
    expect(normalizarCodigo('O07Y-MQ3T'.replace('-', ''))).toBe(normalizarCodigo('007ymq3t'));
    expect(candidatosDoCodigo('o07ymq3t')).toEqual(expect.arrayContaining(['o07ymq3t', '007ymq3t', '0o7ymq3t', 'oo7ymq3t']));
    expect(candidatosDoCodigo('abcdefgh')).toEqual(['abcdefgh']);
    // oito letras ambíguas: não vira varredura
    expect(candidatosDoCodigo('1111iill')).toEqual(['1111iill']);
  });
});

describe('modo rápido: lança direto, a não ser que algo peça um olhar', () => {
  const ctx = { modulo: 'producao', produto: frango, hojeISO: HOJE };
  it('tudo certo: lança', () => {
    expect(motivoParaPerguntar(etq(), 'saida', ctx)).toBeNull();
    expect(motivoParaPerguntar(etq(), 'usada', ctx)).toBeNull();
  });
  it('abre a folha quando: acabou, outra cozinha, ação que não existe aqui, avulsa, sem medida, vencida na saída', () => {
    expect(motivoParaPerguntar(etq({ baixadas: 5 }), 'saida', ctx)).toBe('acabou');
    expect(motivoParaPerguntar(etq({ cozinha: 'seco' }), 'saida', ctx)).toBe('outra_cozinha');
    expect(motivoParaPerguntar(etq(), 'saida', { ...ctx, modulo: 'finalizacao' })).toBe('acao_indisponivel');
    expect(motivoParaPerguntar(etq({ produtoId: null }), 'perda', ctx)).toBe('avulsa');
    expect(motivoParaPerguntar(etq({ medida: '' }), 'saida', ctx)).toBe('sem_quantidade');
    expect(motivoParaPerguntar(etq({ validade: '2026-09-01' }), 'saida', ctx)).toBe('vencida');
    // a perda do vencido é justamente o que se quer: lança direto
    expect(motivoParaPerguntar(etq({ validade: '2026-09-01' }), 'perda', ctx)).toBeNull();
  });
});

describe('o estoque abate o lote da validade da embalagem', () => {
  const entradas = [
    { ts: 1, itens: [{ produtoId: 'frango', quantidade: 3, validade: '2026-10-01' }] },
    { ts: 2, itens: [{ produtoId: 'frango', quantidade: 3, validade: '2026-10-05' }] },
  ];
  const restante = (saidas, desperdicio = []) =>
    Object.fromEntries(calcLotes(entradas, saidas, desperdicio, [frango]).frango.map(l => [l.validade, l.restante]));

  it('saída manual (sem validade): o que vence primeiro, como sempre', () => {
    expect(restante([{ ts: 3, itens: [{ produtoId: 'frango', quantidade: 1 }] }])).toEqual({ '2026-10-01': 2, '2026-10-05': 3 });
  });

  it('saída pela etiqueta: o lote DAQUELA validade', () => {
    expect(restante([{ ts: 3, itens: [{ produtoId: 'frango', quantidade: 1, validade: '2026-10-05' }] }])).toEqual({ '2026-10-01': 3, '2026-10-05': 2 });
  });

  it('perda pela etiqueta também; sem lote daquela validade, cai no FEFO', () => {
    expect(restante([], [{ ts: 3, origem: 'estoque', produtoId: 'frango', quantidade: 1, validade: '2026-10-05' }]))
      .toEqual({ '2026-10-01': 3, '2026-10-05': 2 });
    expect(restante([{ ts: 3, itens: [{ produtoId: 'frango', quantidade: 1, validade: '2027-01-01' }] }]))
      .toEqual({ '2026-10-01': 2, '2026-10-05': 3 });
  });

  it('mais do que o lote tem: o resto sai do que vence primeiro', () => {
    expect(restante([{ ts: 3, itens: [{ produtoId: 'frango', quantidade: 4, validade: '2026-10-05' }] }])).toEqual({ '2026-10-01': 2 });
  });
});

describe('o QR no papel (Bluetooth)', () => {
  const payload = montarPayloadQR({ loteId: 'k3f9x2ab' });

  it('o bitmap tem o tamanho certo e a polaridade do TSPL (bit 0 = preto)', () => {
    const b = bitmapDoQR(payload);
    expect(b.modulos).toBe(29);                  // versão 3
    expect(b.altura).toBe((29 + 2) * 4);         // 124 pontos = 15,5 mm
    expect(b.dados.length).toBe(b.bytesPorLinha * b.altura);
    // a margem (1 módulo = 4 pontos) é branca: primeira linha toda 0xFF
    expect([...b.dados.slice(0, b.bytesPorLinha)].every(c => c.charCodeAt(0) === 0xff)).toBe(true);
    // o canto do QR (padrão de localização) é preto logo depois da margem
    const linha = 4, x = 4;
    expect((b.dados.charCodeAt(linha * b.bytesPorLinha + (x >> 3)) >> (7 - (x & 7))) & 1).toBe(0);
    expect(bitmapDoQR('')).toBeNull();
  });

  it('a etiqueta leva o QR e o código no rodapé, e a prévia enxerga os dois', () => {
    const campos = montarCamposEtiqueta({ nome: 'Frango desfiado', dataFabricacao: '2026-09-30', diasValidade: 3, responsavel: 'Maria', restauranteNome: 'Restaurante Exemplo', loteId: 'k3f9x2ab' });
    const config = { larguraMm: 60, alturaMm: 50, campos: {}, estabelecimento: { cnpj: '11222333000181', endereco: 'Av. Domingos Ferreira, 1200', cidade: 'Recife - PE', cep: '51020-000' } };
    const qrBitmap = bitmapDoQR(payload);
    const tspl = etiquetaTSPL(campos, config, { qrBitmap, codigo: 'K3F9-X2AB' });
    expect(tspl).toMatch(/BITMAP \d+,\d+,16,124,0,/);
    expect(tspl).toMatch(/"K3F9-X2AB"/);
    // cabe no papel com o QR (o rodapé estreita e o endereço desce)
    expect(medirEtiqueta(campos, config, { qrBitmap, codigo: 'K3F9-X2AB' }).cabe).toBe(true);
    const desenho = interpretarTSPL(tspl).desenho;
    const qr = desenho.find(d => d.tipo === 'bitmap');
    expect(qr.dados.length).toBe(16 * 124);
    // o QR fica no canto direito (termina na margem direita: 480 - 20)
    expect(qr.x + 124).toBe(460);
  });
});

describe('as travas no código', () => {
  const app = ler('../../store/AppContext.jsx');
  const sql = ler('../../lib/migration59_baixa_pela_etiqueta.sql');

  it('a baixa é otimista mas desfeita se o banco recusar; a fila não duplica', () => {
    expect(app).toMatch(/supabase\.rpc\('baixar_etiqueta', args\)/);
    expect(app).toMatch(/if \(error\.code === 'P0001' \|\| ehErroDefinitivo\(error\.message\)\) recusarBaixa\(b, error\.message\);/);
    expect(app).toMatch(/else recusarBaixa\(b, data\.motivo\);/);
    expect(app).toMatch(/kind: 'baixaEtiqueta', op: 'rpc'/);
    // etiqueta impressa sem internet: a baixa espera atrás dela na fila
    expect(app).toMatch(/i\.kind === 'etiquetas' && \(i\.payload\?\.itens \|\| \[\]\)\.some\(e => e\.id === etq\.id\)/);
    // desfazer de baixa que nem subiu: só tira da fila
    expect(app).toMatch(/if \(pendente\) \{ outboxSet\(r, fila\.filter\(i => i !== pendente\)\); return; \}/);
  });

  it('o banco: atômico, idempotente, a cozinha e o item vêm da etiqueta, desfazer e Histórico coerentes', () => {
    expect(sql).toMatch(/for update;/);
    expect(sql).toMatch(/REENVIO DA FILA: a mesma baixa não conta duas vezes/);
    expect(sql).toMatch(/tipo_reg := case when e\.cozinha = 'producao' then base else e\.cozinha \|\| ':' \|\| base end;/);
    expect(sql).toMatch(/'produtoId', e\.produto_id, 'quantidade', qtd, 'validade', e\.validade/);
    expect(sql).toMatch(/create trigger trg_registro_da_baixa after update of deleted on registros/);
    expect(sql).toMatch(/if b\.criada_em < now\(\) - interval '1 day' then/);
  });

  it('o QR só no Pro, e a reimpressão mantém o código', () => {
    const ep = ler('../../components/EtiquetaPrint.jsx');
    expect(ep).toMatch(/const qrLigado = guardaHistorico && configEtiqueta\(prefs\)\.incluirQR !== false;/);
    expect(ep).toMatch(/_lotes: Array\.from\(\{ length: n \}, \(\) => i\.codigo \|\| gerarLoteId\(\)\)/);
    expect(ep).toMatch(/if \(item\.codigo\) return;/);
    expect(ler('../../pages/etiquetas/Impressas.jsx')).toMatch(/codigo: e\.id,/);
  });

  it('as portas: /ler e /q/CÓDIGO no Pro, Validades com "Dar baixa", câmera nativa ou jsQR', () => {
    const app2 = ler('../../App.jsx');
    expect(app2).toMatch(/<Route path="\/q\/:codigo" element=\{<LerEtiquetas \/>\} \/>/);
    expect(ler('../../components/LeitorQR.jsx')).toMatch(/await import\('jsqr'\)/);
    expect(ler('../../pages/Validades.jsx')).toMatch(/Dar baixa/);
  });
});
