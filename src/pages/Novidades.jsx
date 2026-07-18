import Layout from '../components/Layout';
import { NOVIDADES } from '../data/novidades';

// Lista completa de novidades — o cliente relê quando quiser (Config → Novidades).
export default function Novidades() {
  return (
    <Layout title="Novidades do app">
      <div className="space-y-4">
        {NOVIDADES.map(rel => (
          <div key={rel.versao} className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <p className="font-bold text-polo-navy">✨ {rel.titulo}</p>
              <span className="text-[11px] text-gray-400 flex-shrink-0">{rel.data}</span>
            </div>
            <ul className="space-y-1.5">
              {rel.itens.map((it, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-polo-gold flex-shrink-0">•</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {NOVIDADES.length === 0 && <p className="text-center text-gray-400 py-10">Nenhuma novidade por aqui ainda.</p>}
      </div>
    </Layout>
  );
}
