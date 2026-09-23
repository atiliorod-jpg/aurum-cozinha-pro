import { Link } from 'react-router-dom';
import { estoquesAtivos } from '../utils/instancias';
import { temUnidadesExtras, opcoesDeUnidade, unidadeDaCozinha, cozinhaPrincipalDa, nomeDaUnidade } from '../utils/unidades';
import { formatarCNPJ } from '../utils/documentos';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { podeAbrirAdministracao } from '../utils/permissoes';
import Icon from './Icons';

/**
 * Escolha de qual estoque abrir. Aparece como tela cheia no primeiro acesso do
 * aparelho (`comoTela`) e como painel quando o usuário clica em trocar.
 *
 * A escolha fica no aparelho: quem só trabalha no seco já abre no seco.
 */
export default function SeletorModulo({ comoTela = false, aoEscolher, soUnidades = false }) {
  const { modulo, setModulo, permissoes, estoques, unidades, estoquesPermitidos, unidadeFixa } = useApp();
  const { sessao, impersonando } = useAuth();
  const { confirm } = useUI();
  // No modo suporte a conta é a do cliente, e o nome também
  const nomeConta = impersonando?.restauranteNome || sessao?.restauranteNome;
  const agrupar = temUnidadesExtras(unidades);

  // ⚠️ TROCAR DE UNIDADE PEDE CONFIRMAÇÃO (M46): muda o nome, o CNPJ e o
  // endereço que saem impressos. Trocar de cozinha DENTRO da mesma unidade
  // continua sendo um toque só, como sempre foi. Na primeira escolha do
  // aparelho (`comoTela`) não há de onde trocar.
  const escolher = async (id) => {
    const de = unidadeDaCozinha(estoques, modulo);
    const para = unidadeDaCozinha(estoques, id);
    if (agrupar && !comoTela && de !== para) {
      const ok = await confirm({
        titulo: 'Trocar de unidade',
        mensagem: `Este aparelho passa a trabalhar na unidade "${nomeDaUnidade(unidades, para, nomeConta)}".\n\nAs etiquetas vão sair com o nome, o CNPJ e o endereço dela.`,
        confirmar: 'Trocar de unidade',
      });
      if (!ok) return;
    }
    setModulo(id);
    aoEscolher?.(id);
  };

  // Administração aparece junto dos estoques porque é onde a pessoa procura,
  // mas ⚠️ NÃO é um estoque: ela NAVEGA, não chama setModulo. Se virasse um
  // valor de `modulo`, toda chave passaria a ser 'admin::produtos' e todo tipo
  // 'admin:entrada' — recusados pelo CHECK do banco, em silêncio, com o item
  // preso na fila offline. É o mesmo buraco que segurou o Estoque Seco antes
  // da migração 17.
  const podeAdmin = podeAbrirAdministracao(sessao, permissoes);
  // ⚠️ Este painel NÃO ganha atalho de "criar estoque". Cheguei a pôr um e o
  // dono derrubou, com razão: criar estoque já é o cartão "Estoques da conta"
  // da Administração, e ter o mesmo destino nos dois lugares é o defeito que
  // este app vem corrigindo desde o "Voltar ao estoque". Um destino, um
  // caminho — e um painel de ESCOLHER onde trabalhar não é lugar de ação de
  // configuração: quem toca ali espera trocar de estoque, não ser jogado
  // noutra tela.

  // Só os ativos: estoque arquivado sai do seletor, mas os lançamentos dele
  // continuam no histórico e no balanço.
  // ⚠️ CONTA PRESA A UMA UNIDADE (M48): só as cozinhas dela aparecem
  const visiveis = estoquesAtivos(estoquesPermitidos || estoques);

  // ⚠️ PLANO ETIQUETAS: a pessoa escolhe a UNIDADE, não a cozinha — cozinha é
  // um conceito que este produto não mostra. Cada unidade abre a Produção
  // principal dela.
  if (soUnidades) {
    const unidadeAberta = unidadeDaCozinha(estoques, modulo);
    return (
      <div className="space-y-3">
        {opcoesDeUnidade(unidades, nomeConta)
          .filter(u => !unidadeFixa || (u.id || null) === (unidadeFixa.id || null))
          .map(u => {
          const ativa = u.id === unidadeAberta;
          return (
            <button key={u.id || 'principal'} onClick={() => escolher(cozinhaPrincipalDa(estoques, u.id))}
              aria-current={ativa ? 'true' : undefined}
              className={`w-full text-left rounded-2xl p-4 border-2 transition-colors flex items-start gap-3
                ${ativa ? 'border-polo-gold bg-polo-beige' : 'border-gray-200 bg-white'}`}>
              <span className="w-11 h-11 rounded-xl bg-polo-beige text-polo-navy flex items-center justify-center flex-shrink-0">
                <Icon name="estabelecimento" size={24} />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-polo-navy">
                  {u.nome}
                  {ativa && <span className="ml-2 text-[11px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">aberta</span>}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {u.principal ? 'Unidade principal' : u.cnpj ? `CNPJ ${formatarCNPJ(u.cnpj)}` : 'Unidade'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // ⚠️ PLANO COMPLETO COM VÁRIAS UNIDADES: as cozinhas aparecem agrupadas pela
  // unidade dona. Com uma casa só a lista é exatamente a de antes, sem título.
  const grupos = agrupar
    ? opcoesDeUnidade(unidades, nomeConta)
      .map(u => ({ ...u, cozinhas: visiveis.filter(e => (e.unidade || null) === u.id) }))
      .filter(g => g.cozinhas.length)
    : [{ id: null, nome: '', cozinhas: visiveis }];

  const lista = (
    <div className="space-y-3">
      {grupos.map(g => (
      <div key={g.id || 'principal'} className="space-y-3">
      {agrupar && (
        <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wide px-1 pt-1">
          {g.nome}{g.principal ? ' · principal' : ''}
        </p>
      )}
      {g.cozinhas.map(e => {
        const ativo = e.id === modulo;
        return (
          <button key={e.id} onClick={() => escolher(e.id)}
            aria-current={ativo ? 'true' : undefined}
            className={`w-full text-left rounded-2xl p-4 border-2 transition-colors flex items-start gap-3
              ${ativo ? 'border-polo-gold bg-polo-beige' : 'border-gray-200 bg-white'}`}>
            <span className="w-11 h-11 rounded-xl bg-polo-beige text-polo-navy flex items-center justify-center flex-shrink-0">
              <Icon name={e.icone} size={24} />
            </span>
            <span className="min-w-0">
              <span className="block font-bold text-polo-navy">
                {e.nome}
                {ativo && <span className="ml-2 text-[11px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">aberto</span>}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                {/* O estabelecimento manda quando existe: com dois restaurantes
                    na conta, "Estoque Seco" sozinho não diz de qual casa é. */}
                {e.estabelecimento || e.descricao}
              </span>
            </span>
          </button>
        );
      })}
      </div>
      ))}

      {podeAdmin && (
        <Link to="/administracao" onClick={() => aoEscolher?.('administracao')}
          className="w-full text-left rounded-2xl p-4 border-2 border-dashed border-polo-navy/25 bg-white
                     flex items-start gap-3 active:scale-[0.99] transition-transform
                    ">
          <span className="w-11 h-11 rounded-xl bg-polo-beige text-polo-navy flex items-center justify-center flex-shrink-0">
            <Icon name="config" size={24} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold text-polo-navy">Administração</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Relatórios, equipe, cadastros e assinatura.
            </span>
          </span>
        </Link>
      )}

    </div>
  );

  if (!comoTela) return lista;

  return (
    <div className="min-h-screen bg-polo-navy flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <h1 className="text-xl font-bold text-polo-gold">Onde você vai trabalhar?</h1>
          <p className="text-white/80 text-sm mt-1">
            Cada área tem o seu próprio estoque. Dá para trocar quando quiser.
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-2xl">{lista}</div>
      </div>
    </div>
  );
}
