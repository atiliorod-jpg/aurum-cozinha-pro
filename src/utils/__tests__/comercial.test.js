// =====================================================================
//  Testes de COMERCIAL — assinatura, planos, pagamento, financeiro e painel
//
//  ⚠️ Este arquivo nasceu de uma divisão: até 09/09/2026 os 465 testes viviam
//  num `regras.test.js` de 4.094 linhas, e achar ou acrescentar teste ali já
//  custava caro. A divisão é POR ASSUNTO, não por arquivo de origem — um teste
//  de etiqueta que atravessa `tspl.js`, `etiquetas.js` e `impressoraBLE.js`
//  continua junto dos seus, que é como se procura.
//
//  Nada de conteúdo mudou na divisão: os mesmos 465 testes, no mesmo texto.
// =====================================================================

import { describe, it, expect } from 'vitest';

import { custoUnitario, valorDoEstoque, curvaABC, custoDosRegistros, precoDaCompra } from '../financeiro';

import { statusAssinatura, statusRestaurante, rotuloRegime, TESTE_DIAS, PLANOS, precoPlano, precoMensalEquivalente, economiaPlano, PRODUTOS } from '../assinatura';
import { produtoTem, produtoAtivo, emprestimoAtivo } from '../produto';
import { filaDoPainel, numerosDoPainel, passaNoFiltro } from '../painel';
import { crc16, montarPixBRCode } from '../pix';


describe('statusAssinatura — o teste é dado pela Aurum, não ganho no cadastro', () => {
  const DIA = 86400000;
  const base = (createdAt) => ({ restauranteId: 'r1', restauranteCriadoEm: createdAt });
  const comTeste = (ate) => ({ restauranteId: 'r1', testeAte: new Date(ate).toISOString() });

  // ⚠️ A REGRA MUDOU EM 03/09/2026 (M41). Antes o acesso saía de
  // `created_at + TESTE_DIAS`: quem preenchesse o cadastro entrava sozinho por
  // duas semanas. Agora só entra quem a Aurum liberou, por data.
  it('cadastro novo NÃO ganha teste — nasce sem acesso', () => {
    const agora = Date.now();
    const st = statusAssinatura(base(new Date(agora - DIA).toISOString()), agora);
    expect(st.ok).toBe(false);
    // 'aguardando', não 'vencido': ele nunca teve acesso para perder.
    expect(st.tipo).toBe('aguardando');
  });

  it('com teste liberado pela Aurum, entra', () => {
    const agora = Date.now();
    const st = statusAssinatura(comTeste(agora + 3 * DIA), agora);
    expect(st.ok).toBe(true);
    expect(st.tipo).toBe('teste');
    expect(st.diasRestantes).toBe(3);
  });

  // ⚠️ QUEM NUNCA ENTROU NÃO É QUEM FOI EMBORA. Antes desta distinção, quem
  // acabou de se cadastrar via "Seu período de teste terminou — continue de
  // onde parou", logo depois de pagar.
  it('conta nunca liberada fica AGUARDANDO, não vencida', () => {
    const agora = Date.now();
    const st = statusAssinatura({ restauranteId: 'r1',
      restauranteCriadoEm: new Date(agora - 60000).toISOString() }, agora);
    expect(st.tipo).toBe('aguardando');
    expect(st.ok).toBe(false);
  });

  it('conta que JÁ teve teste e venceu é "vencido", não "aguardando"', () => {
    const agora = Date.now();
    const st = statusAssinatura({ restauranteId: 'r1',
      testeAte: new Date(agora - 30 * DIA).toISOString() }, agora);
    expect(st.tipo).toBe('vencido');
  });

  it('conta que já assinou e venceu também é "vencido"', () => {
    const agora = Date.now();
    const st = statusAssinatura({ restauranteId: 'r1',
      assinaturaAte: new Date(agora - 10 * DIA).toISOString() }, agora);
    expect(st.tipo).toBe('vencido');
  });

  it('teste liberado que já venceu = vencido', () => {
    const agora = Date.now();
    const st = statusAssinatura(comTeste(agora - DIA), agora);
    expect(st.ok).toBe(false);
    expect(st.tipo).toBe('vencido');
  });

  it('a idade da conta não importa mais — só a data do teste', () => {
    const agora = Date.now();
    // conta de dois anos, com teste liberado hoje: entra.
    const velha = { restauranteId: 'r1', restauranteCriadoEm: new Date(agora - 730 * DIA).toISOString(),
                    testeAte: new Date(agora + DIA).toISOString() };
    expect(statusAssinatura(velha, agora).tipo).toBe('teste');
  });

  // ⚠️ ESTE NÚMERO É ESCRITO EM DOIS LUGARES: aqui e no `interval '14 days'` de
  // restaurante_pode_escrever, recriada na MIGRAÇÃO 40. Se alguém mudar só o
  // JS, o app aprova a escrita e o banco recusa — e como o app é offline-first,
  // o lançamento entra na fila e some sem erro visível. Quebrar aqui é o aviso.
  //
  // ⚠️ E ELE FEZ O TRABALHO DELE: ao passar de 5 para 14 dias (02/09), este
  // teste quebrou junto e foi o que lembrou de recriar a função no banco na
  // mesma leva. Se um dia mudar de novo, o par é ESTE número e a M40.
  it('TESTE_DIAS é 14 (precisa bater com o interval da migração 40)', () => {
    expect(TESTE_DIAS).toBe(14);
  });

  it('conta bloqueada não escreve mesmo com assinatura em dia', () => {
    const agora = Date.now();
    const st = statusAssinatura({ restauranteId: 'r1', bloqueado: true, assinaturaAte: new Date(agora + 30 * DIA).toISOString() }, agora);
    expect(st.ok).toBe(false);
    expect(st.tipo).toBe('bloqueado');
  });
});

