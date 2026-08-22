// Ícones de linha (estilo Lucide) — herdam a cor do texto via currentColor.
//
// ⚠️ TODO ícone de interface sai daqui. O app usava emoji como ícone em ~50
// pontos, incluindo a identidade dos três estoques e os quadrados de 48 px dos
// hubs. Emoji renderiza Apple no iPad, Noto no Android e Segoe no Windows —
// três aparências para a mesma tela — e nunca aceita o navy/dourado da marca
// (🍲 é laranja, 🧊 é azul, num app que é azul-marinho e ouro).
//
// Emoji só pode sobreviver em texto corrido de ajuda, nunca como ícone, rótulo
// de aba, marcador de estado ou identidade de estoque.

const PATHS = {
  inicio: (
    <>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  compras: (
    <>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </>
  ),
  entradas: (
    <>
      <path d="M12 17V3" />
      <path d="m6 11 6 6 6-6" />
      <path d="M19 21H5" />
    </>
  ),
  saidas: (
    <>
      <path d="m18 9-6-6-6 6" />
      <path d="M12 3v14" />
      <path d="M5 21h14" />
    </>
  ),
  correcoes: (
    <>
      <circle cx="6" cy="6" r="3" />
      <path d="M8.12 8.12 12 12" />
      <path d="M20 4 8.12 15.88" />
      <circle cx="6" cy="18" r="3" />
      <path d="M14.8 14.8 20 20" />
    </>
  ),
  registrar: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </>
  ),
  producao: (
    <>
      <path d="M2 12h20" />
      <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
      <path d="m4 8 16-4" />
      <path d="m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8" />
    </>
  ),
  fichas: (
    <>
      <path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z" />
      <path d="M6 17h12" />
    </>
  ),
  relatorio: (
    <>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  config: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  historico: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  // ⚠️ Este é o RELÓGIO da aba Validades — antes se chamava 'etiqueta', o que
  // deixava o nome livre para o desenho errado. Sem ele a aba aparecia vazia na
  // barra: numa cozinha a pessoa mira pela forma, não pelo texto de 11 px.
  validade: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2" />
      <path d="M5 3 2.5 5.5" />
      <path d="m19 3 2.5 2.5" />
    </>
  ),

  // ── Identidade dos três estoques ──────────────────────────────────────
  // faca de chef — Cozinha de Produção
  faca: (
    <>
      <path d="M3 21 9 15" />
      <path d="M15.5 3.5 20 8 9.5 18.5 5 14z" />
      <path d="m4.5 13.5 6 6" />
    </>
  ),
  // frigideira — Cozinha de Finalização
  frigideira: (
    <>
      <circle cx="10" cy="13" r="7" />
      <path d="M17 10h5" />
      <path d="M10 6a4 4 0 0 1 0 4" />
    </>
  ),
  // pote de mantimento — Estoque Seco
  mantimento: (
    <>
      <path d="M6 8h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
      <path d="M8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3" />
      <path d="M9 13h6" />
    </>
  ),

  // ── Ações e telas ─────────────────────────────────────────────────────
  etiqueta: (
    <>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  impressora: (
    <>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </>
  ),
  perda: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  contagem: (
    <>
      <path d="m15 5 4 4" />
      <path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13" />
      <path d="m8 6 2 2" />
      <path d="M18 12 9.7 20.3a2.41 2.41 0 0 1-3.4 0l-2.6-2.6a2.41 2.41 0 0 1 0-3.4L12 6" />
      <path d="m16 10 2 2" />
    </>
  ),
  calculadora: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8" />
      <path d="M8 11h.01M12 11h.01M16 11h.01" />
      <path d="M8 15h.01M12 15h.01M16 15h.01" />
      <path d="M8 19h.01M12 19h.01M16 19h.01" />
    </>
  ),
  financeiro: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5a3 3 0 0 0-3-1.5c-1.5 0-2.5.8-2.5 2s1 1.8 2.5 2 2.5.8 2.5 2-1 2-2.5 2a3 3 0 0 1-3-1.5" />
      <path d="M12 6v1.5M12 16.5V18" />
    </>
  ),
  balanco: (
    <>
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="m3 12 2-5 2 5a2 2 0 0 1-4 0" />
      <path d="m17 12 2-5 2 5a2 2 0 0 1-4 0" />
    </>
  ),
  equipe: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  estabelecimento: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V8l7-5 7 5v13" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  auditoria: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
      <path d="M11 8v3l2 1.5" />
    </>
  ),
  cadeado: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  alerta: (
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  busca: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </>
  ),
  caixa: (
    <>
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  lista: (
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  cartao: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </>
  ),
  camera: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  congelado: (
    <>
      <path d="M12 2v20" />
      <path d="m4.93 7.5 14.14 9" />
      <path d="m4.93 16.5 14.14-9" />
      <path d="M9 4.5 12 7l3-2.5" />
      <path d="M9 19.5 12 17l3 2.5" />
    </>
  ),
  resfriado: (
    <>
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </>
  ),
  ideia: (
    <>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M8 14a6 6 0 1 1 8 0c-.7.6-1 1.3-1 2H9c0-.7-.3-1.4-1-2Z" />
    </>
  ),
  suporte: (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </>
  ),
};

export default function Icon({ name, size = 20, strokeWidth = 2, className = '' }) {
  const d = PATHS[name];
  // Nome desconhecido não pode virar um SVG vazio no meio de um botão. Em
  // desenvolvimento isso GRITA no console — um ícone com nome errado renderiza
  // um buraco que ninguém percebe revisando o diff.
  if (!d) {
    if (import.meta.env.DEV) console.warn(`Ícone desconhecido: "${name}"`);
    return null;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      {d}
    </svg>
  );
}
