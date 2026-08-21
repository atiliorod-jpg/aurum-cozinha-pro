// Registro dos ESTOQUES da conta — os três de sempre mais os que o dono criar.
//
// Onde vive: documento `estoques`, da conta (sem namespace), gravável só pela
// diretoria (migração 22). Funções PURAS aqui — sem React, sem rede.
//
// ⚠️ AS RAÍZES NÃO SÃO GRAVADAS. Os três estoques originais (producao, seco,
// finalizacao) são SINTETIZADOS na leitura, a partir de MODULOS. Consequência
// que importa: conta que nunca criou instância não tem documento `estoques`
// nenhum, o seletor continua mostrando os três de sempre, e não existe nada
// para migrar. O documento só guarda o que FOGE do padrão — instâncias novas e
// personalizações de nome.

import { MODULOS, moduloPorId, tipoBase, ehIdInstancia } from './modulos';

const texto = (v) => String(v ?? '').trim();

/**
 * Lista de estoques para o seletor e para o balanço, na ordem dos tipos.
 *
 * Cada item: { id, tipo, raiz, nome, estabelecimento, icone, descricao, arquivado }
 */
export function listarEstoques(doc) {
  const salvos = Array.isArray(doc?.itens) ? doc.itens.filter(Boolean) : [];
  const porId = new Map(salvos.map(i => [i.id, i]));

  const lista = [];
  for (const m of MODULOS) {
    // a raiz do tipo, com nome personalizado se houver
    const custom = porId.get(m.id);
    lista.push({
      id: m.id,
      tipo: m.id,
      raiz: true,
      icone: m.icone,
      descricao: m.descricao,
      nome: texto(custom?.nome) || m.label,
      estabelecimento: texto(custom?.estabelecimento),
      // Raiz NUNCA arquiva: ela é o destino de queda quando uma instância some,
      // e é onde moram os dados de quem usa o app desde antes das instâncias.
      arquivado: false,
    });
    // e as instâncias daquele tipo, na ordem em que foram criadas
    salvos
      .filter(i => ehIdInstancia(i.id) && tipoBase(i.id) === m.id)
      .sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0))
      .forEach(i => lista.push({
        id: i.id,
        tipo: m.id,
        raiz: false,
        icone: m.icone,
        descricao: m.descricao,
        nome: texto(i.nome) || `${m.label} (${i.id.split('#')[1]})`,
        estabelecimento: texto(i.estabelecimento),
        criadoEm: i.criadoEm || 0,
        arquivado: !!i.arquivado,
      }));
  }
  return lista;
}

/** Só os que aparecem no seletor (arquivado sai de vista, não some do histórico). */
export const estoquesAtivos = (lista) => (lista || []).filter(e => !e.arquivado);

/** Acha um estoque pelo id; cai na raiz do tipo quando não existe. */
export function acharEstoque(lista, id) {
  const achado = (lista || []).find(e => e.id === id);
  if (achado) return achado;
  const base = tipoBase(id);
  return (lista || []).find(e => e.id === base) || (lista || [])[0] || null;
}

/**
 * Nome do estabelecimento que vai na ETIQUETA IMPRESSA.
 *
 * Opcional por estoque, com queda para o nome da conta — decisão do dono: quem
 * tem uma casa só continua com um nome só e não precisa preencher nada; quem
 * tem duas põe o nome em cada estoque e a etiqueta sai certa em cada casa.
 *
 * Importa porque a etiqueta é impressa e vai para o pote: sair com o nome do
 * outro restaurante é erro visível na frente do cliente.
 */
export function estabelecimentoDe(estoque, estabelecimentoDaConta) {
  return texto(estoque?.estabelecimento) || texto(estabelecimentoDaConta);
}

/**
 * Aplica uma mudança ao documento, preservando o que não foi tocado.
 *
 * Guarda a RAIZ no documento só quando ela tem personalização — assim quem
 * nunca renomeou nada continua sem documento, e o padrão continua vindo do
 * código.
 */