describe('planos de pagamento (Pix)', () => {
  const plano = (id) => PLANOS.find(p => p.id === id);

  // ⚠️ Estes números são o que sai no BR Code do Pix. Se um deles mudar sem
  // querer, o cliente paga o valor errado e a conciliação vira manual — por
  // isso valem os dois produtos, com as contas escritas por extenso.
  // Descontos: semestral -5%, anual -10% (baixados de 10/20% em 28/08/2026).
  // ⚠️ AS CONTAS SAEM DO PREÇO, não de números copiados. A versão anterior
  // repetia 500 e 270 em doze lugares; quando o dono mudou os preços (249→279,90),
  // doze testes quebraram de uma vez e nenhum deles dizia nada útil — só que o
  // preço tinha mudado, coisa que a gente já sabia. Assim o teste continua
  // guardando o que importa: a REGRA de desconto e o arredondamento.
  describe('Aurum Cozinha Pro', () => {
    const m = PRODUTOS.completo.precoMes;
    it('mensal é o preço cheio', () => {
      expect(precoPlano(plano('mensal'), 'completo')).toBe(m);
    });
    it('semestral tira 5% e mostra a economia', () => {
      expect(precoPlano(plano('semestral'), 'completo')).toBeCloseTo(m * 6 * 0.95, 2);
      expect(precoMensalEquivalente(plano('semestral'), 'completo')).toBeCloseTo(m * 0.95, 2);
      expect(economiaPlano(plano('semestral'), 'completo')).toBeCloseTo(m * 6 * 0.05, 2);
    });
    it('anual tira 10%', () => {
      expect(precoPlano(plano('anual'), 'completo')).toBeCloseTo(m * 12 * 0.9, 2);
      expect(precoMensalEquivalente(plano('anual'), 'completo')).toBeCloseTo(m * 0.9, 2);
      expect(economiaPlano(plano('anual'), 'completo')).toBeCloseTo(m * 12 * 0.1, 2);
    });
  });

  describe('Aurum Etiquetas', () => {
    const m = PRODUTOS.etiquetas.precoMes;
    it('mensal é o preço cheio', () => {
      expect(precoPlano(plano('mensal'), 'etiquetas')).toBe(m);
    });
    it('semestral tira 5%', () => {
      expect(precoPlano(plano('semestral'), 'etiquetas')).toBeCloseTo(m * 6 * 0.95, 2);
      expect(economiaPlano(plano('semestral'), 'etiquetas')).toBeCloseTo(m * 6 * 0.05, 2);
    });
    it('anual tira 10%', () => {
      expect(precoPlano(plano('anual'), 'etiquetas')).toBeCloseTo(m * 12 * 0.9, 2);
      expect(economiaPlano(plano('anual'), 'etiquetas')).toBeCloseTo(m * 12 * 0.1, 2);
    });
  });

  // ⚠️ O de baixo continua com número CRAVADO, e de propósito: é o que
  // desmascara um erro no cálculo que "bate" com uma fórmula igualmente
  // errada. Se o preço mudar de novo, ajuste estes três — eles são a âncora.
  it('nos preços de hoje, as contas fecham', () => {
    expect(PRODUTOS.etiquetas.precoMes).toBe(279.90);
    expect(PRODUTOS.completo.precoMes).toBe(399);
    expect(precoPlano(plano('anual'), 'etiquetas')).toBe(3022.92);   // 279,90×12×0,9
    expect(precoPlano(plano('semestral'), 'etiquetas')).toBe(1595.43); // 279,90×6×0,95
    expect(precoPlano(plano('semestral'), 'completo')).toBe(2274.3);  // 399×6×0,95
  });

  // Trava os percentuais em si: se alguém mexer nos descontos, quebra aqui e
  // não só nos totais — a mensagem fica óbvia.
  it('descontos são 0%, 5% e 10%', () => {
    expect(plano('mensal').desconto).toBe(0);
    expect(plano('semestral').desconto).toBe(0.05);
    expect(plano('anual').desconto).toBe(0.10);
  });

  // Produto desconhecido ou ausente NÃO pode virar preço zero (Pix de R$0,00
  // seria aceito pelo banco e o cliente entraria de graça): cai no completo.
  it('produto ausente ou inválido cobra o preço do completo', () => {
    expect(precoPlano(plano('mensal'))).toBe(PRODUTOS.completo.precoMes);
    expect(precoPlano(plano('mensal'), 'xpto')).toBe(PRODUTOS.completo.precoMes);
    expect(precoPlano(plano('mensal'), { produto: 'etiquetas' })).toBe(PRODUTOS.etiquetas.precoMes);
  });

  it('dias por plano batem com 30/180/365', () => {
    expect(plano('mensal').dias).toBe(30);
    expect(plano('semestral').dias).toBe(180);
    expect(plano('anual').dias).toBe(365);
  });
});

