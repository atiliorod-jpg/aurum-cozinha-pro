import { useEffect, useId, useState } from 'react';
import Dialogo from './Dialogo';
import Icon from './Icons';
import { CampoNumerico } from './ui/TecladoNumerico';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { fmtData, isoLocal } from '../utils/formatters';
import { conferirDescarte, fmtQtd, motivosDaCasa, turnoDe, turnosDaCasa, MAX_MOTIVO } from '../utils/desperdicio';
import { novoIdDeDescarte, registrarDescarte } from '../lib/descartes';

// =====================================================================
//  O REGISTRO DE UM DESCARTE (24/11/2026, o checklist do Magurō)
//  A pessoa só diz QUANTO e POR QUÊ. Data, hora e turno saem sozinhos;
//  responsável é quem entrou pelo nome. Sem internet, fica guardado e sobe
//  sozinho depois (lib/descartes.js), com a hora em que foi feito.
//  `inicial`: { id, nome, unidade, quantidade } do item, ou { livre: true, nome }.
// =====================================================================
const horaDe = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function JanelaDescarte({ inicial, responsavel, aoFechar, aoRegistrar }) {
  const { prefs, rid } = useApp();
  const { sessao } = useAuth();
  const { toast } = useUI();
  const id = useId();
  const [nome, setNome] = useState(inicial.livre ? (inicial.nome || '') : inicial.nome);
  const [qtd, setQtd] = useState(inicial.quantidade ? String(inicial.quantidade) : '');
  const [unidade, setUnidade] = useState(inicial.unidade === 'unid' ? 'unid' : 'kg');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 15000); return () => clearInterval(t); }, []);

  const motivos = motivosDaCasa(prefs);
  const turnos = turnosDaCasa(prefs);
  const quantidade = Number(String(qtd).replace(',', '.')) || 0;

  const confirmar = async () => {
    if (salvando) return;
    try {
      conferirDescarte({ itemNome: nome, quantidade, unidade, motivo });
    } catch (e) { setErro(e.message); return; }
    setSalvando(true);
    const quando = new Date();
    const linha = {
      id: novoIdDeDescarte(), quando: quando.toISOString(), turno: turnoDe(quando, turnos),
      item_id: inicial.livre ? null : inicial.id, item_nome: nome.trim(),
      quantidade: Math.round(quantidade * 1000) / 1000, unidade, motivo: motivo.trim(),
      responsavel: responsavel || '',
    };
    const r = await registrarDescarte({ rid, demo: !!sessao?.demo }, linha);
    toast(r.enviado
      ? `Descarte registrado: ${linha.item_nome} · ${fmtQtd(linha.quantidade, unidade)}`
      : `Sem internet: ${linha.item_nome} · ${fmtQtd(linha.quantidade, unidade)} ficou guardado e vai sozinho quando a conexão voltar.`,
    r.enviado ? 'sucesso' : 'aviso');
    aoRegistrar();
  };

  // ⚠️ CABE NA TELA SEM ROLAR (regra do dono): os motivos em duas colunas,
  // e data, hora, turno e responsável numa linha só
  const chip = (sel) => `min-h-11 px-2 rounded-xl font-bold text-sm leading-tight border-[3px]
    ${sel ? 'bg-polo-gold border-polo-gold text-polo-navy' : 'bg-white border-polo-navy/15 text-polo-navy'}`;

  return (
    <Dialogo aoFechar={aoFechar} titulo={inicial.livre ? 'Item fora da lista' : inicial.nome} forma="ficha" largura="lg" classeCaixa="space-y-4">
      <dl className="flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-polo-beige border-2 border-polo-navy/10 px-3 py-2 text-sm text-polo-navy">
        {[['Data', fmtData(isoLocal(agora))], ['Hora', horaDe(agora)], ['Turno', turnoDe(agora, turnos)], ['Responsável', responsavel || '—']].map(([r, v]) => (
          <div key={r} className="flex gap-1"><dt className="text-gray-600">{r}</dt><dd className="font-bold">{v}</dd></div>
        ))}
      </dl>

      {inicial.livre && (
        <div>
          <label htmlFor={`${id}-nome`} className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">Item</label>
          <input id={`${id}-nome`} value={nome} onChange={e => { setNome(e.target.value); setErro(''); }} maxLength={120}
            placeholder="Nome do item" className="w-full min-h-14 rounded-2xl border-[3px] border-polo-navy/15 focus:border-polo-navy px-4 text-lg text-polo-navy" />
        </div>
      )}

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-600 mb-1" aria-hidden="true">Quantidade descartada</p>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-stretch">
          <CampoNumerico valor={qtd} aoMudar={(v) => { setQtd(v); setErro(''); }} rotulo="Quantidade descartada"
            titulo={`Quantidade — ${nome || 'descarte'}`} unidade={unidade} decimal={unidade === 'kg'}
            className="w-full min-h-14 rounded-2xl border-[3px] border-polo-navy/15 focus:border-polo-navy px-4 text-2xl font-extrabold text-polo-navy" />
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Unidade">
            {['kg', 'unid'].map(u => (
              <button key={u} type="button" role="radio" aria-checked={unidade === u} onClick={() => setUnidade(u)}
                className={`min-h-14 px-4 rounded-xl font-bold text-base border-[3px]
                  ${unidade === u ? 'bg-polo-navy border-polo-navy text-polo-gold' : 'bg-white border-polo-navy/15 text-polo-navy'}`}>{u}</button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p id={`${id}-motivo`} className="text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">Motivo do descarte</p>
        {motivos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-3" role="radiogroup" aria-labelledby={`${id}-motivo`}>
            {motivos.map(m => (
              <button key={m} type="button" role="radio" aria-checked={motivo === m}
                onClick={() => { setMotivo(m); setErro(''); }} className={chip(motivo === m)}>{m}</button>
            ))}
          </div>
        )}
        <label htmlFor={`${id}-outro`} className="block text-xs font-semibold text-gray-600 mb-1">Outro motivo</label>
        <input id={`${id}-outro`} value={motivos.includes(motivo) ? '' : motivo} maxLength={MAX_MOTIVO * 5}
          onChange={e => { setMotivo(e.target.value); setErro(''); }} placeholder="Escreva o motivo"
          className="w-full min-h-12 rounded-xl border-[3px] border-polo-navy/15 focus:border-polo-navy px-4 text-base text-polo-navy" />
      </div>

      {erro && <p role="alert" className="text-sm font-bold text-red-700">{erro}</p>}

      <button type="button" onClick={confirmar} disabled={salvando}
        className="w-full min-h-14 rounded-2xl bg-red-700 text-white font-black text-lg inline-flex items-center justify-center gap-2 disabled:opacity-80">
        <Icon name="check" size={24} />
        {salvando ? 'Registrando…' : quantidade > 0 ? `Registrar descarte · ${fmtQtd(quantidade, unidade)}` : 'Registrar descarte'}
      </button>
    </Dialogo>
  );
}
