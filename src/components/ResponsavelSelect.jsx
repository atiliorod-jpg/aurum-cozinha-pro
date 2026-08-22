import { useApp } from '../store/AppContext';
import { Link } from 'react-router-dom';

export default function ResponsavelSelect({ value, onChange, label = 'Responsável' }) {
  const { pessoas } = useApp();

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {pessoas.length > 0 ? (
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Selecione...</option>
          {pessoas.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      ) : (
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Nenhuma pessoa cadastrada.{' '}
          <Link to="/configuracoes?secao=acessos" className="text-polo-navy font-semibold underline">Cadastrar equipe</Link>
        </div>
      )}
    </div>
  );
}
