// @vitest-environment jsdom
// =====================================================================
//  LOTE 5 DA AUDITORIA (14/10/2026) — o formulário de lançamento com a mesma
//  forma em todas as telas: o pé fixo (resumo + botão) e o − / +.
// =====================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RodapeLancamento from '../lancamento/RodapeLancamento';
import Passador from '../lancamento/Passador';
import { resumoDeQuantidades, resumoDoLancamento } from '../../utils/lancamento';

afterEach(cleanup);
const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('resumo do lançamento', () => {
  it('soma cada unidade à parte — nunca "13" de 10 kg + 3 unid', () => {
    expect(resumoDeQuantidades([
      { quantidade: '10', unidade: 'kg' }, { quantidade: 3, unidade: 'unid' }, { quantidade: '2,5', unidade: 'kg' },
    ])).toBe('12,5 kg + 3 unid');
  });

  it('"3 itens · 12 unid → Unidade Centro"; vazio quando nada foi preenchido', () => {
    const linhas = [{ quantidade: 5, unidade: 'unid' }, { quantidade: 7, unidade: 'unid' }, { quantidade: '', unidade: 'kg' }];
    expect(resumoDoLancamento(linhas, 'Unidade Centro')).toBe('2 itens · 12 unid → Unidade Centro');
    expect(resumoDoLancamento([{ quantidade: 1, unidade: 'kg' }])).toBe('1 item · 1 kg');
    expect(resumoDoLancamento([{ quantidade: '', unidade: 'kg' }], 'X')).toBe('');
  });
});

describe('o pé do lançamento', () => {
  it('mostra o resumo, o que falta e só registra com o botão liberado', async () => {
    const aoTocar = vi.fn();
    const u = userEvent.setup();
    const { rerender } = render(<RodapeLancamento rotulo="Registrar Entrada" aoTocar={aoTocar} desativado
      falta="Para registrar, digite a quantidade de pelo menos um item." />);
    expect(screen.getByRole('status').textContent).toMatch(/pelo menos um item/);
    expect(screen.getByRole('button', { name: 'Registrar Entrada' }).disabled).toBe(true);

    rerender(<RodapeLancamento rotulo="Registrar Entrada" aoTocar={aoTocar} resumo="2 itens · 5 unid → Congelado" />);
    expect(screen.getByText('2 itens · 5 unid → Congelado')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Registrar Entrada' }));
    expect(aoTocar).toHaveBeenCalledTimes(1);

    rerender(<RodapeLancamento rotulo="Registrar Entrada" aoTocar={aoTocar} ocupado />);
    expect(screen.getByRole('button', { name: 'Registrando…' }).disabled).toBe(true);
  });
});

describe('o − / +', () => {
  it('soma e tira de um em um, nunca abaixo de zero, sem resto de vírgula', async () => {
    const aoMudar = vi.fn();
    const u = userEvent.setup();
    const { rerender } = render(<Passador valor="0.2" aoMudar={aoMudar} rotulo="Quantidade de Picanha" passo={0.1} />);
    await u.click(screen.getByRole('button', { name: 'Aumentar quantidade de Picanha' }));
    expect(aoMudar).toHaveBeenLastCalledWith('0.3');
    rerender(<Passador valor="" aoMudar={aoMudar} rotulo="Quantidade de Picanha" />);
    await u.click(screen.getByRole('button', { name: 'Diminuir quantidade de Picanha' }));
    expect(aoMudar).toHaveBeenLastCalledWith('0');
    expect(screen.getByRole('spinbutton', { name: 'Quantidade de Picanha' })).toBeTruthy();
  });
});

describe('as sete telas de lançamento terminam do mesmo jeito', () => {
  it('o botão mora no pé fixo, não no topo', () => {
    for (const tela of ['Entradas', 'Saidas', 'AparasPerdas', 'Producao', 'Compras', 'Inventario', 'FecharTurno']) {
      const src = ler(`../../pages/${tela}.jsx`);
      expect(src, tela).toMatch(/<RodapeLancamento/);
      expect(src, tela).not.toMatch(/import Botao from/);
    }
  });

  it('o Fechar turno pede a contagem antes de fechar (o botão vinha antes da contagem)', () => {
    const t = ler('../../pages/FecharTurno.jsx');
    expect(t).toMatch(/if \(!contados\) \{/);
    expect(t.indexOf('Contagem da bancada')).toBeLessThan(t.indexOf('<RodapeLancamento'));
  });

  it('apara e perda falam a língua da bancada', () => {
    const a = ler('../../pages/AparasPerdas.jsx') + ler('../OrigemCorrecao.jsx');
    // (só o texto na tela: os comentários citam os termos antigos de propósito)
    expect(a).not.toMatch(/>\s*(Associar à compra|Produto de origem)|— Não associar —/);
    expect(a).not.toMatch(/\{d\.cod\}<\/span> —|\{m\.cod\}<\/span> —/);
    expect(a).toMatch(/De qual compra veio\? \(opcional\)/);
    expect(a).toMatch(/Para onde vai a apara/);
  });
});
