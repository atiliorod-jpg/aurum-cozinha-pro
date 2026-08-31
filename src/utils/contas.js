// =====================================================================
//  Contas de equipe — o endereço interno
//
//  O Supabase exige e-mail para autenticar, ponto. Mas cozinheiro não tem, ou
//  não lembra, um e-mail — exigir um era barrar metade da equipe na porta.
//  Então `maria.polobeer` vira `maria.polobeer@contas.aurum.app` no login e
//  some. A pessoa nunca vê, nunca digita e nunca recebe nada ali: o domínio é
//  inventado de propósito, justamente para NÃO haver caixa de entrada.
//
//  ⚠️ E é por não haver caixa que este arquivo existe. Quem lê o endereço
//  precisa saber que ele não recebe: mandar link de recuperação para um deles
//  é mandar e-mail para o vazio, e o cliente fica esperando. A regra estava
//  escrita como texto solto em dois lugares — bastava um deles mudar para o
//  outro passar a mentir em silêncio.
// =====================================================================

export const DOMINIO_CONTAS = 'contas.aurum.app';

/** Login de equipe (`maria.polobeer`) → endereço interno; e-mail passa direto. */
export const emailDeLogin = (identificacao) => {
  const bruto = String(identificacao || '').trim();
  return bruto.includes('@') ? bruto : `${bruto.toLowerCase()}@${DOMINIO_CONTAS}`;
};

/** Este endereço recebe e-mail de verdade? Conta de equipe NÃO recebe. */
export const temCaixaDeEntrada = (email) =>
  !!email && !String(email).toLowerCase().endsWith(`@${DOMINIO_CONTAS}`);
