import { useState, useMemo, useEffect } from 'react';
import Layout from '../../components/Layout';
import Botao from '../../components/Botao';
import Dialogo from '../../components/Dialogo';
import Aviso from '../../components/Aviso';
import { useApp } from '../../store/AppContext';
import { useUI } from '../../store/UIContext';
import { BIBLIOTECA_ETIQUETAS, buscarNaBiblioteca, agruparPorCategoria, CATEGORIAS_BIBLIOTECA } from '../../data/bibliotecaEtiquetas';
import { armazenamentosAtivos, prazosDoProduto, comEspelhoDePrazos, temAlgumPrazo } from '../../utils/armazenamento';
import { medidaDoProduto, gramasDeMedida } from '../../utils/etiquetas';
import { useAuth } from '../../store/AuthContext';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../../utils/produto';

// Campo numérico fica como texto enquanto edita (apagar funciona); converte ao salvar.
const numVazio = (v) => (v === 0 || v == null ? '' : String(v));



/**
 * Meus itens — o cadastro do plano Aurum Etiquetas.
 *
 * Por que não reusa Configurações → Produtos: aquela tela pede mín, máx,
 * estoque inicial, peso por unidade, cocção e entrada cozida — tudo sobre
 * ESTOQUE, que este produto não vende. Cadastro de 12 campos para etiquetar
 * alface é onde o cliente desiste.
 *
 * ⚠️ AQUI TAMBÉM VIVEM AS "AVULSAS". Antes eram uma aba separada, com um
 * cadastro paralelo (`etiquetasAvulsas`) só para itens tipo "Leite aberto".
 * Eram duas listas para a mesma pergunta — "o que eu etiqueto?" — e a pessoa
 * tinha que saber de antemão em qual das duas procurar. O que diferenciava
 * uma avulsa era só a DATA SER DE ABERTURA em vez de manipulação, e isso
 * virou um campo do item (`tipoData`).
 */
