import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { balancoConsolidado } from '../utils/visaoEstoque';
import { fmtNum } from '../utils/formatters';
import { moduloPorId } from '../utils/modulos';
import { useAuth } from '../store/AuthContext';
import { temUnidadesExtras, opcoesDeUnidade, nomeDaUnidade } from '../utils/unidades';

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
  const { estoques, visoesPorEstoque, unidades } = useApp();
  const { sessao, impersonando } = useAuth();
  // ⚠️ UNIDADES (M46): o balanço pode somar o grupo inteiro ou uma casa só.
  // 'todas' é o grupo; `null` é a unidade principal. Sem unidade extra, o
  // filtro nem aparece e a soma é a de sempre.
  const variasUnidades = temUnidadesExtras(unidades);
  const nomeConta = impersonando?.restauranteNome || sessao?.restauranteNome;
  const [filtro, setFiltro] = useState('todas');
  const doFiltro = useMemo(
    () => (!variasUnidades || filtro === 'todas' ? estoques : estoques.filter(e => (e.unidade || null) === filtro)),
    [estoques, filtro, variasUnidades]);
  const familias = useMemo(
    () => balancoConsolidado(doFiltro, visoesPorEstoque),
    [doFiltro, visoesPorEstoque],
  );
  // o nome que vai na coluna: a unidade diz de qual casa é cada cozinha
  const rotulo = (e) => (variasUnidades ? nomeDaUnidade(unidades, e.unidade, nomeConta) : (e.estabelecimento || e.nome));
  const filtroUnidades = variasUnidades && (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Unidade do balanço">
      {[{ chave: 'todas', nome: 'Todas as unidades' },
        ...opcoesDeUnidade(unidades, nomeConta).map(u => ({ chave: u.id, nome: u.nome }))].map(o => (
        <button key={o.chave ?? 'principal'} type="button" onClick={() => setFiltro(o.chave)}
          aria-pressed={filtro === o.chave}
          className={`min-h-11 px-3 rounded-full text-xs font-bold border
            ${filtro === o.chave ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'bg-white text-polo-navy border-gray-200'}`}>
          {o.nome}
        </button>
      ))}
    </div>
  );

  if (!familias.length) {
    return (
      <Layout title="Balanço" area="admin">
        {filtroUnidades && <div className="mb-4">{filtroUnidades}</div>}
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
        {filtroUnidades}
        <p className="text-xs text-gray-600 px-1">
          Soma dos estoques do mesmo tipo.
        </p>

        {familias.map(f => (
          <div key={f.tipo}>
            <div className="mb-2 px-1">
              <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">
                {moduloPorId(f.tipo).icone} {moduloPorId(f.tipo).label}
              </p>
              <p className="text-[11px] text-gray-600">
                {f.estoques.map(e => (variasUnidades ? `${e.nome} (${rotulo(e)})` : e.nome)).join(' · ')}
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
                          {/* ⚠️ Com várias unidades, o nome da unidade SOZINHO
                              repetia a coluna: duas cozinhas de Produção da
                              mesma casa ficavam com o mesmo título. A cozinha
                              em cima, a unidade embaixo. */}
                          {variasUnidades ? (<>
                            {e.nome}
                            <span className="block text-[11px] font-normal text-gray-600">{rotulo(e)}</span>
                          </>) : rotulo(e)}
                          {e.arquivado &&<span className="block text-[11px] font-normal text-gray-600">arquivado</span>}
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

        <p className="text-xs text-gray-600 px-1">
          Estoques arquivados entram na soma.
        </p>
      </div>
    </Layout>
  );
}
