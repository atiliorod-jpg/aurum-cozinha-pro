import { useId, useState } from 'react';
import { motivosDaCasa, turnosDaCasa, MAX_MOTIVO } from '../../utils/desperdicio';
import { normalizarBusca } from '../../utils/busca';
import Icon from '../Icons';
import Botao from '../Botao';

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
      <div>
        <h2 className="titulo-secao">Motivos do descarte</h2>
        <p className="text-sm text-polo-tinta mt-0.5">Viram os botões rápidos do registro.</p>
      </div>
      {/* ⚠️ REDESIGN (26/11/2026): cada motivo é uma pílula com o × para tirar */}
      {motivos.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Motivos cadastrados">
          {motivos.map(m => (
            <li key={m} className="inline-flex items-center rounded-full border-2 border-polo-linha bg-polo-beige pl-4 max-w-full">
              <span className="text-sm font-bold text-polo-navy truncate">{m}</span>
              <button type="button" onClick={() => gravar(motivos.filter(x => x !== m))} aria-label={`Tirar o motivo ${m}`}
                className="w-11 h-11 rounded-full flex items-center justify-center text-polo-tinta flex-shrink-0">
                <Icon name="fechar" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-polo-tinta">Sem motivos: a equipe escreve cada um.</p>
      )}
      {/* flex-wrap: no celular o botão desce para a linha de baixo */}
      <div className="flex flex-wrap items-center gap-2 border-t border-polo-linha pt-3">
        <label htmlFor={`${id}-novo`} className="sr-only">Novo motivo</label>
        <input id={`${id}-novo`} value={novo} onChange={e => setNovo(e.target.value)} maxLength={MAX_MOTIVO} placeholder="Novo motivo"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
          className="campo flex-1 min-w-[12rem] !w-auto" />
        <Botao onClick={adicionar} largura="auto" className="px-4 flex-1 sm:flex-none"><Icon name="mais" size={18} />Adicionar</Botao>
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
      <div>
        <h2 className="titulo-secao">Turnos</h2>
        <p className="text-sm text-polo-tinta mt-0.5">O relatório separa o desperdício de cada um.</p>
      </div>
      {/* ⚠️ REDESIGN (26/11/2026): um cartão por turno, com sol ou lua pelo
          horário, e a régua do dia logo abaixo — mostra o que o horário
          digitado faz antes de salvar */}
      <div className="grid gap-3 sm:grid-cols-2">
        {atuais.map((t, i) => {
          const dia = !turnoDaNoite(t, atuais);
          return (
            <div key={t.nome} className="rounded-2xl border-2 border-polo-linha p-3 space-y-2">
              <p className="flex items-center gap-2.5 font-bold text-polo-navy">
                <span aria-hidden="true" className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${dia ? 'bg-polo-gold-100 text-polo-gold-700' : 'bg-polo-navy text-polo-gold'}`}>
                  <Icon name={dia ? 'sol' : 'lua'} size={20} />
                </span>
                {t.nome}
              </p>
              <div>
                <label htmlFor={`${id}-${i}`} className="rotulo"><span className="sr-only">{t.nome} </span>Começa às</label>
                <input id={`${id}-${i}`} type="time" value={t.inicio}
                  onChange={e => setRascunho(atuais.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)))}
                  className="campo" />
              </div>
            </div>
          );
        })}
      </div>
      <ReguaDosTurnos turnos={atuais} />
      <Botao onClick={salvar} disabled={!rascunho}>
        <Icon name="check" size={18} />{rascunho ? 'Salvar turnos' : 'Nenhuma alteração para salvar'}
      </Botao>
    </div>
  );
}

const minutosDe = (h) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(h || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/**
 * Lua ou sol? ⚠️ NÃO É PELO HORÁRIO: a "Noite" de uma casa começa às 16h,
 * e às 16h ainda é dia — o sol na Noite confundia. Primeiro o nome diz; sem
 * pista no nome, é da noite o turno que atravessa a meia-noite (o último).
 */
function turnoDaNoite(t, turnos) {
  const nome = normalizarBusca(String(t?.nome || ''));
  if (/noite|madrugada|fechamento/.test(nome)) return true;
  if (/manha|tarde|dia|almoco/.test(nome)) return false;
  const ordem = turnos.map(x => minutosDe(x.inicio)).filter(m => m !== null).sort((a, b) => a - b);
  const m = minutosDe(t?.inicio);
  return m !== null && ordem.length > 1 && m === ordem[ordem.length - 1] && ordem[0] > 0;
}
const fmtMarca = (min) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}${m ? `:${String(m).padStart(2, '0')}` : 'h'}`;
};

/**
 * A régua das 24 horas (redesign, 26/11/2026): começa no primeiro turno do
 * dia e dá a volta — dourado de dia, azul-marinho de noite —, com marcas a
 * cada 6 horas. Some enquanto algum horário está vazio ou repetido.
 */
function ReguaDosTurnos({ turnos }) {
  const lista = turnos
    .map(t => ({ ...t, min: minutosDe(t.inicio) }))
    .filter(t => t.min !== null)
    .sort((a, b) => a.min - b.min);
  if (lista.length !== turnos.length || new Set(lista.map(t => t.min)).size !== lista.length) return null;
  const inicio = lista[0].min;
  const trechos = lista.map((t, i) => {
    const fim = i + 1 < lista.length ? lista[i + 1].min : inicio + 24 * 60;
    return { ...t, dur: fim - t.min };
  });
  const descricao = trechos.map(t => `${t.nome} das ${fmtMarca(t.min)} às ${fmtMarca(t.min + t.dur)}`).join('; ');
  return (
    <div>
      <div role="img" aria-label={`O dia: ${descricao}`} className="flex h-9 rounded-xl overflow-hidden border-2 border-polo-linha">
        {trechos.map(t => (
          <div key={t.nome} style={{ width: `${(t.dur / 1440) * 100}%` }}
            className={`flex items-center justify-center text-xs font-bold truncate px-1 ${turnoDaNoite(t, turnos) ? 'bg-polo-navy text-polo-gold' : 'bg-polo-gold text-polo-navy'}`}>
            {t.nome}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-between text-xs font-semibold text-polo-tinta mt-1">
        {[0, 6, 12, 18, 24].map(h => <span key={h}>{fmtMarca(inicio + h * 60)}</span>)}
      </div>
    </div>
  );
}
