import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { estoquesAtivos } from '../utils/instancias';
import Icon from './Icons';

/**
 * Escolhe qual estoque a TELA MOSTRA — sem trocar o que está aberto na operação.
 *
 * ⚠️ Esta é a diferença que motivou o componente. O seletor do cabeçalho chama
 * setModulo e muda onde a equipe vai LANÇAR. Este aqui só muda o que se está
 * OLHANDO. Antes os dois eram a mesma coisa, e abrir um relatório na
 * Administração trocava o estoque da cozinha embaixo do usuário.
 *
 * Aparece apenas quando há mais de um estoque — com um só, seria um seletor de
 * uma opção, que é ruído.
 */
// Opção extra para COMPARAR os estoques lado a lado, em vez de olhar um por
// vez. Só aparece com `comTodos` e mais de um estoque ativo — com um só não há
// o que comparar.
export const TODOS = 'todos';
const OPCAO_TODOS = { id: TODOS, icone: 'relatorio', nome: 'Todas as cozinhas', estabelecimento: '' };

export default function SeletorVisao({ valor, aoTrocar, comTodos = false }) {
  const { estoques } = useApp();
  const [aberto, setAberto] = useState(false);
  const ativos = estoquesAtivos(estoques);
  if (ativos.length <= 1) return null;

  const visiveis = comTodos ? [OPCAO_TODOS, ...ativos] : ativos;
  const atual = visiveis.find(e => e.id === valor) || visiveis[0];

  return (
    <div className="relative">
      <button onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="w-full flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 text-left">
        <span className="text-polo-navy flex-shrink-0"><Icon name={atual.icone} size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Mostrando</span>
          <span className="block text-sm font-bold text-polo-navy truncate">
            {atual.nome}{atual.estabelecimento ? ` · ${atual.estabelecimento}` : ''}
          </span>
        </span>
        <span className="text-gray-600 text-xs" aria-hidden="true">▾</span>
      </button>

      {aberto && (
        <>
          <button className="fixed inset-0 z-[60] cursor-default" aria-label="Fechar"
            onClick={() => setAberto(false)} />
          <div className="absolute z-[61] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {visiveis.map(e => (
              <button key={e.id}
                onClick={() => { aoTrocar(e.id); setAberto(false); }}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2 border-b border-gray-50 last:border-0
                  ${e.id === atual.id ? 'bg-polo-beige' : ''}`}>
                <span className="text-polo-navy flex-shrink-0"><Icon name={e.icone} size={20} /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-polo-navy truncate">{e.nome}</span>
                  {e.estabelecimento && <span className="block text-[11px] text-gray-600 truncate">{e.estabelecimento}</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
