import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import SeletorVisao from '../components/SeletorVisao';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { pode } from '../utils/permissoes';
import { valorDoEstoque, curvaABC, custoDosRegistros } from '../utils/financeiro';
import { fmtNum } from '../utils/formatters';
import { addDias } from '../utils/datas';
import { hoje } from '../utils/formatters';

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

const CORES_CLASSE = { A: 'bg-red-100 text-red-700', B: 'bg-amber-100 text-amber-700', C: 'bg-gray-100 text-gray-600' };

function Cartao({ titulo, valor, detalhe, tom = 'normal' }) {
  const cor = tom === 'alerta' ? 'text-red-600' : 'text-polo-navy';
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{titulo}</p>
      <p className={`text-2xl font-bold ${cor} mt-1`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-gray-400 mt-0.5">{detalhe}</p>}
    </div>
  );
}

// ⚠️ Fallbacks ESTÁVEIS. `visao.x || []` cria um array novo a cada render e
// invalida todo useMemo que depende dele — no tablet isso é recálculo de
// gráfico a cada toque. Constantes de módulo têm identidade fixa.
const SEM_LISTA = [];
const SEM_MAPA = {};

export default function Financeiro() {
  const { precos, modulo, estoques, visoesPorEstoque, permissoes } = useApp();
  const { sessao } = useAuth();
  const [dias, setDias] = useState(30);
  // Qual estoque esta tela MOSTRA. Começa no aberto por conveniência, mas
  // trocar aqui NÃO muda o estoque da operação — ver SeletorVisao.
  const [vendo, setVendo] = useState(modulo);
  const visao = visoesPorEstoque?.[vendo] || visoesPorEstoque?.[modulo] || SEM_MAPA;
  const produtos = visao.produtos || SEM_LISTA;
  const estoque = visao.estoque || SEM_MAPA;
  const saidas = visao.saidas || SEM_LISTA;
  const desperdicio = visao.desperdicio || SEM_LISTA;
  const nomeDoEstoque = estoques.find(e => e.id === vendo)?.nome || '';

  const de = addDias(hoje(), -dias);
  const podeVer = pode(sessao, permissoes, 'verFinanceiro');

  const est = useMemo(() => valorDoEstoque(produtos, estoque, precos), [produtos, estoque, precos]);
  const abc = useMemo(() => curvaABC(est.itens), [est.itens]);
  const consumo = useMemo(() => custoDosRegistros(saidas, produtos, precos, { de }), [saidas, produtos, precos, de]);
  const perdas = useMemo(() => custoDosRegistros(desperdicio, produtos, precos, { de }), [desperdicio, produtos, precos, de]);

  // Sem a permissão a linha `precos` nem chega do servidor (migração 20), então
  // não há o que calcular. Dizer isso é melhor que mostrar zeros, que pareceriam
  // "não gastei nada".
  if (!podeVer) {
    return (
      <Layout title="Financeiro" area="admin">
        <div className="bg-white rounded-xl p-6 text-center border border-gray-100">
          <p className="text-4xl mb-2" aria-hidden="true">🔒</p>
          <p className="text-sm font-bold text-polo-navy">Sem acesso aos custos</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Os valores de custo não são enviados para o seu acesso. Quem cuida da diretoria
            pode liberar em Administração → Equipe e acessos.
          </p>
        </div>
      </Layout>
    );
  }

  const semPreco = est.semCusto.length;

  return (
    <Layout title="Financeiro" area="admin">
      <div className="space-y-4">

        <SeletorVisao valor={vendo} aoTrocar={setVendo} />

        <div className="flex gap-1.5">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDias(d)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors
                ${dias === d ? 'bg-polo-navy text-polo-gold' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {d} dias
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Cartao titulo="Parado no estoque" valor={brl(est.total)}
            detalhe={plural(est.itens.length, 'item com custo', 'itens com custo')} />
          {/* "R$ 0,00 · nada registrado" seria MENTIRA quando houve perda de um
              item sem custo cadastrado: o valor é zero porque não soubemos
              calcular, não porque nada estragou. Dizer qual dos dois é o caso. */}
          <Cartao titulo={`Perdas · ${dias}d`} valor={brl(perdas.total)} tom="alerta"
            detalhe={perdas.semCusto > 0
              ? `+ ${plural(perdas.semCusto, 'perda sem custo', 'perdas sem custo')}`
              : (perdas.total > 0 ? 'o que foi para o lixo' : 'nada registrado')} />
        </div>

        <Cartao titulo={`Consumo · ${dias}d`} valor={brl(consumo.total)}
          detalhe={consumo.semCusto > 0
            ? `custo do que saiu — ${plural(consumo.semCusto, 'saída ficou', 'saídas ficaram')} de fora, sem custo`
            : 'custo do que saiu do estoque no período'} />

        {semPreco > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-bold text-amber-800">
              {plural(semPreco, 'item na prateleira sem custo', 'itens na prateleira sem custo')} — ficaram de fora das contas
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
              O custo entra sozinho quando você registra uma compra com o valor pago.
              Enquanto não entrar, esses itens não somam — o total acima está incompleto,
              não errado.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {est.semCusto.slice(0, 12).map(i => (
                <span key={i.id} className="text-[10px] bg-white border border-amber-200 rounded-full px-2 py-0.5 text-amber-800">
                  {i.nome} ({fmtNum(i.quantidade)} {i.unidade})
                </span>
              ))}
              {semPreco > 12 && <span className="text-[10px] text-amber-700">+{semPreco - 12}</span>}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 px-1">
            <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">Onde está o dinheiro</p>
            <p className="text-[11px] text-gray-400">
              Classe A concentra os primeiros 80% do valor — é onde vale contar com mais frequência
            </p>
          </div>
          {abc.length === 0 ? (
            <p className="bg-white rounded-xl p-4 text-xs text-gray-500 border border-gray-100">
              Nenhum item com custo cadastrado ainda. Registre uma compra com o valor pago
              para o cálculo começar.
            </p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {abc.slice(0, 25).map(i => (
                <div key={i.id} className="px-3 py-2 flex items-center gap-2">
                  <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 flex-shrink-0 ${CORES_CLASSE[i.classe]}`}>{i.classe}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800 truncate">{i.nome}</p>
                    <p className="text-[10px] text-gray-400">
                      {fmtNum(i.quantidade)} {i.unidade} × {brl(i.custoUnit)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-polo-navy">{brl(i.valor)}</p>
                    <p className="text-[10px] text-gray-400">{fmtNum(i.pct)}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {Object.keys(est.porCategoria).length > 0 && (
          <div>
            <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2 px-1">Por categoria</p>
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {Object.entries(est.porCategoria).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                <div key={cat} className="px-3 py-2 flex justify-between items-center">
                  <span className="text-xs text-gray-700">{cat}</span>
                  <span className="text-xs font-bold text-polo-navy">{brl(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400 px-1 leading-relaxed">
          Números de <strong>{nomeDoEstoque}</strong>. O custo usado é o da{' '}
          <strong>última compra</strong> registrada de cada item.
        </p>
      </div>
    </Layout>
  );
}
