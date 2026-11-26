import Icon from './Icons';
import { useMicrofone } from './useMicrofone';
import { vozDisponivel, acharPorVoz, itemCerto } from '../utils/voz';

/**
 * O MICROFONE DA BUSCA (pedido do dono, 04/11/2026) — ver utils/voz.js.
 *
 * Envolve o campo de busca (`children`) e põe o microfone ao lado. A pessoa
 * toca e fala UMA frase; o navegador para sozinho quando ela termina (ou num
 * toque no microfone).
 *  • um item só combinou → a impressão já abre, com a quantidade e o método
 *    falados ("três etiquetas de frango desfiado congelado");
 *  • vários → a lista filtra, e o que foi falado vale para o item que ela tocar;
 *  • só parecidos → "Você quis dizer", com o botão de cada um;
 *  • nada → diz o que ouviu, para ela falar de novo ou digitar.
 * O que foi ouvido fica escrito ("Ouvi: …"): quando algo não sai como falado,
 * dá para ver o que chegou do celular.
 *
 * O aviso abaixo da busca é da TELA (`aviso` / `aoAvisar`): quem abre a
 * impressão também avisa por ali quando o item não tem o método falado.
 *
 * ⚠️ Navegador sem reconhecimento de fala (Firefox, o navegador de dentro do
 * WhatsApp): o microfone nem aparece — um botão que não funciona é pior que
 * nenhum.
 */
// A tela de DESPERDÍCIO (24/11/2026) usa a mesma busca com o seu jeito de
// entender a fala: `interpretar(alternativas)` devolve { termo, falado,
// achados, ...o pedido } (ver utils/vozDoDescarte.js); `descreverPedido`
// resume o pedido no aviso ("10 g, Vencido"). O pedido é tudo o que veio
// além do item — o que `aoImprimir` e `aoBuscar` recebem.
const pedidoDasEtiquetas = (r) => [r.quantidade && `${r.quantidade} etiquetas`, r.metodoFalado].filter(Boolean).join(', ');

// `opcaoForaDaLista(falado, pedido)`: o desperdício registra também o item
// que não está na lista — o botão aparece quando nada (ou só parecido) casou.
export default function BuscaPorVoz({
  produtos, vocabulario, aviso, aoAvisar, aoBuscar, aoImprimir, children,
  interpretar = null,
  descreverPedido = pedidoDasEtiquetas,
  opcaoForaDaLista = null,
  dicaOuvindo = 'Ouvindo… fale o item, quantas etiquetas e o método.',
}) {
  const resolver = (alternativas) => {
    const ouvi = `Ouvi: "${alternativas[0]}".`;
    const r = interpretar ? interpretar(alternativas) : acharPorVoz(alternativas, produtos, vocabulario);
    const { achados = [], termo = '', falado: dito = '', ...pedido } = r;
    const certo = itemCerto(achados);
    if (certo) {
      // fica escrito o que foi ouvido: ao fechar a janela, dá para conferir
      aoAvisar({ texto: ouvi });
      aoImprimir(certo, pedido);
      return;
    }
    // o que a pessoa falou, com acento ("filé"); a busca ignora acento
    const falado = dito || termo || alternativas[0] || '';
    const extras = descreverPedido(r);
    if (achados.some(a => a.nota >= 80)) {
      const n = achados.filter(a => a.nota >= 80).length;
      aoBuscar(falado, pedido);
      aoAvisar({ texto: `${ouvi} ${n} itens com "${falado}". Toque no certo${extras ? ` (${extras})` : ''}.` });
      return;
    }
    const fora = opcaoForaDaLista && dito ? [opcaoForaDaLista(dito, pedido)] : [];
    if (achados.length) {
      aoAvisar({
        texto: `${ouvi} Não achei "${falado}". Você quis dizer:`,
        opcoes: [...achados.slice(0, 3).map(a => ({ rotulo: a.produto.nome, acao: () => aoImprimir(a.produto, pedido) })), ...fora],
      });
      return;
    }
    aoAvisar(fora.length
      ? { texto: `${ouvi} Não achei "${falado}" na lista.`, opcoes: fora }
      : { texto: `${ouvi} Não achei "${falado}". Toque no microfone e fale de novo, ou digite.` });
  };

  const { ouvindo, parcial, ouvir } = useMicrofone({
    aoOuvir: resolver,
    aoAvisar: (texto) => aoAvisar(texto ? { texto } : null),
  });

  if (!vozDisponivel()) return children;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        {/* jeito do Magurō (23/11/2026): o microfone grande e dourado; vermelho
            enquanto ouve */}
        <button type="button" onClick={ouvir}
          aria-label={ouvindo ? 'Parar de ouvir' : 'Buscar falando'} aria-pressed={ouvindo}
          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors
            ${ouvindo ? 'bg-red-700 text-white animate-pulse' : 'bg-polo-gold text-polo-navy'}`}>
          <Icon name="microfone" size={26} />
        </button>
      </div>
      {(ouvindo || aviso) && (
        <div role="status" className="text-base text-gray-700 bg-white border-[3px] border-polo-navy/15 rounded-2xl px-4 py-3 space-y-2">
          {ouvindo
            ? <p>{parcial ? <>Ouvindo: <strong className="text-polo-navy">{parcial}</strong></> : dicaOuvindo}</p>
            : <p>{aviso.texto}</p>}
          {!ouvindo && aviso?.opcoes?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {aviso.opcoes.map((o, i) => (
                <button key={`${i}-${o.rotulo}`} type="button" onClick={() => { aoAvisar(null); o.acao(); }}
                  className="min-h-12 px-4 rounded-xl bg-polo-navy text-polo-gold text-base font-bold">
                  {o.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
