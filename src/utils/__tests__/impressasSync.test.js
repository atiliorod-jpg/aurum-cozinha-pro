// =====================================================================
//  Etiquetas impressas com VÁRIOS APARELHOS (23/09/2026)
//
//  O defeito: no conflito de versão, a lista do aparelho era trocada pela do
//  servidor, e a etiqueta que acabara de sair no papel sumia da aba
//  Impressas. Aqui um servidor de mentira, com o mesmo controle de versão da
//  migração 8, e dois aparelhos que seguem o MESMO caminho do AppContext:
//  acumular pendências ao gravar, juntar no conflito, confirmar no ok.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ehChaveImpressas, diferencaImpressas, acumularPendencias, aplicarPendencias,
  limparConfirmadas, unirImpressas, semPendencias, iguais, PENDENCIAS_VAZIAS,
} from '../impressasSync';

const etq = (id, extra = {}) => ({ id, nome: `Item ${id}`, status: 'valida', impressoEm: '2026-09-23', ...extra });
const ids = (lista) => lista.map(e => e.id);

// ── simulação: servidor versionado + aparelhos ─────────────────────────
function servidor() {
  return { dados: [], versao: 0 };
}
// salvar_documento da migração 8: grava se a versão bate (ou -1 força)
function salvarNoServidor(srv, dados, versao) {
  if (versao !== -1 && versao !== srv.versao) return { conflito: true, dados: srv.dados, versao: srv.versao };
  srv.dados = JSON.parse(JSON.stringify(dados)); // o banco devolve cópia
  srv.versao += 1;
  return { ok: true, versao: srv.versao };
}
function aparelho(srv) {
  return { lista: JSON.parse(JSON.stringify(srv.dados)), versao: srv.versao, pend: PENDENCIAS_VAZIAS };
}
// o que o AppContext faz: persistCatalogo + salvarDocNuvem (com até 3 tentativas)
function gravar(ap, srv, novaLista, { online = true } = {}) {
  ap.pend = acumularPendencias(ap.pend, diferencaImpressas(ap.lista, novaLista));
  ap.lista = novaLista;
  if (!online) return 'fila';
  let envio = novaLista;
  for (let t = 0; t < 4; t++) {
    const r = salvarNoServidor(srv, envio, ap.versao);
    if (r.ok) { ap.versao = r.versao; ap.pend = limparConfirmadas(ap.pend, envio); return 'ok'; }
    ap.versao = r.versao;
    const junta = aplicarPendencias(r.dados, ap.pend);
    ap.lista = junta;
    if (junta === r.dados) return 'nada';
    envio = junta;
  }
  return 'desistiu';
}
// tempo real: chega a lista de outro aparelho
function receberTempoReal(ap, srv) {
  ap.versao = srv.versao;
  ap.lista = aplicarPendencias(JSON.parse(JSON.stringify(srv.dados)), ap.pend);
}
// o replay da fila offline (regravarImpressas)
function reenviarFila(ap, srv) {
  const junta = aplicarPendencias(srv.dados, ap.pend);
  if (junta === srv.dados) return 'nada';
  const r = salvarNoServidor(srv, junta, srv.versao);
  ap.versao = r.versao; ap.pend = limparConfirmadas(ap.pend, junta); ap.lista = junta;
  return 'ok';
}

