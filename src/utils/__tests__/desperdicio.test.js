// =====================================================================
//  REGISTRO DE DESPERDÍCIO (24/11/2026) — as regras do checklist do Magurō
//  (os mesmos casos de maguro-estoque/src/desperdicio/__tests__) e o que o
//  Aurum acrescenta: turnos da casa, motivos da casa, grupo do item.
// =====================================================================
import { describe, it, expect } from 'vitest';
import {
  conferirDescarte, somarPorGrupo, somarPorItem, somarPorMotivo, totais, itensForaDaLista, registroForaDaLista,
  turnoDe, turnosDaCasa, motivosDaCasa, MOTIVOS_PADRAO, TURNOS_PADRAO, unidadeDoItem, fmtQtd, resumoRegistro,
  planilhaDoDesperdicio,
} from '../desperdicio';

const r = (item_nome, quantidade, motivo, unidade = 'kg', item_id = null) => ({ item_nome, quantidade, motivo, unidade, item_id });

describe('as somas do relatório (iguais às do Magurō)', () => {
  it('soma itens iguais mesmo com acento, maiúscula e espaço diferentes', () => {
    const s = somarPorItem([r('Salmão', 0.5, 'Vencido'), r('salmao ', 0.25, 'Estragado'), r('SALMÃO', 1, 'Vencido'), r('Arroz', 2, 'Sobra')]);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ item: 'Arroz', total: 2, vezes: 1 });
    expect(s[1]).toMatchObject({ item: 'Salmão', total: 1.75, vezes: 3 });
    expect(s[1].motivos).toEqual([{ motivo: 'Vencido', total: 1.5 }, { motivo: 'Estragado', total: 0.25 }]);
  });

  it('junta pelo item cadastrado, mesmo se o nome mudou depois (usa o nome de hoje)', () => {
    const s = somarPorItem([r('Arroz de sushi', 1, 'Sobra', 'kg', 'id1'), r('Shari', 2, 'Sobra', 'kg', 'id1')], [{ id: 'id1', nome: 'Shari' }]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ item: 'Shari', total: 3 });
  });

  it('item digitado fora da lista soma com o cadastrado de mesmo nome', () => {
    const s = somarPorItem([r('salmao', 0.5, 'Vencido'), r('Salmão', 1, 'Vencido', 'kg', 'id9')], [{ id: 'id9', nome: 'Salmão' }]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ item: 'Salmão', total: 1.5 });
  });

  it('kg e unidade nunca se somam', () => {
    const s = somarPorItem([r('Hot roll', 2, 'Queimado', 'kg'), r('Hot roll', 5, 'Queimado', 'unid')]);
    expect(s.map(g => `${g.total} ${g.unidade}`)).toEqual(['2 kg', '5 unid']);
  });

  it('por motivo (só kg) e totais', () => {
    const regs = [r('A', 1, 'Vencido'), r('B', 0.5, 'Vencido'), r('C', 2, 'Queimado'), r('D', 3, 'Vencido', 'unid')];
    expect(somarPorMotivo(regs)).toEqual([{ motivo: 'Queimado', total: 2 }, { motivo: 'Vencido', total: 1.5 }]);
    expect(totais(regs)).toEqual({ kg: 3.5, unid: 3, registros: 4 });
  });

  it('soma por grupo: o grupo PRINCIPAL do item; fora da lista acha pelo nome; senão "Sem grupo"', () => {
    const itens = [{ id: 's', nome: 'Salmão', grupos: ['PROTEÍNAS', 'SUSHI'] }, { id: 'a', nome: 'Atum', categoria: 'PROTEÍNAS' }, { id: 'r', nome: 'Arroz', grupos: ['ARROZ'] }];
    const g = somarPorGrupo([r('Salmão', 1, 'V', 'kg', 's'), r('atum', 0.5, 'V'), r('Arroz', 2, 'S', 'kg', 'r'), r('Molho X', 0.2, 'V')], itens);
    expect(g).toEqual([
      { grupo: 'ARROZ', unidade: 'kg', total: 2, vezes: 1 },
      { grupo: 'PROTEÍNAS', unidade: 'kg', total: 1.5, vezes: 2 },
      { grupo: 'Sem grupo', unidade: 'kg', total: 0.2, vezes: 1 },
    ]);
  });

  it('⚠️ a letra "s" não vira espaço (o defeito do Magurō): "Massa" e "Maa" são itens diferentes', () => {
    expect(somarPorItem([r('Massa', 1, 'V'), r('Maa', 1, 'V')])).toHaveLength(2);
    expect(registroForaDaLista(r('Massa', 1, 'V'), [{ id: 'x', nome: 'Maa' }])).toBe(true);
  });
});

