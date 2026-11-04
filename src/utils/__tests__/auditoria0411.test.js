import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fmtDataDoBanco } from '../formatters';
import { montarCamposEtiqueta } from '../etiquetas';

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// =====================================================================
//  AUDITORIA DE 04/11/2026 — os bugs achados e corrigidos na hora.
// =====================================================================

describe('datas do banco no painel da Aurum', () => {
  it('⚠️ o dia sozinho (coluna date) não volta um dia no Brasil', () => {
    // new Date('2026-11-04') é meia-noite em UTC = 03/11 21h em Recife
    expect(fmtDataDoBanco('2026-11-04')).toBe('04/11/2026');
    expect(fmtDataDoBanco('2026-01-01')).toBe('01/01/2026');
  });
  it('o carimbo completo continua pela hora local, e vazio vira travessão', () => {
    expect(fmtDataDoBanco('2026-11-04T15:00:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(fmtDataDoBanco(null)).toBe('—');
    expect(fmtDataDoBanco('')).toBe('—');
  });
  it('o painel usa o formatador novo, e as cópias levam o dia de cá no nome', () => {
    const admin = ler('../../pages/Admin.jsx');
    expect(admin).toMatch(/const dataBR = fmtDataDoBanco;/);
    expect(admin).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/);
    expect(ler('../../store/AppContext.jsx')).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/);
  });
});

describe('trocar de tela abre no topo', () => {
  it('volta ao topo a cada tela nova, menos com âncora', () => {
    const app = ler('../../App.jsx');
    expect(app).toMatch(/if \(!hash\) window\.scrollTo\(0, 0\);/);
    expect(app).toMatch(/<BrowserRouter basename=\{import\.meta\.env\.BASE_URL\}>\s+<TopoAoTrocarDeTela \/>/);
  });
});

describe('"Continuar imprimindo?" só para quem ainda está', () => {
  it('confere a pessoa de AGORA quando a etiqueta sai, não a de quando a janela abriu', () => {
    const tela = ler('../../pages/Etiquetas.jsx');
    expect(tela).toMatch(/aoTerminar: \(\) => \{ if \(operadorAgora\.current\) setPerguntarSeContinua\(true\); \},/);
    expect(tela).toMatch(/useEffect\(\(\) => \{ operadorAgora\.current = operador; \}, \[operador\]\);/);
  });
});

describe('a reimpressão sai igual ao papel original', () => {
  it('a etiqueta impressa guarda o lote do fabricante, a validade original, marca e SIF', () => {
    const janela = ler('../../components/EtiquetaPrint.jsx');
    for (const campo of ['lote', 'valOriginal', 'marca', 'sif']) {
      expect(janela).toContain(`...(c.${campo} && { ${campo}: c.${campo} }),`);
    }
  });
  it('e a aba Impressas devolve isso na reimpressão', () => {
    const impressas = ler('../../pages/etiquetas/Impressas.jsx');
    expect(impressas).toMatch(/lote: e\.lote \|\| '',/);
    expect(impressas).toMatch(/valOriginal: e\.valOriginal \|\| '',/);
  });
  it('os campos existem no que a etiqueta monta', () => {
    const c = montarCamposEtiqueta({
      nome: 'Frango', dataFabricacao: '2026-11-04', hora: '10:00', diasValidade: 3,
      lote: 'L-123', valOriginal: '2026-12-01', marca: 'Sadia', sif: '1234',
    });
    expect([c.lote, c.valOriginal, c.marca, c.sif]).toEqual(['L-123', '2026-12-01', 'Sadia', '1234']);
  });
});
