// =====================================================================
//  Testes de ACESSOS E ESTRUTURA — permissões, módulos, estoques e sincronização
//
//  ⚠️ Este arquivo nasceu de uma divisão: até 09/09/2026 os 465 testes viviam
//  num `regras.test.js` de 4.094 linhas, e achar ou acrescentar teste ali já
//  custava caro. A divisão é POR ASSUNTO, não por arquivo de origem — um teste
//  de etiqueta que atravessa `tspl.js`, `etiquetas.js` e `impressoraBLE.js`
//  continua junto dos seus, que é como se procura.
//
//  Nada de conteúdo mudou na divisão: os mesmos 465 testes, no mesmo texto.
// =====================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { comMetas, separarMetas, fatiarPorEstoque, visaoDoEstoque } from '../visaoEstoque';
import { montarCamposEtiqueta } from '../etiquetas';
import { pode, permissoesEfetivas, PERMISSOES_PADRAO, capacidadesDoProduto } from '../permissoes';
import { registrarFalha, ressuscitar, contarVivos, contarMortos, MAX_TENTATIVAS_OUTBOX, ehErroDefinitivo } from '../outbox';
import { conciliarAuditoria } from '../auditoria';
import { listarEstoques, estoquesAtivos, acharEstoque, salvarEstoque, moduloUtilizavel } from '../instancias';
import { limparCacheLocal, pendenciasNaoSincronizadas, outboxUid } from '../../lib/cache';
import { MODULO_PADRAO, chaveModulo, tipoModulo, lerTipo, temRecurso, ehTipoGlobal, RECURSOS_MODULO, mesclarFixos, catalogoDe, tipoBase, ehIdInstancia, gerarIdInstancia, moduloValido, moduloPorId } from '../modulos';
import { validarCNPJ, formatarCNPJ, validarTelefone, formatarTelefone, soDigitos } from '../documentos';
import { traduzErroAuth } from '../erros';


describe('permissões por função (matriz configurável)', () => {
  const superAdmin = { eSuperAdmin: true };
  const diretoria = { cargo: 'diretoria' };
  const gerencia = { cargo: 'gerencia' };
  const cozinha = { cargo: 'cozinha' };

  it('diretoria e super-admin podem tudo, sempre', () => {
    expect(pode(superAdmin, {}, 'configurarSistema')).toBe(true);
    expect(pode(diretoria, {}, 'verRelatorio')).toBe(true);
    expect(pode(diretoria, { diretoria: { verRelatorio: false } }, 'verRelatorio')).toBe(true);
  });

  it('sem prefs, cai no padrão (cozinha operacional, gerência com gestão)', () => {
    expect(pode(cozinha, undefined, 'verRelatorio')).toBe(false);
    expect(pode(cozinha, undefined, 'removerRegistros')).toBe(false); // só gerência+ apaga por padrão
    expect(pode(gerencia, undefined, 'removerRegistros')).toBe(true);
    expect(pode(gerencia, undefined, 'configurarSistema')).toBe(true);
  });

  it('a diretoria pode conceder e retirar capacidades', () => {
    const permissoes = { cozinha: { verRelatorio: true }, gerencia: { configurarSistema: false } };
    expect(pode(cozinha, permissoes, 'verRelatorio')).toBe(true);   // concedido
    expect(pode(cozinha, permissoes, 'inventario')).toBe(false);    // não mexido → padrão
    expect(pode(gerencia, permissoes, 'configurarSistema')).toBe(false); // retirado
  });

  it('sessão nula não pode nada', () => {
    expect(pode(null, {}, 'verRelatorio')).toBe(false);
  });

  it('permissoesEfetivas completa as chaves a partir do padrão', () => {
    const ef = permissoesEfetivas({ cozinha: { verRelatorio: true } });
    expect(ef.cozinha.verRelatorio).toBe(true);
    expect(ef.cozinha.inventario).toBe(PERMISSOES_PADRAO.cozinha.inventario);
    expect(ef.gerencia).toEqual(PERMISSOES_PADRAO.gerencia);
  });
});

describe('outbox — fila morta (não retentar para sempre)', () => {
  it('marca _morto ao atingir o máximo de tentativas', () => {
    let item = { id: 'a', kind: 'registro', op: 'insert' };
    for (let i = 0; i < MAX_TENTATIVAS_OUTBOX - 1; i++) item = registrarFalha(item);
    expect(item._morto).toBe(false);
    expect(item._tentativas).toBe(MAX_TENTATIVAS_OUTBOX - 1);
    item = registrarFalha(item);
    expect(item._morto).toBe(true);
    expect(item._tentativas).toBe(MAX_TENTATIVAS_OUTBOX);
  });

  it('ressuscitar limpa _morto e _tentativas', () => {
    const morto = { id: 'a', _morto: true, _tentativas: 8 };
    const vivo = ressuscitar(morto);
    expect(vivo._morto).toBeUndefined();
    expect(vivo._tentativas).toBeUndefined();
    expect(vivo.id).toBe('a');
  });

  it('conta vivos e mortos separadamente', () => {
    const fila = [{ id: 1 }, { id: 2, _morto: true }, { id: 3 }];
    expect(contarVivos(fila)).toBe(2);
    expect(contarMortos(fila)).toBe(1);
  });
});

describe('outbox — identidade estável dos itens', () => {
  it('outboxUid não repete em chamadas seguidas no mesmo milissegundo', () => {
    const ids = Array.from({ length: 500 }, () => outboxUid());
    expect(new Set(ids).size).toBe(500);
  });
});

