// =====================================================================
//  Testes das UNIDADES — vários CNPJs na mesma conta (M46, 22/09/2026)
//
//  A unidade PRINCIPAL é a própria conta; a tabela `unidades` guarda só as
//  extras. Estes testes travam as regras que, se voltarem atrás, fazem a
//  etiqueta sair com o CNPJ de outra casa — que é o defeito que tudo isto
//  existe para impedir.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { listarEstoques, salvarEstoque, destinosFinalizacao, estoquesAtivos } from '../instancias';
import {
  cozinhaDeEtiquetas, cozinhaPrincipalDa, unidadeDaCozinha, dadosDaEtiqueta, opcoesDeUnidade,
  nomeDaUnidade, temUnidadesExtras, unidadesAtivas, cidadeUf,
} from '../unidades';
import { totaisPorUnidade, linhasDaUnidade, planilhaDoRelatorio, resumirRelatorio } from '../relatorioEtiquetas';
import {
  ADICIONAL_UNIDADE, adicionalUnidade, mensalComUnidades, precoPlano, economiaPlano,
  precoMensalEquivalente, PLANOS,
} from '../assinatura';
import { numerosDoPainel } from '../painel';
import { formatarCEP } from '../documentos';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('M46 — as unidades no banco', () => {
  const sql = ler('../../lib/migration46_unidades.sql');
  const corpoDe = (f) => sql.slice(sql.indexOf(`function ${f}(`), sql.indexOf('end $$;', sql.indexOf(`function ${f}(`)));

  it('RLS ligada e SÓ policy de leitura: toda escrita passa pelas funções', () => {
    expect(sql).toMatch(/alter table unidades enable row level security/);
    expect(sql).toMatch(/create policy "unidades_sel_v46" on unidades for select/);
    expect(sql).not.toMatch(/create policy[^;]*on unidades for (insert|update|delete|all)/i);
    // e a própria migração aborta se alguém um dia acrescentar uma
    expect(sql).toMatch(/pg_policies where tablename = 'unidades' and cmd <> 'SELECT'/);
  });

  it('CNPJ único no sistema inteiro, nos dois sentidos, com o código que o cadastro já traduz', () => {
    expect(sql).toMatch(/create unique index if not exists unidades_cnpj_unico\s+on unidades \(cnpj\)/);
    expect(sql).toMatch(/before insert or update of cnpj on restaurantes/);
    expect(sql).toMatch(/before insert or update of cnpj on unidades/);
    expect((sql.match(/using errcode = '23505'/g) || []).length).toBe(2);
  });

  it('só o super-admin cria, edita e arquiva unidade', () => {
    for (const f of ['criar_unidade', 'editar_unidade', 'arquivar_unidade']) {
      expect(corpoDe(f), f).toMatch(/if not coalesce\(sou_super_admin\(\), false\) then/);
    }
  });

  it('o dono edita só o ENDEREÇO, só a diretoria, só nas unidades da própria conta', () => {
    const f = corpoDe('editar_endereco_unidade');
    expect(f).toMatch(/coalesce\(meu_cargo\(\), ''\) <> 'diretoria'/);
    expect(f).toMatch(/where id = p_id and restaurante_id = rid/);
    expect(f).not.toMatch(/set[^;]*\b(nome|cnpj)\s*=/);
  });

  it('a cozinha da unidade não repete id de outra unidade nem de instância do documento estoques', () => {
    const f = corpoDe('criar_unidade');
    expect(f).toMatch(/'producao#' \|\| substr\(md5/);
    expect(f).toMatch(/d\.chave = 'estoques'/);
    expect(sql).toMatch(/check \(cozinha ~ '\^producao#\[a-z0-9\]\{4\}\$'\)/);
  });

  it('o relatório só aceita unidade DA PRÓPRIA CONTA, e só converte o texto depois de conferir', () => {
    const f = corpoDe('registrar_impressoes');
    expect(f).toMatch(/where u\.restaurante_id = rid/);
    expect(f).toMatch(/u\.id = case\s+when coalesce\(e->>'unidade', ''\) ~/);
    expect(f).toMatch(/on conflict \(id\) do nothing/);
  });

  it('o relatório recriado devolve a unidade e tem o grant refeito, com sonda', () => {
    expect(sql).toMatch(/drop function if exists relatorio_etiquetas\(date, date, uuid\)/);
    expect(sql).toMatch(/returns table \(dia date, item text, responsavel text, reimpressao boolean, unidade_id uuid,/);
    expect(sql).toMatch(/grant execute on function relatorio_etiquetas\(date, date, uuid\)\s+to authenticated/);
    expect(sql).toMatch(/'relatorio_etiquetas\(date, date, uuid\)'\]/);
  });

  it('arquivar, nunca apagar', () => {
    expect(sql).not.toMatch(/function apagar_unidade/);
    expect(sql).not.toMatch(/delete from unidades/);
  });
});

describe('a conta aberta pelo painel confere o CNPJ das unidades', () => {
  it('a função restaurante recusa CNPJ de unidade antes de criar a conta de acesso', () => {
    const fn = ler('../../../supabase/functions/restaurante/index.ts');
    const checagem = fn.indexOf(".from('unidades').select('nome').eq('cnpj', cnpj)");
    expect(checagem).toBeGreaterThan(0);
    expect(checagem).toBeLessThan(fn.indexOf('admin.auth.admin.createUser('));
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Etapa 2 — o app nos dois planos
// ─────────────────────────────────────────────────────────────────────
const U1 = {
  id: 'u-1', nome: 'Unidade Centro', cnpj: '11444777000161', endereco: 'Rua X, 10',
  cidade: 'Recife', uf: 'PE', cep: '50000000', cozinha: 'producao#ab12',
  arquivada_em: null, criada_em: '2026-09-22T10:00:00Z',
};
const U2 = { ...U1, id: 'u-2', nome: 'Unidade Velha', cnpj: '11222333000181', cozinha: 'producao#cd34', arquivada_em: '2026-09-22T12:00:00Z' };

describe('sem unidade extra, tudo exatamente como antes', () => {
  it('a lista de cozinhas é a mesma com ou sem a lista de unidades, e toda cozinha é da principal', () => {
    const doc = { itens: [{ id: 'seco#x7k2', nome: 'Seco do salão', criadoEm: 1 }] };
    expect(listarEstoques(doc, [])).toEqual(listarEstoques(doc));
    expect(listarEstoques(doc).every(e => e.unidade === null)).toBe(true);
    expect(temUnidadesExtras([])).toBe(false);
  });

  it('no plano Etiquetas a cozinha é sempre a Produção raiz — inclusive com o Seco guardado no aparelho', () => {
    const l = listarEstoques({ itens: [{ id: 'seco#x7k2', nome: 'X' }] });
    for (const guardado of ['producao', 'seco', 'finalizacao', 'seco#x7k2', 'lixo', null]) {
      expect(cozinhaDeEtiquetas(l, guardado), String(guardado)).toBe('producao');
    }
  });

  it('a etiqueta sai com os dados de sempre — e o CNPJ antigo guardado em prefs perde para o da conta', () => {
    const d = dadosDaEtiqueta({
      unidade: null, estoque: { estabelecimento: '' }, nomeConta: 'Conta Matriz', cnpjConta: '11222333000181',
      estabelecimentoConta: { endereco: 'Rua A, 1', cidade: 'Recife - PE', cnpj: '99999999999999' },
    });
    expect(d).toEqual({ nome: 'Conta Matriz', estabelecimento: { endereco: 'Rua A, 1', cidade: 'Recife - PE', cnpj: '11222333000181' } });
    // o texto antigo do estoque continua valendo na principal
    expect(dadosDaEtiqueta({ unidade: null, estoque: { estabelecimento: 'Restaurante Y' }, nomeConta: 'Conta' }).nome)
      .toBe('Restaurante Y');
  });
});

describe('unidade extra', () => {
  const l = listarEstoques({ itens: [{ id: 'seco#s001', nome: 'Seco do Centro', unidade: 'u-1', criadoEm: 5 }] }, [U1, U2]);

  it('a Produção principal da unidade aparece sintetizada, dona da unidade — sem gravar nada no documento', () => {
    const c = l.find(e => e.id === 'producao#ab12');
    expect(c).toMatchObject({ tipo: 'producao', raiz: false, unidade: 'u-1', principalDaUnidade: true, arquivado: false });
    expect(unidadeDaCozinha(l, 'producao#ab12')).toBe('u-1');
    expect(unidadeDaCozinha(l, 'producao')).toBeNull();
  });

  it('renomear a cozinha da unidade usa o nome novo, sem duplicar a cozinha nem arquivá-la', () => {
    const doc = salvarEstoque({}, { id: 'producao#ab12', nome: 'Cozinha do Centro', arquivado: true });
    const iguais = listarEstoques(doc, [U1]).filter(e => e.id === 'producao#ab12');
    expect(iguais).toHaveLength(1);
    expect(iguais[0]).toMatchObject({ nome: 'Cozinha do Centro', arquivado: false, unidade: 'u-1' });
  });

  it('cozinha criada dentro da unidade grava a unidade; na principal, o documento fica como sempre', () => {
    expect(salvarEstoque({}, { id: 'seco#s002', nome: 'X', unidade: 'u-1' }).itens[0].unidade).toBe('u-1');
    expect(salvarEstoque({}, { id: 'seco#s003', nome: 'Y' }).itens[0]).not.toHaveProperty('unidade');
    // a raiz nunca é de unidade extra
    expect(salvarEstoque({}, { id: 'seco', nome: 'Z', unidade: 'u-1' }).itens[0]).not.toHaveProperty('unidade');
  });

  it('unidade arquivada: as cozinhas dela saem de vista, e o Etiquetas cai na raiz', () => {
    const l2 = listarEstoques({ itens: [{ id: 'seco#s009', unidade: 'u-2' }] }, [U1, U2]);
    expect(l2.find(e => e.id === 'producao#cd34').arquivado).toBe(true);
    expect(l2.find(e => e.id === 'seco#s009').arquivado).toBe(true);
    expect(estoquesAtivos(l2).some(e => e.unidade === 'u-2')).toBe(false);
    expect(cozinhaDeEtiquetas(l2, 'producao#cd34')).toBe('producao');
    expect(unidadesAtivas([U1, U2]).map(u => u.id)).toEqual(['u-1']);
  });

  it('no Etiquetas, qualquer cozinha da unidade leva à Produção da unidade', () => {
    expect(cozinhaDeEtiquetas(l, 'producao#ab12')).toBe('producao#ab12');
    expect(cozinhaDeEtiquetas(l, 'seco#s001')).toBe('producao#ab12');
    expect(cozinhaPrincipalDa(l, 'u-1')).toBe('producao#ab12');
    expect(cozinhaPrincipalDa(l, null)).toBe('producao');
    expect(cozinhaPrincipalDa(l, 'desconhecida')).toBe('producao');
  });

  it('a etiqueta da unidade extra sai com nome, CNPJ, endereço e "Cidade - UF" DELA', () => {
    const d = dadosDaEtiqueta({
      unidade: U1, estoque: { estabelecimento: 'Nome antigo' }, nomeConta: 'Conta Matriz',
      cnpjConta: '11222333000181', estabelecimentoConta: { endereco: 'Rua da Matriz' },
    });
    expect(d).toEqual({
      nome: 'Unidade Centro',
      estabelecimento: { cnpj: '11444777000161', endereco: 'Rua X, 10', cidade: 'Recife - PE', cep: '50000-000' },
    });
    expect(cidadeUf('Olinda', '')).toBe('Olinda');
  });

  it('a cozinha da unidade entra na lista que o gerador de ids consulta, então não se repete', () => {
    // Estoques.jsx passa `estoques.filter(e => !e.raiz)` ao gerarIdInstancia
    expect(l.filter(e => !e.raiz).map(e => e.id)).toContain('producao#ab12');
  });

  it('o seletor mostra a principal primeiro e só as unidades ativas', () => {
    expect(opcoesDeUnidade([U1, U2], 'Conta Matriz')).toEqual([
      { id: null, nome: 'Conta Matriz', principal: true },
      { id: 'u-1', nome: 'Unidade Centro', cnpj: '11444777000161', principal: false },
    ]);
    expect(nomeDaUnidade([U1], null, '')).toBe('Unidade principal');
  });

  it('o destino de finalização de outra unidade diz de qual casa é', () => {
    const l3 = listarEstoques({ itens: [{ id: 'finalizacao#f001', nome: 'Salão', unidade: 'u-1' }] }, [U1]);
    expect(destinosFinalizacao(l3, 'producao', [U1]).map(d => d.nome))
      .toEqual(['Cozinha de Finalização', 'Salão · Unidade Centro']);
  });
});

describe('relatório de etiquetas por unidade', () => {
  const periodo = { de: '2026-09-01', ate: '2026-09-30' };
  const linhas = [
    { dia: '2026-09-02', item: 'Arroz', unidade_id: null, etiquetas: 5, impressoes: 1 },
    { dia: '2026-09-03', item: 'Arroz', unidade_id: 'u-1', etiquetas: 8, impressoes: 2 },
    { dia: '2026-09-04', item: 'Feijão', unidade_id: 'u-1', etiquetas: 1, impressoes: 1 },
    { dia: '2026-08-30', item: 'Fora', unidade_id: 'u-1', etiquetas: 99, impressoes: 1 },
  ];

  it('soma por unidade, no período, com null = principal, a mais movimentada primeiro', () => {
    expect(totaisPorUnidade(linhas, periodo)).toEqual([{ id: 'u-1', etiquetas: 9 }, { id: null, etiquetas: 5 }]);
  });

  it('o filtro corta as linhas; "todas" devolve tudo', () => {
    expect(linhasDaUnidade(linhas, 'todas')).toHaveLength(4);
    expect(linhasDaUnidade(linhas, null).map(l => l.item)).toEqual(['Arroz']);
    expect(resumirRelatorio(linhasDaUnidade(linhas, 'u-1'), periodo).total).toBe(9);
  });

  it('a planilha ganha a aba "Por unidade" só com duas ou mais casas', () => {
    const r = resumirRelatorio(linhas, periodo);
    expect(planilhaDoRelatorio(r, periodo).map(([n]) => n)).not.toContain('Por unidade');
    const abas = planilhaDoRelatorio(r, periodo, [{ nome: 'Centro', etiquetas: 9 }, { nome: 'Matriz', etiquetas: 5 }]);
    expect(abas.at(-1)).toEqual(['Por unidade', [['Unidade', 'Etiquetas'], ['Centro', 9], ['Matriz', 5]]]);
  });
});

describe('unidades nos dois planos (o Etiquetas é um recorte do Pro)', () => {
  it('o Etiquetas tem o cartão Unidades e o seletor de unidade; o Pro tem "Unidades e cozinhas"', () => {
    expect(ler('../../pages/etiquetas/Ajustes.jsx')).toMatch(/<CartaoUnidades \/>/);
    expect(ler('../../components/Layout.jsx')).toMatch(/<SeletorModulo soUnidades=\{soEtiq\}/);
    expect(ler('../../pages/Estoques.jsx')).toMatch(/Preciso de outra unidade/);
    expect(ler('../../components/config/CartoesConfig.jsx')).toMatch(/Preciso de outra unidade/);
    expect(ler('../../pages/Administracao.jsx')).toMatch(/titulo: 'Unidades e cozinhas'/);
  });

  it('a etiqueta tira nome, CNPJ e endereço de UM lugar só, e grava a unidade no relatório', () => {
    const tela = ler('../../components/EtiquetaPrint.jsx');
    expect(tela).toMatch(/dadosDaEtiqueta\(\{/);
    expect(tela).not.toMatch(/estabelecimentoDe\(/);
    expect(tela).toMatch(/unidade: unidadeAtual\?\.id \|\| null/);
  });

  it('no Etiquetas a cozinha sai da unidade do aparelho — não mais cravada na raiz', () => {
    expect(ler('../../store/AppContext.jsx')).toMatch(/soEtiq \? cozinhaDeEtiquetas\(estoques, modulo\)/);
  });

  it('trocar de unidade pede confirmação', () => {
    expect(ler('../../components/SeletorModulo.jsx')).toMatch(/titulo: 'Trocar de unidade'/);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Etapa 3 — cobrança do adicional (decisão do dono: 1/3 do plano por mês)
// ─────────────────────────────────────────────────────────────────────
describe('adicional por unidade extra', () => {
  it('é 1/3 do plano por mês: Etiquetas R$ 93,30; Pro R$ 133,00', () => {
    expect(ADICIONAL_UNIDADE).toBeCloseTo(1 / 3);
    expect(adicionalUnidade('etiquetas')).toBe(93.3);
    expect(adicionalUnidade('completo')).toBe(133);
    expect(mensalComUnidades('etiquetas', 2)).toBe(466.5);
  });

  it('sem unidade extra, o preço de todo plano continua o mesmo de antes', () => {
    for (const p of PLANOS) {
      expect(precoPlano(p, 'etiquetas', 0)).toBe(precoPlano(p, 'etiquetas'));
    }
  });

  it('o desconto semestral e o anual valem sobre o total, com as unidades', () => {
    const anual = PLANOS.find(p => p.id === 'anual');
    // (279,90 + 93,30) × 12 × 0,90
    expect(precoPlano(anual, 'etiquetas', 1)).toBe(4030.56);
    expect(economiaPlano(anual, 'etiquetas', 1)).toBe(447.84);
    expect(precoMensalEquivalente(anual, 'etiquetas', 1)).toBe(335.88);
  });

  it('a receita estimada do painel soma as unidades ATIVAS — a arquivada não cobra', () => {
    const agora = Date.now();
    const r = { id: 'r1', produto: 'etiquetas', assinatura_ate: new Date(agora + 86400000 * 10).toISOString(), unidades: [U1, U2] };
    expect(numerosDoPainel([r], agora).mrr).toBe(373.2);
  });

  it('o QR do cliente e o painel usam as unidades extras no valor', () => {
    const pag = ler('../../pages/Pagamento.jsx');
    expect(pag).toMatch(/precoPlano\(plano, prod\.id, extras\)/);
    expect(pag).toMatch(/const extras = unidadesAtivas\(unidades\)\.length/);
    const adm = ler('../../pages/Admin.jsx');
    expect(adm).toMatch(/precoPlano\(plano, r\.produto, extrasDe\(r\)\)/);
    expect(adm).toMatch(/supabase\.rpc\('criar_unidade'/);
    expect(adm).toMatch(/supabase\.rpc\('arquivar_unidade'/);
  });
});

// Revisão de 23/09/2026: a cobrança com unidades tinha de dar o MESMO número
// em todo lugar — QR do cliente, fila do painel, "Registrar pagamento",
// Ajustes — e a parcela do contrato não podia ficar para trás.
describe('cobrança com unidades: um número só em todas as telas', () => {
  it('a fila do painel usa a mesma conta do Registrar pagamento (parcela, unidades, juros)', () => {
    const adm = ler('../../pages/Admin.jsx');
    expect(adm).toMatch(/brlAdmin\(valorCobranca\(r, plano, !!encargos\[r\.id\]\)\)/);
    expect(adm).not.toMatch(/brlAdmin\(precoPlano\(plano, r\.produto, extrasDe\(r\)\)\)/);
  });

  it('o contrato parcelado já vem preenchido COM as unidades, e a confirmação avisa', () => {
    const adm = ler('../../pages/Admin.jsx');
    expect(adm).toMatch(/setParcelaEdit\(\{ id: r\.id, valor: fmtPreco\(mensalComUnidades\(r\.produto, extrasDe\(r\)\)\) \}\)/);
    expect(adm).not.toMatch(/valor: fmtPreco\(produtoDe\(r\.produto\)\.precoMes\)/);
    expect(adm).toMatch(/const avisoUnidades = v !== null && extras > 0/);
  });

  it('criar, arquivar e reativar unidade oferecem ajustar a parcela do contrato', () => {
    const adm = ler('../../pages/Admin.jsx');
    expect(adm).toMatch(/const oferecerAjusteParcela = async \(r, delta, porque\)/);
    expect(adm).toMatch(/if \(nova\) await oferecerAjusteParcela\(r, adicionalUnidade\(r\.produto\)/);
    expect(adm).toMatch(/await oferecerAjusteParcela\(r, arquivar \? -adicional : adicional/);
    // a ajuda é declarada ANTES de quem a chama
    expect(adm.indexOf('const oferecerAjusteParcela')).toBeLessThan(adm.indexOf('const salvarUnidade'));
  });

  it('trocar de plano no painel diz o valor do mês com as unidades', () => {
    const adm = ler('../../pages/Admin.jsx');
    expect(adm).toMatch(/fmtPreco\(mensalComUnidades\(novo, extras\)\)/);
  });

  it('o Pagamento confere as unidades na rede ao abrir', () => {
    const pag = ler('../../pages/Pagamento.jsx');
    expect(pag).toMatch(/const \{ unidades, recarregarUnidades \} = useApp\(\)/);
    expect(pag).toMatch(/useEffect\(\(\) => \{ recarregarUnidades\(\); \}, \[recarregarUnidades\]\)/);
  });

  it('Ajustes mostra o que o cliente paga: parcela do contrato, ou plano + unidades', () => {
    const aj = ler('../../pages/etiquetas/Ajustes.jsx');
    expect(aj).toMatch(/mensalComUnidades\(prod\.id, extras\)/);
    expect(aj).toMatch(/const parcela = Number\(sessao\?\.parcelaContrato\) \|\| 0/);
    expect(aj).not.toMatch(/R\$ \{fmtPreco\(prod\.precoMes\)\}\/mês/);
    expect(mensalComUnidades('etiquetas', 1)).toBe(373.2);
  });
});

describe('detalhes da etiqueta e do balanço com unidades', () => {
  it('CEP sai como se escreve; o que não é CEP volta como veio', () => {
    expect(formatarCEP('50000000')).toBe('50000-000');
    expect(formatarCEP('50000-000')).toBe('50000-000');
    expect(formatarCEP('')).toBe('');
    expect(formatarCEP(null)).toBe('');
    expect(formatarCEP('123')).toBe('123');
  });

  it('a principal continua imprimindo o CEP exatamente como o dono digitou', () => {
    const d = dadosDaEtiqueta({
      unidade: null, estoque: null, nomeConta: 'Casa', cnpjConta: '11222333000181',
      estabelecimentoConta: { cep: '50.000-000', cidade: 'Recife - PE' },
    });
    expect(d.estabelecimento.cep).toBe('50.000-000');
  });

  it('no balanço com várias unidades a coluna tem a cozinha E a unidade', () => {
    const bal = ler('../../pages/Balanco.jsx');
    expect(bal).toMatch(/\{variasUnidades \? \(<>\s*\{e\.nome\}/);
  });
});
