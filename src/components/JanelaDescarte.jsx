import { useEffect, useId, useMemo, useState } from 'react';
import Dialogo from './Dialogo';
import Icon from './Icons';
import { CampoNumerico } from './ui/TecladoNumerico';
import { useMicrofone } from './useMicrofone';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { fmtData, isoLocal } from '../utils/formatters';
import { casaBusca, normalizarBusca } from '../utils/busca';
import { vozDisponivel } from '../utils/voz';
import { motivoDaFala } from '../utils/vozDoDescarte';
import { digitosDaBalanca } from '../utils/medida';
import {
  conferirDescarte, fmtQtd, motivosDaCasa, turnoDe, turnosDaCasa, MAX_MOTIVO, UNIDADES_NA_JANELA,
} from '../utils/desperdicio';
import { alterarMeuDescarte, novoIdDeDescarte, registrarDescarte } from '../lib/descartes';

// =====================================================================
//  O REGISTRO DE UM DESCARTE (24/11/2026, o checklist do Magurō)
//  A pessoa só diz QUANTO e POR QUÊ. Data, hora e turno saem sozinhos;
//  responsável é quem entrou pelo nome. Sem internet, fica guardado e sobe
//  sozinho depois (lib/descartes.js), com a hora em que foi feito.
//  `inicial`: { id, nome, unidade, quantidade, motivo } do item, ou
//  { livre: true, nome, ... } — a voz já preenche quantidade, unidade e motivo.
//  `alterando`: o registro feito agora há pouco — o "Alterar" de quem anotou
//  errado (M66): mesma janela, com o que foi registrado, e dá para trocar o
//  item (`produtos`, os da lista).
//  ⚠️ PESO COMO NA BALANÇA (24/11/2026, escolha do dono): em kg o número
//  entra pela direita com 3 casas (1-5-0-0 = 1,500 kg), e o app mostra no
//  tamanho certo ("10 g", "1,5 kg"). Sem botão "g": os dígitos já são os
//  gramas. Quantidade em g (voz, registro antigo) abre convertida para kg.
//  ⚠️ `pedirResponsavel` (sem equipe cadastrada, pedido do dono): o nome de
//  quem registra é obrigatório — e fica lembrado para a próxima. Campo de
//  texto, e NÃO o seletor da etiqueta: sem equipe, aquele seletor só deixa a
//  Administração cadastrar nomes, e a cozinha ficaria sem conseguir registrar.
// =====================================================================
const horaDe = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const qtdInicial = (q, unidade) => {
  const n = Number(q) || 0;
  if (!n) return '';
  return String(unidade === 'g' ? n / 1000 : n);
};

