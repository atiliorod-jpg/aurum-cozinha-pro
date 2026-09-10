// =====================================================================
//  Testes de ETIQUETA — montagem dos campos, TSPL, prévia e impressora
//
//  ⚠️ Este arquivo nasceu de uma divisão: até 09/09/2026 os 465 testes viviam
//  num `regras.test.js` de 4.094 linhas, e achar ou acrescentar teste ali já
//  custava caro. A divisão é POR ASSUNTO, não por arquivo de origem — um teste
//  de etiqueta que atravessa `tspl.js`, `etiquetas.js` e `impressoraBLE.js`
//  continua junto dos seus, que é como se procura.
//
//  Nada de conteúdo mudou na divisão: os mesmos 465 testes, no mesmo texto.
// =====================================================================

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { ETIQUETA_CONFIG_PADRAO, montarCamposEtiqueta, montarPayloadQR, QR_MAX_CARACTERES, gerarLoteId, lerLoteIdDoQR, statusEtiqueta, podarEtiquetas, MAX_ETIQUETAS_GUARDADAS, totaisImpressos, limitarDias, avisoDePrazo, DIAS_VALIDADE_MAX, diasIniciaisDaEtiqueta, usandoSugestaoDeAbertura, DIAS_SUGERIDOS_ABERTURA, lembrarArmazenamentos, armazenamentoInicial } from '../etiquetas';

import { estabelecimentoDe } from '../instancias';
import { planoDeEnvio, escolherCaracteristica, escolherConhecido, pareceImpressora, caminhosDeImpressao, ehCelular } from '../../lib/impressoraBLE';
import { faltasDoPrimeiroUso } from '../primeiroUso';
import { marcaDeUpgrade } from '../produto';
import { prazoDe, temAlgumPrazo, comEspelhoDePrazos, listarArmazenamentos } from '../armazenamento';
import { etiquetaTSPL, loteTSPL, paraBytesLatin1, cortarParaLargura, PONTOS_POR_MM, medirEtiqueta, quebrarEmLinhas, nivelDeDesenho } from '../tspl';
import { interpretarTSPL, larguraDoTexto, alturaDoTexto } from '../tsplPreview';
import { BIBLIOTECA_ETIQUETAS, CATEGORIAS_BIBLIOTECA, buscarNaBiblioteca, agruparPorCategoria } from '../../data/bibliotecaEtiquetas';

const P = (id, extra = {}) => ({ id, nome: id, unidade: 'kg', ativo: true, min: 0, max: 0, estoqueInicial: 0, ...extra });

describe('etiquetas — montagem dos campos', () => {
  it('calcula a validade pelos prazos do produto conforme o armazenamento', () => {
    const campos = montarCamposEtiqueta({
      produto: P('charque', { valCongelado: 10, valResfriado: 3 }),
      dataFabricacao: '2026-06-10', armazenamento: 'congelado',
      restauranteNome: 'Polo', responsavel: 'Ceará',
    });
    expect(campos.validade).toBe('2026-06-20');
    expect(campos.validadeFmt).toBe('20/06/2026');
    expect(campos.dataFabricacaoFmt).toBe('10/06/2026');
    expect(campos.rotuloData).toBe('MANIPULAÇÃO');
  });

  it('hora da impressão entra junto das datas de manipulação e validade', () => {
    const campos = montarCamposEtiqueta({
      nome: 'Patinho moído', dataFabricacao: '2026-06-10', diasValidade: 2, hora: '12:59',
    });
    expect(campos.dataFabricacaoFmt).toBe('10/06/2026 - 12:59');
    expect(campos.validadeFmt).toBe('12/06/2026 - 12:59');
  });

  it('validade pronta (de registro real) tem prioridade sobre o cálculo', () => {
    const campos = montarCamposEtiqueta({
      produto: P('charque', { valCongelado: 10 }),
      dataFabricacao: '2026-06-10', armazenamento: 'congelado',
      validade: '2026-06-15', // veio da entrada registrada
    });
    expect(campos.validade).toBe('2026-06-15');
  });

  it('avulsa usa diasValidade e o rótulo de abertura; sem prazo não gera validade', () => {
    const aberta = montarCamposEtiqueta({
      nome: 'Leite aberto', tipoData: 'abertura',
      dataFabricacao: '2026-06-10', diasValidade: 5,
    });
    expect(aberta.rotuloData).toBe('ABERTURA');
    expect(aberta.validade).toBe('2026-06-15');

    const semPrazo = montarCamposEtiqueta({ nome: 'Tempero da casa', dataFabricacao: '2026-06-10', diasValidade: 0 });
    expect(semPrazo.validade).toBeNull();
    expect(semPrazo.validadeFmt).toBe('');
  });

  it('payload do QR é uma ficha legível linha a linha (Chave: valor)', () => {
    const campos = montarCamposEtiqueta({
      nome: 'Molho misto', dataFabricacao: '2026-06-10', diasValidade: 4, restauranteNome: 'Polo', responsavel: 'Ceará',
      hora: '10:52', armazenamento: 'congelado',
    });
    const qr = montarPayloadQR(campos);
    expect(qr).toContain('Prod: Molho misto');
    expect(qr).toContain('Manip: 10/06/2026');
    expect(qr).toContain('Val: 14/06/2026');
    // 'Rest:' saiu do QR para abrir espaço ao id de lote — o nome do
    // restaurante continua impresso em destaque na etiqueta impressa.
    expect(qr).not.toContain('Rest:');
    expect(qr.split('\n').length).toBe(4); // só as linhas com valor entram
  });

  it('QR do pior caso ainda imprime legível numa térmica de 203 DPI', async () => {
    // Este é o teste que importa de verdade: não basta o conteúdo estar certo,
    // o código PRECISA sair com módulo grande o bastante pro leitor pegar.
    // Térmica de 203 DPI = 8 pontos/mm; o QR sai com ~21mm; cada módulo precisa
    // de ~4 pontos pra ter borda limpa → no máximo 41 módulos (versão 6).
    // Texto a mais empurra a versão pra cima e o QR volta a não escanear.
    const { default: QRCode } = await import('qrcode');
    const campos = montarCamposEtiqueta({
      nome: 'EMPANADO DE FILÉ MIGNON PORCIONADO (PORÇÃO)', // pior caso realista
      dataFabricacao: '2026-06-10', diasValidade: 90, hora: '10:52',
      armazenamento: 'congelado', restauranteNome: 'Restaurante Muito Longo Ltda',
      responsavel: 'Joana da Silva Sobrinho', marca: 'Friboi', sif: '1234',
      valOriginal: '2026-12-01', medida: '1 kg',
    });
    const qr = montarPayloadQR(campos);
    expect(qr).not.toMatch(/[À-ÿ]/);       // sem acento (acento = 2 bytes no QR)
    expect(qr).not.toMatch(/\d{2}:\d{2}/); // datas sem hora
    expect(qr.length).toBeLessThanOrEqual(QR_MAX_CARACTERES);

    const { version, modules } = QRCode.create(qr, { errorCorrectionLevel: 'M' });
    expect(version).toBeLessThanOrEqual(6);
    expect(modules.size).toBeLessThanOrEqual(41);
    const pontosPorModulo = (21 / modules.size) * (203 / 25.4);
    expect(pontosPorModulo).toBeGreaterThanOrEqual(4);
  });
});

describe('armazenamento configurável (utils/armazenamento.js)', () => {
  // ⚠️ O grupo mais importante deste arquivo para a etiqueta: se `prazoDe`
  // errar, sai etiqueta com validade errada — ou sem validade — colada num
  // pote de comida. Cada formato de produto que existe no banco hoje tem caso.
  it('produto ANTIGO (só valCongelado/valResfriado) continua com os prazos', () => {
    const p = { id: 'picanha', valCongelado: 30, valResfriado: 3 };
    expect(prazoDe(p, 'congelado')).toBe(30);
    expect(prazoDe(p, 'resfriado')).toBe(3);
  });

  it('produto NOVO (prazos{}) usa o formato novo, inclusive estados criados pelo restaurante', () => {
    const p = { id: 'alface', prazos: { resfriado: 5, ambiente: 2 } };
    expect(prazoDe(p, 'resfriado')).toBe(5);
    expect(prazoDe(p, 'ambiente')).toBe(2);
  });

  it('com os DOIS formatos divergindo, prazos{} manda', () => {
    const p = { valCongelado: 30, valResfriado: 3, prazos: { congelado: 45 } };
    expect(prazoDe(p, 'congelado')).toBe(45);
    // o estado que prazos{} não cita continua caindo no campo antigo
    expect(prazoDe(p, 'resfriado')).toBe(3);
  });

  it('estado sem prazo devolve 0, e 0 significa "etiqueta sem vencimento"', () => {
    expect(prazoDe({ valCongelado: 30 }, 'ambiente')).toBe(0);
    expect(prazoDe(null, 'congelado')).toBe(0);
    expect(prazoDe(undefined, undefined)).toBe(0);
  });

  it('temAlgumPrazo distingue item cadastrado pela metade de item completo', () => {
    expect(temAlgumPrazo({ nome: 'Alface' })).toBe(false);
    expect(temAlgumPrazo({ prazos: { ambiente: 0 } })).toBe(false);
    expect(temAlgumPrazo({ valCongelado: 30 })).toBe(true);
    expect(temAlgumPrazo({ prazos: { ambiente: 2 } })).toBe(true);
  });

  // ⚠️ Sem o espelho, um tablet com cache antigo imprime validade ZERADA em
  // silêncio — o formato antigo é o único que ele sabe ler.
  it('ao salvar, os campos antigos são espelhados a partir de prazos{}', () => {
    const salvo = comEspelhoDePrazos({ id: 'x', nome: 'X' }, { congelado: 20, resfriado: 4, ambiente: 90 });
    expect(salvo.prazos).toEqual({ congelado: 20, resfriado: 4, ambiente: 90 });
    expect(salvo.valCongelado).toBe(20);
    expect(salvo.valResfriado).toBe(4);
  });

  it('espelho zera os campos antigos quando o estado deixa de ter prazo', () => {
    const salvo = comEspelhoDePrazos({ valCongelado: 30, valResfriado: 3 }, { ambiente: 90 });
    expect(salvo.valCongelado).toBe(0);
    expect(salvo.valResfriado).toBe(0);
    expect(prazoDe(salvo, 'ambiente')).toBe(90);
  });

  it('congelado e resfriado são repostos mesmo em prefs que já foi salva sem eles', () => {
    const lista = listarArmazenamentos({ armazenamentos: [{ id: 'ambiente', nome: 'Ambiente' }] });
    expect(lista.map(a => a.id).sort()).toEqual(['ambiente', 'congelado', 'refrigerado', 'resfriado']);
    // e voltam marcados como fixos, que é o que esconde o botão de remover
    expect(lista.find(a => a.id === 'congelado').fixo).toBe(true);
  });

  it('o restaurante pode renomear o fixo e a renomeação sobrevive', () => {
    const lista = listarArmazenamentos({
      armazenamentos: [{ id: 'congelado', nome: 'Freezer -18', faixa: '-18°C', fixo: true }],
    });
    expect(lista.find(a => a.id === 'congelado').nome).toBe('Freezer -18');
  });

  it('prefs vazia devolve os quatro estados de partida', () => {
    const esperado = ['congelado', 'refrigerado', 'resfriado', 'ambiente'];
    expect(listarArmazenamentos({}).map(a => a.id)).toEqual(esperado);
    expect(listarArmazenamentos(undefined).map(a => a.id)).toEqual(esperado);
  });

  // ⚠️ Resfriado e refrigerado sao faixas DIFERENTES e precisam coexistir:
  // 0-4°C para carne e preparado, 4-10°C para hortifruti e laticinio. Tê-los
  // fundidos num só obriga a etiquetar alface com a temperatura da picanha.
  it('resfriado e refrigerado existem como estados separados, com faixas próprias', () => {
    const lista = listarArmazenamentos({});
    const res = lista.find(a => a.id === 'resfriado');
    const ref = lista.find(a => a.id === 'refrigerado');
    // ⚠️ REFRIGERADO é o mais frio dos dois — eu tinha invertido e o dono corrigiu.
    expect(ref.faixa).toBe('0°C a 6°C');
    expect(res.faixa).toBe('6°C a 10°C');
  });
});

