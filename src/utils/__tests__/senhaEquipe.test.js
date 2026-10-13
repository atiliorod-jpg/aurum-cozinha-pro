// =====================================================================
//  SENHA DA EQUIPE PARA IMPRIMIR ("Quem vai imprimir?", 13/10/2026)
//
//  A pessoa toca no nome, digita a senha de 4 números (se tiver) e a
//  etiqueta sai assinada por ela. Aqui: a codificação, a trava de erros, os
//  5 minutos sem uso, quem assina cada janela e as travas no código (a
//  senha não sai na cópia de segurança, o operador não fica no aparelho).
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DIGITOS, ITERACOES_PADRAO, ITERACOES_MIN, ITERACOES_MAX, ERROS_ATE_ESPERAR, ESPERA_MS, OCIOSO_MS, CHAVE_TRAVAS,
  senhaNoFormato, registroValido, registroDe, temSenha, gerarRegistroDeSenha, conferirSenha, derivarSenha,
  comSenha, semOrfas, estadoDaTrava, aposErro, expirou, assinaturaDaJanela,
} from '../senhaEquipe';
import { SENHAS_EQUIPE_DEMO, DEMO_COM_SENHA } from '../../data/demo';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
// o código sem os comentários (os comentários explicam justamente o que NÃO fazer)
const semComentarios = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('a senha: 4 números, codificada com sal', () => {
  it('formato: exatamente 4 números', () => {
    expect(DIGITOS).toBe(4);
    expect(senhaNoFormato('0412')).toBe(true);
    for (const ruim of ['123', '12345', '12a4', ' 1234', '', null, 1234]) expect(senhaNoFormato(ruim)).toBe(false);
  });

  it('gera um registro que confere com a senha certa e recusa a errada', async () => {
    const reg = await gerarRegistroDeSenha('2507');
    expect(registroValido(reg)).toBe(true);
    expect(reg.i).toBe(ITERACOES_PADRAO);
    // a senha em si não fica no registro
    expect(JSON.stringify(reg)).not.toContain('2507');
    expect(await conferirSenha('2507', reg)).toBe(true);
    expect(await conferirSenha('2508', reg)).toBe(false);
  });

  it('o mesmo número dá registros diferentes (sal novo a cada vez)', async () => {
    const a = await gerarRegistroDeSenha('1111');
    const b = await gerarRegistroDeSenha('1111');
    expect(a.s).not.toBe(b.s);
    expect(a.h).not.toBe(b.h);
  });

  it('recusa criar senha fora do formato', async () => {
    await expect(gerarRegistroDeSenha('12')).rejects.toThrow(/4 números/);
  });

  it('falha FECHADA: registro estragado, formato ruim ou voltas fora do limite = errado', async () => {
    const reg = await gerarRegistroDeSenha('4321');
    expect(await conferirSenha('4321', { ...reg, h: 'x' })).toBe(false);
    expect(await conferirSenha('4321', { ...reg, i: ITERACOES_MIN - 1 })).toBe(false);
    expect(await conferirSenha('4321', { ...reg, i: ITERACOES_MAX + 1 })).toBe(false);
    expect(await conferirSenha('4321', null)).toBe(false);
    expect(await conferirSenha('432', reg)).toBe(false);
  });

  it('a senha da demonstração (João, 1234) confere — e o hash fixo bate com o cálculo', async () => {
    const reg = SENHAS_EQUIPE_DEMO[DEMO_COM_SENHA.nome];
    expect(DEMO_COM_SENHA).toEqual({ nome: 'João', senha: '1234' });
    expect(await derivarSenha('1234', reg.s, reg.i)).toBe(reg.h);
    expect(await conferirSenha('1234', reg)).toBe(true);
    expect(await conferirSenha('4321', reg)).toBe(false);
    // Maria entra sem senha
    expect(temSenha(SENHAS_EQUIPE_DEMO, 'Maria')).toBe(false);
  });
});

