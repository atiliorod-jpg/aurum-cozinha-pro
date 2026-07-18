import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { hoje } from '../utils/formatters';

// Checklist do turno de uma casa de PRODUÇÃO INTERNA (porcionamento/semiacabados).
// Passos ESSENCIAIS fecham o turno; os OPCIONAIS nunca travam o 100% — um dia
// com produção + envio e sem apara é um dia completo, não um "3/4 eterno".
const ESSENCIAIS = [
  {
    key: 'estoque',
    label: 'Produção / entrada',
    icon: '🍲',
    rota: '/registrar',
    hint: 'Execute as receitas de porcionamento/semiacabados do turno (ou registre a entrada de itens prontos).',
  },
  {
    key: 'saida',
    label: 'Saídas',
    icon: '📤',
    rota: '/saidas',
    hint: 'Registre o envio para a cozinha principal / outras unidades (transferência interna).',
  },
];
const OPCIONAIS = [
  {
    key: 'etiqueta',
    label: 'Etiquetas',
    icon: '🏷️',
    rota: '/etiquetas',
    hint: 'Imprima a validade dos potes após produzir ou dar entrada (recomendado).',
  },
  {
    key: 'apara',
    label: 'Aparas/perdas',
    icon: '✂️',
    rota: '/aparas',
    hint: 'Se houve limpeza/porcionamento com apara ou perda, registre aqui.',
  },
];

export default function GuideTour() {
  const { prefs, entradas, saidas, aparas, desperdicio } = useApp();

  const dt = hoje();
  const dismissKey = `guia_dismiss_${dt}`;

  const [dispensado, setDispensado] = useState(() => !!localStorage.getItem(dismissKey));

  // guia ligado por padrão; só oculta quando explicitamente desligado (false)
  if (prefs.guia === false || dispensado) return null;

  const feitos = {
    // produção OU entrada avulsa contam — dia só de produção não fica "incompleto"
    estoque: entradas.some(e => e.data === dt),
    // só conta saída para a cozinha/unidades — a saída interna de produção
    // (destino 'producao') não fecha a etapa "Saídas" do turno
    saida: saidas.some(s => s.data === dt && s.destino !== 'producao'),
    // opcionais: registrados = ✅; sem registro = "não se aplica" (não trava)
    apara: aparas.some(a => a.data === dt) || desperdicio.some(p => p.data === dt),
    etiqueta: false, // sem detecção de impressão — fica como lembrete com link
  };

  const proximoPasso = ESSENCIAIS.find(p => !feitos[p.key]);
  const completos = !proximoPasso;
  const nFeitos = ESSENCIAIS.filter(p => feitos[p.key]).length;
  const pct = Math.round((nFeitos / ESSENCIAIS.length) * 100);

  const dispensar = () => {
    localStorage.setItem(dismissKey, '1');
    setDispensado(true);
  };

  return (
    <div className="bg-polo-beige border border-polo-gold/40 rounded-xl px-3 pt-2.5 pb-3 mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-bold text-polo-navy">📋 Fluxo do turno — produção da casa · {nFeitos}/{ESSENCIAIS.length}</p>
        <button onClick={dispensar} aria-label="Dispensar guia por hoje"
          className="text-gray-500 text-lg font-bold leading-none min-w-11 min-h-11 flex items-center justify-center -mr-2">×</button>
      </div>

      {/* Barra de progresso (só os essenciais contam) */}
      <div className="h-1.5 bg-white/70 rounded-full overflow-hidden mb-2.5" role="progressbar"
        aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso dos passos essenciais do turno">
        <div className={`h-full rounded-full transition-all duration-500 ${completos ? 'bg-green-500' : 'bg-polo-gold'}`}
          style={{ width: `${pct}%` }} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {ESSENCIAIS.map(p => {
          const feito = feitos[p.key];
          const isProximo = p === proximoPasso;
          return (
            <Link key={p.key} to={p.rota}
              aria-current={isProximo ? 'step' : undefined}
              className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                ${feito
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : isProximo
                    ? 'bg-polo-navy text-polo-gold border-polo-navy ring-2 ring-polo-gold/40'
                    : 'bg-white text-gray-400 border-gray-200'}`}>
              <span>{feito ? '✅' : p.icon}</span>
              <span>{p.label}</span>
            </Link>
          );
        })}
        {OPCIONAIS.map(p => {
          const feito = feitos[p.key];
          const naoSeAplica = p.key === 'apara' && !feito;
          return (
            <Link key={p.key} to={p.rota} title={p.hint}
              className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border border-dashed transition-colors
                ${feito ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white/60 text-gray-400 border-gray-300'}`}>
              <span>{feito ? '✅' : p.icon}</span>
              <span>{p.label}{naoSeAplica ? ' (se houver)' : ''}</span>
            </Link>
          );
        })}
      </div>

      {completos ? (
        <p className="text-[11px] text-green-700 font-semibold mt-2 leading-tight">
          🎉 Essenciais do turno ok! Etiquetas e aparas ficam ao lado se precisar.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2 mt-2">
          <p className="text-[11px] text-polo-navy leading-tight flex-1">
            → <strong>{proximoPasso.label}:</strong> {proximoPasso.hint}
          </p>
          <Link to={proximoPasso.rota}
            className="flex-shrink-0 text-[11px] font-bold text-polo-gold bg-polo-navy rounded-lg px-2.5 py-1.5">
            Ir agora →
          </Link>
        </div>
      )}
    </div>
  );
}
