// @vitest-environment jsdom
// =====================================================================
//  "QUEM VAI IMPRIMIR?" — a grade de nomes e o teclado da senha, testados
//  pelo toque (Lote 0 da auditoria, 14/10/2026). Os contextos do app são
//  trocados por objetos simples: o teste é da TELA, não do banco.
// =====================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const estado = vi.hoisted(() => ({ op: null, pessoas: ['Maria', 'João'], demo: true }));
vi.mock('../../store/OperadorContext', () => ({ useOperador: () => estado.op }));
vi.mock('../../store/AppContext', () => ({ useApp: () => ({ pessoas: estado.pessoas }) }));
vi.mock('../../store/AuthContext', () => ({ useAuth: () => ({ sessao: { demo: estado.demo } }) }));

import QuemImprime from '../QuemImprime';

beforeEach(() => {
  estado.op = {
    entrar: vi.fn(() => true),
    temSenha: (nome) => nome === 'João',
    tentarSenha: vi.fn(async () => ({ ok: false, travado: false, restam: 4, em: 1 })),
    travaDe: vi.fn(() => ({ travado: false, esperaMs: 0, restam: 5 })),
  };
  estado.demo = true;
});
afterEach(cleanup);

describe('QuemImprime', () => {
  it('mostra um botão por nome e diz quem tem senha', () => {
    render(<QuemImprime />);
    expect(screen.getByRole('heading', { name: 'Quem vai imprimir?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Maria' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'João (com senha)' })).toBeTruthy();
  });

  it('quem não tem senha entra com um toque', async () => {
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'Maria' }));
    expect(estado.op.entrar).toHaveBeenCalledWith('Maria');
  });

  it('quem tem senha vê o teclado, que confere sozinho no 4º número', async () => {
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'João (com senha)' }));
    expect(screen.getByText('Senha de João')).toBeTruthy();
    // a dica da senha só existe na demonstração
    expect(screen.getByText(/a senha de João é 1234/)).toBeTruthy();
    for (const d of '987') await u.click(screen.getByRole('button', { name: d }));
    expect(estado.op.tentarSenha).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: '6' }));
    expect(estado.op.tentarSenha).toHaveBeenCalledWith('João', '9876');
    expect(await screen.findByText(/Restam 4 tentativas/)).toBeTruthy();
  });

  it('fora da demonstração, nenhuma dica de senha', async () => {
    estado.demo = false;
    const u = userEvent.setup();
    render(<QuemImprime />);
    await u.click(screen.getByRole('button', { name: 'João (com senha)' }));
    expect(screen.queryByText(/a senha de João é/)).toBeNull();
  });

  it('travado depois de errar: diz quanto esperar e não deixa digitar', async () => {
    estado.op.travaDe = vi.fn(() => ({ travado: true, esperaMs: 30_000, restam: 0 }));
    const u = userEvent.setup();
    render(<QuemImprime />);
    await act(async () => { await u.click(screen.getByRole('button', { name: 'João (com senha)' })); });
    expect(screen.getByText(/Espere 30 segundos/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '1' }).disabled).toBe(true);
  });
});
