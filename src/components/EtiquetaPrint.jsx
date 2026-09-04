import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { useUI } from '../store/UIContext';
import { useAuth } from '../store/AuthContext';
import { useApp } from '../store/AppContext';
import { estabelecimentoDe } from '../utils/instancias';
import { supabase } from '../lib/supabase';
import ResponsavelSelect from './ResponsavelSelect';
import Botao from './Botao';
import Dialogo from './Dialogo';
import Aviso from './Aviso';
import { montarCamposEtiqueta, montarPayloadQR, configEtiqueta, gerarLoteId, podarEtiquetas,
         DIAS_VALIDADE_MAX, limitarDias, avisoDePrazo,
         diasIniciaisDaEtiqueta, usandoSugestaoDeAbertura,
         lembrarArmazenamentos } from '../utils/etiquetas';
import { armazenamentosAtivos, acharArmazenamento } from '../utils/armazenamento';
import { loteTSPL, medirEtiqueta } from '../utils/tspl';
import { caminhosDeImpressao, impressoraConectada, escolherImpressora, reconectarSePuder, enviarTSPL } from '../lib/impressoraBLE';
import { hoje, fmtHora } from '../utils/formatters';
import { temRecurso } from '../utils/modulos';
import { produtoAtivo, produtoTem } from '../utils/produto';

// Tamanho impresso do QR, calculado a partir do NÚMERO DE MÓDULOS do código.
//
// Térmica de 203 DPI = 8 pontos/mm. Cada módulo do QR precisa de ~4 pontos para
// sair com a borda limpa (abaixo disso o leitor não pega, por mais correto que
// o conteúdo esteja) → cada módulo precisa de ~0,5mm.
//
// ⚠️ A conta usa o total do viewBox, que INCLUI a zona de silêncio (margin:2 de
// cada lado). Dimensionar só pelos módulos do código deixa o QR ~10% menor do
// que o necessário — foi o que fez o código continuar ilegível mesmo depois de
// encurtar o payload.
// 0,5mm dá exatamente 3,99 pontos/módulo (203dpi = 7,99 pontos/mm, não 8) —
// ou seja, em cima do limite, sem folga nenhuma para variação da impressora.
// 0,55mm sobe para ~4,4 pontos/módulo e deixa margem real.
const MM_POR_MODULO = 0.55;
const tamanhoQRmm = (modulosTotais, alturaMm) => {
  const ideal = (modulosTotais || 41) * MM_POR_MODULO;
  // não pode passar de metade da etiqueta (senão não sobra espaço pro texto)
  return Math.min(ideal, Math.max(alturaMm * 0.5, 18));
};

// Teto de cópias por item. Cada cópia é um bloco no DOM: digitar um zero a mais
// (100 → 1000) travava o tablet renderizando mil etiquetas. 200 já é mais do que
// cabe num rolo, então o teto não atrapalha uso real.
const MAX_COPIAS = 200;
const limitarCopias = (n) => Math.min(Math.max(0, parseInt(n) || 0), MAX_COPIAS);

// Quantas etiquetas de papel uma lista de itens representa. É a unidade que a
// pessoa conta na bancada — não "itens", que é como o código enxerga.
const contarEtiquetas = (lista) =>
  (lista || []).reduce((soma, it) => soma + limitarCopias(it.quantidade), 0);

// "!" tocável. Texto curto fica no rótulo; o resto vem só se a pessoa pedir —
// parágrafo de apoio embaixo de cada campo empurra o formulário para baixo e
// ninguém lê.
// ⚠️ O NAVEGADOR FALA INGLÊS DE ENGENHEIRO. "GATT operation failed" ou
// "NetworkError" no meio do serviço não diz nada para quem está com o pote na
// mão — e o pior é que quase sempre a causa é banal: impressora desligada,
// longe, ou presa em outro aparelho. Cada mensagem aqui termina com o que
// FAZER; o texto original vai junto só para o suporte.
function erroEmPortugues(e) {
  const cru = e?.message || String(e || '');
  const nome = e?.name || '';
  // ⚠️ Erro nosso passa direto. A lista abaixo reconhece o que o NAVEGADOR
  // fala; sem esta linha, uma frase já escrita em português caía no fim e
  // saía embrulhada em "Não deu para imprimir… (a mesma frase)".
  if (e?.emPortugues) return cru;
  if (nome === 'NotAllowedError') return 'O navegador bloqueou o acesso ao Bluetooth. Toque no cadeado ao lado do endereço e libere.';
  if (nome === 'SecurityError') return 'Abra o app pelo endereço https:// — o Bluetooth não funciona fora dele.';
  if (/GATT|disconnect|NetworkError/i.test(cru) || nome === 'NetworkError') {
    return 'Perdeu a conexão com a impressora. Confira se ela está ligada e por perto, e mande de novo.';
  }
  if (/Bluetooth adapter not available|globally disabled/i.test(cru)) {
    return 'O Bluetooth do aparelho está desligado. Ligue e tente de novo.';
  }
  if (/User cancelled|cancelled/i.test(cru)) return '';
  return `Não deu para imprimir. Desligue e ligue a impressora e tente de novo. (${cru})`;
}

function Dica({ texto }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberta(v => !v)}
        aria-label={aberta ? 'Fechar explicação' : 'O que é isto?'} aria-expanded={aberta}
        className="ml-1 w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold leading-none align-middle">
        !
      </button>
      {aberta && (
        <span className="block font-normal normal-case text-[11px] text-gray-600 mt-1">{texto}</span>
      )}
    </>
  );
}

// Uma linha "RÓTULO: valor" da etiqueta (formato ficha de pré-preparo)
//
// ⚠️ TAMANHOS EM MILÍMETROS, e um pouco maiores que o óbvio (31/08/2026): a
// mesma etiqueta saiu do computador com letra menor que a do celular, porque
// aqui quem desenha é a fonte da tela e lá é a fonte interna da impressora, que
// tem outra proporção. Subiram ~10%, e SÓ o tamanho: espaçamento, colunas e
// ordem das linhas ficaram como estavam — o formato foi aprovado no papel, e
// mexer nele para "ganhar espaço" desfaria três rodadas de acerto.
// ⚠️ A etiqueta tem altura FIXA com corte no que passar. Subir mais que isso
// começa a empurrar o rodapé para fora — confira no navegador antes.
//
// ⚠️ VALOR ENCOSTADO NA DIREITA, todos no MESMO tamanho — o mesmo desenho do
// TSPL, e o histórico está lá em `utils/tspl.js`. O resumo: valores à direita
// só ficam uma linha sob a outra se todos tiverem o mesmo corpo; foi tentar
// destacar a validade aumentando a letra que quebrou o alinhamento.
//
// `forte` virou SUBLINHADO sob o valor. É o destaque que sobrou para a
// validade depois que ela perdeu o corpo maior, e um traço curto sob a data
// não se confunde com os dois divisores que a etiqueta já tem.
//
// ⚠️ Esta caixa se chama "Como vai sair". Sempre que o desenho do papel mudar,
// muda aqui junto — prévia que não confere é pior que prévia nenhuma.
function Linha({ rotulo, valor, forte = false, corpo = '3mm' }) {
  if (!valor) return null;
  return (
    <div className="flex justify-between" style={{ fontSize: corpo, gap: '2mm', marginBottom: forte ? '0.6mm' : 0 }}>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{rotulo}:</span>
      <span style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        borderBottom: forte ? '0.35mm solid #000' : undefined, paddingBottom: forte ? '0.3mm' : undefined }}>{valor}</span>
    </div>
  );
}

