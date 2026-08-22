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

const VARIANTES = {
  primario:  'bg-polo-navy text-polo-gold',
  // sobre fundo navy o primário se perde: inverte para dourado com texto navy
  sobreNavy: 'bg-polo-gold text-polo-navy',
  secundario: 'bg-white text-polo-navy border border-gray-300',
  perigo:    'bg-red-700 text-white',
};

const TAMANHOS = {
  // ação principal da tela — alvo grande, é o que a mão molhada procura
  md: 'py-4 rounded-xl text-base',
  // ação dentro de cartão ou linha de lista
  sm: 'min-h-11 px-4 rounded-lg text-sm',
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
        'font-bold transition-transform active:scale-[0.98]',
        'disabled:opacity-40 disabled:active:scale-100',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold',
        VARIANTES[variante] || VARIANTES.primario,
        TAMANHOS[tamanho] || TAMANHOS.md,
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
