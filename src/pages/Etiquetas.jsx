import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { hoje } from '../utils/formatters';
import { temRecurso } from '../utils/modulos';
import { armazenamentosAtivos, prazosDoProduto } from '../utils/armazenamento';
import { medidaDoProduto } from '../utils/etiquetas';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../utils/produto';
import { useAuth } from '../store/AuthContext';

// Guia da impressora — escolhe a situação e mostra o passo a passo.
// Imprimível (o print CSS global já esconde header/nav/botões), então
// "salvar em PDF" = imprimir esta aba.
//
// ⚠️ O TESTE EM IMPRESSORA A4 SAIU DAQUI. Ele existia para conferir o layout
// antes de ter térmica, e virou pegadinha: a pessoa imprimia numa folha, via a
// etiqueta minúscula no meio do papel e achava que o app estava errado. Hoje a
// prévia na tela mostra a etiqueta em tamanho real — o A4 não responde mais
// nenhuma pergunta.
const TIPOS_IMPRESSORA = [
  {
    id: 'celular',
    titulo: 'Celular ou tablet Android — direto, sem cabo',
    resumo: 'O caminho mais curto. Não precisa instalar nada além do app.',
    comoFica: 'A etiqueta sai em poucos segundos, no tamanho do rolo. Não abre janela de impressão.',
    passos: [
      'Ligue a impressora e deixe o Bluetooth do aparelho ligado. Não precisa parear nas configurações do Android: quem faz isso é o app.',
      'Abra o Aurum no CHROME. Dentro do WhatsApp ou do Instagram não funciona — esses navegadores não têm Bluetooth.',
      'Monte a etiqueta e toque em "Conectar impressora e imprimir". Escolha a impressora na lista que abrir.',
      'Da segunda vez em diante o botão já vem como "Imprimir na impressora" e não pergunta mais nada.',
      '⚠️ Lista vazia quer dizer três coisas: impressora desligada, longe demais, ou já conectada em outro aparelho. Ela atende um por vez — se o tablet da cozinha está com ela, o seu celular não acha.',
      'Se a etiqueta sair pela metade ou em branco, desligue e ligue a impressora e mande de novo. Costuma ser a conexão, não o conteúdo.',
    ],
  },
  {
    id: 'termica-usb',
    titulo: 'Computador com cabo USB',
    resumo: 'Menos coisa para dar errado. É a instalação mais simples no Windows.',
    comoFica: 'Abre a janela de impressão do Windows e a etiqueta sai pela fila da impressora.',
    passos: [
      'Ligue no USB e espere o Windows instalar. Se ele não achar sozinho, baixe o driver do modelo no site do fabricante.',
      'Abra Impressoras e scanners → sua impressora → Preferências de impressão.',
      'Configure o tamanho do papel como 60 × 50 mm. Se esse tamanho não estiver na lista, crie com o botão "Novo".',
      '⚠️ Depois de criar, CONFIRME que ele ficou selecionado no campo "Nome". Criar o tamanho e não selecionar é o erro mais comum — e a etiqueta continua saindo na medida antiga.',
      'No app, toque em "Imprimir pelo computador", escolha a impressora e mande imprimir.',
      'O app é sempre 60 × 50. Não há o que configurar do lado dele — só do lado do Windows.',
    ],
  },
  {
    id: 'termica-bluetooth',
    titulo: 'Computador por Bluetooth',
    resumo: 'Funciona, mas tem uma armadilha que trava a impressão sem dar aviso nenhum.',
    comoFica: 'Igual ao cabo. Muda só como o computador fala com a impressora.',
    passos: [
      'Pareie em Configurações → Bluetooth e dispositivos → Adicionar dispositivo.',
      'O Windows cria uma porta serial (COM3, COM8, algo assim) e normalmente cria junto uma fila de impressão ligada nessa porta.',
      '⚠️ A ARMADILHA: se você já usou a impressora por cabo, a fila antiga nasceu presa à porta USB e não funciona por Bluetooth — nem trocando a porta nas configurações dela. O trabalho entra na fila e fica parado, sem erro na tela. Parece que o app não imprimiu.',
      'A saída é APAGAR a fila antiga e usar a que nasceu com o pareamento Bluetooth. Apagar e recriar resolve; trocar a porta, não.',
      '⚠️ Ao recriar a fila o tamanho do papel volta ao padrão de fábrica. Refaça o passo dos 60 × 50 mm em Preferências de impressão.',
      'Para conferir: mande imprimir e veja se sai em poucos segundos. Se ficar preso na fila, é a armadilha acima.',
    ],
  },
  {
    id: 'apple',
    titulo: 'iPhone e iPad',
    resumo: 'Não imprimem direto. É limitação da Apple, não do app.',
    comoFica: 'O botão de impressão direta não aparece nesses aparelhos.',
    passos: [
      'O Safari não dá acesso ao Bluetooth para aplicativos como o Aurum. Nenhum app da App Store contorna isso.',
      'A Apple só aceita impressora AirPrint, e térmica de etiqueta comum não faz AirPrint.',
      'Na prática: use um celular ou tablet ANDROID na cozinha, ou imprima pelo computador. O resto do app funciona normalmente no iPhone — o cadastro, os itens, tudo.',
      'Se a operação inteira for Apple, a saída é uma impressora de etiquetas com WI-FI e AirPrint. Vale pesar na próxima compra.',
    ],
  },
];