describe('módulos — namespacing sem migração', () => {
  it('o módulo PADRÃO mantém exatamente as chaves e tipos de hoje', () => {
    // Esta é a garantia de que nenhum restaurante que já usa o app precisa
    // converter dado: no módulo de produção tudo continua onde sempre esteve.
    for (const chave of ['produtos', 'categorias', 'entradas', 'saidas', 'prefs']) {
      expect(chaveModulo(MODULO_PADRAO, chave)).toBe(chave);
    }
    for (const tipo of ['entrada', 'saida', 'compra', 'apara', 'perda', 'ajuste']) {
      expect(tipoModulo(MODULO_PADRAO, tipo)).toBe(tipo);
    }
  });

  it('módulo novo isola por prefixo', () => {
    expect(chaveModulo('seco', 'produtos')).toBe('seco::produtos');
    expect(tipoModulo('seco', 'entrada')).toBe('seco:entrada');
  });

  it('lerTipo devolve o módulo e o tipo de volta', () => {
    expect(lerTipo('seco:entrada')).toEqual({ modulo: 'seco', tipo: 'entrada' });
    expect(lerTipo('entrada')).toEqual({ modulo: MODULO_PADRAO, tipo: 'entrada' });
  });

  it('registro antigo sem prefixo cai na produção (compatibilidade)', () => {
    // um registro gravado antes do multi-módulo não pode sumir da tela
    expect(lerTipo('saida').modulo).toBe(MODULO_PADRAO);
    // prefixo desconhecido (dado estranho) também não some: vai para produção
    expect(lerTipo('xpto:entrada')).toEqual({ modulo: MODULO_PADRAO, tipo: 'xpto:entrada' });
  });

  // Regressão: o destino fixo "Cozinha de Finalização" só era semeado quando o
  // documento `locais` NÃO existia. Toda conta criada antes dele já tinha o
  // documento salvo, então o destino nunca aparecia e a ponte entre as duas
  // cozinhas ficava inalcançável pela tela.
  describe('mesclarFixos — repõe o destino fixo em conta já criada', () => {
    const PADRAO = [{ id: 'finalizacao', nome: 'Cozinha de Finalização', fixo: true }, { id: 'salao', nome: 'Salão' }];

    it('acrescenta o fixo que falta sem mexer no que o restaurante criou', () => {
      const salvos = [{ id: 'salao', nome: 'Salão' }, { id: 'delivery', nome: 'Delivery' }];
      const r = mesclarFixos(salvos, PADRAO);
      expect(r.map(x => x.id)).toEqual(['salao', 'delivery', 'finalizacao']);
      expect(r.find(x => x.id === 'finalizacao').fixo).toBe(true);
    });

    it('preserva o nome se o restaurante renomeou o destino fixo', () => {
      const salvos = [{ id: 'finalizacao', nome: 'Praça quente' }];
      expect(mesclarFixos(salvos, PADRAO)[0].nome).toBe('Praça quente');
    });

    it('remarca como fixo o item que perdeu a marca (senão a tela deixa remover)', () => {
      const salvos = [{ id: 'finalizacao', nome: 'Cozinha de Finalização' }];
      expect(mesclarFixos(salvos, PADRAO)[0].fixo).toBe(true);
    });

    it('nada a repor devolve a MESMA referência — senão a hidratação grava a cada abertura', () => {
      const salvos = [{ id: 'finalizacao', nome: 'Cozinha de Finalização', fixo: true }, { id: 'salao', nome: 'Salão' }];
      expect(mesclarFixos(salvos, PADRAO)).toBe(salvos);
    });

    it('aguenta lista ausente ou corrompida', () => {
      expect(mesclarFixos(undefined, PADRAO).map(x => x.id)).toEqual(['finalizacao']);
      expect(mesclarFixos(null, PADRAO)).toHaveLength(1);
    });
  });

  it('a finalização lê o catálogo da produção (mesmo id dos dois lados)', () => {
    // se isto mudar, a ponte entre as cozinhas para de casar os produtos
    expect(catalogoDe('finalizacao')).toBe(MODULO_PADRAO);
    expect(chaveModulo(catalogoDe('finalizacao'), 'produtos')).toBe('produtos');
    expect(chaveModulo(catalogoDe('seco'), 'produtos')).toBe('seco::produtos');
  });

  it('ida e volta: gravar e ler devolve o mesmo módulo', () => {
    for (const mod of ['producao', 'seco']) {
      for (const tipo of ['entrada', 'saida', 'ajuste']) {
        expect(lerTipo(tipoModulo(mod, tipo))).toEqual({ modulo: mod, tipo });
      }
    }
  });

  it('estoque seco não tem receita nem apara; produção tem tudo', () => {
    expect(temRecurso('seco', 'receitas')).toBe(false);
    expect(temRecurso('seco', 'producao')).toBe(false);
    expect(temRecurso('seco', 'aparas')).toBe(false);
    expect(temRecurso('seco', 'inventario')).toBe(true);
    expect(temRecurso('producao', 'receitas')).toBe(true);
    expect(temRecurso('producao', 'aparas')).toBe(true);
  });

  // No seco a COMPRA JA E A ENTRADA: você compra 12 pacotes de arroz e eles SAO
  // o item do estoque. Ter duas telas para o mesmo ato fazia a pessoa registrar
  // a compra e o saldo nao mexer. Na Producao seguem separadas, porque la sao
  // atos diferentes (compra o cru, porciona depois).
  it('no seco a compra dá entrada; na produção não', () => {
    expect(temRecurso('seco', 'compraEntraNoEstoque')).toBe(true);
    expect(temRecurso('seco', 'entradas')).toBe(false);
    expect(temRecurso('producao', 'compraEntraNoEstoque')).toBe(false);
    expect(temRecurso('producao', 'entradas')).toBe(true);
  });

  it('seco usa a validade DO PRODUTOR, não um prazo calculado', () => {
    expect(temRecurso('seco', 'validadeDoProdutor')).toBe(true);
    expect(temRecurso('producao', 'validadeDoProdutor')).toBe(false);
  });

  it('seco não gera etiqueta: o mantimento chega lacrado e já etiquetado', () => {
    expect(temRecurso('seco', 'etiquetas')).toBe(false);
    expect(temRecurso('producao', 'etiquetas')).toBe(true);
    expect(temRecurso('finalizacao', 'etiquetas')).toBe(true);
  });

  it('a auditoria fica fora do namespace (é do restaurante, não do módulo)', () => {
    expect(ehTipoGlobal('auditoria')).toBe(true);
    expect(ehTipoGlobal('entrada')).toBe(false);
  });
});

describe('outbox — erro definitivo não fica retentando', () => {
  it('violação de constraint morre na 1ª tentativa (não gasta 8 retries)', () => {
    // Cenário real: módulo novo cujo tipo ainda não foi liberado na migração 17.
    // Retentar não vai mudar a resposta do banco — o usuário precisa saber logo.
    const item = registrarFalha({ kind: 'registro', _ultimoErro: 'new row for relation "registros" violates check constraint "registros_tipo_check"' });
    expect(item._morto).toBe(true);
    expect(item._tentativas).toBe(1);
  });

  it('erro de rede continua retentando até o limite', () => {
    let item = { kind: 'registro', _ultimoErro: 'Failed to fetch' };
    for (let i = 1; i < MAX_TENTATIVAS_OUTBOX; i++) {
      item = registrarFalha({ ...item, _ultimoErro: 'Failed to fetch' });
      expect(item._morto).toBe(false);
    }
    item = registrarFalha({ ...item, _ultimoErro: 'Failed to fetch' });
    expect(item._morto).toBe(true); // só morre no limite
  });

  it('reconhece os erros que nunca passam num retry', () => {
    expect(ehErroDefinitivo('violates check constraint')).toBe(true);
    expect(ehErroDefinitivo('violates foreign key constraint')).toBe(true);
    expect(ehErroDefinitivo('timeout')).toBe(false);
    expect(ehErroDefinitivo(undefined)).toBe(false);
  });
});

