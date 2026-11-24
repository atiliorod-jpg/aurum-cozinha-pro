import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Filtros from '../components/ui/Filtros';
import Layout from '../components/Layout';
import PrimeiroUso from '../components/PrimeiroUso';
import { FaixaImpressora } from '../components/Impressora';
import { useApp } from '../store/AppContext';
import { agruparPorCategoria } from '../data/bibliotecaEtiquetas';
import { useUI } from '../store/UIContext';
import { hoje } from '../utils/formatters';
import { etiquetaComArmazenamento, produtoParaEtiqueta } from '../utils/modulos';
import { armazenamentosAtivos, prazosDoProduto } from '../utils/armazenamento';
import { armazenamentoInicial } from '../utils/etiquetas';
import { metodosDoProduto, metodoInicial, rotuloDoMetodo, prazoCurto, temPrazo, listarEstados, textoDoPrazo } from '../utils/metodos';
import { vocabularioDeMetodos, escolherMetodoFalado } from '../utils/voz';
import { gruposDoProduto, estaNoGrupo, ordemDosGrupos } from '../utils/grupos';
import { medidaDoProduto, maisUsados } from '../utils/etiquetas';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../utils/produto';
import { useAuth } from '../store/AuthContext';
import { casaBusca } from '../utils/busca';
import { pode } from '../utils/permissoes';
import Esqueleto from '../components/Esqueleto';
import Icon from '../components/Icons';
import QuemImprime, { FaixaOperador, ContinuarImprimindo } from '../components/QuemImprime';
import BuscaPorVoz from '../components/BuscaPorVoz';
import { useOperador, useTelaDeImprimir } from '../store/OperadorContext';
import { faltasDoPrimeiroUso } from '../utils/primeiroUso';