describe('produto contratado (utils/produto.js)', () => {
  it('etiquetas compra etiqueta, mas não estoque nem financeiro', () => {
    expect(produtoTem('etiquetas', 'etiquetas')).toBe(true);
    expect(produtoTem('etiquetas', 'estoque')).toBe(false);
    expect(produtoTem('etiquetas', 'financeiro')).toBe(false);
    expect(produtoTem('etiquetas', 'administracao')).toBe(false);
  });

  // ⚠️ ESTA REGRA FOI INVERTIDA EM 09/09/2026. Ficou `false` de 30/08 a 09/09
  // porque as linhas gravadas só eram lidas pela contagem por câmera do
  // Inventário e pela tela de Validades — as duas FORA deste produto: era
  // escrita para ninguém. Agora existe leitor dentro do próprio produto, a
  // tela `/impressas`, que repete uma etiqueta rasgada com as datas
  // ORIGINAIS. Sem o registro, reimprimir recalcularia a validade a partir de
  // hoje e devolveria um pote mentindo sobre a idade.
  it('os dois produtos guardam registro do que foi impresso', () => {
    expect(produtoTem('etiquetas', 'historicoEtiquetas')).toBe(true);
    expect(produtoTem('completo', 'historicoEtiquetas')).toBe(true);
  });

  // ⚠️ A chave antiga (`validadesEtiqueta`) dizia `true` para etiquetas e NADA
  // no app a consultava — o produto ja tinha perdido a tela de validades.
  // Bandeira que ninguem le nao fica inutil, fica errada em silencio.
  it('a bandeira antiga não existe mais, em nenhum dos dois', () => {
    expect(produtoTem('etiquetas', 'validadesEtiqueta')).toBe(false);
    expect(produtoTem('completo', 'validadesEtiqueta')).toBe(false);
  });

  it('completo compra tudo', () => {
    expect(produtoTem('completo', 'estoque')).toBe(true);
    expect(produtoTem('completo', 'etiquetas')).toBe(true);
    expect(produtoTem('completo', 'financeiro')).toBe(true);
  });

  // ⚠️ Mesma trava do temRecurso: um `!== false` aqui abriria tela paga para
  // quem não comprou, por causa de um nome de recurso digitado errado.
  it('recurso inexistente é FALSE, nunca "liga sozinho"', () => {
    expect(produtoTem('etiquetas', 'recursoQueNaoExiste')).toBe(false);
    expect(produtoTem('completo', 'recursoQueNaoExiste')).toBe(false);
  });

  it('produto desconhecido cai no completo (banco sem a migração 27)', () => {
    expect(produtoTem(undefined, 'estoque')).toBe(true);
    expect(produtoTem('xpto', 'estoque')).toBe(true);
  });

  it('sessão sem produto vale como completo', () => {
    expect(produtoAtivo({ restauranteId: 'r1' })).toBe('completo');
    expect(produtoAtivo({ restauranteId: 'r1', produto: 'etiquetas' })).toBe('etiquetas');
  });

  // ⚠️ Sem isto o suporte abre o app inteiro dentro de uma conta de etiquetas,
  // vê o estoque vazio (o cliente nunca lançou nada) e diagnostica um problema
  // que não existe.
  it('no modo suporte, o produto do CLIENTE manda sobre o do super-admin', () => {
    const superAdmin = { eSuperAdmin: true }; // sem restauranteId, sem produto
    expect(produtoAtivo(superAdmin, { produto: 'etiquetas' })).toBe('etiquetas');
    expect(produtoAtivo(superAdmin, null)).toBe('completo');
  });
});

describe('Pix BR Code', () => {
  it('CRC16-CCITT-FALSE de "123456789" = 29B1', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
  it('monta um BR Code válido, com o CRC no fim conferindo', () => {
    const code = montarPixBRCode({ chave: 'teste@aurum.app', nome: 'Aurum Gastronomia', cidade: 'Recife', valor: 149, txid: 'MENSAL' });
    expect(code.startsWith('000201')).toBe(true);          // formato
    expect(code.includes('5406149.00')).toBe(true);         // valor 149,00
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4));   // CRC bate
  });
  it('sem chave, retorna string vazia (cai no fallback WhatsApp)', () => {
    expect(montarPixBRCode({ chave: '', valor: 149 })).toBe('');
  });
});

