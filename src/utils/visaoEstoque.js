// Ler QUALQUER estoque sem trocar o que está aberto.
//
// Por que existe: a Administração precisa mostrar o relatório do Estoque Seco
// enquanto a cozinha continua com a Produção aberta no mesmo aparelho. Antes o
// cartão chamava setModulo() e a área operacional trocava embaixo do usuário —
// clicar num relatório mudava o estoque em que a equipe ia lançar. É um jeito
// silencioso de alguém registrar entrada no lugar errado.
//
// Custa ZERO rede: o cliente já baixa todos os registros e todos os documentos
// da conta numa query só e joga fora o que não é do módulo ativo. Aqui a gente
// aproveita o que já está na mão. É a mesma base do balanço consolidado.

import { lerTipo, ehTipoGlobal, chaveModulo, catalogoDe, tipoBase, MODULO_PADRAO } from './modulos';
import { calcEstoquePuro } from './estoque';

const PARA_LISTA = {
  compra: 'compras', entrada: 'entradas', saida: 'saidas',
  apara: 'aparas', perda: 'desperdicio', ajuste: 'ajustes',
};

const vazio = () => ({ compras: [], entradas: [], saidas: [], aparas: [], desperdicio: [], ajustes: [], recebimentos: [] });

/**
 * Fatia os registros brutos por estoque, de uma vez só.
 *
 * Uma passada para N estoques em vez de N passadas — com vários estoques e um
 * ano de lançamentos, a diferença aparece no tablet.
 *
 * `linhaParaRegistro` é injetada porque a conversão linha-do-banco → registro
 * vive no AppContext e depende de detalhes de lá; passar a função mantém este
 * arquivo puro e testável.
 */
export function fatiarPorEstoque(linhas, idsDosEstoques, linhaParaRegistro) {
  const porEstoque = {};
  (idsDosEstoques || []).forEach(id => { porEstoque[id] = vazio(); });

  (linhas || []).forEach(linha => {
    if (!linha) return;
    const { modulo: mod, tipo } = lerTipo(linha.tipo);
    if (ehTipoGlobal(tipo)) return;          // auditoria é da conta, não de um estoque
    const reg = linhaParaRegistro(linha);

    // A saída da produção destinada a uma finalização É o recebimento dela.
    // Fonte única: corrigir ou apagar a saída acompanha do outro lado, porque
    // não existe uma segunda linha para dessincronizar.
    if (tipoBase(mod) === MODULO_PADRAO && tipo === 'saida' && porEstoque[reg.destino]) {
      porEstoque[reg.destino].recebimentos.push(reg);
    }

    const destino = porEstoque[mod];
    if (!destino) return;                    // estoque que não pedimos
    const lista = PARA_LISTA[tipo];
    if (lista) destino[lista].push(reg);
  });

  return porEstoque;
}

/**
 * Visão completa de um estoque: catálogo, saldo e listas.
 *
 * `metas` sobrepõe o mín/máx do catálogo compartilhado — é o que faz cada
 * estoque ter a sua própria meta para o mesmo produto.
 */
export function visaoDoEstoque({ id, docs, registrosFatiados, padroes, aplicarMetas }) {
  const chaveCat = (nome) => chaveModulo(catalogoDe(id), nome);
  const chaveMod = (nome) => chaveModulo(id, nome);

  const catalogo = docs?.[chaveCat('produtos')] ?? padroes?.produtos ?? [];
  const metas = docs?.[chaveMod('metas')] ?? {};
  const produtos = aplicarMetas ? aplicarMetas(catalogo, metas) : catalogo;

  const regs = registrosFatiados?.[id] || vazio();
  const estoque = calcEstoquePuro({
    produtos,
    entradas: [...regs.entradas, ...regs.recebimentos],
    saidas: regs.saidas,
    ajustes: regs.ajustes,
    desperdicio: regs.desperdicio,
  });

  return { id, produtos, metas, estoque, ...regs };
}

/**
 * Catálogo compartilhado + metas DESTE estoque.
 *
 * O mín/máx é a única coisa do produto que muda de estoque para estoque: o
 * Restaurante Y pode querer 20 pacotes de arroz de mínimo onde o X quer 4. Nome,
 * categoria, unidade e validade continuam vindo do cadastro compartilhado — o
 * mesmo item, com metas diferentes.
 *
 * ⚠️ Devolve a MESMA referência quando não há meta nenhuma, e reusa o objeto do
 * produto quando a meta é igual à do catálogo. Sem isso, todo useMemo que
 * depende de `produtos` (Dashboard, Produção, Compras, NavBar) invalidaria a
 * cada render — perceptível num tablet barato.
 */
