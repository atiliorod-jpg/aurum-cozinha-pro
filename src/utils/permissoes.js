// =====================================================================
//  Permissões por função (cargo) — configuráveis pela diretoria
//
//  Modelo: a DIRETORIA (quem cria o restaurante já entra assim) e o
//  super-admin SEMPRE podem tudo. Para "cozinha" e "gerência", a diretoria
//  liga/desliga capacidades numa matriz em Config → Acessos. O resultado
//  fica em permissoes (sincroniza pela nuvem, como as demais prefs).
//
//  IMPORTANTE (honestidade de segurança): isto é, em geral, uma trava de
//  INTERFACE — organiza a equipe e evita acidentes num time pequeno e de
//  confiança. NÃO é barreira dura: o que precisa ser inviolável (criar
//  convite, trocar cargo, painel admin) é enforçado por cargo no banco.
//
//  EXCEÇÃO — `verFinanceiro` é barreira DURA (migração 20). A linha `precos`
//  não sai do servidor para quem não tem a capacidade: a policy de SELECT
//  chama pode_ver_financeiro(), que lê ESTA MESMA matriz. Custo de insumo é
//  margem, fornecedor e negociação — esconder no React não esconderia nada,
//  bastaria o DevTools. Por isso o preço mora na chave própria `precos`, e
//  não dentro de `produtos`: o catálogo a cozinha precisa ver.
// =====================================================================

// Capacidades que a diretoria pode conceder/retirar. `grupo` só organiza a UI.
//
// ⚠️ `etiquetas: true` marca o que EXISTE no plano Aurum Etiquetas. Sem essa
// marca a tela de acessos daquele plano oferecia relatório, inventário,
// remover lançamentos e ver custos — telas que a conta nem comprou. Ligar
// qualquer uma não mudava nada, e o dono ficava procurando onde apareceria o
// relatório que ele acabou de liberar. Permissão para tela que não existe não
// é inofensiva: é uma promessa falsa dentro da tela de configuração.
//
// O texto de cada uma também muda com o plano: no Etiquetas não há "produtos e
// receitas" nem "destinos de saída", há itens e etiqueta.
export const CAPACIDADES = [
  { id: 'removerRegistros',  grupo: 'Operação', label: 'Remover lançamentos do histórico',
    desc: 'Apagar entradas, saídas, produções e compras já registradas.' },
  { id: 'inventario',        grupo: 'Operação', label: 'Fazer inventário / contagem física',
    desc: 'Ajustar o estoque para o valor contado na prateleira.' },
  { id: 'verRelatorio',      grupo: 'Gestão',   label: 'Ver relatório',
    desc: 'Consumo, giro e lista de compras. Pode imprimir ou salvar em PDF.' },
  { id: 'verAuditoria',      grupo: 'Gestão',   label: 'Ver histórico de mudanças',
    desc: 'Trilha de tudo que cada pessoa fez no sistema.' },
  { id: 'gerenciarProdutos', grupo: 'Gestão',   label: 'Cadastrar e editar produtos e receitas',
    desc: 'Criar/alterar itens do estoque, fichas e rendimento.',
    etiquetas: true,
    labelEtiquetas: 'Cadastrar e editar itens',
    descEtiquetas: 'Criar, alterar e remover os itens que a casa etiqueta, com prazo e armazenamento.' },
  // ⚠️ NÃO APARECE NO PLANO ETIQUETAS (sem `etiquetas: true`), e isso é
  // proposital. Lá ela se chamava "Abrir a Administração" e era uma chave
  // MORTA: a Administração daquele plano é a rota /ajustes, travada por CARGO
  // (`soDono` na NavBar e <Restrito cargo="diretoria"> no App.jsx), nunca por
  // esta capacidade. O dono ligava para a cozinha, nada mudava, e ele ficava
  // procurando o que tinha feito de errado. Oferecer chave que não liga nada é
  // o mesmo defeito do botão que leva a tela negada.
  // No plano completo ela CONTINUA valendo (Administracao.jsx e Configuracoes.jsx
  // leem `configurarSistema` de verdade).
  { id: 'configurarSistema', grupo: 'Gestão',   label: 'Configurar o sistema',
    desc: 'Destinos de saída, etiquetas, mín/máx automático e demais ajustes.' },
  { id: 'verFinanceiro',     grupo: 'Financeiro', label: 'Ver custos e preços',
    desc: 'Custo de insumo, valor do estoque e curva ABC.',
    duro: true },
  { id: 'verPerdaEmReais',   grupo: 'Financeiro', label: 'Ver quanto a perda custou (só o total)',
    desc: 'Mostra "R$ 340 no lixo este mês" para a equipe, sem abrir a tabela de custos. O servidor calcula e devolve só o total — a quebra por item revelaria o custo de cada insumo.',
    duro: true },
];

