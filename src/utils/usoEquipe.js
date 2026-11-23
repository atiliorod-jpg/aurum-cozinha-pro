// =====================================================================
//  NOME PARADO SAI SOZINHO DA EQUIPE (23/11/2026, pedido do dono, no
//  jeito do Magurō)
//
//  Para ninguém precisar lembrar de tirar da lista quem saiu da empresa:
//  quem fica 60 dias sem entrar (pela senha, ou criando a senha) sai da
//  lista de "Quem vai imprimir?", e a senha sai junto. O que a pessoa já
//  imprimiu ou registrou continua com o nome dela.
//
//  ⚠️ CONTAM SÓ OS DIAS EM QUE A COZINHA USOU O APP, não o calendário:
//  • férias coletivas de 2 meses não apagam a equipe inteira na volta;
//  • um aparelho com o relógio errado (tablet que voltou para 2010, ou foi
//    para 2030) não apaga ninguém de uma vez: cada data errada vale, no
//    máximo, UM dia de uso a mais.
//  O Magurō faz a conta no servidor, com a hora do banco. Aqui não existe
//  essa função no banco (e mexer nele precisa do token), então a regra se
//  protege sozinha contra o relógio do aparelho.
//
//  O documento `usoEquipe` (da conta, como `senhasEquipe`):
//    dias:  ['AAAA-MM-DD', ...]      os últimos 60 dias com uso, do mais
//                                    novo para o mais velho
//    nomes: { [nome]: 'AAAA-MM-DD' } o último dia em que cada um entrou
//  Um nome sai quando os 60 dias guardados são TODOS depois do último uso
//  dele — 60 dias de cozinha funcionando sem ele entrar.
//
//  Tudo aqui é puro, com teste em __tests__/usoEquipe.test.js. Toda função
//  que muda devolve a MESMA referência quando não há o que mudar: assim o
//  app não grava à toa.
// =====================================================================

export const DIAS_SEM_USO = 60;

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const dataValida = (d) => typeof d === 'string' && DATA.test(d);
const temChave = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const maior = (a, b) => (a > b ? a : b);

// ⚠️ defineProperty e hasOwnProperty, nunca `nomes[nome] = ...`: um nome
// cadastrado como "__proto__" trocaria o protótipo do objeto em vez de
// virar uma chave (o mesmo cuidado de comSenha, em senhaEquipe.js).
function comNome(nomes, nome, dia) {
  const novo = {};
  for (const k of Object.keys(nomes)) {
    if (k !== nome) Object.defineProperty(novo, k, { value: nomes[k], enumerable: true, writable: true, configurable: true });
  }
  if (dia !== undefined) Object.defineProperty(novo, nome, { value: dia, enumerable: true, writable: true, configurable: true });
  return novo;
}

/** O documento lido com segurança: o que vier torto vira vazio. */
export function lerUso(doc) {
  const d = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {};
  const dias = Array.isArray(d.dias) ? d.dias.filter(dataValida) : [];
  const nomes = d.nomes && typeof d.nomes === 'object' && !Array.isArray(d.nomes) ? d.nomes : {};
  return { dias, nomes };
}

/** O último dia em que o nome entrou ('' = nunca, ou data estragada). */
export function ultimoUso(doc, nome) {
  const { nomes } = lerUso(doc);
  return typeof nome === 'string' && temChave(nomes, nome) && dataValida(nomes[nome]) ? nomes[nome] : '';
}

// O dia que vale para o nome: hoje — ou o dia de uso mais novo que a equipe
// já registrou, se o relógio DESTE aparelho estiver atrás dele. ⚠️ Sem isso,
// um tablet que voltou para 2010 daria "2010" a quem entrasse nele, e o nome
// sairia da lista no dia seguinte.
const diaDoNome = (dias, hoje) => maior(hoje, dias[0] || '');

/**
 * A pessoa entrou (pela senha, ou criando a senha). Conta o dia como dia de
 * uso da cozinha e guarda o último uso dela — que nunca volta para trás.
 */
export function marcarUso(doc, nome, hoje) {
  if (typeof nome !== 'string' || !nome || !dataValida(hoje)) return doc;
  const { dias, nomes } = lerUso(doc);
  const antes = ultimoUso(doc, nome);
  const depois = maior(antes, diaDoNome(dias, hoje));
  const novosDias = dias.includes(hoje) ? dias : [...dias, hoje].sort().reverse().slice(0, DIAS_SEM_USO);
  // um dia mais velho que os 60 guardados não entra (e não muda nada)
  const diasMudaram = novosDias !== dias && novosDias.includes(hoje);
  if (!diasMudaram && depois === antes) return doc;
  return { dias: diasMudaram ? novosDias : dias, nomes: depois === antes ? nomes : comNome(nomes, nome, depois) };
}

/**
 * Nome sem data (cadastrado antes desta regra, ou num aparelho sem
 * internet) ganha o dia de hoje: o prazo dele começa agora.
 */
export function completarUso(doc, pessoas, hoje) {
  if (!dataValida(hoje)) return doc;
  const { dias, nomes } = lerUso(doc);
  const faltam = (Array.isArray(pessoas) ? pessoas : [])
    .filter(p => typeof p === 'string' && p && !ultimoUso(doc, p));
  if (!faltam.length) return doc;
  const dia = diaDoNome(dias, hoje);
  let novos = nomes;
  for (const p of faltam) novos = comNome(novos, p, dia);
  return { dias, nomes: novos };
}

/** Quantos dias de uso da cozinha já passaram sem o nome entrar (null = sem data). */
export function diasSemEntrar(doc, nome) {
  const ultimo = ultimoUso(doc, nome);
  if (!ultimo) return null;
  return lerUso(doc).dias.filter(d => d > ultimo).length;
}

/** Quantos dias de uso faltam para o nome sair (null = sem data: não sai). */
export function diasParaSair(doc, nome) {
  const passados = diasSemEntrar(doc, nome);
  return passados === null ? null : Math.max(0, DIAS_SEM_USO - passados);
}

/** Os nomes da equipe que já passaram do prazo. Nome sem data nunca sai. */
export function nomesParados(doc, pessoas) {
  return (Array.isArray(pessoas) ? pessoas : []).filter(p => diasParaSair(doc, p) === 0);
}

/** Tira o nome do documento (pessoa removida da equipe). */
export function semUso(doc, nome) {
  if (!ultimoUso(doc, nome) && !temChave(lerUso(doc).nomes, nome)) return doc;
  const { dias, nomes } = lerUso(doc);
  return { dias, nomes: comNome(nomes, nome, undefined) };
}

/** Tira quem não está mais na equipe (cópia de segurança, nome apagado em outro aparelho). */
export function podarUso(doc, pessoas) {
  const { dias, nomes } = lerUso(doc);
  const ficam = new Set(Array.isArray(pessoas) ? pessoas : []);
  const sobram = Object.keys(nomes).filter(k => !ficam.has(k));
  if (!sobram.length) return doc;
  let novos = nomes;
  for (const k of sobram) novos = comNome(novos, k, undefined);
  return { dias, nomes: novos };
}
