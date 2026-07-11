import { useState } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { hoje } from '../utils/formatters';

// Guia de configuração de impressora — escolhe a situação e mostra o passo a
// passo com links de download. Imprimível (o print CSS global já esconde
// header/nav/botões), então "salvar em PDF" = imprimir esta aba.
const TIPOS_IMPRESSORA = [
  {
    id: 'termica-usb',
    titulo: '✅ Térmica de etiquetas com USB (recomendada)',
    resumo: 'Zebra ZD220 TT, Argox OS-214 Plus, Elgin L42 Pro e similares — ligadas ao computador ou notebook.',
    comoFica: 'Cada etiqueta sai no tamanho exato do rolo (ex.: 60×40mm), uma por vez, já cortadinha no picote. É a experiência completa.',
    passos: [
      'Compre o modelo com TRANSFERÊNCIA TÉRMICA (usa fita/ribbon de resina) e etiquetas BOPP — são as que não desbotam no congelador nem com água. Térmica direta (sem ribbon) desbota com o tempo.',
      'Instale o driver do fabricante no computador: Zebra → zebra.com/suporte (busque ZD220) · Argox → argox.com · Elgin → elgin.com.br/automacao (área de drivers).',
      'No driver/preferências da impressora do Windows, configure o tamanho do papel igual ao rolo (ex.: 60 × 40 mm).',
      'Em Config → Sistema → 🏷️ Etiquetas, coloque o MESMO tamanho.',
      'Pronto: clique Imprimir em qualquer etiqueta aqui → na janela que abre, escolha a impressora de etiquetas → Imprimir.',
    ],
  },
  {
    id: 'tablet',
    titulo: '📱 Pelo tablet ou celular Android',
    resumo: 'Impressora térmica com Wi-Fi/rede, ou compartilhada pelo computador.',
    comoFica: 'Igual ao computador: o Android abre a janela de impressão e a etiqueta sai no tamanho do rolo.',
    passos: [
      'Instale o serviço de impressão do fabricante na Play Store (ex.: "Zebra Print Station" / serviço de impressão da marca) OU deixe a impressora ligada num computador da rede com o driver instalado e compartilhada.',
      'No tablet: Configurações → Dispositivos conectados → Impressão → ative o serviço.',
      'No app, clique Imprimir → escolha a impressora na janela do Android.',
    ],
  },
  {
    id: 'automatica',
    titulo: '⚡ Impressão automática sem janela (1 clique) — em breve',
    resumo: 'Como os sistemas profissionais de etiquetagem funcionam com impressora dedicada.',
    comoFica: 'Clicou em Imprimir → as etiquetas saem DIRETO na impressora, sem janela nenhuma, na quantidade pedida.',
    passos: [
      'Isso exige um programinha instalado uma única vez no computador/tablet: Zebra Browser Print (zebra.com → busque "Browser Print") para impressoras Zebra, ou QZ Tray (qz.io) para qualquer marca.',
      'A integração do app com esses programas é a próxima fase do módulo de etiquetas — será ativada quando a impressora física estiver definida.',
      'Enquanto isso, o caminho normal (janela de impressão) funciona com qualquer impressora — é só 1 clique a mais.',
    ],
  },
  {
    id: 'comum',
    titulo: '🖨️ Impressora comum (A4) — só para testar',
    resumo: 'Jato de tinta ou laser, papel sulfite ou etiqueta adesiva A4.',
    comoFica: 'Sai UMA etiqueta pequena por folha (o app manda o tamanho real do rolo). Serve para testar o layout, não para o dia a dia.',
    passos: [
      'Clique Imprimir → escolha a impressora comum.',
      'Na janela de impressão, deixe escala em 100% (não usar "ajustar à página").',
      'Recorte a etiqueta impressa. Para produção de verdade, use uma térmica de etiquetas (primeira opção acima).',
    ],
  },
];

function GuiaImpressora() {
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
                  <span className="w-5 h-5 rounded-full bg-polo-navy text-polo-gold font-bold flex items-center justify-center flex-shrink-0 text-[10px]">{i + 1}</span>
                  <span className="pt-0.5">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ))}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        <p className="font-bold mb-0.5">💬 Precisa de ajuda para configurar?</p>
        <p>Chame o suporte Aurum pelo WhatsApp — configuramos junto com você na instalação.</p>
      </div>
    </div>
  );
}

// Página de etiquetas: imprime etiqueta de QUALQUER produto do catálogo a
// qualquer momento (sem precisar de entrada/produção) e mantém um catálogo
// de etiquetas avulsas para itens fora do estoque (ex.: "Leite aberto").
export default function Etiquetas() {
  const { produtos, categorias, etiquetasAvulsas, setEtiquetasAvulsas, prefs } = useApp();
  const { abrirEtiquetas, toast, confirm } = useUI();

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
    tipoData: 'fabricacao',
    dataFabricacao: hoje(),
    armazenamento: 'congelado',
    diasCongelado: p.valCongelado || 0,
    diasResfriado: p.valResfriado || 0,
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
    <Layout title="Etiquetas">
      <div className="flex bg-white rounded-xl mb-4 p-1 gap-1 print:hidden">
        {[['catalogo', '📦 Do estoque'], ['avulsas', '📝 Avulsas'], ['impressora', '🖨️ Impressora']].map(([v, l]) => (
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
            Imprima a etiqueta de qualquer produto, a qualquer momento — a validade é calculada pelos prazos do produto (Config).
          </p>
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="🔍 Buscar produto..."
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
              <div className="text-center text-gray-500 py-6 text-sm">Nenhum produto encontrado.</div>
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
                  {[['abertura', '📂 Abertura'], ['fabricacao', '🏭 Fabricação']].map(([v, l]) => (
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
                  className="text-red-400 text-lg font-bold px-1.5 flex-shrink-0">×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
