import Layout from '../components/Layout';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { pode } from '../utils/permissoes';
import { MODULOS, temRecurso } from '../utils/modulos';

/**
 * Hub de ADMINISTRAÇÃO — o que é da CONTA, não de um estoque.
 *
 * Antes isto estava espalhado: auditoria num ícone do cabeçalho, relatório
 * preso ao estoque aberto, e configuração de conta misturada com configuração
 * de operação (produtos, receitas, destinos) na mesma tela.
 *
 * ⚠️ DECISÃO DE PROJETO: "Administração" NÃO é um valor de `modulo`. Se fosse,
 * toda chave viraria `admin::produtos` e todo tipo `admin:entrada` — que o
 * CHECK do banco recusa, em silêncio, com o item preso na fila offline (foi
 * exatamente o que aconteceu com o Estoque Seco antes da migração 17). Aqui
 * é uma SEÇÃO: uma rota própria, que não mexe no estoque aberto.
 *
 * O relatório continua sendo por estoque — é o que faz sentido, porque somar
 * consumo de mantimento com consumo de porção não significa nada. Mas dá para
 * escolher qual daqui, e o cartão troca o estoque e abre o relatório de uma vez.
 */
// Definidos FORA do componente de propósito: componente criado dentro do render
// é uma identidade nova a cada ciclo, e o React desmonta/remonta a subárvore
// inteira em vez de atualizá-la — some o foco, perde estado, pisca no tablet.
function Secao({ titulo, desc, children }) {
  return (
    <div>
      <div className="mb-2 px-1">
        <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">{titulo}</p>
        {desc && <p className="text-[11px] text-gray-400">{desc}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{children}</div>
    </div>
  );
}

const CLASSE_CARTAO = `bg-white rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform border border-gray-100
                       text-left w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold`;

function Cartao({ emoji, titulo, desc, onClick, to }) {
  const conteudo = (
    <>
      <span className="w-12 h-12 rounded-xl bg-polo-beige flex items-center justify-center text-2xl flex-shrink-0" aria-hidden="true">{emoji}</span>
      <div className="min-w-0">
        <div className="font-bold text-polo-navy">{titulo}</div>
        <div className="text-xs text-gray-500">{desc}</div>
      </div>
    </>
  );
  return to
    ? <Link to={to} className={CLASSE_CARTAO}>{conteudo}</Link>
    : <button onClick={onClick} className={CLASSE_CARTAO}>{conteudo}</button>;
}

export default function Administracao() {
  const { modulo, setModulo } = useApp();
  const { sessao } = useAuth();
  const navigate = useNavigate();
  const { permissoes } = useApp();
  const can = (cap) => pode(sessao, permissoes, cap);

  // Troca o estoque e leva junto. É o mesmo gesto para relatório e para
  // configuração de operação: você diz DE QUAL estoque, não precisa lembrar de
  // trocar antes e depois voltar.
  const abrirNoEstoque = (id, rota) => {
    if (id !== modulo) setModulo(id);
    navigate(rota);
  };

  return (
    <Layout title="Administração">
      <div className="space-y-5">

        {can('verRelatorio') && (
          <Secao titulo="Relatórios" desc="Consumo, giro e lista de compras — escolha o estoque">
            {MODULOS.map(m => (
              <Cartao key={m.id} emoji={m.icone}
                titulo={`Relatório · ${m.label}`}
                desc={m.id === modulo ? 'estoque aberto agora' : 'abre este estoque e mostra o relatório'}
                onClick={() => abrirNoEstoque(m.id, '/relatorio')} />
            ))}
          </Secao>
        )}

        {can('gerenciarProdutos') && (
          <Secao titulo="Cadastros de cada estoque"
            desc="Produtos, receitas e destinos de saída — o cartão já abre o estoque certo">
            {MODULOS.map(m => (
              <Cartao key={m.id} emoji={m.icone}
                titulo={`Cadastros · ${m.label}`}
                desc={temRecurso(m.id, 'receitas') ? 'produtos, receitas e destinos' : 'produtos e destinos'}
                onClick={() => abrirNoEstoque(m.id, '/configuracoes?secao=produtos')} />
            ))}
          </Secao>
        )}

        {can('verFinanceiro') && (
          <Secao titulo="Financeiro" desc="Quanto há parado, quanto saiu e quanto foi para o lixo">
            <Cartao emoji="💰" titulo="Custos e valor do estoque" to="/financeiro"
              desc="Valor parado, curva ABC, consumo e perdas em R$" />
          </Secao>
        )}

        <Secao titulo="Conta e equipe" desc="Vale para todos os estoques ao mesmo tempo">
          {can('verAuditoria') && (
            <Cartao emoji="🕵️" titulo="Histórico de mudanças" to="/auditoria"
              desc="Quem mexeu em quê, no sistema inteiro — não só neste estoque" />
          )}
          <Cartao emoji="👤" titulo="Equipe e acessos" to="/configuracoes?secao=acessos"
            desc="Convites, cargos e o que cada função pode fazer" />
          <Cartao emoji="🛠️" titulo="Sistema e backup" to="/configuracoes?secao=sistema"
            desc="Etiqueta, preferências, exportar/importar dados" />
          {sessao?.cargo === 'diretoria' && (
            <Cartao emoji="💳" titulo="Assinatura" to="/pagamento"
              desc="Plano, vencimento e pagamento" />
          )}
        </Secao>

        <p className="text-[11px] text-gray-400 px-1 leading-relaxed">
          Relatórios e configurações moram só aqui. A barra de baixo fica com o que a
          cozinha usa durante o serviço — registrar, validades e fechar turno.
        </p>
      </div>
    </Layout>
  );
}