describe('etiqueta com armazenamento configurável', () => {
  it('a faixa de temperatura sai junto do nome quando o chamador a resolve', () => {
    const c = montarCamposEtiqueta({
      nome: 'Molho', dataFabricacao: '2026-08-24', armazenamento: 'ambiente',
      armazenamentoNome: 'Temperatura ambiente', armazenamentoFaixa: 'até 25°C',
      produto: { prazos: { ambiente: 90 } },
    });
    expect(c.armazenamentoLabel).toBe('TEMPERATURA AMBIENTE');
    expect(c.armazenamentoFaixa).toBe('até 25°C');
    expect(c.validade).toBe('2026-11-22'); // 24/08 + 90 dias
  });

  // Compatibilidade: chamada antiga (sem nome/faixa) não pode perder o rótulo.
  it('sem nome resolvido, congelado/resfriado ainda saem rotulados', () => {
    const c = montarCamposEtiqueta({ nome: 'Picanha', dataFabricacao: '2026-08-24', armazenamento: 'congelado' });
    expect(c.armazenamentoLabel).toBe('CONGELADO');
    expect(c.armazenamentoFaixa).toBe('');
  });

  it('prazo do produto continua vindo do formato antigo na montagem da etiqueta', () => {
    const c = montarCamposEtiqueta({
      nome: 'Picanha', dataFabricacao: '2026-08-24', armazenamento: 'congelado',
      produto: { valCongelado: 30, valResfriado: 3 },
    });
    expect(c.validade).toBe('2026-09-23'); // 24/08 + 30 dias
  });
});

describe('biblioteca de itens prontos', () => {
  it('não tem id repetido — id repetido faria um item sobrescrever o outro', () => {
    const ids = BIBLIOTECA_ETIQUETAS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toda categoria usada existe na ordem de exibição', () => {
    const fora = BIBLIOTECA_ETIQUETAS.filter(i => !CATEGORIAS_BIBLIOTECA.includes(i.categoria));
    expect(fora.map(i => i.nome)).toEqual([]);
  });

  it('busca ignora acento — o cozinheiro digita "acem"', () => {
    expect(buscarNaBiblioteca('acem').map(i => i.nome)).toContain('Acém');
    expect(buscarNaBiblioteca('PICANHA').length).toBeGreaterThan(1); // inteira e porção
  });

  // ⚠️ Item de despensa segue a validade do FABRICANTE: o que a cozinha
  // controla é quando abriu. Prazo inventado ali sairia impresso como data
  // de vencimento numa embalagem que não vence assim.
  it('sal, óleo e tempero saem sem prazo e com data de ABERTURA', () => {
    ['sal', 'azeite', 'vinagre', 'shoyu'].forEach(id => {
      const item = BIBLIOTECA_ETIQUETAS.find(i => i.id === id);
      expect(item, id).toBeTruthy();
      expect(item.tipoData, id).toBe('abertura');
      expect(temAlgumPrazo(item), id).toBe(false);
    });
  });

  // ⚠️ A DISTINÇÃO QUE ESTE GRUPO EXISTE PARA TRAVAR: congelado de carne CRUA
  // não é o mesmo prazo de congelado de PREPARADO da casa. A primeira versão
  // da biblioteca dava 90 dias para tudo, e isso manda picanha boa para o lixo
  // em 3 meses. Se alguém uniformizar os dois de novo, estes testes quebram.
  it('carne crua porcionada congela por MESES, não por 90 dias', () => {
    const picanha = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'picanha_porcao');
    expect(prazoDe(picanha, 'congelado')).toBe(180);   // 6 meses
    expect(prazoDe(picanha, 'refrigerado')).toBe(3);   // frio de trabalho 0-6°C
    const frango = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'peito_de_frango_porcao');
    expect(prazoDe(frango, 'congelado')).toBe(180);
  });

  it('preparado da casa fica no teto de 90 dias congelado', () => {
    const molho = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'molho_de_tomate_da_casa');
    expect(prazoDe(molho, 'congelado')).toBe(90);
    expect(prazoDe(molho, 'refrigerado')).toBe(3);
  });

  // Moída e empanado cru têm mais superfície exposta e oxidam antes.
  it('carne moída dura menos que a peça inteira', () => {
    const moida = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'carne_moida');
    const peca = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'picanha_inteira');
    expect(prazoDe(moida, 'congelado')).toBeLessThan(prazoDe(peca, 'congelado'));
    expect(prazoDe(moida, 'refrigerado')).toBe(2);
  });

  // Pescado gorduroso rancifica antes do magro — não podem ter o mesmo prazo.
  it('pescado gorduroso congela menos que o magro', () => {
    const salmao = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'salmao_em_posta');
    const tilapia = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'file_de_tilapia');
    expect(prazoDe(salmao, 'congelado')).toBeLessThan(prazoDe(tilapia, 'congelado'));
  });

  // ⚠️ Resfriado (0–4°C) e refrigerado (4–10°C) são faixas diferentes. Alface
  // na faixa da picanha e picanha na faixa da alface estão os dois errados.
  // ⚠️ REFRIGERADO (0–6°C) é o frio de TRABALHO — carne, pescado, laticínio,
  // frios e preparado. RESFRIADO (6–10°C) é a faixa mais alta, para hortifrúti
  // inteiro que sofre no frio forte (tomate estraga a textura abaixo de ~7°C).
  it('proteína e laticínio no frio de trabalho; hortifrúti sensível na faixa alta', () => {
    ['picanha_porcao', 'queijo_mussarela', 'alface'].forEach(id => {
      const i = BIBLIOTECA_ETIQUETAS.find(x => x.id === id);
      expect(prazoDe(i, 'refrigerado'), id).toBeGreaterThan(0);
    });
    const tomate = BIBLIOTECA_ETIQUETAS.find(i => i.id === 'tomate');
    expect(tomate.armazenamentoSugerido).toBe('resfriado');
    expect(prazoDe(tomate, 'resfriado')).toBeGreaterThan(0);
  });

  // ⚠️ Sem isto o azeite saía com "CONGELADO" impresso: a impressão pegava o
  // primeiro armazenamento da lista quando o item não dizia o dele.
  it('todo item diz em qual armazenamento fica', () => {
    const sem = BIBLIOTECA_ETIQUETAS.filter(i => !i.armazenamentoSugerido);
    expect(sem.map(i => i.nome)).toEqual([]);
  });

  // ⚠️ Item que sugere um armazenamento SEM prazo naquele estado imprime
  // etiqueta SEM data de vencimento — em silêncio. Aconteceu de verdade ao
  // trocar as faixas de resfriado/refrigerado: o tomate passou a sugerir
  // 'resfriado' e o prazo dele ficou em 'refrigerado'.
  it('todo item com prazo tem prazo NO estado que ele sugere', () => {
    const ruins = BIBLIOTECA_ETIQUETAS
      .filter(i => Object.values(i.prazos || {}).some(v => v > 0))
      .filter(i => !(Number(i.prazos[i.armazenamentoSugerido]) > 0))
      .map(i => `${i.nome} sugere ${i.armazenamentoSugerido} mas o prazo está em ${Object.keys(i.prazos).join('/')}`);
    expect(ruins).toEqual([]);
  });

  // Refrigerado (0–6°C) é o frio de TRABALHO; resfriado (6–10°C) é a faixa
  // mais alta. Proteína e laticínio no primeiro, hortifrúti sensível no outro.
  it('proteína e laticínio ficam no frio de trabalho (refrigerado)', () => {
    ['picanha_porcao', 'file_de_tilapia', 'queijo_mussarela', 'leite_aberto'].forEach(id => {
      const i = BIBLIOTECA_ETIQUETAS.find(x => x.id === id);
      expect(prazoDe(i, 'refrigerado'), id).toBeGreaterThan(0);
    });
  });

  it('agrupa na ordem definida, e categoria criada pelo cliente vai para o fim', () => {
    const grupos = agruparPorCategoria([
      { nome: 'X', categoria: 'VEGANOS' },
      { nome: 'Y', categoria: 'AVES' },
      { nome: 'Z', categoria: 'BOVINOS' },
    ]);
    expect(grupos.map(([c]) => c)).toEqual(['BOVINOS', 'AVES', 'VEGANOS']);
  });
});