// Página de etiquetas: imprime etiqueta de QUALQUER produto do catálogo a
// qualquer momento (sem precisar de entrada/produção) e mantém um catálogo
// de etiquetas avulsas para itens fora do estoque (ex.: "Leite aberto").
export default function Etiquetas() {
  const { produtos, categorias, prefs, modulo, etiquetasImpressas, permissoes, nuvemCarregada, pessoas, prefsConhecidas } = useApp();
  const { abrirEtiquetas } = useUI();
  // ⚠️ "QUEM VAI IMPRIMIR?" ANTES DE TUDO (13/10/2026, pedido do dono, como
  // na Suflex): com a equipe cadastrada, a busca só aparece depois que a
  // pessoa toca no nome (e digita a senha, se tiver). A etiqueta sai com o
  // nome dela. Equipe vazia: tudo como era antes.
  const { operador, comEquipe, trocar, expiracoes } = useOperador();
  const precisaEscolher = comEquipe && !operador;

  const { sessao, impersonando, temPermissao } = useAuth();
  // o aviso de equipe vazia não repete o PrimeiroUso, que já pede os nomes
  const primeiroUsoNaTela = faltasDoPrimeiroUso({ pessoas, prefs, ehDiretoria: temPermissao('diretoria'), prefsConhecidas }).mostrar;
  const soEtiq = ehSoEtiquetas(produtoAtivo(sessao, impersonando));
  const armazenamentos = armazenamentosAtivos(prefs);
  const estados = listarEstados(prefs);
  // Os métodos do item com prazo, num armazenamento que a casa ainda usa. Só
  // os preenchidos: listar "0d" para os quatro estados enche a linha de ruído.
  const prazosVisiveis = (p) => metodosDoProduto(p)
    .filter(m => temPrazo(m) && armazenamentos.some(a => a.id === m.armazenamento))
    .map(m => ({ nome: rotuloDoMetodo(m, armazenamentos, estados), prazo: prazoCurto(m) }));

  // Uma linha só quando todos os estados dão o mesmo número.
  const resumoDePrazos = (p) => {
    const v = prazosVisiveis(p);
    if (!v.length) return 'sem prazo cadastrado — etiqueta só de identificação';
    if (v.length > 1 && v.every(x => x.prazo === v[0].prazo)) return `${v[0].prazo} em qualquer estado`;
    return v.map(x => `${x.nome} ${x.prazo}`).join(' · ');
  };

  const [busca, setBusca] = useState('');
  const [catAtiva, setCatAtiva] = useState('');

  // ── De volta para os nomes (pedido do dono, 03/11/2026, visto na Suflex) ──
  // 1 minuto sem ninguém mexer, ou "Continuar imprimindo?" sem resposta: a
  // tela recomeça do zero — nomes, sem busca, sem filtro. A
  // janela de impressão aberta daqui fecha sozinha (ver EtiquetaPrint).
  const [perguntarSeContinua, setPerguntarSeContinua] = useState(false);
  // o que foi falado ("três etiquetas de filé congelado") vale para o item que
  // a pessoa tocar na lista filtrada pela voz — quantidade e método; digitar
  // na busca esquece
  const [pedidoDaVoz, setPedidoDaVoz] = useState(null);
  // o que a voz tem a dizer abaixo da busca (ver BuscaPorVoz)
  const [avisoDaVoz, setAvisoDaVoz] = useState(null);
  const recomecar = useCallback(() => {
    setBusca(''); setCatAtiva(''); setPerguntarSeContinua(false);
    setPedidoDaVoz(null); setAvisoDaVoz(null);
  }, [setPerguntarSeContinua]);
  // ⚠️ O MINUTO SEM USO SÓ CONTA AQUI (decisão do dono, 04/11/2026): esta tela
  // avisa o OperadorContext que está aberta. Ver useTelaDeImprimir.
  useTelaDeImprimir();
  const expiracoesVistas = useRef(expiracoes);
  useEffect(() => {
    if (expiracoes === expiracoesVistas.current) return;
    expiracoesVistas.current = expiracoes;
    recomecar();
  }, [expiracoes, recomecar]);
  const trocarPessoa = useCallback(() => { trocar(); recomecar(); }, [trocar, recomecar]);
  // ⚠️ "CONTINUAR IMPRIMINDO?" SÓ PARA QUEM AINDA ESTÁ (auditoria 04/11/2026).
  // O nome pode expirar no meio de um envio longo pelo Bluetooth ou com "Saiu
  // no papel?" esperando: a pergunta ficava guardada e aparecia para a PRÓXIMA
  // pessoa, que era tirada em 5 s. Quando a etiqueta sai, confere quem está.
  const operadorAgora = useRef(operador);
  useEffect(() => { operadorAgora.current = operador; }, [operador]);

  // ── Aba Catálogo ─────────────────────────────────────────────
  const produtosAtivos = produtos.filter(p => p.ativo);
  const buscando = busca.trim().length > 0;
  // ⚠️ O FILTRO É POR QUALQUER GRUPO DO ITEM (Lote 11, parte 2): o frango de
  // AVES aparece também em "ALMOÇO DE FUNCIONÁRIOS". A busca acha pelos
  // grupos também.
  const produtosVisiveis = buscando
    ? produtosAtivos.filter(p => casaBusca(busca, p.nome, ...gruposDoProduto(p)))
    : catAtiva === ''
      ? produtosAtivos
      : produtosAtivos.filter(p => estaNoGrupo(p, catAtiva));

  // ⚠️ AGRUPADO POR CATEGORIA, IGUAL A "MEUS ITENS". Esta tela era a única
  // lista corrida do app: os itens saíam na ordem em que foram cadastrados, e
  // as categorias serviam só de filtro. Numa casa com 60 itens vira caça ao
  // nome no meio do serviço — e as duas telas se comportavam de jeitos
  // diferentes com o mesmo dado, que é o defeito que a gente já corrigiu
  // três vezes neste app.
  // A ordem das categorias é a da biblioteca (pensada: proteínas juntas),
  // com as que o restaurante criou no fim, em ordem alfabética. Dentro de
  // cada uma, alfabética — nome é o que a pessoa procura.
  // ⚠️ Desde o Lote 11 (parte 2) a ordem é a da lista da casa, que o dono
  // arruma em Meus itens → Organizar grupos (conta nova: a da biblioteca).
  const ordemCategorias = useMemo(() => ordemDosGrupos(categorias), [categorias]);
  // os botões de grupo: só os que têm item, na ordem da casa
  const gruposEmUso = useMemo(() => {
    const usados = new Set(produtos.filter(p => p.ativo).flatMap(gruposDoProduto));
    return [...ordemCategorias.filter(g => usados.has(g)),
      ...[...usados].filter(g => !ordemCategorias.includes(g)).sort()];
  }, [produtos, ordemCategorias]);

  // Os mais etiquetados dos últimos 14 dias NESTA cozinha (a lista de
  // impressas é por cozinha — com unidades, por unidade). Ver maisUsados.
  const atalhos = useMemo(
    () => maisUsados(etiquetasImpressas, produtos.filter(p => p.ativo), hoje()),
    [etiquetasImpressas, produtos]);

  const gruposVisiveis = useMemo(() => {
    const ordenados = [...produtosVisiveis].sort((a, b) =>
      (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));
    // com um grupo escolhido, um cabeçalho só — o dele: o item que é de AVES
    // e do almoço apareceria sob "AVES" no filtro do almoço
    if (catAtiva !== '' && !buscando) return [[catAtiva, ordenados]];
    return agruparPorCategoria(ordenados, ordemCategorias);
  }, [produtosVisiveis, ordemCategorias, catAtiva, buscando]);

  // as palavras de método que a voz entende: os armazenamentos e os estados da casa
  const vocabulario = vocabularioDeMetodos(armazenamentos, estados);

  // Onde a janela abre sem voz — ver os ⚠️ em imprimirProduto.
  const conservacaoDe = (p) => {
    if (!etiquetaComArmazenamento(modulo)) return { armazenamento: null, metodoId: null };
    const metodos = metodosDoProduto(p);
    const m = metodoInicial(p, prefs.ultimoArmazenamento, armazenamentos, metodos);
    return m
      ? { armazenamento: m.armazenamento, metodoId: m.id, metodos }
      : { armazenamento: armazenamentoInicial(p, prefs.ultimoArmazenamento, armazenamentos, prazosDoProduto(p)), metodoId: null, metodos };
  };

  // O item não tem o método falado: a janela NÃO abre (decisão do dono,
  // 05/11/2026) — a tela diz e mostra os métodos que ele tem, como botões.
  const mostrarMetodosDoItem = (original, p, conservacao, voz) => {
    const usaveis = conservacao.metodos.filter(m => temPrazo(m) && armazenamentos.some(a => a.id === m.armazenamento));
    const opcoes = usaveis.map(m => ({
      rotulo: `${rotuloDoMetodo(m, armazenamentos, estados)} · ${textoDoPrazo(m)}`,
      escolha: { metodoId: m.id, armazenamento: m.armazenamento },
    }));
    // a abertura de sempre, quando não é um dos métodos com prazo (o Seco em ambiente)
    if (!usaveis.some(m => m.id === conservacao.metodoId) && conservacao.armazenamento) {
      const a = armazenamentos.find(x => x.id === conservacao.armazenamento);
      opcoes.unshift({ rotulo: a?.nome || conservacao.armazenamento, escolha: { metodoId: conservacao.metodoId, armazenamento: conservacao.armazenamento } });
    }
    const falado = [armazenamentos.find(a => a.id === voz.armazenamento)?.nome, estados.find(e => e.id === voz.estado)?.nome]
      .filter(Boolean).join(' · ') || voz.metodoFalado;
    setAvisoDaVoz({
      texto: `${p.nome} não tem ${falado} cadastrado. Escolha um dos métodos dele:`,
      opcoes: opcoes.map(o => ({ rotulo: o.rotulo, acao: () => imprimirProduto(original, { quantidade: voz.quantidade, escolha: o.escolha }) })),
    });
  };

  const imprimirProduto = (original, pedido = null) => {
    const voz = pedido || pedidoDaVoz || {};
    setPedidoDaVoz(null);
    const qtd = voz.quantidade || 1;
    // no Estoque Seco a etiqueta é de ABERTURA e o padrão é o ambiente (se a
    // casa ainda usa esse estado); nas outras cozinhas o item vai como está
    const ajustado = produtoParaEtiqueta(modulo, original);
    const p = ajustado.armazenamentoPadrao && !armazenamentos.some(a => (a?.id ?? a) === ajustado.armazenamentoPadrao)
      ? { ...ajustado, armazenamentoPadrao: original.armazenamentoPadrao }
      : ajustado;
    // ⚠️ O MÉTODO FALADO (05/11/2026): "frango desfiado congelado" abre já em
    // Congelado. Sem o método no item, a janela não abre (mostrarMetodosDoItem).
    // Na despensa, sem armazenamento, o que foi falado de método não muda nada.
    let conservacao = conservacaoDe(p);
    if (voz.escolha) conservacao = { ...conservacao, ...voz.escolha };
    else if ((voz.armazenamento || voz.estado) && conservacao.metodos) {
      const m = escolherMetodoFalado(voz, { metodos: conservacao.metodos, inicial: conservacao, ativos: armazenamentos.map(a => a.id) });
      if (!m) { mostrarMetodosDoItem(original, p, conservacao, voz); return undefined; }
      conservacao = { ...conservacao, ...m };
    }
    return abrirEtiquetas([{
    produtoId: p.id,
    nome: p.nome,
    // 'abertura' vem do proprio item (sal, oleo, queijo: o que a cozinha
    // controla e QUANDO ABRIU, nao quando manipulou).
    tipoData: p.tipoData || 'fabricacao',
    dataFabricacao: hoje(),
    // na despensa não existe congelado/resfriado — sem rótulo de armazenamento.
    // ⚠️ Quando existe, manda o armazenamento DO ITEM. Usar sempre o primeiro
    // da lista fazia azeite sair com "CONGELADO" impresso na etiqueta.
    // Cai no primeiro configurado só quando o item não diz nada (cadastro
    // antigo), nunca num 'congelado' cravado — a casa pode nem ter freezer.
    // ⚠️ O ESTADO QUE ESTA PESSOA USOU DA ÚLTIMA VEZ NESTE ITEM ganha do
    // padrão do cadastro. O dono estava etiquetando filé para RESFRIADO e o
    // modal abria em CONGELADO a cada pote — trocar uma vez é nada, trocar a
    // cada item no meio do serviço é o atrito que faz largar o app.
    // `armazenamentoInicial` só aceita a memória se o estado ainda existe e
    // tem prazo; senão cai no cadastro, como sempre foi.
    // ⚠️ COM MÉTODOS (Lote 11), quem abre é o método — e o armazenamento é o
    // dele. A mesma memória do aparelho, agora com o id do método.
    ...conservacao,
    // Prazo por estado, no formato novo. Os dois campos antigos seguem indo
    // junto porque o produto pode ainda não ter sido salvo no formato novo —
    // prazosDoProduto resolve os dois.
    prazos: prazosDoProduto(p),
    // sugestão de porcionamento: evita digitar a gramatura a cada impressão
    medida: medidaDoProduto(p),
    // com equipe, quem entrou pelo nome; sem equipe, o último lembrado
    responsavel: (comEquipe ? operador : prefs.responsavel) || '',
    quantidade: qtd,
  }], {
    // fecha sozinha no minuto sem uso, e ao sair a etiqueta pergunta se continua
    daTelaImprimir: true,
    aoTerminar: () => { if (operadorAgora.current) setPerguntarSeContinua(true); },
  });
  };

  return (
    <Layout title="Imprimir etiqueta">
      {/* ⚠️ SÓ ETIQUETAR, SEM ABAS (23/11/2026, pedido do dono). A aba
          Impressora (conectar, trocar, etiqueta de teste, o guia) foi para
          Meus itens → Impressora: é ajuste de quem cuida do cadastro, uma
          vez. Aqui fica a faixa da impressora, que é o que a cozinha usa.
          ⚠️ Os avulsos ("leite aberto") não têm lista própria: são itens com
          a DATA DE ABERTURA (ver etiquetas/Itens). */}
        <div className="space-y-4">
          {/* a impressora à vista ANTES de escolher o item (só no Android) */}
          <FaixaImpressora />
          {/* ⚠️ NO CAMINHO DE ENTRADA, e não escondido na Administração: uma
              conta nova imprimia um rolo inteiro com o RESP. em branco e nada
              avisava. Some sozinho quando as duas coisas estão preenchidas. */}
          <PrimeiroUso />
          {precisaEscolher ? (<>
            <QuemImprime />
            {/* ler a etiqueta não assina nada: não precisa do nome */}
            {!soEtiq && (
              <Link to="/ler"
                className="min-h-12 rounded-2xl border-[3px] border-polo-navy/15 bg-white text-polo-navy font-bold text-base flex items-center justify-center gap-2">
                <Icon name="camera" size={20} />Ler etiqueta (dar baixa)
              </Link>
            )}
          </>) : (<>
          {comEquipe ? <FaixaOperador /> : !primeiroUsoNaTela && (
            <p className="text-sm text-gray-600 px-1">
              Cadastre a equipe em Administração para cada pessoa imprimir no próprio nome.
            </p>
          )}
          {/* ⚠️ gray-600, NÃO gray-500. Esta frase fica direto no fundo bege da
              página (#F3EFE6), e ali o gray-500 dá 4,21 de contraste — abaixo
              do mínimo de 4,5 para texto normal. Dentro dos cartões brancos o
              gray-500 passa (4,83) e por isso continua lá; o que reprova é
              justamente ESTA, a única instrução da tela principal. */}
          <p className="text-sm text-gray-600 px-1">
            Toque em Imprimir no item. A validade sai calculada pelo prazo que você cadastrou em Meus itens.
          </p>
          {/* ⚠️ BAIXA PELA ETIQUETA (M59): só no Pro, que imprime o QR. É a
              porta de quem está com a embalagem na mão — a de Validades é a
              da lista. */}
          {!soEtiq && (
            <Link to="/ler"
              className="min-h-12 rounded-2xl border-[3px] border-polo-navy/15 bg-white text-polo-navy font-bold text-base flex items-center justify-center gap-2">
              <Icon name="camera" size={20} />Ler etiqueta (dar baixa)
            </Link>
          )}
          {/* ⚠️ MAIS USADOS NO TOPO (pedido do dono, 23/09/2026): cada etiqueta
              começava rolando uma lista de 60 a 200 itens. Um toque no bloco
              abre a MESMA impressão do botão da lista. Some enquanto a pessoa
              busca ou filtra — aí ela já sabe o que procura. */}
          {!buscando && catAtiva === '' && atalhos.length > 0 && (
            <section aria-label="Mais usados">
              <h2 className="font-titulo font-extrabold text-sm text-polo-navy uppercase tracking-wide px-1 mb-2">
                Mais usados <span className="font-sans font-normal normal-case text-gray-600">· últimos 14 dias</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {atalhos.map(p => (
                  <button key={p.id} onClick={() => imprimirProduto(p)}
                    aria-label={`Imprimir etiqueta de ${p.nome}`}
                    className="min-h-[72px] text-left bg-white border-[3px] border-polo-navy/15 hover:border-polo-gold rounded-2xl px-3 py-2
                               shadow-sm active:scale-[0.97] transition-transform flex flex-col justify-center">
                    <span className="text-base font-bold text-polo-navy leading-tight line-clamp-2">{p.nome}</span>
                    <span className="text-xs text-gray-600 truncate mt-0.5">{resumoDePrazos(p)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {/* o microfone ao lado (busca por voz, 04/11/2026) — some sozinho
              no navegador que não reconhece fala */}
          <BuscaPorVoz produtos={produtosAtivos} vocabulario={vocabulario}
            aviso={avisoDaVoz} aoAvisar={setAvisoDaVoz}
            aoBuscar={(termo, pedido) => { setBusca(termo); setPedidoDaVoz(pedido); }}
            aoImprimir={(p, pedido) => imprimirProduto(p, pedido)}>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden="true">
                <Icon name="busca" size={22} />
              </span>
              <input type="text" value={busca} onChange={e => { setBusca(e.target.value); setPedidoDaVoz(null); }}
                placeholder="Buscar produto..." aria-label="Buscar produto"
                className="w-full h-14 bg-white border-[3px] border-polo-navy/15 focus:border-polo-navy rounded-2xl pl-12 pr-4 text-lg text-polo-navy" />
            </div>
          </BuscaPorVoz>
          {/* ⚠️ SÓ AS CATEGORIAS QUE TÊM ITEM. A lista vinha inteira da
              biblioteca: numa conta nova a tela mostrava "você ainda não tem
              itens" e, logo acima, treze filtros que não levavam a lugar
              nenhum. Desde o Lote 7 (14/10/2026) Entradas e Saídas seguem a
              mesma regra. */}
          {!buscando && (
            <Filtros rotulo="Grupo" valor={catAtiva} aoTrocar={setCatAtiva}
              opcoes={gruposEmUso} />
          )}
          <div className="bg-white rounded-2xl overflow-hidden border-2 border-polo-navy/10">
            {produtosVisiveis.length === 0 && !buscando && !nuvemCarregada && <Esqueleto rotulo="Carregando os itens" />}
            {produtosVisiveis.length === 0 && (buscando || nuvemCarregada) && (
              /* Beco sem saida se a lista esta vazia: no plano Etiquetas a
                 conta nasce sem item nenhum, e "nenhum produto encontrado"
                 sozinho nao diz o que fazer. */
              <div className="text-center py-8 px-4">
                <p className="text-sm text-gray-600">
                  {buscando
                    ? `Nada encontrado para “${busca.trim()}”.`
                    : 'Você ainda não tem itens para etiquetar.'}
                </p>
                {/* nos dois planos (o Pro também tem Meus itens) — para quem pode cadastrar */}
                {pode(sessao, permissoes, 'gerenciarProdutos') && (
                  <Link to="/itens" className="inline-flex items-center mt-3 bg-polo-navy text-polo-gold font-bold px-5 min-h-12 rounded-2xl text-base">
                    Cadastrar itens
                  </Link>
                )}
              </div>
            )}
            {gruposVisiveis.map(([categoria, itensDaCategoria]) => (
              <div key={categoria}>
                {/* ⚠️ `sticky`: numa categoria com 20 itens, o cabeçalho sai da
                    tela e a pessoa perde de vista em que ala está. Ele fica
                    colado no topo da lista enquanto aquele grupo passa. */}
                <h2 className="sticky top-0 z-10 bg-polo-beige/95 backdrop-blur px-4 py-2
                               font-titulo font-extrabold text-sm text-polo-navy uppercase tracking-wide
                               border-b border-gray-200">
                  {categoria}
                </h2>
            {itensDaCategoria.map((p, i, arr) => (
              <div key={p.id} className={`flex items-center px-4 py-3 gap-3 min-h-[72px] ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base text-polo-navy leading-tight break-words">{p.nome}</div>
                  {/* ⚠️ Esta linha lia `valCongelado`/`valResfriado` com ícones
                      fixos de floco e gelo — os DOIS campos antigos, de quando
                      só existiam dois estados. Depois que o armazenamento virou
                      configurável, prazo em REFRIGERADO ou AMBIENTE ficava
                      invisível aqui, e item que só tinha esses aparecia como
                      "sem prazo cadastrado" — mentira, e o dono viu. Agora
                      percorre os estados configurados e mostra cada um pelo
                      NOME que o restaurante deu. */}
                  {/* ⚠️ PRAZO IGUAL EM TODOS OS ESTADOS SAI EM UMA PALAVRA SÓ.
                      É o caso dos itens que vieram das etiquetas avulsas: leite
                      aberto virava "Congelado 3d · Refrigerado 3d · Resfriado
                      3d · Temperatura ambiente 3d" — quatro vezes o mesmo
                      número, e o olho tem que ler tudo para descobrir isso. */}
                  <div className="text-sm text-gray-600 mt-0.5">
                    {resumoDePrazos(p)}
                  </div>
                </div>
                <button onClick={() => imprimirProduto(p)} aria-label={`Imprimir etiqueta de ${p.nome}`}
                  className="bg-polo-navy text-polo-gold font-bold text-base pl-3 pr-4 min-h-12 rounded-xl flex-shrink-0
                             inline-flex items-center gap-2 active:scale-95 transition-transform">
                  <Icon name="etiqueta" size={20} />Imprimir
                </button>
              </div>
            ))}
              </div>
            ))}
          </div>
          </>)}
        </div>
      {perguntarSeContinua && comEquipe && operador && (
        <ContinuarImprimindo nome={operador} aoContinuar={() => setPerguntarSeContinua(false)} aoTrocar={trocarPessoa} />
      )}
    </Layout>
  );
}
