import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { pode } from '../utils/permissoes';
import Icon from '../components/Icons';

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
      to: '/relatorio', icone: 'relatorio', titulo: 'Relatórios',
      desc: 'Consumo, giro e lista de compras.',
    },
    can('verFinanceiro') && {
      to: '/financeiro', icone: 'financeiro', titulo: 'Custos e valor do estoque',
      desc: 'Valor parado, curva ABC, consumo e perdas em R$',
    },
    can('verRelatorio') && {
      to: '/balanco', icone: 'balanco', titulo: 'Balanço da conta',
      desc: 'Soma dos estoques do mesmo tipo, item a item',
    },
    can('verAuditoria') && {
      to: '/auditoria', icone: 'auditoria', titulo: 'Histórico de mudanças',
      desc: 'Quem mexeu em quê, no sistema inteiro',
    },
    eDiretoria && {
      to: '/estoques', icone: 'estabelecimento', titulo: 'Estoques da conta',
      desc: 'Criar, renomear e arquivar — e o nome que sai na etiqueta de cada um',
    },
    // ⚠️ Cada cartão gateado pela MESMA condição da aba que ele abre
    // (espelha Configuracoes). Sem isso os três apareciam para todo mundo e,
    // ao tocar, Configurações abria noutra aba ou barrava — um cartão que
    // some ao ser tocado é pior que cartão nenhum.
    can('gerenciarProdutos') && {
      to: '/configuracoes?secao=produtos', icone: 'caixa', titulo: 'Cadastros',
      desc: 'Produtos e categorias do estoque',
    },
    (eDiretoria || sessao?.cargo === 'gerencia') && {
      to: '/configuracoes?secao=acessos', icone: 'equipe', titulo: 'Equipe e acessos',
      desc: 'Convites, cargos e o que cada função pode fazer',
    },
    can('configurarSistema') && {
      to: '/configuracoes?secao=sistema', icone: 'config', titulo: 'Sistema e backup',
      desc: 'Etiqueta, preferências, exportar e importar',
    },
    eDiretoria && {
      to: '/pagamento', icone: 'cartao', titulo: 'Assinatura',
      desc: 'Plano, vencimento e pagamento',
    },
  ].filter(Boolean);

  return (
    <Layout title="Administração" area="admin">
      <div className="space-y-2.5">
        {/* A linha de abertura saiu: explicava a arquitetura da área, e os
            oito cartões logo abaixo já dizem o que ela é. */}
        {cartoes.map(c => (
          <Link key={c.to} to={c.to}
            className="bg-white rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform
                       border border-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
            <span className="w-12 h-12 rounded-xl bg-polo-beige text-polo-navy flex items-center justify-center flex-shrink-0">
              <Icon name={c.icone} size={24} />
            </span>
            <div className="min-w-0">
              <div className="font-bold text-polo-navy">{c.titulo}</div>
              <div className="text-xs text-gray-500">{c.desc}</div>
            </div>
          </Link>
        ))}

        {/* A volta para a operação vive na BARRA, não aqui: repetir o mesmo
            destino nos dois lugares é o botão repetido que já corrigimos em
            Validades. */}
      </div>
    </Layout>
  );
}
