// =====================================================================
//  NOME PARADO SAI SOZINHO DA EQUIPE (23/11/2026, no jeito do Magurō)
//
//  Quem fica 60 dias DE USO DA COZINHA sem entrar sai da lista. Aqui: a
//  conta dos dias, as férias (não apagam ninguém), o relógio errado de um
//  aparelho (não apaga ninguém de uma vez) e as travas no código (quem
//  roda a limpeza, e quando).
// =====================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DIAS_SEM_USO, lerUso, ultimoUso, marcarUso, completarUso, diasSemEntrar, diasParaSair,
  nomesParados, semUso, podarUso,
} from '../usoEquipe';

// dia n a partir de 01/01/2026 (em UTC: sem horário de verão no caminho)
const dia = (n) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
// a cozinha usando o app nos dias de..ate (João entra todo dia)
function usarDias(doc, de, ate, nome = 'João') {
  let d = doc;
  for (let n = de; n <= ate; n++) d = marcarUso(d, nome, dia(n));
  return d;
}

describe('marcar o uso', () => {
  it('guarda o dia de quem entrou e conta o dia como dia de uso', () => {
    const doc = marcarUso({}, 'Maria', dia(0));
    expect(doc).toEqual({ dias: [dia(0)], nomes: { Maria: dia(0) } });
    expect(ultimoUso(doc, 'Maria')).toBe(dia(0));
  });

  it('entrar de novo no mesmo dia não muda nada (e o app não grava à toa)', () => {
    const doc = marcarUso({}, 'Maria', dia(0));
    expect(marcarUso(doc, 'Maria', dia(0))).toBe(doc);
  });

  it('os dias ficam do mais novo para o mais velho, sem repetir, no máximo 60', () => {
    const doc = usarDias({}, 0, 99);
    const { dias } = lerUso(doc);
    expect(dias).toHaveLength(DIAS_SEM_USO);
    expect(dias[0]).toBe(dia(99));
    expect(dias[DIAS_SEM_USO - 1]).toBe(dia(40));
    expect(new Set(dias).size).toBe(dias.length);
  });

  it('documento torto (vazio, lista, texto) vira documento certo', () => {
    for (const torto of [null, undefined, [], 'x', 7, { dias: 'x', nomes: [] }]) {
      expect(marcarUso(torto, 'Ana', dia(3))).toEqual({ dias: [dia(3)], nomes: { Ana: dia(3) } });
    }
  });

  it('nome como __proto__ vira chave de verdade, sem mexer no protótipo', () => {
    const doc = marcarUso({}, '__proto__', dia(1));
    expect(ultimoUso(doc, '__proto__')).toBe(dia(1));
    expect(Object.getPrototypeOf(doc.nomes)).toBe(Object.prototype);
    expect(ultimoUso({}, 'constructor')).toBe('');
    // e sobrevive à ida e volta da nuvem
    expect(ultimoUso(JSON.parse(JSON.stringify(doc)), '__proto__')).toBe(dia(1));
  });
});

describe('quem sai: 60 dias de uso da cozinha sem entrar', () => {
  it('59 dias de uso sem a Maria: fica (falta 1); 60: sai', () => {
    let doc = marcarUso({}, 'Maria', dia(0));
    doc = usarDias(doc, 1, 59);
    expect(diasSemEntrar(doc, 'Maria')).toBe(59);
    expect(diasParaSair(doc, 'Maria')).toBe(1);
    expect(nomesParados(doc, ['Maria', 'João'])).toEqual([]);
    doc = usarDias(doc, 60, 60);
    expect(diasParaSair(doc, 'Maria')).toBe(0);
    expect(nomesParados(doc, ['Maria', 'João'])).toEqual(['Maria']);
  });

  it('entrar antes do prazo zera a contagem', () => {
    let doc = marcarUso({}, 'Maria', dia(0));
    doc = usarDias(doc, 1, 50);
    doc = marcarUso(doc, 'Maria', dia(50));
    expect(diasParaSair(doc, 'Maria')).toBe(DIAS_SEM_USO);
  });

  it('⚠️ FÉRIAS: 70 dias sem ninguém usar o app não apagam ninguém', () => {
    let doc = usarDias({}, 0, 9, 'Maria');      // Maria trabalhou 10 dias
    doc = usarDias(doc, 0, 9, 'João');
    // ... 70 dias de cozinha fechada: ninguém entra ...
    doc = marcarUso(doc, 'João', dia(80));      // na volta, João entra primeiro
    expect(diasSemEntrar(doc, 'Maria')).toBe(1);
    expect(nomesParados(doc, ['Maria', 'João'])).toEqual([]);
  });

  it('nome sem data nunca sai (ganha o prazo em completarUso)', () => {
    const doc = usarDias({}, 0, 99);
    expect(diasParaSair(doc, 'Pedro')).toBe(null);
    expect(nomesParados(doc, ['Pedro'])).toEqual([]);
  });

  it('nome que não está mais na equipe não entra na lista de quem sai', () => {
    let doc = marcarUso({}, 'Maria', dia(0));
    doc = usarDias(doc, 1, 70);
    expect(nomesParados(doc, ['João'])).toEqual([]);
  });
});

