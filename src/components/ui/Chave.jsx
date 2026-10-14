// =====================================================================
//  CHAVE LIGA/DESLIGA. Lote 7 da auditoria (14/10/2026): eram seis cópias,
//  duas sem nome nem `role="switch"` (o leitor de tela lia "botão", sem dizer
//  o quê nem se estava ligado), e o trilho desligado (cinza-claro) sumia no
//  branco do cartão. Uma peça: alvo de 44 px, nome, estado, trilho com
//  contraste nos dois estados.
//
//  aoTrocar recebe o NOVO valor (true/false).
//  O nome vem de `rotulo` (aria-label) ou, quando o texto já está na tela ao
//  lado, de `rotuladoPor` (o id desse texto, vira aria-labelledby).
// =====================================================================
export default function Chave({ ligada, aoTrocar, rotulo, rotuladoPor, cor = 'verde', desativada = false }) {
  const corLigada = cor === 'laranja' ? 'bg-orange-600' : 'bg-green-600';
  return (
    <button type="button" role="switch" aria-checked={!!ligada} aria-label={rotulo} aria-labelledby={rotuladoPor} disabled={desativada}
      onClick={() => aoTrocar(!ligada)}
      className="relative w-14 h-11 flex items-center justify-center flex-shrink-0 disabled:opacity-50">
      <span aria-hidden="true" className={`w-12 h-6 rounded-full transition-colors relative ${ligada ? corLigada : 'bg-gray-500'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${ligada ? 'left-6' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
