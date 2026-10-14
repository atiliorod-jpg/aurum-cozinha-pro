// @vitest-environment jsdom
// =====================================================================
//  QUEM ESTÁ REGISTRANDO (Lote 2 da auditoria, 14/10/2026): a mesma pessoa
//  assina a etiqueta e os lançamentos. Com equipe: o nome de quem entrou ou a
//  grade de nomes; sem equipe: o seletor de sempre.
// =====================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const estado = vi.hoisted(() => ({ op: null, pessoas: ['Maria', 'João'] }));
vi.mock('../../store/OperadorContext', () => ({
  useOperador: () => estado.op,
  useQuemRegistra: (manual) => (estado.op.comEquipe
    ? { nome: estado.op.operador || '', falta: !estado.op.operador, comEquipe: true }
    : { nome: manual || '', falta: false, comEquipe: false }),
}));
vi.mock('../../store/AppContext', () => ({ useApp: () => ({ pessoas: estado.pessoas, addPessoa: vi.fn(), permissoes: {} }) }));
vi.mock('../../store/AuthContext', () => ({ useAuth: () => ({ sessao: { cargo: 'cozinha' } }) }));

import QuemRegistra from '../QuemRegistra';

beforeEach(() => {
  estado.pessoas = ['Maria', 'João'];
  estado.op = {
    operador: '', comEquipe: true, trocar: vi.fn(), entrar: vi.fn(() => true),
    temSenha: (n) => n === 'João', tentarSenha: vi.fn(), travaDe: () => ({ travado: false, restam: 5 }),
  };
});
afterEach(cleanup);

describe('QuemRegistra', () => {
  it('ninguém escolhido: pergunta "Quem está registrando?" e entra com um toque', async () => {
    render(<QuemRegistra />);
    expect(screen.getByRole('heading', { name: 'Quem está registrando?' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Maria' }));
    expect(estado.op.entrar).toHaveBeenCalledWith('Maria');
  });

  it('com alguém escolhido: mostra quem é e deixa trocar', async () => {
    estado.op.operador = 'João';
    render(<QuemRegistra />);
    expect(screen.getByText(/Registrando como/).textContent).toContain('João');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Trocar' }));
    expect(estado.op.trocar).toHaveBeenCalled();
  });

  it('equipe vazia: o seletor de sempre, com o rótulo pedido', () => {
    estado.op.comEquipe = false;
    estado.pessoas = [];
    render(<QuemRegistra manual="" aoManual={() => {}} rotulo="Quem está dando baixa" />);
    expect(screen.getByText('Quem está dando baixa')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Quem está registrando?' })).toBeNull();
  });
});