describe('impressas com dois aparelhos — o caso que o dono vive', () => {
  it('A dorme, B imprime, A acorda e imprime: as DUAS etiquetas ficam, nos dois aparelhos', () => {
    const srv = servidor();
    const A = aparelho(srv);
    const B = aparelho(srv);
    // A imprime a primeira do dia
    expect(gravar(A, srv, [...A.lista, etq('a1')])).toBe('ok');
    receberTempoReal(B, srv);
    // A entra no descanso de tela (perde o tempo real); B imprime duas
    expect(gravar(B, srv, [...B.lista, etq('b1')])).toBe('ok');
    expect(gravar(B, srv, [...B.lista, etq('b2')])).toBe('ok');
    // A acorda com a lista velha e imprime: conflito → junta
    expect(gravar(A, srv, [...A.lista, etq('a2')])).toBe('ok');
    expect(ids(srv.dados)).toEqual(['a1', 'b1', 'b2', 'a2']);
    expect(ids(A.lista)).toEqual(['a1', 'b1', 'b2', 'a2']); // a etiqueta de A NÃO sumiu da tela
    expect(semPendencias(A.pend)).toBe(true);
    receberTempoReal(B, srv);
    expect(ids(B.lista)).toEqual(['a1', 'b1', 'b2', 'a2']);
  });

  it('o mesmo aparelho imprimindo duas vezes antes da primeira resposta não perde a segunda', () => {
    const srv = servidor();
    const A = aparelho(srv);
    // as duas gravações saem com a MESMA versão conhecida (a resposta não voltou)
    const versaoAntes = A.versao;
    A.pend = acumularPendencias(A.pend, diferencaImpressas(A.lista, [etq('x1')]));
    A.lista = [etq('x1')];
    const primeira = [...A.lista];
    A.pend = acumularPendencias(A.pend, diferencaImpressas(A.lista, [...A.lista, etq('x2')]));
    A.lista = [...A.lista, etq('x2')];
    const segunda = [...A.lista];
    expect(salvarNoServidor(srv, primeira, versaoAntes).ok).toBe(true);
    A.pend = limparConfirmadas(A.pend, primeira);
    const r = salvarNoServidor(srv, segunda, versaoAntes);
    expect(r.conflito).toBe(true);
    const junta = aplicarPendencias(r.dados, A.pend);
    expect(ids(junta)).toEqual(['x1', 'x2']);
  });

  it('etiqueta apagada pela dona num aparelho NÃO ressuscita pelo outro', () => {
    const srv = servidor();
    const A = aparelho(srv);
    gravar(A, srv, [etq('e1'), etq('e2')]);
    const B = aparelho(srv); // B tem e1 e e2
    // A (conta dona) apaga e1 — M44
    gravar(A, srv, A.lista.filter(e => e.id !== 'e1'));
    // B, sem ter recebido o tempo real, imprime: conflito → junta
    gravar(B, srv, [...B.lista, etq('e3')]);
    expect(ids(srv.dados)).toEqual(['e2', 'e3']);
  });

  it('situação trocada no Pro (Validades) de um lado e etiqueta nova do outro: as duas valem', () => {
    const srv = servidor();
    const A = aparelho(srv);
    gravar(A, srv, [etq('v1'), etq('v2')]);
    const B = aparelho(srv);
    gravar(A, srv, A.lista.map(e => (e.id === 'v1' ? { ...e, status: 'consumida' } : e)));
    gravar(B, srv, [...B.lista, etq('v3')]);
    expect(srv.dados.find(e => e.id === 'v1').status).toBe('consumida');
    expect(ids(srv.dados)).toEqual(['v1', 'v2', 'v3']);
  });

  it('sem internet: o que A imprimiu offline sobe JUNTO com o que B imprimiu, sem apagar nada', () => {
    const srv = servidor();
    const A = aparelho(srv);
    gravar(A, srv, [etq('o1')]);
    const B = aparelho(srv);
    // A perde a internet e imprime duas
    expect(gravar(A, srv, [...A.lista, etq('o2')], { online: false })).toBe('fila');
    gravar(A, srv, [...A.lista, etq('o3')], { online: false });
    // B, com internet, imprime
    gravar(B, srv, [...B.lista, etq('b9')]);
    // a internet volta para A: o replay junta em vez de gravar por cima
    expect(reenviarFila(A, srv)).toBe('ok');
    expect(ids(srv.dados)).toEqual(['o1', 'b9', 'o2', 'o3']);
    expect(semPendencias(A.pend)).toBe(true);
  });

  it('a lista podada (etiqueta velha que sai) também vale no outro aparelho', () => {
    const srv = servidor();
    const A = aparelho(srv);
    gravar(A, srv, [etq('p1'), etq('p2')]);
    const B = aparelho(srv);
    gravar(A, srv, [...A.lista.filter(e => e.id !== 'p1'), etq('p3')]); // poda p1
    gravar(B, srv, [...B.lista, etq('p4')]);
    expect(ids(srv.dados)).toEqual(['p2', 'p3', 'p4']);
  });
});