describe('módulos — despensa não tem câmara fria', () => {
  it('produção distingue congelado/resfriado; seco não', () => {
    expect(temRecurso('producao', 'armazenamento')).toBe(true);
    expect(temRecurso('seco', 'armazenamento')).toBe(false);
  });

  it('no seco a validade sai do prazo único de prateleira', () => {
    // Sem câmara fria o prazo do fabricante fica em valCongelado (campo único
    // na tela "Prazo de prateleira"). A etiqueta precisa usá-lo mesmo sem
    // rótulo de armazenamento — antes disso ela saía SEM validade.
    const campos = montarCamposEtiqueta({
      nome: 'Arroz tipo 1', dataFabricacao: '2026-08-05',
      diasValidade: 365, armazenamento: null,
    });
    expect(campos.validade).toBe('2027-08-05');
    expect(campos.armazenamentoLabel).toBe(''); // sem CONGELADO/RESFRIADO na etiqueta
  });

  it('item de despensa sem prazo (descartável) não ganha validade', () => {
    const campos = montarCamposEtiqueta({
      nome: 'Guardanapo', dataFabricacao: '2026-08-05', diasValidade: 0, armazenamento: null,
    });
    expect(campos.validade).toBeNull();
    expect(campos.validadeFmt).toBe('');
  });
});

describe('módulos — regressões da auditoria', () => {
  it('recurso não declarado NÃO liga a tela sozinho', () => {
    // Regressão: com `!== false`, 'fecharTurno' (só da finalização) aparecia na
    // Produção e no Seco, levando a uma tela que dizia "nada recebido" para sempre.
    expect(temRecurso('producao', 'fecharTurno')).toBe(false);
    expect(temRecurso('seco', 'fecharTurno')).toBe(false);
    expect(temRecurso('finalizacao', 'fecharTurno')).toBe(true);
    // nome inexistente/errado também não pode ligar nada
    expect(temRecurso('producao', 'recursoQueNaoExiste')).toBe(false);
  });

  it('todo módulo declara todos os recursos usados (sem default implícito)', () => {
    const chaves = new Set();
    Object.values(RECURSOS_MODULO).forEach(r => Object.keys(r).forEach(c => chaves.add(c)));
    Object.entries(RECURSOS_MODULO).forEach(([mod, r]) => {
      chaves.forEach(c => {
        expect(typeof r[c], `módulo "${mod}" não declara o recurso "${c}"`).toBe('boolean');
      });
    });
  });
});

describe('conciliarAuditoria — otimista local x definitiva do banco', () => {
  const L = (acao, ts, detalhe = '') => ({ id: `${ts}_abcd`, ts, acao, detalhe });
  const S = (acao, ts, detalhe = '') => ({ id: 'a1b2c3d4e5f60718', ts, acao, detalhe });

  it('descarta a local que já chegou do banco', () => {
    const servidor = [S('registrou entrada', 1000)];
    const locais = [L('registrou entrada', 1200)];
    expect(conciliarAuditoria(servidor, locais)).toEqual([]);
  });

  it('mantém a local que ainda não subiu (fila offline)', () => {
    const servidor = [S('registrou entrada', 1000)];
    const locais = [L('registrou saída', 1200)];
    expect(conciliarAuditoria(servidor, locais)).toHaveLength(1);
  });

  it('detalhe diferente não é a mesma linha', () => {
    const servidor = [S('registrou perda', 1000, 'Filé 2kg')];
    expect(conciliarAuditoria(servidor, [L('registrou perda', 1000, 'Charque 5kg')])).toHaveLength(1);
  });

  it('casa 1 para 1: duas ações idênticas de verdade continuam aparecendo duas vezes', () => {
    const servidor = [S('registrou entrada', 1000)];
    const locais = [L('registrou entrada', 1000), L('registrou entrada', 1050)];
    expect(conciliarAuditoria(servidor, locais)).toHaveLength(1);
  });

  it('fora da janela de tempo não casa (ação repetida dias depois é outra linha)', () => {
    const servidor = [S('registrou entrada', 1000)];
    expect(conciliarAuditoria(servidor, [L('registrou entrada', 1000 + 5 * 60000)])).toHaveLength(1);
  });

  it('listas vazias ou ausentes não quebram', () => {
    expect(conciliarAuditoria([], [L('x', 1)])).toHaveLength(1);
    expect(conciliarAuditoria(undefined, undefined)).toEqual([]);
  });
});

// ⚠️ SEGURANÇA. O logout de uma conta real não apagava NADA do cache: num
// tablet de cozinha, compartilhado por definição, o próximo usuário lia
// produtos, custos e histórico pelo DevTools. Estes testes travam as duas
// metades da regra — apagar o dado, e NÃO apagar trabalho não sincronizado.

describe('limparCacheLocal — logout não pode deixar dado no aparelho', () => {
  // O código de produção usa `Object.keys(localStorage)`, e no localStorage REAL
  // isso devolve as chaves guardadas. Num objeto comum devolveria os métodos —
  // por isso os métodos entram como NÃO enumeráveis e os dados ficam como
  // propriedades próprias. Mock que não imita isso passa sem testar nada.
  let store;
  beforeEach(() => {
    store = {};
    Object.defineProperties(store, {
      getItem:    { value: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null) },
      setItem:    { value: (k, v) => { store[k] = String(v); } },
      removeItem: { value: (k) => { delete store[k]; } },
    });
    globalThis.localStorage = store;
  });

  const semir = (k, v) => { store[k] = JSON.stringify(v); };

  it('apaga os dados de conta de TODOS os restaurantes do aparelho', () => {
    semir('pe::rest_a::produtos', [{ id: 'x' }]);
    semir('pe::rest_a::entradas', [{ id: 'e1' }]);
    semir('pe::rest_b::produtos', [{ id: 'y' }]);   // outra conta que usou o mesmo tablet
    semir('pe::rest_a::auditoria', [{ acao: 'x' }]);
    limparCacheLocal();
    expect(Object.keys(store)).toEqual([]);
  });

  it('preserva a preferência do APARELHO (senão o tablet esquece o estoque aberto)', () => {
    store['pe::modulo'] = 'seco';
    semir('pe::rest_a::produtos', [{ id: 'x' }]);
    limparCacheLocal();
    expect(store['pe::modulo']).toBe('seco');
    expect(store['pe::rest_a::produtos']).toBeUndefined();
  });

  it('NÃO apaga fila com item vivo — seria destruir lançamento que não subiu', () => {
    semir('pe::rest_a::_outbox', [{ _uid: '1', kind: 'registro' }]);
    semir('pe::rest_a::produtos', [{ id: 'x' }]);
    limparCacheLocal();
    expect(store['pe::rest_a::_outbox']).toBeDefined();  // trabalho preservado
    expect(store['pe::rest_a::produtos']).toBeUndefined(); // dado apagado
  });

  it('fila só com item MORTO pode sair: já falhou em definitivo, não é trabalho a salvar', () => {
    semir('pe::rest_a::_outbox', [{ _uid: '1', _morto: true }]);
    limparCacheLocal();
    expect(store['pe::rest_a::_outbox']).toBeUndefined();
  });

  // ⚠️ Defeito relatado pelo dono: ele saía da conta e, ao voltar, o
  // RESPONSÁVEL da etiqueta tinha sumido — junto com o último armazenamento
  // usado, o turno e o destino. Os quatro vivem em `_prefs_device`
  // (PREFS_APARELHO, em store/AppContext.jsx) e a limpeza levava tudo.
  it('preserva a memória de preenchimento do aparelho (responsável, armazenamento)', () => {
    semir('pe::rest_a::_prefs_device', { responsavel: 'Maria', ultimoArmazenamento: { p1: 'resfriado' }, turno: 'noite' });
    semir('pe::rest_a::produtos', [{ id: 'x' }]);
    semir('pe::rest_a::auditoria', [{ acao: 'x' }]);
    limparCacheLocal();
    expect(JSON.parse(store['pe::rest_a::_prefs_device']).responsavel).toBe('Maria');
    expect(JSON.parse(store['pe::rest_a::_prefs_device']).ultimoArmazenamento).toEqual({ p1: 'resfriado' });
    // e o dado do negócio continua saindo — a regra do tablet compartilhado vale
    expect(store['pe::rest_a::produtos']).toBeUndefined();
    expect(store['pe::rest_a::auditoria']).toBeUndefined();
  });

  it('a memória de preenchimento não vaza entre contas — é por restaurante', () => {
    semir('pe::rest_a::_prefs_device', { responsavel: 'Maria' });
    semir('pe::rest_b::_prefs_device', { responsavel: 'João' });
    limparCacheLocal();
    // cada uma sob o id do seu restaurante; a conta seguinte lê só a dela
    expect(JSON.parse(store['pe::rest_a::_prefs_device']).responsavel).toBe('Maria');
    expect(JSON.parse(store['pe::rest_b::_prefs_device']).responsavel).toBe('João');
  });

  it('pendenciasNaoSincronizadas conta os vivos de todas as contas', () => {
    semir('pe::rest_a::_outbox', [{ _uid: '1' }, { _uid: '2', _morto: true }]);
    semir('pe::rest_b::_outbox', [{ _uid: '3' }]);
    expect(pendenciasNaoSincronizadas()).toBe(2); // 2 vivos; o morto não conta
  });
});

