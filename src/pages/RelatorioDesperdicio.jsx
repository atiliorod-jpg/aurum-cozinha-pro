import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Dialogo from '../components/Dialogo';
import Aviso from '../components/Aviso';
import Icon from '../components/Icons';
import { CampoNumerico } from '../components/ui/TecladoNumerico';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../utils/produto';
import { fmtData, hoje } from '../utils/formatters';
import {
  somarPorItem, somarPorGrupo, somarPorMotivo, somarPorTurno, somarPorPessoa, totais, itensForaDaLista, fmtQtd, fmtSoma,
  fmtPeso, fmtPesoEUnid, resumoRegistro, mudancaDoRegistro, planilhaDoDesperdicio, motivosDaCasa, turnosDaCasa,
  conferirDescarte, UNIDADES_NA_JANELA,
} from '../utils/desperdicio';
import {
  listarDescartes, corrigirDescarte, voltarDescarteOriginal, apagarDescarte, apagarDescartesDoPeriodo,
} from '../lib/descartes';

// =====================================================================
//  RELATÓRIO DE DESPERDÍCIO (24/11/2026) — o do checklist do Magurō, na
//  Administração (decisão do dono: só aqui, com a senha). Soma por item, por
//  grupo, um por um e por motivo; imprimir e planilha; corrigir (fica marcado
//  "Corrigido" e guarda como a pessoa registrou), apagar um ou o período, e
//  os itens registrados fora da lista para cadastrar com um toque.
//  ⚠️ GRAMAS (M66): as somas juntam g e kg (abaixo de 1 kg aparecem em g);
//  o "Um por um" mostra como foi registrado. "Alterado na hora" é quem
//  registrou, logo depois, no aparelho; "Corrigido" é a Administração.
// =====================================================================
const somarDias = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(a, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const PERIODOS = [
  { id: 'hoje', rotulo: 'Hoje', de: () => hoje(), ate: () => hoje() },
  { id: 'ontem', rotulo: 'Ontem', de: () => somarDias(hoje(), -1), ate: () => somarDias(hoje(), -1) },
  { id: '7', rotulo: '7 dias', de: () => somarDias(hoje(), -6), ate: () => hoje() },
  { id: 'mes', rotulo: 'Este mês', de: () => `${hoje().slice(0, 8)}01`, ate: () => hoje() },
];
// ⚠️ POR TURNO E POR PESSOA (24/11/2026, pedido do dono): o turno e quem
// registrou já eram gravados; agora o relatório soma por eles
const VISOES = [
  { id: 'item', rotulo: 'Soma por item' },
  { id: 'grupo', rotulo: 'Por grupo' },
  { id: 'turno', rotulo: 'Por turno' },
  { id: 'pessoa', rotulo: 'Por pessoa' },
  { id: 'motivo', rotulo: 'Por motivo' },
  { id: 'lista', rotulo: 'Um por um' },
];
const botaoFiltro = (sel) => `min-h-11 px-4 rounded-xl font-bold text-sm border-[3px]
  ${sel ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'bg-white text-polo-navy border-polo-navy/15'}`;

export default function RelatorioDesperdicio() {
  const { produtos, prefs } = useApp();
  const { sessao, impersonando } = useAuth();
  const { toast, confirm } = useUI();
  const navigate = useNavigate();
  const soEtiq = ehSoEtiquetas(produtoAtivo(sessao, impersonando));
  const onde = useMemo(() => ({ demo: !!sessao?.demo, restaurante: impersonando?.restauranteId || null }),
    [sessao?.demo, impersonando?.restauranteId]);

  const [periodo, setPeriodo] = useState('hoje');
  const [de, setDe] = useState(hoje());
  const [ate, setAte] = useState(hoje());
  const [visao, setVisao] = useState('item');
  const [linhas, setLinhas] = useState(null);
  const [fora, setFora] = useState([]);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [corrigindo, setCorrigindo] = useState(null);

  const escolherPeriodo = (p) => { setPeriodo(p.id); setDe(p.de()); setAte(p.ate()); };

  useEffect(() => {
    let vivo = true;
    listarDescartes(onde, de, ate)
      .then(l => { if (vivo) { setLinhas(l); setErro(''); } })
      .catch(e => { if (vivo) { setLinhas([]); setErro(e.message); } });
    return () => { vivo = false; };
  }, [onde, de, ate, recarga]);
  // os itens registrados fora da lista nos últimos 30 dias, para cadastrar
  useEffect(() => {
    let vivo = true;
    listarDescartes(onde, somarDias(hoje(), -29), hoje())
      .then(l => { if (vivo) setFora(l); }).catch(() => {});
    return () => { vivo = false; };
  }, [onde, recarga]);

  const regs = useMemo(() => linhas || [], [linhas]);
  const porItem = useMemo(() => somarPorItem(regs, produtos), [regs, produtos]);
  const porGrupo = useMemo(() => somarPorGrupo(regs, produtos), [regs, produtos]);
  const porMotivo = useMemo(() => somarPorMotivo(regs), [regs]);
  const turnos = useMemo(() => turnosDaCasa(prefs), [prefs]);
  const porTurno = useMemo(() => somarPorTurno(regs, turnos), [regs, turnos]);
  const porPessoa = useMemo(() => somarPorPessoa(regs), [regs]);
  const paraCadastrar = useMemo(() => itensForaDaLista(fora, produtos), [fora, produtos]);
  const t = totais(regs);
  const mudaram = regs.filter(l => mudancaDoRegistro(l)).length;
  const periodoTxt = de === ate ? fmtData(de) : `${fmtData(de)} a ${fmtData(ate)}`;
  const podeMexer = !impersonando;

  const baixarPlanilha = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      for (const [nome, aba] of planilhaDoDesperdicio(regs, produtos, { de, ate }, turnos)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aba), nome);
      }
      XLSX.writeFile(wb, `desperdicio_${de}_a_${ate}.xlsx`);
    } catch (e) { toast(`Não consegui gerar a planilha: ${e?.message || 'erro'}`, 'erro'); }
  };
  const apagar = async (l) => {
    const ok = await confirm({ titulo: 'Apagar o registro?', mensagem: `${l.item_nome} · ${fmtQtd(l.quantidade, l.unidade)} · ${fmtData(l.dia)} ${l.hora}`, perigo: true, confirmar: 'Apagar' });
    if (!ok) return;
    try { await apagarDescarte(onde, l.id); toast('Registro apagado.', 'sucesso'); setRecarga(n => n + 1); }
    catch (e) { toast(e.message, 'erro'); }
  };
  const apagarPeriodo = async () => {
    if (!regs.length) return;
    const ok = await confirm({
      titulo: 'Apagar todos deste período?',
      mensagem: `Os ${regs.length} registros de ${periodoTxt} somem de vez do relatório e do banco. Não tem volta.`,
      perigo: true, confirmar: 'Apagar todos',
    });
    if (!ok) return;
    try { const n = await apagarDescartesDoPeriodo(onde, de, ate); toast(`${n} registros apagados.`, 'sucesso'); setRecarga(x => x + 1); }
    catch (e) { toast(e.message, 'erro'); }
  };

  return (
    <Layout title="Relatório de desperdício" {...(soEtiq ? { voltar: '/administracao' } : { area: 'admin' })}>
      <div className="space-y-4">
        {/* ⚠️ REDESIGN (26/11/2026): o período e as datas na mesma faixa (as datas
            à direita no computador); os quatro números lado a lado; as visões num
            controle segmentado; as somas com barras */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
            {PERIODOS.map(p => (
              <button key={p.id} type="button" onClick={() => escolherPeriodo(p)} aria-pressed={periodo === p.id} className={botaoFiltro(periodo === p.id)}>{p.rotulo}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            <label className="text-sm text-polo-tinta">De
              <input type="date" value={de} onChange={e => { setPeriodo('livre'); setDe(e.target.value); }}
                className="ml-2 min-h-11 rounded-xl border-2 border-polo-linha px-2 text-polo-navy" />
            </label>
            <label className="text-sm text-polo-tinta">até
              <input type="date" value={ate} onChange={e => { setPeriodo('livre'); setAte(e.target.value); }}
                className="ml-2 min-h-11 rounded-xl border-2 border-polo-linha px-2 text-polo-navy" />
            </label>
          </div>
        </div>

        {paraCadastrar.length > 0 && podeMexer && (
          <section className="rounded-2xl border-[3px] border-polo-gold bg-polo-beige p-4 space-y-2 print:hidden" aria-labelledby="fora-titulo">
            <h2 id="fora-titulo" className="font-titulo font-black text-base text-polo-navy uppercase">Registrados fora da lista</h2>
            <ul className="divide-y divide-polo-gold/30 bg-white rounded-xl border border-polo-gold/40">
              {paraCadastrar.map(g => (
                <li key={`${g.item}|${g.unidade}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-bold text-polo-navy break-words">{g.item}</span>
                    <span className="block text-xs text-gray-600">{g.vezes}× · {fmtSoma(g.total, g.unidade)} nos últimos 30 dias</span>
                  </span>
                  <button type="button" onClick={() => navigate(`/itens?novo=${encodeURIComponent(g.item)}&unidade=${g.unidade}`)}
                    className="min-h-11 px-3 rounded-xl bg-polo-navy text-polo-gold font-bold text-sm flex-shrink-0">Cadastrar</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Resumo rotulo="Total descartado" valor={fmtPeso(t.kg)} extra={t.unid ? `+ ${fmtQtd(t.unid, 'unid')}` : ''} />
          <Resumo rotulo="Registros" valor={linhas ? String(t.registros) : '…'} />
          <Resumo rotulo="Item que mais saiu" valor={porItem[0]?.item || '—'} extra={porItem[0] ? fmtSoma(porItem[0].total, porItem[0].unidade) : ''} />
          <Resumo rotulo="Motivo mais comum" valor={porMotivo[0]?.motivo || '—'} extra={porMotivo[0] ? fmtPeso(porMotivo[0].total) : ''} />
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-1 p-1.5 bg-white border-2 border-polo-linha rounded-2xl print:hidden" role="group" aria-label="Como ver">
          {VISOES.map(v => (
            <button key={v.id} type="button" onClick={() => setVisao(v.id)} aria-pressed={visao === v.id}
              className={`min-h-11 px-1 rounded-xl text-sm font-bold leading-tight ${visao === v.id ? 'bg-polo-navy text-polo-gold' : 'text-polo-navy hover:bg-polo-beige'}`}>
              {v.rotulo}
            </button>
          ))}
        </div>

        <p className="hidden print:block text-polo-navy font-bold">
          Desperdício · {VISOES.find(v => v.id === visao)?.rotulo} · {periodoTxt} · {fmtPeso(t.kg)}{t.unid ? ` + ${fmtQtd(t.unid, 'unid')}` : ''}
        </p>
        {mudaram > 0 && (
          <Aviso tom="neutro">{mudaram === 1 ? '1 registro deste período mudou depois de feito' : `${mudaram} registros deste período mudaram depois de feitos`}{visao !== 'lista' ? ' (veja em “Um por um”).' : '.'}</Aviso>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        <ul className="bg-white rounded-2xl border-2 border-polo-linha divide-y divide-polo-linha/60">
          {linhas === null && <li className="p-4 text-sm text-gray-600">Carregando…</li>}
          {linhas !== null && !regs.length && !erro && <li className="p-4 text-sm text-gray-600">Nenhum descarte neste período.</li>}
          {visao === 'item' && porItem.map(g => (
            <LinhaComBarra key={`${g.item}|${g.unidade}`} rotulo={g.item} texto={fmtSoma(g.total, g.unidade)}
              fracao={g.total / (maximoDe(porItem.filter(x => x.unidade === g.unidade), x => x.total) || 1)}
              detalhe={`${g.vezes}× · ${g.motivos.map(m => `${m.motivo} (${fmtSoma(m.total, g.unidade)})`).join(' · ')}`} />
          ))}
          {visao === 'grupo' && porGrupo.map(g => (
            <LinhaComBarra key={`${g.grupo}|${g.unidade}`} rotulo={g.grupo} texto={fmtSoma(g.total, g.unidade)} vezes={g.vezes}
              fracao={g.total / (maximoDe(porGrupo.filter(x => x.unidade === g.unidade), x => x.total) || 1)} />
          ))}
          {visao === 'turno' && porTurno.map(t => (
            <LinhaComBarra key={t.turno} rotulo={t.turno} texto={fmtPesoEUnid(t.kg, t.unid)} vezes={t.vezes}
              fracao={fracaoPesoOuUnid(t, porTurno)} />
          ))}
          {visao === 'pessoa' && porPessoa.map(p => (
            <LinhaComBarra key={p.pessoa} rotulo={p.pessoa} texto={fmtPesoEUnid(p.kg, p.unid)} vezes={p.vezes}
              fracao={fracaoPesoOuUnid(p, porPessoa)} />
          ))}
          {visao === 'motivo' && porMotivo.map(m => (
            <LinhaComBarra key={m.motivo} rotulo={m.motivo} texto={fmtPeso(m.total)}
              fracao={m.total / (maximoDe(porMotivo, x => x.total) || 1)} />
          ))}
          {visao === 'lista' && regs.map(l => (
            <li key={l.id} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-polo-navy break-words">
                  {l.item_nome} · <span className="font-black">{fmtQtd(l.quantidade, l.unidade)}</span>
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {fmtData(l.dia)} {l.hora} · {l.turno || 'sem turno'} · {l.motivo}{l.responsavel ? ` · ${l.responsavel}` : ''}
                </p>
                {mudancaDoRegistro(l) && (
                  <p className="text-xs text-polo-navy mt-1">
                    <span className="inline-flex items-center gap-1 rounded-md bg-polo-gold/20 border border-polo-gold px-1.5 py-0.5 font-bold">
                      <Icon name="editar" size={12} />{mudancaDoRegistro(l)}
                    </span>
                    {l.original && <span className="block text-gray-600 mt-0.5">antes: {resumoRegistro(l.original)}</span>}
                  </p>
                )}
              </div>
              {podeMexer && (
                <div className="flex gap-1 flex-shrink-0 print:hidden">
                  <button type="button" onClick={() => setCorrigindo(l)} aria-label={`Corrigir o registro de ${l.item_nome}`}
                    className="w-11 h-11 rounded-xl text-polo-navy hover:bg-polo-navy/10 flex items-center justify-center"><Icon name="editar" size={20} /></button>
                  <button type="button" onClick={() => apagar(l)} aria-label={`Apagar o registro de ${l.item_nome}`}
                    className="w-11 h-11 rounded-xl text-red-700 hover:bg-red-50 flex items-center justify-center"><Icon name="apagar" size={20} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={() => window.print()} className="min-h-11 px-4 rounded-xl border-2 border-polo-linha bg-white text-polo-navy font-bold text-sm inline-flex items-center gap-2">
            <Icon name="impressora" size={18} />Imprimir
          </button>
          <button type="button" onClick={baixarPlanilha} disabled={!regs.length} className="min-h-11 px-4 rounded-xl border-2 border-polo-linha bg-white text-polo-navy font-bold text-sm inline-flex items-center gap-2 disabled:opacity-60">
            <Icon name="relatorio" size={18} />Baixar planilha
          </button>
          {podeMexer && regs.length > 0 && (
            <button type="button" onClick={apagarPeriodo} className="min-h-11 px-4 rounded-xl border-2 border-perigo/40 bg-white text-perigo font-bold text-sm inline-flex items-center gap-2 md:ml-auto">
              <Icon name="apagar" size={18} />Apagar todos deste período
            </button>
          )}
        </div>
      </div>
      {corrigindo && (
        <JanelaCorrigir registro={corrigindo} aoFechar={() => setCorrigindo(null)}
          aoSalvar={() => { setCorrigindo(null); setRecarga(n => n + 1); }} onde={onde} />
      )}
    </Layout>
  );
}

const Resumo = ({ rotulo, valor, extra }) => (
  <div className="rounded-2xl bg-white border-2 border-polo-linha p-3">
    <p className="text-xs font-bold uppercase tracking-wide text-polo-tinta">{rotulo}</p>
    <p className="text-xl font-black text-polo-navy leading-tight break-words">{valor}</p>
    {extra && <p className="text-xs text-polo-tinta">{extra}</p>}
  </div>
);

// ── as barras das somas (redesign, 26/11/2026) ─────────────────────────
const maximoDe = (lista, valor) => Math.max(0, ...lista.map(valor));
// turno e pessoa: a barra é pelo peso; sem peso nenhum no período, pelas unidades
function fracaoPesoOuUnid(x, lista) {
  const maxKg = maximoDe(lista, y => y.kg);
  if (maxKg > 0) return x.kg / maxKg;
  const maxUnid = maximoDe(lista, y => y.unid);
  return maxUnid > 0 ? x.unid / maxUnid : 0;
}
function LinhaComBarra({ rotulo, texto, fracao, vezes = 0, detalhe = '' }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold text-polo-navy break-words">{rotulo}{vezes > 0 && <span className="text-xs font-normal text-polo-tinta"> · {vezes}×</span>}</span>
        <span className="font-black text-polo-navy whitespace-nowrap">{texto}</span>
      </div>
      <div className="mt-1.5 h-2.5 rounded-full bg-polo-beige overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-polo-navy" style={{ width: `${Math.max(fracao > 0 ? 3 : 0, Math.min(1, fracao) * 100)}%` }} />
      </div>
      {detalhe && <p className="text-xs text-polo-tinta mt-1">{detalhe}</p>}
    </li>
  );
}

// Corrigir um registro feito errado: item, quantidade, unidade ou motivo.
// Data, hora, turno e responsável não mudam (o banco nem aceita).
function JanelaCorrigir({ registro, aoFechar, aoSalvar, onde }) {
  const { produtos, prefs } = useApp();
  const { toast } = useUI();
  const id = useId();
  const [nome, setNome] = useState(registro.item_nome);
  // ⚠️ peso como na balança, só kg e unid (24/11/2026): o registro em g abre em kg
  const [qtd, setQtd] = useState(String(registro.unidade === 'g' ? Number(registro.quantidade) / 1000 : registro.quantidade));
  const [unidade, setUnidade] = useState(registro.unidade === 'unid' ? 'unid' : 'kg');
  const [motivo, setMotivo] = useState(registro.motivo);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ativos = produtos.filter(p => p.ativo);
  const motivos = motivosDaCasa(prefs);

  const salvar = async () => {
    const quantidade = Number(String(qtd).replace(',', '.')) || 0;
    try { conferirDescarte({ itemNome: nome, quantidade, unidade, motivo }); } catch (e) { setErro(e.message); return; }
    const item = ativos.find(p => (p.nome || '').trim().toLowerCase() === nome.trim().toLowerCase());
    setSalvando(true);
    try {
      await corrigirDescarte(onde, { id: registro.id, item_id: item?.id || null, item_nome: item?.nome || nome.trim(), quantidade, unidade, motivo: motivo.trim() });
      toast('Registro corrigido.', 'sucesso');
      aoSalvar();
    } catch (e) { setErro(e.message); setSalvando(false); }
  };
  const voltar = async () => {
    try { await voltarDescarteOriginal(onde, registro.id); toast('Voltou ao que foi registrado.', 'sucesso'); aoSalvar(); }
    catch (e) { setErro(e.message); }
  };

  return (
    <Dialogo aoFechar={aoFechar} titulo="Corrigir registro" forma="ficha" largura="lg" classeCaixa="space-y-4">
      <p className="text-sm text-gray-600">{fmtData(registro.dia)} {registro.hora} · {registro.turno || 'sem turno'} · {registro.responsavel || '—'}</p>
      <div>
        <label htmlFor={`${id}-item`} className="block text-xs font-bold uppercase text-gray-600 mb-1">Item</label>
        <input id={`${id}-item`} list={`${id}-itens`} value={nome} onChange={e => { setNome(e.target.value); setErro(''); }} maxLength={120}
          className="w-full min-h-12 rounded-xl border-[3px] border-polo-navy/15 px-3 text-base text-polo-navy" />
        <datalist id={`${id}-itens`}>{ativos.map(p => <option key={p.id} value={p.nome} />)}</datalist>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <div>
          <p className="text-xs font-bold uppercase text-gray-600 mb-1">Quantidade</p>
          <CampoNumerico valor={qtd} aoMudar={(v) => { setQtd(v); setErro(''); }} rotulo="Quantidade" unidade={unidade}
            decimal={false} casasFixas={unidade === 'kg' ? 3 : 0}
            className="w-full min-h-12 rounded-xl border-[3px] border-polo-navy/15 px-3 text-xl font-extrabold text-polo-navy" />
        </div>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Unidade">
          {UNIDADES_NA_JANELA.map(u => (
            <button key={u} type="button" role="radio" aria-checked={unidade === u} onClick={() => setUnidade(u)}
              className={`min-h-12 min-w-11 px-3 rounded-xl font-bold border-[3px] ${unidade === u ? 'bg-polo-navy border-polo-navy text-polo-gold' : 'bg-white border-polo-navy/15 text-polo-navy'}`}>{u}</button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-motivo`} className="block text-xs font-bold uppercase text-gray-600 mb-1">Motivo</label>
        <input id={`${id}-motivo`} list={`${id}-motivos`} value={motivo} onChange={e => { setMotivo(e.target.value); setErro(''); }} maxLength={300}
          className="w-full min-h-12 rounded-xl border-[3px] border-polo-navy/15 px-3 text-base text-polo-navy" />
        <datalist id={`${id}-motivos`}>{motivos.map(m => <option key={m} value={m} />)}</datalist>
      </div>
      {erro && <p role="alert" className="text-sm font-bold text-red-700">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        {registro.original && (
          <button type="button" onClick={voltar} className="min-h-12 px-4 rounded-xl border-[3px] border-polo-navy/15 bg-white text-polo-navy font-bold">Voltar ao original</button>
        )}
        <button type="button" onClick={salvar} disabled={salvando} className="flex-1 min-h-12 rounded-xl bg-polo-navy text-polo-gold font-bold disabled:opacity-80">
          {salvando ? 'Salvando…' : 'Salvar correção'}
        </button>
      </div>
    </Dialogo>
  );
}
