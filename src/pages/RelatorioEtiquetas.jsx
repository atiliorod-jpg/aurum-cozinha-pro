import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import Aviso from '../components/Aviso';
import Botao from '../components/Botao';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { supabase } from '../lib/supabase';
import { hoje, fmtData } from '../utils/formatters';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../utils/produto';
import {
  PERIODOS, periodoDoRelatorio, periodoAnterior, resumirRelatorio, variacao,
  diaDaSemana, planilhaDoRelatorio,
} from '../utils/relatorioEtiquetas';

const fmtCurta = (iso) => fmtData(iso).slice(0, 5);
const fmtMedia = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

// Acima disso a lista dia a dia vira rolagem sem fim no celular; a semana e a
// planilha contam a mesma história em menos linhas.
const MAX_DIAS_NA_TELA = 62;
const TOP_ITENS = 10;

function Secao({ titulo, children }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 break-inside-avoid">
      <h2 className="text-xs font-bold text-polo-navy uppercase">{titulo}</h2>
      {children}
    </section>
  );
}

function Barra({ rotulo, valor, maximo }) {
  return (
    <li className="flex items-center gap-2 text-[11px]">
      <span className="w-20 flex-shrink-0 text-gray-600 truncate">{rotulo}</span>
      <span className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden" aria-hidden="true">
        <span className="block h-full bg-polo-navy rounded-full"
          style={{ width: `${maximo ? (valor / maximo) * 100 : 0}%` }} />
      </span>
      <span className="w-10 text-right font-bold text-polo-navy">{valor}</span>
    </li>
  );
}

/**
 * Relatório de etiquetas — quantas a casa imprimiu por dia, semana e mês.
 *
 * ⚠️ OS NÚMEROS VÊM DO BANCO (M43), não da lista da aba Impressas. Aquela
 * lista é podada e mora no aparelho; um "mês passado" montado nela sairia
 * menor do que foi. Por isso esta tela precisa de internet — e diz isso, em
 * vez de mostrar um zero.
 *
 * ⚠️ UMA CHAMADA SÓ, cobrindo o período ANTERIOR e o atual juntos. A
 * comparação "subiu 12%" é a primeira coisa que o dono lê, e duas chamadas
 * podiam voltar em ordens diferentes e comparar um período com o de outro
 * filtro.
 */
