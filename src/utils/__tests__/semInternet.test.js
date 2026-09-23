// =====================================================================
//  USO SEM INTERNET (23/09/2026) — o limite de 72 h, o relógio atrasado e a
//  abertura do app sem Wi-Fi (que antes dava "Cadastro incompleto").
// =====================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  situacaoSemInternet, desvioDoRelogio, horaConfiavel, portaoSemInternet, textoDoBloqueio,
  JANELA_SEM_INTERNET_MS, FOLGA_DO_RELOGIO_MS,
} from '../semInternet';
import { statusAssinatura } from '../assinatura';
import { limparCacheLocal } from '../../lib/cache';

const H = 60 * 60 * 1000;
const D = 24 * H;
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('sem internet: até 72 horas depois da última confirmação', () => {
  const confirmadoEm = Date.parse('2026-09-23T10:00:00Z');

  it('dentro das 72 h, funciona', () => {
    expect(situacaoSemInternet({ confirmadoEm }, confirmadoEm + 1 * H).ok).toBe(true);
    expect(situacaoSemInternet({ confirmadoEm }, confirmadoEm + 71 * H).ok).toBe(true);
    expect(situacaoSemInternet({ confirmadoEm }, confirmadoEm + 1 * H).ate).toBe(confirmadoEm + JANELA_SEM_INTERNET_MS);
  });

  it('passou das 72 h: pede internet', () => {
    const r = situacaoSemInternet({ confirmadoEm }, confirmadoEm + 73 * H);
    expect(r).toMatchObject({ ok: false, motivo: 'prazo' });
    expect(textoDoBloqueio('prazo')).toMatch(/mais de 3 dias/);
  });

  it('relógio voltado para trás depois de usar o app: desconfia', () => {
    const maiorHoraVista = confirmadoEm + 10 * H; // o app já rodou às 20h
    const r = situacaoSemInternet({ confirmadoEm, maiorHoraVista }, confirmadoEm + 2 * H); // agora diz 12h
    expect(r).toMatchObject({ ok: false, motivo: 'relogio' });
    expect(textoDoBloqueio('relogio')).toMatch(/relógio/);
  });

  it('relógio antes da própria confirmação: desconfia', () => {
    expect(situacaoSemInternet({ confirmadoEm }, confirmadoEm - 2 * H)).toMatchObject({ ok: false, motivo: 'relogio' });
  });

  it('o ruído normal do relógio (alguns minutos) não bloqueia ninguém', () => {
    const maiorHoraVista = confirmadoEm + 5 * H;
    expect(situacaoSemInternet({ confirmadoEm, maiorHoraVista }, maiorHoraVista - FOLGA_DO_RELOGIO_MS + 1000).ok).toBe(true);
  });

  it('relógio atrasado de propósito NÃO estica as 72 h: vale a hora corrigida pelo servidor', () => {
    // aparelho 30 dias atrasado; na confirmação o servidor mediu +30 dias
    const desvioMs = 30 * D;
    const confirmadoCerto = horaConfiavel(confirmadoEm - desvioMs, desvioMs);
    expect(confirmadoCerto).toBe(confirmadoEm);
    // 4 dias depois (hora do aparelho continua 30 dias atrás): passou das 72 h
    const agoraAparelho = confirmadoEm - desvioMs + 4 * D;
    expect(situacaoSemInternet({ confirmadoEm: confirmadoCerto, desvioMs }, agoraAparelho)).toMatchObject({ ok: false, motivo: 'prazo' });
  });

  it('a medida do relógio ignora o ruído e pega o atraso de verdade', () => {
    const agora = Date.parse('2026-09-23T10:00:00Z');
    expect(desvioDoRelogio('2026-09-23T10:03:00Z', agora)).toBe(0);
    expect(desvioDoRelogio('2026-10-23T10:00:00Z', agora)).toBe(30 * D);
    expect(desvioDoRelogio(null, agora)).toBe(0);
    expect(desvioDoRelogio('lixo', agora)).toBe(0);
  });
});

describe('nunca além da data de vencimento conhecida', () => {
  it('assinatura vencida ontem continua vencida com o relógio voltado 10 dias', () => {
    const agoraCerto = Date.parse('2026-09-23T12:00:00Z');
    const sessao = { restauranteId: 'r1', assinaturaAte: '2026-09-22T12:00:00Z', regime: 'pagante' };
    const desvioMs = 10 * D;
    const agoraAparelho = agoraCerto - desvioMs;
    // com a hora do aparelho, pareceria em dia...
    expect(statusAssinatura(sessao, agoraAparelho).ok).toBe(true);
    // ...com a hora confiável (a que o App usa), está vencida
    expect(statusAssinatura(sessao, horaConfiavel(agoraAparelho, desvioMs)).ok).toBe(false);
  });
});

describe('o portão do App', () => {
  const confirmacao = { confirmadoEm: Date.parse('2026-09-20T10:00:00Z'), desvioMs: 0 };
  const agora = Date.parse('2026-09-23T12:00:00Z'); // 74 h depois

  it('demonstração, super-admin e modo suporte não passam pelo limite', () => {
    expect(portaoSemInternet({ sessao: { demo: true }, confirmacao }, agora).ok).toBe(true);
    expect(portaoSemInternet({ sessao: { eSuperAdmin: true }, confirmacao }, agora).ok).toBe(true);
    expect(portaoSemInternet({ sessao: { restauranteId: 'r' }, confirmacao, isento: true }, agora).ok).toBe(true);
  });

  it('sem confirmação nenhuma nesta sessão vale a regra antiga (consulta que falha não tira acesso)', () => {
    expect(portaoSemInternet({ sessao: { restauranteId: 'r' }, confirmacao: { confirmadoEm: null } }, agora).ok).toBe(true);
  });

  it('cliente com a última confirmação velha: pede internet', () => {
    expect(portaoSemInternet({ sessao: { restauranteId: 'r' }, confirmacao }, agora)).toMatchObject({ ok: false, motivo: 'prazo' });
  });
});

