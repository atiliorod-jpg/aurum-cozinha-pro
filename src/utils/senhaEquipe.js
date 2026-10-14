// =====================================================================
//  SENHA DA EQUIPE PARA IMPRIMIR ("Quem vai imprimir?", 13/10/2026)
//
//  Pedido do dono, no jeito da Suflex: a tela de etiquetas começa pela
//  PESSOA. Ela toca no próprio nome, digita a senha de 4 números (se tiver)
//  e só então busca o item. A etiqueta sai com o nome dela no RESP.
//
//  ⚠️ OS NOMES SÃO OS DA LISTA "pessoas", NÃO AS CONTAS DE ACESSO. A conta
//  pode ser de um posto ("Produção", "Noite") e o dono cadastra na lista
//  todo mundo que imprime. A senha é de cada NOME, e só o dono cria, troca
//  ou tira (em Administração). Ele repassa a senha para a pessoa.
//
//  ⚠️ LIMITE HONESTO: a senha fica no documento da conta (`senhasEquipe`),
//  codificada com sal, e todo aparelho da conta a lê — é o que deixa
//  conferir sem internet. Isso barra o uso do nome do outro no dia a dia,
//  mas 4 números não são senha de banco: quem entende de computador e tem
//  acesso à conta descobriria. Não usar para nada além de "quem imprimiu".
//
//  Tudo aqui é puro (sem React), com teste em __tests__/senhaEquipe.test.js.
// =====================================================================

export const DIGITOS = 4;
// PBKDF2 com 100 mil voltas: ~50-150 ms num celular de cozinha, que é o
// atraso que a pessoa nem percebe ao digitar o 4º número.
export const ITERACOES_PADRAO = 100_000;
// ⚠️ TETO E PISO CONTRA DOCUMENTO ADULTERADO. O número de voltas vem do
// próprio registro; sem limite, um registro com 1 bilhão de voltas travava
// o aparelho de quem tocasse no nome, e um com 1 volta tornava a senha
// trivial de descobrir.
export const ITERACOES_MIN = 10_000;
export const ITERACOES_MAX = 1_000_000;
// 5 erros seguidos → o aparelho espera 1 minuto antes de aceitar de novo
export const ERROS_ATE_ESPERAR = 5;
export const ESPERA_MS = 60_000;
// 5 minutos sem tocar em nada → volta para os nomes (decisão do dono)
export const OCIOSO_MS = 5 * 60_000;
// ⚠️ FORA do prefixo pe::<rid>:: de propósito: a trava SOBREVIVE a sair e
// entrar de novo na conta. Senão bastava sair e entrar para zerar os erros.
export const CHAVE_TRAVAS = 'pe::travaSenhaEquipe';

const HEX_SAL = /^[0-9a-f]{32}$/;
const HEX_HASH = /^[0-9a-f]{64}$/;

export const senhaNoFormato = (pin) => typeof pin === 'string' && new RegExp(`^\\d{${DIGITOS}}$`).test(pin);

export function registroValido(reg) {
  return !!reg && typeof reg === 'object' && !Array.isArray(reg)
    && typeof reg.s === 'string' && HEX_SAL.test(reg.s)
    && typeof reg.h === 'string' && HEX_HASH.test(reg.h)
    && Number.isInteger(reg.i) && reg.i >= ITERACOES_MIN && reg.i <= ITERACOES_MAX;
}

// ⚠️ hasOwnProperty, nunca `senhas[nome]` direto: um nome cadastrado como
// "__proto__" ou "constructor" leria o protótipo do objeto e pareceria ter
// senha (ou quebraria a conferência).
export function registroDe(senhas, nome) {
  if (!senhas || typeof senhas !== 'object' || typeof nome !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(senhas, nome)) return null;
  const reg = senhas[nome];
  return registroValido(reg) ? reg : null;
}

// Registro ESTRAGADO conta como "tem senha": cai na conferência, que falha
// fechada. Tratar como "sem senha" deixaria qualquer um entrar no nome de
// quem tinha senha só por o documento ter vindo torto.
export function temSenha(senhas, nome) {
  if (!senhas || typeof senhas !== 'object' || typeof nome !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(senhas, nome) && senhas[nome] != null;
}

const sutil = () => globalThis.crypto?.subtle || null;
// O navegador só entrega `crypto.subtle` em https (ou localhost). O app no
// ar é https; fora disso a conferência falha fechada (ver conferirSenha).
export const criptoDisponivel = () => !!sutil() && typeof globalThis.crypto?.getRandomValues === 'function';

const paraHex = (buf) => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
const deHex = (hex) => new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));

export function novoSal() {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return paraHex(b);
}

export async function derivarSenha(pin, salHex, iteracoes = ITERACOES_PADRAO) {
  const s = sutil();
  const chave = await s.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: deHex(salHex), iterations: iteracoes }, chave, 256);
  return paraHex(bits);
}