describe('custoDosRegistros — perda de recebimento nao some mais', () => {
  const prods = [{ id: 'file', nome: 'File', unidade: 'kg' }];

  it('custeia a perda de recebimento pela compra associada', () => {
    const r = custoDosRegistros(
      [{ data: '2026-08-02', quantidade: 2, unidade: 'kg', compraId: 'c1', origem: 'recebimento' }],
      prods, {},
      { compras: [{ id: 'c1', quantidade: 10, unidade: 'kg', valorTotal: 500 }] });
    expect(r.total).toBe(100);      // 2 kg x (500/10)
    expect(r.semCusto).toBe(0);
  });

  it('sem compra associada, ao menos CONTA em vez de sumir', () => {
    const r = custoDosRegistros(
      [{ data: '2026-08-02', quantidade: 2, origem: 'recebimento' }], prods, {}, {});
    expect(r.total).toBe(0);
    expect(r.semCusto).toBe(1);
  });

  it('nao inventa custo quando a unidade da perda difere da compra', () => {
    const r = custoDosRegistros(
      [{ data: '2026-08-02', quantidade: 3, unidade: 'kg', compraId: 'c2' }],
      prods, {},
      { compras: [{ id: 'c2', quantidade: 2, unidade: 'cx', valorTotal: 200 }] });
    expect(r.total).toBe(0);
    expect(r.semCusto).toBe(1);
  });
});

// O pedido do dono: "que fique claro em um relatorio os desperdicios e aparas
// DIARIOS de cada cozinha". O relatorio tinha "por dia" para saidas e chegadas,
// mas apara e perda so apareciam como total do periodo em dois donuts.

describe('financeiro — custo por unidade', () => {
  const P = (extra) => ({ id: 'x', nome: 'X', unidade: 'kg', ativo: true, ...extra });

  it('mesma unidade: usa o custo direto', () => {
    expect(custoUnitario(P({ unidade: 'kg' }), { custo: 78.9, unidade: 'kg' })).toBe(78.9);
  });

  it('comprado em kg, estocado por peca: converte pelo peso da peca', () => {
    const r = custoUnitario(P({ unidade: 'unid', pesoUnidade: 180 }), { custo: 60, unidade: 'kg' });
    expect(r).toBeCloseTo(10.8, 5);
  });

  it('comprado por peca, estocado em kg: converte no sentido inverso', () => {
    const r = custoUnitario(P({ unidade: 'kg', pesoUnidade: 500 }), { custo: 12, unidade: 'unid' });
    expect(r).toBeCloseTo(24, 5);
  });

  it('RECUSA converter sem o peso da peca — melhor sem numero que com numero errado', () => {
    expect(custoUnitario(P({ unidade: 'unid', pesoUnidade: 0 }), { custo: 60, unidade: 'kg' })).toBeNull();
  });

  it('RECUSA litro x quilo: exigiria densidade, que o app nao guarda', () => {
    expect(custoUnitario(P({ unidade: 'L' }), { custo: 8, unidade: 'kg' })).toBeNull();
  });

  it('custo ausente, zero ou negativo nao vira valor', () => {
    expect(custoUnitario(P(), null)).toBeNull();
    expect(custoUnitario(P(), { custo: 0, unidade: 'kg' })).toBeNull();
    expect(custoUnitario(P(), { custo: -5, unidade: 'kg' })).toBeNull();
  });
});

describe('financeiro — valor do estoque', () => {
  const produtos = [
    { id: 'file', nome: 'File', categoria: 'PROTEINAS', unidade: 'kg', ativo: true },
    { id: 'queijo', nome: 'Queijo', categoria: 'FRIOS', unidade: 'kg', ativo: true },
    { id: 'oleo', nome: 'Oleo', categoria: 'SECOS', unidade: 'L', ativo: true },
  ];
  const estoque = { file: 10, queijo: 4, oleo: 6 };
  const precos = { file: { custo: 80, unidade: 'kg' }, queijo: { custo: 40, unidade: 'kg' } };

  it('soma so o que da para calcular', () => {
    const r = valorDoEstoque(produtos, estoque, precos);
    expect(r.total).toBe(960);
    expect(r.porCategoria['PROTEINAS']).toBe(800);
    expect(r.porCategoria['FRIOS']).toBe(160);
  });

  it('DENUNCIA o que ficou de fora — total que esconde item mente por omissao', () => {
    const r = valorDoEstoque(produtos, estoque, precos);
    expect(r.semCusto.map(i => i.id)).toEqual(['oleo']);
  });

  it('item zerado sem preco nao vira ruido na lista de pendencias', () => {
    const r = valorDoEstoque(produtos, { file: 10, queijo: 4, oleo: 0 }, precos);
    expect(r.semCusto).toEqual([]);
  });

  it('produto inativo fica de fora', () => {
    const r = valorDoEstoque(
      [...produtos, { id: 'z', nome: 'Z', unidade: 'kg', ativo: false }],
      { ...estoque, z: 100 },
      { ...precos, z: { custo: 10, unidade: 'kg' } });
    expect(r.itens.some(i => i.id === 'z')).toBe(false);
  });

  it('lista sai ordenada do mais caro para o mais barato', () => {
    const r = valorDoEstoque(produtos, estoque, precos);
    expect(r.itens.map(i => i.id)).toEqual(['file', 'queijo']);
  });
});

