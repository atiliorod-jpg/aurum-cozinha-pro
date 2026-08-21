import { useMemo } from 'react';
import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { balancoConsolidado } from '../utils/visaoEstoque';
import { fmtNum } from '../utils/formatters';
import { moduloPorId } from '../utils/modulos';

/**
 * Quanto a casa tem no total, somando estoques do mesmo tipo.
 *
 * Custa ZERO rede: o cliente já baixa todos os registros da conta e antes
 * jogava fora o que não era do estoque aberto. Aqui é só somar o que já está
 * na mão.
 *
 * Só aparece a família que tem MAIS DE UM estoque — consolidar um estoque
 * sozinho é repetir a tela dele com outro título.
 */
export default function Balanco() {
  const { estoques, visoesPorEstoque } = useApp();
  const familias = useMemo(
    () => balancoConsolidado(estoques, visoesPorEstoque),
    [estoques, visoesPorEstoque],
  );

  if (!familias.length) {
    return (
      <Layout title="Balanço" area="admin">
        <div className="bg-white rounded-xl p-6 text-center border border-gray-100">
          <p className="text-4xl mb-2" aria-hidden="true">🧮</p>
          <p className="text-sm font-bold text-polo-navy">Ainda não há o que consolidar</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            O balanço soma estoques do mesmo tipo — por exemplo, dois Estoques Secos de
            unidades diferentes. Com um de cada, ele repetiria a tela de cada um.
          </p>
          <Link to="/estoques" className="inline-block mt-3 text-xs font-bold text-polo-navy border border-polo-navy/30 rounded-lg px-3 py-1.5">
            Criar outro estoque
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Balanço" area="admin">
      <div className="space-y-5">
        <p className="text-[11px] text-gray-500 px-1 leading-relaxed">
          Soma de estoques do <strong>mesmo tipo</strong>. Não somamos tipos diferentes: "Queijo"
          na Produção e "Queijo" no Seco são cadastros distintos, e casar por nome daria um
          número errado com cara de certo.
        </p>

        {familias.map(f => (
          <div key={f.tipo}>
            <div className="mb-2 px-1">
              <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">
                {moduloPorId(f.tipo).icone} {moduloPorId(f.tipo).label}
              </p>
              <p className="text-[11px] text-gray-400">
                {f.estoques.map(e => e.nome).join(' · ')}
              </p>
            </div>

            {f.itens.length === 0 ? (
              <p className="bg-white rounded-xl p-4 text-xs text-gray-500 border border-gray-100">
                Nenhum item com saldo nestes estoques ainda.
              </p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left font-semibold text-gray-500 px-3 py-2">Item</th>
                      {f.estoques.map(e => (
                        <th key={e.id} className="text-right font-semibold text-gray-500 px-2 py-2 whitespace-nowrap">
                          {e.estabelecimento || e.nome}
                          {e.arquivado && <span className="block text-[9px] font-normal text-gray-400">arquivado</span>}
                        </th>
                      ))}
                      <th className="text-right font-bold text-polo-navy px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {f.itens.map(i => (
                      <tr key={i.id}>
                        <td className="px-3 py-2 text-gray-800">{i.nome}</td>
                        {f.estoques.map(e => (
                          <td key={e.id} className="text-right px-2 py-2 text-gray-600 whitespace-nowrap">
                            {fmtNum(i.porEstoque[e.id] ?? 0)}
                          </td>
                        ))}
                        <td className="text-right px-3 py-2 font-bold text-polo-navy whitespace-nowrap">
                          {fmtNum(i.total)} {i.unidade}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

        <p className="text-[11px] text-gray-400 px-1 leading-relaxed">
          Estoque arquivado continua somando: ele saiu do seletor, mas o que está lá dentro
          continua sendo mercadoria da casa.
        </p>
      </div>
    </Layout>
  );
}
