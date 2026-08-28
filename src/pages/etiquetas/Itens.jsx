import { useState, useMemo } from 'react';
import Layout from '../../components/Layout';
import Botao from '../../components/Botao';
import { useApp } from '../../store/AppContext';
import { useUI } from '../../store/UIContext';
import { BIBLIOTECA_ETIQUETAS, buscarNaBiblioteca, agruparPorCategoria } from '../../data/bibliotecaEtiquetas';
import { armazenamentosAtivos, prazosDoProduto, comEspelhoDePrazos, temAlgumPrazo } from '../../utils/armazenamento';

// Campo numérico fica como texto enquanto edita (apagar funciona); converte ao salvar.
const numVazio = (v) => (v === 0 || v == null ? '' : String(v));

/**
 * Cadastro de itens do plano Aurum Etiquetas.
 *
 * Por que não reusar Configurações → Produtos: aquela tela pede min, max,
 * estoque inicial, peso por unidade, cocção e entrada cozida — tudo sobre
 * ESTOQUE, que este produto não vende. Um cadastro de 12 campos para etiquetar
 * alface é o que faz o cliente desistir na primeira semana.
 *
 * Aqui são os campos que a ETIQUETA usa: nome, categoria, unidade,
 * porcionamento e um prazo por armazenamento.
 */