/** As capacidades que fazem sentido no produto contratado, já com o texto dele. */
export function capacidadesDoProduto(soEtiquetas) {
  if (!soEtiquetas) return CAPACIDADES;
  return CAPACIDADES.filter(c => c.etiquetas).map(c => ({
    ...c,
    label: c.labelEtiquetas || c.label,
    desc: c.descEtiquetas || c.desc,
  }));
}

// Padrão por cargo — reproduz EXATAMENTE o modelo hierárquico anterior
// (cozinha operacional; gerência com gestão). Se permissoes não trouxer
// uma chave, cai aqui — então bancos/contas antigas não mudam de comportamento.
export const PERMISSOES_PADRAO = {
  cozinha: {
    // remover lançamentos é ação delicada — por padrão só gerência+; a diretoria
    // pode liberar para a cozinha na matriz de permissões (Config → Acessos).
    removerRegistros: false, inventario: false, verRelatorio: false,
    verAuditoria: false, gerenciarProdutos: false, configurarSistema: false,
    // quem opera o estoque não vê custo por padrão — decisão do dono
    verFinanceiro: false,
    // desligado por padrão, mas é o que a diretoria costuma querer ligar: ver o
    // custo do desperdício muda comportamento de equipe sem abrir a planilha
    verPerdaEmReais: false,
  },
  gerencia: {
    removerRegistros: true, inventario: true, verRelatorio: true,
    verAuditoria: true, gerenciarProdutos: true, configurarSistema: true,
    // nem a gerência: financeiro é liberado item a item pela diretoria, porque
    // é o único dado aqui cuja exposição não tem volta (margem e fornecedor)
    verFinanceiro: false,
    verPerdaEmReais: false,
  },
};

// Fonte da verdade da UI: pode a sessão atual fazer `cap`?
/**
 * ⚠️ ORDEM DE RESOLUÇÃO, e ela não é arbitrária:
 *
 *   1. exceção da CONTA      — "a Maria é cozinha, mas vê o relatório"
 *   2. cargo INVENTADO pelo dono ("Confeiteiro")
 *   3. cargo BASE            — cozinha ou gerência
 *   4. padrão de fábrica
 *
 * A exceção vem antes do cargo porque exceção que perde para a regra geral não
 * é exceção. E o cargo inventado vem antes da base porque é ele que o dono
 * enxerga na tela — se a base ganhasse, ele desligaria algo em "Confeiteiro" e
 * continuaria valendo, sem entender por quê.
 *
 * ⚠️ O CARGO INVENTADO NÃO ULTRAPASSA A BASE onde o BANCO decide. `cozinha` e
 * `gerencia` são níveis de segurança gravados no banco; o rótulo é só rótulo.
 * Para `verFinanceiro` e `verPerdaEmReais` — as duas travas duras — quem manda
 * no servidor é a exceção por conta, e é por isso que a tela grava essa exceção
 * sempre que o valor efetivo difere da base (ver CartaoCargos).
 */
