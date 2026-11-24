// =====================================================================
//  REGISTRO DE DESPERDÍCIO (24/11/2026) — as regras do checklist do Magurō
//  (os mesmos casos de maguro-estoque/src/desperdicio/__tests__) e o que o
//  Aurum acrescenta: turnos da casa, motivos da casa, grupo do item.
// =====================================================================
import { describe, it, expect } from 'vitest';
import {
  conferirDescarte, somarPorGrupo, somarPorItem, somarPorMotivo, totais, itensForaDaLista, registroForaDaLista,
  turnoDe, turnosDaCasa, motivosDaCasa, MOTIVOS_PADRAO, TURNOS_PADRAO, unidadeDoItem, fmtQtd, resumoRegistro,
  planilhaDoDesperdicio, fmtPeso, fmtSoma, mudancaDoRegistro, UNIDADES_DESCARTE, UNIDADES_NA_JANELA,
  somarPorTurno, somarPorPessoa, fmtPesoEUnid,
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

  it('⚠️ GRAMAS (M66): g vira kg nas somas e soma junto; unid continua à parte', () => {
    const regs = [r('Bolinho de costela', 10, 'Vencido', 'g'), r('Bolinho de costela', 0.5, 'Vencido', 'kg'),
      r('Bolinho de costela', 4, 'Queimado', 'unid'), r('Arroz', 250, 'Sobra', 'g')];
    const s = somarPorItem(regs);
    expect(s.map(g => [g.item, g.total, g.unidade])).toEqual([
      ['Bolinho de costela', 0.51, 'kg'], ['Arroz', 0.25, 'kg'], ['Bolinho de costela', 4, 'unid']]);
    expect(totais(regs)).toEqual({ kg: 0.76, unid: 4, registros: 4 });
    expect(somarPorMotivo(regs)).toEqual([{ motivo: 'Vencido', total: 0.51 }, { motivo: 'Sobra', total: 0.25 }]);
    expect(somarPorGrupo(regs)).toEqual([
      { grupo: 'Sem grupo', unidade: 'kg', total: 0.76, vezes: 3 }, { grupo: 'Sem grupo', unidade: 'unid', total: 4, vezes: 1 }]);
    // 2,5 g não se perdem no arredondamento
    expect(totais([r('Sal', 2.5, 'V', 'g')]).kg).toBe(0.0025);
  });

  it('⚠️ O PESO NO TAMANHO CERTO, sozinho: abaixo de 1 kg em gramas, senão em kg', () => {
    expect(fmtPeso(0.25)).toBe('250 g');
    expect(fmtPeso(0.0025)).toBe('2,5 g');
    expect(fmtPeso(1.25)).toBe('1,25 kg');
    expect(fmtPeso(0)).toBe('0 kg');
    expect(fmtSoma(4, 'unid')).toBe('4 unid');
    expect(fmtSoma(0.51, 'kg')).toBe('510 g');
    // o registro: 0,010 kg (da balança) e 10 g (antigo, ou da voz) dizem o mesmo
    expect(fmtQtd(0.01, 'kg')).toBe('10 g');
    expect(fmtQtd(10, 'g')).toBe('10 g');
    expect(fmtQtd(1500, 'g')).toBe('1,5 kg');
    expect(fmtPesoEUnid(1.5, 3)).toBe('1,5 kg + 3 unid');
    expect(fmtPesoEUnid(0.25, 0)).toBe('250 g');
    expect(fmtPesoEUnid(0, 3)).toBe('3 unid');
  });

  it('POR TURNO (Manhã × Noite) e POR PESSOA: peso com os gramas, unidades à parte', () => {
    const regs = [
      { ...r('Frango', 1.5, 'Vencido'), turno: 'Noite', responsavel: 'Ana' },
      { ...r('Arroz', 250, 'Sobra', 'g'), turno: 'Manhã', responsavel: 'João' },
      { ...r('Pão', 3, 'Queimado', 'unid'), turno: 'Manhã', responsavel: 'ana ' },
      { ...r('Molho', 0.5, 'Vencido'), turno: '', responsavel: '' },
    ];
    expect(somarPorTurno(regs, TURNOS_PADRAO)).toEqual([
      { turno: 'Manhã', kg: 0.25, unid: 3, vezes: 2 },
      { turno: 'Noite', kg: 1.5, unid: 0, vezes: 1 },
      { turno: 'Sem turno', kg: 0.5, unid: 0, vezes: 1 },
    ]);
    // "Ana" e "ana " são a mesma pessoa; quem mais descartou em peso primeiro
    expect(somarPorPessoa(regs)).toEqual([
      { pessoa: 'Ana', kg: 1.5, unid: 3, vezes: 2 },
      { pessoa: 'Sem responsável', kg: 0.5, unid: 0, vezes: 1 },
      { pessoa: 'João', kg: 0.25, unid: 0, vezes: 1 },
    ]);
  });

  it('⚠️ a letra "s" não vira espaço (o defeito do Magurō): "Massa" e "Maa" são itens diferentes', () => {
    expect(somarPorItem([r('Massa', 1, 'V'), r('Maa', 1, 'V')])).toHaveLength(2);
    expect(registroForaDaLista(r('Massa', 1, 'V'), [{ id: 'x', nome: 'Maa' }])).toBe(true);
  });
});