describe('o registro', () => {
  it('exige item, quantidade maior que zero, unidade kg/unid e motivo', () => {
    expect(() => conferirDescarte({ itemNome: 'x', quantidade: 1, unidade: 'kg', motivo: '' })).toThrow(/motivo/);
    expect(() => conferirDescarte({ itemNome: 'x', quantidade: 0, unidade: 'kg', motivo: 'm' })).toThrow(/maior que zero/);
    expect(() => conferirDescarte({ itemNome: 'x', quantidade: 1, unidade: 'cx', motivo: 'm' })).toThrow(/Unidade/);
    expect(() => conferirDescarte({ itemNome: ' ', quantidade: 1, unidade: 'kg', motivo: 'm' })).toThrow(/item/);
    expect(conferirDescarte({ itemNome: 'x', quantidade: 1, unidade: 'unid', motivo: 'm' })).toBe(true);
  });

  it('a unidade de costume vem do item: unid, ou kg para todo o resto', () => {
    expect(unidadeDoItem({ unidade: 'unid' })).toBe('unid');
    expect(unidadeDoItem({ unidade: 'Un' })).toBe('unid');
    expect(unidadeDoItem({ unidade: 'kg' })).toBe('kg');
    expect(unidadeDoItem({ unidade: 'g' })).toBe('kg');
    expect(unidadeDoItem({ unidade: 'L' })).toBe('kg');
  });

  it('a quantidade na tela: vírgula, até 3 casas', () => {
    expect(fmtQtd(1.5, 'kg')).toBe('1,5 kg');
    expect(fmtQtd(0.125, 'kg')).toBe('0,125 kg');
    expect(fmtQtd(3, 'unid')).toBe('3 unid');
  });
});

describe('turnos e motivos da casa', () => {
  it('Manhã e Noite por padrão (decisão do dono); antes do primeiro turno ainda é o último', () => {
    expect(TURNOS_PADRAO.map(t => t.nome)).toEqual(['Manhã', 'Noite']);
    expect(turnoDe(new Date(2026, 10, 24, 10, 0))).toBe('Manhã');
    expect(turnoDe(new Date(2026, 10, 24, 15, 59))).toBe('Manhã');
    expect(turnoDe(new Date(2026, 10, 24, 16, 0))).toBe('Noite');
    expect(turnoDe(new Date(2026, 10, 24, 2, 30))).toBe('Noite');
  });

  it('os turnos da Administração valem; hora inválida ou lista vazia volta para o padrão', () => {
    const t = turnosDaCasa({ turnosDescarte: [{ nome: 'Noite', inicio: '17:30' }, { nome: 'Manhã', inicio: '06:00' }] });
    expect(t).toEqual([{ nome: 'Manhã', inicio: '06:00' }, { nome: 'Noite', inicio: '17:30' }]);
    expect(turnoDe(new Date(2026, 10, 24, 17, 0), t)).toBe('Manhã');
    expect(turnosDaCasa({ turnosDescarte: [{ nome: 'X', inicio: '25:00' }] })).toEqual(TURNOS_PADRAO);
    expect(turnosDaCasa({})).toEqual(TURNOS_PADRAO);
  });

  it('os motivos da Administração valem (sem repetidos nem vazios); sem lista, os do Magurō', () => {
    expect(motivosDaCasa({})).toEqual(MOTIVOS_PADRAO);
    expect(motivosDaCasa({ motivosDescarte: ['Vencido', ' vencido ', '', 'Queimado'] })).toEqual(['Vencido', 'Queimado']);
    expect(motivosDaCasa({ motivosDescarte: [] })).toEqual([]);
  });
});

describe('itens registrados fora da lista (para a Administração cadastrar)', () => {
  it('marca o que não tem item cadastrado com o mesmo nome; some quando cadastra', () => {
    const regs = [r('Salmão', 1, 'V', 'kg', 's'), r('molho shoyu', 0.3, 'V'), r('Molho Shoyu', 0.2, 'E'), r('salmao', 0.5, 'V')];
    const itens = [{ id: 's', nome: 'Salmão' }];
    expect(itensForaDaLista(regs, itens).map(g => [g.item, g.total, g.vezes])).toEqual([['molho shoyu', 0.5, 2]]);
    expect(regs.map(x => registroForaDaLista(x, itens))).toEqual([false, true, true, false]);
    expect(itensForaDaLista(regs, [...itens, { id: 'm', nome: 'Molho shoyu' }])).toEqual([]);
  });
});

describe('a planilha', () => {
  it('quatro abas, e o corrigido diz como a pessoa registrou', () => {
    const regs = [{ ...r('Frango', 2, 'Sobra de produção', 'kg', 'f'), dia: '2026-11-24', hora: '10:00', turno: 'Manhã', responsavel: 'Maria',
      editado_em: '2026-11-24T14:00:00Z', original: { item_nome: 'Frango', quantidade: 1.5, unidade: 'kg', motivo: 'Vencido' } }];
    const abas = planilhaDoDesperdicio(regs, [{ id: 'f', nome: 'Frango' }], { de: '2026-11-24', ate: '2026-11-24' });
    expect(abas.map(a => a[0])).toEqual(['Soma por item', 'Por grupo', 'Por motivo', 'Um por um']);
    expect(abas[3][1][1]).toEqual(['24/11/2026', '10:00', 'Manhã', 'Frango', 2, 'kg', 'Sobra de produção', 'Maria',
      'Sim (antes: Frango · 1,5 kg · Vencido)']);
    expect(resumoRegistro(null)).toBe('');
  });
});

