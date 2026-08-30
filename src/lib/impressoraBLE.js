// =====================================================================
//  Conversa direta com a impressora, por Bluetooth BLE
//
//  Confirmado na Tomate MDK-022: ela expõe BLE e aceita TSPL. Isso tira do
//  caminho o diálogo do navegador, o driver e a paginação — que é de onde
//  vieram todos os problemas de impressão. O que a gente manda é o que sai.
//
//  ⚠️ SÓ FUNCIONA NO CHROME DO ANDROID (e Chrome/Edge de desktop). O Safari
//  do iPhone não implementa Web Bluetooth, por decisão da Apple, e navegador
//  embutido em outro app (WhatsApp, Instagram) também não. Por isso isto é
//  sempre um CAMINHO A MAIS, nunca substituto do diálogo de impressão.
// =====================================================================

import { paraBytesLatin1 } from '../utils/tspl';

// Serviços que impressoras térmicas costumam expor. O Web Bluetooth só entrega
// um serviço DECLARADO aqui — descobrir depois de conectar não funciona, e o
// serviço certo ficaria de fora em silêncio. Mais barato pedir demais.
export const SERVICOS_IMPRESSORA = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ff80-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

export const bleDisponivel = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

/**
 * É celular ou tablet?
 *
 * ⚠️ Serve para ESCONDER BOTÃO, nunca para bloquear nada. Se errar, a pessoa
 * perde um caminho que não ia usar — não perde a impressão. Por isso pode ser
 * uma heurística: acertar sempre exigiria pedir permissão para coisas que o
 * navegador só entrega em troca de um aviso na cara do usuário.
 *
 * `userAgentData.mobile` é a resposta oficial e é o que o Chrome do Android
 * responde. O resto dos navegadores ainda não tem isso, então sobra o texto do
 * user agent — feio, mas é o que existe. iPad moderno se anuncia como Mac, daí
 * o teste de toque junto.
 */
export function ehCelular() {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.userAgentData?.mobile === 'boolean') return navigator.userAgentData.mobile;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPod|Windows Phone/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1; // iPadOS fingindo ser Mac
}

/**
 * Quais botões de impressão aparecem neste aparelho.
 *
 * ⚠️ UM BOTÃO POR APARELHO. Cada máquina tem um caminho que é claramente o
 * melhor dela, e mostrar os dois só faz a pessoa escolher errado no meio do
 * serviço:
 *
 *   computador  → só a janela de impressão. A fila do Windows manda a etiqueta
 *     como IMAGEM, com a fonte da tela: sai com traço mais cheio que a fonte
 *     interna da impressora. Foi comparado lado a lado no papel.
 *   celular COM bluetooth → só o direto. A janela do Android precisaria de um
 *     app de terceiro no meio e entrega etiqueta pior.
 *   celular SEM bluetooth → só a janela (iPhone, ou o app aberto dentro do
 *     WhatsApp). É a única saída que resta, e por isso ela volta.
 *
 * ⚠️ Isso desliga o Bluetooth no computador de propósito. Se um dia houver
 * computador sem fila configurada e com impressora só por Bluetooth, é aqui
 * que se resolve — não espalhado pela tela de impressão.
 */
export function caminhosDeImpressao() {
  if (!ehCelular()) return { direto: false, dialogo: true };
  const temBLE = bleDisponivel();
  return { direto: temBLE, dialogo: !temBLE };
}

// Conexão viva desta aba. Não vai para o cache: um `BluetoothDevice` não
// sobrevive a recarregar a página — o que sobrevive é a PERMISSÃO, que o
// Chrome guarda por site e devolve em getDevices().
let dispositivo = null;
let canal = null;

export const impressoraConectada = () => !!(dispositivo?.gatt?.connected && canal);
export const nomeImpressora = () => dispositivo?.name || '';

/** Acha a primeira característica que aceita escrita — é o canal de comandos. */
async function acharCanal(server) {
  const servicos = await server.getPrimaryServices();
  for (const s of servicos) {
    const chars = await s.getCharacteristics().catch(() => []);
    const c = chars.find(x => x.properties.write || x.properties.writeWithoutResponse);
    if (c) return c;
  }
  return null;
}

async function ligar(dev) {
  const server = await dev.gatt.connect();
  const c = await acharCanal(server);
  if (!c) throw new Error('Conectou, mas não achei por onde enviar os comandos.');
  dispositivo = dev;
  canal = c;
  // Se a impressora desligar ou sair de alcance, o estado tem que refletir —
  // senão o botão continua dizendo "conectada" e a impressão falha sem motivo
  // aparente.
  dev.addEventListener('gattserverdisconnected', () => { canal = null; });
  return dev;
}

/**
 * Escolher a impressora. PRECISA de um toque do usuário: o navegador só abre o
 * seletor de dispositivos a partir de um gesto real, nunca em código de fundo.
 */
export async function escolherImpressora() {
  if (!bleDisponivel()) throw new Error('Este navegador não fala Bluetooth. Use o Chrome do Android.');
  const dev = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: SERVICOS_IMPRESSORA,
  });
  return ligar(dev);
}

/**
 * Reconecta sem perguntar nada, se o navegador já tem permissão para esta
 * impressora. É o que evita o seletor aparecer a cada etiqueta.
 *
 * ⚠️ `getDevices()` não existe em todo navegador e pode falhar sem motivo —
 * daí o try/catch mudo. Falhar aqui não é erro: só significa que o usuário vai
 * precisar escolher a impressora uma vez.
 */
export async function reconectarSePuder() {
  if (impressoraConectada()) return dispositivo;
  if (!bleDisponivel() || !navigator.bluetooth.getDevices) return null;
  try {
    const conhecidos = await navigator.bluetooth.getDevices();
    if (!conhecidos?.length) return null;
    const alvo = dispositivo ? conhecidos.find(d => d.id === dispositivo.id) : conhecidos[0];
    if (!alvo) return null;
    return await ligar(alvo);
  } catch {
    return null;
  }
}

export function desconectar() {
  try { dispositivo?.gatt?.disconnect(); } catch { /* já caiu */ }
  dispositivo = null;
  canal = null;
}

/**
 * Envia os comandos TSPL.
 *
 * ⚠️ EM PEDAÇOS, e isto não é otimização — é o que faz funcionar. O BLE tem
 * MTU pequeno (20 a 512 bytes conforme o aparelho) e mandar tudo de uma vez
 * estoura em silêncio: a impressora recebe metade do comando e não imprime
 * nada, o que parece "não funcionou" sem ser. 100 bytes cabe em qualquer MTU.
 */
export async function enviarTSPL(comandos, aoProgredir) {
  if (!impressoraConectada()) {
    const voltou = await reconectarSePuder();
    if (!voltou || !canal) throw new Error('Impressora não está conectada.');
  }
  const bytes = paraBytesLatin1(comandos);
  const pedaco = 100;
  for (let i = 0; i < bytes.length; i += pedaco) {
    const parte = bytes.slice(i, i + pedaco);
    if (canal.properties.writeWithoutResponse) await canal.writeValueWithoutResponse(parte);
    else await canal.writeValue(parte);
    // Respiro entre pedaços: sem ele a fila do firmware satura e ele começa a
    // descartar pacote, o que sai como etiqueta cortada pela metade.
    await new Promise(r => setTimeout(r, 30));
    aoProgredir?.(Math.min(i + pedaco, bytes.length), bytes.length);
  }
  return bytes.length;
}