describe('etiqueta com id de lote (leitura por QR)', () => {
  it('id de lote entra no QR e volta na leitura', () => {
    const campos = montarCamposEtiqueta({
      nome: 'Molho da casa', dataFabricacao: '2026-08-05', diasValidade: 5,
      responsavel: 'Joana', loteId: 'k3f9x2',
    });
    const qr = montarPayloadQR(campos);
    expect(qr).toContain('L: k3f9x2');
    expect(lerLoteIdDoQR(qr)).toBe('k3f9x2');
  });

  it('QR sem id de lote (etiqueta antiga) não quebra a leitura', () => {
    const qr = montarPayloadQR(montarCamposEtiqueta({ nome: 'Molho', dataFabricacao: '2026-08-05', diasValidade: 5 }));
    expect(lerLoteIdDoQR(qr)).toBeNull();
  });

  it('texto de QR alheio não é confundido com etiqueta nossa', () => {
    expect(lerLoteIdDoQR('https://exemplo.com')).toBeNull();
    expect(lerLoteIdDoQR('')).toBeNull();
  });

  it('ids de lote não repetem nem em lote grande', () => {
    // Regressão: a 1ª versão colidia (371 únicos em 400) e a leitura contaria
    // o pote errado. 2000 é bem acima de qualquer impressão real.
    const ids = Array.from({ length: 2000 }, () => gerarLoteId());
    expect(new Set(ids).size).toBe(2000);
  });

  it('COM id de lote o QR continua na versão 6 (limite de legibilidade)', async () => {
    // O id só pôde entrar porque o nome do restaurante saiu. Este teste trava
    // isso: se alguém devolver o Rest: ao payload, o QR passa de 41 módulos e
    // volta a não escanear na térmica.
    const { default: QRCode } = await import('qrcode');
    const campos = montarCamposEtiqueta({
      nome: 'EMPANADO DE FILÉ MIGNON PORCIONADO (PORÇÃO)',
      dataFabricacao: '2026-08-05', diasValidade: 90, hora: '10:52',
      responsavel: 'Joana da Silva Sobrinho', restauranteNome: 'Restaurante Muito Longo Ltda',
      loteId: 'k3f9x2',
    });
    const qr = montarPayloadQR(campos);
    expect(qr).not.toContain('Rest:');
    expect(qr.length).toBeLessThanOrEqual(QR_MAX_CARACTERES);
    const { version, modules } = QRCode.create(qr, { errorCorrectionLevel: 'M' });
    expect(version).toBeLessThanOrEqual(6);
    expect((22 / modules.size) * (203 / 25.4)).toBeGreaterThanOrEqual(4);
  });
});