export function comMetas(catalogo, metas) {
  const lista = Array.isArray(catalogo) ? catalogo : [];
  const ids = metas ? Object.keys(metas) : [];
  if (!ids.length) return lista;

  // ⚠️ `Number(null)` é 0, e 0 é finito — usar Number.isFinite sozinho fazia uma
  // meta ausente virar ZERO em vez de cair para o catálogo. E zero é um mínimo
  // LEGÍTIMO ("não quero manter estoque deste item"), então não dá para tratar
  // ausência e zero como a mesma coisa.
  const numero = (v, padrao) => {
    if (v === null || v === undefined || v === '') return padrao;
    const n = Number(v);
    return Number.isFinite(n) ? n : padrao;
  };

  let mudou = false;
  const saida = lista.map(p => {
    const m = metas[p?.id];
    if (!m) return p;
    const min = numero(m.min, p.min);
    const max = numero(m.max, p.max);
    if (p.min === min && p.max === max) return p;
    mudou = true;
    return { ...p, min, max };
  });
  return mudou ? saida : lista;
}

/**
 * Separa uma gravação de produtos em: o que vai para o CATÁLOGO compartilhado e
 * o que vai para as METAS deste estoque.
 *
 * Existe para `setProdutos` continuar sendo chamado igual em todas as telas
 * (Configurações, importação de planilha, sugestão do Dashboard, auto-mín/máx).
 * Sem isso, cada uma teria que saber da separação — e uma que esquecesse
 * gravaria o mín do Restaurante Y por cima do X, em silêncio.
 *
 * Devolve `{ catalogo, metas }`, cada um `null` quando não mudou nada.
 */
export function separarMetas(catalogoAtual, novaLista, metasAtuais) {
  const atual = Array.isArray(catalogoAtual) ? catalogoAtual : [];
  const nova = Array.isArray(novaLista) ? novaLista : [];
  const porIdAtual = new Map(atual.map(p => [p.id, p]));

  const metas = { ...(metasAtuais || {}) };
  let metasMudou = false;
  let catalogoMudou = false;

  const catalogo = nova.map(p => {
    const antigo = porIdAtual.get(p.id);
    // Produto NOVO entra no catálogo com o mín/máx que veio — catálogo é
    // compartilhado, e um item recém-criado precisa nascer igual em todos.
    if (!antigo) { catalogoMudou = true; return p; }

    const metaAtual = metas[p.id];
    const minEfetivo = metaAtual?.min ?? antigo.min;
    const maxEfetivo = metaAtual?.max ?? antigo.max;

    if (p.min !== minEfetivo || p.max !== maxEfetivo) {
      metas[p.id] = { min: p.min, max: p.max };
      metasMudou = true;
    }

    // o resto do produto (nome, categoria, unidade, validade…) é compartilhado
    const semMetas = { ...p, min: antigo.min, max: antigo.max };
    for (const campo of Object.keys(semMetas)) {
      if (JSON.stringify(semMetas[campo]) !== JSON.stringify(antigo[campo])) { catalogoMudou = true; break; }
    }
    return semMetas;
  });

  if (nova.length !== atual.length) catalogoMudou = true;

  return {
    catalogo: catalogoMudou ? catalogo : null,
    metas: metasMudou ? metas : null,
  };
}

/**
 * BALANÇO CONSOLIDADO — soma os estoques do MESMO TIPO.
 *
 * Só funciona porque o catálogo é compartilhado por tipo: somar por `produtoId`
 * exige que o id seja o mesmo dos dois lados. A decisão de compartilhar o
 * cadastro é literalmente o que torna esta tela possível.
 *
 * ⚠️ NÃO consolida entre tipos diferentes. "Queijo" na Produção e "Queijo" no
 * Seco são ids distintos, e casar por NOME é chute que produz número errado com
 * cara de certo — o pior defeito possível num balanço, porque ninguém desconfia
 * de um total. Se um dia for preciso, pede um campo de equivalência no catálogo,
 * com curadoria manual.
 *
 * Arquivado ENTRA na soma: o estoque saiu do seletor, mas o que está lá dentro
 * continua sendo mercadoria da casa. Some da tela só quem quiser esconder.
 */
export function balancoConsolidado(estoques, visoes) {
  const familias = [];

  const tipos = [...new Set((estoques || []).map(e => e.tipo))];
  for (const tipo of tipos) {
    const doTipo = (estoques || []).filter(e => e.tipo === tipo);
    if (doTipo.length < 2) continue;   // um estoque só não é consolidação

    const porProduto = {};
    doTipo.forEach(e => {
      const v = visoes?.[e.id];
      if (!v) return;
      (v.produtos || []).forEach(p => {
        if (!p || p.ativo === false) return;
        const qtd = Number(v.estoque?.[p.id]) || 0;
        if (!porProduto[p.id]) {
          porProduto[p.id] = { id: p.id, nome: p.nome, unidade: p.unidade, total: 0, porEstoque: {} };
        }
        porProduto[p.id].porEstoque[e.id] = qtd;
        porProduto[p.id].total += qtd;
      });
    });

    const itens = Object.values(porProduto)
      .filter(i => i.total !== 0 || Object.values(i.porEstoque).some(q => q !== 0))
      .sort((a, b) => b.total - a.total);

    familias.push({ tipo, estoques: doTipo, itens });
  }

  return familias;
}
