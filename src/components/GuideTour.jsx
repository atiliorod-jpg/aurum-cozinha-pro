import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { hoje } from '../utils/formatters';

const PASSOS = [
  {
    key: 'entrada',
    label: 'Entradas',
    icon: '📥',
    rota: '/entradas',
    hint: 'Registre tudo que chegou do fornecedor hoje.',
  },
  {
    key: 'apara',
    label: 'Aparas',
    icon: '✂️',
    rota: '/aparas',
    hint: 'Registre aparas e perdas da limpeza e porcionamento.',
  },
  {
    key: 'producao',
    label: 'Produção',
    icon: '🍲',
    rota: '/registrar',
    hint: 'Execute as receitas planejadas para o turno.',
  },
  {
    key: 'saida',
    label: 'Saídas',
    icon: '📤',
    rota: '/saidas',
    hint: 'Registre o que foi enviado para cada polo/restaurante.',
  },
];

export default function GuideTour() {
  const { prefs, entradas, saidas, aparas } = useApp();

  const dt = hoje();
  const dismissKey = `guia_dismiss_${dt}`;

  const [dispensado, setDispensado] = useState(() => !!localStorage.getItem(dismissKey));

  // guia ligado por padrão; só oculta quando explicitamente desligado (false)
  if (prefs.guia === false || dispensado) return null;

  const feitos = {
    entrada:  entradas.some(e => e.data === dt && !e.producaoId),
    apara:    aparas.some(a => a.data === dt),
    producao: entradas.some(e => e.data === dt && !!e.producaoId),
    saida:    saidas.some(s => s.data === dt),
  };

  const proximoPasso = PASSOS.find(p => !feitos[p.key]);
  const todos = !proximoPasso;

  const dispensar = () => {
    localStorage.setItem(dismissKey, '1');
    setDispensado(true);
  };

  return (
    <div className="bg-polo-beige border border-polo-gold/40 rounded-xl px-3 pt-2.5 pb-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-polo-navy">📋 Fluxo do turno</p>
        <button onClick={dispensar} aria-label="Dispensar guia por hoje"
          className="text-gray-500 text-lg font-bold leading-none min-w-11 min-h-11 flex items-center justify-center -mr-2">×</button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {PASSOS.map(p => {
          const feito = feitos[p.key];
          const isProximo = p === proximoPasso;
          return (
            <Link key={p.key} to={p.rota}
              className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                ${feito
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : isProximo
                    ? 'bg-polo-navy text-polo-gold border-polo-navy'
                    : 'bg-white text-gray-400 border-gray-200'}`}>
              <span>{feito ? '✅' : p.icon}</span>
              <span>{p.label}</span>
            </Link>
          );
        })}
      </div>

      <p className="text-[11px] text-polo-navy mt-2 leading-tight">
        {todos
          ? '🎉 Fluxo do turno completo! Tudo registrado.'
          : <>→ <strong>{proximoPasso.label}:</strong> {proximoPasso.hint}</>}
      </p>
    </div>
  );
}