describe('⚠️ relógio errado num aparelho não apaga a equipe', () => {
  it('tablet ADIANTADO (2030): vale no máximo um dia de uso a mais para os outros', () => {
    let doc = marcarUso({}, 'Maria', dia(0));
    doc = usarDias(doc, 1, 10);
    const antes = diasSemEntrar(doc, 'Maria');
    doc = marcarUso(doc, 'João', '2030-06-01');
    expect(diasSemEntrar(doc, 'Maria')).toBe(antes + 1);
    expect(nomesParados(doc, ['Maria', 'João'])).toEqual([]);
  });

  it('tablet ATRASADO (2010): nome novo não ganha 2010 — ganha o dia de uso mais novo da equipe', () => {
    let doc = usarDias({}, 0, 59);              // 60 dias de uso: lista cheia
    doc = marcarUso(doc, 'Pedro', '2010-01-01');
    expect(ultimoUso(doc, 'Pedro')).toBe(dia(59));
    expect(nomesParados(doc, ['Pedro', 'João'])).toEqual([]);
    // e o "2010" não ocupa lugar dos dias de verdade
    expect(lerUso(doc).dias).not.toContain('2010-01-01');
  });

  it('a data de quem já entrou nunca volta para trás', () => {
    let doc = marcarUso({}, 'Maria', dia(30));
    doc = marcarUso(doc, 'Maria', dia(2));
    expect(ultimoUso(doc, 'Maria')).toBe(dia(30));
  });

  it('completarUso também não usa a data atrasada', () => {
    const doc = usarDias({}, 0, 20);
    const completo = completarUso(doc, ['João', 'Ana'], '2010-01-01');
    expect(ultimoUso(completo, 'Ana')).toBe(dia(20));
  });
});

describe('completar, tirar e podar', () => {
  it('completarUso dá hoje só a quem não tem data, e não grava à toa', () => {
    const doc = marcarUso({}, 'Maria', dia(5));
    const completo = completarUso(doc, ['Maria', 'Ana'], dia(9));
    expect(ultimoUso(completo, 'Maria')).toBe(dia(5));
    expect(ultimoUso(completo, 'Ana')).toBe(dia(9));
    // completar não é uso: não conta dia
    expect(lerUso(completo).dias).toEqual([dia(5)]);
    expect(completarUso(completo, ['Maria', 'Ana'], dia(9))).toBe(completo);
  });

  it('semUso tira o nome; podarUso tira quem saiu da equipe; nada a tirar = mesmo documento', () => {
    let doc = marcarUso({}, 'Maria', dia(1));
    doc = marcarUso(doc, 'João', dia(1));
    expect(semUso(doc, 'Pedro')).toBe(doc);
    expect(lerUso(semUso(doc, 'Maria')).nomes).toEqual({ João: dia(1) });
    expect(podarUso(doc, ['Maria', 'João', 'Ana'])).toBe(doc);
    expect(lerUso(podarUso(doc, ['João'])).nomes).toEqual({ João: dia(1) });
    // os dias de uso ficam
    expect(lerUso(podarUso(doc, [])).dias).toEqual([dia(1)]);
  });
});

describe('travas no código', () => {
  const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
  const app = ler('../../store/AppContext.jsx');
  const op = ler('../../store/OperadorContext.jsx');
  const poda = app.slice(app.indexOf('const podaDaEquipeRef'), app.indexOf('// ── Registros operacionais'));

  it('a limpeza só roda com a nuvem carregada, fora da demonstração e do modo suporte', () => {
    expect(poda).toMatch(/if \(!nuvemCarregada \|\| !nuvemDe\(rid\) \|\| soLeitura\) return undefined;/);
    // primeiro completa as datas; só sai quem passou do prazo no documento que voltou do servidor
    expect(poda.indexOf('completarUso')).toBeLessThan(poda.indexOf('nomesParados(r1.doc'));
    // a senha e a data saem junto com o nome
    expect(poda).toMatch(/semOrfas\(doc, ficam\)/);
    expect(poda).toMatch(/podarUso\(doc, ficam\)/);
    expect(poda).toMatch(/logAudit\(/);
  });

  it('o uso é marcado ao entrar pela senha e ao criar a senha', () => {
    expect(op.match(/marcarUsoDaPessoa\(nome\)/g)).toHaveLength(2);
  });

  it('usoEquipe é documento da conta, acompanha o tempo real e a importação', () => {
    expect(app).toMatch(/usoEquipe: setUsoEquipeRaw,/);
    expect(app).toMatch(/setUsoEquipeRaw\(cacheGet\(rid, 'usoEquipe', \{\}\)\)/);
    expect(app).toMatch(/podarUso\(doc, dados\.pessoas\)/);
  });
});