describe('impressas — as peças', () => {
  it('reconhece a chave de qualquer cozinha, e só ela', () => {
    expect(ehChaveImpressas('etiquetasImpressas')).toBe(true);
    expect(ehChaveImpressas('seco::etiquetasImpressas')).toBe(true);
    expect(ehChaveImpressas('producao#ab12::etiquetasImpressas')).toBe(true);
    expect(ehChaveImpressas('etiquetasAvulsas')).toBe(false);
    expect(ehChaveImpressas('produtos')).toBe(false);
    expect(ehChaveImpressas(undefined)).toBe(false);
  });

  it('a ordem das chaves que o banco devolve não faz a etiqueta parecer alterada', () => {
    expect(iguais({ id: 'a', nome: 'X', status: 'valida' }, { status: 'valida', id: 'a', nome: 'X' })).toBe(true);
    const dif = diferencaImpressas([{ status: 'valida', id: 'a', nome: 'X' }], [{ id: 'a', nome: 'X', status: 'valida' }]);
    expect(dif).toEqual({ up: [], rm: [] });
  });

  it('sem pendência, devolve a MESMA lista (ninguém regrava à toa)', () => {
    const lista = [etq('a')];
    expect(aplicarPendencias(lista, PENDENCIAS_VAZIAS)).toBe(lista);
    expect(aplicarPendencias(lista, undefined)).toBe(lista);
    expect(unirImpressas(lista, lista)).toBe(lista);
  });

  it('apagar e reimprimir a mesma etiqueta: a última ação vale', () => {
    let p = acumularPendencias(PENDENCIAS_VAZIAS, { up: [etq('z')], rm: [] });
    p = acumularPendencias(p, { up: [], rm: ['z'] });
    expect(p.up).toEqual({});
    expect(p.rm).toEqual(['z']);
    p = acumularPendencias(p, { up: [etq('z')], rm: [] });
    expect(Object.keys(p.up)).toEqual(['z']);
    expect(p.rm).toEqual([]);
  });

  it('a confirmação só tira a pendência IGUAL à que foi enviada', () => {
    const enviada = etq('c', { status: 'valida' });
    const depois = etq('c', { status: 'descartada' }); // mudou de novo antes da resposta
    const p = { up: { c: depois }, rm: ['velha'] };
    const limpo = limparConfirmadas(p, [enviada]);
    expect(limpo.up.c).toEqual(depois); // continua pendente
    expect(limpo.rm).toEqual([]); // 'velha' não estava no enviado: remoção confirmada
  });

  it('item da fila de antes desta versão (sem pendências): junta sem apagar nada', () => {
    const srv = [etq('s1'), etq('s2')];
    expect(ids(unirImpressas(srv, [etq('s1'), etq('l1')]))).toEqual(['s1', 's2', 'l1']);
  });
});

describe('impressas — o app usa essas regras em todos os caminhos', () => {
  const app = readFileSync(new URL('../../store/AppContext.jsx', import.meta.url), 'utf8');

  it('ao gravar, guarda o que este aparelho mudou', () => {
    expect(app).toMatch(/if \(nuvemDe\(r\) && ehChaveImpressas\(chave\)\) \{\s*gravarPend\(r, chave, acumularPendencias\(lerPend\(r, chave\), diferencaImpressas\(cacheGet\(r, chave, \[\]\), valor\)\)\);/);
  });

  it('no ok confirma; no conflito junta e regrava — sem o aviso de "refaça"', () => {
    expect(app).toMatch(/if \(ehChaveImpressas\(chave\)\) gravarPend\(r, chave, limparConfirmadas\(lerPend\(r, chave\), dadosDoc\)\);/);
    expect(app).toMatch(/if \(ehChaveImpressas\(chave\) && tentativa < 3\) \{\s*const junta = aplicarPendencias\(data\.dados, lerPend\(r, chave\)\);/);
    // o return vem ANTES do aviso de conflito
    const ramo = app.slice(app.indexOf('if (ehChaveImpressas(chave) && tentativa < 3)'));
    expect(ramo.indexOf('return;')).toBeLessThan(ramo.indexOf("'catalogo-conflito'"));
  });

  it('tempo real e hidratação põem as pendências por cima da lista do servidor', () => {
    expect(app).toMatch(/\[k\('etiquetasImpressas'\)\]: \(d\) => aplicarPendencias\(d, lerPend\(rid, k\('etiquetasImpressas'\)\)\)/);
    expect(app).toMatch(/aplicaCat\(k\('etiquetasImpressas'\), setEtiquetasImpressasRaw, P\.etiquetasImpressas,\s*\(d\) => aplicarPendencias\(d, lerPend\(rid, k\('etiquetasImpressas'\)\)\)\)/);
  });

  it('a fila offline junta com o servidor em vez de gravar por cima', () => {
    expect(app).toMatch(/ehChaveImpressas\(item\.payload\?\.chave\)\)\s*\(\{ error \} = await regravarImpressas\(item\)\);/);
    expect(app).toMatch(/_comPendencias: true/);
    expect(app).toMatch(/p_versao: atual \? \(atual\.versao \|\| 0\) : -1/);
  });

  it('resposta que chega depois de trocar de cozinha não vai para a tela da outra', () => {
    expect(app).toMatch(/if \(ridRef\.current === r && chaveDe\(\) === chave\) setRaw\(dadosSrv\);/);
  });
});
