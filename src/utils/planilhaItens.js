// =====================================================================
//  PLANILHA DE ITENS (Lote 4 da auditoria, 14/10/2026)
//
//  Morava em Configurações → Sistema e mexia no MESMO catálogo de Meus itens,
//  então a pessoa tinha dois caminhos para a mesma lista e achava um só.
//  Agora é um botão dentro de Meus itens, nos dois planos. Funções PURAS aqui;
//  a leitura e a escrita do .xlsx ficam na tela.
//
//  ⚠️ O QUE MUDOU EM RELAÇÃO À VERSÃO ANTIGA, e cada item foi um defeito real:
//   • O modelo vinha preenchido com os 55 itens do restaurante Polo, com o
//     mínimo e o máximo de lá. Quem preenchia embaixo importava os 55 junto.
//     Agora a planilha sai com os itens DA CONTA (ou vazia), e serve para
//     editar tudo no Excel e importar de volta.
//   • A mescla era um Map por nome: dois itens com o MESMO nome viravam um, e
//     o outro sumia do catálogo ao importar.
//   • Coluna ausente gravava ZERO por cima do valor do item (o mínimo de quem
//     importava uma planilha sem a coluna "Mínimo" ia a 0).
//   • O prazo ia para `valCongelado`, mas o item editado em Meus itens guarda
//     o prazo em `prazos` — que vence na leitura. A planilha "importava" o
//     prazo novo e a etiqueta continuava saindo com o velho.
//   • Unidade fora de kg/unid/g/L virava "kg" ("un" contado por peça passava
//     a ser pesado).
//   • Os prazos eram só congelado e resfriado; agora é uma coluna por
//     armazenamento ligado na casa (refrigerado, ambiente...).
// =====================================================================

import { comEspelhoDePrazos } from './armazenamento';
import { gramasDeMedida } from './etiquetas';
import { normalizarUnidade, controlaEstoque, controlaPorPadrao } from './itens';

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = (s) => semAcento(s).toLowerCase().trim();
const numBR = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const texto = (v) => String(v ?? '').trim();

/** A coluna de prazo de um armazenamento: "Prazo Congelado (dias)". */
export const tituloPrazo = (a) => `Prazo ${a.nome} (dias)`;

/**
 * As colunas do modelo, na ordem em que saem.
 * `comEstoque`: plano Pro (mínimo, máximo, cocção...). No plano Etiquetas a
 * planilha fica só com o que a etiqueta usa — coluna de estoque ali seria
 * pergunta sobre algo que a conta não tem.
 */
export function colunasDoModelo({ armazenamentos = [], comEstoque = false } = {}) {
  const cols = [
    { k: 'nome', t: 'Nome *', g: 'ITEM' },
    { k: 'categoria', t: 'Grupo *', g: 'ITEM' },
    { k: 'unidade', t: 'Unidade * (kg/g/L/mL/unid)', g: 'ITEM' },
    { k: 'medidaPadrao', t: 'Medida padrão (ex.: 150 g)', g: 'ETIQUETA' },
    { k: 'tipoData', t: 'Data na etiqueta (manipulação/abertura)', g: 'ETIQUETA' },
    ...armazenamentos.map(a => ({ k: `prazo:${a.id}`, t: tituloPrazo(a), g: 'ETIQUETA' })),
    { k: 'marca', t: 'Marca/Fornecedor', g: 'ETIQUETA' },
    { k: 'sif', t: 'SIF', g: 'ETIQUETA' },
  ];
  if (comEstoque) {
    cols.push(
      { k: 'controlaEstoque', t: 'Controla estoque (sim/não)', g: 'ESTOQUE' },
      { k: 'estoqueInicial', t: 'Estoque inicial', g: 'ESTOQUE' },
      { k: 'min', t: 'Mínimo', g: 'ESTOQUE' },
      { k: 'max', t: 'Máximo', g: 'ESTOQUE' },
      { k: 'pesoUnidade', t: 'Peso por unidade (g)', g: 'ESTOQUE' },
      { k: 'coccao', t: 'Perda na cocção (%)', g: 'PRODUÇÃO' },
      { k: 'entradaCozida', t: 'Entra cozido (sim/não)', g: 'PRODUÇÃO' },
    );
  }
  return cols;
}