// O risco numero um de um relatorio financeiro e dar um numero ERRADO com cara
// de certo — ninguem desconfia de um total. A armadilha aqui e a unidade: a
// compra e na unidade do fornecedor (kg de picanha) e o estoque na unidade de
// uso (porcao). Estes testes travam a conversao e, principalmente, travam o
// comportamento de RECUSAR quando nao da para converter.

describe('instancias — varios estoques do mesmo tipo', () => {
  it('tipoBase tira o sufixo, e id sem sufixo continua igual', () => {
    expect(tipoBase('seco#x7k2')).toBe('seco');
    expect(tipoBase('seco')).toBe('seco');
    expect(tipoBase('producao')).toBe('producao');
    expect(tipoBase(undefined)).toBe('');
  });

  it('lerTipo devolve a instancia inteira — o "#" nao confunde o corte no ":"', () => {
    expect(lerTipo('seco#x7k2:entrada')).toEqual({ modulo: 'seco#x7k2', tipo: 'entrada' });
    expect(lerTipo('finalizacao#b3nq:perda')).toEqual({ modulo: 'finalizacao#b3nq', tipo: 'perda' });
  });

  it('a chave e o tipo do banco levam a instancia', () => {
    expect(chaveModulo('seco#x7k2', 'produtos')).toBe('seco#x7k2::produtos');
    expect(tipoModulo('seco#x7k2', 'entrada')).toBe('seco#x7k2:entrada');
  });

  it('a instancia RAIZ nao muda nada — e o que dispensa migracao de dados', () => {
    expect(chaveModulo('seco', 'produtos')).toBe('seco::produtos');
    expect(tipoModulo('producao', 'entrada')).toBe('entrada');
    expect(chaveModulo(MODULO_PADRAO, 'produtos')).toBe('produtos');
  });

  it('CATALOGO e por TIPO: toda instancia de seco le o mesmo catalogo', () => {
    // e o que torna o balanco consolidado possivel — somar por produtoId so
    // funciona porque o id e o mesmo dos dois lados
    expect(catalogoDe('seco#x7k2')).toBe('seco');
    expect(catalogoDe('seco#b9dd')).toBe('seco');
    expect(chaveModulo(catalogoDe('seco#x7k2'), 'produtos')).toBe('seco::produtos');
  });

  it('toda finalizacao — inclusive instancia nova — le o catalogo da producao', () => {
    expect(catalogoDe('finalizacao')).toBe(MODULO_PADRAO);
    expect(catalogoDe('finalizacao#b3nq')).toBe(MODULO_PADRAO);
    expect(chaveModulo(catalogoDe('finalizacao#b3nq'), 'produtos')).toBe('produtos');
  });

  it('mas o SALDO e separado: a chave de lancamento leva a instancia', () => {
    // catalogo igual, estoque diferente — que e exatamente o pedido do dono
    expect(chaveModulo('seco#x7k2', 'entradas')).toBe('seco#x7k2::entradas');
    expect(chaveModulo('seco#b9dd', 'entradas')).toBe('seco#b9dd::entradas');
  });

  it('recursos vem do TIPO: instancia nova herda tudo sem configurar', () => {
    expect(temRecurso('seco#x7k2', 'receitas')).toBe(false);
    expect(temRecurso('seco#x7k2', 'entradas')).toBe(false);   // no seco a compra ja da entrada
    expect(temRecurso('finalizacao#b3nq', 'fecharTurno')).toBe(true);
    expect(temRecurso('finalizacao#b3nq', 'compras')).toBe(false);
  });

  it('moduloPorId acha o rotulo do tipo mesmo com sufixo', () => {
    expect(moduloPorId('seco#x7k2').label).toBe('Estoque Seco');
    // ícone e NOME de desenho SVG, nao emoji: emoji renderiza diferente em cada
    // aparelho e nao aceita a cor da marca.
    expect(moduloPorId('finalizacao#b3nq').icone).toBe('frigideira');
  });

  // ⚠️ O TESTE MAIS IMPORTANTE DESTE BLOCO.
  // Se moduloValido consultasse o REGISTRO de instancias em vez do FORMATO,
  // arquivar uma instancia faria lerTipo cair no fallback "prefixo desconhecido
  // = dado antigo" e despejar o estoque daquele restaurante DENTRO DA PRODUCAO,
  // sem erro nenhum.
  it('validacao e por FORMATO — id de instancia arquivada nao vira dado da producao', () => {
    expect(moduloValido('seco#x7k2')).toBe(true);
    expect(lerTipo('seco#x7k2:entrada').modulo).toBe('seco#x7k2');
  });

  it('formato invalido NAO passa — senao qualquer lixo viraria estoque', () => {
    expect(moduloValido('seco#x')).toBe(false);        // curto demais
    expect(moduloValido('seco#X7K2')).toBe(false);     // maiuscula
    expect(moduloValido('xpto#x7k2')).toBe(false);     // tipo inexistente
    expect(moduloValido('seco#x7k2z')).toBe(false);    // longo demais
    expect(ehIdInstancia('seco')).toBe(false);         // raiz nao e instancia
  });

  it('prefixo desconhecido continua caindo na producao (compatibilidade)', () => {
    expect(lerTipo('xpto:entrada')).toEqual({ modulo: MODULO_PADRAO, tipo: 'xpto:entrada' });
  });

  it('gerarIdInstancia produz id valido e nao repete o que ja existe', () => {
    const existentes = [];
    for (let i = 0; i < 200; i++) {
      const id = gerarIdInstancia('seco', existentes);
      expect(ehIdInstancia(id)).toBe(true);
      expect(tipoBase(id)).toBe('seco');
      existentes.push({ id });
    }
    expect(new Set(existentes.map(x => x.id)).size).toBe(200);
  });

  it('gerarIdInstancia recusa tipo inexistente em vez de criar estoque fantasma', () => {
    expect(() => gerarIdInstancia('xpto')).toThrow();
  });

  it('o alfabeto do id evita caracteres que se confundem ao ler em voz alta', () => {
    const ids = Array.from({ length: 300 }, () => gerarIdInstancia('seco'));
    const sufixos = ids.map(i => i.split('#')[1]).join('');
    expect(/[ilo01]/.test(sufixos)).toBe(false);
  });

  it('ida e volta sobrevive para instancia, como ja sobrevivia para modulo', () => {
    for (const mod of ['producao', 'seco', 'seco#x7k2', 'finalizacao#b3nq']) {
      for (const tipo of ['entrada', 'saida', 'ajuste', 'perda']) {
        expect(lerTipo(tipoModulo(mod, tipo))).toEqual({ modulo: mod, tipo });
      }
    }
  });
});