export function pode(sessao, permissoes, cap) {
  if (!sessao) return false;
  if (sessao.eSuperAdmin) return true;
  const base = sessao.cargo;
  if (base === 'diretoria') return true;        // dono do restaurante
  const m = permissoes || {};

  const daConta = (m.porConta || {})[sessao.usuarioId] || {};
  if (daConta[cap] !== undefined) return !!daConta[cap];

  const rotulo = sessao.cargoRotulo;
  if (rotulo && rotulo !== base) {
    const doRotulo = m[rotulo] || {};
    if (doRotulo[cap] !== undefined) return !!doRotulo[cap];
  }

  const doCargo = m[base] || {};
  if (doCargo[cap] !== undefined) return !!doCargo[cap];
  return !!(PERMISSOES_PADRAO[base] || {})[cap];
}

/**
 * Todos os cargos da casa: os três de fábrica (com o nome que o dono deu) mais
 * os que ele inventou.
 *
 * ⚠️ `base` é o que vai para a coluna `cargo` do banco. O `id` só existe para a
 * matriz de permissões e para o rótulo na tela — o banco nunca vê um cargo
 * inventado, e é isso que mantém as mais de cem verificações de acesso válidas.
 */
export function cargosDaCasa(permissoes) {
  const salvos = Array.isArray(permissoes?.cargos) ? permissoes.cargos : [];
  const nomeDe = (id, padrao) => salvos.find(c => c.id === id)?.nome || padrao;
  const fixos = [
    { id: 'cozinha',   base: 'cozinha',   nome: nomeDe('cozinha', 'Cozinha'),     fixo: true },
    { id: 'gerencia',  base: 'gerencia',  nome: nomeDe('gerencia', 'Gerência'),   fixo: true },
    { id: 'diretoria', base: 'diretoria', nome: nomeDe('diretoria', 'Diretoria'), fixo: true },
  ];
  const extras = salvos
    .filter(c => !['cozinha', 'gerencia', 'diretoria'].includes(c.id))
    // ⚠️ Cargo inventado NUNCA se apoia em diretoria: seria criar uma segunda
    // conta dona por um caminho lateral, e o banco entregaria tudo a ela.
    .map(c => ({ ...c, base: c.base === 'gerencia' ? 'gerencia' : 'cozinha', fixo: false }));
  return [...fixos, ...extras];
}

// Consegue abrir a tela de Configurações? (qualquer capacidade de gestão)
export function podeAbrirConfig(sessao, permissoes) {
  if (!sessao) return false;
  if (sessao.eSuperAdmin || sessao.cargo === 'diretoria') return true;
  return ['gerenciarProdutos', 'configurarSistema', 'verRelatorio']
    .some(c => pode(sessao, permissoes, c))
    // gerência sempre entra (gerencia acessos/convites), mesmo sem cap de gestão
    || sessao.cargo === 'gerencia';
}

// Normaliza a matriz vinda das prefs para a forma completa (todas as chaves),
// partindo do padrão. Usada pela tela de edição da diretoria.
export function permissoesEfetivas(permissoes) {
  const out = {};
  for (const cargo of ['cozinha', 'gerencia']) {
    out[cargo] = { ...PERMISSOES_PADRAO[cargo], ...((permissoes && permissoes[cargo]) || {}) };
  }
  return out;
}

/**
 * Consegue abrir a ADMINISTRAÇÃO?
 *
 * Existe como função (e não repetida em cada lugar) porque a regra é usada em
 * TRÊS pontos: a rota em App.jsx, o item da barra inferior e o cartão do
 * seletor de estoque. Quando essas cópias divergem, o botão aparece e leva a um
 * redirect — que foi exatamente como a aba "Receitas" ficou morta no Seco.
 */
export function podeAbrirAdministracao(sessao, permissoes) {
  if (!sessao) return false;
  if (sessao.eSuperAdmin || sessao.cargo === 'diretoria' || sessao.cargo === 'gerencia') return true;
  // cozinha só entra se a diretoria tiver liberado alguma capacidade de gestão
  return ['verRelatorio', 'verAuditoria', 'gerenciarProdutos', 'configurarSistema', 'verFinanceiro']
    .some(c => pode(sessao, permissoes, c));
}