describe('o documento senhasEquipe', () => {
  const R = { s: 'a'.repeat(32), h: 'b'.repeat(64), i: ITERACOES_PADRAO };

  it('nomes como __proto__ não leem o protótipo', () => {
    expect(registroDe({}, '__proto__')).toBe(null);
    expect(registroDe({}, 'constructor')).toBe(null);
    expect(temSenha({}, 'toString')).toBe(false);
    const doc = comSenha({}, '__proto__', R);
    expect(registroDe(doc, '__proto__')).toEqual(R);
    expect(Object.getPrototypeOf(doc)).toBe(Object.prototype);
  });

  it('registro estragado conta como "tem senha" (cai na conferência, que recusa)', () => {
    expect(temSenha({ Ana: { s: 'x' } }, 'Ana')).toBe(true);
    expect(registroDe({ Ana: { s: 'x' } }, 'Ana')).toBe(null);
  });

  it('comSenha cria, troca e tira sem mexer no original', () => {
    const base = { Ana: R };
    const com = comSenha(base, 'Bia', R);
    expect(Object.keys(com).sort()).toEqual(['Ana', 'Bia']);
    expect(base).toEqual({ Ana: R });
    expect(comSenha(com, 'Ana', null)).toEqual({ Bia: R });
  });

  it('semOrfas tira a senha de quem saiu da equipe, e não grava à toa', () => {
    const doc = { Ana: R, Bia: R };
    expect(semOrfas(doc, ['Ana', 'Bia', 'Caio'])).toBe(doc);
    expect(semOrfas(doc, ['Ana'])).toEqual({ Ana: R });
    expect(semOrfas(null, ['Ana'])).toEqual({});
  });
});

describe('5 erros → espera 1 minuto (por aparelho)', () => {
  it('conta os erros e trava no quinto', () => {
    let t = null;
    const agora = 1_000_000;
    expect(estadoDaTrava(t, agora)).toEqual({ travado: false, esperaMs: 0, restam: ERROS_ATE_ESPERAR });
    for (let i = 1; i < ERROS_ATE_ESPERAR; i++) {
      t = aposErro(t, agora);
      expect(estadoDaTrava(t, agora).restam).toBe(ERROS_ATE_ESPERAR - i);
    }
    t = aposErro(t, agora);
    expect(estadoDaTrava(t, agora)).toEqual({ travado: true, esperaMs: ESPERA_MS, restam: 0 });
    // durante a espera, errar não estica a espera
    expect(aposErro(t, agora + 1000)).toBe(t);
    // passou o minuto: zera
    expect(estadoDaTrava(t, agora + ESPERA_MS)).toEqual({ travado: false, esperaMs: 0, restam: ERROS_ATE_ESPERAR });
  });

  it('trava gravada para o futuro distante (relógio mexido) não prende o nome para sempre', () => {
    expect(estadoDaTrava({ erros: 0, ate: 10 ** 13 }, 1000).travado).toBe(false);
  });

  it('a trava fica fora do pe::<rid>:: — sair da conta não zera os erros', () => {
    expect(CHAVE_TRAVAS.startsWith('pe::')).toBe(true);
    expect(CHAVE_TRAVAS).not.toMatch(/^pe::demo::/);
    expect(ESPERA_MS).toBe(60_000);
  });
});

describe('5 minutos sem uso → volta para os nomes', () => {
  it('expira em 5 minutos, e relógio que voltou também expira', () => {
    expect(OCIOSO_MS).toBe(5 * 60_000);
    expect(expirou(1000, 1000 + OCIOSO_MS - 1)).toBe(false);
    expect(expirou(1000, 1000 + OCIOSO_MS)).toBe(true);
    expect(expirou(5000, 1000)).toBe(true);
    expect(expirou(0, 1000)).toBe(true);
  });
});

describe('quem assina a janela de imprimir', () => {
  const item = { produtoId: 'p1', nome: 'Frango', responsavel: 'Maria' };

  it('equipe vazia: o seletor de sempre', () => {
    expect(assinaturaDaJanela({ itens: [item], comEquipe: false, operador: '', manual: 'Ana' }))
      .toEqual({ regra: 'manual', nome: 'Ana', falta: false });
  });

  it('com equipe: assina quem entrou; ninguém = falta (os botões travam)', () => {
    expect(assinaturaDaJanela({ itens: [item], comEquipe: true, operador: 'João' }))
      .toEqual({ regra: 'operador', nome: 'João', falta: false });
    // ⚠️ o nome que veio no item (Entradas, Mais usados) NÃO assina
    expect(assinaturaDaJanela({ itens: [item], comEquipe: true, operador: '' }))
      .toEqual({ regra: 'operador', nome: '', falta: true });
  });

  it('reimpressão (Impressas e Histórico) mantém quem assinou, sem senha', () => {
    for (const marca of [{ reimpressao: true }, { codigo: 'ABCD1234' }, { assinaturaOriginal: true }]) {
      expect(assinaturaDaJanela({ itens: [{ ...item, ...marca }], comEquipe: true, operador: 'João' }))
        .toEqual({ regra: 'original', nome: 'Maria', falta: false });
    }
    // original sem nome nenhum: assina quem está imprimindo
    expect(assinaturaDaJanela({ itens: [{ ...item, responsavel: '', reimpressao: true }], comEquipe: true, operador: '' }).regra)
      .toBe('operador');
  });

  it('etiqueta de teste da impressora não precisa de ninguém', () => {
    expect(assinaturaDaJanela({ itens: [{ teste: true, responsavel: '' }], comEquipe: true, operador: '' }))
      .toEqual({ regra: 'livre', nome: '', falta: false });
  });
});