export async function gerarRegistroDeSenha(pin) {
  if (!senhaNoFormato(pin)) throw new Error(`A senha precisa ter ${DIGITOS} números.`);
  if (!criptoDisponivel()) throw new Error('Este aparelho não consegue guardar senha. Abra o app pelo endereço com https.');
  const s = novoSal();
  return { s, h: await derivarSenha(pin, s, ITERACOES_PADRAO), i: ITERACOES_PADRAO };
}

// ⚠️ FALHA FECHADA: formato errado, registro estragado, navegador sem
// cripto ou qualquer exceção = senha errada. Nunca "deixa passar".
export async function conferirSenha(pin, reg) {
  try {
    if (!senhaNoFormato(pin) || !registroValido(reg) || !criptoDisponivel()) return false;
    const h = await derivarSenha(pin, reg.s, reg.i);
    // comparação sem atalho: o tempo não denuncia quantos dígitos bateram
    let dif = h.length ^ reg.h.length;
    for (let i = 0; i < Math.min(h.length, reg.h.length); i++) dif |= h.charCodeAt(i) ^ reg.h.charCodeAt(i);
    return dif === 0;
  } catch {
    return false;
  }
}

// ── O documento `senhasEquipe` = { [nome]: { s, h, i } } ────────────────
// Sempre um objeto NOVO: o estado do React e a gravação na nuvem precisam
// ver a mudança.
export function comSenha(senhas, nome, registro) {
  const base = senhas && typeof senhas === 'object' && !Array.isArray(senhas) ? senhas : {};
  const novo = {};
  for (const k of Object.keys(base)) if (k !== nome) novo[k] = base[k];
  if (registro) Object.defineProperty(novo, nome, { value: registro, enumerable: true, writable: true, configurable: true });
  return novo;
}

// Tira a senha de quem não está mais na equipe (pessoa removida, cópia de
// segurança importada com outra lista). Devolve a MESMA referência quando
// não há o que tirar — assim não grava à toa.
export function semOrfas(senhas, pessoas) {
  if (!senhas || typeof senhas !== 'object' || Array.isArray(senhas)) return {};
  const nomes = new Set(pessoas || []);
  const chaves = Object.keys(senhas);
  if (chaves.every(k => nomes.has(k))) return senhas;
  const novo = {};
  for (const k of chaves) {
    if (nomes.has(k)) Object.defineProperty(novo, k, { value: senhas[k], enumerable: true, writable: true, configurable: true });
  }
  return novo;
}

// ── Trava depois de errar (por aparelho) ────────────────────────────────
// trava = { erros, ate } ; `ate` é quando o aparelho volta a aceitar
export function estadoDaTrava(trava, agora) {
  const t = trava && typeof trava === 'object' ? trava : {};
  const ate = Number(t.ate) || 0;
  // ⚠️ relógio que voltou para trás (ou trava de 1 ano gravada à mão) não
  // prende o nome para sempre: a espera nunca passa de ESPERA_MS
  if (ate > agora && ate - agora <= ESPERA_MS) {
    return { travado: true, esperaMs: ate - agora, restam: 0 };
  }
  const erros = ate && ate <= agora ? 0 : Math.max(0, Number(t.erros) || 0);
  return { travado: false, esperaMs: 0, restam: Math.max(0, ERROS_ATE_ESPERAR - erros) };
}

export function aposErro(trava, agora) {
  const atual = estadoDaTrava(trava, agora);
  if (atual.travado) return trava;
  const erros = ERROS_ATE_ESPERAR - atual.restam + 1;
  return erros >= ERROS_ATE_ESPERAR ? { erros: 0, ate: agora + ESPERA_MS } : { erros, ate: 0 };
}

// ── 5 minutos sem uso ───────────────────────────────────────────────────
// Relógio que voltou para trás também expira: na dúvida, volta aos nomes.
export function expirou(ultimoUso, agora, limite = OCIOSO_MS) {
  if (!ultimoUso) return true;
  return agora - ultimoUso >= limite || agora < ultimoUso;
}

// ── Quem assina a etiqueta desta janela ─────────────────────────────────
//  • manual   → equipe vazia: o seletor de sempre (como era antes)
//  • livre    → etiqueta de teste da impressora: não precisa de ninguém
//  • original → reimpressão: mantém quem assinou o papel original, sem senha
//  • operador → todo o resto: assina quem entrou pelo nome (e a senha);
//               sem ninguém escolhido, `falta` trava os botões
export function assinaturaDaJanela({ itens = [], comEquipe = false, operador = '', manual = '' } = {}) {
  const lista = Array.isArray(itens) ? itens : [];
  if (!comEquipe) return { regra: 'manual', nome: manual || '', falta: false };
  if (lista.length > 0 && lista.every(i => i?.teste)) {
    return { regra: 'livre', nome: operador || lista[0]?.responsavel || '', falta: false };
  }
  const original = lista.length > 0
    && lista.every(i => i?.reimpressao || i?.codigo || i?.assinaturaOriginal);
  const assinou = String(lista[0]?.responsavel || '').trim();
  if (original && assinou) return { regra: 'original', nome: assinou, falta: false };
  return { regra: 'operador', nome: operador || '', falta: !operador };
}
