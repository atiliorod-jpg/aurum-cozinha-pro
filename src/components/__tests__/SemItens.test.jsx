// @vitest-environment jsdom
// Lista vazia diz o que fazer: quem pode cadastrar ganha o caminho; quem não
// pode sabe a quem pedir (Lote 1 da auditoria, 14/10/2026).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const estado = vi.hoisted(() => ({ sessao: null }));
vi.mock('../../store/AppContext', () => ({ useApp: () => ({ permissoes: {} }) }));
vi.mock('../../store/AuthContext', () => ({ useAuth: () => ({ sessao: estado.sessao }) }));

import SemItens from '../SemItens';

afterEach(cleanup);
const desenhar = () => render(<MemoryRouter><SemItens /></MemoryRouter>);

describe('SemItens', () => {
  it('a conta dona ganha o caminho para cadastrar', () => {
    estado.sessao = { cargo: 'diretoria' };
    desenhar();
    expect(screen.getByRole('link', { name: 'Cadastrar itens' }).getAttribute('href')).toBe('/itens');
  });

  it('a cozinha (sem a permissão) sabe a quem pedir', () => {
    estado.sessao = { cargo: 'cozinha' };
    desenhar();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/Peça a quem administra a conta/)).toBeTruthy();
  });
});
