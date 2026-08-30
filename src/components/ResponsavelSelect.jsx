import { useId } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../utils/produto';

export default function ResponsavelSelect({ value, onChange, label = 'Responsável' }) {
  const { pessoas } = useApp();
  const { sessao, impersonando } = useAuth();
  // useId porque este seletor aparece mais de uma vez por tela em algumas
  // partes do app — id repetido faz o rótulo apontar sempre para o primeiro.
  const id = useId();

  // ⚠️ O LINK MUDA COM O PLANO. Ele apontava fixo para /configuracoes?secao=acessos,
  // rota que NÃO EXISTE no plano Etiquetas — quem clicasse caía num beco, e
  // justamente na hora em que não tinha ninguém para assinar a etiqueta.
  const destino = ehSoEtiquetas(produtoAtivo(sessao, impersonando))
    ? '/ajustes'
    : '/configuracoes?secao=acessos';

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {pessoas.length > 0 ? (
        <select id={id} value={value} onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Selecione...</option>
          {pessoas.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      ) : (
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Nenhuma pessoa cadastrada.{' '}
          <Link to={destino} className="text-polo-navy font-semibold underline">Cadastrar equipe</Link>
        </div>
      )}
    </div>
  );
}
