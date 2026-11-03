import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ehFalhaDeRede, temInternet, textoDaFalhaDeRede, explicarErroAuth,
  FALHA_DE_REDE, TEXTO_SEM_INTERNET, TEXTO_SERVIDOR_FORA,
} from '../conexao';

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// =====================================================================
//  03/11/2026 — o projeto do Supabase foi pausado (plano grátis, sem uso)
//  e o dono via "Sem conexão com a internet" com a internet boa. Agora a
//  falha de rede pergunta ao endereço do próprio app antes de escolher a
//  frase: respondeu = servidor fora do ar; não respondeu = sem internet.
// =====================================================================

const respondeu = () => Promise.resolve({ ok: true, status: 200 });
const caiu = () => Promise.reject(new TypeError('Failed to fetch'));

describe('o que é falha de rede', () => {
  it('Chrome, Firefox, Safari e o servidor respondendo 503', () => {
    expect(ehFalhaDeRede('Failed to fetch')).toBe(true);
    expect(ehFalhaDeRede(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(ehFalhaDeRede({ message: 'Load failed' })).toBe(true);
    expect(ehFalhaDeRede({ name: 'AuthRetryableFetchError', message: '{}' })).toBe(true);
    expect(ehFalhaDeRede(FALHA_DE_REDE)).toBe(true);
  });
  it('senha errada não é', () => {
    expect(ehFalhaDeRede('Invalid login credentials')).toBe(false);
    expect(ehFalhaDeRede(null)).toBe(false);
  });
});

describe('internet ou servidor?', () => {
  it('o endereço do app respondeu: a internet está boa, o servidor é que caiu', async () => {
    expect(await textoDaFalhaDeRede({ buscar: respondeu, online: true })).toBe(TEXTO_SERVIDOR_FORA);
  });
  it('até um 404 prova que a internet chegou', async () => {
    const buscar = () => Promise.resolve({ ok: false, status: 404 });
    expect(await temInternet({ buscar, online: true })).toBe(true);
  });
  it('nem o endereço do app respondeu: sem internet', async () => {
    expect(await textoDaFalhaDeRede({ buscar: caiu, online: true })).toBe(TEXTO_SEM_INTERNET);
  });
  it('o aparelho já sabe que está desligado: nem pergunta', async () => {
    const buscar = vi.fn(respondeu);
    expect(await temInternet({ buscar, online: false })).toBe(false);
    expect(buscar).not.toHaveBeenCalled();
  });
  it('⚠️ vai à rede de verdade: sem cache e com um endereço novo a cada vez', async () => {
    const buscar = vi.fn(respondeu);
    await temInternet({ buscar, online: true });
    await new Promise(r => setTimeout(r, 2));
    await temInternet({ buscar, online: true });
    const [[url1, op], [url2]] = buscar.mock.calls;
    expect(op.cache).toBe('no-store');
    expect(url1).toMatch(/favicon\.svg\?conexao=\d+$/);
    expect(url1).not.toBe(url2);
  });
  it('⚠️ Wi-Fi sem internet de verdade: desiste em 5 s em vez de ficar pendurado', async () => {
    vi.useFakeTimers();
    try {
      const buscar = (_u, { signal }) => new Promise((_, rejeita) => {
        signal.addEventListener('abort', () => rejeita(new DOMException('aborted', 'AbortError')));
      });
      const resposta = temInternet({ buscar, online: true });
      await vi.advanceTimersByTimeAsync(5000);
      expect(await resposta).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a tela de entrada', () => {
  it('falha de rede vira a frase certa; senha errada continua a de sempre', async () => {
    expect(await explicarErroAuth(FALHA_DE_REDE, { buscar: respondeu, online: true })).toBe(TEXTO_SERVIDOR_FORA);
    expect(await explicarErroAuth(FALHA_DE_REDE, { buscar: caiu, online: true })).toBe(TEXTO_SEM_INTERNET);
    expect(await explicarErroAuth('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
  });
  it('o login, a nova senha e o "Esqueci" usam a frase que confere', () => {
    expect(ler('../../pages/Login.jsx')).toMatch(/import \{ explicarErroAuth as traduz \} from '\.\.\/utils\/conexao'/);
    expect(ler('../../pages/Login.jsx')).toMatch(/if \(err\) setErro\(await traduz\(err\)\);/);
    expect(ler('../../pages/NovaSenha.jsx')).toMatch(/await explicarErroAuth\(err\)/);
    // servidor respondendo 502/503/504 também é "falha de rede" para a tela
    const auth = ler('../../store/AuthContext.jsx');
    expect(auth).toMatch(/if \(error\.name === 'AuthRetryableFetchError'\) return FALHA_DE_REDE;/);
    expect(auth).toMatch(/return error \? mensagemDoErroAuth\(error\) : null;/);
  });
  it('"Conecte à internet" e o código do painel não mandam mais conferir o Wi-Fi às cegas', () => {
    const conecte = ler('../../components/ConecteInternet.jsx');
    expect(conecte).toMatch(/setFalhou\(await textoDaFalhaDeRede\(\)\)/);
    expect(conecte).not.toMatch(/Ainda sem conexão com o servidor/);
  });
});
