// Botão único do app.
//
// ⚠️ Por que existe: o botão "salvar" de largura total existia em SETE
// formatos diferentes (py-4/py-3.5/py-3/py-2.5/py-2, rounded-xl/rounded-lg,
// text-base/text-sm/text-xs/sem tamanho), e o estado desabilitado em três
// opacidades (40/50/60). Nenhum arquivo compartilhava classe. Isso é o que faz
// um app parecer amador mesmo quando cada tela isolada está ok.
//
// A ação de gravar também aparecia em três CORES: navy/dourado em seis telas,
// âmbar e vermelho em Aparas. É o mesmo gesto, no mesmo lugar, com o mesmo
// rótulo — a cor não pode mudar. Vermelho fica reservado para DESTRUIR
// (remover lançamento, revogar acesso, apagar conta).
//
// ⚠️ MAIOR DESDE 23/11/2026 (jeito do Magurō, pedido do dono: "os botões são
// maiores"). 56 px na ação da tela, 48 px dentro de cartão, 64 px na ação
// principal da janela de imprimir.

// ⚠️ REDESIGN (25/11/2026): `contorno` (o "Cancelar" das janelas) e
// `perigoContorno` (o "Descartar" da lista: o bloco vinho cheio parecia
// desligado). Desligado vira bege escuro com texto legível, e quem usa diz no
// próprio texto o que falta ("Informe a quantidade para registrar").
const VARIANTES = {
  primario:  'bg-polo-navy text-polo-gold',
  // sobre fundo navy o primário se perde: inverte para dourado com texto navy
  sobreNavy: 'bg-polo-gold text-polo-navy',
  secundario: 'bg-white text-polo-navy border-2 border-polo-linha',
  contorno: 'bg-white text-polo-navy border-2 border-polo-navy',
  perigo:    'bg-perigo text-white',
  perigoContorno: 'bg-white text-perigo border-2 border-perigo',
};

const TAMANHOS = {
  // ação principal da tela — alvo grande, é o que a mão molhada procura
  md: 'min-h-14 px-5 py-2 rounded-2xl text-lg',
  // ação dentro de cartão ou linha de lista
  sm: 'min-h-12 px-4 py-1.5 rounded-xl text-sm',
  // a ação principal de uma janela (Imprimir): 72 px; no celular, 56 px para
  // a janela caber sem rolar (regra do dono)
  lg: 'min-h-14 sm:min-h-[4.5rem] px-6 py-2 rounded-2xl text-xl',
};

export default function Botao({
  variante = 'primario',
  tamanho = 'md',
  largura = 'cheia',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      {...props}
      className={[
        largura === 'cheia' ? 'w-full' : '',
        'inline-flex items-center justify-center gap-2 text-center leading-tight',
        'font-bold transition-transform active:scale-[0.98]',
        'disabled:bg-polo-desligado disabled:text-polo-desligado-tinta disabled:border-transparent disabled:active:scale-100',
        '',
        VARIANTES[variante] || VARIANTES.primario,
        TAMANHOS[tamanho] || TAMANHOS.md,
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
