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
  // `semBluetooth` é o aviso "abra no Chrome" — e ele SÓ vale no celular. No
  // computador o Bluetooth está desligado de propósito, então dizer que o
  // navegador "não conecta na impressora" seria mentira e mandaria a pessoa
  // procurar defeito onde não tem.
  if (!ehCelular()) return { direto: false, dialogo: true, semBluetooth: false };
  const temBLE = bleDisponivel();
  return { direto: temBLE, dialogo: !temBLE, semBluetooth: !temBLE };
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
  if (!c) throw erroPT('Conectou, mas não achei por onde enviar os comandos.');
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
  if (!bleDisponivel()) throw erroPT('Este navegador não fala Bluetooth. Use o Chrome do Android.');
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

// ⚠️ ERRO NOSSO, JÁ EM PORTUGUÊS — e a marca importa. O tradutor de mensagens
// da tela (`erroEmPortugues`) só reconhece os textos que o NAVEGADOR produz;
// um erro nosso caía no fim da lista e era embrulhado em "Não deu para
// imprimir… (texto)", repetindo a explicação dentro de parênteses. Com a
// marca, a tela mostra a frase como ela foi escrita.
function erroPT(mensagem) {
  const e = new Error(mensagem);
  e.emPortugues = true;
  return e;
}

export const ERRO_CONEXAO_PERDIDA = 'Perdeu a conexão com a impressora no meio do envio. Confira se ela está ligada e por perto, e mande de novo.';

/**
 * Como falar com ESTA característica: modo de escrita, tamanho do pedaço e
 * respiro entre eles.
 *
 * ⚠️ O PEDAÇO DE 100 BYTES ERA UM CHUTE, e o comentário antigo afirmava que
 * "cabe em qualquer MTU". Não cabe: o mínimo garantido pelo ATT é 23 bytes de
 * MTU, ou seja **20 bytes de carga**. E no modo sem confirmação
 * (`writeValueWithoutResponse`) o que passa do limite é descartado EM
 * SILÊNCIO — nenhum erro, nenhuma exceção, a etiqueta sai pela metade ou não
 * sai. Na MDK-022 funciona porque o Android negocia um MTU grande; num tablet
 * onde essa negociação não subir, quebra. Só apareceria no segundo cliente,
 * com outro aparelho.
 *
 * ⚠️ E NÃO DÁ PARA "LER O LIMITE NEGOCIADO": o Web Bluetooth não expõe o MTU.
 * Como não dá para saber, não se chuta — escolhe-se o modo que é correto em
 * QUALQUER MTU:
 *
 *   • com confirmação (`writeValue`) → o ATT parte o valor sozinho (long
 *     write) e confirma cada pedaço. Seguro em qualquer tamanho, e a própria
 *     confirmação já segura o ritmo: não precisa de respiro artificial.
 *   • só sem confirmação → 20 bytes, o único tamanho que cabe garantido, e o
 *     respiro volta porque aqui não há confirmação nenhuma segurando a fila.
 *
 * Função PURA para poder ser testada sem impressora.
 */
export function planoDeEnvio(propriedades) {
  const p = propriedades || {};
  if (p.write) return { modo: 'comConfirmacao', pedaco: 100, respiroMs: 0 };
  if (p.writeWithoutResponse) return { modo: 'semConfirmacao', pedaco: 20, respiroMs: 30 };
  return null;
}

/**
 * Envia os comandos TSPL.
 *
 * ⚠️ EM PEDAÇOS, e isto não é otimização — é o que faz funcionar. Mandar tudo
 * de uma vez estoura em silêncio: a impressora recebe metade do comando e não
 * imprime nada, o que parece "não funcionou" sem ser. O tamanho de cada pedaço
 * sai de `planoDeEnvio`, não de um número cravado.
 *
 * ⚠️ A CONEXÃO É CONFERIDA A CADA PEDAÇO, e isto conserta um erro em INGLÊS na
 * cara do cozinheiro. `gattserverdisconnected` zera `canal`; se a impressora
 * desligasse ou saísse de alcance no meio do laço, a linha seguinte lia
 * `canal.properties` com `canal` já nulo e o que chegava na tela era
 * "Cannot read properties of null" — inglês de programador no meio do serviço,
 * e nem o tradutor de mensagens reconhecia. Agora o erro nasce em português.
 *
 * `aoProgredir(bytesEnviados, bytesTotal)` é opcional.
 */
export async function enviarTSPL(comandos, aoProgredir) {
  if (!impressoraConectada()) {
    const voltou = await reconectarSePuder();
    if (!voltou || !canal) throw erroPT('Impressora não está conectada.');
  }
  const plano = planoDeEnvio(canal.properties);
  if (!plano) throw erroPT('Conectou, mas não achei por onde enviar os comandos.');

  const bytes = paraBytesLatin1(comandos);
  for (let i = 0; i < bytes.length; i += plano.pedaco) {
    // ⚠️ Relê `canal` a cada volta: o ouvinte de desconexão pode tê-lo zerado
    // desde o pedaço anterior.
    const c = canal;
    if (!c || !dispositivo?.gatt?.connected) throw erroPT(ERRO_CONEXAO_PERDIDA);

    const parte = bytes.slice(i, i + plano.pedaco);
    if (plano.modo === 'comConfirmacao') await c.writeValue(parte);
    else await c.writeValueWithoutResponse(parte);

    // Respiro entre pedaços só onde não há confirmação: sem ele a fila do
    // firmware satura e começa a descartar pacote, o que sai como etiqueta
    // cortada pela metade.
    if (plano.respiroMs) await new Promise(r => setTimeout(r, plano.respiroMs));
    aoProgredir?.(Math.min(i + plano.pedaco, bytes.length), bytes.length);
  }
  return bytes.length;
}