function GuiaImpressora() {
  // Abre no celular: é o caminho recomendado e o que mais gente usa na cozinha.
  const [aberto, setAberto] = useState('celular');
  return (
    <div className="space-y-3">
      <div className="bg-polo-navy text-white rounded-xl p-4">
        <p className="text-sm font-bold text-polo-gold">Rolo 60 × 50 mm</p>
        <p className="text-xs mt-1 text-white/90">
          É o único tamanho do sistema — o app e a impressora já saem acertados nele.
          Ao comprar refil, peça 60 × 50.
        </p>
        <p className="text-xs mt-2 text-white/90">
          Prefira etiqueta <strong>BOPP</strong> e, se puder escolher a impressora, uma de
          <strong> transferência térmica</strong> (a que usa ribbon). Térmica direta desbota com
          calor, umidade e tempo — e etiqueta de câmara fria pega os três.
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
  const { produtos, categorias, etiquetasAvulsas, setEtiquetasAvulsas, prefs, modulo } = useApp();
  const { abrirEtiquetas, toast, confirm } = useUI();

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

  const [tab, setTab] = useState('catalogo'); // 'catalogo' | 'avulsas'
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
    armazenamento: temRecurso(modulo, 'armazenamento')
      ? (p.armazenamentoPadrao || armazenamentos[0]?.id || 'congelado')
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

  // ── Aba Avulsas ──────────────────────────────────────────────
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTipo, setNovoTipo] = useState('abertura');
  const [novoDias, setNovoDias] = useState('');

  const salvarAvulsa = () => {
    const nome = novoNome.trim();
    if (!nome) { toast('Digite o nome da etiqueta.', 'aviso'); return; }
    if (etiquetasAvulsas.some(e => e.nome.toLowerCase() === nome.toLowerCase())) {
      toast('Já existe uma etiqueta avulsa com esse nome.', 'aviso'); return;
    }
    const nova = {
      id: `etq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      nome,
      tipoData: novoTipo,
      diasValidade: parseFloat(novoDias) || 0,
    };
    setEtiquetasAvulsas([...etiquetasAvulsas, nova]);
    setNovoNome(''); setNovoDias(''); setCriando(false);
    toast('Etiqueta avulsa criada.', 'sucesso');
  };

  const removerAvulsa = async (e) => {
    const ok = await confirm({ titulo: 'Remover etiqueta', mensagem: `Remover a etiqueta "${e.nome}" da lista?`, perigo: true, confirmar: 'Remover' });
    if (!ok) return;
    setEtiquetasAvulsas(etiquetasAvulsas.filter(x => x.id !== e.id));
    toast('Etiqueta removida.', 'sucesso');
  };

  const imprimirAvulsa = (e) => abrirEtiquetas([{
    produtoId: null,
    nome: e.nome,
    tipoData: e.tipoData || 'abertura',
    dataFabricacao: hoje(),
    armazenamento: null, // avulsa não tem seletor de armazenamento — prazo é fixo
    diasValidade: e.diasValidade || 0,
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
        {(soEtiq
          /* No plano Etiquetas a aba Avulsas NAO existe: ela virou o campo
             "data de abertura" dentro do proprio item (ver etiquetas/Itens).
             Eram duas listas para a mesma pergunta — "o que eu etiqueto?" — e
             a pessoa tinha que adivinhar em qual procurar. */
          ? [['catalogo', 'Meus itens'], ['impressora', 'Impressora']]
          : [['catalogo', 'Do estoque'], ['avulsas', 'Avulsas'], ['impressora', 'Impressora']]
        ).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-colors
              ${tab === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'impressora' ? (
        <GuiaImpressora />
      ) : tab === 'catalogo' ? (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 px-1">
            {soEtiq
              /* "(Config)" nao existe neste plano: o cadastro fica em Meus itens. */
              ? 'Toque em Imprimir no item. A validade sai calculada pelo prazo que você cadastrou em Meus itens.'
              : 'Imprima a etiqueta de qualquer produto, a qualquer momento — a validade é calculada pelos prazos do produto (Config).'}
          </p>
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto..."
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
                  <div className="text-xs text-gray-500">
                    {prazosVisiveis(p).length > 0
                      ? prazosVisiveis(p).map(x => `${x.nome} ${x.dias}d`).join(' · ')
                      : 'sem prazo cadastrado — etiqueta só de identificação'}
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
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 px-1">
            Etiquetas de itens que não estão no estoque (ex.: leite aberto, molho do dia). Crie uma vez e reimprima quando quiser.
          </p>

          {criando ? (
            <div className="bg-white rounded-xl p-4 space-y-3">
              <p className="font-bold text-polo-navy text-sm">Nova etiqueta avulsa</p>
              <div>
                <label htmlFor="etq-nome" className="block text-xs font-semibold text-gray-600 mb-1">Nome do item</label>
                <input id="etq-nome" type="text" value={novoNome} onChange={e => setNovoNome(e.target.value)}
                  placeholder="Ex: Leite aberto" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">A data na etiqueta é de…</label>
                <div className="grid grid-cols-2 gap-2">
                  {[['abertura', 'Abertura'], ['fabricacao', 'Fabricação']].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setNovoTipo(v)}
                      className={`py-2.5 rounded-lg text-xs font-semibold border-2 transition-colors
                        ${novoTipo === v ? 'border-polo-gold bg-polo-navy text-polo-gold' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="etq-dias" className="block text-xs font-semibold text-gray-600 mb-1">Validade (dias após a data)</label>
                <input id="etq-dias" type="number" min="0" inputMode="numeric" value={novoDias} onChange={e => setNovoDias(e.target.value)}
                  placeholder="0 = sem validade" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setCriando(false); setNovoNome(''); setNovoDias(''); }}
                  className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">Cancelar</button>
                <button onClick={salvarAvulsa}
                  className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl">Salvar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCriando(true)}
              className="w-full border-2 border-dashed border-polo-gold/60 text-polo-navy font-bold py-3.5 rounded-xl text-sm active:scale-[0.98] transition-transform">
              ＋ Nova etiqueta avulsa
            </button>
          )}

          <div className="bg-white rounded-xl overflow-hidden">
            {etiquetasAvulsas.length === 0 && !criando && (
              <div className="text-center text-gray-500 py-6 text-sm">Nenhuma etiqueta avulsa ainda.</div>
            )}
            {etiquetasAvulsas.map((e, i, arr) => (
              <div key={e.id} className={`flex items-center px-4 py-3 gap-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800 truncate">{e.nome}</div>
                  <div className="text-xs text-gray-500">
                    {e.tipoData === 'abertura' ? 'data de abertura' : 'data de fabricação'}
                    {e.diasValidade > 0 ? ` · vence em ${e.diasValidade}d` : ' · sem validade'}
                  </div>
                </div>
                <button onClick={() => imprimirAvulsa(e)} aria-label={`Imprimir etiqueta de ${e.nome}`}
                  className="bg-polo-navy text-polo-gold font-bold text-xs px-3.5 py-2.5 rounded-xl flex-shrink-0 active:scale-95 transition-transform">
                  🏷️ Imprimir
                </button>
                <button onClick={() => removerAvulsa(e)} aria-label={`Remover etiqueta ${e.nome}`}
                  className="text-red-700 text-lg font-bold px-1.5 flex-shrink-0">×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