describe('financeiro — curva ABC', () => {
  it('classifica pelo acumulado: quem CRUZA a fronteira ainda e da classe de baixo', () => {
    const r = curvaABC([{ id: 'a', valor: 85 }, { id: 'b', valor: 10 }, { id: 'c', valor: 5 }]);
    expect(r.find(i => i.id === 'a').classe).toBe('A');
    expect(r.find(i => i.id === 'b').classe).toBe('B');
    expect(r.find(i => i.id === 'c').classe).toBe('C');
  });

  it('percentual acumulado fecha em 100', () => {
    const r = curvaABC([{ id: 'a', valor: 50 }, { id: 'b', valor: 30 }, { id: 'c', valor: 20 }]);
    expect(r[r.length - 1].pctAcumulado).toBe(100);
  });

  it('lista vazia ou sem valor nao quebra', () => {
    expect(curvaABC([])).toEqual([]);
    expect(curvaABC([{ id: 'a', valor: 0 }])).toEqual([]);
  });
});

describe('financeiro — custo do que saiu e do que estragou', () => {
  const produtos = [{ id: 'file', nome: 'File', unidade: 'kg', ativo: true }];
  const precos = { file: { custo: 80, unidade: 'kg' } };

  it('soma lancamento com lista de itens (saida/producao)', () => {
    const r = custoDosRegistros([{ data: '2026-08-10', itens: [{ produtoId: 'file', quantidade: 2 }] }], produtos, precos);
    expect(r.total).toBe(160);
  });

  it('soma lancamento com produtoId na raiz (perda/apara)', () => {
    const r = custoDosRegistros([{ data: '2026-08-10', produtoId: 'file', quantidade: 1.5 }], produtos, precos);
    expect(r.total).toBe(120);
  });

  it('respeita a janela de datas', () => {
    const regs = [
      { data: '2026-08-01', produtoId: 'file', quantidade: 1 },
      { data: '2026-08-20', produtoId: 'file', quantidade: 1 },
    ];
    expect(custoDosRegistros(regs, produtos, precos, { de: '2026-08-10' }).total).toBe(80);
  });

  it('conta quantos ficaram sem custo em vez de somar zero em silencio', () => {
    const r = custoDosRegistros([{ produtoId: 'desconhecido', quantidade: 3 }], produtos, precos);
    expect(r.total).toBe(0);
    expect(r.semCusto).toBe(1);
  });
});

describe('financeiro — preco vindo da compra (ultima compra manda)', () => {
  it('divide o valor pago pela quantidade e guarda de quando e', () => {
    const r = precoDaCompra({ produtoId: 'file', quantidade: 20, valorTotal: 1578, unidade: 'kg', data: '2026-08-21', fornecedor: 'Bom Corte' });
    expect(r.custo).toBe(78.9);
    expect(r.unidade).toBe('kg');
    expect(r.em).toBe('2026-08-21');
    expect(r.fornecedor).toBe('Bom Corte');
  });

  it('compra sem produto vinculado nao gera preco (nao da para saber de quem e)', () => {
    expect(precoDaCompra({ quantidade: 20, valorTotal: 1578 })).toBeNull();
  });

  it('sem valor ou com quantidade zero nao gera preco', () => {
    expect(precoDaCompra({ produtoId: 'file', quantidade: 20 })).toBeNull();
    expect(precoDaCompra({ produtoId: 'file', quantidade: 0, valorTotal: 100 })).toBeNull();
  });
});

// Varios estoques do MESMO tipo na mesma conta (Estoque Seco do Restaurante X e
// do Y). O que estes testes travam e a REGRA QUE EVITA MIGRACAO: a instancia
// raiz mantem o id de sempre, e o separador '#' nao atrapalha o lerTipo, que
// corta no primeiro ':'.

