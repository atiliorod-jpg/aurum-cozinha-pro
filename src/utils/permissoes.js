// =====================================================================
//  Permissões por função (cargo) — configuráveis pela diretoria
//
//  Modelo: a DIRETORIA (quem cria o restaurante já entra assim) e o
//  super-admin SEMPRE podem tudo. Para "cozinha" e "gerência", a diretoria
//  liga/desliga capacidades numa matriz em Config → Acessos. O resultado
//  fica em prefs.permissoes (sincroniza pela nuvem, como as demais prefs).
//
//  IMPORTANTE (honestidade de segurança): isto é uma trava de INTERFACE —
//  organiza a equipe e evita acidentes num time pequeno e de confiança.
//  NÃO é barreira dura: o que precisa ser inviolável (criar convite, trocar
//  cargo, painel admin) é enforçado por cargo no banco (RLS/RPC).
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
];

// Padrão por cargo — reproduz EXATAMENTE o modelo hierárquico anterior
// (cozinha operacional; gerência com gestão). Se prefs.permissoes não trouxer
// uma chave, cai aqui — então bancos/contas antigas não mudam de comportamento.
export const PERMISSOES_PADRAO = {
  cozinha: {
    removerRegistros: true, inventario: false, verRelatorio: false,
    verAuditoria: false, gerenciarProdutos: false, configurarSistema: false,
  },
  gerencia: {
    removerRegistros: true, inventario: true, verRelatorio: true,
    verAuditoria: true, gerenciarProdutos: true, configurarSistema: true,
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
