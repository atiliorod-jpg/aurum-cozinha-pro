import { MODULOS } from '../utils/modulos';
import { useApp } from '../store/AppContext';

/**
 * Escolha de qual estoque abrir. Aparece como tela cheia no primeiro acesso do
 * aparelho (`comoTela`) e como painel quando o usuário clica em trocar.
 *
 * A escolha fica no aparelho: quem só trabalha no seco já abre no seco.
 */
export default function SeletorModulo({ comoTela = false, aoEscolher }) {
  const { modulo, setModulo } = useApp();

  const escolher = (id) => { setModulo(id); aoEscolher?.(id); };

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
