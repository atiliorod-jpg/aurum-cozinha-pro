import { useEffect, useRef, useId } from 'react';
import Icon from './Icons';

// =====================================================================
//  Dialogo — a casca única de TODO modal do app
//
//  ⚠️ POR QUE ESTE ARQUIVO EXISTE. Havia oito modais escritos à mão, todos
//  dizendo `role="dialog" aria-modal="true"` — o que faz o leitor de tela
//  ESCONDER o resto da página — e nenhum deles levava o foco para dentro.
//  A pessoa ficava com o foco parado num botão que a tecnologia assistiva já
//  não enxergava, e o leitor anunciava o vazio. No teclado dava no mesmo por
//  outro caminho: abrir a etiqueta e apertar Tab levava ao botão do próximo
//  produto da lista, atrás do fundo escuro, e um Enter ali abria outro modal
//  por cima do primeiro.
//
//  Não existia UM `.focus()` em todo o `src/`. Corrigir os oito no lugar
//  resolveria a auditoria de hoje e o nono nasceria com o mesmo defeito — por
//  isso a casca é um componente, e não uma receita repetida.
//
//  O que ela garante, e nenhum modal precisa repetir:
//   • o foco ENTRA no diálogo ao abrir (respeitando o autoFocus de quem tem)
//   • Tab e Shift+Tab circulam DENTRO dele, nunca no que está atrás
//   • Escape fecha (WCAG 2.1.2)
//   • ao fechar, o foco VOLTA para quem abriu — antes ele caía no topo da
//     página e a pessoa recomeçava a navegação do zero
//   • o × tem 44px de alvo, igual em todos (três tamanhos diferentes antes)
//
//  ⚠️ JEITO DO MAGURŌ DESDE 23/11/2026: o título mora numa FAIXA NAVY de
//  ponta a ponta, em Montserrat maiúsculo, com o × de 48 px — a pessoa vê
//  de longe que janela está aberta. A confirmação (cabecalho={false})
//  continua sem faixa: lá o título muda de cor quando a ação destrói algo.
// =====================================================================

// ⚠️ Classes INTEIRAS num mapa, nunca montadas por interpolação: o Tailwind
// lê o código-fonte para decidir o que gera, e `z-[${n}]` viraria uma classe
// que não existe no CSS final — o modal abriria atrás do cabeçalho.
const CAMADA = {
  60:  'z-[60]',
  70:  'z-[70]',
  110: 'z-[110]',
  120: 'z-[120]',
  130: 'z-[130]',
  // ⚠️ A CONFIRMAÇÃO É SEMPRE A DE CIMA. Ela estava na 110, abaixo do modal de
  // impressão (120) e do seletor de área (130): um `confirm()` aberto de
  // dentro de um deles renderizava ATRÁS, invisível, e o app parecia travado
  // esperando uma resposta que ninguém conseguia ver. Perguntar é, por
  // natureza, a última coisa na pilha.
  140: 'z-[140]',
};

const LARGURA = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

// As quatro formas que os modais de hoje já tinham. Desde 23/11/2026, com o
// fundo navy e os cantos mais redondos do Magurō.
const FORMA = {
  // ficha de cadastro: rola a página inteira, cartão centrado
  ficha: {
    fundo: 'fixed inset-0 bg-polo-navy/60 overflow-y-auto overscroll-contain p-4 flex print:hidden',
    caixa: 'bg-white w-full m-auto rounded-3xl shadow-2xl',
  },
  // folha que sobe pela borda de baixo no celular e centra no tablet
  folha: {
    fundo: 'fixed inset-0 bg-polo-navy/50 flex items-end sm:items-center justify-center p-3 print:hidden',
    caixa: 'bg-white text-gray-900 rounded-3xl shadow-2xl w-full max-h-[90vh] overflow-y-auto',
  },
  // caixa curta, sempre no meio da tela
  caixa: {
    fundo: 'fixed inset-0 bg-polo-navy/60 flex items-center justify-center p-4 print:hidden',
    caixa: 'bg-white rounded-3xl shadow-2xl w-full',
  },
  // lista comprida (etiquetas): cartão no topo, com folga em cima e embaixo.
  // ⚠️ No celular a janela encosta embaixo e tem 8 px de folga em cima (eram
  // 48 em cima e 48 embaixo); no computador, 32: a janela de imprimir cabe
  // inteira na tela sem rolar (pedido do dono, 23/11/2026). O rodapé fixo
  // dela compensa o padding de baixo (`bottom-0 sm:-bottom-4`).
  rolo: {
    fundo: 'fixed inset-0 bg-polo-navy/60 overflow-y-auto px-2 pt-2 pb-0 sm:p-4 print:hidden',
    caixa: 'bg-white rounded-3xl shadow-2xl w-full mx-auto my-0 sm:my-4',
  },
};

