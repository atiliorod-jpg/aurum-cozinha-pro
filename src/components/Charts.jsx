// Gráficos leves em SVG/CSS puro — sem bibliotecas, rápidos no tablet.

const fmt = (v) => (v == null ? '—' : Number.isInteger(v) ? v : Number(v).toFixed(1));

const CORES_BARRAS = ['#1B2A41', '#C9A24B', '#B0413E', '#3E7C59', '#6B5B95', '#D97742'];

// Barras horizontais empilhadas: [{ nome, total, [localId]: qty, unidade }]
// locais: [{ id, nome }] — segmentos dinâmicos, 1 por destino de saída.
export function BarrasEmpilhadas({ dados, locais = [] }) {
  if (!dados.length) return <Vazio />;
  const max = Math.max(...dados.map(d => d.total)) || 1;
  return (
    <div className="space-y-2">
      {dados.map(d => (
        <div key={d.nome}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="font-medium text-gray-700 truncate">{d.nome}</span>
            <span className="text-gray-500 flex-shrink-0 ml-2">{fmt(d.total)} {d.unidade}</span>
          </div>
          <div className="flex h-3.5 rounded-full overflow-hidden bg-gray-100">
            {locais.length > 0
              ? locais.map((l, i) => (
                  <div key={l.id}
                    style={{ width: `${((d[l.id] || 0) / max) * 100}%`, background: CORES_BARRAS[i % CORES_BARRAS.length] }}
                    title={`${l.nome}: ${fmt(d[l.id] || 0)}`} />
                ))
              : <div className="bg-polo-navy h-full" style={{ width: `${(d.total / max) * 100}%` }} />
            }
          </div>
        </div>
      ))}
      {locais.length > 0 && (
        <div className="flex gap-4 pt-1 text-xs text-gray-500 flex-wrap">
          {locais.map((l, i) => (
            <span key={l.id} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: CORES_BARRAS[i % CORES_BARRAS.length] }} />
              {l.nome}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const CORES_DONUT = ['#1B2A41', '#C9A24B', '#B0413E', '#3E7C59', '#6B5B95', '#D97742', '#5B8DB8', '#888888'];

// Rosca: [{ label, valor }]
export function Donut({ dados, unidade = '' }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  if (!total) return <Vazio />;
  const R = 40, C = 2 * Math.PI * R;
  // Pré-calcula os arcos (fração acumulada) fora do JSX — sem reatribuição
  // dentro do render (regra react-hooks/immutability).
  const { arcos } = dados.reduce((acc, d, i) => ({
    acumulado: acc.acumulado + d.valor / total,
    arcos: [...acc.arcos, {
      label: d.label, i,
      dash: `${(d.valor / total) * C} ${C}`,
      offset: -acc.acumulado * C,
    }],
  }), { acumulado: 0, arcos: [] });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-28 h-28 flex-shrink-0" role="img"
        aria-label={`Gráfico de rosca. Total ${fmt(total)}${unidade}. ${dados.map(d => `${d.label}: ${fmt(d.valor)}${unidade}`).join(', ')}.`}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="#eee" strokeWidth="16" />
        {arcos.map(a => (
          <circle key={a.label} cx="50" cy="50" r={R} fill="none"
            stroke={CORES_DONUT[a.i % CORES_DONUT.length]} strokeWidth="16"
            strokeDasharray={a.dash} strokeDashoffset={a.offset}
            transform="rotate(-90 50 50)" />
        ))}
        <text x="50" y="54" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#1B2A41">{fmt(total)}</text>
      </svg>
      <div className="space-y-1 text-xs flex-1 min-w-0">
        {dados.map((d, i) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: CORES_DONUT[i % CORES_DONUT.length] }} />
            <span className="text-gray-700 truncate flex-1">{d.label}</span>
            <span className="text-gray-500 flex-shrink-0">{fmt(d.valor)}{unidade} ({Math.round((d.valor / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Linha/área diária: [{ data: 'YYYY-MM-DD', total }]
export function LinhaDias({ dados }) {
  if (dados.length < 2) return <Vazio msg={dados.length === 1 ? 'Apenas 1 dia no período — registre mais dias para ver a tendência.' : undefined} />;
  const W = 320, H = 110, PAD = 6;
  const max = Math.max(...dados.map(d => d.total)) || 1;
  const x = (i) => PAD + (i / (dados.length - 1)) * (W - PAD * 2);
  const y = (v) => H - PAD - (v / max) * (H - PAD * 2 - 14);
  const pontos = dados.map((d, i) => `${x(i)},${y(d.total)}`).join(' ');
  const area = `${PAD},${H - PAD} ${pontos} ${W - PAD},${H - PAD}`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Gráfico de linha do consumo diário ao longo de ${dados.length} dias. Pico de ${fmt(max)}.`}>
        <polygon points={area} fill="#C9A24B" opacity="0.18" />
        <polyline points={pontos} fill="none" stroke="#1B2A41" strokeWidth="2" strokeLinejoin="round" />
        {dados.map((d, i) => (
          <circle key={d.data} cx={x(i)} cy={y(d.total)} r="2.6" fill="#C9A24B" stroke="#1B2A41" strokeWidth="1" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-500 px-1">
        <span>{dados[0]?.data?.slice(5).split('-').reverse().join('/') || '—'}</span>
        <span>pico: {fmt(max)}</span>
        <span>{dados[dados.length - 1]?.data?.slice(5).split('-').reverse().join('/') || '—'}</span>
      </div>
    </div>
  );
}

// Barra de rendimento 0–100%
export function BarraRendimento({ pct }) {
  if (pct == null) return <span className="text-xs text-gray-500">—</span>;
  const cor = pct >= 90 ? 'bg-green-500' : pct >= 80 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

function Vazio({ msg = 'Sem dados no período.' }) {
  return <div className="text-center text-gray-500 text-xs py-6">{msg}</div>;
}
