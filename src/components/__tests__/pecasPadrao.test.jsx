// @vitest-environment jsdom
// =====================================================================
//  PEÇAS PADRÃO DE TELA (Lote 7 da auditoria, 14/10/2026) — testadas pelo
//  que a pessoa vê e toca. O tamanho (44 px) e o contraste são conferidos no
//  navegador de verdade, pelo robô (e2e/acessibilidade.pw.js).
// =====================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Abas from '../ui/Abas';
import Filtros from '../ui/Filtros';
import Chave from '../ui/Chave';
import Selo from '../ui/Selo';
import Cartao from '../ui/Cartao';
import Vazio from '../ui/Vazio';

afterEach(cleanup);

describe('Abas', () => {
  it('diz qual está escolhida e troca no toque', async () => {
    const aoTrocar = vi.fn();
    render(<Abas rotulo="Entrada" opcoes={[['novo', '+ Nova entrada'], ['historico', 'Histórico']]} valor="novo" aoTrocar={aoTrocar} />);
    expect(screen.getByRole('group', { name: 'Entrada' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Nova entrada' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Histórico' }).getAttribute('aria-pressed')).toBe('false');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Histórico' }));
    expect(aoTrocar).toHaveBeenCalledWith('historico');
  });
});

describe('Filtros', () => {
  it('"Todos" vale vazio; aceita lista simples ou [valor, texto]', async () => {
    const aoTrocar = vi.fn();
    const u = userEvent.setup();
    const { rerender } = render(<Filtros rotulo="Categoria" opcoes={['PROTEÍNAS', 'FRIOS']} valor="" aoTrocar={aoTrocar} />);
    expect(screen.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');
    await u.click(screen.getByRole('button', { name: 'FRIOS' }));
    expect(aoTrocar).toHaveBeenLastCalledWith('FRIOS');
    rerender(<Filtros rotulo="Período" todos={null} opcoes={[['7', 'Últimos 7d'], ['30', 'Últimos 30d']]} valor="30" aoTrocar={aoTrocar} />);
    expect(screen.queryByRole('button', { name: 'Todos' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Últimos 30d' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Chave', () => {
  it('é uma chave com nome e estado, e devolve o valor novo', async () => {
    const aoTrocar = vi.fn();
    render(<Chave rotulo="QR code na etiqueta" ligada={false} aoTrocar={aoTrocar} />);
    const chave = screen.getByRole('switch', { name: 'QR code na etiqueta' });
    expect(chave.getAttribute('aria-checked')).toBe('false');
    await userEvent.setup().click(chave);
    expect(aoTrocar).toHaveBeenCalledWith(true);
  });
});

describe('Selo, Cartão e Vazio', () => {
  it('o selo usa a palavra de corStatus', () => {
    render(<Selo status="critico" />);
    expect(screen.getByText('Abaixo do mínimo')).toBeTruthy();
  });
  it('o cartão é uma seção com o nome do título', () => {
    render(<Cartao titulo="Cópia de segurança" descricao="Baixe uma cópia."><p>conteúdo</p></Cartao>);
    expect(screen.getByRole('region', { name: 'Cópia de segurança' })).toBeTruthy();
    expect(screen.getByText('Baixe uma cópia.')).toBeTruthy();
  });
  it('a lista vazia mostra a frase e a ação', () => {
    render(<Vazio texto="Nenhuma entrada ainda." acao={<button type="button">Registrar</button>} />);
    expect(screen.getByText('Nenhuma entrada ainda.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeTruthy();
  });
});
