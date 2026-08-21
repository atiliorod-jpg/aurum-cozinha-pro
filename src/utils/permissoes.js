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
export const CAPACIDADES = [
  { id: 'removerRegistros',  grupo: 'Operação', label: 'Remover lançamentos do histórico',
    desc: 'Apagar entradas, saídas, produções e compras já registradas.' },
  { id: 'inventario',        grupo: 'Operação', label: 'Fazer inventário / contagem física',
    desc: 'Ajustar o estoque para o valor contado na prateleira.' },
  { id: 'verRelatorio',      grupo: 'Gestão',   label: 'Ver relatório',
    desc: 'Consumo, giro, lista de compras e exportação em Excel.' },
  { id: 'verAuditoria',      grupo: 'Gestão',   label: 'Ver histórico de mudanças',
    desc: 'Trilha de tudo que cada pessoa fez no sistema.' },
  { id: 'gerenciarProdutos', grupo: 'Gestão',   label: 'Cadastrar e editar produtos e receitas',
    desc: 'Criar/alterar itens do estoque, fichas e rendimento.' },
  { id: 'configurarSistema', grupo: 'Gestão',   label: 'Configurar o sistema',
    desc: 'Destinos de saída, etiquetas, mín/máx automático e demais ajustes.' },
  { id: 'verFinanceiro',     grupo: 'Financeiro', label: 'Ver custos e preços',
    desc: 'Custo de insumo, valor do estoque e curva ABC. Diferente das outras: o banco NÃO entrega esses dados a quem não tem esta permissão.',
    duro: true },
  { id: 'verPerdaEmReais',   grupo: 'Financeiro', label: 'Ver quanto a perda custou (só o total)',
    desc: 'Mostra "R$ 340 no lixo este mês" para a equipe, sem abrir a tabela de custos. O servidor calcula e devolve só o total — a quebra por item revelaria o custo de cada insumo.',
    duro: true },
];

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
export function pode(sessao, permissoes, cap) {
  if (!sessao) return false;
  if (sessao.eSuperAdmin) return true;
  const cargo = sessao.cargo;
  if (cargo === 'diretoria') return true;        // dono do restaurante
  const padrao = PERMISSOES_PADRAO[cargo] || {};
  const doCargo = (permissoes && permissoes[cargo]) || {};
  return doCargo[cap] !== undefined ? !!doCargo[cap] : !!padrao[cap];
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
