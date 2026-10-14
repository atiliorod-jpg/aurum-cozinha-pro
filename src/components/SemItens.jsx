import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { pode } from '../utils/permissoes';

// ⚠️ LISTA VAZIA DIZ O QUE FAZER (14/10/2026). Desde que a conta nova começa
// sem itens, "Nenhum produto encontrado" virou a primeira coisa que o dono via
// em Entradas e Saídas — sem dizer onde se cadastra. Quem pode cadastrar ganha
// o caminho; quem não pode sabe a quem pedir.
export default function SemItens() {
  const { permissoes } = useApp();
  const { sessao } = useAuth();
  return (
    <div className="text-center py-6 px-4">
      <p className="text-sm text-gray-700">Você ainda não tem itens neste estoque.</p>
      {pode(sessao, permissoes, 'gerenciarProdutos') ? (
        <Link to="/itens"
          className="inline-flex items-center justify-center min-h-11 mt-3 bg-polo-navy text-polo-gold font-bold px-5 rounded-xl text-sm">
          Cadastrar itens
        </Link>
      ) : (
        <p className="text-xs text-gray-600 mt-1">Peça a quem administra a conta para cadastrar os itens em Meus itens.</p>
      )}
    </div>
  );
}
