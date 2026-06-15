import { useState, useRef, useMemo, useEffect } from 'react';

export default function AutocompleteInput({
  value,
  onChange,
  sugestoes = [],
  placeholder = '',
  className = '',
}) {
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(-1);
  const ref = useRef(null);

  const filtrados = useMemo(() => {
    const v = value.trim().toLowerCase();
    if (!v) return sugestoes.slice(0, 14);
    return sugestoes
      .filter(s => s.toLowerCase().includes(v))
      .sort((a, b) => {
        const ai = a.toLowerCase().startsWith(v) ? 0 : 1;
        const bi = b.toLowerCase().startsWith(v) ? 0 : 1;
        if (ai !== bi) return ai - bi;
        return a.localeCompare(b);
      })
      .slice(0, 14);
  }, [value, sugestoes]);

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selecionar = (s) => {
    onChange(s);
    setAberto(false);
    setDestaque(-1);
  };

  const handleKeyDown = (e) => {
    if (!aberto || filtrados.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDestaque(d => Math.min(d + 1, filtrados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestaque(d => Math.max(d - 1, -1));
    } else if (e.key === 'Enter' && destaque >= 0) {
      e.preventDefault();
      selecionar(filtrados[destaque]);
    } else if (e.key === 'Escape') {
      setAberto(false);
      setDestaque(-1);
    }
  };

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setAberto(true); setDestaque(-1); }}
        onFocus={() => setAberto(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {aberto && filtrados.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-56 overflow-y-auto"
        >
          {filtrados.map((s, i) => (
            <li key={s} role="option" aria-selected={destaque === i}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-50 last:border-0 transition-colors
                  ${destaque === i
                    ? 'bg-polo-beige text-polo-navy font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'}`}
                onMouseDown={() => selecionar(s)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
