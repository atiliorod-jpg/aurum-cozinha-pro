import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { hoje } from '../utils/formatters';
import { temRecurso } from '../utils/modulos';
import { armazenamentosAtivos, prazosDoProduto } from '../utils/armazenamento';
import { armazenamentoInicial } from '../utils/etiquetas';
import { medidaDoProduto } from '../utils/etiquetas';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../utils/produto';
import { useAuth } from '../store/AuthContext';

// Guia da impressora — duas situações, passo a passo curto. Imprimível.
//
// ⚠️ ESTA ABA JÁ FOI GRANDE DEMAIS e o dono cortou: tinha um bloco só para
// iPhone, dois blocos para computador (USB e Bluetooth, quase iguais) e um
// teste em folha A4. Guia de impressora é lido em pé, com a impressora na
// frente, uma vez. Cada passo a mais é um passo que ninguém lê.
//
// ⚠️ CUIDADO COM O TEXTO DO ROLO: a Aurum VENDE a impressora e as etiquetas.
// Isso não vira propaganda no meio de um guia técnico, mas também não se
// escreve "compre em qualquer lugar" como se não fosse conosco. Diz o que o
// sistema usa, diz que fornecemos, e não fecha a porta de comprar fora.
//
// ⚠️ Vale para OS DOIS produtos (Etiquetas e Cozinha Pro) — nada aqui pode
// supor que a pessoa só tem etiquetas.
const TIPOS_IMPRESSORA = [
  {
    id: 'celular',
    titulo: 'Celular ou tablet Android',
    resumo: 'Imprime direto, sem cabo e sem instalar nada.',
    comoFica: 'A etiqueta sai em segundos, no tamanho certo. Não abre janela de impressão.',
    passos: [
      'Ligue a impressora. Não precisa parear no Android — quem conecta é o app.',
      'Abra o Aurum no Chrome. Dentro do WhatsApp ou do Instagram não funciona.',
      'Monte a etiqueta e toque em "Conectar impressora e imprimir". Escolha a impressora na lista.',
      'Nas próximas vezes ele já conecta sozinho.',
      '⚠️ Lista vazia: impressora desligada, longe, ou conectada em outro aparelho — ela atende um por vez.',
    ],
  },
  {
    id: 'computador',
    titulo: 'Computador com Windows',
    resumo: 'Por cabo ou por Bluetooth. O cabo dá menos trabalho.',
    comoFica: 'Abre a janela de impressão do Windows e a etiqueta sai pela fila da impressora.',
    passos: [
      'CABO: ligue no USB e espere instalar. Se o Windows não achar, baixe o driver do modelo no site do fabricante.',
      'BLUETOOTH: pareie em Configurações → Bluetooth e dispositivos → Adicionar dispositivo.',
      'Nos dois casos, abra Impressoras e scanners → sua impressora → Preferências de impressão e deixe o papel em 60 × 50 mm. Se não estiver na lista, crie em "Novo" e confira que ficou selecionado — criar e não selecionar é o erro mais comum.',
      '⚠️ SÓ NO BLUETOOTH: se você já usou a impressora por cabo, a fila antiga não funciona sem fio, e o trabalho fica parado sem erro na tela. Apague a fila antiga e use a que nasceu com o pareamento. Trocar a porta não resolve. Depois de recriar, refaça o tamanho do papel.',
      'No app, toque em "Imprimir pelo computador" e escolha a impressora.',
    ],
  },
];