export default function Itens() {
  const { produtos, setProdutos, categorias, setCategorias, prefs } = useApp();
  const { toast, confirm } = useUI();
  const armazenamentos = armazenamentosAtivos(prefs);

  const [aba, setAba] = useState('meus');   // 'meus' | 'biblioteca'
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null); // produto | 'novo' | null

  const meus = useMemo(() => produtos.filter(p => p.ativo !== false), [produtos]);
  const meusFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? meus.filter(p => (p.nome || '').toLowerCase().includes(t)) : meus;
  }, [meus, busca]);

  // ⚠️ Agrupado por categoria, sempre. O dono foi explícito: "proteínas devem
  // estar na ala deles". Uma lista corrida de 100 itens é onde se perde tempo
  // no meio do serviço.
  const gruposMeus = useMemo(() => agruparPorCategoria(meusFiltrados, categorias), [meusFiltrados, categorias]);

  const jaTenho = useMemo(() => new Set(meus.map(p => (p.nome || '').toLowerCase())), [meus]);
  const gruposBiblioteca = useMemo(
    () => agruparPorCategoria(buscarNaBiblioteca(busca)),
    [busca]);

  const adicionarDaBiblioteca = (item) => {
    if (jaTenho.has(item.nome.toLowerCase())) { toast(`"${item.nome}" já está nos seus itens.`, 'aviso'); return; }
    // ⚠️ Id derivado do id da biblioteca, SEM carimbo de hora. Dois ganhos:
    // o id fica estável (o linter reclama, com razão, de Date.now em código
    // alcançável pelo render) e "remover e adicionar de novo" REATIVA o item
    // original em vez de criar um gêmeo — remover aqui é desativar, e sem isto
    // o catálogo encheria de duplicatas invisíveis.
    // ⚠️ A categoria da biblioteca precisa ENTRAR na lista do restaurante.
    // Sem isto, "Alface" chega com HORTIFRÚTI, que não existe em `categorias`:
    // o item aparece agrupado certo na lista, mas o seletor do modal não tem
    // essa opção e, ao salvar qualquer edição, ele seria remanejado EM
    // SILÊNCIO para a primeira categoria (PROTEÍNAS). Peguei isso testando.
    if (item.categoria && !categorias.includes(item.categoria)) {
      setCategorias([...categorias, item.categoria]);
    }
    const idBib = `bib_${item.id}`;
    const jaExiste = produtos.find(p => p.id === idBib);
    if (jaExiste) {
      setProdutos(produtos.map(p => p.id === idBib ? { ...p, ativo: true } : p));
      toast(`"${item.nome}" voltou para os seus itens.`, 'sucesso');
      return;
    }
    setProdutos([...produtos, {
      ...comEspelhoDePrazos({
        id: idBib,
        nome: item.nome,
        categoria: item.categoria,
        unidade: item.unidade,
        marca: '', sif: '', gramatura: 0,
        // ⚠️ min/max/estoqueInicial zerados de propósito: o item nasce um
        // produto estruturalmente VÁLIDO, para o dia em que a conta virar o
        // plano completo e ele aparecer na Cozinha de Produção sem remendo.
        min: 0, max: 0, estoqueInicial: 0,
        ativo: true,
      }, item.prazos),
    }]);
    toast(`"${item.nome}" adicionado. Falta a validade.`, 'sucesso');
  };

  const salvar = (form) => {
    const dados = {
      ...comEspelhoDePrazos(form, form.prazos),
      gramatura: parseFloat(form.gramatura) || 0,
      min: 0, max: 0, estoqueInicial: 0,
      ativo: true,
    };
    if (editando && editando !== 'novo') {
      setProdutos(produtos.map(p => p.id === editando.id ? { ...p, ...dados } : p));
      toast('Item atualizado.', 'sucesso');
    } else {
      setProdutos([...produtos, { ...dados, id: `item_${Date.now()}` }]);
      toast('Item cadastrado.', 'sucesso');
    }
    setEditando(null);
  };

  const remover = async (p) => {
    const ok = await confirm({
      titulo: `Remover "${p.nome}"?`,
      mensagem: 'O item sai da lista. As etiquetas já impressas dele continuam no histórico.',
      perigo: true, confirmar: 'Remover',
    });
    if (!ok) return;
    setProdutos(produtos.map(x => x.id === p.id ? { ...x, ativo: false } : x));
    toast(`"${p.nome}" removido.`, 'sucesso');
  };

  const semPrazo = meus.filter(p => !temAlgumPrazo(p)).length;

  return (
    <Layout title="Meus itens">
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[['meus', `Meus itens (${meus.length})`], ['biblioteca', 'Adicionar prontos']].map(([v, l]) => (
          <button key={v} onClick={() => setAba(v)}
            className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-colors
              ${aba === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
        placeholder={aba === 'meus' ? 'Buscar nos meus itens…' : 'Buscar item pronto (ex.: alface)…'}
        aria-label="Buscar item"
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-4" />

      {aba === 'meus' ? (
        <>
          {/* Resumo discreto do que falta — não é modal, não é vermelho, não
              atrapalha quem só quer imprimir. Some quando não há pendência. */}
          {semPrazo > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              {semPrazo === 1
                ? '1 item está sem prazo de validade — a etiqueta dele sai sem data de vencimento.'
                : `${semPrazo} itens estão sem prazo de validade — a etiqueta deles sai sem data de vencimento.`}
            </p>
          )}

          <Botao onClick={() => setEditando('novo')} className="mb-4">+ Cadastrar item do zero</Botao>

          {meus.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center">
              <p className="text-sm text-gray-600 mb-3">Você ainda não tem itens.</p>
              <p className="text-xs text-gray-500 mb-4">
                O caminho mais rápido é a aba <strong>Adicionar prontos</strong>: são {BIBLIOTECA_ETIQUETAS.length} itens
                de cozinha já preenchidos, é só buscar e tocar.
              </p>
              <Botao onClick={() => setAba('biblioteca')} largura="auto" tamanho="sm">Ver itens prontos</Botao>
            </div>
          ) : gruposMeus.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-6">Nenhum item encontrado para “{busca}”.</p>
          ) : (
            <div className="space-y-4">
              {gruposMeus.map(([cat, itens]) => (
                <div key={cat}>
                  <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-1.5 px-1">{cat}</p>
                  <div className="bg-white rounded-xl divide-y divide-gray-100">
                    {itens.map(p => (
                      <button key={p.id} onClick={() => setEditando(p)}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-gray-50">
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-sm text-gray-900 truncate">{p.nome}</span>
                          <span className="block text-[11px] text-gray-500">
                            {p.unidade}
                            {p.gramatura > 0 && ` · ${p.gramatura} g`}
                            {p.marca && ` · ${p.marca}`}
                          </span>
                        </span>
                        {/* Aviso por item: um ponto âmbar, sem texto. Quem quer
                            saber o que falta abre o item. */}
                        {!temAlgumPrazo(p) && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"
                            title="Sem prazo de validade" aria-label="Sem prazo de validade" />
                        )}
                        {/* chevron de texto: não existe ícone de editar no
                            conjunto, e inventar um só para cá desalinharia. */}
                        <span aria-hidden="true" className="text-gray-400 text-lg leading-none flex-shrink-0">›</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-600 px-1">
            Itens de cozinha já preenchidos. Toque para adicionar aos seus —
            depois é só completar o prazo de validade da sua casa.
          </p>
          {gruposBiblioteca.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-6">
              Nada encontrado para “{busca}”. Você pode cadastrar do zero na aba Meus itens.
            </p>
          ) : gruposBiblioteca.map(([cat, itens]) => (
            <div key={cat}>
              <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-1.5 px-1">{cat}</p>
              <div className="bg-white rounded-xl divide-y divide-gray-100">
                {itens.map(item => {
                  const tem = jaTenho.has(item.nome.toLowerCase());
                  return (
                    <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-sm text-gray-900 truncate">{item.nome}</span>
                        <span className="block text-[11px] text-gray-500">{item.unidade}</span>
                      </span>
                      {tem ? (
                        <span className="text-[11px] text-gray-500 flex-shrink-0">já tenho</span>
                      ) : (
                        <button onClick={() => adicionarDaBiblioteca(item)}
                          aria-label={`Adicionar ${item.nome}`}
                          className="text-xs font-bold text-polo-gold bg-polo-navy rounded-lg px-3 py-2 flex-shrink-0">
                          Adicionar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <ModalItem
          produto={editando === 'novo' ? null : editando}
          categorias={categorias}
          armazenamentos={armazenamentos}
          onSalvar={salvar}
          onRemover={editando !== 'novo' ? () => { remover(editando); setEditando(null); } : null}
          onFechar={() => setEditando(null)}
        />
      )}
    </Layout>
  );
}

function ModalItem({ produto, categorias, armazenamentos, onSalvar, onRemover, onFechar }) {
  const [form, setForm] = useState(() => {
    const prazos = prazosDoProduto(produto);
    return {
      nome: produto?.nome || '',
      categoria: produto?.categoria || categorias[0] || '',
      unidade: produto?.unidade || 'kg',
      gramatura: numVazio(produto?.gramatura),
      marca: produto?.marca || '',
      sif: produto?.sif || '',
      prazos: Object.fromEntries(Object.entries(prazos).map(([k, v]) => [k, numVazio(v)])),
    };
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const opcoesCategoria = categorias.includes(form.categoria) || !form.categoria
    ? categorias
    : [form.categoria, ...categorias];
  const semPrazo = !Object.values(form.prazos || {}).some(v => Number(v) > 0);
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] overflow-y-auto p-4 flex"
      role="dialog" aria-modal="true" aria-labelledby="mi-titulo">
      <div className="bg-white w-full max-w-lg m-auto rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 id="mi-titulo" className="font-bold text-lg text-polo-navy">{produto ? 'Editar item' : 'Novo item'}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="text-2xl text-gray-600 w-8 h-8">×</button>
        </div>

        <div>
          <label htmlFor="mi-nome" className="block text-xs font-semibold text-gray-600 mb-1">Nome</label>
          <input id="mi-nome" type="text" value={form.nome} autoFocus
            onChange={e => set('nome', e.target.value)}
            placeholder="Ex.: Molho de tomate da casa" className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mi-cat" className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
            {/* ⚠️ A categoria ATUAL do item entra na lista mesmo que não esteja
                em `categorias`. Um <select> cujo value não casa com nenhuma
                option mostra a primeira e, ao salvar, move o item de categoria
                sem ninguém pedir — perda silenciosa de dado. */}
            <select id="mi-cat" value={form.categoria} onChange={e => set('categoria', e.target.value)}
              className={`${inputCls} bg-white`}>
              {opcoesCategoria.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mi-unid" className="block text-xs font-semibold text-gray-600 mb-1">Unidade</label>
            <input id="mi-unid" type="text" value={form.unidade}
              onChange={e => set('unidade', e.target.value)} placeholder="kg, L, unid" className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            {/* Porcionamento: vira sugestão do campo Medida na hora de imprimir,
                para não digitar "150 g" a cada etiqueta. */}
            <label htmlFor="mi-gram" className="block text-xs font-semibold text-gray-600 mb-1">Porção (g)</label>
            <input id="mi-gram" type="number" inputMode="numeric" min="0" value={form.gramatura}
              onChange={e => set('gramatura', e.target.value)} placeholder="opcional" className={inputCls} />
          </div>
          <div>
            <label htmlFor="mi-marca" className="block text-xs font-semibold text-gray-600 mb-1">Marca / fornecedor</label>
            <input id="mi-marca" type="text" value={form.marca}
              onChange={e => set('marca', e.target.value)} placeholder="opcional" className={inputCls} />
          </div>
        </div>

        <div>
          <label htmlFor="mi-sif" className="block text-xs font-semibold text-gray-600 mb-1">SIF</label>
          <input id="mi-sif" type="text" value={form.sif}
            onChange={e => set('sif', e.target.value)} placeholder="opcional" className={inputCls} />
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1.5">Validade por armazenamento (dias)</p>
          <div className="grid grid-cols-2 gap-3">
            {armazenamentos.map(a => (
              <div key={a.id}>
                <label htmlFor={`mi-prazo-${a.id}`} className="block text-[11px] text-gray-600 mb-1">
                  {a.nome}{a.faixa && <span className="text-gray-500"> · {a.faixa}</span>}
                </label>
                <input id={`mi-prazo-${a.id}`} type="number" inputMode="numeric" min="0"
                  value={form.prazos?.[a.id] ?? ''}
                  onChange={e => set('prazos', { ...(form.prazos || {}), [a.id]: e.target.value })}
                  placeholder="0" className={inputCls} />
              </div>
            ))}
          </div>
          {/* Aviso, não bloqueio: etiqueta só de identificação é caso legítimo
              (item que não vence). Quem decide é o restaurante. */}
          {semPrazo && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mt-2">
              Sem prazo preenchido, a etiqueta sai sem data de vencimento. Preencha ao menos
              um armazenamento se este item vence.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onFechar}
            className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">Cancelar</button>
          <Botao onClick={() => onSalvar(form)} disabled={!form.nome.trim()} className="flex-1">Salvar</Botao>
        </div>
        {onRemover && (
          <button onClick={onRemover} className="w-full text-red-700 text-xs font-bold py-2">
            Remover item
          </button>
        )}
      </div>
    </div>
  );
}
