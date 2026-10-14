// @vitest-environment jsdom
// =====================================================================
//  A JANELA PADRÃO (Dialogo) — testada pelo que a pessoa vê e faz, num
//  navegador simulado (Lote 0 da auditoria, 14/10/2026). Antes, o projeto só
//  conseguia testar componente lendo o texto do código.
// =====================================================================
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import Dialogo from '../Dialogo';

afterEach(cleanup);

function Abre() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}>Abrir</button>
      {aberto && (
        <Dialogo titulo="Conferir o item" aoFechar={() => setAberto(false)}>
          <button type="button">Salvar</button>
        </Dialogo>
      )}
    </>
  );
}

describe('Dialogo', () => {
  it('tem o nome do título, prende o foco, fecha no Esc e devolve o foco a quem abriu', async () => {
    const u = userEvent.setup();
    render(<Abre />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    await u.click(abrir);

    const janela = screen.getByRole('dialog', { name: 'Conferir o item' });
    expect(janela.getAttribute('aria-modal')).toBe('true');
    expect(janela.contains(document.activeElement)).toBe(true);

    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it('o × fecha', async () => {
    const u = userEvent.setup();
    render(<Abre />);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    await u.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
