// =====================================================================
//  Aviso — a caixinha de recado que o leitor de tela ANUNCIA
//
//  ⚠️ POR QUE EXISTE. Dentro dos modais havia cinco mensagens que apareciam e
//  sumiam em silêncio absoluto para quem usa leitor de tela: o erro de
//  Bluetooth, o "escolha quem assina", o alerta de validade que passa da do
//  fornecedor, o "não cabe no papel" e o aviso de item sem prazo. Em todo o
//  projeto existiam DOIS anúncios (o aviso flutuante e um erro do login), e
//  nenhum nas telas de etiqueta — que são o produto.
//
//  O caso do Bluetooth é o que mais dói na bancada: a pessoa toca em conectar,
//  a impressora está longe, o texto aparece sem som nenhum e ela fica tocando
//  de novo sem saber por quê.
//
//  ⚠️ DOIS NÍVEIS, e a diferença importa:
//   • tom="erro"  → role="alert" (assertivo). Interrompe o que estiver sendo
//     lido. Só para consequência de uma AÇÃO que a pessoa acabou de tomar —
//     tocar em imprimir e a impressora recusar.
//   • tom="atencao"/"neutro" → role="status" (educado). Entra na fila e é lido
//     quando o leitor terminar a frase atual. É o certo para aviso que nasce
//     do PREENCHIMENTO: o de prazo aparece e some a cada tecla digitada no
//     campo de dias, e em assertivo picotaria a leitura do próprio campo.
// =====================================================================

const TOM = {
  erro:    'text-red-700 bg-red-50 border-red-200',
  atencao: 'text-amber-800 bg-amber-50 border-amber-200',
  neutro:  'text-gray-600 bg-gray-50 border-gray-200',
};

export default function Aviso({ tom = 'atencao', className = '', children }) {
  const assertivo = tom === 'erro';
  return (
    <p
      role={assertivo ? 'alert' : 'status'}
      aria-live={assertivo ? 'assertive' : 'polite'}
      className={`text-[11px] font-semibold border rounded-lg px-2.5 py-2 ${TOM[tom] || TOM.atencao} ${className}`}>
      {children}
    </p>
  );
}
