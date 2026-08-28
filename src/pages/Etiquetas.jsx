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

// Guia de configuração de impressora — escolhe a situação e mostra o passo a
// passo com links de download. Imprimível (o print CSS global já esconde
// header/nav/botões), então "salvar em PDF" = imprimir esta aba.
const TIPOS_IMPRESSORA = [
  {
    id: 'termica-usb',
    titulo: 'Térmica de etiquetas por CABO USB (a mais simples)',
    resumo: 'Ligada direto no computador ou notebook. É a que dá menos trabalho para instalar.',
    comoFica: 'Uma etiqueta por vez, no tamanho exato do rolo.',
    passos: [
      'Compre etiquetas BOPP e, se possível, impressora de TRANSFERÊNCIA TÉRMICA (usa fita/ribbon). Térmica direta desbota com o tempo, com calor e com umidade — e etiqueta de congelador vive nas três coisas.',
      'Ligue no USB e instale o driver do fabricante. O Windows costuma achar sozinho; se não achar, procure pelo modelo no site da marca.',
      'Abra Impressoras e scanners → sua impressora → Preferências de impressão e configure o tamanho do papel IGUAL ao rolo (ex.: 60 × 50 mm). Se o tamanho não estiver na lista, use o botão "Novo"/"Editar" para criar.',
      '⚠️ Depois de criar o tamanho, CONFIRME que ele ficou selecionado no campo "Nome". Criar e não selecionar é o erro mais comum — e a etiqueta sai no tamanho antigo.',
      'Em CAMINHO_CONFIG, coloque o MESMO tamanho. Os dois lados precisam dizer a mesma coisa: se a impressora espera 50 mm de altura e o app manda 40, a etiqueta sai deslocada.',
      'Pronto: toque em Imprimir em qualquer etiqueta → na janela que abrir, escolha a impressora → Imprimir.',
    ],
  },
  {
    id: 'termica-bluetooth',
    titulo: 'Térmica por BLUETOOTH (sem cabo)',
    resumo: 'Funciona, mas tem uma armadilha que trava a impressão sem dar nenhum aviso.',
    comoFica: 'Igual à do cabo. A diferença é só como o computador fala com ela.',
    passos: [
      'Pareie a impressora no Windows: Configurações → Bluetooth e dispositivos → Adicionar dispositivo.',
      'O Windows cria uma PORTA SERIAL para ela (aparece como COM3, COM8, algo assim) e normalmente cria também uma fila de impressão já ligada nessa porta.',
      '⚠️ A ARMADILHA: se você já usava a impressora por CABO, a fila antiga foi criada para a porta USB e NÃO funciona por Bluetooth — mesmo que você troque a porta dela nas configurações. O trabalho entra na fila e fica lá parado, sem erro nenhum na tela. Parece que o app não imprimiu, mas o app fez a parte dele.',
      'A solução é APAGAR a fila antiga e deixar (ou criar) a fila que nasceu junto com o pareamento Bluetooth. Apagar e recriar é o que resolve; trocar a porta, não.',
      '⚠️ Ao recriar a fila, o tamanho do papel volta ao padrão de fábrica. Refaça o passo do tamanho (60 × 50 mm) em Preferências de impressão.',
      'Para conferir se está tudo certo: mande imprimir e veja se a etiqueta sai em poucos segundos. Se o trabalho ficar preso na fila, é a armadilha acima.',
    ],
  },
  {
    id: 'tablet',
    titulo: 'Pelo tablet ou celular',
    resumo: 'Dá para Android, com um app a mais. No iPhone e iPad não dá.',
    comoFica: 'Depende do app usado — vale testar antes de contar com isso no dia a dia.',
    passos: [
      'ANDROID: não existe "driver" como no Windows. O que existe são SERVIÇOS DE IMPRESSÃO — aplicativos que se instalam e passam a aparecer no menu Imprimir do Chrome. Sem um deles, o Android não enxerga a impressora, mesmo pareada.',
      'Procure na Play Store por "ESC/POS Bluetooth Print Service" ou "Bluetooth Printer+", instale, pareie a impressora e ative o serviço em Configurações → Dispositivos conectados → Impressão.',
      '⚠️ Teste antes de confiar: esses serviços foram feitos para impressora de CUPOM (rolo contínuo). A sua etiqueta é picotada, de tamanho fixo — pode ser que o app ignore o tamanho e o conteúdo atravesse a serrilha. Gaste três etiquetas testando antes de montar a operação em cima disso.',
      'IPHONE E IPAD: não há caminho. A Apple só aceita impressoras AirPrint e não deixa instalar serviço de impressão. Impressora térmica comum de etiqueta não faz AirPrint.',
      'O caminho limpo para tablet é uma impressora de etiquetas com WI-FI: ela entra na rede e imprime de qualquer aparelho, incluindo iPad, sem app nenhum. Vale considerar na próxima compra.',
    ],
  },
  {
    id: 'comum',
    titulo: 'Impressora comum (A4) — só para testar',
    resumo: 'Jato de tinta ou laser, papel sulfite ou etiqueta adesiva A4.',
    comoFica: 'Sai UMA etiqueta pequena por folha (o app manda o tamanho real do rolo). Serve para conferir o layout, não para o dia a dia.',
    passos: [
      'Toque em Imprimir → escolha a impressora comum.',
      'Na janela de impressão, deixe a escala em 100% — não use "ajustar à página", senão o tamanho deixa de ser real.',
      'Desmarque "Cabeçalhos e rodapés": é o que faz sair a data e o endereço do site em cima da etiqueta.',
      'Recorte a etiqueta impressa. Para o serviço de verdade, use uma térmica de etiquetas.',
    ],
  },
];

function GuiaImpressora({ caminhoConfig }) {
  const resolver = (t) => t.replace('CAMINHO_CONFIG', caminhoConfig);
  const [aberto, setAberto] = useState('termica-usb');
  return (
    <div className="space-y-3">
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
                  <span className="pt-0.5">{resolver(p)}</span>
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
        <GuiaImpressora caminhoConfig={soEtiq ? 'Ajustes → Etiquetas' : 'Config → Sistema → 🏷️ Etiquetas'} />
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
                  <div className="text-xs text-gray-500">
                    {p.valCongelado > 0 || p.valResfriado > 0
                      ? `validade: ${p.valCongelado > 0 ? `❄️ ${p.valCongelado}d` : ''}${p.valCongelado > 0 && p.valResfriado > 0 ? ' · ' : ''}${p.valResfriado > 0 ? `🧊 ${p.valResfriado}d` : ''}`
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
