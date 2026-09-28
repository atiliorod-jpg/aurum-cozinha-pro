import { useId, useState } from 'react';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { pode } from '../utils/permissoes';

export default function ResponsavelSelect({ value, onChange, label = 'Responsável' }) {
  const { pessoas, addPessoa, permissoes } = useApp();
  const { sessao } = useAuth();
  // useId porque este seletor aparece mais de uma vez por tela em algumas
  // partes do app — id repetido faz o rótulo apontar sempre para o primeiro.
  const id = useId();
  const [novo, setNovo] = useState('');

  // ⚠️ CADASTRA AQUI MESMO (28/09/2026). Era um link "Cadastrar equipe" — mas
  // este seletor mora dentro da JANELA DE IMPRIMIR, que não fecha quando a
  // rota muda: a tela trocava por trás e a janela continuava na frente. E
  // para o cozinheiro (sem acesso à Administração) o link voltava ao início.
  // Quem pode configurar escreve o nome ali; quem não pode sabe a quem pedir.
  const podeCadastrar = pode(sessao, permissoes, 'configurarSistema');
  const adicionar = () => {
    const n = novo.trim();
    if (!n) return;
    addPessoa(n);
    onChange(n);
    setNovo('');
  };

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {pessoas.length > 0 ? (
        <select id={id} value={value} onChange={e => onChange(e.target.value)}
          className="w-full min-h-11 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Selecione...</option>
          {pessoas.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      ) : podeCadastrar ? (
        <div className="flex gap-2">
          <input id={id} type="text" value={novo} onChange={e => setNovo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
            placeholder="Nome de quem assina"
            className="flex-1 min-w-0 min-h-11 border border-gray-200 rounded-lg px-3 text-base" />
          <button type="button" onClick={adicionar}
            className="min-h-11 px-4 rounded-lg bg-polo-navy text-polo-gold text-sm font-bold flex-shrink-0">
            Adicionar
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          Ninguém cadastrado para assinar. Peça ao responsável da casa para cadastrar os nomes em Administração.
        </p>
      )}
    </div>
  );
}