describe('registro de estoques — os tres de sempre + os que o dono criar', () => {
  it('sem documento nenhum, devolve exatamente os tres originais', () => {
    // conta que nunca criou instancia nao pode ter nada para migrar
    const l = listarEstoques(undefined);
    expect(l.map(e => e.id)).toEqual(['producao', 'finalizacao', 'seco']);
    expect(l.every(e => e.raiz)).toBe(true);
    expect(l[0].nome).toBe('Cozinha de Producao'.replace('Producao', 'Produção'));
  });

  it('agrupa cada instancia logo abaixo da raiz do tipo dela', () => {
    const doc = { itens: [
      { id: 'seco#x7k2', nome: 'Seco do X', criadoEm: 2 },
      { id: 'seco#b9dd', nome: 'Seco do Y', criadoEm: 1 },
      { id: 'finalizacao#b3nq', nome: 'Final do Y', criadoEm: 3 },
    ] };
    const l = listarEstoques(doc);
    expect(l.map(e => e.id)).toEqual([
      'producao',
      'finalizacao', 'finalizacao#b3nq',
      'seco', 'seco#b9dd', 'seco#x7k2',   // ordem de criacao dentro do tipo
    ]);
  });

  it('ignora id invalido no documento em vez de criar estoque fantasma', () => {
    const l = listarEstoques({ itens: [{ id: 'xpto#zzzz' }, { id: 'seco#XX11' }, null] });
    expect(l.map(e => e.id)).toEqual(['producao', 'finalizacao', 'seco']);
  });

  it('a RAIZ nunca fica arquivada, mesmo se o documento disser que sim', () => {
    // ela e o destino de queda quando uma instancia some, e onde moram os dados
    // de quem usa o app desde antes das instancias
    const l = listarEstoques({ itens: [{ id: 'seco', arquivado: true }] });
    expect(l.find(e => e.id === 'seco').arquivado).toBe(false);
  });

  it('instancia sem nome ganha um rotulo legivel em vez de ficar em branco', () => {
    const l = listarEstoques({ itens: [{ id: 'seco#x7k2' }] });
    expect(l.find(e => e.id === 'seco#x7k2').nome).toBe('Estoque Seco (x7k2)');
  });

  it('arquivado sai do seletor mas continua na lista completa', () => {
    const l = listarEstoques({ itens: [{ id: 'seco#x7k2', nome: 'X', arquivado: true }] });
    expect(l.some(e => e.id === 'seco#x7k2')).toBe(true);
    expect(estoquesAtivos(l).some(e => e.id === 'seco#x7k2')).toBe(false);
  });
});

// A etiqueta e IMPRESSA e vai para o pote: sair com o nome do outro restaurante
// e erro visivel na frente do cliente.

describe('salvarEstoque — cria, renomeia e arquiva', () => {
  it('cria a instancia nova preservando as que ja existiam', () => {
    const doc = { itens: [{ id: 'seco#x7k2', nome: 'X' }] };
    const d2 = salvarEstoque(doc, { id: 'seco#b9dd', nome: 'Y', criadoEm: 7 });
    expect(d2.itens.map(i => i.id).sort()).toEqual(['seco#b9dd', 'seco#x7k2']);
  });

  it('renomear NAO mexe no id — senao todo lancamento gravado ficaria orfao', () => {
    const doc = salvarEstoque({ itens: [{ id: 'seco#x7k2', nome: 'Antigo', criadoEm: 5 }] },
                              { id: 'seco#x7k2', nome: 'Novo' });
    const i = doc.itens[0];
    expect(i.id).toBe('seco#x7k2');
    expect(i.nome).toBe('Novo');
    expect(i.criadoEm).toBe(5);   // data de criacao preservada
  });

  it('arquivar mantem a linha no documento (o historico precisa dela)', () => {
    const doc = salvarEstoque({ itens: [{ id: 'seco#x7k2', nome: 'X' }] },
                              { id: 'seco#x7k2', arquivado: true });
    expect(doc.itens[0].arquivado).toBe(true);
    expect(doc.itens[0].nome).toBe('X');
  });

  it('personalizar a RAIZ grava; limpar a personalizacao tira a linha do documento', () => {
    const comNome = salvarEstoque({}, { id: 'seco', estabelecimento: 'Restaurante X' });
    expect(comNome.itens).toHaveLength(1);
    const semNome = salvarEstoque(comNome, { id: 'seco', estabelecimento: '', nome: '' });
    expect(semNome.itens).toHaveLength(0);   // volta ao padrao do codigo
  });
});

// O id do estoque aberto fica no APARELHO, nao na conta.

describe('moduloUtilizavel — tablet que abre um estoque que nao existe mais', () => {
  const lista = listarEstoques({ itens: [
    { id: 'seco#x7k2', nome: 'X' },
    { id: 'seco#morto', nome: 'Antigo', arquivado: true },
  ] });

  it('estoque valido continua valendo', () => {
    expect(moduloUtilizavel(lista, 'seco#x7k2')).toBe('seco#x7k2');
  });

  it('ARQUIVADO cai na raiz do tipo — senao a pessoa opera um estoque que ninguem ve', () => {
    expect(moduloUtilizavel(lista, 'seco#morto')).toBe('seco');
  });

  it('id que nao existe no registro cai na raiz do tipo', () => {
    // acontece com tablet levado de uma unidade para outra
    expect(moduloUtilizavel(lista, 'seco#nada')).toBe('seco');
  });

  it('raiz sempre serve', () => {
    expect(moduloUtilizavel(lista, 'producao')).toBe('producao');
  });
});

