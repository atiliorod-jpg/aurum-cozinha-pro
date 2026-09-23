// =====================================================================
//  USO SEM INTERNET — o limite (pedido do dono, 23/09/2026)
//
//  A regra combinada com ele:
//   • sem internet, o app funciona até 72 HORAS depois da última vez que a
//     assinatura foi confirmada pela internet;
//   • nunca além da data de vencimento que o app já conhece (isso é o
//     `statusAssinatura` de sempre, agora contado na hora certa);
//   • se o relógio do aparelho for ATRASADO, o app desconfia;
//   • passado o limite: "Conecte à internet para continuar".
//
//  ⚠️ O QUE ISTO CONSERTOU ALÉM DO LIMITE: abrir o app SEM internet dava
//  "Cadastro incompleto" — a busca do perfil falhava e o app concluía que a
//  conta não tinha restaurante. Uma cozinha que abrisse o app com o Wi-Fi
//  caído não imprimia etiqueta nenhuma, mesmo pagando. Agora ela abre com a
//  última sessão confirmada (dentro das 72 h).
//
//  ⚠️ POR QUE NÃO EXIGIR INTERNET PARA TUDO: o Wi-Fi de cozinha cai no meio
//  do serviço, e parar de imprimir etiqueta nessa hora é o pior momento
//  possível para quem paga. O banco continua barrando GRAVAÇÃO de conta
//  vencida (`restaurante_pode_escrever`, M37) — isto aqui fecha a parte que
//  não passa pelo banco: a etiqueta por Bluetooth.
//
//  Funções PURAS (o projeto não tem jsdom).
// =====================================================================

export const JANELA_SEM_INTERNET_MS = 72 * 60 * 60 * 1000;
// Relógio de celular anda alguns segundos para lá e para cá sozinho, e fuso
// mal configurado erra em horas cheias — mas isso aparece como diferença
// ESTÁVEL em relação ao servidor, que a correção absorve. A folga é para o
// ruído, não para o fuso.
export const FOLGA_DO_RELOGIO_MS = 10 * 60 * 1000;

/**
 * A hora em que o app confia: a do aparelho corrigida pela diferença medida
 * contra o servidor na última confirmação. Relógio atrasado de propósito
 * volta para a hora certa aqui.
 */
export const horaConfiavel = (agoraAparelho, desvioMs = 0) => agoraAparelho + (Number(desvioMs) || 0);

/**
 * Pode usar o app SEM ter confirmado a assinatura agora?
 *
 * `confirmadoEm` — hora CONFIÁVEL (já corrigida) da última confirmação.
 * `maiorHoraVista` — a maior hora de APARELHO que o app já viu rodando: se
 *   o relógio voltar para antes dela, alguém mexeu no relógio.
 * `agoraAparelho` e `desvioMs` — a hora do aparelho e a correção medida.
 *
 * Devolve { ok: true, ate } ou { ok: false, motivo: 'nunca' | 'relogio' | 'prazo' }.
 */
export function situacaoSemInternet({ confirmadoEm, maiorHoraVista, desvioMs = 0 } = {}, agoraAparelho) {
  if (!confirmadoEm) return { ok: false, motivo: 'nunca' };
  if (maiorHoraVista && agoraAparelho < maiorHoraVista - FOLGA_DO_RELOGIO_MS) {
    return { ok: false, motivo: 'relogio' };
  }
  const agora = horaConfiavel(agoraAparelho, desvioMs);
  if (agora < confirmadoEm - FOLGA_DO_RELOGIO_MS) return { ok: false, motivo: 'relogio' };
  const ate = confirmadoEm + JANELA_SEM_INTERNET_MS;
  if (agora > ate) return { ok: false, motivo: 'prazo', desde: confirmadoEm };
  return { ok: true, ate };
}

/** A diferença entre o servidor e o aparelho, em ms (positivo = aparelho atrasado). */
export function desvioDoRelogio(horaServidorISO, agoraAparelho) {
  const s = Date.parse(horaServidorISO || '');
  if (!Number.isFinite(s)) return 0;
  const d = s - agoraAparelho;
  // ruído de rede e de relógio não conta como desvio
  return Math.abs(d) <= FOLGA_DO_RELOGIO_MS ? 0 : d;
}

/** O que a tela "Conecte à internet" diz, por motivo. */
export function textoDoBloqueio(motivo) {
  if (motivo === 'relogio') {
    return 'A data e a hora deste aparelho estão atrasadas. Acerte o relógio (automático, pela rede) e conecte à internet para continuar.';
  }
  if (motivo === 'nunca') {
    return 'Neste aparelho, a primeira entrada precisa de internet. Conecte e tente de novo.';
  }
  return 'Faz mais de 3 dias que este aparelho não confere a assinatura pela internet. Conecte à internet para continuar — seus dados continuam guardados.';
}

/** A hora confiável de agora — a do aparelho corrigida pela última medição. */
export const agoraConfiavel = (desvioMs = 0, agoraAparelho = Date.now()) => horaConfiavel(agoraAparelho, desvioMs);

/**
 * O portão do App: esta sessão pode seguir sem uma confirmação recente?
 *
 * ⚠️ SEM CONFIRMAÇÃO NENHUMA NESTA SESSÃO (`confirmadoEm` nulo) VALE A REGRA
 * ANTIGA — "consulta que falha não tira acesso" (03/09/2026). É o instante
 * entre abrir e a confirmação responder, e o caso raro de a linha do
 * restaurante falhar na primeira entrada. Quem abre sem internet NUNCA chega
 * aqui sem confirmação: ou tem a cópia guardada (com a hora dela), ou cai na
 * tela que pede internet.
 */
export function portaoSemInternet({ sessao, confirmacao, maiorHoraVista, isento = false } = {}, agoraAparelho = Date.now()) {
  if (isento || !sessao || sessao.demo || sessao.eSuperAdmin) return { ok: true };
  if (!confirmacao?.confirmadoEm) return { ok: true };
  return situacaoSemInternet({ ...confirmacao, maiorHoraVista }, agoraAparelho);
}
