// @vitest-environment jsdom
// =====================================================================
//  "QUEM VAI IMPRIMIR?" — a grade de nomes e o teclado da senha, testados
//  pelo toque (Lote 0 da auditoria, 14/10/2026; jeito do Magurō desde
//  23/11/2026: senha de 2 números obrigatória, criada pela própria pessoa
//  no 1º acesso). Os contextos do app são trocados por objetos simples: o
//  teste é da TELA, não do banco.
// =====================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const estado = vi.hoisted(() => ({ op: null, pessoas: ['Maria', 'João'], demo: true, comSenha: new Set() }));
vi.mock('../../store/OperadorContext', () => ({ useOperador: () => estado.op }));
vi.mock('../../store/AppContext', () => ({ useApp: () => ({ pessoas: estado.pessoas }) }));
vi.mock('../../store/AuthContext', () => ({ useAuth: () => ({ sessao: { demo: estado.demo } }) }));
vi.mock('../../utils/conexao', () => ({ textoDaFalhaDeRede: async () => 'SEM INTERNET AQUI.' }));

import QuemImprime from '../QuemImprime';

beforeEach(() => {
  estado.pessoas = ['Maria', 'João'];
  estado.comSenha = new Set(['João']);
  estado.op = {
    temSenha: (nome) => estado.comSenha.has(nome),
    digitosDaSenha: () => 2,
    criarSenha: vi.fn(async () => ({ ok: true })),
    tentarSenha: vi.fn(async () => ({ ok: false, travado: false, restam: 4, em: 1 })),
    travaDe: vi.fn(() => ({ travado: false, esperaMs: 0, restam: 5 })),
  };
  estado.demo = true;
});
afterEach(cleanup);

const descricao = (botao) => document.getElementById(botao.getAttribute('aria-describedby'))?.textContent;
async function digitar(u, numeros) {
  for (const d of numeros) await u.click(screen.getByRole('button', { name: d }));
}

describe('a grade de nomes', () => {
  it('um cartão por nome; o botão se chama só pelo nome, e diz quem tem senha e quem é 1º acesso', () => {
    render(<QuemImprime />);
    expect(screen.getByRole('heading', { name: 'Quem vai imprimir?' })).toBeTruthy();
    expect(descricao(screen.getByRole('button', { name: 'Maria' }))).toBe('1º acesso');
    expect(descricao(screen.getByRole('button', { name: 'João' }))).toBe('com senha');
  });

  it('até 12 nomes, sem busca; com mais, busca e letras', async () => {
    const { unmount } = render(<QuemImprime />);
    expect(screen.queryByRole('searchbox', { name: 'Procurar seu nome' })).toBeNull();
    unmount();

    estado.pessoas = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Edu', 'Fábio', 'Gil', 'Hugo', 'Íris', 'João', 'Joana', 'Maria', 'Mário'];
    const u = userEvent.setup();
    render(<QuemImprime />);
    // sem acento: "mario" acha Mário
    await u.type(screen.getByRole('searchbox', { name: 'Procurar seu nome' }), 'mario');
    expect(screen.getAllByRole('button', { name: /^(Mário|Maria|Ana)$/ }).map(b => b.getAttribute('aria-label'))).toEqual(['Mário']);
    // a letra troca a busca: J mostra só os nomes com J
    await u.click(screen.getByRole('button', { name: 'J' }));
    expect(screen.getByRole('searchbox', { name: 'Procurar seu nome' }).value).toBe('');
    expect(screen.getByRole('button', { name: 'João' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Joana' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Maria' })).toBeNull();
    // a inicial com acento conta como a letra sem acento
    await u.click(screen.getByRole('button', { name: 'I' }));
    expect(screen.getByRole('button', { name: 'Íris' })).toBeTruthy();
  });

  it('busca sem resultado oferece ver todos os nomes', async () => {
    estado.pessoas = Array.from({ length: 13 }, (_, i) => `Pessoa ${i + 1}`);
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.type(screen.getByRole('searchbox', { name: 'Procurar seu nome' }), 'zzz');
    expect(screen.getByText(/Nenhum nome com/)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Ver todos os nomes' }));
    expect(screen.getAllByRole('button', { name: /^Pessoa \d+$/ })).toHaveLength(13);
  });
});

describe('1º acesso: a pessoa cria a própria senha', () => {
  it('2 números, repete, e entra', async () => {
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'Maria' }));
    expect(screen.getByRole('heading', { name: 'Crie sua senha, Maria' })).toBeTruthy();
    expect(screen.getByText('2 números. Não conte para ninguém.')).toBeTruthy();
    await digitar(u, '24');
    expect(screen.getByRole('heading', { name: 'Repita a senha' })).toBeTruthy();
    expect(estado.op.criarSenha).not.toHaveBeenCalled();
    await digitar(u, '24');
    expect(estado.op.criarSenha).toHaveBeenCalledWith('Maria', '24');
  });

  it('as duas não ficaram iguais: volta para criar de novo, sem gravar nada', async () => {
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'Maria' }));
    await digitar(u, '24');
    await digitar(u, '25');
    expect(screen.getByRole('heading', { name: 'Crie sua senha, Maria' })).toBeTruthy();
    expect(screen.getByText('As duas não ficaram iguais. Crie de novo.')).toBeTruthy();
    expect(estado.op.criarSenha).not.toHaveBeenCalled();
  });

  it('sem internet: a senha não é criada, e a tela diz por quê', async () => {
    estado.op.criarSenha = vi.fn(async () => ({ ok: false, semRede: true }));
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'Maria' }));
    await digitar(u, '24');
    await digitar(u, '24');
    expect(await screen.findByText('A senha não foi criada. SEM INTERNET AQUI.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Crie sua senha, Maria' })).toBeTruthy();
  });

  it('outro aparelho criou a senha deste nome primeiro: pede para digitar a que existe', async () => {
    estado.op.criarSenha = vi.fn(async () => { estado.comSenha.add('Maria'); return { ok: false, temSenha: true }; });
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'Maria' }));
    await digitar(u, '24');
    await digitar(u, '24');
    expect(await screen.findByRole('heading', { name: 'Senha de Maria' })).toBeTruthy();
    expect(screen.getByText('Este nome já tem senha. Digite a senha.')).toBeTruthy();
  });
});