const RESPIRO = { p5: 'p-5', p6: 'p-6' };
// A faixa do título vai de ponta a ponta: desfaz o respiro do cartão. A
// margem de baixo se junta (não soma) com o espaço do `space-y` de quem usa.
const FAIXA = {
  p5: '-mx-5 -mt-5 mb-4 px-5',
  p6: '-mx-6 -mt-6 mb-5 px-6',
};
// ⚠️ A FAIXA BAIXA (23/11/2026): a janela de imprimir precisa caber inteira
// na tela do celular, sem rolar — ali cada 4 px contam. Mesma cara, 60 px
// em vez de 76, e o × com 44 px (o mínimo de toque do app).
const FAIXA_COMPACTA = {
  p5: '-mx-5 -mt-5 mb-3 px-5',
  p6: '-mx-6 -mt-6 mb-4 px-6',
};

// Só o que a pessoa consegue alcançar com Tab. `offsetParent` de fora derruba
// o que está com display:none — um <details> fechado, por exemplo, cujo
// conteúdo entraria na conta e faria o Tab parecer travado.
const ALCANCAVEL = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focaveis(raiz) {
  if (!raiz) return [];
  return Array.from(raiz.querySelectorAll(ALCANCAVEL))
    .filter(el => el.offsetParent !== null || el === document.activeElement);
}

/**
 * @param {object}   props
 * @param {Function} props.aoFechar        chamado no Escape, no × e no clique do fundo
 * @param {string}   [props.titulo]        título visível; vira o nome do diálogo
 * @param {string}   [props.rotulo]        nome do diálogo quando não há título visível
 * @param {'ficha'|'folha'|'caixa'|'rolo'} [props.forma]
 * @param {'sm'|'md'|'lg'} [props.largura]
 * @param {number}   [props.camada]        z-index (ver CAMADA)
 * @param {boolean}  [props.fecharNoFundo] clicar fora fecha (padrão: sim)
 * @param {boolean}  [props.cabecalho]     desenha título + × (padrão: sim)
 * @param {'p5'|'p6'} [props.respiro]
 * @param {string}   [props.classeCaixa]   extras do cartão (espaçamento interno)
 * @param {boolean}  [props.faixaCompacta] faixa do título mais baixa (janela de imprimir)
 */