export default function JanelaDescarte({
  inicial, alterando = null, produtos = [], responsavel, pedirResponsavel = false, aoFechar, aoRegistrar,
}) {
  const { prefs, rid, setPref } = useApp();
  const { sessao } = useAuth();
  const { toast } = useUI();
  const id = useId();
  const [item, setItem] = useState(() => (inicial.livre
    ? { id: null, nome: inicial.nome || '', livre: true }
    : { id: inicial.id, nome: inicial.nome, livre: false }));
  const [qtd, setQtd] = useState(() => qtdInicial(inicial.quantidade, inicial.unidade));
  const [unidade, setUnidade] = useState(inicial.unidade === 'unid' ? 'unid' : 'kg');
  const [motivo, setMotivo] = useState(inicial.motivo || '');
  const [resp, setResp] = useState(responsavel || '');
  const pedeNome = pedirResponsavel && !alterando;
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [trocandoItem, setTrocandoItem] = useState(false);
  const [buscaItem, setBuscaItem] = useState('');
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    if (alterando) return undefined;
    const t = setInterval(() => setAgora(new Date()), 15000);
    return () => clearInterval(t);
  }, [alterando]);

  const motivos = motivosDaCasa(prefs);
  const turnos = turnosDaCasa(prefs);
  const quantidade = Number(String(qtd).replace(',', '.')) || 0;
  // ⚠️ O MOTIVO POR VOZ (pedido do dono, como no Magurō): o botão da casa
  // quando combina ("venceu" → Vencido), senão o que foi dito
  const mic = useMicrofone({
    aoOuvir: (alternativas) => { setMotivo(motivoDaFala(alternativas, motivos)); setErro(''); },
    aoAvisar: (texto) => setErro(texto || ''),
  });
  const comVoz = vozDisponivel();

  // o "quando" de quem altera é o do registro, não o de agora
  const quando = alterando ? new Date(alterando.quando) : agora;
  const linhaDeDados = [
    ['Data', fmtData(isoLocal(quando))], ['Hora', horaDe(quando)],
    ['Turno', alterando ? (alterando.turno || '—') : turnoDe(agora, turnos)],
    // sem equipe, o nome é pedido logo abaixo
    ...(pedeNome ? [] : [['Responsável', (alterando ? alterando.responsavel : responsavel) || '—']]),
  ];
  // ⚠️ TROCOU A UNIDADE DEPOIS DE DIGITAR: valem os números tocados. "3" em kg
  // é 0,003 kg; quem queria 3 unidades toca em unid e fica 3 unid.
  const trocarUnidade = (u) => {
    if (u === unidade) return;
    if (qtd) setQtd(u === 'unid' ? String(Number(digitosDaBalanca(qtd)) || '') : String(Math.round(Number(qtd) || 0) / 1000 || ''));
    setUnidade(u);
  };

  const achadosItem = useMemo(() => {
    const t = buscaItem.trim();
    return t ? produtos.filter(p => casaBusca(t, p.nome)).slice(0, 6) : [];
  }, [buscaItem, produtos]);
  const escolherItem = (novo) => { setItem(novo); setTrocandoItem(false); setBuscaItem(''); setErro(''); };

  const confirmar = async () => {
    if (salvando) return;
    try {
      conferirDescarte({ itemNome: item.nome, quantidade, unidade, motivo });
    } catch (e) { setErro(e.message); return; }
    if (pedeNome && !resp.trim()) { setErro('Falta o responsável.'); return; }
    setSalvando(true);
    const q = Math.round(quantidade * 1000) / 1000;
    const campos = { item_id: item.livre ? null : item.id, item_nome: item.nome.trim(), quantidade: q, unidade, motivo: motivo.trim() };
    if (alterando) {
      const nova = { ...alterando, ...campos };
      try {
        const r = await alterarMeuDescarte({ rid, demo: !!sessao?.demo }, nova);
        toast(r.enviado
          ? `Alterado: ${nova.item_nome} · ${fmtQtd(q, unidade)}`
          : 'Sem internet: a alteração ficou guardada e vai sozinha quando a conexão voltar.',
        r.enviado ? 'sucesso' : 'aviso');
        aoRegistrar(nova);
      } catch (e) { setErro(e.message); setSalvando(false); }
      return;
    }
    const agoraMesmo = new Date();
    const linha = {
      id: novoIdDeDescarte(), quando: agoraMesmo.toISOString(), turno: turnoDe(agoraMesmo, turnos),
      ...campos, responsavel: (pedeNome ? resp.trim() : responsavel) || '',
    };
    const r = await registrarDescarte({ rid, demo: !!sessao?.demo }, linha);
    if (r.recusado) {
      setErro('O registro não foi aceito. Confira a data e a hora do aparelho; se estiverem certas, fale com a Aurum.');
      setSalvando(false);
      return;
    }
    // quem registrou vira o nome da próxima vez (como na etiqueta)
    if (pedeNome && resp.trim() !== (prefs.responsavel || '')) setPref('responsavel', resp.trim());
    toast(r.enviado
      ? `Descarte registrado: ${linha.item_nome} · ${fmtQtd(linha.quantidade, unidade)}`
      : `Sem internet: ${linha.item_nome} · ${fmtQtd(linha.quantidade, unidade)} ficou guardado e vai sozinho quando a conexão voltar.`,
    r.enviado ? 'sucesso' : 'aviso');
    aoRegistrar(linha);
  };

  // ⚠️ CABE NA TELA SEM ROLAR (regra do dono): os motivos em duas colunas,
  // e data, hora, turno e responsável numa linha só
  const chip = (sel) => `min-h-11 px-2 rounded-xl font-bold text-sm leading-tight border-[3px]
    ${sel ? 'bg-polo-gold border-polo-gold text-polo-navy' : 'bg-white border-polo-navy/15 text-polo-navy'}`;
  const titulo = alterando ? 'Alterar registro' : (inicial.livre ? 'Item fora da lista' : inicial.nome);

  return (
    <Dialogo aoFechar={aoFechar} titulo={titulo} forma="ficha" largura="lg" classeCaixa="space-y-4">
      <dl className="flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-polo-beige border-2 border-polo-navy/10 px-3 py-2 text-sm text-polo-navy">
        {linhaDeDados.map(([r, v]) => (
          <div key={r} className="flex gap-1"><dt className="text-gray-600">{r}</dt><dd className="font-bold">{v}</dd></div>
        ))}
      </dl>

      {!alterando && inicial.livre && (
        <div>
          <label htmlFor={`${id}-nome`} className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">Item</label>
          <input id={`${id}-nome`} value={item.nome} onChange={e => { setItem({ id: null, nome: e.target.value, livre: true }); setErro(''); }} maxLength={120}
            placeholder="Nome do item" className="w-full min-h-14 rounded-2xl border-[3px] border-polo-navy/15 focus:border-polo-navy px-4 text-lg text-polo-navy" />
        </div>
      )}

      {/* ALTERAR: o item também pode estar errado (tocou no vizinho da lista) */}
      {alterando && !trocandoItem && (
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 text-polo-navy leading-tight">
            <span className="block text-xs font-bold uppercase tracking-wide text-gray-600">Item</span>
            <span className="block font-bold text-lg break-words">{item.nome}</span>
          </p>
          <button type="button" onClick={() => setTrocandoItem(true)}
            className="min-h-11 px-4 rounded-xl border-[3px] border-polo-navy/15 bg-white text-polo-navy font-bold text-sm flex-shrink-0">
            Trocar item
          </button>
        </div>
      )}
      {alterando && trocandoItem && (
        <div className="space-y-2">
          <label htmlFor={`${id}-busca-item`} className="block text-xs font-bold uppercase tracking-wide text-gray-600">Qual é o item certo?</label>
          <input id={`${id}-busca-item`} value={buscaItem} onChange={e => setBuscaItem(e.target.value)} maxLength={120}
            placeholder="Digite o nome" className="w-full min-h-12 rounded-xl border-[3px] border-polo-navy/15 focus:border-polo-navy px-4 text-base text-polo-navy" />
          {achadosItem.map(p => (
            <button key={p.id} type="button" onClick={() => escolherItem({ id: p.id, nome: p.nome, livre: false })}
              className="w-full min-h-11 px-3 rounded-xl border-2 border-polo-navy/10 bg-white text-left font-bold text-polo-navy">
              {p.nome}
            </button>
          ))}
          {buscaItem.trim() && !achadosItem.some(p => normalizarBusca(p.nome).trim() === normalizarBusca(buscaItem).trim()) && (
            <button type="button" onClick={() => escolherItem({ id: null, nome: buscaItem.trim(), livre: true })}
              className="w-full min-h-11 px-3 rounded-xl border-2 border-dashed border-polo-navy/25 bg-white text-left text-polo-navy">
              Usar “{buscaItem.trim()}” (fora da lista)
            </button>
          )}
          <button type="button" onClick={() => { setTrocandoItem(false); setBuscaItem(''); }}
            className="min-h-11 px-4 rounded-xl border-[3px] border-polo-navy/15 bg-white text-polo-navy font-bold text-sm">
            Manter {item.nome}
          </button>
        </div>
      )}

      {!trocandoItem && (<>
        {pedeNome && (
          <div>
            <label htmlFor={`${id}-resp`} className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">Responsável</label>
            <input id={`${id}-resp`} value={resp} onChange={e => { setResp(e.target.value); setErro(''); }} maxLength={80}
              placeholder="Quem está registrando" autoComplete="off"
              className="w-full min-h-12 rounded-xl border-[3px] border-polo-navy/15 focus:border-polo-navy px-4 text-base text-polo-navy" />
          </div>
        )}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-600 mb-1" aria-hidden="true">Quantidade descartada</p>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-stretch">
            <CampoNumerico valor={qtd} aoMudar={(v) => { setQtd(v); setErro(''); }} rotulo="Quantidade descartada"
              titulo={`Quantidade — ${item.nome || 'descarte'}`} unidade={unidade} decimal={false}
              casasFixas={unidade === 'kg' ? 3 : 0}
              className="w-full min-h-14 rounded-2xl border-[3px] border-polo-navy/15 focus:border-polo-navy px-3 text-2xl font-extrabold text-polo-navy" />
            <div className="flex gap-1.5" role="radiogroup" aria-label="Unidade">
              {UNIDADES_NA_JANELA.map(u => (
                <button key={u} type="button" role="radio" aria-checked={unidade === u} onClick={() => trocarUnidade(u)}
                  className={`min-h-14 min-w-14 px-3 rounded-xl font-bold text-base border-[3px]
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
          <div className="flex gap-2">
            <input id={`${id}-outro`} value={mic.ouvindo ? mic.parcial : (motivos.includes(motivo) ? '' : motivo)} maxLength={MAX_MOTIVO * 5}
              readOnly={mic.ouvindo} onChange={e => { setMotivo(e.target.value); setErro(''); }}
              placeholder={mic.ouvindo ? 'Ouvindo… fale o motivo' : 'Escreva ou fale o motivo'}
              className="flex-1 min-w-0 min-h-12 rounded-xl border-[3px] border-polo-navy/15 focus:border-polo-navy px-4 text-base text-polo-navy" />
            {comVoz && (
              <button type="button" onClick={mic.ouvir} aria-pressed={mic.ouvindo}
                aria-label={mic.ouvindo ? 'Parar de ouvir' : 'Falar o motivo'}
                className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors
                  ${mic.ouvindo ? 'bg-red-700 text-white animate-pulse' : 'bg-polo-gold text-polo-navy'}`}>
                <Icon name="microfone" size={22} />
              </button>
            )}
          </div>
        </div>

        {erro && <p role="alert" className="text-sm font-bold text-red-700">{erro}</p>}

        <button type="button" onClick={confirmar} disabled={salvando}
          className={`w-full min-h-14 rounded-2xl font-black text-lg inline-flex items-center justify-center gap-2 disabled:opacity-80
            ${alterando ? 'bg-polo-navy text-polo-gold' : 'bg-red-700 text-white'}`}>
          <Icon name="check" size={24} />
          {alterando
            ? (salvando ? 'Salvando…' : `Salvar alteração${quantidade > 0 ? ` · ${fmtQtd(quantidade, unidade)}` : ''}`)
            : (salvando ? 'Registrando…' : quantidade > 0 ? `Registrar descarte · ${fmtQtd(quantidade, unidade)}` : 'Registrar descarte')}
        </button>
      </>)}
    </Dialogo>
  );
}