describe('a cópia da sessão sai do aparelho no "Sair"', () => {
  let store;
  beforeEach(() => {
    store = {};
    Object.defineProperties(store, {
      getItem:    { value: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null) },
      setItem:    { value: (k, v) => { store[k] = String(v); } },
      removeItem: { value: (k) => { delete store[k]; } },
    });
    globalThis.localStorage = store;
  });

  it('a sessão guardada é apagada; a marca do relógio fica (é do aparelho, não da conta)', () => {
    store['pe::_sessao::ultima'] = JSON.stringify({ usuarioId: 'u1', sessao: { restauranteId: 'r1' } });
    store['pe::_relogio'] = '123';
    limparCacheLocal();
    expect(store['pe::_sessao::ultima']).toBeUndefined();
    expect(store['pe::_relogio']).toBe('123');
  });
});

describe('o app usa essas regras em todos os caminhos', () => {
  const auth = ler('../../store/AuthContext.jsx');
  const app = ler('../../App.jsx');

  it('abrir sem internet usa a cópia confirmada — em vez de "Cadastro incompleto"', () => {
    expect(auth).toMatch(/if \(!perfil && errPerfil\) \{\s*entrarSemInternet\(userId, email\);\s*return false;/);
    // só a cópia da MESMA pessoa serve
    expect(auth).toMatch(/if \(inst\?\.usuarioId === userId && inst\.sessao\?\.restauranteId\)/);
  });

  it('token vencido sem internet (toda manhã) também abre com a cópia — em 4 s, não em 1 minuto', () => {
    expect(auth).toMatch(/if \(error && guardado\?\.id\) \{ entrarSemInternet\(guardado\.id, guardado\.email\); return; \}/);
    expect(auth).toMatch(/temCopia \? 4000 : 12000/);
  });

  it('"sessão inicial vazia" não é logout: não apaga o aparelho nem manda para o login', () => {
    // o celular recém-desbloqueado (Wi-Fi voltando) caía no login com os dados apagados
    expect(auth).toMatch(/if \(!uid && event === 'INITIAL_SESSION'\) return;/);
    const i = auth.indexOf("if (!uid && event === 'INITIAL_SESSION') return;");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(auth.indexOf('limparCacheLocal();\n          setSessao(null)'));
  });

  it('"Tentar de novo" responde em até 10 s mesmo com Wi-Fi sem internet', () => {
    expect(auth).toMatch(/reconfirmarSemLimite\(\),\s*new Promise\(r => setTimeout\(\(\) => r\(false\), 10000\)\),/);
    // a ordem importa: o embrulho vem DEPOIS da função (senão quebra ao abrir o app)
    expect(auth.indexOf('const reconfirmarSemLimite')).toBeLessThan(auth.indexOf('const reconfirmar = '));
  });

  it('cada leitura boa do restaurante confirma, mede o relógio e guarda a cópia', () => {
    expect(auth).toMatch(/if \(rest\) await confirmarAgora\(userId, sessaoNova, todos \|\| \[\]\);/);
    expect(auth).toMatch(/supabase\.rpc\('hora_do_servidor'\)/);
    expect(auth).toMatch(/gravarInstantaneo\(\{ usuarioId: userId, sessao: sessaoConfirmada/);
  });

  it('com o app aberto, confere de novo: a cada 15 min, quando a internet volta e ao voltar à tela', () => {
    expect(auth).toMatch(/setInterval\(tentar, 15 \* 60 \* 1000\)/);
    expect(auth).toMatch(/window\.addEventListener\('online', tentar\)/);
    expect(auth).toMatch(/document\.addEventListener\('visibilitychange', aoVoltar\)/);
  });

  it('o App barra antes do vencimento e compara o vencimento com a hora confiável', () => {
    expect(app).toMatch(/if \(sessao\.semConexao\) return <ConecteInternet motivo="nunca"/);
    expect(app).toMatch(/const semNet = portaoSemInternet\(\{ sessao, confirmacao, maiorHoraVista: lerMaiorHora\(\), isento: !!impersonando \}\);/);
    expect(app).toMatch(/statusAssinatura\(sessao, agoraConfiavel\(confirmacao\?\.desvioMs\)\)/);
    expect(app.indexOf('const semNet = portaoSemInternet')).toBeLessThan(app.indexOf('const plano = impersonando'));
  });

  it('a tela de bloqueio tem saída: "Tentar de novo" confere na hora', () => {
    const tela = ler('../../components/ConecteInternet.jsx');
    expect(tela).toMatch(/Tentar de novo/);
    expect(tela).toMatch(/await aoTentar\?\.\(\)/);
    expect(app).toMatch(/aoTentar=\{reconfirmar\}/);
  });

  it('a migração 47 dá a hora do servidor só a quem está logado', () => {
    const sql = ler('../../lib/migration47_hora_do_servidor.sql');
    expect(sql).toMatch(/revoke all on function hora_do_servidor\(\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function hora_do_servidor\(\) to authenticated;/);
  });
});
