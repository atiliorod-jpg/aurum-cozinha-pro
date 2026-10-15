// =====================================================================
//  OS CINCO GRUPOS DA ADMINISTRAÇÃO e quem alcança cada um (Lote 4, 14/10/2026)
//  Mora em store/ porque é hook + constante: o hub (pages/Administracao.jsx)
//  e as telas dos grupos (pages/AdministracaoGrupo.jsx) leem a MESMA regra.
// =====================================================================
import { useApp } from './AppContext';
import { useAuth } from './AuthContext';
import { pode } from '../utils/permissoes';
import { temRecurso } from '../utils/modulos';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../utils/produto';

export const GRUPOS_ADMIN = [
  { id: 'casa', titulo: 'A casa', icone: 'estabelecimento', desc: 'Nome, CNPJ e endereço da etiqueta; unidades e cozinhas',
    descEtiquetas: 'Nome, CNPJ e endereço que saem na etiqueta; unidades' },
  { id: 'etiqueta', titulo: 'Etiqueta', icone: 'impressora', desc: 'Campos impressos, QR, armazenamentos e temperaturas, impressora',
    // o plano Etiquetas não tem QR nem cozinhas: a descrição não promete o que não há
    descEtiquetas: 'Campos impressos, armazenamentos e temperaturas, impressora' },
  { id: 'equipe', titulo: 'Equipe', icone: 'equipe', desc: 'Nomes e senhas de quem imprime, contas de acesso, o que cada cargo pode' },
  { id: 'estoque', titulo: 'Estoque', icone: 'mantimento', desc: 'Receitas, destinos de saída e de apara, mínimo e máximo, rendimento' },
  { id: 'conta', titulo: 'Conta', icone: 'cartao', desc: 'Plano e pagamento, minha senha, suporte remoto, cópia de segurança' },
];

/**
 * O que esta sessão alcança em cada grupo. UMA regra para o hub e para as
 * telas dos grupos: cartão que aparece e leva a uma tela vazia (ou que manda
 * de volta) é pior que cartão nenhum.
 *
 * ⚠️ As travas de cada cartão vieram das duas telas antigas, sem afrouxar
 * nada: contas, cargos, plano e suporte remoto são da conta dona no plano
 * Etiquetas; no Pro a gerência também administra contas. Duas ficaram MAIS
 * fechadas no Pro, de propósito: o suporte remoto e o "apagar todos os
 * registros" eram de qualquer cargo com "configurar o sistema" — liberar a
 * Aurum para entrar na conta, ou apagar o histórico, é decisão de quem assina.
 */
export function useAcessosAdmin() {
  const { sessao, impersonando, temPermissao } = useAuth();
  const { permissoes, modulo } = useApp();
  const can = (cap) => pode(sessao, permissoes, cap);
  const soEtiq = ehSoEtiquetas(produtoAtivo(sessao, impersonando));
  const dono = temPermissao('diretoria');            // diretoria ou super-admin
  const gerente = dono || sessao?.cargo === 'gerencia';
  const sistema = can('configurarSistema');
  const a = {
    soEtiq, dono, sistema,
    estabelecimento: sistema,
    unidades: dono,
    etiqueta: sistema,
    nomes: soEtiq ? sistema : gerente,
    contas: soEtiq ? dono : gerente,
    cargos: dono,
    receitas: !soEtiq && can('gerenciarProdutos') && temRecurso(modulo, 'receitas'),
    ajustesEstoque: !soEtiq && sistema,
    plano: dono && !sessao?.eSuperAdmin,
    suporte: dono,
    copia: sistema,
    zonaPerigo: !soEtiq && dono,
  };
  a.grupos = {
    casa: a.estabelecimento || a.unidades,
    etiqueta: a.etiqueta,
    equipe: a.nomes || a.contas || a.cargos,
    estoque: a.receitas || a.ajustesEstoque,
    // Instalar o app e Novidades valem para qualquer um que entra aqui
    conta: true,
  };
  return a;
}