export default function Itens() {
  const { produtos, setProdutos, categorias, setCategorias, prefs } = useApp();
  const { toast, confirm } = useUI();
  const { sessao, impersonando } = useAuth();
  // ⚠️ ESTA TELA VIROU O CADASTRO DOS DOIS PRODUTOS. No plano de etiquetas
  // ela é o que sempre foi; no completo ela substituiu um formulário de 12
  // campos, e os campos de ESTOQUE aparecem num bloco recolhido. Cadastro
  // pesado é onde o cliente desiste — mas quem tem estoque precisa deles.
  const soEtiq = ehSoEtiquetas(produtoAtivo(sessao, impersonando));
  const armazenamentos = armazenamentosAtivos(prefs);

  const [aba, setAba] = useState('meus');   // 'meus' | 'biblioteca'
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null); // {produto} | {rascunho} | null

  const meus = useMemo(() => produtos.filter(p => p.ativo !== false), [produtos]);
  const meusFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? meus.filter(p => (p.nome || '').toLowerCase().includes(t)) : meus;
  }, [meus, busca]);

  // ⚠️ Agrupado por categoria, sempre — nas duas abas, com a MESMA ordem.
  // "Proteínas na ala delas" é requisito do produto, não enfeite: lista corrida
  // de 200 itens é onde se perde tempo no meio do serviço.
  const ordemCategorias = useMemo(() => {
    // as da biblioteca primeiro (ordem pensada), depois as que o cliente criou
    const extras = categorias.filter(c => !CATEGORIAS_BIBLIOTECA.includes(c));
    return [...CATEGORIAS_BIBLIOTECA, ...extras];
  }, [categorias]);

  const gruposMeus = useMemo(
    () => agruparPorCategoria(meusFiltrados, ordemCategorias),
    [meusFiltrados, ordemCategorias]);

  const jaTenho = useMemo(() => new Set(meus.map(p => (p.nome || '').toLowerCase())), [meus]);
  const gruposBiblioteca = useMemo(() => agruparPorCategoria(buscarNaBiblioteca(busca)), [busca]);

  // ⚠️ Adicionar da biblioteca ABRE A FICHA em vez de salvar direto. O dono
  // pediu, e está certo: o item pronto traz sugestões (prazo, armazenamento,
  // unidade) que dependem da casa. Salvar sem mostrar seria o app decidindo
  // validade por um restaurante que ele não conhece.
  const abrirDaBiblioteca = (item) => {
    if (jaTenho.has(item.nome.toLowerCase())) { toast(`"${item.nome}" já está nos seus itens.`, 'aviso'); return; }
    setEditando({
      origemBiblioteca: item.id,
      nome: item.nome,
      categoria: item.categoria,
      unidade: item.unidade,
      tipoData: item.tipoData || 'fabricacao',
      armazenamentoSugerido: item.armazenamentoSugerido,
      prazos: item.prazos || {},
      medidaPadrao: '', marca: '', sif: '',
    });
  };

  const salvar = (form) => {
    const nome = (form.nome || '').trim();
    // ⚠️ Onde ESTE item fica guardado. Sem isto a impressão pegava sempre o
    // primeiro armazenamento da lista, e azeite saía com "CONGELADO" na
    // etiqueta — erro que vai colado no pote. Derivado, sem pedir mais um
    // campo no formulário: manda o que o usuário escolheu, senão o único
    // estado que tem prazo preenchido, senão a sugestão da biblioteca.
    const comPrazo = Object.entries(form.prazos || {}).filter(([, v]) => Number(v) > 0).map(([k]) => k);
    const armazenamentoPadrao = form.armazenamentoPadrao
      || (comPrazo.length === 1 ? comPrazo[0] : null)
      || form.armazenamentoSugerido
      || comPrazo[0]
      || armazenamentos[0]?.id
      || 'congelado';

    const dados = {
      ...comEspelhoDePrazos({
        nome,
        categoria: form.categoria,
        unidade: (form.unidade || '').trim() || 'unid',
        tipoData: form.tipoData || 'fabricacao',
        armazenamentoPadrao,
        marca: (form.marca || '').trim(),
        sif: (form.sif || '').trim(),
        medidaPadrao: (form.medidaPadrao || '').trim(),
        // Mantem `gramatura` numerica quando a medida for em gramas puras: e o
        // campo que o app COMPLETO usa, e o cliente pode migrar de plano.
        gramatura: gramasDeMedida(form.medidaPadrao),
        // ⚠️ Zero quando não foi preenchido, NUNCA undefined: o item nasce um
        // produto estruturalmente válido, para o dia em que a conta virar o
        // plano completo e ele aparecer na Cozinha de Produção sem remendo.
        min: Number(form.min) || 0,
        max: Number(form.max) || 0,
        estoqueInicial: Number(form.estoqueInicial) || 0,
        pesoUnidade: Number(form.pesoUnidade) || 0,
        ativo: true,
      }, form.prazos),
    };

    // categoria nova criada na hora entra no catálogo do restaurante
    if (dados.categoria && !categorias.includes(dados.categoria)) {
      setCategorias([...categorias, dados.categoria]);
    }

    if (form.id) {
      setProdutos(produtos.map(p => p.id === form.id ? { ...p, ...dados } : p));
      toast('Item atualizado.', 'sucesso');
    } else {
      // Id estável quando vem da biblioteca: assim "remover e adicionar de
      // novo" REATIVA o item em vez de criar um gêmeo invisível (remover aqui
      // é desativar, não apagar).
      if (form.origemBiblioteca) {
        const id = `bib_${form.origemBiblioteca}`;
        const existente = produtos.find(p => p.id === id);
        if (existente) setProdutos(produtos.map(p => p.id === id ? { ...p, ...dados, ativo: true } : p));
        else setProdutos([...produtos, { ...dados, id }]);
      } else {
        // ⚠️ Item criado do zero: o id vem do nome, e nome REPETE. Sem o
        // sufixo, cadastrar "Molho" duas vezes gerava o mesmo id e o segundo
        // SOBRESCREVIA o primeiro em silêncio — a pessoa via "cadastrado" e o
        // item anterior sumia com os prazos dele.
        const base = `item_${nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
        let id = base, n = 2;
        while (produtos.some(p => p.id === id)) id = `${base}_${n++}`;
        setProdutos([...produtos, { ...dados, id }]);
      }
      toast(`"${nome}" cadastrado.`, 'sucesso');
    }
    setEditando(null);
  };

  const remover = async (p) => {
    const ok = await confirm({
      titulo: `Remover "${p.nome}"?`,
      mensagem: 'O item sai da lista. As etiquetas já impressas dele continuam como estão.',
      perigo: true, confirmar: 'Remover',
    });
    if (!ok) return;
    setProdutos(produtos.map(x => x.id === p.id ? { ...x, ativo: false } : x));
    toast(`"${p.nome}" removido.`, 'sucesso');
    setEditando(null);
  };

  const semPrazo = meus.filter(p => !temAlgumPrazo(p)).length;

  return (
    <Layout title="Meus itens">
      {/* ⚠️ `aria-pressed` diz QUAL ABA ESTÁ ABERTA. Sem ele o leitor de tela
          anunciava as duas igual ("Meus itens, botão") e a pessoa não tinha
          como saber onde estava — a cor era o único sinal. As seis barras de
          aba do app seguem esta mesma marcação.
          ⚠️ E é `aria-pressed`, não `role="tab"`: o padrão de abas da ARIA
          exige foco itinerante (só UMA aba alcançável por Tab, as outras pelas
          setas). Aqui elas são poucas e ficam todas no caminho do Tab, que num
          tablet com teclado é melhor — trocar o modelo de teclado por causa de
          um anúncio seria arriscar o que já funciona. */}
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1">
        {[['meus', `Meus itens (${meus.length})`], ['biblioteca', 'Adicionar prontos']].map(([v, l]) => (
          <button key={v} onClick={() => setAba(v)} aria-pressed={aba === v}
            className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-colors
              ${aba === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
        placeholder={aba === 'meus' ? 'Buscar nos meus itens…' : 'Buscar item pronto (ex.: picanha, sal, alface)…'}
        aria-label="Buscar item"
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-4" />

      {aba === 'meus' ? (
        <>
          {semPrazo > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              {semPrazo === 1
                ? '1 item está sem prazo de validade — a etiqueta dele sai sem data de vencimento.'
                : `${semPrazo} itens estão sem prazo de validade — a etiqueta deles sai sem data de vencimento.`}
            </p>
          )}

          <Botao onClick={() => setEditando({ nome: '', categoria: categorias[0] || 'OUTROS', unidade: 'kg', tipoData: 'fabricacao', prazos: {}, medidaPadrao: '', marca: '', sif: '' })}
            className="mb-4">+ Cadastrar item do zero</Botao>

          {meus.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center">
              <p className="text-sm font-semibold text-polo-navy mb-1">Sua lista está vazia</p>
              <p className="text-xs text-gray-600 mb-4">
                O caminho rápido é a aba <strong>Adicionar prontos</strong>: {BIBLIOTECA_ETIQUETAS.length} itens
                de cozinha já preenchidos, é só buscar, conferir e salvar.
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
                      <button key={p.id} onClick={() => setEditando({ ...p, prazos: prazosDoProduto(p), medidaPadrao: medidaDoProduto(p), min: numVazio(p.min), max: numVazio(p.max), estoqueInicial: numVazio(p.estoqueInicial), pesoUnidade: numVazio(p.pesoUnidade) })}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-gray-50">
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-sm text-gray-900 truncate">{p.nome}</span>
                          <span className="block text-[11px] text-gray-500">
                            {p.unidade}
                            {medidaDoProduto(p) && ` · ${medidaDoProduto(p)}`}
                            {p.tipoData === 'abertura' && ' · data de abertura'}
                            {p.marca && ` · ${p.marca}`}
                          </span>
                        </span>
                        {!temAlgumPrazo(p) && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"
                            title="Sem prazo de validade" aria-label="Sem prazo de validade" />
                        )}
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
            Toque num item para abrir a ficha dele já preenchida — você confere o prazo e o
            armazenamento da sua casa antes de salvar.
          </p>
          {gruposBiblioteca.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-6">
              Nada encontrado para “{busca}”. Dá para cadastrar do zero na aba Meus itens.
            </p>
          ) : gruposBiblioteca.map(([cat, itens]) => (
            <div key={cat}>
              <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-1.5 px-1">{cat}</p>
              <div className="bg-white rounded-xl divide-y divide-gray-100">
                {itens.map(item => {
                  const tem = jaTenho.has(item.nome.toLowerCase());
                  return (
                    <button key={item.id} onClick={() => abrirDaBiblioteca(item)} disabled={tem}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-gray-50 disabled:opacity-50">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-sm text-gray-900 truncate">{item.nome}</span>
                        <span className="block text-[11px] text-gray-500">
                          {item.unidade}
                          {item.tipoData === 'abertura' && ' · data de abertura'}
                        </span>
                      </span>
                      <span className={`text-[11px] flex-shrink-0 ${tem ? 'text-gray-500' : 'font-bold text-polo-navy'}`}>
                        {tem ? 'já tenho' : 'Adicionar ›'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <ModalItem
          inicial={editando}
          categorias={ordemCategorias}
          armazenamentos={armazenamentos}
          soEtiq={soEtiq}
          onSalvar={salvar}
          onRemover={editando.id ? () => remover(editando) : null}
          onFechar={() => setEditando(null)}
        />
      )}
    </Layout>
  );
}

function ModalItem({ inicial, categorias, armazenamentos, onSalvar, onRemover, onFechar, soEtiq }) {
  const [form, setForm] = useState(() => ({
    ...inicial,
    prazos: Object.fromEntries(Object.entries(inicial.prazos || {}).map(([k, v]) => [k, numVazio(v)])),
  }));
  const [novaCat, setNovaCat] = useState('');
  const [criandoCat, setCriandoCat] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Esc fecha — o modal de impressão já fazia isso, este não fazia. Duas
  // janelas do mesmo app respondendo diferente à mesma tecla é defeito.
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onFechar]);

  // ⚠️ A categoria ATUAL entra na lista mesmo que não esteja em `categorias`:
  // um <select> cujo value não casa com nenhuma option mostra a primeira e, ao
  // salvar, move o item de categoria sem ninguém pedir.
  const opcoes = categorias.includes(form.categoria) || !form.categoria
    ? categorias : [form.categoria, ...categorias];

  const semPrazo = !Object.values(form.prazos || {}).some(v => Number(v) > 0);
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';
  const daBiblioteca = !!inicial.origemBiblioteca;

  const confirmarCat = () => {
    const c = novaCat.trim().toUpperCase();
    if (!c) return;
    set('categoria', c);
    setNovaCat(''); setCriandoCat(false);
  };

  return (
    <Dialogo aoFechar={onFechar} forma="ficha" largura="lg" camada={70} classeCaixa="space-y-4"
      fecharNoFundo={false}
      titulo={inicial.id ? 'Editar item' : daBiblioteca ? 'Conferir e adicionar' : 'Novo item'}>
      <>
        {daBiblioteca && (
          <p className="text-[11px] text-gray-600 bg-polo-beige rounded-lg px-2.5 py-2">
            Já preenchemos o que dá. <strong>Confira o prazo de validade</strong> — ele muda
            conforme o processo e a câmara da sua cozinha.
          </p>
        )}

        <div>
          <label htmlFor="mi-nome" className="block text-xs font-semibold text-gray-600 mb-1">Nome</label>
          <input id="mi-nome" type="text" value={form.nome} autoFocus={!daBiblioteca}
            onChange={e => set('nome', e.target.value)}
            placeholder="Ex.: Molho de tomate da casa" className={inputCls} />
        </div>

        <div>
          {/* ⚠️ ERA "Onde fica", e isto é categoria, não lugar. Dois campos
              abaixo a MESMA ficha pergunta de verdade onde o item é guardado
              (congelado/resfriado, no bloco de prazos). Com os dois rótulos na
              tela, a pessoa respondia "geladeira" aqui e criava um grupo com
              nome de câmara. "Grupo" é a palavra que o próprio botão + Novo já
              usa no campo de baixo. */}
          <label htmlFor="mi-cat" className="block text-xs font-semibold text-gray-600 mb-1">Grupo</label>
          {criandoCat ? (
            <div className="flex items-center gap-2">
              <input type="text" value={novaCat} onChange={e => setNovaCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmarCat(); }}
                autoFocus placeholder="Nome do grupo (ex.: VEGANOS)"
                aria-label="Nome do novo grupo" className={inputCls} />
              <Botao onClick={confirmarCat} tamanho="sm" largura="auto">OK</Botao>
              <button onClick={() => { setCriandoCat(false); setNovaCat(''); }}
                className="text-xs text-gray-500 px-1">Cancelar</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select id="mi-cat" value={form.categoria} onChange={e => set('categoria', e.target.value)}
                className={`${inputCls} bg-white flex-1`}>
                {opcoes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {/* O cliente pode criar grupos além dos tradicionais */}
              <button onClick={() => setCriandoCat(true)}
                className="text-xs font-bold text-polo-navy border border-polo-navy/30 rounded-lg px-3 py-2 flex-shrink-0">
                + Novo
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mi-unid" className="block text-xs font-semibold text-gray-600 mb-1">Unidade</label>
            <input id="mi-unid" type="text" value={form.unidade}
              onChange={e => set('unidade', e.target.value)} placeholder="kg, L, unid" className={inputCls} />
          </div>
          <div>
            {/* Porcionamento: vira sugestão do campo Medida ao imprimir, para
                não digitar "150 g" a cada etiqueta. */}
            {/* ⚠️ TEXTO LIVRE, igual ao campo Medida da tela de impressão.
                Antes aqui era "Porção (g)", só numero em gramas — então um
                item de 1 kg nao tinha como ser cadastrado, e a tela de
                impressão (que aceita "1 kg") mostrava algo que o cadastro nao
                conseguia gerar. Dois campos para a mesma coisa, com regras
                diferentes, é onde o usuário conclui que o sistema está errado. */}
            <label htmlFor="mi-medida" className="block text-xs font-semibold text-gray-600 mb-1">Medida padrão</label>
            <input id="mi-medida" type="text" value={form.medidaPadrao}
              onChange={e => set('medidaPadrao', e.target.value)}
              placeholder="ex.: 150 g, 1 kg, 500 mL" className={inputCls} />
          </div>
        </div>

        {/* ⚠️ Isto é o que antes fazia um item ser "avulso". O dono disse que
            não entendia a diferença na prática — e a explicação honesta é que
            ela é PEQUENA: os dois contam os dias a partir de hoje. O que muda
            é a PALAVRA IMPRESSA na etiqueta, e essa palavra importa para quem
            pega o pote na prateleira (e para o fiscal). Então o texto diz
            exatamente isso, em vez de sugerir uma diferença de cálculo que não
            existe. */}
        <div>
          {/* ⚠️ ESTA ESCOLHA DECIDE A PALAVRA QUE SAI IMPRESSA NO POTE, e era a
              menos visível da tela: o cartão escolhido se distinguia SÓ por uma
              borda dourada, que dá 2,40 de contraste contra o branco — abaixo
              do mínimo de 3 e, num tablet com reflexo de cozinha, praticamente
              invisível. Agora são três sinais que não dependem de enxergar cor:
              a borda escura (navy), o fundo bege e um ✓.
              ⚠️ E `radiogroup`/`radio` em vez de dois botões soltos: sem isso o
              leitor de tela anunciava "Manipulação, botão" sem dizer qual das
              duas estava marcada — a informação que mais importa aqui. */}
          <p id="mi-tipodata" className="text-xs font-semibold text-gray-600 mb-1.5">O que aconteceu com o produto?</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="mi-tipodata">
            {[['fabricacao', 'Manipulação', 'você porcionou, cortou ou cozinhou'],
              ['abertura', 'Abertura', 'você abriu a embalagem do fabricante']].map(([v, l, d]) => (
              <button key={v} type="button" onClick={() => set('tipoData', v)}
                role="radio" aria-checked={form.tipoData === v}
                className={`text-left rounded-lg p-2.5 border-2 transition-colors
                  ${form.tipoData === v ? 'border-polo-navy bg-polo-beige' : 'border-gray-200'}`}>
                <span className="flex items-center gap-1 text-sm font-bold text-polo-navy">
                  <span aria-hidden="true" className={form.tipoData === v ? 'opacity-100' : 'opacity-0'}>✓</span>
                  {l}
                </span>
                <span className="block text-[11px] text-gray-600 leading-tight mt-0.5">{d}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-600 mt-1.5">
            A conta é a mesma nos dois: a validade sai a partir de <strong>hoje</strong>.
            Muda só a palavra impressa na etiqueta —{' '}
            <strong>{form.tipoData === 'abertura' ? 'ABERTURA' : 'MANIPULAÇÃO'}</strong>.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mi-marca" className="block text-xs font-semibold text-gray-600 mb-1">Marca / fornecedor</label>
            <input id="mi-marca" type="text" value={form.marca}
              onChange={e => set('marca', e.target.value)} placeholder="opcional" className={inputCls} />
          </div>
          <div>
            <label htmlFor="mi-sif" className="block text-xs font-semibold text-gray-600 mb-1">SIF</label>
            <input id="mi-sif" type="text" value={form.sif}
              onChange={e => set('sif', e.target.value)} placeholder="opcional" className={inputCls} />
          </div>
        </div>

        <div>
          {/* ⚠️ O RÓTULO MUDA COM O tipoData, e é isto que tira a confusão do
              dono: para item aberto, a pergunta que a embalagem responde é
              "depois de aberto, dura quantos dias?" — o leite que diz
              "consumir em 3 dias após aberto" vira 3 aqui, e a etiqueta sai
              com a data certa. Perguntar "validade" genérica fazia parecer
              que era a validade de fábrica, que não é o que o app calcula. */}
          <p className="text-xs font-semibold text-gray-600 mb-1.5">
            {form.tipoData === 'abertura'
              ? 'Depois de ABERTO, dura quantos dias?'
              : 'Depois de MANIPULADO, dura quantos dias?'}
          </p>
          <p className="text-[11px] text-gray-600 mb-2">
            {form.tipoData === 'abertura'
              ? 'Está na embalagem do fabricante — algo como "após aberto, consumir em 3 dias". Preencha na temperatura em que você guarda.'
              : 'É o prazo do processo da sua cozinha, em cada temperatura de guarda.'}
          </p>
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
          {/* Aviso, não bloqueio — mas o texto antigo dizia que ficar em branco
              era "certo para item que segue a validade do fabricante", e o dono
              leu isso como "pode deixar vazio", o que está errado para quase
              tudo. Agora o padrão é PREENCHER, e o vazio é a exceção nomeada. */}
          {semPrazo && (
            <Aviso tom="atencao" className="mt-2">
              <strong>Sem prazo, a etiqueta sai sem data de vencimento.</strong> Quase todo item
              precisa de um — inclusive os abertos. Deixe vazio só no que realmente não vence
              depois de aberto (sal, açúcar, farinha): nesses a etiqueta sai <strong>sem
              vencimento</strong>. Se quiser que ela mostre a validade da embalagem, ligue
              “Validade original (fornecedor)” em Administração → Etiquetas.
            </Aviso>
          )}
        </div>

        {/* ⚠️ RECOLHIDO, e só existe no plano completo. Quem comprou só etiqueta
            não tem estoque para controlar, e mostrar mínimo/máximo ali seria
            oferecer tela que a conta não tem. Quem tem estoque abre uma vez, no
            cadastro, e não vê mais. */}
        {!soEtiq && (
          <details className="border border-gray-200 rounded-lg">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-600">
              Controle de estoque <span className="font-normal text-gray-500">· opcional</span>
            </summary>
            <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
              <p className="text-[11px] text-gray-600">
                Deixe em branco o que não usa. Dá para preencher depois, quando o item começar a girar.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[['estoqueInicial', 'Tem hoje'], ['min', 'Mínimo'], ['max', 'Máximo']].map(([k, l]) => (
                  <div key={k}>
                    <label htmlFor={`mi-${k}`} className="block text-[11px] text-gray-600 mb-1">{l}</label>
                    <input id={`mi-${k}`} type="number" inputMode="decimal" min="0"
                      value={form[k] ?? ''} onChange={e => set(k, e.target.value)}
                      placeholder="0" className={inputCls} />
                  </div>
                ))}
              </div>
              <div>
                <label htmlFor="mi-peso" className="block text-[11px] text-gray-600 mb-1">
                  Peso por unidade (g) <span className="text-gray-500">· só para item contado por unidade</span>
                </label>
                <input id="mi-peso" type="number" inputMode="decimal" min="0"
                  value={form.pesoUnidade ?? ''} onChange={e => set('pesoUnidade', e.target.value)}
                  placeholder="ex.: 180" className={inputCls} />
              </div>
            </div>
          </details>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onFechar}
            className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">Cancelar</button>
          <Botao onClick={() => onSalvar(form)} disabled={!(form.nome || '').trim()} className="flex-1">
            {inicial.id ? 'Salvar' : 'Adicionar'}
          </Botao>
        </div>
        {onRemover && (
          <button onClick={onRemover} className="w-full text-red-700 text-xs font-bold py-2">
            Remover item
          </button>
        )}
      </>
    </Dialogo>
  );
}