export default function Dialogo({
  aoFechar,
  titulo,
  rotulo,
  forma = 'ficha',
  largura = 'lg',
  camada = 70,
  fecharNoFundo = true,
  cabecalho = true,
  respiro = 'p6',
  classeCaixa = '',
  faixaCompacta = false,
  children,
}) {
  const painel = useRef(null);
  const tituloId = useId();
  // ⚠️ QUEM ABRIU É LIDO NO RENDER, NÃO NO EFEITO — e isto foi um bug de
  // verdade, pego no navegador. O `autoFocus` do React é aplicado no COMMIT,
  // que acontece antes de qualquer useEffect: quando o efeito rodava, o foco
  // já estava no campo Nome DE DENTRO do modal, e era esse campo que eu
  // guardava como "quem abriu". Ao fechar, eu devolvia o foco para um nó já
  // arrancado da página — que é exatamente o defeito que este componente
  // existe para corrigir (o foco caía no topo).
  // No primeiro render o commit ainda não ocorreu, então aqui o
  // `document.activeElement` é mesmo o botão que a pessoa tocou. A guarda
  // `undefined` mantém o valor nos renders seguintes (e no render duplo do
  // StrictMode).
  const veioDe = useRef(undefined);
  if (veioDe.current === undefined) {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    // body não é destino de foco — vira no-op e evita guardar lixo
    veioDe.current = a && a !== document.body ? a : null;
  }

  // Efeito ÚNICO, com lista de dependências vazia de propósito: entrar,
  // prender e devolver o foco são as três pontas do MESMO ciclo de vida. Se
  // a devolução morasse noutro efeito, uma mudança de prop no meio do caminho
  // a faria disparar com o diálogo ainda aberto.
  useEffect(() => {
    // ⚠️ MEDIDO NO NAVEGADOR, não suposto: o `autoFocus` que esses modais
    // declaram NÃO está chegando ao DOM (o atributo nem é renderizado, e o
    // foco não se move). Ou seja, o "Cancelar" do modal de confirmar nunca
    // recebeu foco sozinho, apesar do comentário que dizia o contrário. Quem
    // garante isso agora é a linha abaixo — e ela dá no mesmo resultado, já
    // que o Cancelar é o primeiro alcançável daquele painel.
    // A checagem `contains` fica de guarda: se algum dia o autoFocus voltar a
    // funcionar, o campo escolhido por ele vence e nós não competimos.
    if (!painel.current?.contains(document.activeElement)) {
      const primeiro = focaveis(painel.current)[0];
      (primeiro || painel.current)?.focus();
    }

    const naTecla = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); aoFechar?.(); return; }
      if (e.key !== 'Tab') return;
      const lista = focaveis(painel.current);
      if (lista.length === 0) { e.preventDefault(); painel.current?.focus(); return; }
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const atual = document.activeElement;
      // Fora do painel (aconteceu, por exemplo, quando o foco estava no <body>):
      // a próxima parada é a primeira coisa do diálogo, não o que está atrás.
      if (!painel.current.contains(atual)) { e.preventDefault(); primeiro.focus(); return; }
      if (e.shiftKey && atual === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && atual === ultimo) { e.preventDefault(); primeiro.focus(); }
    };

    // Na fase de CAPTURA: dois diálogos empilhados (a ficha do item abre um
    // confirmar por cima) receberiam o Escape nos dois ouvintes e fechariam
    // os dois de uma vez. O de cima captura primeiro e corta a propagação.
    document.addEventListener('keydown', naTecla, true);
    return () => {
      document.removeEventListener('keydown', naTecla, true);
      // Só devolve o foco se o elemento ainda existir: quem abriu pode ter
      // sido removido da tela pela própria ação (apagar um item, por exemplo),
      // e focar um nó órfão joga o foco no <body> — de novo o topo da página.
      const alvo = veioDe.current;
      if (alvo && typeof alvo.focus === 'function' && document.contains(alvo)) {
        alvo.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const f = FORMA[forma] || FORMA.ficha;
  const nome = titulo
    ? { 'aria-labelledby': tituloId }
    : { 'aria-label': rotulo || 'Diálogo' };

  return (
    <div
      className={`${f.fundo} ${CAMADA[camada] || CAMADA[70]}`}
      onClick={fecharNoFundo ? (e) => { if (e.target === e.currentTarget) aoFechar?.(); } : undefined}>
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        {...nome}
        tabIndex={-1}
        className={`${f.caixa} ${LARGURA[largura]} ${RESPIRO[respiro]} focus:outline-none ${classeCaixa}`}>
        {cabecalho && (
          <div className={`${(faixaCompacta ? FAIXA_COMPACTA : FAIXA)[respiro] || FAIXA.p6} ${faixaCompacta ? 'py-2' : 'py-3.5'} bg-polo-navy text-white rounded-t-3xl flex items-center justify-between gap-3`}>
            <h2 id={tituloId} className="font-titulo font-extrabold text-lg sm:text-xl uppercase tracking-wide leading-tight break-words min-w-0">
              {titulo}
            </h2>
            {/* ⚠️ 48px de alvo, igual em todos. Os oito modais tinham três
                tamanhos diferentes de ×, e o da tela de impressão — a mais
                usada de todas — era o menor deles. */}
            <button type="button" onClick={aoFechar} aria-label="Fechar"
              className={`${faixaCompacta ? 'w-11 h-11' : 'w-12 h-12'} rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center flex-shrink-0 transition-colors`}>
              <Icon name="fechar" size={24} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
