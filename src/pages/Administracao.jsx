import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { pode } from '../utils/permissoes';
import { GRUPOS_ADMIN, useAcessosAdmin } from '../store/acessosAdmin';
import { CartaoFilaComErro } from '../components/config/CartoesConta';
import Icon from '../components/Icons';

/**
 * Hub de ADMINISTRAÇÃO — o que é da CONTA, não de um estoque.
 *
 * ⚠️ CINCO GRUPOS, IGUAIS NOS DOIS PLANOS (Lote 4 da auditoria, 14/10/2026).
 * Antes eram três portas para o mesmo lugar: "Equipe e acessos", "Sistema e
 * backup" e "Planilha" abriam Configurações em abas diferentes, e a aba
 * Sistema misturava etiqueta, estoque, suporte e senha numa rolagem só. O plano
 * Etiquetas tinha outra tela ainda (Ajustes), com outra ordem. Agora: A casa,
 * Etiqueta, Equipe, Estoque e Conta — o que o plano ou o cargo não tem não
 * aparece. As consultas (relatórios, custos, histórico) ficam no topo.
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

const classeCartao = 'bg-white rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform border border-gray-100';

function CartaoLink({ to, icone, titulo, desc }) {
  return (
    <Link to={to} className={classeCartao}>
      <span className="w-12 h-12 rounded-xl bg-polo-beige text-polo-navy flex items-center justify-center flex-shrink-0">
        <Icon name={icone} size={24} />
      </span>
      <span className="min-w-0">
        <span className="block font-bold text-polo-navy">{titulo}</span>
        <span className="block text-xs text-gray-600">{desc}</span>
      </span>
    </Link>
  );
}

export default function Administracao() {
  const { sessao } = useAuth();
  const { permissoes } = useApp();
  const acesso = useAcessosAdmin();
  const can = (cap) => pode(sessao, permissoes, cap);

  // Consultas: o que se LÊ. Só o Pro tem relatório de estoque, custos e
  // histórico; o relatório de etiquetas existe nos dois.
  const consultas = [
    !acesso.soEtiq && can('verRelatorio') && {
      to: '/relatorio', icone: 'relatorio', titulo: 'Relatórios', desc: 'Consumo, giro e lista de compras',
    },
    can('verRelatorioEtiquetas') && {
      to: '/relatorio-etiquetas', icone: 'etiqueta', titulo: 'Relatório de etiquetas', desc: 'Quantas saíram por dia, semana e mês, e de quê',
    },
    !acesso.soEtiq && can('verFinanceiro') && {
      to: '/financeiro', icone: 'financeiro', titulo: 'Custos e valor do estoque', desc: 'Valor parado, curva ABC, consumo e perdas em R$',
    },
    !acesso.soEtiq && can('verRelatorio') && {
      to: '/balanco', icone: 'balanco', titulo: 'Balanço da conta', desc: 'Soma dos estoques do mesmo tipo, item a item',
    },
    !acesso.soEtiq && can('verAuditoria') && {
      to: '/auditoria', icone: 'auditoria', titulo: 'Histórico de mudanças', desc: 'Quem mexeu em quê, no sistema inteiro',
    },
    // ⚠️ No Pro, Meus itens não tem lugar na barra (que é da operação): a
    // porta é aqui. No plano Etiquetas ele já é uma aba da barra.
    !acesso.soEtiq && can('gerenciarProdutos') && {
      to: '/itens', icone: 'caixa', titulo: 'Meus itens', desc: 'Cadastro, prazos, estoque e a planilha',
    },
  ].filter(Boolean);

  const grupos = GRUPOS_ADMIN.filter(g => acesso.grupos[g.id]);

  return (
    // No plano Etiquetas a Administração é uma aba da barra: a barra fica.
    <Layout title="Administração" {...(acesso.soEtiq ? {} : { area: 'admin' })}>
      <CartaoFilaComErro />

      {/* Atalho do painel (só super-admin) */}
      {sessao?.eSuperAdmin && (
        <Link to="/admin" className="block bg-polo-navy rounded-xl p-4 mb-4">
          <span className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-bold text-polo-gold">Painel super-admin</span>
              <span className="block text-xs text-white/80 mt-0.5">Ver restaurantes, usuários e suporte ativo.</span>
            </span>
            <span className="text-polo-gold text-lg" aria-hidden="true">→</span>
          </span>
        </Link>
      )}

      {consultas.length > 0 && (
        <section aria-labelledby="adm-consultas" className="mb-5">
          <h2 id="adm-consultas" className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2 px-1">
            {acesso.soEtiq ? 'Consultas' : 'Consultas e cadastro'}
          </h2>
          <div className="space-y-2.5">
            {consultas.map(c => <CartaoLink key={c.to} {...c} />)}
          </div>
        </section>
      )}

      <section aria-labelledby="adm-ajustes">
        <h2 id="adm-ajustes" className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2 px-1">Ajustes</h2>
        <div className="space-y-2.5">
          {grupos.map(g => (
            <CartaoLink key={g.id} to={`/administracao/${g.id}`} icone={g.icone} titulo={g.titulo}
              desc={(acesso.soEtiq && g.descEtiquetas) || g.desc} />
          ))}
        </div>
      </section>
    </Layout>
  );
}