describe('acharEstoque — nunca devolve nada', () => {
  const lista = listarEstoques({ itens: [{ id: 'seco#x7k2', nome: 'X' }] });
  it('acha pelo id', () => {
    expect(acharEstoque(lista, 'seco#x7k2').nome).toBe('X');
  });
  it('id desconhecido cai na raiz do tipo em vez de devolver undefined', () => {
    expect(acharEstoque(lista, 'seco#nada').id).toBe('seco');
  });
});

// FASE 3 — cada estoque tem o SEU min/max para o MESMO produto do catalogo
// compartilhado. Era o pedido explicito do dono: "as quantidades de cada
// estoque de cada item e unica, ate para ter o controle de min e max".

describe('metas por estoque — mesmo produto, alvos diferentes', () => {
  const catalogo = [
    { id: 'arroz',  nome: 'Arroz',  unidade: 'unid', min: 4, max: 12, ativo: true },
    { id: 'feijao', nome: 'Feijao', unidade: 'unid', min: 6, max: 20, ativo: true },
  ];

  it('sem meta nenhuma, devolve o catalogo INTACTO (mesma referencia)', () => {
    // identidade importa: se mudasse, todo useMemo que depende de `produtos`
    // invalidaria a cada render — perceptivel num tablet barato
    expect(comMetas(catalogo, {})).toBe(catalogo);
    expect(comMetas(catalogo, null)).toBe(catalogo);
  });

  it('a meta do estoque sobrepoe o min/max do catalogo', () => {
    const r = comMetas(catalogo, { arroz: { min: 20, max: 50 } });
    expect(r.find(p => p.id === 'arroz').min).toBe(20);
    expect(r.find(p => p.id === 'arroz').max).toBe(50);
  });

  it('o que NAO e min/max continua vindo do catalogo compartilhado', () => {
    const r = comMetas(catalogo, { arroz: { min: 20, max: 50 } });
    const arroz = r.find(p => p.id === 'arroz');
    expect(arroz.nome).toBe('Arroz');       // nome e compartilhado
    expect(arroz.unidade).toBe('unid');
  });

  it('produto sem meta fica com o objeto ORIGINAL, nao uma copia', () => {
    const r = comMetas(catalogo, { arroz: { min: 20, max: 50 } });
    expect(r.find(p => p.id === 'feijao')).toBe(catalogo[1]);
  });

  it('meta igual a do catalogo nao cria objeto novo', () => {
    expect(comMetas(catalogo, { arroz: { min: 4, max: 12 } })).toBe(catalogo);
  });

  it('meta com valor invalido cai para o do catalogo em vez de virar NaN', () => {
    const r = comMetas(catalogo, { arroz: { min: 'abc', max: null } });
    expect(r.find(p => p.id === 'arroz').min).toBe(4);
    expect(r.find(p => p.id === 'arroz').max).toBe(12);
  });
});

describe('separarMetas — a gravacao vai para o lugar certo sozinha', () => {
  // O dadosRef do AppContext nao expunha produtosCat nem metas, entao a chamada
  // real era separarMetas(undefined, lista, undefined): devolvia sempre
  // { catalogo: <lista COM min/max dentro>, metas: null }, o documento `metas`
  // nunca era gravado, e o minimo de um restaurante ia para a chave
  // compartilhada por tipo, por cima do outro. Nada disso dava erro na tela.
  it('recusa a chamada sem catalogo em vez de mandar o min/max para o lugar errado', () => {
    expect(() => separarMetas(undefined, [{ id: 'arroz', min: 20, max: 40 }], undefined))
      .toThrow(/catálogo atual não foi passado/);
  });

  const catalogo = [
    { id: 'arroz', nome: 'Arroz', unidade: 'unid', min: 4, max: 12, ativo: true },
  ];

  it('mudar SO o min/max grava em metas e NAO toca no catalogo', () => {
    // e o que impede o min do Restaurante Y de sobrescrever o do X
    const nova = [{ ...catalogo[0], min: 20, max: 50 }];
    const r = separarMetas(catalogo, nova, {});
    expect(r.metas).toEqual({ arroz: { min: 20, max: 50 } });
    expect(r.catalogo).toBeNull();
  });

  it('mudar o NOME grava no catalogo e nao inventa meta', () => {
    const nova = [{ ...catalogo[0], nome: 'Arroz tipo 1' }];
    const r = separarMetas(catalogo, nova, {});
    expect(r.catalogo[0].nome).toBe('Arroz tipo 1');
    expect(r.metas).toBeNull();
  });

  it('mudar os dois de uma vez separa cada um para o seu lado', () => {
    const nova = [{ ...catalogo[0], nome: 'Arroz tipo 1', min: 20, max: 50 }];
    const r = separarMetas(catalogo, nova, {});
    expect(r.catalogo[0].nome).toBe('Arroz tipo 1');
    expect(r.catalogo[0].min).toBe(4);        // catalogo preserva o min original
    expect(r.metas.arroz).toEqual({ min: 20, max: 50 });
  });

  it('produto NOVO entra no catalogo com o min/max que veio', () => {
    // catalogo e compartilhado: item recem-criado precisa nascer igual em todos
    const nova = [...catalogo, { id: 'sal', nome: 'Sal', unidade: 'kg', min: 2, max: 8, ativo: true }];
    const r = separarMetas(catalogo, nova, {});
    expect(r.catalogo).toHaveLength(2);
    expect(r.catalogo[1].min).toBe(2);
  });

  it('nada mudou = nada e gravado (nao suja o documento a toa)', () => {
    const r = separarMetas(catalogo, [{ ...catalogo[0] }], {});
    expect(r.catalogo).toBeNull();
    expect(r.metas).toBeNull();
  });

  it('voltar a meta para o valor do catalogo continua sendo uma meta explicita', () => {
    const r = separarMetas(catalogo, [{ ...catalogo[0], min: 4, max: 12 }], { arroz: { min: 20, max: 50 } });
    expect(r.metas.arroz).toEqual({ min: 4, max: 12 });
  });
});

// A Administracao precisa mostrar o relatorio do Estoque Seco enquanto a cozinha
// segue com a Producao aberta. Antes o cartao trocava o estoque ATIVO — clicar
// num relatorio mudava onde a equipe ia lancar.

