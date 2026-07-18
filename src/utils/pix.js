// Gera o "Pix Copia e Cola" (BR Code / padrão EMV do Banco Central) a partir da
// chave Pix + nome + cidade + valor. A mesma string vira o QR (renderizado com a
// lib `qrcode`). Assim o cliente escaneia ou cola no banco com o valor já certo.
//
// ⚠️ Teste uma vez escaneando com o app do seu banco antes de confiar — um único
// caractere errado no padrão invalida o código.

// CRC16-CCITT (FALSE): polinômio 0x1021, início 0xFFFF, sem reflexão.
export function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Campo EMV: ID (2) + tamanho (2) + valor.
const tlv = (id, valor) => {
  const v = String(valor);
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
};

// Nome/cidade no BR Code: ASCII simples, sem acento, maiúsculo, com limite.
const limpaTexto = (s, max) =>
  (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, max).toUpperCase();

export function montarPixBRCode({ chave, nome, cidade = 'SAO PAULO', valor, txid = '***' } = {}) {
  if (!chave) return '';
  const merchantAccount = tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', chave));
  const valorTlv = (valor != null && valor !== '') ? tlv('54', Number(valor).toFixed(2)) : '';
  const adicional = tlv('62', tlv('05', limpaTexto(txid, 25) || '***'));
  const semCrc =
    tlv('00', '01') +               // formato
    tlv('01', '11') +               // estático (reutilizável)
    merchantAccount +
    tlv('52', '0000') +             // categoria
    tlv('53', '986') +              // moeda BRL
    valorTlv +
    tlv('58', 'BR') +               // país
    tlv('59', limpaTexto(nome, 25) || 'AURUM') +
    tlv('60', limpaTexto(cidade, 15) || 'SAO PAULO') +
    adicional +
    '6304';                         // id+len do CRC, que entra no cálculo
  return semCrc + crc16(semCrc);
}
