// =====================================================================
//  Produto contratado — O QUE A CONTA COMPROU
//
//  Existem dois produtos comerciais saindo deste mesmo código:
//    • 'etiquetas' — Aurum Etiquetas: só imprimir, cadastrar itens e
//                    acompanhar validade. É o produto de entrada.
//    • 'completo'  — Aurum Cozinha Pro: tudo, incluindo estoque.
//
//  ⚠️ ESTE É O TERCEIRO EIXO DE GATING DO APP, e os três respondem a
//  perguntas DIFERENTES. Confundi-los é como o próximo bug nasce:
//
//    temRecurso(modulo, x)          → em que tipo de COZINHA estou?   (modulos.js)
//    pode(sessao, permissoes, x)    → o que meu CARGO deixa fazer?    (permissoes.js)
//    produtoTem(produto, x)         → o que a CONTA comprou?          (aqui)
//
//  Foi avaliado reaproveitar RECURSOS_MODULO com um tipo de estoque
//  'etiquetas' em vez de criar este arquivo. Descartado por um motivo
//  concreto: as chaves dos documentos são namespeadas por módulo, então o
//  catálogo viraria 'etiquetas::produtos' — e no dia do upgrade o cliente
//  abriria a Cozinha de Produção e veria o catálogo VAZIO, com os itens dele
//  vivos no banco e nenhuma tela alcançando, sem erro nenhum. Rodando no
//  módulo 'producao' raiz, o upgrade é só trocar a coluna.
//
//  ⚠️ NOME. É `produto`, nunca `plano`: PLANOS (assinatura.js) já significa a
//  DURAÇÃO paga (mensal/semestral/anual). Os eixos são independentes —
//  existe "etiquetas anual" e "completo mensal".
//
//  Isto é trava de INTERFACE, como as permissões. A barreira dura que importa
//  é o cliente não conseguir trocar o próprio produto, e essa está no banco:
//  `restaurantes` só tem policy de SELECT, e definir_produto exige
//  sou_super_admin() (migração 27).
// =====================================================================

export const PRODUTO_PADRAO = 'completo';

export const RECURSOS_PRODUTO = {
  etiquetas: {
    etiquetas: true,          // imprimir etiqueta (catálogo + avulsas)
    itens: true,              // cadastro próprio de itens
    biblioteca: true,         // itens prontos para adicionar com um toque
    // ⚠️ NÃO GUARDA O QUE FOI IMPRESSO. Cada etiqueta impressa virava uma linha
    // gravada e enviada ao servidor — e quem lê essas linhas são a contagem por
    // câmera do Inventário e a tela de Validades, DUAS TELAS QUE ESTE PRODUTO
    // NÃO TEM. Cinquenta etiquetas num dia eram cinquenta registros para
    // ninguém. Aqui se imprime e pronto.
    //
    // ⚠️ Esta chave já se chamou `validadesEtiqueta: true` e era MENTIRA: nada
    // no app a consultava, e o produto tinha perdido a tela de validades. Flag
    // que ninguém lê não fica só inútil — ela fica errada em silêncio e alguém
    // toma decisão em cima dela depois.
    historicoEtiquetas: false,
    configEtiqueta: true,     // tamanho, campos, QR, armazenamentos
    equipe: true,             // responsáveis pela etiqueta
    // o que este produto NÃO comprou
    estoque: false, lotes: false, receitas: false, relatorios: false,
    financeiro: false, multiEstoque: false, administracao: false,
    inventario: false, compras: false, fecharTurno: false,
  },
  completo: {
    etiquetas: true, itens: true, biblioteca: true, historicoEtiquetas: true,
    configEtiqueta: true, equipe: true,
    estoque: true, lotes: true, receitas: true, relatorios: true,
    financeiro: true, multiEstoque: true, administracao: true,
    inventario: true, compras: true, fecharTurno: true,
  },
};

/**
 * A conta comprou este recurso?
 *
 * ⚠️ ESTRITO (`=== true`), pela mesma razão que temRecurso é: recurso ausente
 * ou nome digitado errado NÃO pode ligar tela sozinho. Um `!== false` aqui
 * faria `produtoTem('etiquetas', 'relatoriosFinanceiros')` — chave que não
 * existe — devolver true e abrir a tela para quem não pagou por ela.
 */
export const produtoTem = (produto, recurso) =>
  (RECURSOS_PRODUTO[produto] || RECURSOS_PRODUTO[PRODUTO_PADRAO])[recurso] === true;

/**
 * Produto EFETIVO da tela, considerando o modo suporte.
 *
 * ⚠️ Sem o ramo do `impersonando`, o suporte quebra: a sessão continua sendo a
 * do super-admin, que não tem restauranteId nem produto, então cairia em
 * 'completo'. O suporte abriria o app inteiro dentro de uma conta de
 * etiquetas — com estoque vazio, porque aquele cliente nunca lançou nada — e
 * sairia diagnosticando um problema que não existe. Mesmo padrão que o
 * AppContext já usa para resolver o `rid` do impersonado.
 */
export function produtoAtivo(sessao, impersonando = null) {
  return impersonando?.produto || sessao?.produto || PRODUTO_PADRAO;
}

/** Atalho de leitura para as telas: esta conta é do produto menor? */
export const soEtiquetas = (produto) => produto === 'etiquetas';

/**
 * O que gravar nas prefs quando o produto da conta muda debaixo do cliente.
 *
 * ⚠️ A conta sobe de plano no painel do super-admin, longe do cliente: do lado
 * dele o app amanhece com telas novas e o estoque zerado. Marcar a virada é o
 * que deixa o app dizer "seus itens estão aqui, falta a quantidade" em vez de
 * parecer que o cadastro se perdeu.
 *
 * `visto` desconhecido (conta que nunca gravou a marca) só REGISTRA onde está:
 * sem isso, o primeiro deploy daria boas-vindas de upgrade a todo mundo.
 * Devolve `null` quando não há nada a gravar.
 */
export function marcaDeUpgrade(visto, atual, data) {
  if (!atual || visto === atual) return null;
  if (visto === 'etiquetas' && atual === 'completo') return { produtoVisto: atual, upgradeEm: data };
  return { produtoVisto: atual };
}
