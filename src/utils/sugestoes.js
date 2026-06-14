import { hoje } from './formatters';
import { addDias } from './datas';

// Dia da semana (0=domingo) de uma data YYYY-MM-DD, no fuso local (meio-dia evita
// virada de dia na conversão UTC).
const weekdayOf = (iso) => new Date(iso + 'T12:00:00').getDay();

// Janela de análise do consumo (últimos N dias de saídas).
// 15 dias: responde mais rápido a mudanças de demanda (ex.: alta temporada
// puxa o mín/máx pra cima, sugerindo compras maiores) sem ficar tão ruidoso.
const JANELA_DIAS = 15;
// Só sugere depois de 15 dias de histórico desde a primeira saída —
// antes disso a média seria distorcida pela falta de dados.
const MIN_DIAS_DADOS = 15;
// Política do restaurante: mínimo cobre 3 dias de produção, máximo cobre 6
export const DIAS_MIN = 3;
export const DIAS_MAX = 6;

const DIA_MS = 86400000;
const diffDias = (a, b) => Math.round((new Date(b) - new Date(a)) / DIA_MS);

// kg arredonda para 0,5; unidades inteiras arredondam para cima
const arredondar = (v, unidade) =>
  unidade === 'unid' ? Math.ceil(v) : Math.ceil(v * 2) / 2;

/**
 * Sugestões de estoque mín/máx por produto, com base na média diária
 * de saídas (Polo Central + Polo Beer) na janela recente.
 * Retorna { [produtoId]: { min, max, mediaDiaria, dias } } apenas para
 * produtos com saídas registradas e histórico suficiente.
 */
export function calcSugestoesMinMax(produtos, saidas, ref = hoje(), diasMin = DIAS_MIN, diasMax = DIAS_MAX, porDiaSemana = false) {
  if (!saidas.length) return {};

  const primeira = saidas.reduce((m, s) => (s.data < m ? s.data : m), saidas[0].data);
  const diasObservados = Math.min(JANELA_DIAS, diffDias(primeira, ref) + 1);
  if (diasObservados < MIN_DIAS_DADOS) return {};

  const inicioJanela = new Date(new Date(ref).getTime() - (JANELA_DIAS - 1) * DIA_MS)
    .toISOString().slice(0, 10);

  const totais = {};        // consumo total por produto na janela
  const totaisWd = {};      // consumo por produto por dia-da-semana (modo sazonal)
  const cntWd = [0, 0, 0, 0, 0, 0, 0]; // quantas vezes cada dia-da-semana ocorreu na janela

  if (porDiaSemana) {
    for (let d = 0; d < diasObservados; d++) {
      const dia = addDias(ref, -d);
      if (dia < inicioJanela) break;
      cntWd[weekdayOf(dia)]++;
    }
  }

  saidas.forEach(s => {
    if (s.data < inicioJanela || s.data > ref) return;
    const wd = porDiaSemana ? weekdayOf(s.data) : 0;
    (s.itens || []).forEach(it => {
      const q = parseFloat(it.quantidade) || 0;
      totais[it.produtoId] = (totais[it.produtoId] || 0) + q;
      if (porDiaSemana) {
        const m = totaisWd[it.produtoId] || (totaisWd[it.produtoId] = [0, 0, 0, 0, 0, 0, 0]);
        m[wd] += q;
      }
    });
  });

  const sug = {};
  produtos.forEach(p => {
    const total = totais[p.id];
    if (!total) return;
    const media = total / diasObservados;
    let minVal, maxVal;
    if (porDiaSemana) {
      // média por dia-da-semana (cai para a média geral quando aquele dia não ocorreu)
      const wdAvg = cntWd.map((c, wd) => (c > 0 ? (totaisWd[p.id]?.[wd] || 0) / c : media));
      // soma o consumo previsto dos próximos N dias (cobre picos de fim de semana)
      const somaProximos = (n) => {
        let soma = 0;
        for (let i = 1; i <= n; i++) soma += wdAvg[weekdayOf(addDias(ref, i))];
        return soma;
      };
      minVal = somaProximos(diasMin);
      maxVal = somaProximos(diasMax);
    } else {
      minVal = media * diasMin;
      maxVal = media * diasMax;
    }
    sug[p.id] = {
      mediaDiaria: media,
      dias: diasObservados,
      min: arredondar(minVal, p.unidade),
      max: arredondar(maxVal, p.unidade),
    };
  });
  return sug;
}

/**
 * Produtos ativos cujo mín/máx atual diverge da sugestão além da tolerância
 * (proporção, ex.: 0.2 = 20%). Produto sem meta definida (0) com sugestão
 * disponível também conta como divergente.
 */
export function produtosDivergentes(produtos, sug, tolerancia = 0.2) {
  return produtos.filter(p => {
    const s = sug[p.id];
    if (!s || !p.ativo) return false;
    const dMin = p.min > 0 ? Math.abs(p.min - s.min) / p.min : (s.min > 0 ? 1 : 0);
    const dMax = p.max > 0 ? Math.abs(p.max - s.max) / p.max : (s.max > 0 ? 1 : 0);
    return dMin > tolerancia || dMax > tolerancia;
  });
}
