import { Link } from 'react-router-dom';
import { MODULOS } from '../utils/modulos';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { podeAbrirAdministracao } from '../utils/permissoes';

/**
 * Escolha de qual estoque abrir. Aparece como tela cheia no primeiro acesso do
 * aparelho (`comoTela`) e como painel quando o usuário clica em trocar.
 *
 * A escolha fica no aparelho: quem só trabalha no seco já abre no seco.
 */
export default function SeletorModulo({ comoTela = false, aoEscolher }) {
  const { modulo, setModulo, permissoes } = useApp();
  const { sessao } = useAuth();

  const escolher = (id) => { setModulo(id); aoEscolher?.(id); };

  // Administração aparece junto dos estoques porque é onde a pessoa procura,
  // mas ⚠️ NÃO é um estoque: ela NAVEGA, não chama setModulo. Se virasse um
  // valor de `modulo`, toda chave passaria a ser 'admin::produtos' e todo tipo
  // 'admin:entrada' — recusados pelo CHECK do banco, em silêncio, com o item
  // preso na fila offline. É o mesmo buraco que segurou o Estoque Seco antes
  // da migração 17.
  const podeAdmin = podeAbrirAdministracao(sessao, permissoes);

  const lista = (
    <div className="space-y-3">
      {MODULOS.map(m => {
        const ativo = m.id === modulo;
        return (
          <button key={m.id} onClick={() => escolher(m.id)}
            aria-current={ativo ? 'true' : undefined}
            className={`w-full text-left rounded-2xl p-4 border-2 transition-colors flex items-start gap-3
              ${ativo ? 'border-polo-gold bg-polo-beige' : 'border-gray-200 bg-white'}`}>
            <span className="text-3xl flex-shrink-0" aria-hidden="true">{m.icone}</span>
            <span className="min-w-0">
              <span className="block font-bold text-polo-navy">
                {m.label}
                {ativo && <span className="ml-2 text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">aberto</span>}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">{m.descricao}</span>
            </span>
          </button>
        );
      })}

      {podeAdmin && (
        <Link to="/administracao" onClick={() => aoEscolher?.('administracao')}
          className="w-full text-left rounded-2xl p-4 border-2 border-dashed border-polo-navy/25 bg-white
                     flex items-start gap-3 active:scale-[0.99] transition-transform
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
          <span className="text-3xl flex-shrink-0" aria-hidden="true">⚙️</span>
          <span className="min-w-0">
            <span className="block font-bold text-polo-navy">Administração</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Relatórios de qualquer estoque, histórico de mudanças, equipe e assinatura.
              Não é um estoque — não muda o que está aberto.
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
