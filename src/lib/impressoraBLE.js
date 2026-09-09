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
// ⚠️ A ORDEM IMPORTA. `getPrimaryServices()` devolve os serviços na ordem que o
// Bluetooth do aparelho quiser — não há ordem definida. Uma impressora que
// exponha DOIS serviços graváveis (o de impressão e um de configuração/OTA,
// combinação comum) pode entregar um em cada celular, e o app escolhia o
// primeiro que aparecesse. Quando cai no errado, ele conecta, envia, e NADA
// sai — sem erro nenhum. Por isso a busca agora percorre esta lista NA ORDEM
// (ver `acharCanal`), e a varredura livre virou último recurso.
export const SERVICOS_IMPRESSORA = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ff80-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  // Nordic UART — o serviço mais comum nos módulos BLE genéricos que as
  // fábricas de impressora térmica compram prontos. Faltava na lista, e o que
  // não está declarado aqui o Web Bluetooth NÃO entrega depois de conectar:
  // ficaria de fora em silêncio.
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
];

// Dentro de um serviço pode haver mais de uma característica gravável — e de
// novo a ordem não é definida. Estas são as de ESCRITA conhecidas de cada
// serviço acima; quando uma delas aparece, ela ganha de qualquer outra.
const CARACTERISTICAS_PREFERIDAS = [
  '00002af1-0000-1000-8000-00805f9b34fb', // 18f0
  '0000ff02-0000-1000-8000-00805f9b34fb', // ff00
  '0000ffe1-0000-1000-8000-00805f9b34fb', // ffe0
  '49535343-8841-43f4-a8d4-ecbe34729bb3', // Microchip/ISSC
  '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART RX
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
 * É iPhone/iPad?
 *
 * ⚠️ Serve só para ESCOLHER O TEXTO do aviso, e existe porque o conselho
 * errado é pior que nenhum. No iOS **todo** navegador é obrigado a usar o
 * WebKit — inclusive o Chrome —, e o WebKit não implementa Web Bluetooth.
 * Mandar um dono de iPhone "abrir no Chrome" o faz baixar um app que dá
 * exatamente no mesmo, e procurar defeito no aparelho dele.
 */
export function ehIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
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

// ── Nada pode travar a tela ────────────────────────────────────
//
// ⚠️ `gatt.connect()` NÃO TEM TEMPO LIMITE, e isso é de propósito na
// plataforma: se o aparelho não está por perto, a chamada espera até ele
// aparecer. Não resolve, não rejeita, não lança — então `try/catch` não pega e
// o `await` nunca volta.
//
// Foi exatamente esse o defeito relatado: no celular que JÁ TINHA permissão
// salva, tocar em imprimir entrava no reconectar silencioso, pendurava no
// connect de uma impressora desligada, e o seletor de dispositivos nunca
// chegava a abrir — a tela ficava carregando para sempre. Nos celulares sem
// permissão salva a lista vinha vazia, o reconectar desistia na hora e tudo
// funcionava. Ou seja: o bug só aparecia DEPOIS da primeira tentativa, o que
// o esconderia da demonstração e o entregaria ao cliente.
//
// Abortar um connect pendente não tem API própria: o que funciona é chamar
// `disconnect()` no mesmo dispositivo.
export const LIMITE_CONEXAO_MS = 4000;
export const LIMITE_CANAL_MS = 5000;

export const ERRO_CONEXAO_DEMOROU =
  'A impressora não respondeu. Confira se ela está ligada, por perto, e se não ficou presa em outro celular.';

function comLimite(promessa, ms, aoEstourar, mensagem) {
  let id;
  const limite = new Promise((_, rejeitar) => {
    id = setTimeout(() => {
      // Melhor esforço: se abortar falhar, o tempo limite vale do mesmo jeito.
      try { aoEstourar?.(); } catch { /* já caiu */ }
      rejeitar(erroPT(mensagem));
    }, ms);
  });
  // ⚠️ `Promise.race` não cancela a perdedora — ela continua pendurada. Quem
  // corta de verdade é o `aoEstourar` acima; o race só devolve a tela.
  return Promise.race([promessa, limite]).finally(() => clearTimeout(id));
}

/**
 * A característica de escrita de um serviço.
 *
 * PURA de propósito (recebe a lista pronta), para ter teste sem impressora.
 * Preferida primeiro; qualquer gravável depois.
 */
export function escolherCaracteristica(chars) {
  const lista = (chars || []).filter(c => c?.properties?.write || c?.properties?.writeWithoutResponse);
  if (!lista.length) return null;
  const preferida = lista.find(c => CARACTERISTICAS_PREFERIDAS.includes(String(c.uuid || '').toLowerCase()));
  return preferida || lista[0];
}

/** Acha o canal de comandos: primeiro na ordem conhecida, depois varrendo. */
async function acharCanal(server) {
  for (const uuid of SERVICOS_IMPRESSORA) {
    const s = await server.getPrimaryService(uuid).catch(() => null);
    if (!s) continue;
    const c = escolherCaracteristica(await s.getCharacteristics().catch(() => []));
    if (c) return c;
  }
  // Último recurso: a impressora expõe um serviço que não está na lista.
  const servicos = await server.getPrimaryServices().catch(() => []);
  for (const s of servicos) {
    const c = escolherCaracteristica(await s.getCharacteristics().catch(() => []));
    if (c) return c;
  }
  return null;
}

async function ligar(dev) {
  const cortar = () => { try { dev.gatt.disconnect(); } catch { /* já caiu */ } };
  const server = await comLimite(dev.gatt.connect(), LIMITE_CONEXAO_MS, cortar, ERRO_CONEXAO_DEMOROU);
  // ⚠️ O mesmo tratamento vale aqui: `getPrimaryService` também pendura sem
  // resolver quando a conexão fica pela metade.
  const c = await comLimite(acharCanal(server), LIMITE_CANAL_MS, cortar, ERRO_CONEXAO_DEMOROU);
  if (!c) { cortar(); throw erroPT('Conectou, mas não achei por onde enviar os comandos.'); }
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
/**
 * O Bluetooth deste aparelho está ligado e liberado para o app?
 *
 * ⚠️ "NÃO SEI" NÃO PODE VIRAR "ESTÁ DESLIGADO". `getAvailability()` não existe
 * em todo navegador; onde faltar, responde `true` e deixa o seletor decidir —
 * bloquear aqui tiraria o único caminho de quem tem tudo funcionando.
 *
 * Vale principalmente no Android: com o adaptador desligado, ou sem a permissão
 * "Dispositivos por perto" concedida ao app, o seletor abre VAZIO e fica
 * girando. Perguntar antes troca uma tela vazia por uma frase que diz o que
 * fazer.
 */
export async function bluetoothLigado() {
  if (!bleDisponivel()) return false;
  if (typeof navigator.bluetooth.getAvailability !== 'function') return true;
  try { return await navigator.bluetooth.getAvailability(); } catch { return true; }
}

export const ERRO_BLUETOOTH_DESLIGADO =
  'O Bluetooth deste aparelho está desligado ou não foi liberado para o app. Ligue o Bluetooth e, nas permissões do app, autorize "Dispositivos por perto".';

export async function escolherImpressora() {
  if (!bleDisponivel()) throw erroPT('Este navegador não fala Bluetooth. Use o Chrome do Android.');
  let dev;
  try {
    // ⚠️ `requestDevice` PRIMEIRO, sem nenhum `await` antes dele. Abrir o
    // seletor exige "ativação transitória" — a marca de que o usuário acabou
    // de tocar na tela — e ela dura só uns 5 segundos. Cada espera antes daqui
    // gasta esse orçamento: com a checagem de rádio na frente, uma resposta
    // lenta fazia o Chrome RECUSAR o seletor com NotAllowedError, e a tela
    // dizia "o navegador bloqueou, toque no cadeado" — mandando a pessoa
    // mexer onde não era o problema.
    dev = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: SERVICOS_IMPRESSORA,
    });
  } catch (e) {
    // Agora sim dá para perguntar pelo rádio: a ativação já cumpriu o papel.
    // O seletor usa o MESMO NotFoundError para "fechei a lista" e para "a
    // lista veio vazia"; com o rádio desligado, a segunda é a explicação certa.
    if (e?.name === 'NotFoundError' && !(await bluetoothLigado())) {
      throw erroPT(ERRO_BLUETOOTH_DESLIGADO);
    }
    throw e;
  }
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
/**
 * Qual dos aparelhos já autorizados tentar.
 *
 * ⚠️ Era `conhecidos[0]` às cegas. A permissão do Web Bluetooth é por SITE e
 * se acumula: se a pessoa já tocou em qualquer outro aparelho na lista alguma
 * vez, o primeiro pode não ser impressora nenhuma — e a tentativa gastava o
 * tempo limite inteiro antes de desistir.
 *
 * PURA para ter teste sem impressora.
 */
export const pareceImpressora = (nome) =>
  /print|impres|mdk|tspl|pos-?\d|label|etiq|thermal|térmic|termic/i.test(String(nome || ''));

export function escolherConhecido(conhecidos, idAtual) {
  const lista = (conhecidos || []).filter(Boolean);
  if (!lista.length) return null;
  // Esta aba já falou com uma: é ela ou nenhuma.
  if (idAtual) return lista.find(d => d.id === idAtual) || null;
  return lista.find(d => pareceImpressora(d.name)) || lista[0];
}

export async function reconectarSePuder() {
  if (impressoraConectada()) return dispositivo;
  if (!bleDisponivel() || !navigator.bluetooth.getDevices) return null;
  try {
    const conhecidos = await navigator.bluetooth.getDevices();
    const alvo = escolherConhecido(conhecidos, dispositivo?.id);
    if (!alvo) return null;
    // ⚠️ `ligar` agora tem tempo limite. Falhar aqui NÃO é erro: significa só
    // que a pessoa vai escolher a impressora na mão. Por isso o catch mudo
    // continua — o que mudou é que ele passou a ser alcançável.
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
 *   • com confirmação (`writeValue`) → o ATT confirma cada pedaço, e a própria
 *     confirmação já segura o ritmo: não precisa de respiro artificial.
 *   • só sem confirmação → o respiro volta, porque aqui não há confirmação
 *     nenhuma segurando a fila do firmware.
 *
 * ⚠️ 20 BYTES NOS DOIS MODOS, e o pedaço de 100 com confirmação foi REMOVIDO.
 * A versão anterior apostava que o ATT parte sozinho o que passa do MTU (long
 * write) — parte mesmo, é spec. O problema é o outro lado: long write é
 * `prepare write` + `execute write`, e o firmware das térmicas baratas
 * frequentemente NÃO implementa esse par. Onde o celular negocia MTU grande,
 * os 100 bytes cabem num pacote só e nada disso acontece — funciona. Onde a
 * negociação não sobe, o mesmo código vira long write e a impressora recusa
 * ou descarta. Era um defeito que só aparecia em ALGUNS aparelhos, e como o
 * Web Bluetooth não expõe o MTU, não há como detectar e escolher em tempo de
 * execução. 20 bytes é o único tamanho que cabe garantido em qualquer MTU e
 * nunca vira long write. Custa mais chamadas; compra funcionar em todo lugar.
 *
 * Função PURA para poder ser testada sem impressora.
 */
export const PEDACO_SEGURO = 20;

export function planoDeEnvio(propriedades) {
  const p = propriedades || {};
  if (p.write) return { modo: 'comConfirmacao', pedaco: PEDACO_SEGURO, respiroMs: 0 };
  if (p.writeWithoutResponse) return { modo: 'semConfirmacao', pedaco: PEDACO_SEGURO, respiroMs: 30 };
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
