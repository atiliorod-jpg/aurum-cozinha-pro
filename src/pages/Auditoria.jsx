import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';

const fmtQuando = (ts) => {
  const d = new Date(ts);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const COR_ACAO = (acao) =>
  acao.startsWith('registrou') ? 'bg-green-100 text-green-700' :
  acao.startsWith('removeu') ? 'bg-red-100 text-red-600' :
  acao.startsWith('apagou') ? 'bg-red-200 text-red-800' :
  'bg-blue-100 text-blue-700';

export default function Auditoria() {
  const { auditoria } = useApp();
  const [filtroUsuario, setFiltroUsuario] = useState('TODOS');
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState('7'); // dias ou 'todos'

  const usuarios = useMemo(() => [...new Set(auditoria.map(a => a.usuario))].sort(), [auditoria]);

  const registros = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- "agora" é a referência do filtro de período; um corte levemente defasado até o próximo recálculo do memo é aceitável
    const corte = periodo !== 'todos' ? new Date(Date.now() - parseInt(periodo) * 86400000).getTime() : 0;
    return [...auditoria]
      .reverse()
      .filter(a => corte === 0 || (a.ts || 0) >= corte)
      .filter(a => filtroUsuario === 'TODOS' || a.usuario === filtroUsuario)
      .filter(a => !busca || `${a.acao} ${a.detalhe}`.toLowerCase().includes(busca.toLowerCase()))
      .slice(0, 300);
  }, [auditoria, filtroUsuario, busca, periodo]);

  return (
    <Layout title="Histórico de Mudanças">
      <div className="bg-polo-beige border border-polo-gold/40 rounded-xl p-3 text-xs text-polo-navy mb-4">
        🔍 Registro automático de tudo que cada usuário fez no sistema. Visível apenas para Gerência e Diretoria.
      </div>

      <div className="space-y-2 mb-4">
        <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="🔍 Buscar ação ou item..."
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {[['7', 'Últimos 7d'], ['30', 'Últimos 30d'], ['90', 'Últimos 90d'], ['todos', 'Tudo']].map(([v, l]) => (
            <button key={v} onClick={() => setPeriodo(v)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0
                ${periodo === v ? 'bg-polo-navy text-polo-gold' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {['TODOS', ...usuarios].map(u => (
            <button key={u} onClick={() => setFiltroUsuario(u)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0
                ${filtroUsuario === u ? 'bg-polo-gold text-polo-navy' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {u === 'TODOS' ? 'Todos usuários' : u}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {registros.length === 0 && (
          <div className="text-center text-gray-500 py-12 text-sm">Nenhuma mudança registrada ainda.</div>
        )}
        {registros.map(a => (
          <div key={a.id} className="bg-white rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-polo-navy">{a.usuario}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${COR_ACAO(a.acao)}`}>{a.acao}</span>
              <span className="text-[10px] text-gray-500 ml-auto">{fmtQuando(a.ts)}</span>
            </div>
            {a.detalhe && <p className="text-xs text-gray-600 mt-1">{a.detalhe}</p>}
          </div>
        ))}
        {auditoria.length > 300 && registros.length === 300 && (
          <p className="text-center text-[10px] text-gray-500 py-2">Mostrando as 300 mudanças mais recentes.</p>
        )}
      </div>
    </Layout>
  );
}