// ── ligado no app e no banco ─────────────────────────────────────────
import { readFileSync } from 'node:fs';
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('ligado no app (o Etiquetas com o desperdício)', () => {
  it('Etiquetas | Desperdício: botões no topo das duas telas; a barra fica com 3 abas', () => {
    expect(ler('../../pages/Etiquetas.jsx')).toMatch(/\{soEtiq && <TrocaEtiquetaDesperdicio atual="etiquetas" \/>\}/);
    expect(ler('../../pages/Desperdicio.jsx')).toMatch(/<TrocaEtiquetaDesperdicio atual="desperdicio" \/>/);
    const barra = ler('../../components/NavBar.jsx');
    expect(barra).toMatch(/\{ to: '\/',\s+icon: 'etiqueta', label: 'Imprimir', tambem: \['\/desperdicio'\] \}/);
    expect(barra).toMatch(/tambem: \['\/relatorio-etiquetas', '\/relatorio-desperdicio'\]/);
  });

  it('a mesma pessoa vale nas duas telas, e o minuto parado também vale no desperdício', () => {
    const tela = ler('../../pages/Desperdicio.jsx');
    expect(tela).toMatch(/<FaixaOperador acao="Registrando" aoTrocar=\{trocarPessoa\} \/>/);
    expect(tela).toMatch(/useTelaDeImprimir\(\);/);
    expect(tela).toMatch(/pergunta=\{`Registrar outro desperdício, \$\{operador\}\?`\}/);
  });

  it('rotas: a tela livre; o relatório com a senha da Administração', () => {
    const app = ler('../../App.jsx');
    expect(app).toMatch(/<Route path="\/desperdicio" element=\{<Desperdicio \/>\} \/>/);
    expect(app).toMatch(/<Route path="\/relatorio-desperdicio" element=\{<ComSenha liberado=\{can\('verRelatorioEtiquetas'\)\} titulo="Relatório de desperdício"><RelatorioDesperdicio \/><\/ComSenha>\} \/>/);
    expect(ler('../../pages/Administracao.jsx')).toMatch(/to: '\/relatorio-desperdicio', icone: 'perda', titulo: 'Relatório de desperdício'/);
    expect(ler('../../store/acessosAdmin.js')).toMatch(/desperdicio: soEtiq && sistema,/);
  });

  it('sem internet: a mesma fila do app, idempotente pelo id do aparelho', () => {
    expect(ler('../../lib/descartes.js')).toMatch(/outboxAdd\(rid, \{ kind: 'descarte', op: 'rpc', payload: \{ itens: \[linha\] \} \}\)/);
    expect(ler('../../store/AppContext.jsx')).toMatch(/else if \(item\.kind === 'descarte' && item\.op === 'rpc'\)\s+\(\{ error \} = await supabase\.rpc\('registrar_descartes'/);
  });

  it('"Cadastrar" do fora da lista abre Meus itens com o nome', () => {
    expect(ler('../../pages/RelatorioDesperdicio.jsx')).toMatch(/navigate\(`\/itens\?novo=\$\{encodeURIComponent\(g\.item\)\}&unidade=\$\{g\.unidade\}`\)/);
    expect(ler('../../pages/etiquetas/Itens.jsx')).toMatch(/const nome = \(params\.get\('novo'\) \|\| ''\)\.trim\(\)\.slice\(0, 120\);/);
  });
});

describe('a migração 65 (o banco decide)', () => {
  const sql = ler('../../lib/migration65_desperdicio.sql');
  it('ninguém toca a tabela direto; reenviar não duplica; dia e hora no fuso de Recife', () => {
    expect(sql).toMatch(/revoke all on descartes from public, anon, authenticated;/);
    expect(sql).toMatch(/on conflict \(id\) do nothing/);
    expect(sql).toMatch(/\(l\.quando at time zone 'America\/Recife'\)::date/);
    expect(sql).toMatch(/and l\.quando >= now\(\) - interval '30 days'/);
    expect(sql).toMatch(/_pode_gravar_etiqueta\(rid, \(l\.quando at time zone 'America\/Recife'\)::date\)/);
  });
  it('ler, corrigir e apagar só com a Administração aberta', () => {
    expect(sql).toMatch(/if meu_restaurante_id\(\) is null or coalesce\(meu_cargo\(\), ''\) <> 'diretoria' then\s+raise exception 'Abra a Administração para ver o desperdício\.';/);
    for (const f of ['descartes_do_periodo', 'corrigir_descarte', 'voltar_descarte_original', 'apagar_descarte', 'apagar_descartes_periodo']) {
      expect(sql).toMatch(new RegExp(`function ${f}\\([\\s\\S]*?_conta_do_desperdicio\\(`));
    }
    expect(sql).toMatch(/set original = coalesce\(original, jsonb_build_object\(/);
  });
});
