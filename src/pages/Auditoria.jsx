import { useState, useMemo } from 'react';
import Filtros from '../components/ui/Filtros';
import Vazio from '../components/ui/Vazio';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { casaBusca } from '../utils/busca';

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
      .filter(a => casaBusca(busca, a.acao, a.detalhe))
      .slice(0, 300);
  }, [auditoria, filtroUsuario, busca, periodo]);

  return (
    <Layout title="Histórico de Mudanças" area="admin">
      {/* O aviso saiu: o título da tela já diz o que ela é, e a afirmação
          "visível apenas para Gerência e Diretoria" ficou FALSA quando a matriz
          de permissões passou a permitir liberar a trilha para a cozinha. */}
      <div className="space-y-2 mb-4">
        <input aria-label="Buscar ação ou item" type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar ação ou item..."
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
        <Filtros rotulo="Período" todos={null} valor={periodo} aoTrocar={setPeriodo}
          opcoes={[['7', 'Últimos 7d'], ['30', 'Últimos 30d'], ['90', 'Últimos 90d'], ['todos', 'Tudo']]} />
        <Filtros rotulo="Quem mexeu" todos={null} ativo="dourado" valor={filtroUsuario} aoTrocar={setFiltroUsuario}
          opcoes={['TODOS', ...usuarios].map(u => [u, u === 'TODOS' ? 'Todos usuários' : u])} />
      </div>

      <div className="space-y-2">
        {registros.length === 0 && (
          <Vazio texto="Nenhuma mudança registrada ainda." />
        )}
        {registros.map(a => (
          <div key={a.id} className="bg-white rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-polo-navy">{a.usuario}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COR_ACAO(a.acao)}`}>{a.acao}</span>
              <span className="text-xs text-gray-500 ml-auto">{fmtQuando(a.ts)}</span>
            </div>
            {a.detalhe && <p className="text-xs text-gray-600 mt-1">{a.detalhe}</p>}
          </div>
        ))}
        {auditoria.length > 300 && registros.length === 300 && (
          <p className="text-center text-xs text-gray-500 py-2">Mostrando as 300 mudanças mais recentes.</p>
        )}
      </div>
    </Layout>
  );
}