describe('travas no código', () => {
  const app = ler('../../store/AppContext.jsx');
  const op = semComentarios(ler('../../store/OperadorContext.jsx'));

  it('senhasEquipe é documento da CONTA (vale em todas as cozinhas)', () => {
    expect(app).toMatch(/const GLOBAIS = \['pessoas', 'permissoes', 'precos', 'estoques', 'senhasEquipe'\];/);
    expect(app).toMatch(/senhasEquipe: setSenhasEquipeRaw/);
    expect(app).toMatch(/setSenhasEquipeRaw\(cacheGet\(rid, 'senhasEquipe', \{\}\)\)/);
  });

  it('a cópia de segurança NÃO leva as senhas, e a importação poda as de quem saiu', () => {
    const exportar = app.slice(app.indexOf('const exportarBackup'), app.indexOf('const importarBackup'));
    expect(exportar).not.toMatch(/senhasEquipe:/);
    expect(app).toMatch(/const podadas = semOrfas\(dadosRef\.current\.senhasEquipe, dados\.pessoas\);/);
  });

  it('remover a pessoa apaga a senha; nome que volta não herda senha antiga', () => {
    const add = app.slice(app.indexOf('const addPessoa'), app.indexOf('const removePessoa'));
    const rem = app.slice(app.indexOf('const removePessoa'), app.indexOf('const definirSenhaDaPessoa'));
    expect(add).toMatch(/comSenha\(dadosRef\.current\.senhasEquipe, n, null\)/);
    expect(rem).toMatch(/comSenha\(dadosRef\.current\.senhasEquipe, nome, null\)/);
  });

  it('quem está imprimindo vive SÓ na memória (nunca em prefs nem no aparelho)', () => {
    expect(op).not.toMatch(/setPref|setPrefs|_prefs_device|cacheSet/);
    // a única coisa gravada no aparelho é a trava de erros
    expect(op.match(/localStorage\.setItem\(/g)).toHaveLength(1);
    expect(op).toMatch(/localStorage\.setItem\(CHAVE_TRAVAS,/);
  });

  it('a janela de imprimir: sem ninguém escolhido, pergunta e trava os dois botões', () => {
    const ep = ler('../../components/EtiquetaPrint.jsx');
    expect(ep).toMatch(/assinaturaDaJanela\(\{ itens, comEquipe, operador, manual: respManual \}\)/);
    expect(ep).toMatch(/\|\| faltaQuemImprime;/);
    expect(ep).toMatch(/faltaQuemImprime \? <QuemImprime dentroDaJanela \/>/);
    // o nome não troca no meio da pergunta "Saiu no papel?" nem do Bluetooth
    expect(ep).toMatch(/\(perguntaPara === etiquetaState \|\| enviando\)/);
  });

  it('a tela de Etiquetas começa pelos nomes, e a reimpressão do Histórico mantém a assinatura', () => {
    const et = ler('../../pages/Etiquetas.jsx');
    expect(et).toMatch(/const precisaEscolher = comEquipe && !operador;/);
    expect(et).toMatch(/\{precisaEscolher \? \(<>\s*<QuemImprime \/>/);
    expect(ler('../../pages/Historico.jsx')).toMatch(/assinaturaOriginal: true,/);
  });

  it('só a conta dona mexe nas senhas, e o campo não recebe a senha guardada da conta', () => {
    const c = semComentarios(ler('../../components/config/CartaoEquipe.jsx'));
    expect(c).toMatch(/const ehDono = temPermissao\('diretoria'\);/);
    expect(c.match(/autoComplete="new-password"/g)).toHaveLength(2);
  });
});