function GuiaImpressora() {
  // Abre no celular: é o caminho recomendado e o que mais gente usa na cozinha.
  const [aberto, setAberto] = useState('celular');
  return (
    <div className="space-y-3">
      <div className="bg-polo-navy text-white rounded-xl p-4">
        <p className="text-sm font-bold text-polo-gold">Impressora e rolo</p>
        <p className="text-xs mt-1 text-white/90">
          O sistema trabalha com a <strong>Tomate MDK-022</strong> e o rolo de{' '}
          <strong>60 × 50 mm</strong>, já acertados um com o outro. A Aurum fornece a impressora
          e os refis — peça pelo WhatsApp do suporte.
        </p>
        <p className="text-xs mt-2 text-white/80">
          Comprando por fora, peça 60 × 50 mm em BOPP: o adesivo comum solta na câmara fria e
          borra na umidade.
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-gray-500">Escolha a sua situação para ver o passo a passo.</p>
        <button onClick={() => window.print()}
          className="bg-gray-100 text-gray-600 font-semibold text-xs px-3 py-2 rounded-lg whitespace-nowrap">
          📄 Salvar guia em PDF
        </button>
      </div>
      {TIPOS_IMPRESSORA.map(t => (
        <div key={t.id} className="bg-white rounded-xl overflow-hidden">
          <button onClick={() => setAberto(aberto === t.id ? '' : t.id)}
            className="w-full text-left px-4 py-3 print:hidden">
            <p className="font-bold text-sm text-polo-navy">{t.titulo} {aberto === t.id ? '▾' : '▸'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t.resumo}</p>
          </button>
          {/* na impressão, TODOS os blocos saem abertos */}
          <div className={`px-4 pb-4 ${aberto === t.id ? '' : 'hidden'} print:block`}>
            <p className="hidden print:block font-bold text-sm text-polo-navy mb-1">{t.titulo}</p>
            <div className="bg-polo-beige rounded-lg p-3 mb-3">
              <p className="text-[11px] font-bold text-polo-navy uppercase tracking-wide mb-0.5">Como fica a impressão</p>
              <p className="text-xs text-gray-700">{t.comoFica}</p>
            </div>
            <ol className="space-y-2">
              {t.passos.map((p, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-700">
                  <span className="w-5 h-5 rounded-full bg-polo-navy text-polo-gold font-bold flex items-center justify-center flex-shrink-0 text-[11px]">{i + 1}</span>
                  <span className="pt-0.5">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ))}
      {/* ⚠️ O iPhone tinha um bloco só para ele, com quatro passos que eram
          quatro maneiras de dizer "não dá". Uma linha resolve, e ela fica no
          fim porque só interessa a quem tem iPhone. */}
      <p className="text-xs text-gray-600 px-1">
        <strong>iPhone e iPad</strong> não imprimem direto — a Apple não libera o Bluetooth para
        aplicativos como o Aurum. Use um Android na cozinha, ou o computador. O resto do app
        funciona normalmente neles.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        <p className="font-bold mb-0.5">Precisa de ajuda para configurar?</p>
        <p>Chame o suporte Aurum pelo WhatsApp — configuramos junto com você na instalação.</p>
      </div>
    </div>
  );
}

// Página de etiquetas: imprime etiqueta de QUALQUER produto do catálogo a
// qualquer momento (sem precisar de entrada/produção) e mantém um catálogo
// de etiquetas avulsas para itens fora do estoque (ex.: "Leite aberto").
export default function Etiquetas() {
  const { produtos, categorias, prefs, modulo } = useApp();
  const { abrirEtiquetas } = useUI();

  const { sessao, impersonando } = useAuth();
  const soEtiq = ehSoEtiquetas(produtoAtivo(sessao, impersonando));
  const armazenamentos = armazenamentosAtivos(prefs);
  // Prazos que o item tem, por estado, na ordem configurada. Só os preenchidos:
  // listar "0d" para os quatro estados enche a linha de ruído.
  const prazosVisiveis = (p) => {
    const prazos = prazosDoProduto(p);
    return armazenamentos
      .map(a => ({ nome: a.nome, dias: Number(prazos[a.id]) || 0 }))
      .filter(x => x.dias > 0);
  };

  // Uma linha só quando todos os estados dão o mesmo número.
  const resumoDePrazos = (p) => {
    const v = prazosVisiveis(p);
    if (!v.length) return 'sem prazo cadastrado — etiqueta só de identificação';
    if (v.length > 1 && v.every(x => x.dias === v[0].dias)) return `${v[0].dias}d em qualquer estado`;
    return v.map(x => `${x.nome} ${x.dias}d`).join(' · ');
  };

  const [tab, setTab] = useState('catalogo'); // 'catalogo' | 'impressora'
  const [busca, setBusca] = useState('');
  const [catAtiva, setCatAtiva] = useState('');

  // ── Aba Catálogo ─────────────────────────────────────────────
  const produtosAtivos = produtos.filter(p => p.ativo);
  const buscando = busca.trim().length > 0;
  const produtosVisiveis = buscando
    ? produtosAtivos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()))
    : catAtiva === ''
      ? produtosAtivos
      : produtosAtivos.filter(p => p.categoria === catAtiva);

  const imprimirProduto = (p) => abrirEtiquetas([{
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
    armazenamento: temRecurso(modulo, 'armazenamento')
      ? armazenamentoInicial(p, prefs.ultimoArmazenamento, armazenamentos, prazosDoProduto(p))
      : null,
    // Prazo por estado, no formato novo. Os dois campos antigos seguem indo
    // junto porque o produto pode ainda não ter sido salvo no formato novo —
    // prazosDoProduto resolve os dois.
    prazos: prazosDoProduto(p),
    // sugestão de porcionamento: evita digitar a gramatura a cada impressão
    medida: medidaDoProduto(p),
    responsavel: prefs.responsavel || '',
    quantidade: 1,
  }]);

  return (
    <Layout title={soEtiq ? "Imprimir etiqueta" : "Etiquetas"}>
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1 print:hidden">
        {/* ⚠️ "Do estoque" mentiria no plano Aurum Etiquetas: lá não existe
            estoque nenhum, e o rótulo mandaria a pessoa procurar uma tela que
            a conta dela não tem. É a mesma aba, com o nome certo em cada
            produto. */}
        {/* ⚠️ AS MESMAS DUAS ABAS NOS DOIS PRODUTOS. O completo tinha uma
            terceira, "Avulsas": uma lista paralela para leite aberto, molho do
            dia. Eram duas listas para a mesma pergunta — "o que eu etiqueto?"
            — e a pessoa tinha que adivinhar em qual procurar. O que diferencia
            um item avulso é a DATA SER DE ABERTURA, e isso virou um campo do
            próprio item (ver etiquetas/Itens). A migração dos avulsos que já
            existem roda sozinha, uma vez (migrarAvulsas).
            ⚠️ NÃO chamar a primeira de "Meus itens": esse é o nome de OUTRA
            tela, onde se cadastra. Duas coisas com o mesmo nome na mesma tela é
            onde a pessoa se perde. */}
        {[['catalogo', 'Etiquetar'], ['impressora', 'Impressora']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-colors
              ${tab === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'impressora' ? (
        <GuiaImpressora />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 px-1">
            Toque em Imprimir no item. A validade sai calculada pelo prazo que você cadastrou em Meus itens.
          </p>
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto..." aria-label="Buscar produto"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
          {!buscando && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button onClick={() => setCatAtiva('')}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0
                  ${catAtiva === '' ? 'bg-polo-navy text-polo-gold' : 'bg-white text-gray-600 border border-gray-200'}`}>
                Todos
              </button>
              {categorias.map(c => (
                <button key={c} onClick={() => setCatAtiva(c)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0
                    ${catAtiva === c ? 'bg-polo-navy text-polo-gold' : 'bg-white text-gray-600 border border-gray-200'}`}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="bg-white rounded-xl overflow-hidden">
            {produtosVisiveis.length === 0 && (
              /* Beco sem saida se a lista esta vazia: no plano Etiquetas a
                 conta nasce sem item nenhum, e "nenhum produto encontrado"
                 sozinho nao diz o que fazer. */
              <div className="text-center py-8 px-4">
                <p className="text-sm text-gray-600">
                  {buscando
                    ? `Nada encontrado para “${busca.trim()}”.`
                    : 'Você ainda não tem itens para etiquetar.'}
                </p>
                {soEtiq && (
                  <Link to="/itens" className="inline-block mt-3 bg-polo-navy text-polo-gold font-bold px-5 py-2.5 rounded-xl text-sm">
                    Cadastrar itens
                  </Link>
                )}
              </div>
            )}
            {produtosVisiveis.map((p, i, arr) => (
              <div key={p.id} className={`flex items-center px-4 py-3 gap-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800 truncate">{p.nome}</div>
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
                  <div className="text-xs text-gray-500">
                    {resumoDePrazos(p)}
                  </div>
                </div>
                <button onClick={() => imprimirProduto(p)} aria-label={`Imprimir etiqueta de ${p.nome}`}
                  className="bg-polo-navy text-polo-gold font-bold text-xs px-3.5 py-2.5 rounded-xl flex-shrink-0 active:scale-95 transition-transform">
                  🏷️ Imprimir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