export default function RelatorioEtiquetas() {
  const { rid, online } = useApp();
  const { sessao, impersonando } = useAuth();
  const { toast } = useUI();
  const soEtiquetas = ehSoEtiquetas(produtoAtivo(sessao, impersonando));
  const nomeCasa = impersonando?.restauranteNome || sessao?.restauranteNome || '';
  const hj = hoje();

  const [tipo, setTipo] = useState('mes');
  const [de, setDe] = useState(() => `${hoje().slice(0, 8)}01`);
  const [ate, setAte] = useState(() => hoje());
  const periodo = useMemo(() => periodoDoRelatorio(tipo, hj, de, ate), [tipo, hj, de, ate]);
  const anterior = useMemo(() => periodoAnterior(periodo), [periodo]);

  // ⚠️ SEM `setState` DENTRO DO EFEITO ANTES DA RESPOSTA. O "carregando" é
  // derivado: a resposta guarda a chave do pedido que a gerou, e enquanto a
  // chave atual for outra, a tela está esperando. Assim uma resposta atrasada
  // de um período antigo nunca aparece como se fosse do período novo.
  const semNuvem = !rid || rid === 'demo';
  const [tentativa, setTentativa] = useState(0);
  const chave = `${rid}|${anterior.de}|${periodo.ate}|${tentativa}`;
  const [resposta, setResposta] = useState({ chave: '', linhas: [], erro: '' });

  useEffect(() => {
    if (semNuvem) return undefined;
    let vivo = true;
    const fim = (linhas, erro) => { if (vivo) setResposta({ chave, linhas, erro }); };
    // `p_restaurante` só é ouvido pelo banco quando quem pede é o super-admin
    // (modo suporte); para a própria casa ele é ignorado — ver M43.
    supabase.rpc('relatorio_etiquetas', { p_de: anterior.de, p_ate: periodo.ate, p_restaurante: rid })
      .then(({ data, error }) => fim(error ? [] : (data || []), error ? (error.message || 'erro') : ''))
      .catch((e) => fim([], e?.message || 'erro'));
    return () => { vivo = false; };
  }, [semNuvem, chave, anterior.de, periodo.ate, rid]);

  const carregando = !semNuvem && resposta.chave !== chave;
  const linhas = useMemo(() => (resposta.chave === chave ? resposta.linhas : []), [resposta, chave]);
  const resumo = useMemo(() => resumirRelatorio(linhas, periodo), [linhas, periodo]);
  const resumoAnt = useMemo(() => resumirRelatorio(linhas, anterior), [linhas, anterior]);

  const v = variacao(resumo.total, resumoAnt.total);
  const maxDia = Math.max(0, ...resumo.dias.map(d => d.etiquetas));
  const maxSemana = Math.max(0, ...resumo.semanas.map(s => s.etiquetas));
  const maxItem = resumo.porItem[0]?.etiquetas || 0;
  const maxResp = resumo.porResponsavel[0]?.etiquetas || 0;

  const baixarPlanilha = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      for (const [nome, linhasAba] of planilhaDoRelatorio(resumo, periodo)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhasAba), nome);
      }
      XLSX.writeFile(wb, `etiquetas_${periodo.de}_a_${periodo.ate}.xlsx`);
    } catch (e) {
      toast(`Não consegui gerar a planilha: ${e?.message || 'erro'}`, 'erro');
    }
  };

  const cartoes = [
    {
      rotulo: 'Etiquetas impressas', valor: resumo.total,
      extra: v === null ? 'sem base para comparar'
        : v === 0 ? `igual ao período anterior (${resumoAnt.total})`
        : `${v > 0 ? '▲' : '▼'} ${Math.abs(v)}% contra ${resumoAnt.total} no período anterior`,
    },
    { rotulo: 'Média por dia', valor: fmtMedia(resumo.mediaPorDia), extra: `em ${resumo.dias.length} dias` },
    {
      rotulo: 'Dia de maior volume', valor: resumo.pico ? resumo.pico.etiquetas : '—',
      extra: resumo.pico ? `${diaDaSemana(resumo.pico.dia)} ${fmtCurta(resumo.pico.dia)}` : 'nenhuma etiqueta',
    },
    {
      // ⚠️ Reimpressão em excesso é o sinal de etiqueta estragando no pote
      // (umidade, cola, rolo errado) — por isso ganha cartão próprio.
      rotulo: 'Reimpressões', valor: resumo.reimpressas,
      extra: resumo.total ? `${Math.round((resumo.reimpressas / resumo.total) * 100)}% do total` : '—',
    },
  ];

  return (
    <Layout title="Relatório de etiquetas" area={soEtiquetas ? 'estoque' : 'admin'}>
      <div className="relatorio-print-cabecalho mb-4">
        <p className="text-lg font-bold text-polo-navy">Relatório de etiquetas — {nomeCasa || 'Aurum'}</p>
        <p className="text-xs text-gray-600">
          {fmtData(periodo.de)} a {fmtData(periodo.ate)} · comparado com {fmtData(anterior.de)} a {fmtData(anterior.ate)}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Período do relatório">
          {PERIODOS.map(p => (
            <button key={p.id} type="button" onClick={() => setTipo(p.id)} aria-pressed={tipo === p.id}
              className={`min-h-11 px-3 rounded-full text-xs font-bold border
                ${tipo === p.id ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'bg-white text-polo-navy border-gray-200'}`}>
              {p.rotulo}
            </button>
          ))}
        </div>

        {tipo === 'datas' && (
          <div className="grid grid-cols-2 gap-2 print:hidden">
            <label className="text-[11px] font-semibold text-gray-600">
              De
              <input type="date" value={de} max={hj} onChange={e => setDe(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800" />
            </label>
            <label className="text-[11px] font-semibold text-gray-600">
              Até
              <input type="date" value={ate} max={hj} onChange={e => setAte(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800" />
            </label>
          </div>
        )}

        <p className="text-[11px] text-gray-600 print:hidden">
          {fmtData(periodo.de)} a {fmtData(periodo.ate)} · comparado com {fmtData(anterior.de)} a {fmtData(anterior.ate)}
        </p>

        {semNuvem ? (
          <Aviso tom="neutro">
            O relatório vem da nuvem e não existe na demonstração. Numa conta de verdade,
            cada etiqueta impressa entra aqui.
          </Aviso>
        ) : carregando ? (
          <Aviso tom="neutro">Carregando o relatório…</Aviso>
        ) : resposta.erro ? (
          <div className="space-y-2">
            <Aviso tom="atencao">
              {online
                ? `Não consegui carregar o relatório (${resposta.erro}).`
                : 'O relatório precisa de internet. As etiquetas impressas sem conexão entram assim que o aparelho voltar a ficar online.'}
            </Aviso>
            <Botao variante="secundario" tamanho="sm" largura="auto" onClick={() => setTentativa(t => t + 1)}>
              Tentar de novo
            </Botao>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {cartoes.map(c => (
                <div key={c.rotulo} className="bg-white border border-gray-200 rounded-xl p-3">
                  <p className="text-2xl font-bold text-polo-navy leading-none">{c.valor}</p>
                  <p className="text-[11px] font-semibold text-gray-700 mt-1">{c.rotulo}</p>
                  <p className="text-[11px] text-gray-600 mt-0.5">{c.extra}</p>
                </div>
              ))}
            </div>

            {resumo.total === 0 ? (
              <Aviso tom="neutro">Nenhuma etiqueta impressa neste período.</Aviso>
            ) : (
              <>
                {resumo.dias.length <= MAX_DIAS_NA_TELA ? (
                  <Secao titulo="Por dia">
                    <ul className="space-y-1">
                      {resumo.dias.map(d => (
                        <Barra key={d.dia} rotulo={`${diaDaSemana(d.dia)} ${fmtCurta(d.dia)}`}
                          valor={d.etiquetas} maximo={maxDia} />
                      ))}
                    </ul>
                  </Secao>
                ) : (
                  <Aviso tom="neutro">
                    Período longo: o dia a dia está na planilha. Aqui embaixo vão as semanas.
                  </Aviso>
                )}

                <Secao titulo="Por semana (segunda a domingo)">
                  <ul className="space-y-1">
                    {resumo.semanas.map(s => (
                      <Barra key={s.de} rotulo={`${fmtCurta(s.de)} a ${fmtCurta(s.ate)}`}
                        valor={s.etiquetas} maximo={maxSemana} />
                    ))}
                  </ul>
                </Secao>

                <Secao titulo="Itens mais etiquetados">
                  <ul className="space-y-1">
                    {resumo.porItem.slice(0, TOP_ITENS).map(i => (
                      <Barra key={i.nome} rotulo={i.nome} valor={i.etiquetas} maximo={maxItem} />
                    ))}
                  </ul>
                  {resumo.porItem.length > TOP_ITENS && (
                    <p className="text-[11px] text-gray-600">
                      E mais {resumo.porItem.length - TOP_ITENS} itens — a lista inteira está na planilha.
                    </p>
                  )}
                </Secao>

                <Secao titulo="Por responsável">
                  <ul className="space-y-1">
                    {resumo.porResponsavel.map(r => (
                      <Barra key={r.nome} rotulo={r.nome} valor={r.etiquetas} maximo={maxResp} />
                    ))}
                  </ul>
                </Secao>

                <div className="grid grid-cols-2 gap-2 print:hidden">
                  <Botao variante="secundario" tamanho="sm" onClick={baixarPlanilha}>Baixar planilha</Botao>
                  <Botao variante="secundario" tamanho="sm" onClick={() => window.print()}>Imprimir ou PDF</Botao>
                </div>
              </>
            )}

            {/* ⚠️ O LIMITE DITO NA TELA, não escondido. Antes de 10/09/2026 o
                app não guardava a data de cada impressão no servidor; o que
                ainda estava na lista de Impressas entrou, o resto não existe
                mais. Um "mês de julho: 0" sem esta frase pareceria defeito. */}
            <p className="text-[11px] text-gray-600">
              Conta etiquetas de papel, com as cópias e as reimpressões. O relatório começou em
              setembro de 2026; o que foi impresso antes disso só aparece se ainda estava na aba Impressas.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