describe('o registro', () => {
  it('exige item, quantidade maior que zero, unidade kg/g/unid e motivo', () => {
    expect(UNIDADES_DESCARTE).toEqual(['kg', 'g', 'unid']);
    expect(conferirDescarte({ itemNome: 'x', quantidade: 10, unidade: 'g', motivo: 'm' })).toBe(true);
    expect(() => conferirDescarte({ itemNome: 'x', quantidade: 1, unidade: 'kg', motivo: '' })).toThrow(/motivo/);
    expect(() => conferirDescarte({ itemNome: 'x', quantidade: 0, unidade: 'kg', motivo: 'm' })).toThrow(/maior que zero/);
    expect(() => conferirDescarte({ itemNome: 'x', quantidade: 1, unidade: 'cx', motivo: 'm' })).toThrow(/Unidade/);
    expect(() => conferirDescarte({ itemNome: ' ', quantidade: 1, unidade: 'kg', motivo: 'm' })).toThrow(/item/);
    expect(conferirDescarte({ itemNome: 'x', quantidade: 1, unidade: 'unid', motivo: 'm' })).toBe(true);
  });

  it('a unidade de costume vem do item: unid, ou peso (kg) para todo o resto', () => {
    expect(unidadeDoItem({ unidade: 'unid' })).toBe('unid');
    expect(unidadeDoItem({ unidade: 'Un' })).toBe('unid');
    expect(unidadeDoItem({ unidade: 'kg' })).toBe('kg');
    expect(unidadeDoItem({ unidade: 'g' })).toBe('kg');
    expect(unidadeDoItem({ unidade: 'mL' })).toBe('kg');
    expect(unidadeDoItem({ unidade: 'L' })).toBe('kg');
  });

  it('⚠️ a janela só tem kg e unid: com a balança, os números tocados já são os gramas', () => {
    expect(UNIDADES_NA_JANELA).toEqual(['kg', 'unid']);
    expect(fmtQtd(1.5, 'kg')).toBe('1,5 kg');
    expect(fmtQtd(0.125, 'kg')).toBe('125 g');
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
    expect(abas.map(a => a[0])).toEqual(['Soma por item', 'Por grupo', 'Por turno', 'Por pessoa', 'Por motivo', 'Um por um']);
    expect(abas[2][1]).toEqual([['Turno', 'Peso (kg)', 'Unidades', 'Vezes'], ['Manhã', 2, 0, 1]]);
    expect(abas[3][1]).toEqual([['Pessoa', 'Peso (kg)', 'Unidades', 'Vezes'], ['Maria', 2, 0, 1]]);
    expect(abas[5][1][0]).toEqual(['Data', 'Hora', 'Turno', 'Item', 'Quantidade', 'Unidade', 'Peso (kg)', 'Motivo', 'Responsável', 'Mudou depois']);
    expect(abas[5][1][1]).toEqual(['24/11/2026', '10:00', 'Manhã', 'Frango', 2, 'kg', 2, 'Sobra de produção', 'Maria',
      'Corrigido (antes: Frango · 1,5 kg · Vencido)']);
    expect(resumoRegistro(null)).toBe('');
  });

  it('gramas: as somas em kg (número, dá para somar no Excel) e o "um por um" como foi registrado', () => {
    const base = { dia: '2026-11-24', hora: '10:00', turno: 'Manhã', responsavel: 'Ana' };
    const regs = [{ ...r('Bolinho', 300, 'Vencido', 'g'), ...base }, { ...r('Bolinho', 1, 'Vencido', 'kg'), ...base },
      { ...r('Pão', 3, 'Queimado', 'unid'), ...base, alterado_em: '2026-11-24T13:05:00Z',
        original: { item_nome: 'Pão', quantidade: 30, unidade: 'unid', motivo: 'Queimado' } }];
    const abas = planilhaDoDesperdicio(regs, [], { de: '2026-11-24', ate: '2026-11-24' });
    expect(abas[0][1].slice(3)).toEqual([['Bolinho', 1.3, 'kg', 2, 'Vencido (1,3 kg)'], ['Pão', 3, 'unid', 1, 'Queimado (3 unid)']]);
    expect(abas[4][1]).toEqual([['Motivo', 'Total (kg)'], ['Vencido', 1.3]]);
    expect(abas[5][1][1]).toEqual(['24/11/2026', '10:00', 'Manhã', 'Bolinho', 300, 'g', 0.3, 'Vencido', 'Ana', '']);
    expect(abas[5][1][3]).toEqual(['24/11/2026', '10:00', 'Manhã', 'Pão', 3, 'unid', '', 'Queimado', 'Ana',
      'Alterado na hora (antes: Pão · 30 unid · Queimado)']);
  });

  it('o que mudou depois: alterado na hora (quem registrou) e/ou corrigido (Administração)', () => {
    expect(mudancaDoRegistro({})).toBe('');
    expect(mudancaDoRegistro({ alterado_em: 'x' })).toBe('Alterado na hora');
    expect(mudancaDoRegistro({ editado_em: 'x' })).toBe('Corrigido');
    expect(mudancaDoRegistro({ alterado_em: 'x', editado_em: 'y' })).toBe('Alterado na hora e corrigido');
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

  it('ALTERAR (M66): o último registro fica com o botão por 15 minutos, e o "Registrar outro?" também tem', () => {
    const tela = ler('../../pages/Desperdicio.jsx');
    expect(tela).toMatch(/const MINUTOS_PARA_ALTERAR = 15;/);
    expect(tela).toMatch(/aria-label=\{`Alterar o registro de \$\{ultimo\.item_nome\}`\}/);
    expect(tela).toMatch(/aoAlterar=\{podeAlterar \? alterarUltimo : null\}/);
    // ⚠️ só QUEM REGISTROU vê o "Alterar" — e ela o reencontra se voltar pelo nome
    expect(tela).toMatch(/const podeAlterar = !!ultimo && ultimo\.responsavel === responsavel;/);
    expect(tela).not.toMatch(/setUltimo\(null\);\s*\}, \[\]\);/);
    expect(ler('../../components/QuemImprime.jsx')).toMatch(/\{aoAlterar && \(/);
    const janela = ler('../../components/JanelaDescarte.jsx');
    expect(janela).toMatch(/await alterarMeuDescarte\(\{ rid, demo: !!sessao\?\.demo \}, nova\)/);
    expect(janela).toMatch(/Trocar item/);
  });

  it('ALTERAR sem internet: vai na mesma fila, DEPOIS do registro', () => {
    const lib = ler('../../lib/descartes.js');
    expect(lib).toMatch(/outboxAdd\(rid, \{ kind: 'descarte', op: 'alterar', payload: \{ id: a\.id, \.\.\.campos \} \}\)/);
    expect(ler('../../store/AppContext.jsx')).toMatch(/else if \(item\.kind === 'descarte' && item\.op === 'alterar'\)\s+\(\{ error \} = await supabase\.rpc\('alterar_meu_descarte'/);
  });

  it('a voz: item, quanto e motivo numa frase; o motivo também por voz', () => {
    const tela = ler('../../pages/Desperdicio.jsx');
    expect(tela).toMatch(/interpretar=\{\(alternativas\) => acharDescartePorVoz\(alternativas, ativos, motivos\)\}/);
    expect(tela).toMatch(/opcaoForaDaLista=\{opcaoForaDaLista\}/);
    const janela = ler('../../components/JanelaDescarte.jsx');
    expect(janela).toMatch(/setMotivo\(motivoDaFala\(alternativas, motivos\)\)/);
    expect(janela).toMatch(/aria-label=\{mic\.ouvindo \? 'Parar de ouvir' : 'Falar o motivo'\}/);
  });

  it('o pedido do dono (24/11, noite): sem o botão do topo, responsável sem equipe, balança no kg, turno e pessoa', () => {
    const tela = ler('../../pages/Desperdicio.jsx');
    expect(tela).not.toMatch(/<Icon name="mais" size=\{20\} \/>Item fora da lista/);
    expect(tela).toMatch(/pedirResponsavel=\{!comEquipe\}/);
    const janela = ler('../../components/JanelaDescarte.jsx');
    expect(janela).toMatch(/casasFixas=\{unidade === 'kg' \? 3 : 0\}/);
    expect(janela).toMatch(/if \(pedeNome && !resp\.trim\(\)\) \{ setErro\('Falta o responsável\.'\); return; \}/);
    expect(janela).toMatch(/\{UNIDADES_NA_JANELA\.map\(u => \(/);
    const rel = ler('../../pages/RelatorioDesperdicio.jsx');
    expect(rel).toMatch(/\{ id: 'turno', rotulo: 'Por turno' \}/);
    expect(rel).toMatch(/\{ id: 'pessoa', rotulo: 'Por pessoa' \}/);
  });

  it('o banco recusou sem erro (conta sem liberação): a tela não diz "registrado"', () => {
    expect(ler('../../lib/descartes.js')).toMatch(/return Number\(data\) === 0 \? \{ enviado: false, recusado: true \} : \{ enviado: true \};/);
    expect(ler('../../components/JanelaDescarte.jsx')).toMatch(/if \(r\.recusado\) \{/);
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

describe('a migração 66 (gramas e o "Alterar" de quem registrou)', () => {
  const sql = ler('../../lib/migration66_desperdicio_gramas_e_alterar.sql');
  it('g passa a valer no banco, no registro e nas correções', () => {
    expect(sql).toMatch(/add constraint descartes_unidade_check check \(unidade in \('kg', 'g', 'unid'\)\)/);
    expect(sql.match(/unidade in \('kg', 'g', 'unid'\)/g)).toHaveLength(2);
    expect(sql.match(/p_unidade not in \('kg', 'g', 'unid'\)/g)).toHaveLength(2);
  });
  it('alterar só o registro deste aparelho, em 15 minutos, antes da Administração corrigir', () => {
    expect(sql).toMatch(/auth\.uid\(\), sessao_atual\(\)/);
    expect(sql).toMatch(/if v\.sessao is distinct from sessao_atual\(\) then/);
    expect(sql).toMatch(/if v\.criado_em < now\(\) - interval '15 minutes' then/);
    expect(sql).toMatch(/if v\.editado_em is not null then/);
    expect(sql).toMatch(/alterado_em = now\(\)/);
    expect(sql).toMatch(/revoke all on function alterar_meu_descarte\(uuid, text, text, numeric, text, text\) from public, anon;/);
    // "Voltar ao original" tira as duas marcas
    expect(sql).toMatch(/original = null, editado_em = null, alterado_em = null/);
  });
});