describe('painel super-admin — a fila do dia e os números', () => {
  const AGORA = new Date('2026-08-31T12:00:00Z').getTime();
  const dias = (n) => new Date(AGORA + n * 86400000).toISOString();
  // conta criada há muito tempo → o teste grátis já acabou
  const velha = { created_at: dias(-90) };

  const pagante   = { id: 'p', nome: 'Paga',    ...velha, assinatura_ate: dias(20), produto: 'etiquetas' };
  const vencido   = { id: 'v', nome: 'Vencido', ...velha, assinatura_ate: dias(-5), produto: 'etiquetas' };
  const bloqueado = { id: 'b', nome: 'Suspenso',...velha, bloqueado: true, produto: 'completo' };
  // ⚠️ DERIVADOS DE `TESTE_DIAS`, não cravados. Estavam em -4 e -1 porque o
  // teste durava 5 dias; quando passou para 14 (M40) os dois viraram "conta
  // novinha" e a fila deixou de trazer o que devia. Assim o dia muda sozinho
  // junto com a regra.
  // ⚠️ O TESTE AGORA É UMA DATA QUE A AURUM DÁ (M41), não um presente do
  // cadastro. Antes estes dois nasciam testando só por serem recentes; hoje
  // uma conta sem `teste_ate` no futuro está VENCIDA, por mais nova que seja.
  const testando  = { id: 't', nome: 'Testando', created_at: dias(-30), teste_ate: dias(1), produto: 'etiquetas' };   // resta 1
  const novo      = { id: 'n', nome: 'Novo',     created_at: dias(-1),  teste_ate: dias(20), produto: 'etiquetas' };  // com folga

  describe('a fila', () => {
    it('quem avisou pagamento entra, com a hora do aviso', () => {
      const r = { ...pagante, aviso_pagamento_em: dias(-1) };
      const f = filaDoPainel([r], AGORA);
      expect(f).toHaveLength(1);
      expect(f[0].tipo).toBe('aviso');
    });

    // ⚠️ Conta EM DIA que avisou também entra: quem paga adiantado avisa antes
    // de vencer, e descartar deixaria o cliente esperando confirmação.
    it('aviso de conta ativa não é descartado', () => {
      expect(filaDoPainel([{ ...pagante, aviso_pagamento_em: dias(-1) }], AGORA)[0].tipo).toBe('aviso');
    });

    it('teste acabando entra; teste com folga não', () => {
      expect(filaDoPainel([testando], AGORA).map(x => x.tipo)).toEqual(['teste']);
      expect(filaDoPainel([novo], AGORA)).toHaveLength(0);
    });

    it('vencido entra', () => {
      expect(filaDoPainel([vencido], AGORA).map(x => x.tipo)).toEqual(['vencido']);
    });

    it('conta em dia e sem aviso NÃO aparece — a fila é do que precisa de mim', () => {
      expect(filaDoPainel([pagante, novo], AGORA)).toHaveLength(0);
    });

    it('aviso vem antes de teste, e teste antes de vencido', () => {
      const comAviso = { ...pagante, aviso_pagamento_em: dias(-1) };
      const f = filaDoPainel([vencido, testando, comAviso], AGORA);
      expect(f.map(x => x.tipo)).toEqual(['aviso', 'teste', 'vencido']);
    });

    it('dentro do mesmo tipo, quem esperou mais vem primeiro', () => {
      const a = { ...pagante, id: 'a', nome: 'A', aviso_pagamento_em: dias(-3) };
      const b = { ...pagante, id: 'b2', nome: 'B', aviso_pagamento_em: dias(-1) };
      expect(filaDoPainel([b, a], AGORA).map(x => x.r.nome)).toEqual(['A', 'B']);
    });

    it('sem restaurante nenhum não quebra', () => {
      expect(filaDoPainel([], AGORA)).toEqual([]);
      expect(filaDoPainel(null, AGORA)).toEqual([]);
    });
  });

  describe('os números', () => {
    const todos = [pagante, vencido, bloqueado, testando, novo];

    it('conta cada situação uma vez só', () => {
      const n = numerosDoPainel(todos, AGORA);
      expect(n).toMatchObject({ total: 5, pagantes: 1, teste: 2, vencidos: 1, bloqueados: 1 });
    });

    // ⚠️ Bloqueado NÃO entra na receita nem que a assinatura esteja em dia:
    // conta suspensa não fatura, e somá-la inflaria o número justo no caso em
    // que alguém parou de pagar.
    it('conta suspensa sai da receita mesmo com assinatura em dia', () => {
      const n = numerosDoPainel([{ ...pagante, bloqueado: true }], AGORA);
      expect(n.pagantes).toBe(0);
      expect(n.mrr).toBe(0);
      expect(n.bloqueados).toBe(1);
    });

    it('a receita soma o preço do plano de cada conta ativa', () => {
      const n = numerosDoPainel([pagante, { ...pagante, id: 'x', produto: 'completo' }], AGORA);
      expect(n.mrr).toBe(PRODUTOS.etiquetas.precoMes + PRODUTOS.completo.precoMes);
    });

    it('teste e vencido não entram na receita — ninguém pagou ainda', () => {
      expect(numerosDoPainel([testando, vencido], AGORA).mrr).toBe(0);
    });
  });

  describe('o filtro da lista', () => {
    it('"todos" deixa tudo passar', () => {
      expect(passaNoFiltro(vencido, 'todos', AGORA)).toBe(true);
      expect(passaNoFiltro(vencido, '', AGORA)).toBe(true);
    });

    it('separa por situação', () => {
      expect(passaNoFiltro(pagante, 'pagantes', AGORA)).toBe(true);
      expect(passaNoFiltro(vencido, 'pagantes', AGORA)).toBe(false);
      expect(passaNoFiltro(vencido, 'vencidos', AGORA)).toBe(true);
      expect(passaNoFiltro(bloqueado, 'bloqueados', AGORA)).toBe(true);
      expect(passaNoFiltro(testando, 'teste', AGORA)).toBe(true);
    });

    it('separa por produto, e conta sem produto conta como completo', () => {
      expect(passaNoFiltro(pagante, 'etiquetas', AGORA)).toBe(true);
      expect(passaNoFiltro(pagante, 'completo', AGORA)).toBe(false);
      expect(passaNoFiltro({ id: 'z' }, 'completo', AGORA)).toBe(true);
    });
  });
});