describe('visao de um estoque sem trocar o que esta aberto', () => {
  const linha = (id, tipo, dados) => ({ id, tipo, ts: 1, dados, deleted: false });
  const conv = (l) => ({ id: l.id, ts: l.ts, ...l.dados });

  const linhas = [
    linha('a', 'seco:entrada',       { data: '2026-08-01', itens: [{ produtoId: 'arroz', quantidade: 100 }] }),
    linha('b', 'seco#x7k2:entrada',  { data: '2026-08-01', itens: [{ produtoId: 'arroz', quantidade: 7 }] }),
    linha('c', 'seco#x7k2:saida',    { data: '2026-08-02', itens: [{ produtoId: 'arroz', quantidade: 2 }], destino: 'cozinha' }),
    linha('d', 'auditoria',          { acao: 'x' }),
  ];

  it('cada estoque recebe so os lancamentos dele', () => {
    const f = fatiarPorEstoque(linhas, ['seco', 'seco#x7k2'], conv);
    expect(f['seco'].entradas.map(r => r.id)).toEqual(['a']);
    expect(f['seco#x7k2'].entradas.map(r => r.id)).toEqual(['b']);
    expect(f['seco#x7k2'].saidas.map(r => r.id)).toEqual(['c']);
  });

  it('auditoria e da CONTA e nao entra em estoque nenhum', () => {
    const f = fatiarPorEstoque(linhas, ['seco', 'seco#x7k2'], conv);
    const tudo = [...f['seco'].entradas, ...f['seco'].saidas, ...f['seco'].compras];
    expect(tudo.some(r => r.id === 'd')).toBe(false);
  });

  it('a saida da producao vira RECEBIMENTO da finalizacao destinataria', () => {
    const comPonte = [
      linha('e', 'saida', { data: '2026-08-01', destino: 'finalizacao#b3nq', itens: [{ produtoId: 'molho', quantidade: 5 }] }),
      linha('f', 'saida', { data: '2026-08-01', destino: 'finalizacao', itens: [{ produtoId: 'molho', quantidade: 9 }] }),
    ];
    const f = fatiarPorEstoque(comPonte, ['finalizacao', 'finalizacao#b3nq'], conv);
    expect(f['finalizacao#b3nq'].recebimentos.map(r => r.id)).toEqual(['e']);
    expect(f['finalizacao'].recebimentos.map(r => r.id)).toEqual(['f']);
  });

  // A ponte aceitava QUALQUER destino que fosse id de estoque. A baixa de
  // ingrediente da receita grava destino 'producao' (Producao.jsx), que sempre
  // existe, entao ela voltava como recebimento do proprio estoque e anulava a
  // saida: a Administracao mostrava 20 kg onde a operacao mostrava 15.
  it('saida INTERNA de receita nao vira recebimento do proprio estoque', () => {
    const internas = [
      linha('g', 'entrada', { data: '2026-08-01', itens: [{ produtoId: 'file', quantidade: 20 }] }),
      linha('h', 'saida',   { data: '2026-08-02', destino: 'producao', itens: [{ produtoId: 'file', quantidade: 5 }] }),
    ];
    const f = fatiarPorEstoque(internas, ['producao', 'finalizacao'], conv);
    expect(f['producao'].recebimentos).toEqual([]);
    expect(f['producao'].saidas.map(r => r.id)).toEqual(['h']);

    const docs = { produtos: [{ id: 'file', nome: 'File', unidade: 'kg', min: 0, max: 0, ativo: true }] };
    const v = visaoDoEstoque({ id: 'producao', docs, registrosFatiados: f, aplicarMetas: comMetas });
    expect(v.estoque.file).toBe(15);   // 20 entraram, 5 sairam para a receita
  });

  // Com instancias era pior: a saida interna de 'producao#ab12' tem destino
  // 'producao' (a raiz), entao o ingrediente de um restaurante era somado como
  // recebimento no estoque de OUTRO.
  it('saida interna de uma INSTANCIA nao credita a raiz do mesmo tipo', () => {
    const f = fatiarPorEstoque(
      [linha('i', 'producao#ab12:saida', { data: '2026-08-02', destino: 'producao', itens: [{ produtoId: 'file', quantidade: 5 }] })],
      ['producao', 'producao#ab12'], conv);
    expect(f['producao'].recebimentos).toEqual([]);
    expect(f['producao#ab12'].saidas.map(r => r.id)).toEqual(['i']);
  });

  // O Relatorio lia categorias/locais/destinos do estoque ABERTO, nao do que
  // estava sendo VISTO. Com a Producao aberta e o relatorio mostrando o Seco, a
  // tabela iterava PROTEINAS/PRODUZIDOS/DIVERSOS contra produtos do Seco
  // (GRAOS, ENLATADOS...) — intersecao zero, corpo da tabela EM BRANCO, e o
  // relatorio dizia na pratica que nada se moveu no periodo.
  it('a visao carrega os catalogos de apoio DO ESTOQUE VISTO', () => {
    const docs = {
      'seco::categorias': ['GRAOS E FARINACEOS', 'ENLATADOS'],
      'seco::locais': [{ id: 'despensa', nome: 'Despensa' }],
      'seco::destinos': [{ cod: 'D1', label: 'Doacao' }],
      categorias: ['PROTEINAS', 'PRODUZIDOS'],   // catalogo da PRODUCAO
    };
    const f = fatiarPorEstoque([], ['seco'], conv);
    const v = visaoDoEstoque({ id: 'seco', docs, registrosFatiados: f, aplicarMetas: comMetas });
    expect(v.categorias).toEqual(['GRAOS E FARINACEOS', 'ENLATADOS']);
    expect(v.locais[0].nome).toBe('Despensa');
    expect(v.destinos[0].label).toBe('Doacao');
  });

  it('sem documento proprio, cai para o padrao DO TIPO e nao para o do aberto', () => {
    const f = fatiarPorEstoque([], ['seco'], conv);
    const v = visaoDoEstoque({
      id: 'seco',
      docs: { categorias: ['PROTEINAS'] },        // so a Producao tem doc
      registrosFatiados: f,
      padroes: { categorias: ['GRAOS E FARINACEOS'], locais: [], destinos: [] },
      aplicarMetas: comMetas,
    });
    expect(v.categorias).toEqual(['GRAOS E FARINACEOS']);
  });

  it('SALDO separado com CATALOGO compartilhado — o pedido do dono', () => {
    const docs = {
      'seco::produtos': [{ id: 'arroz', nome: 'Arroz', unidade: 'unid', min: 4, max: 12, ativo: true }],
      'seco#x7k2::metas': { arroz: { min: 20, max: 50 } },
    };
    const f = fatiarPorEstoque(linhas, ['seco', 'seco#x7k2'], conv);
    const raiz = visaoDoEstoque({ id: 'seco', docs, registrosFatiados: f, aplicarMetas: comMetas });
    const inst = visaoDoEstoque({ id: 'seco#x7k2', docs, registrosFatiados: f, aplicarMetas: comMetas });

    expect(raiz.estoque.arroz).toBe(100);        // saldos diferentes
    expect(inst.estoque.arroz).toBe(5);          // 7 entraram, 2 sairam
    expect(raiz.produtos[0].nome).toBe('Arroz'); // mesmo cadastro
    expect(inst.produtos[0].nome).toBe('Arroz');
    expect(raiz.produtos[0].min).toBe(4);        // metas diferentes
    expect(inst.produtos[0].min).toBe(20);
  });
});

// Dois defeitos que faziam o numero da Cozinha de Finalizacao dar errado — o
// dono relatou "o consumo e o que sobra esta dando errado" e os dois estavam
// silenciosos: nenhum erro, so numero torto.

