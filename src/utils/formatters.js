// Data local no formato YYYY-MM-DD (NUNCA usar toISOString aqui: ele converte
// para UTC e, no horário de Brasília, vira o dia seguinte das 21h à meia-noite).
export const isoLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const hoje = () => isoLocal();

export const fmtData = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// ⚠️ VÍRGULA, NÃO PONTO (auditoria de 14/10/2026). Era `toFixed`, que escreve
// no padrão americano: o app inteiro mostrava "7.50 kg" e "3.80 unid/dia" —
// 94 lugares. Agora "7,5 kg", sem zero sobrando.
// ⚠️ SEM SEPARADOR DE MILHAR de propósito: o app mostrou "1.40 kg" por meses,
// e "1.500 g" seria lido como um quilo e meio. "1500 g" não deixa dúvida.
const FORMATOS_NUM = {};
export const fmtNum = (n, dec = 2) => {
  const num = parseFloat(n) || 0;
  if (!FORMATOS_NUM[dec]) {
    FORMATOS_NUM[dec] = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: dec, useGrouping: false });
  }
  return FORMATOS_NUM[dec].format(num);
};

export const fmtHora = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

export const semanaAtual = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now);
  start.setDate(diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    inicio: isoLocal(start),
    fim: isoLocal(end),
  };
};

/** "1 dia" / "3 dias" — no lugar de "dia(s)", que soa gerado. */
export const plural = (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`;
