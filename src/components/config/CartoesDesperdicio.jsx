import { useId, useState } from 'react';
import { motivosDaCasa, turnosDaCasa, MAX_MOTIVO } from '../../utils/desperdicio';

// =====================================================================
//  ADMINISTRAÇÃO → DESPERDÍCIO (24/11/2026): os motivos (botões rápidos do
//  registro) e o horário de cada turno (Manhã e Noite, decisão do dono).
//  Ficam nas preferências da conta (prefs), que sobem por chave e valem em
//  todos os aparelhos.
// =====================================================================

export function CartaoMotivosDescarte({ prefs, setPref, toast }) {
  const id = useId();
  const motivos = motivosDaCasa(prefs);
  const [novo, setNovo] = useState('');
  const gravar = (lista) => setPref('motivosDescarte', lista);
  const adicionar = () => {
    const m = novo.trim().slice(0, MAX_MOTIVO);
    if (!m) return;
    if (motivos.some(x => x.toLowerCase() === m.toLowerCase())) { toast('Esse motivo já está na lista.', 'aviso'); return; }
    gravar([...motivos, m]);
    setNovo('');
  };
  return (
    <div className="cartao space-y-3">
      <h2 className="text-sm font-bold text-polo-navy">Motivos do descarte</h2>
      <ul className="divide-y divide-gray-100 border-y border-gray-100">
        {motivos.map(m => (
          <li key={m} className="flex items-center justify-between gap-2 py-1">
            <span className="text-base text-polo-navy">{m}</span>
            <button type="button" onClick={() => gravar(motivos.filter(x => x !== m))} aria-label={`Tirar o motivo ${m}`}
              className="min-h-11 px-3 rounded-xl text-red-700 font-bold text-sm">Tirar</button>
          </li>
        ))}
        {!motivos.length && <li className="py-2 text-sm text-gray-600">Sem motivos: a equipe escreve cada um.</li>}
      </ul>
      <div className="flex gap-2">
        <label htmlFor={`${id}-novo`} className="sr-only">Novo motivo</label>
        <input id={`${id}-novo`} value={novo} onChange={e => setNovo(e.target.value)} maxLength={MAX_MOTIVO} placeholder="Novo motivo"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
          className="flex-1 min-w-0 min-h-11 rounded-xl border-[3px] border-polo-navy/15 px-3 text-base text-polo-navy" />
        <button type="button" onClick={adicionar} className="min-h-11 px-4 rounded-xl bg-polo-navy text-polo-gold font-bold text-sm">Adicionar</button>
      </div>
    </div>
  );
}

export function CartaoTurnosDescarte({ prefs, setPref, toast }) {
  const id = useId();
  const turnos = turnosDaCasa(prefs);
  const [rascunho, setRascunho] = useState(null);
  const atuais = rascunho || turnos;
  const salvar = () => {
    // ⚠️ HORÁRIO APAGADO (auditoria 24/11/2026): o turno sem hora sumia da
    // lista ao salvar (turnosDaCasa descarta hora inválida) e não havia como
    // pôr de volta
    if (atuais.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.inicio || ''))) { toast('Preencha o horário de cada turno.', 'aviso'); return; }
    if (new Set(atuais.map(t => t.inicio)).size !== atuais.length) { toast('Os turnos precisam começar em horários diferentes.', 'aviso'); return; }
    setPref('turnosDescarte', atuais);
    setRascunho(null);
    toast('Turnos salvos.', 'sucesso');
  };
  return (
    <div className="cartao space-y-3">
      <h2 className="text-sm font-bold text-polo-navy">Turnos</h2>
      <div className="grid grid-cols-2 gap-3">
        {atuais.map((t, i) => (
          <div key={t.nome}>
            <label htmlFor={`${id}-${i}`} className="block text-xs font-bold uppercase text-gray-600 mb-1">{t.nome} começa às</label>
            <input id={`${id}-${i}`} type="time" value={t.inicio}
              onChange={e => setRascunho(atuais.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)))}
              className="w-full min-h-11 rounded-xl border-[3px] border-polo-navy/15 px-3 text-base text-polo-navy" />
          </div>
        ))}
      </div>
      {rascunho && (
        <button type="button" onClick={salvar} className="w-full min-h-12 rounded-xl bg-polo-navy text-polo-gold font-bold">Salvar turnos</button>
      )}
    </div>
  );
}
