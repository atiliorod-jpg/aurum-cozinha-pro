// =====================================================================
//  Mensagens de autenticação em português
//
//  O Supabase responde em inglês, sempre. "New password should be different
//  from the old password." não diz nada para quem está na cozinha — e pior:
//  numa tela de senha, texto em inglês parece defeito do sistema, então a
//  pessoa tenta de novo em vez de mudar o que precisa mudar.
//
//  ⚠️ ESTA FUNÇÃO VIVE AQUI, e não dentro de uma tela, porque DUAS telas
//  precisam dela: a de entrada e a de criar nova senha. Ela nasceu dentro do
//  Login e a de nova senha mostrava o texto cru — o defeito que o dono viu.
// =====================================================================

/**
 * ⚠️ A ORDEM DAS REGRAS É O QUE FAZ ISTO FUNCIONAR. As específicas vêm antes
 * das genéricas: "New password should be different" CONTÉM a palavra
 * "password", então a regra genérica de senha a transformaria em "Senha
 * inválida (mínimo 8 caracteres)" — uma mensagem errada, que manda a pessoa
 * consertar o que já estava certo.
 */
export function traduzErroAuth(msg) {
  const m = String(msg || '').toLowerCase();
  if (!m) return 'Erro inesperado.';

  // — senha —
  if (m.includes('different from the old') || m.includes('should be different')) {
    return 'A nova senha precisa ser diferente da atual.';
  }
  if (m.includes('at least') && m.includes('character')) {
    return 'A senha é curta demais. Use pelo menos 8 caracteres.';
  }
  if (m.includes('weak password') || m.includes('pwned')) {
    return 'Essa senha é fácil de adivinhar. Escolha outra.';
  }

  // — entrada —
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Esse e-mail já tem conta. Use "Entrar".';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  }
  if (m.includes('invalid email') || m.includes('email address') && m.includes('invalid')) {
    return 'E-mail inválido.';
  }

  // — link do e-mail —
  // ⚠️ "session missing" chega quando a pessoa abre a tela de nova senha sem
  // link válido — link velho, aberto duas vezes, ou expirado. Mostrar o texto
  // cru fazia parecer erro do app.
  if (m.includes('session missing') || m.includes('session not found')) {
    return 'Este link não vale mais. Peça um novo em "Esqueci minha senha".';
  }
  if (m.includes('expired') || m.includes('otp_expired')) {
    return 'Este link expirou. Peça um novo em "Esqueci minha senha".';
  }
  if (m.includes('token') && m.includes('invalid')) {
    return 'Este link não é válido. Peça um novo em "Esqueci minha senha".';
  }

  // — limites —
  // O Supabase diz "For security purposes, you can only request this after N
  // seconds" — o número importa para quem está esperando.
  const segundos = m.match(/after (\d+) seconds?/);
  if (segundos) return `Aguarde ${segundos[1]} segundos antes de pedir de novo.`;
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitas tentativas. Aguarde um momento e tente de novo.';
  }

  // — rede —
  if (m.includes('network') || m.includes('fetch') || m.includes('load failed')) {
    return 'Sem conexão com a internet.';
  }

  // Conta com verificação em duas etapas (M51): trocar a senha exige ter
  // entrado com o código — não é a senha que está curta.
  if (m.includes('aal2') || m.includes('insufficient_aal')) {
    return 'Esta conta usa verificação em duas etapas: entre com o código do aplicativo autenticador antes de trocar a senha.';
  }

  // ⚠️ Genérica de senha por ÚLTIMO, depois de todas as específicas.
  if (m.includes('password')) return 'Senha inválida (mínimo 8 caracteres).';

  // ⚠️ Mensagem desconhecida volta CRUA, não vira "erro inesperado": texto em
  // inglês é feio, mas dá para pesquisar e para mandar ao suporte. Um "erro
  // inesperado" genérico apaga a única pista que existia.
  return msg || 'Erro inesperado.';
}

// ── O último erro que derrubou uma tela ───────────────────────
//
// ⚠️ MORA AQUI, e não junto da BarreiraDeErro, por uma razão boba e real: um
// arquivo de componente que exporta função solta quebra o recarregamento
// automático do Vite em desenvolvimento. A barreira grava, este lado lê.
export const CHAVE_ULTIMO_ERRO = 'aurum_ultimo_erro';

/** O último erro guardado, para a aba Ajuda mandar junto com o recado. */
export const ultimoErroGuardado = () => {
  try { return JSON.parse(localStorage.getItem(CHAVE_ULTIMO_ERRO) || 'null'); }
  catch { return null; }
};

// Mensagens da IMPRESSORA (Bluetooth). Morava dentro de EtiquetaPrint; veio
// para cá em 23/09/2026 porque a aba Impressora (trocar impressora, etiqueta
// de teste) fala as mesmas frases.
// ⚠️ O NAVEGADOR FALA INGLÊS DE ENGENHEIRO. "GATT operation failed" ou
// "NetworkError" no meio do serviço não diz nada para quem está com o pote na
// mão — e o pior é que quase sempre a causa é banal: impressora desligada,
// longe, ou presa em outro aparelho. Cada mensagem aqui termina com o que
// FAZER; o texto original vai junto só para o suporte.
export function erroEmPortugues(e) {
  const cru = e?.message || String(e || '');
  const nome = e?.name || '';
  // ⚠️ Erro nosso passa direto. A lista abaixo reconhece o que o NAVEGADOR
  // fala; sem esta linha, uma frase já escrita em português caía no fim e
  // saía embrulhada em "Não deu para imprimir… (a mesma frase)".
  if (e?.emPortugues) return cru;
  if (nome === 'NotAllowedError') return 'O navegador bloqueou o acesso ao Bluetooth. Toque no cadeado ao lado do endereço e libere.';
  if (nome === 'SecurityError') return 'Abra o app pelo endereço https:// — o Bluetooth não funciona fora dele.';
  if (/GATT|disconnect|NetworkError/i.test(cru) || nome === 'NetworkError') {
    return 'Perdeu a conexão com a impressora. Confira se ela está ligada e por perto, e mande de novo.';
  }
  if (/Bluetooth adapter not available|globally disabled/i.test(cru)) {
    return 'O Bluetooth do aparelho está desligado. Ligue e tente de novo.';
  }
  if (/User cancelled|cancelled/i.test(cru)) return '';
  return `Não deu para imprimir. Desligue e ligue a impressora e tente de novo. (${cru})`;
}
