// =====================================================================
//  A SENHA DA ADMINISTRAÇÃO (23/11/2026, jeito do Magurō — pedido do dono)
//
//  Não há mais cargos, matriz de acessos nem conta por pessoa. É assim:
//   • um LOGIN DA CASA, que entra em quantos aparelhos quiser;
//   • os NOMES com senha de 2 números dizem quem imprimiu ou lançou;
//   • uma SENHA DA ADMINISTRAÇÃO (de 4 a 8 números — "maior que só 4
//     teclas", ele pediu) abre a Administração e os relatórios, em
//     QUALQUER aparelho: o celular do dono também pede.
//  Ela fecha sozinha com 3 minutos sem uso, ou no botão "Fechar".
//  Imprimir, lançar, REIMPRIMIR e Meus itens (24/11/2026) são livres.
//
//  ⚠️ QUEM DECIDE É O BANCO (migração 62): enquanto a Administração está
//  aberta NAQUELE aparelho (a sessão de login dele), `meu_cargo()` responde
//  'diretoria'; fechada, 'cozinha'. Assim as dezenas de regras que já
//  conferem o cargo continuam valendo sem reescrever uma por uma — e não dá
//  para abrir a Administração mexendo no navegador.
//  ⚠️ Banco ainda sem a M62 (o RPC não existe): o app segue como antes, com o
//  cargo gravado na conta. Ver `cargoEfetivo`.
// =====================================================================

export const MIN_DIGITOS_ADM = 4;
export const MAX_DIGITOS_ADM = 8;
// fecha sozinha depois deste tempo sem ninguém tocar na tela
export const MINUTOS_PARADA_ADM = 3;
// na demonstração (sem servidor) a senha mora no aparelho e começa assim,
// como a "1234" do Magurō
export const SENHA_DA_DEMO = '1234';
// erros seguidos antes de esperar, na demonstração (o servidor tem a dele)
export const ERROS_ANTES_DE_ESPERAR = 5;
export const SEGUNDOS_DE_ESPERA_DEMO = 15;

export const senhaAdmValida = (s) => /^\d+$/.test(String(s ?? ''))
  && String(s).length >= MIN_DIGITOS_ADM && String(s).length <= MAX_DIGITOS_ADM;

/**
 * O cargo que vale AGORA neste aparelho.
 *
 * - super-admin e perfil incompleto: o de sempre;
 * - banco sem a M62 (`noServidor === false`): o gravado na conta, como antes;
 * - senão: 'diretoria' com a Administração aberta, 'cozinha' fechada.
 *   (`noServidor === null` — ainda conferindo — conta como com a M62: é o
 *   lado seguro; o servidor responde em segundos e, sem a M62, solta.)
 */
export function cargoEfetivo({ sessao, aberta, noServidor }) {
  if (!sessao || sessao.eSuperAdmin || !sessao.cargo) return sessao?.cargo ?? null;
  if (!sessao.demo && noServidor === false) return sessao.cargo;
  return aberta ? 'diretoria' : 'cozinha';
}

/** O texto da tela para a resposta de `abrir_administracao` (ou da demonstração). */
export function textoDaRecusa(r) {
  if (!r || r.ok) return '';
  if (r.motivo === 'espera') {
    const s = Math.max(1, Math.ceil(Number(r.segundos) || 1));
    return `Muitas tentativas erradas. Espere ${s} ${s === 1 ? 'segundo' : 'segundos'} e tente de novo.`;
  }
  if (r.motivo === 'senha') {
    const n = Number(r.restantes);
    return Number.isFinite(n) && n > 0
      ? `Senha errada. ${n === 1 ? 'Resta 1 tentativa' : `Restam ${n} tentativas`} antes de esperar.`
      : 'Senha errada.';
  }
  if (r.motivo === 'sem_senha') return 'Esta conta ainda não tem senha da Administração. Crie a primeira.';
  if (r.motivo === 'rede') return 'Sem internet: a senha da Administração é conferida no servidor. Confira a conexão.';
  if (r.motivo === 'sem_servidor') return 'A senha da Administração ainda não foi ligada no servidor desta conta. Fale com a Aurum.';
  return r.mensagem || 'Não consegui conferir a senha. Tente de novo.';
}

// A resposta de "esta função não existe no banco" (banco sem a M62)
export const ehFuncaoAusente = (erro) =>
  /does not exist|schema cache|could not find|not find the function|PGRST202/i.test(String(erro?.message || erro?.code || ''));