describe('CNPJ e telefone (utils/documentos.js)', () => {
  // ⚠️ O CNPJ e a trava contra criar conta nova toda semana para renovar o
  // teste gratis. Se validarCNPJ afrouxar, a trava inteira cai junto.
  it('aceita CNPJ com digito verificador correto, com e sem mascara', () => {
    expect(validarCNPJ('11222333000181')).toBe(true);
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true);
  });

  it('recusa digito verificador errado', () => {
    expect(validarCNPJ('11222333000182')).toBe(false);
    expect(validarCNPJ('11222333000191')).toBe(false);
  });

  // ⚠️ 00000000000000 e 11111111111111 PASSAM no modulo 11. Sem a checagem de
  // digitos repetidos, catorze vezes o mesmo numero viraria CNPJ valido.
  it('recusa todos os digitos iguais, que passam no modulo 11', () => {
    expect(validarCNPJ('00000000000000')).toBe(false);
    expect(validarCNPJ('11111111111111')).toBe(false);
    expect(validarCNPJ('99999999999999')).toBe(false);
  });

  it('recusa tamanho errado, vazio e lixo', () => {
    expect(validarCNPJ('1122233300018')).toBe(false);
    expect(validarCNPJ('112223330001812')).toBe(false);
    expect(validarCNPJ('')).toBe(false);
    expect(validarCNPJ(null)).toBe(false);
    expect(validarCNPJ('abcdefghijklmn')).toBe(false);
  });

  it('mascara o CNPJ progressivamente enquanto digita', () => {
    expect(formatarCNPJ('11')).toBe('11');
    expect(formatarCNPJ('11222')).toBe('11.222');
    expect(formatarCNPJ('11222333')).toBe('11.222.333');
    expect(formatarCNPJ('112223330001')).toBe('11.222.333/0001');
    expect(formatarCNPJ('11222333000181')).toBe('11.222.333/0001-81');
    // nao deixa passar de 14 digitos
    expect(formatarCNPJ('112223330001819999')).toBe('11.222.333/0001-81');
  });

  it('telefone aceita fixo (10) e celular (11) com DDD valido', () => {
    expect(validarTelefone('8133334444')).toBe(true);
    expect(validarTelefone('81998184489')).toBe(true);
    expect(validarTelefone('(81) 99818-4489')).toBe(true);
  });

  // ⚠️ E por este numero que o dono ativa a assinatura (Pix + WhatsApp).
  // DDD invalido ou celular sem o 9 significa nao conseguir falar com o cliente.
  it('telefone recusa DDD invalido, celular sem o 9 e tamanho errado', () => {
    expect(validarTelefone('0133334444')).toBe(false);
    expect(validarTelefone('81888184489')).toBe(false);
    expect(validarTelefone('813333444')).toBe(false);
    expect(validarTelefone('')).toBe(false);
  });

  it('mascara o telefone conforme fixo ou celular', () => {
    expect(formatarTelefone('81')).toBe('(81');
    expect(formatarTelefone('8133334444')).toBe('(81) 3333-4444');
    expect(formatarTelefone('81998184489')).toBe('(81) 99818-4489');
  });

  it('soDigitos limpa qualquer formatacao', () => {
    expect(soDigitos('11.222.333/0001-81')).toBe('11222333000181');
    expect(soDigitos('(81) 99818-4489')).toBe('81998184489');
    expect(soDigitos(null)).toBe('');
  });
});

describe('Mensagens de autenticação em português', () => {
  // ⚠️ A ORDEM DAS REGRAS E O QUE FAZ ISTO FUNCIONAR. "New password should be
  // different" CONTEM a palavra "password", entao a regra generica de senha a
  // transformaria em "Senha invalida (minimo 8 caracteres)" — mensagem errada,
  // que manda a pessoa consertar o que ja estava certo.
  it('a senha repetida não vira "senha inválida"', () => {
    const r = traduzErroAuth('New password should be different from the old password.');
    expect(r).toBe('A nova senha precisa ser diferente da atual.');
  });

  it('senha curta e senha fraca têm textos próprios', () => {
    expect(traduzErroAuth('Password should be at least 8 characters')).toMatch(/curta/i);
    expect(traduzErroAuth('Weak password: this is a top-10 password')).toMatch(/adivinhar/i);
  });

  // ⚠️ O NUMERO IMPORTA para quem esta esperando: "aguarde um momento" nao diz
  // se sao 5 segundos ou 5 minutos.
  it('a espera diz quantos segundos', () => {
    expect(traduzErroAuth('For security purposes, you can only request this after 47 seconds'))
      .toBe('Aguarde 47 segundos antes de pedir de novo.');
  });

  it('link velho é explicado, não mostrado cru', () => {
    expect(traduzErroAuth('Auth session missing!')).toMatch(/Esqueci minha senha/);
    expect(traduzErroAuth('Token has expired or is invalid')).toMatch(/expirou|nao e valido|não é válido/i);
  });

  // ⚠️ Mensagem desconhecida volta CRUA. Texto em ingles e feio, mas da para
  // pesquisar e mandar ao suporte; "erro inesperado" apagaria a unica pista.
  it('o que não conhecemos volta como veio', () => {
    expect(traduzErroAuth('Something entirely new happened')).toBe('Something entirely new happened');
    expect(traduzErroAuth('')).toBe('Erro inesperado.');
  });
});

describe('configurarSistema — a chave da Administração', () => {
  it('aparece na matriz do plano Etiquetas, com o texto daquele plano', () => {
    const caps = capacidadesDoProduto(true);
    const cap = caps.find(c => c.id === 'configurarSistema');
    expect(cap).toBeDefined();
    expect(cap.label).toBe('Abrir a Administração');
    // o texto precisa dizer o que ela NÃO dá, senão o dono acha que delegou tudo
    expect(cap.desc).toMatch(/NÃO dá acesso/);
  });

  it('a diretoria sempre pode, sem depender da matriz', () => {
    expect(pode({ cargo: 'diretoria', usuarioId: 'u1' }, {}, 'configurarSistema')).toBe(true);
  });

  // ⚠️ ISTO É UMA MUDANÇA DE COMPORTAMENTO VISÍVEL: no plano Etiquetas a
  // gerência NÃO abria a Administração (a trava era por cargo) e agora abre,
  // porque o padrão de fábrica da gerência já dizia `true`. O dono pode
  // desligar na matriz — o teste existe para que isso seja uma decisão
  // registrada, e não uma surpresa descoberta pelo cliente.
  it('a gerência recebe por padrão de fábrica', () => {
    expect(PERMISSOES_PADRAO.gerencia.configurarSistema).toBe(true);
    expect(pode({ cargo: 'gerencia', usuarioId: 'u2' }, {}, 'configurarSistema')).toBe(true);
  });

  it('a cozinha não recebe, e o dono pode ligar item a item', () => {
    expect(PERMISSOES_PADRAO.cozinha.configurarSistema).toBe(false);
    expect(pode({ cargo: 'cozinha', usuarioId: 'u3' }, {}, 'configurarSistema')).toBe(false);
    const liberada = { porConta: { u3: { configurarSistema: true } } };
    expect(pode({ cargo: 'cozinha', usuarioId: 'u3' }, liberada, 'configurarSistema')).toBe(true);
  });
});
