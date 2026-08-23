import { useApp } from '../store/AppContext';
import { fmtData } from '../utils/formatters';
import { temRecurso } from '../utils/modulos';

/**
 * O que está sendo perdido — e, por consequência, se o estoque abate.
 *
 * ⚠️ A pergunta MUDOU, e o motivo importa. Antes era "de onde veio a perda?",
 * com duas respostas: 'recebimento' (não abate) e 'estoque' (abate). Isso
 * descrevia a Produção, onde a compra é do insumo CRU e só a porção produzida
 * entra no estoque — lá "chegou ruim, ainda não era estoque" é verdade.
 *
 * No Estoque Seco era MENTIRA: `compraEntraNoEstoque` é true, a compra JÁ é a
 * entrada e o saldo sobe no ato. Quem recebia 10 kg de arroz, jogava 2 fora na
 * doca e marcava "Recebimento — não abate estoque" (a opção que parecia certa,
 * porque "ainda não entrou") deixava saldo fantasma: o sistema seguia contando
 * 10 kg que não existiam, e ninguém descobria até a próxima contagem física.
 *
 * A pergunta nova — "este item é controlado no estoque?" — é verdadeira nos
 * três tipos, e ainda cobre um caso que o modelo antigo não tinha: registrar
 * uma perda de algo que NÃO está no catálogo (sobra de manipulação, item de
 * uso interno) só para constar no relatório, sem mexer em saldo nenhum.
 *
 * Quem abate continua sendo `calcEstoquePuro`, pela mesma regra de sempre:
 * `origem === 'estoque' && produtoId`. Este componente só garante que a
 * resposta gravada corresponda ao que de fato aconteceu.
 */
export default function OrigemCorrecao({ form, onChange }) {
  const { produtos, compras, categorias, modulo } = useApp();
  const ativos = produtos.filter(p => p.ativo);
  const comprasRecentes = [...compras].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
  // A Finalização não tem tela de Compras (`compras: false`), então o seletor
  // de compra ali seria uma caixa eternamente vazia.
  const temCompras = temRecurso(modulo, 'compras');

  const noEstoque = form.origem === 'estoque';

  const setNoEstoque = (sim) => {
    // Trocar de lado limpa o campo do outro lado: um registro não pode
    // carregar produtoId E nome livre ao mesmo tempo sem ficar ambíguo na
    // hora de abater.
    if (sim) onChange({ origem: 'estoque', item: '' });
    else onChange({ origem: 'recebimento', produtoId: '' });
  };

  const selecionarProduto = (id) => {
    const p = produtos.find(x => x.id === id);
    onChange({ produtoId: id, item: p ? p.nome : form.item, unidade: p ? p.unidade : form.unidade });
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-700">Este item é controlado no estoque?</label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setNoEstoque(true)}
          className={`min-h-11 py-2.5 px-3 rounded-lg text-xs font-semibold border-2 text-left transition-colors
            ${noEstoque ? 'border-polo-gold bg-polo-navy text-polo-gold' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
          Sim, está no estoque<br />
          <span className="font-normal opacity-90">abate do saldo</span>
        </button>
        <button type="button" onClick={() => setNoEstoque(false)}
          className={`min-h-11 py-2.5 px-3 rounded-lg text-xs font-semibold border-2 text-left transition-colors
            ${!noEstoque ? 'border-polo-gold bg-polo-navy text-polo-gold' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
          Não é controlado<br />
          <span className="font-normal opacity-90">só entra no relatório</span>
        </button>
      </div>

      {noEstoque ? (
        <>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Produto que perdeu</label>
            <select value={form.produtoId || ''} onChange={e => selecionarProduto(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 min-h-11 py-2 text-sm bg-white">
              <option value="">Selecione o produto...</option>
              {categorias.map(cat => {
                const prods = ativos.filter(p => p.categoria === cat);
                if (!prods.length) return null;
                return (
                  <optgroup key={cat} label={cat}>
                    {prods.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </optgroup>
                );
              })}
            </select>
            <p className="text-xs text-red-700 mt-1">Será abatido do saldo deste produto.</p>
          </div>
          {/* ⚠️ Associar à compra continua disponível DESTE lado também. No
              modelo antigo os dois campos eram mutuamente exclusivos, então no
              Seco não dava para abater o saldo E medir o rendimento da compra
              ao mesmo tempo — que é exatamente o que aquela cozinha precisa. */}
          {temCompras && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Veio de qual compra? (opcional)</label>
              <select value={form.compraId || ''} onChange={e => onChange({ compraId: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 min-h-11 py-2 text-sm bg-white">
                <option value="">— Não associar —</option>
                {comprasRecentes.map(c => (
                  <option key={c.id} value={c.id}>{fmtData(c.data)} • {c.item} ({c.quantidade}{c.unidade})</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">Liga a perda ao recebimento para calcular o rendimento.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-gray-600">
            Fica registrado no relatório de desperdício, sem mexer no saldo de nenhum produto.
          </p>
          {temCompras && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Veio de qual compra? (opcional)</label>
              <select value={form.compraId || ''} onChange={e => onChange({ compraId: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 min-h-11 py-2 text-sm bg-white">
                <option value="">— Não associar —</option>
                {comprasRecentes.map(c => (
                  <option key={c.id} value={c.id}>{fmtData(c.data)} • {c.item} ({c.quantidade}{c.unidade})</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">Liga a perda ao recebimento para calcular o rendimento.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
