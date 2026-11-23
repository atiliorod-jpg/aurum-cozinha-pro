// @vitest-environment jsdom
// =====================================================================
//  O TECLADO NUMÉRICO GRANDE e o CAMPO DA MEDIDA (23/11/2026, jeito do
//  Magurō), testados pelo toque.
// =====================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampoMedida, TecladoNumerico } from '../ui/TecladoNumerico';

afterEach(cleanup);

function ComMedida({ inicial = '', unidade = 'kg', aoMudar = () => {} }) {
  const [m, setM] = useState(inicial);
  return <CampoMedida nome="Frango" valor={m} unidadeDoItem={unidade} aoMudar={(v) => { setM(v); aoMudar(v); }} />;
}
const tocar = async (u, nomes) => { for (const n of nomes) await u.click(screen.getByRole('button', { name: n, exact: true })); };

describe('o campo da medida', () => {
  it('mostra a medida e abre o teclado com a unidade marcada', async () => {
    const u = userEvent.setup();
    render(<ComMedida inicial="1 kg" />);
    await u.click(screen.getByRole('button', { name: /^Medida de Frango: 1 kg/ }));
    expect(screen.getByRole('dialog', { name: 'Medida — Frango' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'kg', exact: true }).getAttribute('aria-pressed')).toBe('true');
  });

  it('⚠️ o 1º toque substitui o sugerido; a unidade muda num toque; OK grava o texto de sempre', async () => {
    const aoMudar = vi.fn();
    const u = userEvent.setup();
    render(<ComMedida inicial="1 kg" aoMudar={aoMudar} />);
    await u.click(screen.getByRole('button', { name: /^Medida de Frango/ }));
    await tocar(u, ['5', '0', '0', 'g', 'OK']);
    expect(aoMudar).toHaveBeenCalledWith('500 g');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /^Medida de Frango: 500 g/ })).toBeTruthy();
  });

  it('vírgula e apagar', async () => {
    const aoMudar = vi.fn();
    const u = userEvent.setup();
    render(<ComMedida aoMudar={aoMudar} />);
    await u.click(screen.getByRole('button', { name: /^Medida de Frango: sem medida/ }));
    await tocar(u, ['1', 'Vírgula', '5', '7', 'Apagar', 'OK']);
    expect(aoMudar).toHaveBeenCalledWith('1,5 kg');
  });

  it('"Sem medida" deixa vazio; sem número o OK espera', async () => {
    const aoMudar = vi.fn();
    const u = userEvent.setup();
    render(<ComMedida inicial="2 kg" aoMudar={aoMudar} />);
    await u.click(screen.getByRole('button', { name: /^Medida de Frango/ }));
    await tocar(u, ['Apagar']);
    expect(screen.getByRole('button', { name: 'OK' }).disabled).toBe(true);
    await tocar(u, ['Sem medida']);
    expect(aoMudar).toHaveBeenCalledWith('');
  });

  it('"Outra medida" aceita texto livre ("1 pote")', async () => {
    const aoMudar = vi.fn();
    const u = userEvent.setup();
    render(<ComMedida aoMudar={aoMudar} />);
    await u.click(screen.getByRole('button', { name: /^Medida de Frango/ }));
    await tocar(u, ['Outra medida']);
    await u.type(screen.getByRole('textbox'), '1 pote');
    await tocar(u, ['OK']);
    expect(aoMudar).toHaveBeenCalledWith('1 pote');
  });

  it('texto livre que já existe abre direto no "Outra medida"', async () => {
    const u = userEvent.setup();
    render(<ComMedida inicial="1 pote" />);
    await u.click(screen.getByRole('button', { name: /^Medida de Frango: 1 pote/ }));
    expect(screen.getByRole('textbox').value).toBe('1 pote');
  });
});

describe('as teclas do computador', () => {
  it('números, vírgula, apagar e Enter; Esc fecha sem gravar', async () => {
    const aoConfirmar = vi.fn();
    const aoFechar = vi.fn();
    const u = userEvent.setup();
    const { unmount } = render(<TecladoNumerico titulo="Quantas" unidades={['kg']} aoConfirmar={aoConfirmar} aoFechar={aoFechar} />);
    await u.keyboard('2.759{Backspace}{Enter}');
    expect(aoConfirmar).toHaveBeenCalledWith({ numero: '2,75', unidade: 'kg', livre: '' });
    unmount();
    render(<TecladoNumerico titulo="Quantas" aoConfirmar={aoConfirmar} aoFechar={aoFechar} />);
    await u.keyboard('{Escape}');
    expect(aoFechar).toHaveBeenCalled();
  });
});
