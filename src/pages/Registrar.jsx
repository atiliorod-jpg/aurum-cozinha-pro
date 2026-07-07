import Layout from '../components/Layout';
import { Link } from 'react-router-dom';

const SECOES = [
  {
    label: 'Recebimento',
    desc: 'O que chegou do fornecedor',
    acoes: [
      { to: '/compras', emoji: '🛒', titulo: 'Compra', desc: 'Registrar matéria-prima recebida' },
    ],
  },
  {
    label: 'Estoque interno',
    desc: 'Produção e entradas que alimentam o estoque',
    acoes: [
      { to: '/producao', emoji: '🍲', titulo: 'Produção', desc: 'Executar receita — baixa ingredientes e entra produto final' },
      { to: '/entradas', emoji: '📥', titulo: 'Entrada avulsa', desc: 'Produto pronto sem receita (ex.: item comprado pronto)' },
    ],
  },
  {
    label: 'Saída e correções',
    desc: 'Envios e ajustes',
    acoes: [
      { to: '/saidas',  emoji: '📤', titulo: 'Saída',         desc: 'Envio para os pontos de venda' },
      { to: '/aparas',  emoji: '✂️', titulo: 'Apara / Perda', desc: 'Aproveitamento e descarte' },
    ],
  },
  {
    label: 'Identificação',
    desc: 'Etiquetas de validade para os potes e embalagens',
    acoes: [
      { to: '/etiquetas', emoji: '🏷️', titulo: 'Etiquetas', desc: 'Imprimir etiquetas do estoque ou avulsas' },
    ],
  },
];

export default function Registrar() {
  return (
    <Layout title="Registrar">
      <div className="space-y-5">
        {SECOES.map(s => (
          <div key={s.label}>
            <div className="mb-2 px-1">
              <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">{s.label}</p>
              <p className="text-[11px] text-gray-400">{s.desc}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {s.acoes.map(a => (
                <Link key={a.to} to={a.to}
                  className="bg-white rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform border border-gray-100
                             focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
                  <span className="w-12 h-12 rounded-xl bg-polo-beige flex items-center justify-center text-2xl flex-shrink-0">{a.emoji}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-polo-navy">{a.titulo}</div>
                    <div className="text-xs text-gray-500">{a.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