/** Uma linha da planilha para um item da conta (o "baixar meus itens"). */
export function linhaDoItem(p, colunas) {
  const prazos = { congelado: p.valCongelado || 0, resfriado: p.valResfriado || 0, ...(p.prazos || {}) };
  return colunas.map(({ k }) => {
    if (k.startsWith('prazo:')) return Number(prazos[k.slice(6)]) || '';
    switch (k) {
      case 'tipoData': return p.tipoData === 'abertura' ? 'abertura' : 'manipulação';
      case 'controlaEstoque': return controlaEstoque(p) ? 'sim' : 'não';
      case 'entradaCozida': return p.entradaCozida ? 'sim' : 'não';
      case 'medidaPadrao': return p.medidaPadrao || (p.gramatura > 0 ? `${p.gramatura} g` : '');
      case 'estoqueInicial': case 'min': case 'max': case 'pesoUnidade': case 'coccao':
        return Number(p[k]) || '';
      default: return p[k] ?? '';
    }
  });
}

// Qual campo cada cabeçalho é. Por palavra-chave, para aceitar a planilha
// antiga (Validade congelado, Categoria, Gramatura) e colunas fora de ordem.
// ⚠️ A ORDEM DOS TESTES IMPORTA: "Peso por unidade" antes de "unidade",
// "Controla estoque" antes de "estoque".
function campoDoCabecalho(h, armazenamentos) {
  const c = chave(h).replace(/\*/g, '').trim();
  if (!c) return null;
  if (/^nome\b/.test(c)) return 'nome';
  if (c.includes('categoria') || /^grupo\b/.test(c)) return 'categoria';
  if (c.includes('controla')) return 'controlaEstoque';
  if (c.includes('peso')) return 'pesoUnidade';
  if (c.includes('unidade')) return 'unidade';
  if (c.includes('medida')) return 'medidaPadrao';
  if (c.includes('gramatura')) return 'gramatura';
  if (c.includes('data na etiqueta') || c === 'data') return 'tipoData';
  if (c.includes('estoque')) return 'estoqueInicial';
  if (/^min/.test(c)) return 'min';
  if (/^max/.test(c)) return 'max';
  if (c.includes('coccao')) return 'coccao';
  if (c.includes('cozid')) return 'entradaCozida';
  if (c.includes('marca') || c.includes('fornecedor')) return 'marca';
  if (/\bsif\b/.test(c)) return 'sif';
  // prazo: "Prazo Refrigerado (dias)" ou o antigo "Validade congelado (dias)".
  // Igualdade do NOME, nunca "contém": "Congelado" não pode casar com
  // "Ultracongelado", nem "Frio" com "Frios e laticínios".
  const resto = c.replace(/\(dias\)|\bdias\b|\bprazo\b|\bvalidade\b|[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const a = armazenamentos.find(x => chave(x.nome) === resto || chave(x.id) === resto);
  if (a) return `prazo:${a.id}`;
  if (resto === 'congelado' || resto === 'resfriado') return `prazo:${resto}`;
  return null;
}

const simNao = (v) => {
  const t = chave(v);
  if (/^s/.test(t)) return true;
  if (/^n/.test(t)) return false;
  return undefined;
};

/**
 * Lê as linhas cruas (array de arrays, como o xlsx devolve) e devolve os itens.
 *
 * ⚠️ Só vêm no item os campos cujas COLUNAS EXISTEM na planilha — é isso que
 * impede a coluna ausente de zerar o valor que o item já tinha. Dentro de uma
 * coluna que existe, a célula vazia vale: número vazio é zero, texto vazio
 * apaga (marca, SIF, medida). Grupo, unidade e as colunas de sim/não vazios
 * NÃO mexem — são obrigatórios, ou trocar de valor por esquecimento seria
 * pior que não trocar.
 *
 * Devolve { itens, erro }.
 */
export function lerPlanilhaDeItens(rows, { armazenamentos = [] } = {}) {
  const linhas = Array.isArray(rows) ? rows : [];
  const iCab = linhas.findIndex(r => Array.isArray(r) && r.some(c => /^nome\b/i.test(semAcento(c).trim())));
  const semNome = { itens: [], erro: 'Não encontrei a coluna "Nome". Use a planilha baixada aqui.' };
  if (iCab < 0) return semNome;
  const campos = linhas[iCab].map(h => campoDoCabecalho(h, armazenamentos));
  if (!campos.includes('nome')) return semNome;

  const itens = [];
  linhas.slice(iCab + 1).forEach(r => {
    if (!Array.isArray(r)) return;
    const item = {};
    const prazos = {};
    campos.forEach((campo, i) => {
      if (!campo) return;
      const v = r[i];
      if (campo.startsWith('prazo:')) { prazos[campo.slice(6)] = Math.max(0, Math.round(numBR(v))); return; }
      switch (campo) {
        case 'nome': item.nome = texto(v); break;
        case 'categoria': if (texto(v)) item.categoria = texto(v).toUpperCase(); break;
        case 'unidade': if (texto(v)) item.unidade = normalizarUnidade(v); break;
        case 'medidaPadrao': item.medidaPadrao = texto(v); break;
        case 'gramatura': if (numBR(v) > 0 && !item.medidaPadrao) item.medidaPadrao = `${numBR(v)} g`; break;
        case 'tipoData': {
          const t = chave(v);
          if (t.startsWith('a')) item.tipoData = 'abertura';
          else if (t.startsWith('m') || t.startsWith('f')) item.tipoData = 'fabricacao';
          break;
        }
        case 'controlaEstoque': case 'entradaCozida': {
          const b = simNao(v);
          if (b !== undefined) item[campo] = b;
          break;
        }
        case 'coccao': item.coccao = Math.min(Math.max(0, numBR(v)), 90); break;
        case 'estoqueInicial': case 'min': case 'max': case 'pesoUnidade':
          item[campo] = Math.max(0, numBR(v)); break;
        case 'marca': case 'sif': item[campo] = texto(v); break;
        default: break;
      }
    });
    if (!item.nome) return;
    // a gramatura numérica acompanha a medida, como no salvar de Meus itens
    if ('medidaPadrao' in item) item.gramatura = gramasDeMedida(item.medidaPadrao);
    if (Object.keys(prazos).length) item.prazosLidos = prazos;
    itens.push(item);
  });
  if (!itens.length) return { itens: [], erro: 'A planilha não tem nenhuma linha com nome de item.' };
  return { itens, erro: null };
}

/** Id do item criado do zero: vem do nome, com sufixo se o nome repete. */
export function idDoNome(nome, produtos = []) {
  const base = `item_${semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'sem_nome'}`;
  let id = base, n = 2;
  while (produtos.some(p => p.id === id)) id = `${base}_${n++}`;
  return id;
}

/**
 * Junta os itens lidos no catálogo. Nome igual (sem diferença de maiúscula e
 * acento) ATUALIZA o item — o primeiro ativo com aquele nome, senão o primeiro
 * removido, que volta para a lista. Nome novo vira item novo.
 *
 * ⚠️ Percorre o catálogo inteiro e só troca o item casado: item fora da
 * planilha fica como estava, e dois itens de mesmo nome continuam dois (a
 * planilha baixada traz os dois, e cada linha volta para o seu).
 *
 * `comEstoque`: plano Pro — o item novo grava a escolha de controlar estoque
 * explícita, como a ficha faz. `abertoPorPadrao`: Estoque Seco.
 */
export function mesclarItens(produtos = [], itens = [], {
  armazenamentoPadrao = 'congelado', grupoPadrao = 'OUTROS', comEstoque = false, abertoPorPadrao = false,
} = {}) {
  const lista = [...produtos];
  let criados = 0, atualizados = 0;
  const casado = new Set();
  const acha = (k, soAtivo) => lista.findIndex((p, i) =>
    !casado.has(i) && (!soAtivo || p.ativo !== false) && chave(p.nome) === k);

  itens.forEach(({ prazosLidos, ...n }) => {
    const k = chave(n.nome);
    let idx = acha(k, true);
    if (idx < 0) idx = acha(k, false);
    if (idx >= 0) {
      const ex = lista[idx];
      const junto = { ...ex, ...n, ativo: true };
      lista[idx] = prazosLidos
        ? comEspelhoDePrazos(junto, { congelado: ex.valCongelado || 0, resfriado: ex.valResfriado || 0, ...(ex.prazos || {}), ...prazosLidos })
        : junto;
      casado.add(idx);
      atualizados++;
      return;
    }
    const prazos = prazosLidos || {};
    const comPrazo = Object.entries(prazos).filter(([, v]) => v > 0).map(([id]) => id);
    const tipoData = n.tipoData || (abertoPorPadrao ? 'abertura' : 'fabricacao');
    lista.push(comEspelhoDePrazos({
      unidade: 'unid', estoqueInicial: 0, min: 0, max: 0, pesoUnidade: 0,
      marca: '', sif: '', medidaPadrao: '', gramatura: 0,
      armazenamentoPadrao: comPrazo.length === 1 ? comPrazo[0] : armazenamentoPadrao,
      ...n,
      categoria: n.categoria || grupoPadrao,
      tipoData,
      ...(comEstoque ? { controlaEstoque: n.controlaEstoque ?? controlaPorPadrao(tipoData, abertoPorPadrao) } : {}),
      id: idDoNome(n.nome, lista),
      ativo: true,
    }, prazos));
    casado.add(lista.length - 1);
    criados++;
  });
  return { produtos: lista, criados, atualizados };
}
