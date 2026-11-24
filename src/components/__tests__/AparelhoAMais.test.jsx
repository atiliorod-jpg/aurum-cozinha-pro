// @vitest-environment jsdom
// O 4º aparelho (M64, 24/11/2026): a tela que para quem passou do limite.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const estado = vi.hoisted(() => ({ auth: {} }));
vi.mock('../../store/AuthContext', () => ({ useAuth: () => estado.auth }));
vi.mock('../../store/UIContext', () => ({ useUI: () => ({ toast: vi.fn() }) }));
vi.mock('qrcode', () => ({ default: { toDataURL: () => Promise.resolve('') } }));

import AparelhoAMais from '../AparelhoAMais';

afterEach(cleanup);

const base = (extra = {}) => ({
  sessao: { restauranteNome: 'Casa Teste' },
  aparelho: { situacao: 'aguardando', limite: 3, usados: 3, extras: 0, pedido_em: null },
  conferirAparelho: vi.fn(async () => ({ situacao: 'aguardando' })),
  pedirAparelhoExtra: vi.fn(async () => ''),
  listarAparelhos: vi.fn(async () => ({
    limite: 3, extras: 0,
    lista: [
      { id: 'a1', nome: 'Android · Chrome', situacao: 'ativo', este: false, visto_em: new Date().toISOString() },
      { id: 'a4', nome: 'iPhone · Safari', situacao: 'aguardando', este: true, visto_em: new Date().toISOString() },
    ],
  })),
  removerAparelho: vi.fn(async () => ''),
  abrirAdministracao: vi.fn(async () => ({ ok: true })),
  administracaoAberta: false,
  ...extra,
});

describe('AparelhoAMais', () => {
  it('diz o limite e oferece o aparelho a mais por R$ 20,00 por mês', () => {
    estado.auth = base();
    render(<AparelhoAMais aoSair={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Limite de aparelhos', level: 1 })).toBeTruthy();
    expect(screen.getByText('Esta conta já tem 3 aparelhos conectados.')).toBeTruthy();
    expect(screen.getByText('R$ 20,00/mês')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pagar R$ 20,00 pelo Pix' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair desta conta' })).toBeTruthy();
  });

  it('depois do "Já paguei": espera a Aurum e deixa conferir', async () => {
    estado.auth = base({ aparelho: { situacao: 'aguardando', limite: 3, pedido_em: new Date().toISOString() } });
    render(<AparelhoAMais aoSair={() => {}} />);
    expect(screen.getByText('Pagamento avisado. Quando a Aurum confirmar, este aparelho entra sozinho.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Conferir agora' }));
    await waitFor(() => expect(estado.auth.conferirAparelho).toHaveBeenCalled());
  });

  it('liberar uma vaga: a lista mostra os OUTROS aparelhos dentro, e "Tirar" pede a senha da Administração', async () => {
    estado.auth = base();
    render(<AparelhoAMais aoSair={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver aparelhos conectados' }));
    const tirar = await screen.findByRole('button', { name: 'Tirar Android · Chrome da conta' });
    // o próprio aparelho (que espera) não aparece para ser tirado
    expect(screen.queryByRole('button', { name: 'Tirar iPhone · Safari da conta' })).toBeNull();
    fireEvent.click(tirar);
    expect(screen.getByRole('heading', { name: 'Senha da Administração' })).toBeTruthy();
    expect(estado.auth.removerAparelho).not.toHaveBeenCalled();
  });

  it('com a Administração já aberta, "Tirar" tira na hora e confere a vaga', async () => {
    estado.auth = base({ administracaoAberta: true });
    render(<AparelhoAMais aoSair={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver aparelhos conectados' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tirar Android · Chrome da conta' }));
    await waitFor(() => expect(estado.auth.removerAparelho).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(estado.auth.conferirAparelho).toHaveBeenCalled());
  });
});
