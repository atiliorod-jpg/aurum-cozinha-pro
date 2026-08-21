import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { pode } from '../utils/permissoes';

/**
 * Hub de ADMINISTRAÇÃO — o que é da CONTA, não de um estoque.
 *
 * ⚠️ DUAS DECISÕES DE ARQUITETURA, as duas aprendidas com retrabalho:
 *
 * 1. "Administração" NÃO é um valor de `modulo`. Se fosse, toda chave viraria
 *    'admin::produtos' e todo tipo 'admin:entrada' — recusados pelo CHECK do
 *    banco, em silêncio, com o item preso na fila offline.
 *
 * 2. Nenhum botão daqui TROCA o estoque aberto. A versão anterior tinha cartões
 *    que chamavam setModulo, então clicar num relatório mudava o estoque em que
 *    a equipe ia lançar — jeito silencioso de alguém registrar entrada no lugar
 *    errado. Hoje as telas de relatório e financeiro escolhem qual estoque
 *    MOSTRAR, sem mexer no que está aberto lá fora.
 */
export default function Administracao() {
  const { sessao } = useAuth();
  const { permissoes } = useApp();
  const can = (cap) => pode(sessao, permissoes, cap);
  const eDiretoria = sessao?.eSuperAdmin || sessao?.cargo === 'diretoria';

  // Uma lista só, sem seções: são oito destinos, e agrupar oito itens em três
  // caixas com título só acrescenta ruído numa tela que se lê de uma vez.
  const cartoes = [
    can('verRelatorio') && {
      to: '/relatorio', emoji: '📊', titulo: 'Relatórios',
      desc: 'Consumo, giro e lista de compras — o estoque se escolhe na própria tela',
    },
    can('verFinanceiro') && {
      to: '/financeiro', emoji: '💰', titulo: 'Custos e valor do estoque',
      desc: 'Valor parado, curva ABC, consumo e perdas em R$',
    },
    can('verRelatorio') && {
      to: '/balanco', emoji: '🧮', titulo: 'Balanço da conta',
      desc: 'Soma dos estoques do mesmo tipo, item a item',
    },
    can('verAuditoria') && {
      to: '/auditoria', emoji: '🕵️', titulo: 'Histórico de mudanças',
      desc: 'Quem mexeu em quê, no sistema inteiro',
    },
    eDiretoria && {
      to: '/estoques', emoji: '🏢', titulo: 'Estoques da conta',
      desc: 'Criar, renomear e arquivar — e o nome que sai na etiqueta de cada um',
    },
    {
      to: '/configuracoes?secao=produtos', emoji: '📦', titulo: 'Cadastros',
      desc: 'Produtos, receitas e destinos de saída',
    },
    {
      to: '/configuracoes?secao=acessos', emoji: '👤', titulo: 'Equipe e acessos',
      desc: 'Convites, cargos e o que cada função pode fazer',
    },
    {
      to: '/configuracoes?secao=sistema', emoji: '🛠️', titulo: 'Sistema e backup',
      desc: 'Etiqueta, preferências, exportar e importar',
    },
    eDiretoria && {
      to: '/pagamento', emoji: '💳', titulo: 'Assinatura',
      desc: 'Plano, vencimento e pagamento',
    },
  ].filter(Boolean);

  return (
    <Layout title="Administração" area="admin">
      <div className="space-y-2.5">
        <p className="text-[11px] text-gray-500 px-1 leading-relaxed">
          Tudo aqui vale para a conta inteira. Nada nesta área muda o estoque que a equipe
          está usando.
        </p>

        {cartoes.map(c => (
          <Link key={c.to} to={c.to}
            className="bg-white rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform
                       border border-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
            <span className="w-12 h-12 rounded-xl bg-polo-beige flex items-center justify-center text-2xl flex-shrink-0" aria-hidden="true">{c.emoji}</span>
            <div className="min-w-0">
              <div className="font-bold text-polo-navy">{c.titulo}</div>
              <div className="text-xs text-gray-500">{c.desc}</div>
            </div>
          </Link>
        ))}

        <Link to="/" className="block text-center text-xs font-semibold text-polo-navy pt-3 pb-1">
          ← Voltar para o estoque
        </Link>
      </div>
    </Layout>
  );
}
