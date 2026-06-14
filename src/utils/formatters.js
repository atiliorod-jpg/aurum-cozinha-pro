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

export const fmtNum = (n, dec = 2) => {
  const num = parseFloat(n) || 0;
  return num % 1 === 0 ? num.toString() : num.toFixed(dec);
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

export const diasDaSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
