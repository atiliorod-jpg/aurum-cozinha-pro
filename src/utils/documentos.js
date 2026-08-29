// =====================================================================
//  CNPJ e telefone — validação e máscara
//
//  Existe porque o cadastro passou a ser B2B de verdade: CNPJ é a trava
//  contra criar conta nova toda semana para renovar o teste grátis, e o
//  WhatsApp é como o dono ativa a assinatura (Pix + WhatsApp) — antes disto
//  ele só tinha o número quando o cliente o procurava.
//
//  ⚠️ Isto valida FORMATO e DÍGITO VERIFICADOR. Não diz se o CNPJ existe de
//  verdade nem se está ativo na Receita — para isso seria preciso consultar
//  um serviço externo. O dígito verificador já barra erro de digitação e
//  número inventado na hora, que é o caso real.
// =====================================================================

export const soDigitos = (v) => String(v ?? '').replace(/\D+/g, '');

/**
 * Valida CNPJ pelo dígito verificador (módulo 11).
 *
 * ⚠️ A rejeição de "todos os dígitos iguais" não é frescura: 00000000000000,
 * 11111111111111 e afins PASSAM no cálculo do módulo 11. Sem esta linha,
 * digitar catorze vezes o mesmo número seria aceito como CNPJ válido.
 */
export function validarCNPJ(valor) {
  const c = soDigitos(valor);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;

  const dv = (base, pesos) => {
    const soma = base.reduce((acc, n, i) => acc + n * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const nums = c.split('').map(Number);
  const d1 = dv(nums.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== nums[12]) return false;
  const d2 = dv(nums.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === nums[13];
}

/** 11222333000181 → 11.222.333/0001-81 (parcial enquanto digita) */
export function formatarCNPJ(valor) {
  const c = soDigitos(valor).slice(0, 14);
  if (c.length <= 2) return c;
  if (c.length <= 5) return `${c.slice(0, 2)}.${c.slice(2)}`;
  if (c.length <= 8) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5)}`;
  if (c.length <= 12) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8)}`;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/**
 * Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular).
 * ⚠️ Celular tem que começar com 9 depois do DDD, e DDD válido vai de 11 a 99
 * — sem isso "00" ou "01" passariam e o WhatsApp do dono não chegaria a lugar
 * nenhum na hora de ativar a assinatura.
 */
export function validarTelefone(valor) {
  const t = soDigitos(valor);
  if (t.length !== 10 && t.length !== 11) return false;
  const ddd = parseInt(t.slice(0, 2), 10);
  if (!(ddd >= 11 && ddd <= 99)) return false;
  if (t.length === 11 && t[2] !== '9') return false;
  return true;
}

/** 81998184489 → (81) 99818-4489 (parcial enquanto digita) */
export function formatarTelefone(valor) {
  const t = soDigitos(valor).slice(0, 11);
  if (t.length <= 2) return t.length ? `(${t}` : '';
  if (t.length <= 6) return `(${t.slice(0, 2)}) ${t.slice(2)}`;
  if (t.length <= 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;
  return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
}

// UFs, para o seletor do cadastro. Cidade/UF importa de verdade: a norma
// sanitária varia por estado (a CVS é de São Paulo), e é o que permite
// orientar cada cliente com a regra que vale para ele.
export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];