describe('ciclo de vida da etiqueta', () => {
  const hj = '2026-08-05';
  it('vencida é derivada da data, não precisa ser gravada', () => {
    expect(statusEtiqueta({ validade: '2026-08-01' }, hj)).toBe('vencida');
    expect(statusEtiqueta({ validade: '2026-08-10' }, hj)).toBe('valida');
    expect(statusEtiqueta({ validade: null }, hj)).toBe('valida');
  });

  it('consumida/descartada têm prioridade sobre o vencimento', () => {
    expect(statusEtiqueta({ validade: '2026-08-01', status: 'consumida' }, hj)).toBe('consumida');
    expect(statusEtiqueta({ validade: '2026-08-01', status: 'descartada' }, hj)).toBe('descartada');
  });

  it('poda mantém o que ainda pode estar na prateleira', () => {
    const lista = [
      { id: 'a', validade: '2026-09-01', impressoEm: '2026-01-01' },   // válida, antiga: FICA
      { id: 'b', validade: '2026-08-01', impressoEm: '2026-01-01' },   // venceu há 4 dias: FICA
      { id: 'c', status: 'consumida', impressoEm: '2026-08-01' },      // encerrada recente: FICA
      { id: 'd', status: 'consumida', impressoEm: '2025-01-01' },      // encerrada antiga: SAI
    ];
    const ids = podarEtiquetas(lista, hj).map(e => e.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('vencida velha SAI — senão o catálogo cresce para sempre', () => {
    // Regressão: a 1ª versão devolvia true para toda vencida, então nada era
    // podado de fato e o documento crescia sem limite até estourar a cota do
    // localStorage (que falha em silêncio e derruba o modo offline inteiro).
    const lista = [
      { id: 'recem', validade: '2026-07-20', impressoEm: '2026-07-01' }, // venceu há 16d: FICA
      { id: 'velha', validade: '2026-01-10', impressoEm: '2026-01-01' }, // venceu há 7 meses: SAI
    ];
    expect(podarEtiquetas(lista, hj).map(e => e.id)).toEqual(['recem']);
  });

  it('teto de segurança limita o total guardado', () => {
    const muitas = Array.from({ length: MAX_ETIQUETAS_GUARDADAS + 500 }, (_, i) => ({
      id: `e${i}`, validade: '2026-12-01', impressoEm: '2026-08-01',
    }));
    expect(podarEtiquetas(muitas, hj).length).toBe(MAX_ETIQUETAS_GUARDADAS);
  });
});

describe('nome do estabelecimento na etiqueta — opcional, com queda', () => {
  it('usa o nome do ESTOQUE quando o dono preencheu', () => {
    expect(estabelecimentoDe({ estabelecimento: 'Restaurante Y' }, 'Conta Matriz')).toBe('Restaurante Y');
  });

  it('cai para o nome da CONTA quando o estoque nao tem — quem tem uma casa so nao preenche nada', () => {
    expect(estabelecimentoDe({ estabelecimento: '' }, 'Restaurante X')).toBe('Restaurante X');
    expect(estabelecimentoDe({}, 'Restaurante X')).toBe('Restaurante X');
    expect(estabelecimentoDe(null, 'Restaurante X')).toBe('Restaurante X');
  });

  it('espaco em branco nao conta como nome preenchido', () => {
    expect(estabelecimentoDe({ estabelecimento: '   ' }, 'Restaurante X')).toBe('Restaurante X');
  });

  it('sem nenhum dos dois, devolve vazio em vez de "undefined" impresso', () => {
    expect(estabelecimentoDe({}, '')).toBe('');
    expect(estabelecimentoDe(undefined, undefined)).toBe('');
  });
});

describe('validade que passa da do fornecedor', () => {
  // ⚠️ O erro que este campo existe para pegar: porcionar um produto cuja
  // embalagem vence ANTES do prazo da casa faz a etiqueta imprimir validade
  // maior que a do fabricante. Grave e invisivel — ninguem confere de cabeca.
  const monta = (valOriginal, dias) => montarCamposEtiqueta({
    nome: 'Frango', dataFabricacao: '2026-08-29', armazenamento: 'congelado',
    diasValidade: dias, valOriginal,
  });

  it('avisa quando o prazo da casa ultrapassa a validade do fornecedor', () => {
    const c = monta('2026-10-01', 180);        // 29/08 + 180d = muito depois
    expect(c.validade > '2026-10-01').toBe(true);
    expect(c.passaDoFornecedor).toBe(true);
  });

  it('não avisa quando cabe dentro da validade do fornecedor', () => {
    expect(monta('2027-12-31', 180).passaDoFornecedor).toBe(false);
  });

  // Mesma data não é estouro: vence junto, o que é legítimo.
  it('não avisa quando as duas datas são iguais', () => {
    const c = monta('2026-09-28', 30);          // 29/08 + 30d = 28/09
    expect(c.validade).toBe('2026-09-28');
    expect(c.passaDoFornecedor).toBe(false);
  });

  it('sem val. original preenchida, nunca avisa', () => {
    expect(monta(null, 180).passaDoFornecedor).toBe(false);
    expect(monta('', 180).passaDoFornecedor).toBe(false);
  });

  // Sem prazo não há data calculada para comparar.
  it('sem prazo em dias, nunca avisa', () => {
    expect(monta('2026-09-01', 0).passaDoFornecedor).toBe(false);
  });

  // ⚠️ Desligado por padrão: é mais um campo para a equipe preencher a cada
  // impressão, e o dono decidiu que quem precisa liga em Configurações.
  it('Val. original nasce DESLIGADA na configuração padrão', () => {
    expect(ETIQUETA_CONFIG_PADRAO.campos.valOriginal).toBe(false);
    // as demais continuam ligadas
    expect(ETIQUETA_CONFIG_PADRAO.campos.validade).toBe(true);
    expect(ETIQUETA_CONFIG_PADRAO.campos.armazenamento).toBe(true);
  });
});

describe('Qual caminho de impressão aparece em cada aparelho', () => {
  // `navigator` e somente-leitura no ambiente de teste; trocar precisa passar
  // por defineProperty.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const fingir = (nav) =>
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  afterEach(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); });

  // ⚠️ A REGRA E CONTRAINTUITIVA: o botao que SOME no celular e justamente o
  // que a pessoa conhece. No Android a janela de impressao precisa de um app
  // de terceiro no meio e entrega etiqueta pior — oferecer os dois so convida
  // para o caminho ruim.
  it('celular com Bluetooth vê só a impressão direta', () => {
    fingir({ bluetooth: {}, userAgentData: { mobile: true }, userAgent: '' });
    expect(caminhosDeImpressao()).toEqual({ direto: true, dialogo: false, semBluetooth: false });
  });

  it('iPhone vê só a janela de impressão, que é a única saída que resta', () => {
    fingir({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari', maxTouchPoints: 5 });
    expect(caminhosDeImpressao()).toEqual({ direto: false, dialogo: true, semBluetooth: true });
  });

  // Navegador dentro do WhatsApp/Instagram: e celular e nao tem bluetooth.
  it('navegador embutido em outro app cai no mesmo caso do iPhone', () => {
    fingir({ userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit', maxTouchPoints: 5 });
    expect(caminhosDeImpressao()).toEqual({ direto: false, dialogo: true, semBluetooth: true });
  });

  // ⚠️ O COMPUTADOR NAO VE O BOTAO DE BLUETOOTH, mesmo tendo Bluetooth. A fila
  // do Windows manda a etiqueta como IMAGEM, com a fonte da tela, e sai com
  // traco mais cheio que a fonte interna da impressora — comparado lado a lado
  // no papel. Dois botoes ali so fazem escolher errado no meio do servico.
  it('no computador só a janela de impressão aparece', () => {
    fingir({ bluetooth: {}, userAgentData: { mobile: false }, userAgent: 'Windows NT 10.0', maxTouchPoints: 0 });
    // ⚠️ `semBluetooth: false` no computador mesmo sem botao direto: o aviso
    // "abra no Chrome" ali seria MENTIRA — o Bluetooth esta desligado de
    // proposito, e a pessoa iria procurar defeito onde nao tem.
    expect(caminhosDeImpressao()).toEqual({ direto: false, dialogo: true, semBluetooth: false });
  });

  // ⚠️ iPad moderno se anuncia como Mac. Sem o teste de toque ele seria tratado
  // como computador e ganharia um botao de impressao direta que nunca funciona.
  it('iPad fingindo ser Mac ainda é celular', () => {
    fingir({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', maxTouchPoints: 5 });
    expect(ehCelular()).toBe(true);
  });
});

describe('TSPL — a etiqueta na linguagem da impressora', () => {
  const SEP = String.fromCharCode(13) + String.fromCharCode(10);
  const config = { larguraMm: 60, alturaMm: 50, campos: {} };
  const campos = {
    nome: 'Picanha', medida: '150 g',
    rotuloData: 'MANIPULACAO', dataFabricacaoFmt: '29/08/2026 - 10:00',
    validadeFmt: '25/02/2027 - 10:00', responsavel: 'Maria',
    armazenamentoLabel: 'CONGELADO', armazenamentoFaixa: '-18°C',
    restauranteNome: 'Restaurante Teste',
  };

  it('abre com o tamanho do rolo e fecha mandando imprimir', () => {
    const t = etiquetaTSPL(campos, config);
    expect(t).toContain('SIZE 60 mm,50 mm');
    expect(t).toContain('GAP 2 mm,0 mm');
    expect(t).toContain('CLS');
    expect(t.trim().endsWith('PRINT 1,1')).toBe(true);
  });

  // ⚠️ Copias sao NATIVAS do TSPL. Se o app mandasse N vezes, uma oscilacao no
  // meio da conexao deixaria sair menos etiqueta do que a pessoa pediu.
  it('pede as cópias à impressora, não repete o envio', () => {
    const t = etiquetaTSPL(campos, config, { copias: 5 });
    expect(t).toContain('PRINT 1,5');
    expect(t.match(/PRINT /g)).toHaveLength(1);
    expect(t.match(/SIZE /g)).toHaveLength(1);
  });

  it('leva os dados que a etiqueta mostra', () => {
    const t = etiquetaTSPL(campos, config);
    expect(t).toContain('PICANHA');
    expect(t).toContain('150 g');
    expect(t).toContain('CONGELADO -18C'); // sem o grau: ver o teste de ASCII
    expect(t).toContain('25/02/2027 - 10:00');
    expect(t).toContain('Maria');
  });

  // ⚠️ ESTE TESTE VEIO DE UMA ETIQUETA IMPRESSA DE VERDADE. Mandamos CODEPAGE
  // 1252, que e o correto pelo manual, e a MDK-022 ignorou: "MANIPULACAO" com
  // cedilha saiu "MANIPULA高0", "0°C" saiu "0贊", "Joao" com til saiu "Jo鲷".
  // O firmware esta numa pagina de codigo asiatica. Nenhum acento pode chegar
  // no papel, por nenhum caminho — nome de produto, responsavel ou endereco.
  it('nada acima do ASCII chega na impressora', () => {
    const t = etiquetaTSPL({
      ...campos,
      nome: 'Coração à moda',
      responsavel: 'João',
      armazenamentoLabel: 'REFRIGERADO', armazenamentoFaixa: '0°C a 6°C',
      restauranteNome: 'Açaí & Cia',
    }, { ...config, estabelecimento: { cidade: 'Jaboatão dos Guararapes' } });

    const forasteiro = [...t].find(ch => ch.charCodeAt(0) > 126);
    expect(forasteiro).toBeUndefined();
    expect(t).toContain('CORACAO A MODA');
    expect(t).toContain('Joao');
    expect(t).toContain('0C a 6C');
    expect(t).toContain('Jaboatao dos Guararapes');
  });

  // ⚠️ Nome de 14 letras com medida ao lado saia cortado ("CORACAO A MO.")
  // porque a fonte era escolhida contando LETRAS, e contar letra ignora o
  // tamanho da letra.
  it('o nome diminui de fonte antes de ser cortado', () => {
    const t = etiquetaTSPL({ ...campos, nome: 'Coracao a moda' }, config);
    const linha = t.split(SEP).find(x => x.includes('CORACAO'));
    expect(linha).toContain('CORACAO A MODA');
    expect(linha).not.toContain('.');
  });

  // ⚠️ AS DUAS DATAS NA MESMA COLUNA. A validade ja ficou sozinha embaixo, em
  // fonte maior, para dar destaque — e no papel a data descolava da coluna e a
  // linha parecia orfa. Comparar manipulacao com validade e o que a equipe faz
  // na geladeira, e comparar so funciona alinhado.
  it('validade e manipulação saem alinhadas, uma sob a outra', () => {
    const t = etiquetaTSPL(campos, config).split(SEP).filter(x => x.startsWith('TEXT'));
    const achar = (trecho) => {
      const l = t.find(x => x.includes(trecho));
      const partes = l.split('"');
      return {
        x: parseInt(l.split(',')[0].replace('TEXT ', '')), y: parseInt(l.split(',')[1]),
        fonte: parseInt(partes[1]), txt: partes[partes.length - 2],
      };
    };
    const dManip = achar('29/08/2026');
    const dVal = achar('25/02/2027');
    // ⚠️ ALINHADAS NAS DUAS PONTAS, e uma coisa depende da outra: valor a
    // DIREITA + MESMO tamanho. Ja se tentou destacar a validade com corpo
    // maior, e ai ela comecava 72 pontos antes da manipulacao — terminavam
    // juntas, mas nao ficavam uma sob a outra. O tamanho igual e o que faz o
    // alinhamento a direita funcionar.
    expect(dVal.fonte).toBe(dManip.fonte);
    expect(dVal.x).toBe(dManip.x);
    expect(dVal.y).toBeGreaterThan(dManip.y); // logo abaixo
    expect(dVal.y - dManip.y).toBeLessThanOrEqual(34);
    expect(achar('VALIDADE:').y).toBe(dVal.y); // rotulo junto da data, nao acima
    // encostada na borda direita da area util
    expect(dVal.x + dVal.txt.length * 12).toBe(60 * PONTOS_POR_MM - Math.round(2.5 * PONTOS_POR_MM));
  });

  // ⚠️ Destaque da validade depois que ela perdeu o corpo maior: um traco sob a
  // DATA. Nao sob a linha inteira — traco de ponta a ponta viraria mais um
  // divisor, e a etiqueta ja tem dois.
  it('a validade sai sublinhada, e só ela', () => {
    const linhas = etiquetaTSPL(campos, config).split(SEP);
    const data = linhas.find(l => l.startsWith('TEXT') && l.includes('25/02/2027'));
    const x = parseInt(data.split(',')[0].replace('TEXT ', ''));
    const y = parseInt(data.split(',')[1]);
    const larg = data.split('"')[data.split('"').length - 2].length * 12;
    const sublinhados = linhas.filter(l => l.startsWith(`BAR ${x},`));
    expect(sublinhados).toHaveLength(1);
    const [, by, bw] = sublinhados[0].replace('BAR ', '').split(',').map(Number);
    expect(by).toBeGreaterThan(y);       // abaixo da data
    expect(by - y).toBeLessThanOrEqual(26);
    expect(bw).toBe(larg);               // do tamanho da data, nao da etiqueta
  });

  // ⚠️ A MESMA ETIQUETA SAIU FINA PELO CELULAR E CHEIA PELO COMPUTADOR: pela
  // fila do Windows o navegador rasteriza a fonte da tela e manda como imagem;
  // em TSPL quem desenha e a fonte interna da impressora, magra de fabrica.
  // A dupla batida (mesmo texto, um ponto ao lado) e o negrito que termica tem.
  it('todo texto sai em dupla batida, para engrossar o traço', () => {
    const linhas = etiquetaTSPL(campos, config).split(SEP).filter(x => x.startsWith('TEXT'));
    expect(linhas.length % 2).toBe(0);
    for (let i = 0; i < linhas.length; i += 2) {
      const x1 = parseInt(linhas[i].split(',')[0].replace('TEXT ', ''));
      const x2 = parseInt(linhas[i + 1].split(',')[0].replace('TEXT ', ''));
      expect(x2 - x1).toBe(1);                                        // um ponto ao lado
      expect(linhas[i].slice(linhas[i].indexOf('"'))).toBe(linhas[i + 1].slice(linhas[i + 1].indexOf('"')));
    }
  });

  // ⚠️ SAIU IMPRESSO ASSIM: as quatro linhas do rodape uma POR CIMA da outra,
  // ilegiveis. A altura real da fonte no firmware e maior que a da tabela do
  // manual. Cada linha precisa de passo maior que a altura da fonte que usa.
  it('as linhas do rodapé não se encavalam', () => {
    const t = etiquetaTSPL(campos, { ...config, estabelecimento: {
      cnpj: '12.345.678/0001-90', cep: '54.430-350',
      endereco: 'Av. Anibal Ribeiro, 1210', cidade: 'Jaboatao dos Guararapes' } });
    const rodape = t.split(SEP).filter(x => x.startsWith('TEXT'))
      .map(x => ({ y: parseInt(x.split(',')[1]), fonte: parseInt(x.split('"')[1]) }))
      .filter(x => x.y > 200)
      // cada linha sai DUAS vezes (a dupla batida do negrito); aqui interessa
      // a posicao, entao uma por altura basta
      .filter((x, i, todas) => todas.findIndex(o => o.y === x.y) === i);
    expect(rodape.length).toBe(4);
    for (let i = 1; i < rodape.length; i++) {
      expect(rodape[i].y - rodape[i - 1].y).toBeGreaterThan(20); // > altura da fonte 2
      expect(rodape[i].fonte).toBeGreaterThanOrEqual(2);         // nunca a fonte 1
    }
  });

  // ⚠️ Com fonte 2 cabem ~36 caracteres na linha. O CNPJ ganhou linha propria
  // porque junto com o CEP estourava e saia CORTADO — justo o dado que
  // identifica a cozinha para a fiscalizacao.
  it('nada do rodapé passa da largura da etiqueta', () => {
    const t = etiquetaTSPL(campos, { ...config, estabelecimento: {
      cnpj: '12.345.678/0001-90', cep: '54.430-350',
      endereco: 'Avenida Anibal Ribeiro Varejao, 1210', cidade: 'Jaboatao dos Guararapes' } });
    const LARG = { 1: 8, 2: 12, 3: 16, 4: 24 };
    for (const l of t.split(SEP).filter(x => x.startsWith('TEXT'))) {
      const partes = l.split('"');
      const conteudo = partes[partes.length - 2];
      const x = parseInt(l.split(',')[0].replace('TEXT ', ''));
      expect(x + conteudo.length * LARG[parseInt(partes[1])]).toBeLessThanOrEqual(60 * PONTOS_POR_MM);
    }
    expect(t).toContain('CNPJ: 12.345.678/0001-90'); // inteiro, sem corte
  });

  // ⚠️ A primeira versao imprimia so o NOME do restaurante e deixava CNPJ e
  // endereco de fora, enquanto a previa da tela mostrava as quatro linhas. O
  // endereco de quem manipulou e o que a fiscalizacao procura.
  it('o rodapé leva o estabelecimento inteiro, como na tela', () => {
    const est = { cnpj: '12.345.678/0001-90', cep: '54.430-350',
      endereco: 'Av. Anibal Ribeiro, 1210', cidade: 'Jaboatao' };
    const t = etiquetaTSPL(campos, { ...config, estabelecimento: est });
    expect(t).toContain('RESTAURANTE TESTE');
    expect(t).toContain('CNPJ: 12.345.678/0001-90');
    expect(t).toContain('Av. Anibal Ribeiro, 1210');
    expect(t).toContain('Jaboatao');

    // ancorado embaixo: uma linha a mais nao empurra nada para fora do papel
    const ys = t.split(SEP).filter(x => x.startsWith('TEXT'))
      .map(x => parseInt(x.split(',')[1]));
    expect(Math.max(...ys)).toBeLessThan(50 * PONTOS_POR_MM);
  });

  // ⚠️ Aspa dupla ENCERRA a string do comando TSPL. Um nome como
  // 'File 1" espessura' cortaria o comando ao meio e a etiqueta sairia
  // truncada — ou nao sairia.
  it('aspas no nome do produto não quebram o comando', () => {
    const t = etiquetaTSPL({ ...campos, nome: 'File 1" grosso' }, config);
    const linhaNome = t.split(SEP).find(l => l.includes('FILE'));
    // uma abertura e um fechamento de fonte + uma abertura e um fechamento de
    // conteudo = 4 aspas exatas na linha
    expect((linhaNome.match(/"/g) || []).length).toBe(4);
  });

  it('campo desligado na configuração não vai para o papel', () => {
    const semResp = etiquetaTSPL(campos, { ...config, campos: { responsavel: false } });
    expect(semResp).not.toContain('Maria');
    expect(semResp).not.toContain('RESP.:');
  });

  it('valor vazio não gera linha', () => {
    const t = etiquetaTSPL({ ...campos, responsavel: '', marca: '' }, config);
    expect(t).not.toContain('RESP.:');
    expect(t).not.toContain('MARCA:');
  });

  // ⚠️ Coordenadas sao em PONTOS, e a impressora e 203 DPI = 8 pontos/mm.
  // Confundir com milimetro poe tudo no canto da etiqueta.
  it('converte milímetro em ponto a 203 DPI', () => {
    expect(PONTOS_POR_MM).toBe(8);
    const t = etiquetaTSPL(campos, { ...config, larguraMm: 60, alturaMm: 50 });
    // a barra separadora usa a largura util (60mm - 2x2,5mm de margem = 55mm)
    expect(t).toContain(`,${55 * 8},2`);
  });

  it('rolo de outro tamanho move tudo junto', () => {
    const t = etiquetaTSPL(campos, { ...config, larguraMm: 40, alturaMm: 30 });
    expect(t).toContain('SIZE 40 mm,30 mm');
    expect(t).toContain(`,${35 * 8},2`);
  });

  // ⚠️ O nome deixou de ser CORTADO e passou a QUEBRAR em duas linhas quando há
  // papel — a prévia da tela sempre mostrou duas e o papel entregava uma só,
  // cortada. O corte continua existindo como último recurso (etiqueta cheia,
  // sem espaço para a segunda linha), e é o que o teste seguinte trava.
  it('nome comprido ganha a segunda linha em vez de perder o fim', () => {
    const nome = 'FILE MIGNON PORCIONADO ARGENTINO PREMIUM 180G';
    const t = etiquetaTSPL({ ...campos, nome }, config);
    const conteudos = t.split(SEP)
      .filter(l => l.startsWith('TEXT') && /MIGNON|PREMIUM|ARGENTINO/.test(l))
      .map(l => l.match(/"([^"]*)"$/)[1]);
    // duas linhas distintas (cada uma sai duplicada pela dupla batida do negrito)
    const distintas = [...new Set(conteudos)];
    expect(distintas.length).toBe(2);
    // juntas, entregam o nome inteiro — nada de "." de corte
    expect(distintas.join(' ')).toBe(nome);
    expect(distintas.some(c => c.endsWith('.'))).toBe(false);
  });

  // ⚠️ A ORDEM DAS CONCESSÕES é o coração de `melhorDesenho`: as três folgas
  // (nome em duas linhas, SIF/LOTE separados, endereço em duas) competem pelo
  // MESMO papel. Numa etiqueta cheia o endereço volta a uma linha e o lote se
  // junta ao SIF ANTES de o nome perder a segunda — porque o nome é o que se
  // lê de longe na geladeira.
  const cheia = {
    ...campos,
    nome: 'Bacalhau dessalgado desfiado para bolinho da casa',
    medida: '1,5 kg', marca: 'Riberalves / Distribuidora',
    valOriginalFmt: '01/12/2026',
    sif: 'SIF 1234', lote: 'L-2026-0912-AB',
    sifLoteRotulo: 'SIF / LOTE:', sifLoteValor: 'SIF 1234 - L-2026-0912-AB',
    responsavel: 'Maria das Gracas Silva',
    armazenamentoLabel: 'CONGELADO', armazenamentoFaixa: '-18C a -12C',
    restauranteNome: 'Restaurante Exemplo da Cozinha',
  };
  const comRodape = {
    ...config,
    estabelecimento: {
      cnpj: '12.345.678/0001-90', endereco: 'Av. Conselheiro Aguiar, 1234 - Boa Viagem',
      cidade: 'Recife/PE', cep: '51020-000',
    },
  };

  it('etiqueta cheia cede o endereço e o lote, mas segura a segunda linha do nome', () => {
    const nivel = nivelDeDesenho(cheia, comRodape);
    expect(nivel.linhasNome).toBe(2);
    expect(nivel.sifLoteSeparado).toBe(false);
    expect(nivel.linhasEndereco).toBe(1);
    expect(medirEtiqueta(cheia, comRodape).cabe).toBe(true);
  });

  it('sem papel nem para isso, o nome volta a uma linha e o aviso dispara', () => {
    const apertada = { ...comRodape, alturaMm: 45 };
    expect(nivelDeDesenho(cheia, apertada).linhasNome).toBe(1);
    // o aviso "não cabe no papel" volta a ser alcançável — é a rede de segurança
    expect(medirEtiqueta(cheia, apertada).cabe).toBe(false);
    const conteudos = etiquetaTSPL(cheia, apertada).split(SEP)
      .filter(l => l.startsWith('TEXT') && /BACALHAU/.test(l))
      .map(l => l.match(/"([^"]*)"$/)[1]);
    expect([...new Set(conteudos)].length).toBe(1);
    expect(conteudos[0].endsWith('.')).toBe(true);
  });

  it('sobrando papel, SIF e LOTE saem em linhas próprias — lote cortado não serve para recall', () => {
    const soOsDois = { ...campos, sif: 'SIF 1234', lote: 'L-2026-0912-AB',
                       sifLoteRotulo: 'SIF / LOTE:', sifLoteValor: 'SIF 1234 · L-2026-0912-AB' };
    const t = etiquetaTSPL(soOsDois, config);
    expect(t).toContain('"LOTE:"');
    expect(t).toContain('"L-2026-0912-AB"');   // inteiro, sem o ponto de corte
  });

  it('quebrarEmLinhas parte entre palavras e só corta na última linha', () => {
    // fonte 2 = 12 pontos por caractere; 120 pontos = 10 caracteres por linha
    expect(quebrarEmLinhas('BACALHAU DESSALGADO', 2, 1, 120, 2)).toEqual(['BACALHAU', 'DESSALGADO']);
    // cabe inteiro: uma linha só, sem inventar a segunda
    expect(quebrarEmLinhas('PICANHA', 2, 1, 120, 2)).toEqual(['PICANHA']);
    // não cabe nem em duas: a última corta, com o ponto de sempre
    const r = quebrarEmLinhas('BACALHAU DESSALGADO DESFIADO PARA BOLINHO', 2, 1, 120, 2);
    expect(r.length).toBe(2);
    expect(r[1].endsWith('.')).toBe(true);
    // palavra única maior que a linha parte no meio em vez de sumir
    expect(quebrarEmLinhas('ABCDEFGHIJKLMNOPQRST', 2, 1, 120, 2)[0]).toBe('ABCDEFGHIJ');
    expect(quebrarEmLinhas('', 2, 1, 120, 2)).toEqual([]);
  });

  it('lote manda um bloco completo por item', () => {
    const t = loteTSPL([
      { campos, copias: 2 },
      { campos: { ...campos, nome: 'Alface' }, copias: 1 },
    ], config);
    expect(t.match(/SIZE /g)).toHaveLength(2);
    expect(t).toContain('PRINT 1,2');
    expect(t).toContain('PRINT 1,1');
    expect(t).toContain('ALFACE');
  });

  // ⚠️ TextEncoder faria UTF-8, e ali o "Ç" vira DOIS bytes — a impressora
  // leria dois caracteres estranhos. Com CODEPAGE 1252 cada acento e UM byte.
  it('acento sai como um byte só (Windows-1252), não dois', () => {
    expect(etiquetaTSPL(campos, config)).toContain('CODEPAGE 1252');
    const b = paraBytesLatin1('MANIPULAÇÃO');
    expect(b.length).toBe('MANIPULAÇÃO'.length);
    expect(b[8]).toBe(0xc7); // Ç
    expect(new TextEncoder().encode('MANIPULAÇÃO').length).toBeGreaterThan(b.length);
  });

  it('caractere fora da tabela vira "?" em vez de byte inválido', () => {
    const b = paraBytesLatin1('A😀B');
    expect(Array.from(b).every(x => x <= 0xff)).toBe(true);
    expect(b[0]).toBe(65);
  });

  it('cortarParaLargura respeita a largura disponível', () => {
    // fonte 2 = 12 pontos por caractere; 120 pontos = 10 caracteres
    expect(cortarParaLargura('ABCDEFGHIJKLM', 2, 1, 120)).toHaveLength(10);
    expect(cortarParaLargura('ABC', 2, 1, 120)).toBe('ABC');
  });
});

describe('marca de upgrade (etiquetas → completo)', () => {
  it('sobe de plano: grava a marca E a data, que é o que faz o aviso aparecer', () => {
    expect(marcaDeUpgrade('etiquetas', 'completo', '2026-08-31'))
      .toEqual({ produtoVisto: 'completo', upgradeEm: '2026-08-31' });
  });

  it('conta que nunca gravou a marca só REGISTRA onde está — sem data', () => {
    // Sem isto, o primeiro deploy daria "bem-vindo ao completo" para todo mundo.
    expect(marcaDeUpgrade(undefined, 'completo', '2026-08-31')).toEqual({ produtoVisto: 'completo' });
  });

  it('nada mudou: não grava nada', () => {
    expect(marcaDeUpgrade('completo', 'completo', '2026-08-31')).toBeNull();
    expect(marcaDeUpgrade('etiquetas', 'etiquetas', '2026-08-31')).toBeNull();
  });

  it('descer de plano registra, mas não dá boas-vindas', () => {
    expect(marcaDeUpgrade('completo', 'etiquetas', '2026-08-31')).toEqual({ produtoVisto: 'etiquetas' });
  });

  it('produto ainda desconhecido não grava (evita marcar antes de hidratar)', () => {
    expect(marcaDeUpgrade('etiquetas', undefined, '2026-08-31')).toBeNull();
  });
});

describe('prazo digitado na hora de imprimir', () => {
  // ⚠️ O CASO REAL: o campo não tinha teto e 18000 imprimia validade em 2075,
  // numa etiqueta colada em pote de comida. Foi reproduzido no navegador.
  it('corta no teto — o dedo que erra não imprime validade em 2075', () => {
    expect(limitarDias('18000')).toBe(String(DIAS_VALIDADE_MAX));
    expect(limitarDias('1800')).toBe(String(DIAS_VALIDADE_MAX));
  });

  it('deixa passar o que é plausível', () => {
    expect(limitarDias('180')).toBe('180');
    expect(limitarDias('3')).toBe('3');
    expect(limitarDias(String(DIAS_VALIDADE_MAX))).toBe(String(DIAS_VALIDADE_MAX));
  });

  it('vazio continua vazio — é o que faz cair no prazo do cadastro', () => {
    expect(limitarDias('')).toBe('');
    expect(limitarDias(null)).toBe('');
    expect(limitarDias('abc')).toBe('');
  });

  it('negativo vira zero, que é etiqueta sem validade (identificação só)', () => {
    expect(limitarDias('-5')).toBe('0');
  });

  // ⚠️ A régua do aviso é o prazo que A CASA cadastrou, nunca um número
  // sanitário inventado por nós: quem valida processo é o estabelecimento.
  it('avisa quando o digitado é muito maior que o cadastrado', () => {
    // ⚠️ O item de prazo CURTO é onde esta régua trabalha: 3 dias de produto
    // aberto virando 30 é o erro que o teto de 365 nunca pegaria.
    expect(avisoDePrazo('30', '3')).toMatch(/acima do prazo cadastrado \(3 dias\)/);
    expect(avisoDePrazo('90', '12')).toMatch(/acima do prazo cadastrado/);
  });

  it('num item de prazo longo quem segura é o teto, não o múltiplo', () => {
    // 3 × 180 = 540, acima do teto — então o campo já cortou em 365 antes de
    // chegar aqui, e é a mensagem do teto que a pessoa vê. Testado junto para
    // deixar registrado que as duas regras se cobrem e não se atrapalham.
    expect(limitarDias('1800')).toBe('365');
    expect(avisoDePrazo(limitarDias('1800'), '180')).toMatch(/é o máximo/);
  });

  it('não avisa por estender um lote dentro do razoável', () => {
    expect(avisoDePrazo('200', '180')).toBeNull();
    expect(avisoDePrazo('9', '3')).toBeNull();   // exatamente 3x ainda passa
    expect(avisoDePrazo('180', '180')).toBeNull();
  });

  it('sem prazo cadastrado não há régua, então não há aviso', () => {
    expect(avisoDePrazo('90', 0)).toBeNull();
    expect(avisoDePrazo('90', undefined)).toBeNull();
  });

  it('no teto, avisa mesmo sem cadastro — é onde o erro de digitação para', () => {
    expect(avisoDePrazo(String(DIAS_VALIDADE_MAX), 0)).toMatch(/é o máximo/);
  });

  it('zero e vazio não geram aviso nenhum', () => {
    expect(avisoDePrazo('0', '180')).toBeNull();
    expect(avisoDePrazo('', '180')).toBeNull();
  });
});

describe('lote do fabricante e o espaço da etiqueta', () => {
  const est = { cnpj: '12.345.678/0001-90', endereco: 'Rua das Flores, 120', cidade: 'Recife', cep: '51020-000' };
  const cfg = (campos = {}) => ({
    larguraMm: 60, alturaMm: 50, estabelecimento: est,
    campos: {
      restaurante: true, validade: true, fabricacao: true, armazenamento: true,
      responsavel: true, marca: true, sif: true, estabelecimento: true,
      lote: true, valOriginal: true, ...campos,
    },
  });
  const campos = (extra = {}) => montarCamposEtiqueta({
    nome: 'Picanha (porção)', dataFabricacao: '2026-08-31', diasValidade: 180,
    armazenamento: 'congelado', armazenamentoNome: 'CONGELADO', armazenamentoFaixa: '-18°C',
    restauranteNome: 'Restaurante Exemplo', responsavel: 'Maria', hora: '15:56', ...extra,
  });

  it('SIF e lote saem na MESMA linha quando os dois existem', () => {
    const c = campos({ sif: '1234', lote: 'A45-22' });
    expect(c.sifLoteRotulo).toBe('SIF / LOTE:');
    expect(c.sifLoteValor).toBe('1234 · A45-22');
    // ⚠️ No papel o `·` vira `-`: a MDK-022 ignora CODEPAGE e o paraASCII
    // troca tudo que não é ASCII. Na TELA sai o ponto médio; aqui, o traço.
    const tspl = etiquetaTSPL(c, cfg());
    expect(tspl).toContain('SIF / LOTE:');
    expect(tspl).toContain('1234 - A45-22');
  });

  it('cada um sozinho continua com o rótulo só dele', () => {
    expect(campos({ sif: '1234' }).sifLoteRotulo).toBe('SIF:');
    expect(campos({ lote: 'A45' }).sifLoteRotulo).toBe('LOTE:');
    expect(campos({ lote: 'A45' }).sifLoteValor).toBe('A45');
  });

  it('sem nenhum dos dois, a linha não existe', () => {
    const c = campos();
    expect(c.sifLoteRotulo).toBe('');
    expect(etiquetaTSPL(c, cfg())).not.toContain('LOTE');
  });

  // ⚠️ ESTE É O TESTE QUE JUSTIFICA O DESENHO. Com val. original, marca, SIF e
  // lote cada um na sua linha, o corpo passava do rodapé e o RESP. imprimia em
  // cima do nome da casa — direto no papel, sem erro nenhum na tela.
  it('com TUDO ligado a etiqueta ainda cabe', () => {
    const m = medirEtiqueta(campos({ sif: '1234', lote: 'A45-22', marca: 'Friboi', valOriginal: '2026-12-10' }), cfg());
    expect(m.cabe).toBe(true);
    expect(m.folgaMm).toBeGreaterThan(0);
  });

  it('a etiqueta do dia a dia sobra folga de sobra', () => {
    const m = medirEtiqueta(campos(), cfg({ valOriginal: false }));
    expect(m.cabe).toBe(true);
    expect(m.folgaMm).toBeGreaterThan(5);
  });

  it('medirEtiqueta acusa quando NÃO cabe (papel menor)', () => {
    const apertado = { ...cfg(), alturaMm: 30 };
    expect(medirEtiqueta(campos({ sif: '1', lote: '2', marca: 'X', valOriginal: '2026-12-10' }), apertado).cabe).toBe(false);
  });
});

describe('produto aberto sem prazo cadastrado', () => {
  it('ganha a sugestão de 3 dias em vez de sair sem validade', () => {
    expect(diasIniciaisDaEtiqueta({ tipoData: 'abertura', prazos: {} })).toBe(DIAS_SUGERIDOS_ABERTURA);
  });

  it('o prazo cadastrado sempre manda mais que a sugestão', () => {
    expect(diasIniciaisDaEtiqueta({ tipoData: 'abertura', armazenamento: 'refrigerado', prazos: { refrigerado: 5 } })).toBe(5);
    expect(diasIniciaisDaEtiqueta({ tipoData: 'abertura', diasValidade: 7 })).toBe(7);
  });

  // ⚠️ Alimento MANIPULADO depende do processo daquela cozinha: chutar três
  // dias ali seria a Aurum inventando prazo de alimento.
  it('item manipulado sem prazo NÃO recebe sugestão nenhuma', () => {
    expect(diasIniciaisDaEtiqueta({ tipoData: 'fabricacao', prazos: {} })).toBe(0);
  });

  it('a explicação só aparece quando a sugestão está de fato em uso', () => {
    expect(usandoSugestaoDeAbertura({ tipoData: 'abertura', prazos: {} }, 3)).toBe(true);
    // digitou 3 por conta própria num item que TEM cadastro de 3 → não é sugestão
    expect(usandoSugestaoDeAbertura({ tipoData: 'abertura', armazenamento: 'refrigerado', prazos: { refrigerado: 3 } }, 3)).toBe(false);
    expect(usandoSugestaoDeAbertura({ tipoData: 'abertura', prazos: {} }, 10)).toBe(false);
    expect(usandoSugestaoDeAbertura({ tipoData: 'fabricacao', prazos: {} }, 3)).toBe(false);
  });
});

describe('o armazenamento que a pessoa usou da última vez', () => {
  const ATIVOS = [{ id: 'congelado' }, { id: 'refrigerado' }, { id: 'resfriado' }];
  const FILE = { id: 'file', armazenamentoPadrao: 'congelado' };
  const PRAZOS = { congelado: 180, refrigerado: 3, resfriado: 2 };

  it('sem memória nenhuma, abre no padrão do cadastro', () => {
    expect(armazenamentoInicial(FILE, {}, ATIVOS, PRAZOS)).toBe('congelado');
  });

  // ⚠️ A DOR: o dono etiquetava filé para RESFRIADO e o modal reabria em
  // CONGELADO a cada pote, porque o padrão do cadastro sempre ganhava.
  it('lembra o que foi usado no item, e é isso que abre', () => {
    const mem = lembrarArmazenamentos({}, [{ produtoId: 'file', armazenamento: 'resfriado' }]);
    expect(armazenamentoInicial(FILE, mem, ATIVOS, PRAZOS)).toBe('resfriado');
  });

  it('a memória é POR ITEM — outro produto não herda', () => {
    const mem = lembrarArmazenamentos({}, [{ produtoId: 'file', armazenamento: 'resfriado' }]);
    expect(armazenamentoInicial({ id: 'picanha', armazenamentoPadrao: 'congelado' }, mem, ATIVOS, PRAZOS))
      .toBe('congelado');
  });

  it('a última impressão manda, não a primeira', () => {
    let mem = lembrarArmazenamentos({}, [{ produtoId: 'file', armazenamento: 'resfriado' }]);
    mem = lembrarArmazenamentos(mem, [{ produtoId: 'file', armazenamento: 'refrigerado' }]);
    expect(armazenamentoInicial(FILE, mem, ATIVOS, PRAZOS)).toBe('refrigerado');
  });

  // ⚠️ Sem esta regra, desligar um estado nas configurações deixaria itens
  // abrindo num estado que sumiu — e a etiqueta sairia sem validade, calada.
  it('estado desligado nas configurações é ignorado, cai no cadastro', () => {
    const mem = { file: 'resfriado' };
    const semResfriado = [{ id: 'congelado' }, { id: 'refrigerado' }];
    expect(armazenamentoInicial(FILE, mem, semResfriado, PRAZOS)).toBe('congelado');
  });

  it('estado sem prazo cadastrado também é ignorado', () => {
    const mem = { file: 'resfriado' };
    expect(armazenamentoInicial(FILE, mem, ATIVOS, { congelado: 180, resfriado: 0 })).toBe('congelado');
  });

  it('item apagado do catálogo sai da memória', () => {
    const mem = { file: 'resfriado', sumiu: 'congelado' };
    expect(lembrarArmazenamentos(mem, [], ['file'])).toEqual({ file: 'resfriado' });
  });

  it('etiqueta avulsa (sem produtoId) não suja a memória', () => {
    expect(lembrarArmazenamentos({}, [{ produtoId: null, armazenamento: 'resfriado' }])).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────
//  A separação comercial dos dois produtos
//
//  ⚠️ ESTE É O TESTE QUE FALTAVA (F2 da auditoria de 31/08). O que separa um
//  cliente de R$249 de um de R$399 é qual árvore de rotas o App.jsx monta —
//  e isso não tinha teste nenhum. Uma rota do plano completo colada por
//  engano dentro do ramo do Etiquetas entrega de graça o produto caro, e
//  ninguém perceberia até um cliente contar.
//
//  ⚠️ É um teste ESTRUTURAL: lê o App.jsx e confere a forma da árvore. Ele NÃO
//  monta a tela — para isso faltam bibliotecas que o projeto não tem, e não
//  vale trazê-las só por isto. O que ele garante é o que costuma quebrar numa
//  refatoração: a rota que aparece onde não devia e o curinga que sumiu.
// ─────────────────────────────────────────────────────────────────────

describe('plano Etiquetas não abre tela do plano completo', () => {
  const fonte = readFileSync(
    new URL('../../App.jsx', import.meta.url), 'utf8');

  // O ramo do Etiquetas vai de `soEtiquetas ? (` até o `) : (` do completo.
  const ramoEtiquetas = (() => {
    const i = fonte.indexOf('soEtiquetas ? (');
    expect(i).toBeGreaterThan(-1);
    const fim = fonte.indexOf('</Routes>', i);
    expect(fim).toBeGreaterThan(i);
    return fonte.slice(i, fim);
  })();

  const rotasDoRamo = [...ramoEtiquetas.matchAll(/path="([^"]+)"/g)].map(m => m[1]);

  it('só monta as rotas que este produto comprou', () => {
    expect(rotasDoRamo.sort()).toEqual(
      // `/impressas` entrou em 09/09/2026: repetir uma etiqueta rasgada com as
      // datas ORIGINAIS, sem remontar o item (ver pages/etiquetas/Impressas.jsx).
      ['*', '/', '/admin', '/ajustes', '/etiquetas', '/impressas', '/itens', '/novidades', '/pagamento'].sort(),
    );
  });

  it.each([
    '/compras', '/entradas', '/saidas', '/producao', '/inventario',
    '/aparas', '/relatorio', '/financeiro', '/administracao', '/estoques',
    '/balanco', '/fechar-turno', '/validades', '/historico', '/registrar',
  ])('não abre %s', (rota) => {
    expect(rotasDoRamo).not.toContain(rota);
  });

  it('tem o curinga que joga qualquer outro endereço para a tela inicial', () => {
    // ⚠️ Sem ele, digitar /financeiro no plano Etiquetas cairia numa tela em
    // branco — ou pior, na rota do outro produto.
    expect(ramoEtiquetas).toMatch(/path="\*"[\s\S]{0,80}Navigate to="\/"/);
  });

  it('as telas do plano completo são carregadas sob demanda', () => {
    // ⚠️ F1: elas eram importadas direto e viajavam para o cliente de
    // etiquetas, que nunca vai poder abrir nenhuma. Se alguém trocar um
    // `lazy` por `import` direto, o pacote volta a inchar em silêncio.
    for (const tela of ['Compras', 'Entradas', 'Saidas', 'Producao', 'Inventario',
                        'Dashboard', 'Historico', 'Registrar', 'Validades']) {
      expect(fonte).toMatch(new RegExp(`const ${tela} = lazy\\(`));
      expect(fonte).not.toMatch(new RegExp(`^import ${tela} from`, 'm'));
    }
  });
});

describe('planoDeEnvio — como falar com a impressora sem chutar o MTU', () => {
  it('havendo confirmação, usa ela: o ATT confirma cada pedaço', () => {
    const p = planoDeEnvio({ write: true, writeWithoutResponse: true });
    expect(p.modo).toBe('comConfirmacao');
    expect(p.pedaco).toBe(20);
    // a própria confirmação segura o ritmo — respiro artificial só atrasaria
    expect(p.respiroMs).toBe(0);
  });

  it('só sem confirmação: 20 bytes, o único tamanho garantido', () => {
    const p = planoDeEnvio({ writeWithoutResponse: true });
    expect(p.modo).toBe('semConfirmacao');
    expect(p.pedaco).toBe(20);
    // sem confirmação não há nada segurando a fila do firmware
    expect(p.respiroMs).toBeGreaterThan(0);
  });

  // ⚠️ O pedaço de 100 com confirmação era um defeito que só aparecia em
  // ALGUNS aparelhos: acima do MTU negociado ele vira long write (prepare +
  // execute), que o firmware das térmicas baratas costuma não implementar.
  // Onde o celular negocia MTU grande, cabia num pacote e funcionava.
  it('NENHUM modo passa de 20 bytes — acima disso vira long write', () => {
    expect(planoDeEnvio({ write: true }).pedaco).toBeLessThanOrEqual(20);
    expect(planoDeEnvio({ writeWithoutResponse: true }).pedaco).toBeLessThanOrEqual(20);
    expect(planoDeEnvio({ write: true, writeWithoutResponse: true }).pedaco).toBeLessThanOrEqual(20);
  });

  it('característica que não aceita escrita nenhuma não vira plano', () => {
    expect(planoDeEnvio({ read: true, notify: true })).toBe(null);
    expect(planoDeEnvio({})).toBe(null);
    expect(planoDeEnvio(null)).toBe(null);
    expect(planoDeEnvio(undefined)).toBe(null);
  });
});

// =====================================================================
//  Escolher o canal certo, num aparelho que devolve as coisas fora de ordem
//
//  Nem `getPrimaryServices()` nem `getCharacteristics()` prometem ordem. O
//  app pegava "a primeira gravável que aparecer" — e numa impressora com dois
//  serviços graváveis isso vira sorteio por aparelho. Quando sai o errado,
//  conecta, envia e NADA sai no papel, sem erro nenhum.
// =====================================================================

describe('escolherCaracteristica — a conhecida ganha de qualquer gravável', () => {
  const c = (uuid, props) => ({ uuid, properties: props });

  it('prefere a característica conhecida mesmo vindo depois na lista', () => {
    const escolhida = escolherCaracteristica([
      c('0000abcd-0000-1000-8000-00805f9b34fb', { write: true }),
      c('0000ff02-0000-1000-8000-00805f9b34fb', { writeWithoutResponse: true }),
    ]);
    expect(escolhida.uuid).toBe('0000ff02-0000-1000-8000-00805f9b34fb');
  });

  it('não havendo conhecida, fica a primeira que aceita escrita', () => {
    const escolhida = escolherCaracteristica([
      c('0000aaaa-0000-1000-8000-00805f9b34fb', { read: true }),
      c('0000bbbb-0000-1000-8000-00805f9b34fb', { writeWithoutResponse: true }),
    ]);
    expect(escolhida.uuid).toBe('0000bbbb-0000-1000-8000-00805f9b34fb');
  });

  it('lista sem nenhuma gravável não vira canal', () => {
    expect(escolherCaracteristica([c('x', { read: true, notify: true })])).toBe(null);
    expect(escolherCaracteristica([])).toBe(null);
    expect(escolherCaracteristica(null)).toBe(null);
  });
});

// =====================================================================
//  Qual aparelho já autorizado tentar reconectar
//
//  A permissão do Web Bluetooth é por SITE e se acumula. Pegar `conhecidos[0]`
//  às cegas podia tentar um aparelho que não é impressora e gastar o tempo
//  limite inteiro antes de desistir.
// =====================================================================

describe('escolherConhecido — não tenta às cegas', () => {
  const d = (id, name) => ({ id, name });

  it('havendo memória desta aba, é aquela impressora ou nenhuma', () => {
    const lista = [d('1', 'Fone'), d('2', 'MDK-022')];
    expect(escolherConhecido(lista, '2').id).toBe('2');
    // a de antes sumiu da lista de permissões: não serve trocar por outra
    expect(escolherConhecido([d('1', 'Fone')], '2')).toBe(null);
  });

  it('sem memória, prefere a que parece impressora', () => {
    expect(escolherConhecido([d('1', 'Galaxy Buds'), d('2', 'MDK-022')], null).id).toBe('2');
    expect(escolherConhecido([d('1', 'Relogio'), d('2', 'POS-80 Printer')], null).id).toBe('2');
  });

  it('nenhuma parecendo impressora, tenta a primeira mesmo assim', () => {
    // o nome pode vir vazio no Android; desistir aqui tiraria o reconectar de
    // quem tem tudo funcionando
    expect(escolherConhecido([d('1', ''), d('2', 'Fone')], null).id).toBe('1');
  });

  it('lista vazia não vira alvo', () => {
    expect(escolherConhecido([], null)).toBe(null);
    expect(escolherConhecido(null, null)).toBe(null);
  });

  it('pareceImpressora reconhece os nomes que aparecem de verdade', () => {
    expect(pareceImpressora('MDK-022')).toBe(true);
    expect(pareceImpressora('BlueTooth Printer')).toBe(true);
    expect(pareceImpressora('Impressora Térmica')).toBe(true);
    expect(pareceImpressora('Galaxy Buds')).toBe(false);
    expect(pareceImpressora('')).toBe(false);
    expect(pareceImpressora(null)).toBe(false);
  });
});

// =====================================================================
//  A prévia LÊ o TSPL em vez de redesenhar a etiqueta por conta própria
//
//  A mesma etiqueta era desenhada duas vezes, por códigos diferentes: HTML na
//  tela e TSPL na impressora. Nada garantia que concordassem — e não
//  concordavam (nome cortado só no papel, endereço perdendo o bairro só no
//  rolo, rodapé agrupado diferente). O interpretador acaba com a segunda
//  versão: a prévia passa a ser uma LEITURA do que vai ser impresso.
// =====================================================================

describe('interpretarTSPL — ler de volta o que foi gerado', () => {
  const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

  it('lê o tamanho do papel, os textos e as barras', () => {
    const t = [
      'SIZE 60 mm,50 mm', 'GAP 2 mm,0 mm', 'DIRECTION 1', 'CLS', 'CODEPAGE 1252',
      'TEXT 20,16,"4",0,1,1,"PICANHA"',
      'BAR 20,44,440,2',
      'PRINT 1,1',
    ].join(CRLF);
    const r = interpretarTSPL(t);
    expect(r.larguraMm).toBe(60);
    expect(r.alturaMm).toBe(50);
    // CLS/GAP/DIRECTION/CODEPAGE preparam a impressora e não marcam tinta
    expect(r.desenho).toHaveLength(2);
    expect(r.desenho[0]).toMatchObject({ tipo: 'texto', x: 20, y: 16, fonte: '4', conteudo: 'PICANHA' });
    expect(r.desenho[1]).toMatchObject({ tipo: 'barra', x: 20, y: 44, largura: 440, altura: 2 });
  });

  // ⚠️ O conteúdo pode ter vírgula ("Av. Aguiar, 1234"), e um casamento
  // preguiçoso cortaria ali — o endereço apareceria pela metade na prévia.
  it('conteúdo com vírgula não é cortado', () => {
    const r = interpretarTSPL('TEXT 20,272,"2",0,1,1,"Av. Conselheiro Aguiar, 1234 - Boa Viagem"');
    expect(r.desenho[0].conteudo).toBe('Av. Conselheiro Aguiar, 1234 - Boa Viagem');
  });

  // ⚠️ Um lote emenda várias etiquetas no mesmo texto. Sem parar no PRINT, a
  // segunda seria desenhada por cima da primeira, nas mesmas coordenadas.
  it('para na primeira etiqueta do lote', () => {
    const t = [
      'SIZE 60 mm,50 mm', 'TEXT 20,16,"4",0,1,1,"PRIMEIRA"', 'PRINT 1,1',
      'SIZE 60 mm,50 mm', 'TEXT 20,16,"4",0,1,1,"SEGUNDA"', 'PRINT 1,1',
    ].join(CRLF);
    const r = interpretarTSPL(t);
    expect(r.desenho).toHaveLength(1);
    expect(r.desenho[0].conteudo).toBe('PRIMEIRA');
  });

  it('a métrica da prévia é a MESMA tabela da impressora', () => {
    const d = { conteudo: 'ABCDE', fonte: '2', mulX: 1, mulY: 1 };
    expect(larguraDoTexto(d)).toBe(5 * 12);   // 5 caracteres x 12 pontos
    expect(alturaDoTexto(d)).toBe(20);
    expect(larguraDoTexto({ ...d, mulX: 2 })).toBe(5 * 12 * 2);
  });

  // A prova de que a prévia não inventa nada: o que o gerador CORTOU aparece
  // cortado, e o que ele QUEBROU aparece em duas linhas.
  it('a prévia recebe exatamente o que o gerador decidiu', () => {
    const nome = 'Bacalhau dessalgado desfiado para bolinho da casa';
    const r = interpretarTSPL(etiquetaTSPL(
      { nome, rotuloData: 'MANIPULACAO', dataFabricacaoFmt: '09/09/2026', validadeFmt: '09/03/2027' },
      { larguraMm: 60, alturaMm: 50, campos: {} },
    ));
    const textos = [...new Set(r.desenho.filter(d => d.tipo === 'texto').map(d => d.conteudo))];
    const doNome = textos.filter(t => /BACALHAU|BOLINHO|DESSALGADO/.test(t));
    expect(doNome.length).toBe(2);
    expect(doNome.join(' ')).toBe(nome.toUpperCase());
  });

  it('texto vazio não vira desenho', () => {
    expect(interpretarTSPL('TEXT 20,16,"2",0,1,1,""').desenho).toHaveLength(0);
    expect(interpretarTSPL('').desenho).toHaveLength(0);
    expect(interpretarTSPL(null).desenho).toHaveLength(0);
  });
});

// =====================================================================
//  Quanto a casa imprimiu — o controle da tela /impressas
// =====================================================================

describe('totaisImpressos — conta etiqueta de papel, não linha', () => {
  const hj = '2026-09-09';
  const linha = (dia, copias) => ({ impressoEm: dia, copias });

  it('uma linha pode valer N etiquetas (PRINT 1,N por Bluetooth)', () => {
    expect(totaisImpressos([linha(hj, 3)], hj).hoje).toBe(3);
    // sem `copias` (caminho do diálogo, uma linha por cópia) vale 1
    expect(totaisImpressos([{ impressoEm: hj }], hj).hoje).toBe(1);
  });

  it('semana são os últimos 7 dias, incluindo hoje', () => {
    const lista = [linha('2026-09-09', 1), linha('2026-09-04', 1), linha('2026-09-03', 1), linha('2026-09-02', 1)];
    // 09, 04 e 03 entram (09/09 menos 6 dias = 03/09); 02 fica de fora
    expect(totaisImpressos(lista, hj).semana).toBe(3);
  });

  it('mês é o do calendário, não 30 dias', () => {
    const lista = [linha('2026-09-01', 1), linha('2026-08-31', 5), linha('2026-08-15', 9)];
    expect(totaisImpressos(lista, hj).mes).toBe(1);
  });

  it('data futura não conta, e lista vazia dá zero', () => {
    expect(totaisImpressos([linha('2026-12-01', 4)], hj).mes).toBe(0);
    expect(totaisImpressos([], hj)).toEqual({ hoje: 0, semana: 0, mes: 0 });
    expect(totaisImpressos(null, hj)).toEqual({ hoje: 0, semana: 0, mes: 0 });
  });
});

// =====================================================================
//  Primeiro uso: o RESP. em branco no primeiro rolo
//
//  Conta nova, item cadastrado, rolo impresso — e o campo RESP. saiu vazio,
//  porque não havia ninguém cadastrado e nada avisava. O responsável é um dos
//  cinco campos que a etiqueta de manipulação precisa ter.
// =====================================================================

describe('faltasDoPrimeiroUso — o cartão que pede o RESP. e o endereço', () => {
  const cheio = { pessoas: ['Maria'], prefs: { estabelecimento: { endereco: 'Rua A, 1' } }, ehDiretoria: true };

  it('conta nova (sem ninguém e sem endereço) mostra as duas faltas', () => {
    const r = faltasDoPrimeiroUso({ pessoas: [], prefs: {}, ehDiretoria: true });
    expect(r).toEqual({ mostrar: true, faltaPessoa: true, faltaEndereco: true });
  });

  it('com tudo preenchido some sozinho — não precisa fechar', () => {
    expect(faltasDoPrimeiroUso(cheio).mostrar).toBe(false);
  });

  it('só falta o endereço → mostra, e diz que é só ele', () => {
    const r = faltasDoPrimeiroUso({ ...cheio, prefs: {} });
    expect(r).toEqual({ mostrar: true, faltaPessoa: false, faltaEndereco: true });
  });

  it('só falta a pessoa → mostra, e diz que é só ela', () => {
    const r = faltasDoPrimeiroUso({ ...cheio, pessoas: [] });
    expect(r).toEqual({ mostrar: true, faltaPessoa: true, faltaEndereco: false });
  });

  // ⚠️ A cozinha não alcança equipe nem dados do estabelecimento. Mostrar o
  // formulário para ela seria o mesmo beco do "Meus itens" negado.
  it('não aparece para quem não é a conta dona, mesmo faltando tudo', () => {
    expect(faltasDoPrimeiroUso({ pessoas: [], prefs: {}, ehDiretoria: false }).mostrar).toBe(false);
  });

  it('adiado pelo dono não volta a incomodar', () => {
    expect(faltasDoPrimeiroUso({ pessoas: [], prefs: { primeiroUsoAdiado: true }, ehDiretoria: true }).mostrar).toBe(false);
  });

  // Endereço só de espaços é endereço em branco — sai impresso vazio no rodapé.
  it('endereço em branco não conta como preenchido', () => {
    const r = faltasDoPrimeiroUso({ ...cheio, prefs: { estabelecimento: { endereco: '   ' } } });
    expect(r.faltaEndereco).toBe(true);
  });

  it('aguenta prefs e pessoas ausentes sem quebrar', () => {
    expect(faltasDoPrimeiroUso({ ehDiretoria: true }).mostrar).toBe(true);
  });
});

// =====================================================================
//  Consulta que falha não pode tirar o acesso de quem paga
//
//  O dono viu "Falta liberarmos o seu acesso" aparecer e sumir no meio do uso,
//  com a assinatura em dia no banco. A causa: quando a linha do restaurante
//  não pode ser lida (sem internet, RLS oscilando), a sessão chega com todas
//  as datas nulas — e a régua lia isso como "nunca foi liberada".
//
//  Ausência de dado não é dado.
// =====================================================================
