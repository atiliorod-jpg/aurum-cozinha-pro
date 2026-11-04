import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { OCIOSO_MS, expirou } from '../senhaEquipe';
import { montarCamposEtiqueta } from '../etiquetas';

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// =====================================================================
//  03/11/2026 — mais duas ideias da Suflex, aprovadas pelo dono:
//   • na impressão só se preenche quantidade, medida e lote: a data é a da
//     impressão e a validade é a do cadastro ("tudo isso de validade já vale
//     o que foi cadastrado"); o método lista só o cadastrado, com prazo;
//   • 1 minuto sem uso na tela Imprimir volta para os nomes, e depois de
//     imprimir o app pergunta "Continuar imprimindo?" (5 s para responder).
// =====================================================================

describe('a janela de impressão não muda data nem prazo', () => {
  const janela = ler('../../components/EtiquetaPrint.jsx');
  it('sem campo de data, de dias, de horas nem de minutos', () => {
    for (const id of ['ep-data-', 'ep-dias-', 'ep-horas-', 'ep-min-']) expect(janela).not.toContain(id);
    // o que fica: medida, lote e (se ligado no modelo) a val. original
    expect(janela).toContain('ep-medida-');
    expect(janela).toContain('ep-lote-');
    expect(janela).toMatch(/config\.campos\.valOriginal !== false && <div>/);
  });
  it('o método lista só os cadastrados com prazo, mais aquele em que a janela abriu', () => {
    expect(janela).toMatch(/metodosLigados\(item\)\.filter\(temPrazo\)/);
    expect(janela).toMatch(/const abriu = valorDe\(item\._metodoOriginal, item\._armazOriginal\);/);
    expect(janela).not.toMatch(/outrosArmazenamentos|<optgroup/);
    // uma opção só, ou a reimpressão: texto, sem lista
    expect(janela).toMatch(/opcoes\.length <= 1 \|\| reimpressao\(item\)/);
  });
});

describe('validade do fabricante antes do prazo da casa', () => {
  it('a etiqueta sai com a data do fabricante, sem hora', () => {
    const c = montarCamposEtiqueta({
      nome: 'Frango', dataFabricacao: '2026-11-03', hora: '10:00', diasValidade: 5, valOriginal: '2026-11-05',
    });
    expect(c.passaDoFornecedor).toBe(true);
    expect(c.validade).toBe('2026-11-05');
    expect(c.validadeFmt).toBe('05/11/2026');
  });
  it('dentro do prazo do fabricante, nada muda', () => {
    const c = montarCamposEtiqueta({
      nome: 'Frango', dataFabricacao: '2026-11-03', hora: '10:00', diasValidade: 2, valOriginal: '2026-11-30',
    });
    expect(c.validade).toBe('2026-11-05');
    expect(c.validadeFmt).toBe('05/11/2026 - 10:00');
  });
});

describe('de volta para os nomes', () => {
  it('1 minuto sem uso', () => {
    expect(OCIOSO_MS).toBe(60_000);
    expect(expirou(0 + 1, 60_001)).toBe(true);
    expect(expirou(1000, 59_000)).toBe(false);
  });
  it('a expiração é contada à parte do "Trocar"', () => {
    const op = ler('../../store/OperadorContext.jsx');
    expect(op).toMatch(/const expirar = useCallback\(\(\) => \{ sair\(\); setExpiracoes\(n => n \+ 1\); \}, \[sair\]\);/);
    // ⚠️ 04/11/2026: só na tela Imprimir — nos lançamentos do Pro o nome não expira
    expect(op).toMatch(/operadorRef\.current && telasDeImprimirRef\.current > 0 && expirou\(/);
    // e quem CHEGA nela depois de 1 minuto parado em outra tela volta para os nomes
    expect(op).toMatch(/usoAnteriorRef\.current\s+&& expirou\(usoAnteriorRef\.current, ultimoUsoRef\.current\)\) expirar\(\);/);
    expect(ler('../../pages/Etiquetas.jsx')).toMatch(/useTelaDeImprimir\(\);/);
    expect(op).toMatch(/setInterval\(conferir, 5_000\)/);
  });
  it('só a janela aberta pela tela Imprimir fecha, e nunca no meio de um envio', () => {
    const janela = ler('../../components/EtiquetaPrint.jsx');
    expect(janela).toMatch(/if \(etiquetaState && etiquetaOpcoes\?\.daTelaImprimir && !congelaAgora\) fecharEtiquetas\(\);/);
    const tela = ler('../../pages/Etiquetas.jsx');
    // e só pergunta se a pessoa ainda está (auditoria 04/11/2026)
    expect(tela).toMatch(/daTelaImprimir: true,\s+aoTerminar: \(\) => \{ if \(operadorAgora\.current\) setPerguntarSeContinua\(true\); \},/);
  });
  it('"Continuar imprimindo?" dá 5 segundos, e só aparece quando a etiqueta sai', () => {
    expect(ler('../../components/QuemImprime.jsx')).toMatch(/export const SEGUNDOS_PARA_CONTINUAR = 5;/);
    const janela = ler('../../components/EtiquetaPrint.jsx');
    // o "Sim" do computador e o envio completo pelo Bluetooth — nunca o "Não" nem o erro
    expect(janela.match(/aoTerminar\?\.\(\);/g)).toHaveLength(2);
  });
});
