// O WhatsApp do suporte Aurum num lugar só (28/09/2026). Três telas diziam
// "peça pelo WhatsApp do suporte" sem link nem número — o cliente tinha de
// procurar o contato por conta própria no meio de um problema.
export const WHATSAPP_SUPORTE = '5581998184489';

/** Link do WhatsApp do suporte com a mensagem já escrita. */
export const linkSuporte = (texto = '') =>
  `https://wa.me/${WHATSAPP_SUPORTE}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