export function salvarEstoque(doc, { id, nome, estabelecimento, arquivado, tipo, criadoEm }) {
  const itens = Array.isArray(doc?.itens) ? [...doc.itens] : [];
  const i = itens.findIndex(x => x && x.id === id);
  const anterior = i >= 0 ? itens[i] : null;

  const novo = {
    id,
    tipo: tipo || anterior?.tipo || tipoBase(id),
    nome: nome !== undefined ? texto(nome) : texto(anterior?.nome),
    estabelecimento: estabelecimento !== undefined ? texto(estabelecimento) : texto(anterior?.estabelecimento),
    arquivado: arquivado !== undefined ? !!arquivado : !!anterior?.arquivado,
    criadoEm: anterior?.criadoEm || criadoEm || 0,
  };

  // Raiz sem personalização nenhuma não precisa ocupar espaço no documento.
  const ehRaizVazia = !ehIdInstancia(id) && !novo.nome && !novo.estabelecimento;
  if (ehRaizVazia) {
    return { ...(doc || {}), versao: 1, itens: itens.filter(x => x && x.id !== id) };
  }

  if (i >= 0) itens[i] = novo; else itens.push(novo);
  return { ...(doc || {}), versao: 1, itens };
}

/**
 * O estoque aberto ainda vale?
 *
 * O id fica no APARELHO (`pe::modulo`), não na conta. Um tablet que estava no
 * 'seco#x7k2' e foi levado para outra unidade abriria o estoque errado; e um id
 * arquivado continuaria sendo aceito pela validação de formato, deixando a
 * pessoa operar um estoque que ninguém mais vê.
 *
 * Devolve o id que DEVE ser usado — cai na raiz do tipo quando o atual não
 * serve. Quem chama avisa na tela, senão a troca parece bug.
 */
export function moduloUtilizavel(lista, idAtual) {
  const e = (lista || []).find(x => x.id === idAtual);
  if (e && !e.arquivado) return idAtual;
  const base = tipoBase(idAtual);
  const raiz = (lista || []).find(x => x.id === base && !x.arquivado);
  return raiz ? raiz.id : ((lista || []).find(x => !x.arquivado)?.id || MODULOS[0].id);
}

/** Rótulo curto para cabeçalho e seletor. */
export const rotuloEstoque = (e) => {
  if (!e) return '';
  const est = texto(e.estabelecimento);
  return est ? `${e.nome} · ${est}` : e.nome;
};

export { moduloPorId };

/**
 * Destinos de saída FIXOS de uma instância de Produção: um por Cozinha de
 * Finalização viva.
 *
 * É isto que dispensa qualquer tabela de mapeamento — o id do destino É o id da
 * instância, então a ponte vira uma comparação direta. Com uma finalização só,
 * o resultado é idêntico ao destino fixo que existia antes.
 *
 * ⚠️ Só para instâncias de PRODUÇÃO. A ponte lê saídas da produção; um destino
 * "Cozinha de Finalização" oferecido no Estoque Seco seria um beco sem saída —
 * a pessoa manda o mantimento e ele não aparece em lugar nenhum, em silêncio.
 */
export function destinosFinalizacao(estoques, moduloAtivo) {
  if (tipoBase(moduloAtivo) !== MODULOS[0].id) return [];
  return estoquesAtivos(estoques)
    .filter(e => e.tipo === 'finalizacao')
    .map(e => ({ id: e.id, nome: e.nome, fixo: true }));
}

/**
 * Lista de destinos a semear: os editáveis do padrão + os fixos derivados.
 *
 * Os fixos vêm SEMPRE do registro, nunca do CAT — senão uma finalização criada
 * hoje não viraria destino nas contas que já têm o documento `locais` gravado
 * (o semeador só roda quando o documento não existe). É o mesmo buraco que
 * `mesclarFixos` foi criada para tapar.
 */
export function locaisPadrao(locaisDoCatalogo, estoques, moduloAtivo) {
  const editaveis = (locaisDoCatalogo || []).filter(l => l && !l.fixo);
  return [...editaveis, ...destinosFinalizacao(estoques, moduloAtivo)];
}