describe('quem já tem senha digita', () => {
  it('confere sozinho no 2º número', async () => {
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'João' }));
    expect(screen.getByRole('heading', { name: 'Senha de João' })).toBeTruthy();
    // a dica da senha só existe na demonstração
    expect(screen.getByText(/a senha de João é 12\./)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: '9' }));
    expect(estado.op.tentarSenha).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: '8' }));
    expect(estado.op.tentarSenha).toHaveBeenCalledWith('João', '98');
    expect(await screen.findByText(/Restam 4 tentativas/)).toBeTruthy();
  });

  it('senha ANTIGA, de 4 números: o teclado espera os 4', async () => {
    estado.op.digitosDaSenha = () => 4;
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'João' }));
    await digitar(u, '987');
    expect(estado.op.tentarSenha).not.toHaveBeenCalled();
    await digitar(u, '6');
    expect(estado.op.tentarSenha).toHaveBeenCalledWith('João', '9876');
  });

  it('fora da demonstração, nenhuma dica de senha', async () => {
    estado.demo = false;
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'João' }));
    expect(screen.queryByText(/a senha de João é/)).toBeNull();
  });

  it('travado depois de errar: diz quanto esperar e não deixa digitar', async () => {
    estado.op.travaDe = vi.fn(() => ({ travado: true, esperaMs: 30_000, restam: 0 }));
    const u = userEvent.setup();
    render(<QuemImprime />);
    await act(async () => { await u.click(screen.getByRole('button', { name: 'João' })); });
    expect(screen.getByText(/Espere 30 segundos/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '1' }).disabled).toBe(true);
  });

  it('o dono zerou a senha enquanto a pessoa digitava: a tela passa a criar', async () => {
    const u = userEvent.setup();
    const { rerender } = render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'João' }));
    expect(screen.getByRole('heading', { name: 'Senha de João' })).toBeTruthy();
    estado.comSenha.delete('João');
    rerender(<QuemImprime />);
    expect(screen.getByRole('heading', { name: 'Crie sua senha, João' })).toBeTruthy();
    expect(screen.getByText('A senha deste nome foi zerada. Crie uma nova.')).toBeTruthy();
  });

  it('"Voltar aos nomes" volta para a grade', async () => {
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'João' }));
    await u.click(screen.getByRole('button', { name: 'Voltar aos nomes' }));
    expect(screen.getByRole('heading', { name: 'Quem vai imprimir?' })).toBeTruthy();
  });
});