describe('conta de cortesia (regime)', () => {
  const AGORA = new Date('2026-08-31T12:00:00Z').getTime();
  const dias = (n) => new Date(AGORA + n * 86400000).toISOString();
  const vencida = { id: 'c', nome: 'Cortesia', created_at: dias(-90), assinatura_ate: dias(-10) };

  it('cortesia sem prazo funciona mesmo com a assinatura vencida', () => {
    const st = statusRestaurante({ ...vencida, regime: 'cortesia' }, AGORA);
    expect(st.ok).toBe(true);
    expect(st.tipo).toBe('cortesia');
  });

  it('cortesia com prazo em dia funciona; com prazo vencido volta à régua normal', () => {
    expect(statusRestaurante({ ...vencida, regime: 'cortesia', cortesia_ate: dias(30) }, AGORA).tipo).toBe('cortesia');
    expect(statusRestaurante({ ...vencida, regime: 'cortesia', cortesia_ate: dias(-1) }, AGORA).tipo).toBe('vencido');
  });

  // ⚠️ Suspender é a decisão mais forte do painel. Uma cortesia que não pudesse
  // ser suspensa seria uma conta impossível de fechar.
  it('bloqueio passa por cima da cortesia', () => {
    expect(statusRestaurante({ ...vencida, regime: 'cortesia', bloqueado: true }, AGORA).tipo).toBe('bloqueado');
  });

  // ⚠️ A ORDEM É A REGRA: cortesia ganha da assinatura em dia. Se fosse o
  // contrário, a conta apareceria como pagante e entraria na receita — que é
  // exatamente o erro que o regime existe para evitar.
  it('cortesia ganha da assinatura em dia', () => {
    const st = statusRestaurante({ ...vencida, assinatura_ate: dias(30), regime: 'cortesia' }, AGORA);
    expect(st.tipo).toBe('cortesia');
  });

  it('parceiro segue a mesma regra da cortesia', () => {
    expect(statusRestaurante({ ...vencida, regime: 'parceiro' }, AGORA).tipo).toBe('cortesia');
    expect(rotuloRegime('parceiro')).toBe('Parceiro');
    expect(rotuloRegime('pagante')).toBe('');
  });

  it('sai da fila de cobrança e não entra na receita', () => {
    const conta = { ...vencida, regime: 'cortesia' };
    expect(filaDoPainel([conta], AGORA)).toHaveLength(0);
    const n = numerosDoPainel([conta], AGORA);
    expect(n.cortesia).toBe(1);
    expect(n.mrr).toBe(0);
    expect(n.vencidos).toBe(0);
  });

  it('conta sem regime continua sendo cliente normal', () => {
    expect(statusRestaurante(vencida, AGORA).tipo).toBe('vencido');
    expect(numerosDoPainel([vencida], AGORA).cortesia).toBe(0);
  });
});

describe('a fila do painel inclui o feedback (G5)', () => {
  const hoje = new Date('2026-09-02T12:00:00Z').getTime();
  const ativo = { id: 'r1', nome: 'Casa A', created_at: '2026-01-01', assinatura_ate: '2027-01-01' };

  it('feedback aberto entra na fila mesmo sem nada de cobrança', () => {
    // ⚠️ Era o buraco: sem aviso de pagamento a fila não aparecia, e a única
    // pista de que havia cliente esperando ficava a três telas de rolagem.
    const fila = filaDoPainel([ativo], hoje, [
      { id: 'f1', restaurante_id: 'r1', restaurante_nome: 'Casa A', status: 'novo', created_at: '2026-09-01' },
    ]);
    expect(fila).toHaveLength(1);
    expect(fila[0].tipo).toBe('feedback');
    expect(fila[0].r.nome).toBe('Casa A');
  });

  it('feedback resolvido não entra', () => {
    const fila = filaDoPainel([ativo], hoje, [
      { id: 'f1', restaurante_id: 'r1', status: 'resolvido', created_at: '2026-09-01' },
    ]);
    expect(fila).toHaveLength(0);
  });

  it('aviso de pagamento vem antes do feedback, e os dois antes do vencido', () => {
    // Os dois primeiros têm alguém esperando resposta; vencido é assunto nosso.
    const vencido = { id: 'r2', nome: 'Casa B', created_at: '2026-01-01', assinatura_ate: '2026-08-01' };
    const comAviso = { ...ativo, aviso_pagamento_em: '2026-09-02T09:00:00Z' };
    const fila = filaDoPainel([vencido, comAviso], hoje, [
      { id: 'f1', restaurante_id: 'r2', restaurante_nome: 'Casa B', status: 'novo', created_at: '2026-09-01' },
    ]);
    expect(fila.map(x => x.tipo)).toEqual(['aviso', 'feedback', 'vencido']);
  });

  it('sem feedback nenhum, a fila continua como era', () => {
    expect(filaDoPainel([ativo], hoje)).toHaveLength(0);
    expect(filaDoPainel([ativo], hoje, [])).toHaveLength(0);
  });

  it('feedback de restaurante já apagado não quebra a fila', () => {
    const fila = filaDoPainel([], hoje, [
      { id: 'f1', restaurante_id: null, restaurante_nome: null, status: 'novo', created_at: '2026-09-01' },
    ]);
    expect(fila).toHaveLength(1);
    expect(fila[0].r.nome).toBe('Restaurante');
  });
});