// Um bloco de etiqueta física (repetido N vezes conforme a quantidade de cópias).
function EtiquetaLabel({ campos, config, qr, estabelecimento }) {
  const c = config.campos;
  const comQR = config.incluirQR && qr?.svg;
  const est = estabelecimento || {};
  const qrMm = comQR ? tamanhoQRmm(qr.modulos, config.alturaMm) : 0;

  // ⚠️ ETIQUETA CHEIA ENCOLHIA A LETRA SOZINHA — cortando linha, em silêncio.
  // A etiqueta tem altura FIXA com corte no que passar, e o rodapé é ancorado
  // embaixo: com os seis campos ligados MAIS as quatro linhas de
  // estabelecimento, o miolo passava do espaço e a última linha simplesmente
  // não saía no papel. Ninguém via erro; via uma etiqueta sem o responsável.
  // (Medido no navegador: 59 px além do espaço, quase duas linhas.)
  //
  // ⚠️ Isto NÃO é o caso comum. Val. original vem desligada e marca/SIF costumam
  // ficar vazios — a etiqueta do dia a dia tem quatro linhas e cabe folgada no
  // tamanho maior. Por isso a redução é condicional: quem tem pouca coisa não
  // perde legibilidade por causa de quem tem muita.
  const linhasDeDados = [
    c.valOriginal !== false && campos.valOriginalFmt,
    c.fabricacao !== false && campos.dataFabricacaoFmt,
    c.validade !== false && campos.validadeFmt,
    c.marca !== false && campos.marca,
    (c.sif !== false || c.lote !== false) && campos.sifLoteValor,
    c.responsavel !== false && campos.responsavel,
  ].filter(Boolean).length;
  const linhasDeRodape = (c.restaurante !== false && campos.restauranteNome ? 1 : 0)
    + (c.estabelecimento === false ? 0 : [est.cnpj || est.cep, est.endereco, est.cidade].filter(Boolean).length);
  const apertado = linhasDeDados + linhasDeRodape >= 8;
  // ⚠️ A validade NÃO muda de tamanho — o destaque dela é o sublinhado, por
  // decisão do dono: valores de tamanhos diferentes quebram o alinhamento à
  // direita, e foi isso que a gente já corrigiu uma vez.
  // ⚠️ 2,5 e não 2,6: medido no navegador, 2,6 ainda passava 2 px do espaço
  // no caso cheio — e 2 px é uma linha cortada pela metade no papel.
  const corpo = apertado ? '2.5mm' : '3mm';
  return (
    <div className="etiqueta-label bg-white text-black flex flex-col"
      style={{ width: `${config.larguraMm}mm`, height: `${config.alturaMm}mm`, padding: '1.6mm 2mm', boxSizing: 'border-box', lineHeight: 1.25, fontFamily: 'system-ui, sans-serif' }}>
      {/* Cabeçalho: produto + medida */}
      {/* ⚠️ flexShrink 0 + limite de 2 linhas. A etiqueta tem ALTURA FIXA e o
          print CSS aplica overflow:hidden nela; sem esta trava um nome longo
          ("FILÉ MIGNON PORCIONADO 180G") empurrava o miolo e o RODAPÉ para fora
          do papel — sumia justamente o QR e o lote, numa etiqueta que fica
          colada no pote circulando na frente do cliente do restaurante. */}
      <div className="flex items-start justify-between gap-1 border-b border-black"
        style={{ paddingBottom: '0.8mm', marginBottom: '0.8mm', flexShrink: 0 }}>
        <div style={{
          fontSize: (campos.nome || '').length > 24 ? '3.2mm' : '3.9mm',
          fontWeight: 800, textTransform: 'uppercase',
          // Duas travas somadas de propósito: o line-clamp corta com reticências
          // onde o -webkit-box vale, e o maxHeight garante o corte mesmo onde
          // ele não vale (medi no navegador: o display computou flow-root, e aí
          // o clamp sozinho não corta nada).
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          maxHeight: '9.5mm', overflow: 'hidden', wordBreak: 'break-word',
        }}>{campos.nome}</div>
        {campos.medida && <div style={{ fontSize: '3.4mm', fontWeight: 800, whiteSpace: 'nowrap' }}>{campos.medida}</div>}
      </div>
      {c.armazenamento !== false && campos.armazenamentoLabel && (
        // ⚠️ nowrap + ellipsis obrigatórios. A etiqueta tem ALTURA FIXA com
        // overflow:hidden; uma faixa de temperatura longa quebraria em duas
        // linhas e empurraria o rodapé (estabelecimento, QR e lote) para fora
        // do papel — o mesmo defeito que o nome comprido já causou. O limite
        // de caracteres na tela de Configurações é a outra metade da trava.
        <div style={{
          fontSize: apertado ? '2.7mm' : '3mm', fontWeight: 700,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {campos.armazenamentoLabel}
          {campos.armazenamentoFaixa && (
            <span style={{ fontWeight: 600 }}> · {campos.armazenamentoFaixa}</span>
          )}
        </div>
      )}
      {/* Datas e dados */}
      <div className="flex-1" style={{ minHeight: 0, overflow: 'hidden' }}>
        {/* Os rótulos são os MESMOS que o TSPL imprime — inclusive as abreviações. */}
        {c.valOriginal !== false && <Linha rotulo="VAL. ORIG." valor={campos.valOriginalFmt} corpo={corpo} />}
        {c.fabricacao !== false && <Linha rotulo={campos.rotuloData} valor={campos.dataFabricacaoFmt} corpo={corpo} />}
        {c.validade !== false && <Linha rotulo="VALIDADE" valor={campos.validadeFmt} forte corpo={corpo} />}
        {c.marca !== false && <Linha rotulo="MARCA" valor={campos.marca} corpo={corpo} />}
        {/* ⚠️ SIF e LOTE dividem a linha — ver o porquê em utils/tspl.js.
            A prévia tem que bater com o papel, senão vira duas verdades. */}
        {(c.sif !== false || c.lote !== false) && (
          <Linha rotulo={(campos.sifLoteRotulo || '').replace(':', '')} valor={campos.sifLoteValor} corpo={corpo} />
        )}
        {c.responsavel !== false && <Linha rotulo="RESP." valor={campos.responsavel} corpo={corpo} />}
      </div>
      {/* Rodapé: estabelecimento + ID + QR */}
      <div className="flex items-end justify-between gap-1 border-t border-black" style={{ paddingTop: '0.8mm', marginTop: '0.8mm', flexShrink: 0 }}>
        {/* ⚠️ 2,1 mm saía ilegível no papel — o dono leu a etiqueta impressa e
            apontou o CNPJ e o endereço. Numa térmica, letra menor que ~2,4 mm
            perde o traço: o ponto é grande demais para desenhar a curva. */}
        <div style={{ fontSize: apertado ? '2.2mm' : '2.6mm', lineHeight: 1.35 }} className="min-w-0">
          {c.restaurante !== false && campos.restauranteNome && (
            <div style={{ fontWeight: 800, textTransform: 'uppercase' }}>{campos.restauranteNome}</div>
          )}
          {c.estabelecimento !== false && (
            <>
              {(est.cnpj || est.cep) && <div>{est.cnpj ? `CNPJ: ${est.cnpj}` : ''}{est.cnpj && est.cep ? '  ' : ''}{est.cep ? `CEP: ${est.cep}` : ''}</div>}
              {est.endereco && <div className="truncate">{est.endereco}</div>}
              {est.cidade && <div>{est.cidade}</div>}
            </>
          )}
        </div>
        {comQR && (
          // QR em SVG (vetor), não imagem: a impressora térmica é 1 bit (ponto
          // preto ou branco). Um PNG reduzido para ~20mm chega borrado/cinza,
          // vira meio-tom e o leitor não pega. O SVG é rasterizado direto na
          // resolução da impressora, com borda dura (shape-rendering=crispEdges).
          <div aria-hidden="true"
            style={{ width: `${qrMm}mm`, height: `${qrMm}mm`, flexShrink: 0 }}
            className="[&>svg]:w-full [&>svg]:h-full [&>svg]:block"
            dangerouslySetInnerHTML={{ __html: qr.svg }} />
        )}
      </div>
    </div>
  );
}

export default function EtiquetaPrint() {
  const { etiquetaState, fecharEtiquetas } = useUI();
  const { sessao, impersonando } = useAuth();
  const { prefs, setPrefs, produtos, modulo, estoqueAtual, etiquetasImpressas, setEtiquetasImpressas } = useApp();
  // ⚠️ Nome que SAI IMPRESSO no pote. Com dois restaurantes na mesma conta, o
  // nome da conta sairia na etiqueta dos dois — erro visível na frente do
  // cliente, e o pote ainda circula. O nome do ESTOQUE manda quando o dono
  // preencheu; senão cai no da conta, que é o caso de quem tem uma casa só e
  // não precisa configurar nada.
  const nomeImpresso = estabelecimentoDe(estoqueAtual, sessao?.restauranteNome);
  // despensa não tem congelado/resfriado: a etiqueta do seco não pergunta isso
  const comArmazenamento = temRecurso(modulo, 'armazenamento');
  const config = configEtiqueta(prefs);
  // ⚠️ O CNPJ VEM DA CONTA, não da preferência. Ele identifica quem manipulou
  // o alimento e não é editável pelo restaurante; contas que editaram esse
  // campo quando ele era livre ainda têm um valor guardado, e sem esta linha o
  // número antigo continuaria sendo impresso.
  const estabelecimento = { ...(prefs.estabelecimento || {}), cnpj: sessao?.cnpj || prefs.estabelecimento?.cnpj || '' };
  // Estados de armazenamento configuráveis (Configurações → Sistema).
  const armazenamentos = armazenamentosAtivos(prefs);

  // Cópia local editável dos itens + hora congelada na abertura do modal
  const [itens, setItens] = useState([]);
  // Cache de QR indexado pelo PRÓPRIO CONTEÚDO (payload), não pela posição do
  // item: assim um QR só é considerado pronto se foi gerado para os dados que
  // estão na tela agora. Indexado por índice, editar a data deixava o QR antigo
  // no lugar (texto novo + QR velho) até o laço assíncrono terminar.
  const [qrs, setQrs] = useState({}); // payload -> dataURL
  const [horaImpressao, setHoraImpressao] = useState('');
  // Responsável ÚNICO da impressão (sai no RESP. de todas as etiquetas) —
  // escolhido entre as pessoas da equipe, como nas telas de registro
  const [responsavel, setResponsavel] = useState('');
  // Impressão direta (BLE + TSPL) — caminho a mais, nunca substituto
  const [enviando, setEnviando] = useState(false);
  // ⚠️ Guarda TOM junto do texto. "Nenhuma impressora escolhida" não é erro
  // vermelho — pode ser só o dono tendo fechado o seletor —, mas precisa
  // aparecer. Antes esse caso era engolido em SILÊNCIO (ver o catch abaixo).
  const [erroBLE, setErroBLE] = useState(null); // { texto, tom } | null
  const avisarBLE = (texto, tom = 'erro') => setErroBLE(texto ? { texto, tom } : null);
  // ⚠️ O contador de progresso JÁ EXISTIA no driver (`aoProgredir`) e nunca era
  // passado por ninguém — um lote de 40 etiquetas ficava em "Enviando…" sem
  // dizer onde estava. Agora o progresso é contado em ETIQUETAS, por item
  // confirmado, que é o que a pessoa vê sair do rolo.
  const [progresso, setProgresso] = useState(null); // { feitos, total } | null

  // A regra de qual caminho aparece vive em impressoraBLE, com teste.
  const { direto: mostrarDireto, dialogo: mostrarDialogo, semBluetooth } = caminhosDeImpressao();

  // Espelha o estado externo numa cópia local editável — setState síncrono intencional.
  useEffect(() => {
    if (etiquetaState) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- espelho de valor externo (mesmo padrão de Configuracoes)
      setItens(etiquetaState.map(i => {
        const p = i.produtoId ? produtos.find(x => x.id === i.produtoId) : null;
        const resolvido = {
          tipoData: 'fabricacao',
          dataFabricacao: hoje(),
          armazenamento: null,
          diasValidade: null,
          validade: null,
          valOriginal: '',
          medida: '',
          quantidade: 1,
          // marca/SIF vêm do cadastro do produto (Config → Produtos), editáveis por impressão
          marca: p?.marca || '',
          sif: p?.sif || '',
          // ⚠️ NÃO vem do cadastro do item: o lote muda a cada caixa que chega
          // do fornecedor, então ele nasce vazio e é digitado na impressão.
          lote: '',
          _unidade: p?.unidade || '',
          ...i,
        };
        // guarda data/armazenamento originais: se o usuário mudar qualquer um no
        // modal, a validade pré-calculada (do registro real) deixa de valer
        const n = Math.min(Math.max(0, parseInt(resolvido.quantidade) || 0), 200);
        // ⚠️ SEMEIA os dias com o prazo do cadastro. Antes o campo só tinha
        // `placeholder`, então aparecia VAZIO — e o dono leu isso como "não
        // veio preenchido", que era justamente o contrário do combinado. Aqui
        // é a abertura do modal (efeito), nunca o render.
        // ⚠️ Produto ABERTO sem prazo cadastrado ganha a sugestão de 3 dias em
        // vez de sair sem validade nenhuma — ver diasIniciaisDaEtiqueta.
        const diasIniciais = diasIniciaisDaEtiqueta(resolvido);
        return {
          ...resolvido,
          diasOverride: diasIniciais > 0 ? String(diasIniciais) : '',
          _lotes: Array.from({ length: n }, () => gerarLoteId()),
          _dataOriginal: resolvido.dataFabricacao,
          _armazOriginal: resolvido.armazenamento,
        };
      }));
      setHoraImpressao(fmtHora());
      setResponsavel(etiquetaState[0]?.responsavel || prefs.responsavel || '');
    } else {
      setItens([]); setQrs({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- produtos só enriquece marca/sif na abertura; não deve reabrir o modal
  }, [etiquetaState]);

  // Classe no <body> que ativa o CSS de impressão isolada (removida ao fechar)
  useEffect(() => {
    if (!etiquetaState) return;
    document.body.classList.add('imprimindo-etiqueta');
    return () => document.body.classList.remove('imprimindo-etiqueta');
  }, [etiquetaState]);

  // Esc fecha (mesmo padrão dos outros modais)
  useEffect(() => {
    if (!etiquetaState) return;
    const h = (e) => { if (e.key === 'Escape') fecharEtiquetas(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [etiquetaState, fecharEtiquetas]);

  // Campos calculados de cada item (validade reage à data/armazenamento editados).
  // Prazo em dias: avulsas trazem `diasValidade` fixo; itens do catálogo trazem
  // `diasCongelado`/`diasResfriado` e o prazo acompanha o armazenamento escolhido.
  // Prazo que VEM DO CADASTRO para o armazenamento escolhido. Fica separado do
  // `dias` efetivo porque o campo de dias do modal precisa mostrar este valor
  // como ponto de partida e deixar a pessoa mudar.
  const diasDoCadastro = (item) => {
    if (item.diasValidade != null) return item.diasValidade;
    if (!comArmazenamento) return item.prazos?.congelado ?? item.diasCongelado ?? 0;
    return item.prazos?.[item.armazenamento]
      ?? (item.armazenamento === 'congelado' ? item.diasCongelado
        : item.armazenamento === 'resfriado' ? item.diasResfriado
        : 0)
      ?? 0;
  };

  const camposDe = (item, loteId = null) => {
    // `prazos` é o formato novo (um prazo por estado configurável). Os campos
    // diasCongelado/diasResfriado continuam sendo lidos porque chegam de item
    // montado por tela antiga, rascunho em cache ou reimpressão do histórico.
    //
    // ⚠️ `diasOverride` GANHA de tudo: é o que a pessoa digitou agora, no modal.
    // Sem ele, item sem prazo cadastrado saía sem data de vencimento e a única
    // saída era largar a impressão e ir até Meus itens — com o pote na mão, no
    // meio do serviço. Também cobre o lote que veio com prazo diferente do
    // padrão, que é caso comum e não justifica mexer no cadastro.
    const dias = item.diasOverride != null && item.diasOverride !== ''
      ? (parseInt(item.diasOverride) || 0)
      : item.diasValidade != null ? item.diasValidade
      // sem câmara fria (despensa): o prazo de prateleira é único e fica em
      // diasCongelado. Sem esta linha a etiqueta do seco saía SEM validade.
      : !comArmazenamento ? (item.prazos?.congelado ?? item.diasCongelado ?? 0)
      : (item.prazos?.[item.armazenamento]
         ?? (item.armazenamento === 'congelado' ? item.diasCongelado
           : item.armazenamento === 'resfriado' ? item.diasResfriado
           : 0)
         ?? 0);
    const naoEditado = item._dataOriginal === item.dataFabricacao && item._armazOriginal === item.armazenamento;
    const armaz = acharArmazenamento(prefs, item.armazenamento);
    return montarCamposEtiqueta({
      nome: item.nome,
      dataFabricacao: item.dataFabricacao,
      tipoData: item.tipoData,
      armazenamento: item.armazenamento,
      armazenamentoNome: armaz?.nome || '',
      armazenamentoFaixa: armaz?.faixa || '',
      restauranteNome: nomeImpresso,
      responsavel,
      // validade pronta (de registro real) só vale enquanto data/armazenamento não mudarem
      validade: naoEditado ? item.validade : null,
      diasValidade: dias,
      medida: item.medida,
      valOriginal: item.valOriginal || null,
      marca: item.marca,
      sif: item.sif,
      lote: item.lote,
      hora: horaImpressao,
      loteId,
    });
  };

  // Id de lote POR CÓPIA física. Vive DENTRO do item (`_lotes`), criado nos
  // manipuladores de evento — nunca durante o render. Precisa ser estável: se
  // mudasse a cada tecla, o QR seria regerado sem parar e a etiqueta que sai na
  // impressora teria um id diferente do registrado no catálogo.
  const loteDaCopia = (item, copia) => item._lotes?.[copia] || '';

  // Payload do QR de cada item — é também a chave do cache de QR
  const payloadDe = (item, loteId) => montarPayloadQR(camposDe(item, loteId));

  // Gera os QR codes quando ligado (async — toDataURL é Promise).
  // Só gera o que ainda não está em cache: editar um item de um lote não
  // refaz o QR dos outros.
  useEffect(() => {
    if (!config.incluirQR || !itens.length) return;
    let ativo = true;
    (async () => {
      const todos = [];
      itens.forEach((it) => {
        for (let c = 0; c < limitarCopias(it.quantidade); c++) todos.push(payloadDe(it, loteDaCopia(it, c)));
      });
      const pendentes = [...new Set(todos)].filter(p => !qrs[p]);
      if (!pendentes.length) return;
      const novos = {};
      for (const payload of pendentes) {
        try {
          const svg = await QRCode.toString(payload, {
            type: 'svg',
            // margin em "módulos" — a zona de silêncio faz parte do padrão QR;
            // sem ela a câmera não acha a borda do código.
            margin: 2,
            // 'M' recupera ~15% de dano (vinco, condensação do freezer, borrão)
            // sem inflar demais o número de módulos. Ver montarPayloadQR.
            errorCorrectionLevel: 'M',
          });
          // o viewBox traz os módulos JÁ com a zona de silêncio — é essa conta
          // que define o tamanho físico mínimo para o código sair legível
          const modulos = parseInt((svg.match(/viewBox="0 0 (\d+)/) || [])[1], 10) || 41;
          novos[payload] = { svg, modulos };
        } catch { /* QR falhou — etiqueta sai sem ele */ }
      }
      // acumula no cache (não substitui): os QRs já prontos continuam valendo
      if (ativo) setQrs(prev => ({ ...prev, ...novos }));
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camposDe lê só props estáveis + itens/responsavel (já na lista); qrs é lido só como cache
  }, [itens, config.incluirQR, responsavel]);

  if (!etiquetaState) return null;

  // Mantém um id por cópia: crescer a quantidade cria ids novos; diminuir
  // corta os do fim, sem mexer nos que já estavam (o QR deles não muda).
  const comLotes = (it) => {
    const n = limitarCopias(it.quantidade);
    const atuais = it._lotes || [];
    if (atuais.length === n) return it;
    const novos = atuais.slice(0, n);
    while (novos.length < n) novos.push(gerarLoteId());
    return { ...it, _lotes: novos };
  };

  const setItem = (idx, patch) => setItens(prev => prev.map((it, i) => i === idx ? comLotes({ ...it, ...patch }) : it));
  // Stepper com update funcional: toques rápidos seguidos não podem ler closure velha
  const mudarQtd = (idx, delta) => setItens(prev => prev.map((it, i) =>
    i === idx ? comLotes({ ...it, quantidade: limitarCopias((parseInt(it.quantidade) || 0) + delta) }) : it));
  const totalEtiquetas = itens.reduce((s, i) => s + (parseInt(i.quantidade) || 0), 0);
  // QR ligado: segura o Imprimir até TODOS os QRs dos itens a imprimir ficarem
  // prontos (toDataURL é assíncrono — sem isso a etiqueta podia sair sem QR)
  // Checa pelo CONTEÚDO: se a data/armazenamento acabou de mudar, o QR daquele
  // conteúdo ainda não existe e o Imprimir fica travado até ele ficar pronto —
  // nunca sai etiqueta com texto novo e QR velho.
  const qrPendente = config.incluirQR && itens.some(it => {
    const n = limitarCopias(it.quantidade);
    for (let c = 0; c < n; c++) if (!qrs[payloadDe(it, loteDaCopia(it, c))]) return true;
    return false;
  });
  const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs';

  // Ao imprimir, cada cópia vira uma ETIQUETA FÍSICA registrada: é o que
  // permite depois contar por leitura de QR e saber o que ainda está na
  // prateleira. Sem isto o id no código seria só enfeite.
  //
  // ⚠️ SÓ NO PLANO COMPLETO. Quem lê esses registros são a contagem por câmera
  // do Inventário e a tela de Validades — as duas fora do plano Etiquetas. Lá
  // isto era uma linha gravada e enviada ao servidor por etiqueta, para tela
  // nenhuma; num dia de cinquenta etiquetas, cinquenta registros para ninguém.
  // O dono confirmou o desligamento em 30/08/2026.
  //
  // ⚠️ Quem faz UPGRADE começa o histórico do dia do upgrade. É consequência
  // aceita: ele nunca teve a tela que usa esse histórico, então não perde nada
  // que já enxergasse.
  const guardaHistorico = produtoTem(produtoAtivo(sessao, impersonando), 'historicoEtiquetas');

  // ⚠️ RECEBE QUAIS ITENS SAÍRAM DE VERDADE. Antes registrava sempre a lista
  // inteira, e isso só era verdade quando o envio ia até o fim. Se a impressora
  // caísse no meio de um lote, o que já tinha saído no papel NÃO ficava
  // gravado: mandar de novo reimprimia tudo, gastando rolo e colando etiqueta
  // duplicada em pote que já tinha uma. Sem argumento continua registrando
  // tudo — é o caminho do diálogo do navegador, que é atômico.
  // ⚠️ `umCodigoPorCopia` decide se o lote vira N linhas ou UMA — e a regra é
  // simples: só se grava código que EXISTE em papel.
  //
  // O caminho do Bluetooth manda `PRINT 1,N`, que faz a impressora repetir a
  // MESMA etiqueta N vezes — as N saem com o mesmo código. Mas o histórico
  // gravava N códigos diferentes: N-1 deles não existiam em pote nenhum. Um
  // código inventado é pior que código nenhum, porque a tela de Validades e a
  // leitura por câmera tratam cada linha como um pote real.
  //
  // No caminho do diálogo do navegador cada cópia é desenhada separada, com o
  // seu próprio QR — ali os N códigos existem mesmo, e continuam N linhas.
  // Com o QR desligado nem ali há código impresso, e vira uma linha só.
  //
  // ⚠️ Consequência aceita pelo dono (03/09): com uma linha por lote, o
  // histórico conta LOTES e não potes. Três potes iguais aparecem como uma
  // linha — por isso `copias` vai gravado junto, para a tela poder dizer
  // quantos foram sem precisar inventar identidade para cada um.
  const registrarImpressao = (soEstes, umCodigoPorCopia = true) => {
    if (!guardaHistorico) return;
    const hojeISO = hoje();
    const novas = [];
    (soEstes || itens).forEach(item => {
      const n = limitarCopias(item.quantidade);
      if (!n) return;
      const c = camposDe(item);
      const quantos = umCodigoPorCopia ? n : 1;
      for (let i = 0; i < quantos; i++) {
        const loteId = loteDaCopia(item, i);
        if (!loteId) continue;
        novas.push({
          id: loteId,
          produtoId: item.produtoId || null,
          nome: c.nome,
          medida: c.medida || '',
          validade: c.validade || null,
          fabricacao: c.dataFabricacao || null,
          responsavel: c.responsavel || '',
          impressoEm: hojeISO,
          status: 'valida',
          // quantas etiquetas de papel esta linha representa
          copias: umCodigoPorCopia ? 1 : n,
        });
      }
    });
    if (novas.length) {
      setEtiquetasImpressas(podarEtiquetas([...etiquetasImpressas, ...novas], hojeISO));
    }
  };

  // ── Caminho 1: diálogo do navegador (sempre existe) ─────────
  // ⚠️ TUDO QUE ACONTECE AO IMPRIMIR PASSA POR AQUI, nos dois caminhos. A
  // memória do armazenamento NÃO podia ir dentro de `registrarImpressao`: ela
  // só roda quando a conta guarda histórico, e o plano Etiquetas não guarda —
  // então a memória nunca funcionaria justo no produto que vai ser vendido.
  const aoImprimir = (soEstes, umCodigoPorCopia = true) => {
    registrarImpressao(soEstes, umCodigoPorCopia);
    // ⚠️ CONTADOR DE USO (M42), e é o ÚNICO caminho que existe para o plano
    // Etiquetas: ele não guarda histórico de etiquetas (decisão de 30/08), e
    // por isso o painel mostrava "0 etiquetas impressas" para toda conta
    // daquele plano. O contador é um número por conta — a Aurum vê quanto a
    // casa usa e continua sem ver O QUE ela etiqueta.
    //
    // ⚠️ Solto e sem `await`: impressão não pode esperar rede, e falhar aqui
    // não pode atrapalhar quem está com o pote na mão. Sem internet a
    // contagem daquele lote se perde, de propósito — pôr estatística na fila
    // offline sairia caro no lugar errado (ver o comentário da M42).
    const quantas = contarEtiquetas(soEstes || itens);
    if (quantas > 0 && !sessao?.demo) {
      supabase.rpc('contar_etiquetas_impressas', { p_quantas: quantas })
        .then(({ error }) => { if (error) console.warn('[etiquetas] contador não somou:', error.message); })
        .catch(() => { /* offline — ver acima */ });
    }
    // ⚠️ `setPrefs` (plural) para gravar as duas de uma vez. Dois `setPref`
    // seguidos leriam as prefs pelo ref, que só é atualizado no efeito
    // seguinte — o segundo apagaria o primeiro.
    setPrefs({
      ultimoArmazenamento: lembrarArmazenamentos(
        prefs.ultimoArmazenamento, itens, produtos.map(p => p.id),
      ),
      // ⚠️ QUEM ETIQUETA VIRA O PADRÃO DA PRÓXIMA ETIQUETA. Oito telas do app
      // já gravavam isto ao registrar (Entradas, Produção, Saídas...) e a
      // etiqueta era a única que só LIA e nunca escrevia. No plano Etiquetas,
      // onde aquelas telas nem existem, o campo nunca era preenchido por
      // ninguém: a pessoa escolhia o nome a cada pote, o dia inteiro.
      // Só grava quando alguém foi escolhido — imprimir sem responsável não
      // pode apagar quem estava lembrado.
      ...(responsavel.trim() ? { responsavel } : {}),
    });
  };

  // ⚠️ FALTA O RESPONSÁVEL? Veio de um erro real: o dono imprimiu um lote,
  // só viu depois que o RESP. saiu em branco e teve que refazer. Trava os DOIS
  // botões, não só o do diálogo — senão a impressão direta, que é a que a
  // cozinha usa, passaria por baixo da regra que o dono ligou.
  const faltaResponsavel = config.exigirResponsavel === true && !responsavel.trim();

  const imprimir = () => {
    // Aqui cada cópia é uma etiqueta desenhada por conta própria: com o QR
    // ligado, cada uma leva o SEU código impresso — então são N linhas. Com o
    // QR desligado não há código no papel, e o lote vira uma linha só.
    aoImprimir(itens, config.incluirQR === true);
    window.print();
  };

  // ── Caminho 2: direto na impressora, em TSPL ────────────────
  // ⚠️ Aqui NÃO passa por driver, escala nem paginação — que é de onde vieram
  // todos os problemas de impressão. O que o app manda é o que sai no papel.
  // Só no Chrome do Android/desktop: o Safari não implementa Web Bluetooth.
  const imprimirDireto = async () => {
    avisarBLE(null); setEnviando(true);
    // ⚠️ UM ITEM POR ENVIO, e não o lote inteiro numa tacada. Antes tudo ia
    // numa chamada só: se a impressora desligasse ou saísse de alcance no meio,
    // não havia como saber o que já tinha saído no papel — o registro só
    // acontecia DEPOIS de todo o envio. A pessoa mandava de novo e reimprimia o
    // lote inteiro: rolo gasto e etiqueta duplicada em pote que já tinha uma.
    // Enviando item a item sabemos exatamente onde parou.
    // ⚠️ As CÓPIAS continuam nativas (`PRINT 1,N`) dentro de cada item: mandar
    // N vezes seria N vezes o tráfego, e o `PRINT` não oscila no meio.
    const aEnviar = itens.filter(it => limitarCopias(it.quantidade) > 0);
    const saiu = [];
    try {
      if (!impressoraConectada()) {
        const voltou = await reconectarSePuder();
        if (!voltou) await escolherImpressora();
      }
      for (const it of aEnviar) {
        const bloco = [{ campos: camposDe(it, loteDaCopia(it, 0)), copias: limitarCopias(it.quantidade) }];
        // O estabelecimento não vive em `config`, mas o rodapé do papel precisa
        // dele para ficar igual à prévia da tela.
        await enviarTSPL(loteTSPL(bloco, { ...config, estabelecimento }));
        saiu.push(it);
        setProgresso({ feitos: contarEtiquetas(saiu), total: contarEtiquetas(aEnviar) });
      }
      // `false`: o TSPL manda PRINT 1,N — um código para as N cópias.
      aoImprimir(saiu, false);
      setEnviando(false);
      setProgresso(null);
      fecharEtiquetas();
    } catch (e) {
      setEnviando(false);
      setProgresso(null);
      // ⚠️ ISTO ERA UM `return` MUDO, e foi o que apareceu no celular de um
      // amigo: tocou em conectar, não achou impressora nenhuma e a tela não
      // disse NADA — parecia que o botão não funcionava.
      // O Web Bluetooth usa o MESMO `NotFoundError` para "fechei o seletor" e
      // para "a lista veio vazia": não dá para separar os dois. Então o texto
      // serve aos dois casos — constata o que houve e diz o que conferir, sem
      // acusar a pessoa de ter cancelado nem gritar erro em vermelho.
      if (e?.name === 'NotFoundError') {
        avisarBLE('Nenhuma impressora foi escolhida. Se a lista apareceu vazia: ligue a impressora, deixe-a por perto e confira se o Bluetooth e a permissão "Dispositivos por perto" estão liberados para o app.', 'atencao');
        return;
      }
      // ⚠️ GRAVA O QUE JÁ SAIU antes de mostrar o erro. É o que permite mandar
      // só o resto em vez do lote inteiro.
      if (saiu.length) aoImprimir(saiu, false);
      const feitas = contarEtiquetas(saiu);
      const total = contarEtiquetas(aEnviar);
      const parcial = feitas > 0 && feitas < total
        ? ` Saíram ${feitas} de ${total} etiquetas — o que já saiu ficou registrado, mande só o resto.`
        : '';
      avisarBLE(erroEmPortugues(e) + parcial);
    }
  };

  return (
    <>
      {/* Modal on-screen (não imprime — print:hidden) */}
      <Dialogo aoFechar={fecharEtiquetas} titulo="Imprimir etiquetas"
        forma="rolo" largura="md" camada={120} respiro="p5" classeCaixa="space-y-4">
        <>
          <ResponsavelSelect value={responsavel} onChange={setResponsavel} />
          {faltaResponsavel && (
            <Aviso tom="atencao">Escolha quem assina antes de imprimir.</Aviso>
          )}

          <div className="space-y-3">
            {itens.map((item, idx) => {
              const campos = camposDe(item);
              return (
                <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm text-gray-800 truncate">{item.nome}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button aria-label={`Menos etiquetas de ${item.nome}`}
                        onClick={() => mudarQtd(idx, -1)}
                        className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center">−</button>
                      <input type="number" min="0" max={MAX_COPIAS} inputMode="numeric" value={item.quantidade}
                        onChange={e => setItem(idx, { quantidade: e.target.value === '' ? '' : limitarCopias(e.target.value) })}
                        aria-label={`Quantidade de etiquetas de ${item.nome}`}
                        className="w-12 text-center border border-gray-200 rounded-lg py-1.5 text-sm font-semibold" />
                      <button aria-label={`Mais etiquetas de ${item.nome}`}
                        onClick={() => mudarQtd(idx, +1)}
                        className="w-9 h-9 rounded-full bg-polo-navy text-polo-gold font-bold flex items-center justify-center">+</button>
                    </div>
                  </div>
                  {/* ⚠️ O ARMAZENAMENTO SAIU DO MEIO DA GRADE E VIROU o campo
                      principal do item, a pedido do dono: ele imprimiu um lote
                      inteiro como RESFRIADO num item que era CONGELADO, por
                      falta de atenção. Era um <select> pequeno, do mesmo
                      tamanho e cor de outros cinco campos — e é o único deles
                      cuja escolha vai IMPRESSA no pote e decide a validade.
                      Agora ocupa a linha inteira, com moldura navy, fundo bege
                      e a palavra em corpo grande: dá para conferir de relance,
                      sem parar para ler.
                      ⚠️ Destaque, NÃO um toque a mais: a confirmação em dois
                      toques foi tentada e o dono pediu para tirar. */}
                  {comArmazenamento && item.armazenamento !== null && (
                    <div className="border-2 border-polo-navy rounded-xl bg-polo-beige px-3 py-2">
                      <label htmlFor={`ep-armaz-${idx}`}
                        className="block text-[11px] font-bold text-polo-navy uppercase tracking-wide mb-1">
                        Armazenamento — sai impresso na etiqueta
                      </label>
                      {/* ⚠️ Trocar o estado RESEMEIA os dias com o prazo
                          daquele estado. Antes só esvaziava — e o campo
                          ficava em branco, dando a impressão de que não havia
                          prazo cadastrado. Deixar o número do estado anterior
                          grudado seria pior ainda: data errada, sem aviso. */}
                      <select id={`ep-armaz-${idx}`} value={item.armazenamento || 'congelado'}
                        onChange={e => setItem(idx, {
                          armazenamento: e.target.value,
                          diasOverride: String(diasDoCadastro({ ...item, armazenamento: e.target.value }) || ''),
                        })}
                        className="w-full bg-white border-2 border-polo-navy/40 rounded-lg px-3 py-2.5
                                   text-base font-bold text-polo-navy min-h-11">
                        {/* ⚠️ Mostra o PRAZO de cada estado. Sem isto não dá
                            para comparar congelado x refrigerado na hora de
                            escolher, e a pessoa só descobre o número depois
                            de trocar. */}
                        {armazenamentos.map(a => {
                          const d = diasDoCadastro({ ...item, armazenamento: a.id });
                          return (
                            <option key={a.id} value={a.id}>
                              {a.nome}{a.faixa ? ` · ${a.faixa}` : ''} · {d > 0 ? `${d} dias` : 'sem prazo'}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`ep-data-${idx}`} className="block text-[11px] font-semibold text-gray-500 mb-0.5">
                        {item.tipoData === 'abertura' ? 'Data de abertura' : 'Data de manipulação'}
                      </label>
                      <input id={`ep-data-${idx}`} type="date" value={item.dataFabricacao} max={hoje()}
                        onChange={e => setItem(idx, { dataFabricacao: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor={`ep-medida-${idx}`} className="block text-[11px] font-semibold text-gray-500 mb-0.5">Medida (ex: 1 kg)</label>
                      <input id={`ep-medida-${idx}`} type="text" value={item.medida} placeholder={item._unidade || 'ex: 1 kg'}
                        onChange={e => setItem(idx, { medida: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      {/* ⚠️ A Dica fica FORA do <label>: botão dentro de label
                          herda o clique dele e, além de abrir a explicação,
                          jogava o foco no campo — atrapalhando justo quem
                          navega por teclado ou leitor de tela. */}
                      <div className="mb-0.5">
                        <label htmlFor={`ep-dias-${idx}`} className="text-[11px] font-semibold text-gray-500">
                          Validade (dias)
                        </label>
                        <Dica texto="Vem do cadastro do item. Mude se a embalagem deste lote disser outro prazo." />
                      </div>
                      {/* ⚠️ TETO NO CAMPO E CORTE NO CÓDIGO. O `max` sozinho não
                          segura nada: o navegador deixa digitar 18000 e só
                          reclama em formulário validado, que aqui não existe.
                          Quem garante é `limitarDias`. */}
                      <input id={`ep-dias-${idx}`} type="number" inputMode="numeric"
                        min="0" max={DIAS_VALIDADE_MAX}
                        value={item.diasOverride ?? ''}
                        placeholder={String(diasDoCadastro(item) || 0)}
                        onChange={e => setItem(idx, { diasOverride: limitarDias(e.target.value) })}
                        className={inputCls} />
                    </div>
                  </div>
                  {/* Prazo que destoa do cadastrado — aviso, nunca bloqueio:
                      lote com prazo diferente do padrão é caso real. */}
                  {avisoDePrazo(item.diasOverride, diasDoCadastro(item)) && (
                    <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                      {avisoDePrazo(item.diasOverride, diasDoCadastro(item))}
                    </p>
                  )}
                  {/* ⚠️ A SUGESTÃO SE EXPLICA. Preencher 3 em silêncio faria a
                      pessoa achar que o prazo veio do cadastro dela. Aqui ela
                      lê de onde veio e que o rótulo do fabricante manda mais. */}
                  {usandoSugestaoDeAbertura(item, item.diasOverride) && (
                    <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2">
                      Sem prazo cadastrado. Sugerimos <strong>3 dias</strong>, o limite usual
                      para produto aberto sob refrigeração — se a embalagem disser outro prazo
                      depois de aberto, é o dela que vale.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {config.campos.valOriginal !== false && <div>
                      <div className="mb-0.5">
                        <label htmlFor={`ep-valorig-${idx}`} className="text-[11px] font-semibold text-gray-500">
                          Val. original
                        </label>
                        <Dica texto="A data impressa na embalagem do fabricante. Não muda o vencimento — serve para avisar se o prazo da casa passar dela." />
                      </div>
                      <input id={`ep-valorig-${idx}`} type="date" value={item.valOriginal}
                        onChange={e => setItem(idx, { valOriginal: e.target.value })} className={inputCls} />
                    </div>}
                    {/* ⚠️ LOTE DO FABRICANTE, e ele mora AQUI e não no cadastro
                        do item: o número muda a cada caixa que chega do
                        fornecedor. Preso no cadastro, seria o lote da compra
                        passada impresso na carne de hoje — pior que não ter.
                        É o que responde "o lote X foi recolhido" depois que a
                        peça já virou dez porções. */}
                    {config.campos.lote !== false && <div>
                      <div className="mb-0.5">
                        <label htmlFor={`ep-lote-${idx}`} className="text-[11px] font-semibold text-gray-500">
                          Lote do fabricante
                        </label>
                        <Dica texto="O número do lote impresso na caixa ou no rótulo do fornecedor. Só isso liga este pote ao recall do frigorífico depois de porcionar." />
                      </div>
                      <input id={`ep-lote-${idx}`} type="text" maxLength={20}
                        value={item.lote ?? ''} placeholder="opcional"
                        onChange={e => setItem(idx, { lote: e.target.value })} className={inputCls} />
                    </div>}
                  </div>
                  {/* ⚠️ O alerta que justifica o campo existir: prazo da casa
                      que ultrapassa a validade do fabricante é erro grave e
                      ninguém confere de cabeça. */}
                  {campos.passaDoFornecedor && (
                    <Aviso tom="erro">
                      Passa da validade do fornecedor ({campos.valOriginalFmt}). Reduza os dias.
                    </Aviso>
                  )}
                  <p className="text-[11px] text-gray-500">
                    {campos.validadeFmt
                      ? <>Vencimento na etiqueta: <strong className="text-polo-navy">{campos.validadeFmt}</strong></>
                      : 'Sem validade — etiqueta só de identificação.'}
                    {(item.marca || item.sif || item.lote) && <> · {item.marca}{item.sif ? ` · SIF ${item.sif}` : ''}{item.lote ? ` · lote ${item.lote}` : ''}</>}
                  </p>
                </div>
              );
            })}
          </div>

          {/* ⚠️ PREVIEW em tamanho real. A área que de fato imprime é
              visibility:hidden (index.css), então até aqui a pessoa só descobria
              como a etiqueta ficou DEPOIS de gastar rolo — e o layout é
              configurável (9 campos ligáveis + largura/altura), o que torna o
              erro provavel. É a MESMA marcação da impressa, só que visível. */}
          {itens[0] && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1.5">
                Como vai sair — {config.larguraMm}×{config.alturaMm} mm
              </p>
              {/* ⚠️ ANTES DE GASTAR ROLO. O corpo cresce de cima e o rodapé é
                  ancorado embaixo: com val. original, marca, SIF e lote ligados
                  ao mesmo tempo os dois se encontram, e o RESP. imprime EM CIMA
                  do nome da casa — sem erro, sem aviso, direto no papel. A
                  medida vem do mesmo desenho que vai para a impressora
                  (medirEtiqueta), não de uma segunda conta. */}
              {/* ⚠️ COM `estabelecimento`, senão a conta é de outra etiqueta.
                  A impressão real usa `{ ...config, estabelecimento }` (o
                  rodapé precisa dele) e esta medida usava `config` puro: o
                  rodapé medido tinha só o nome da casa, o impresso tem até
                  três linhas a mais. Media 12,9 mm de folga onde o papel
                  tinha 2,4 — cega por mais do que a folga inteira.
                  ⚠️ E mede TODOS os itens, não só o primeiro: quem estoura é
                  sempre o de nome maior, que pode ser o terceiro da lista. */}
              {itens.some(it => !medirEtiqueta(camposDe(it, loteDaCopia(it, 0)),
                                               { ...config, estabelecimento }).cabe) && (
                <Aviso tom="erro" className="mb-2">
                  Não cabe no papel: as linhas de baixo vão sair por cima do rodapé.
                  Em Administração → Etiquetas, desligue um campo (marca ou validade original).
                </Aviso>
              )}
              <div className="bg-gray-100 rounded-xl p-3 flex justify-center overflow-x-auto">
                <div className="shadow-md flex-shrink-0">
                  <EtiquetaLabel
                    campos={camposDe(itens[0], loteDaCopia(itens[0], 0))}
                    config={config}
                    qr={qrs[payloadDe(itens[0], loteDaCopia(itens[0], 0))]}
                    estabelecimento={estabelecimento} />
                </div>
              </div>
              {itens.length > 1 && (
                <p className="text-[11px] text-gray-600 mt-1">Mostrando a primeira de {totalEtiquetas}.</p>
              )}
            </div>
          )}

          {/* ⚠️ CADA APARELHO VÊ SÓ O QUE SERVE PARA ELE.
              No celular não existe janela de impressão que valha: o Android
              precisaria de um app de terceiro no meio, e o resultado é pior que
              o Bluetooth direto. Então lá o único botão é o direto.
              No computador é o contrário — a fila com a impressora já funciona
              e é o caminho que a pessoa conhece, então os dois aparecem.
              Sobra um caso: celular SEM Bluetooth no navegador (iPhone, ou o
              app aberto dentro do WhatsApp). Aí o diálogo volta, porque é a
              única saída que resta — mas com uma linha dizendo por quê. */}
          {mostrarDireto && (
            <div className="space-y-2">
              <Botao onClick={imprimirDireto} disabled={totalEtiquetas === 0 || enviando || faltaResponsavel}>
                {enviando
                  ? (progresso ? `Enviando… ${progresso.feitos} de ${progresso.total}` : 'Enviando…')
                  : impressoraConectada() ? 'Imprimir na impressora'
                  : 'Conectar impressora e imprimir'}
              </Botao>
              <p className="text-[11px] text-gray-600 text-center">
                Sai direto, no tamanho exato. Sem janela de impressão.
              </p>
              {/* ⚠️ ASSERTIVO, e é o único do arquivo que precisa ser. A pessoa
                  acabou de tocar em imprimir; se a impressora recusou, ela tem
                  de saber AGORA, não quando o leitor terminar a frase. Era o
                  aviso mais silencioso do app: aparecia sem som nenhum e ela
                  ficava tocando de novo. */}
              {erroBLE && <Aviso tom={erroBLE.tom}>{erroBLE.texto}</Aviso>}
            </div>
          )}

          {semBluetooth && (
            <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2">
              Este navegador não conecta na impressora. No <strong>Chrome</strong> a etiqueta sai
              direto, sem esta janela.
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={fecharEtiquetas}
              className={`${mostrarDialogo ? 'flex-1' : 'w-full'} border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl`}>
              {mostrarDialogo ? 'Agora não' : 'Fechar'}
            </button>
            {mostrarDialogo && (
              <button onClick={imprimir} disabled={totalEtiquetas === 0 || qrPendente || faltaResponsavel}
                className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl disabled:opacity-40">
                {qrPendente
                  ? 'Gerando QR…'
                  : mostrarDireto
                    ? 'Imprimir pelo computador'
                    : `Imprimir ${totalEtiquetas > 0 ? (totalEtiquetas === 1 ? '1 etiqueta' : `${totalEtiquetas} etiquetas`) : ''}`}
              </button>
            )}
          </div>
        </>
      </Dialogo>

      {/* Tamanho físico da página de impressão (vem das prefs — Tailwind não expressa @page).
          ⚠️ Girar via CSS (24/08) foi testado e revertido — o rolo físico
          não respondeu à troca de largura/altura, sinal de que a orientação
          é controlada pela driver da impressora, não pelo Chrome. Ver
          index.css. */}
      <style>{`@media print { @page { size: ${config.larguraMm}mm ${config.alturaMm}mm; margin: 0; } }`}</style>

      {/* ⚠️ PORTAL para o <body>, e isto NÃO é preferência de estilo.
          A área de impressão vivia dentro do #root, e o CSS escondia o resto do
          app com `visibility: hidden`. Só que `visibility` esconde SEM TIRAR DO
          LAYOUT: o app inteiro continuava ocupando a altura dele, e o navegador
          paginava essa altura em folhas do tamanho da etiqueta. Medido no
          navegador: documento de 933 px ÷ etiqueta de 151 px = 7 folhas, uma com
          a etiqueta e SEIS EM BRANCO — e numa tela com lista longa, muito mais.
          Foi exatamente o que saiu na primeira impressão real.

          Com o portal, a etiqueta é filha direta do <body> e o #root pode ser
          `display: none` no print — aí ele sai do layout de verdade e sobra
          só a etiqueta. */}
      {createPortal(
        <div className="etiqueta-print-area" aria-hidden="true">
          {itens.flatMap((item, idx) =>
            Array.from({ length: limitarCopias(item.quantidade) }, (_, c) => {
              const lote = loteDaCopia(item, c);
              return (
                <div key={`${idx}_${c}`} className="etiqueta-pagina"
                  style={{ width: `${config.larguraMm}mm`, height: `${config.alturaMm}mm` }}>
                  <EtiquetaLabel campos={camposDe(item, lote)} config={config}
                    qr={qrs[payloadDe(item, lote)]} estabelecimento={estabelecimento} />
                </div>
              );
            })
          )}
        </div>,
        document.body
      )}
    </>
  );
}
