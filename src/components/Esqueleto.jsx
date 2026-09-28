/**
 * Linhas cinza piscando enquanto a primeira leitura da nuvem não chega.
 *
 * ⚠️ "CARREGANDO" NÃO É "VAZIO" (28/09/2026): num aparelho recém-entrado a
 * lista mostrava "Você ainda não tem itens" e o botão de cadastrar por alguns
 * segundos — o cozinheiro achava que tinha perdido tudo.
 */
export default function Esqueleto({ linhas = 5, rotulo = 'Carregando' }) {
  return (
    <div role="status" aria-label={rotulo} className="p-3 space-y-2">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
      ))}
    </div>
  );
}