describe('plano emprestado pela Aurum (M41)', () => {
  const DIA = 86400000;
  const AGORA = new Date('2026-09-03T12:00:00Z').getTime();
  const dias = (n) => new Date(AGORA + n * DIA).toISOString();
  const paganteEtiquetas = { restauranteId: 'r1', produto: 'etiquetas' };

  it('sem empréstimo, vale o que a conta comprou', () => {
    expect(produtoAtivo(paganteEtiquetas, null, AGORA)).toBe('etiquetas');
    expect(emprestimoAtivo(paganteEtiquetas, AGORA)).toBeNull();
  });

  // ⚠️ O CASO QUE O DONO PEDIU: quem paga etiquetas experimenta o completo.
  it('com empréstimo valendo, a pessoa vê o plano emprestado', () => {
    const s = { ...paganteEtiquetas, produtoTeste: 'completo', produtoTesteAte: dias(7) };
    expect(produtoAtivo(s, null, AGORA)).toBe('completo');
    expect(produtoTem(produtoAtivo(s, null, AGORA), 'estoque')).toBe(true);
  });

  // ⚠️ E ESTE É O QUE IMPORTA MAIS: quando o prazo acaba, a conta volta
  // SOZINHA para o que ela paga — sem ninguém precisar lembrar de desfazer.
  it('vencido o prazo, volta sozinho para o plano pago', () => {
    const s = { ...paganteEtiquetas, produtoTeste: 'completo', produtoTesteAte: dias(-1) };
    expect(produtoAtivo(s, null, AGORA)).toBe('etiquetas');
    expect(emprestimoAtivo(s, AGORA)).toBeNull();
    expect(produtoTem(produtoAtivo(s, null, AGORA), 'estoque')).toBe(false);
  });

  it('empréstimo sem data não vale — data faltando não é empréstimo eterno', () => {
    const s = { ...paganteEtiquetas, produtoTeste: 'completo', produtoTesteAte: null };
    expect(produtoAtivo(s, null, AGORA)).toBe('etiquetas');
  });

  it('produto emprestado que não existe é ignorado', () => {
    const s = { ...paganteEtiquetas, produtoTeste: 'premium', produtoTesteAte: dias(7) };
    expect(produtoAtivo(s, null, AGORA)).toBe('etiquetas');
  });

  // ⚠️ O modo suporte continua mandando em tudo: quem está vendo é o
  // super-admin, e ele precisa ver o que o CLIENTE vê.
  it('modo suporte ganha do empréstimo', () => {
    const s = { ...paganteEtiquetas, produtoTeste: 'completo', produtoTesteAte: dias(7) };
    expect(produtoAtivo(s, { produto: 'etiquetas' }, AGORA)).toBe('etiquetas');
  });
});

// =====================================================================
//  Bluetooth: o tamanho do pedaço enviado à impressora
//
//  O código mandava 100 bytes por vez com um comentário afirmando que "cabe em
//  qualquer MTU". Não cabe: o mínimo garantido pelo ATT é 20 bytes de carga, e
//  no modo SEM confirmação o que passa disso é descartado em silêncio — a
//  etiqueta sai pela metade sem erro nenhum. Na MDK-022 funciona porque o
//  Android negocia um MTU grande; só quebraria no segundo cliente.
//
//  O Web Bluetooth não expõe o MTU negociado, então não dá para "ler o limite".
//  A regra passou a ser escolher o modo correto em QUALQUER MTU.
// =====================================================================

describe('statusAssinatura — leitura que falhou não bloqueia', () => {
  const agora = Date.UTC(2026, 8, 3);

  it('sem conseguir ler o cadastro, o app NÃO diz que a conta nunca foi liberada', () => {
    const st = statusAssinatura({ restauranteId: 'r1', assinaturaLida: false }, agora);
    expect(st.ok).toBe(true);
    expect(st.tipo).toBe('indeterminado');
  });

  it('lida de verdade e sem nenhuma data → aguardando, como antes', () => {
    const st = statusAssinatura({ restauranteId: 'r1', assinaturaLida: true }, agora);
    expect(st).toEqual({ ok: false, tipo: 'aguardando' });
  });

  // ⚠️ Sessão antiga, demo e o painel não carregam o campo. `undefined` tem de
  // continuar significando "li normalmente", senão ninguém mais é bloqueado.
  it('sem o campo (sessão antiga) a régua antiga continua valendo', () => {
    const st = statusAssinatura({ restauranteId: 'r1' }, agora);
    expect(st).toEqual({ ok: false, tipo: 'aguardando' });
  });

  // ⚠️ Bloqueio comercial é decisão registrada, não ausência de dado — ele
  // continua valendo mesmo sem ter lido o resto.
  it('conta suspensa continua suspensa', () => {
    const st = statusAssinatura({ restauranteId: 'r1', bloqueado: true, assinaturaLida: false }, agora);
    expect(st).toEqual({ ok: false, tipo: 'bloqueado' });
  });
});

// =====================================================================
//  Delegar a Administração (pedido do dono, 03/09/2026)
//
//  A porta da Administração era travada por CARGO (só a diretoria). Passou a
//  ser travada pela capacidade `configurarSistema`, para o dono poder liberar
//  quem ele quiser — mas assinatura, contas, matriz de acessos e suporte
//  remoto continuam só dele, decididos DENTRO da tela.
// =====================================================================
