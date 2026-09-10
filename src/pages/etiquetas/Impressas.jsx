import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import Aviso from '../../components/Aviso';
import { useApp } from '../../store/AppContext';
import { useAuth } from '../../store/AuthContext';
import { useUI } from '../../store/UIContext';
import { pode } from '../../utils/permissoes';
import { supabase } from '../../lib/supabase';
import { hoje, fmtData } from '../../utils/formatters';
import { statusEtiqueta, STATUS_ETIQUETA, medidaDoProduto, totaisImpressos } from '../../utils/etiquetas';
import { prazosDoProduto } from '../../utils/armazenamento';

/**
 * O que já saiu no rolo — e o botão de fazer de novo.
 *
 * ⚠️ POR QUE ESTA TELA EXISTE. Até aqui, uma etiqueta que rasgou, molhou ou
 * saiu borrada obrigava a REMONTAR tudo: achar o item, escolher o
 * armazenamento, conferir a data. Com o pote na mão, no meio do serviço. E o
 * pior é que remontar não devolve a MESMA etiqueta — a validade é recalculada
 * a partir de hoje, então o pote de ontem ganhava uma data nova e errada.
 *
 * ⚠️ REIMPRIMIR REPETE, NÃO RECALCULA. As datas vêm gravadas do registro e
 * entram prontas no modal; o prazo do cadastro nem é consultado. Uma etiqueta
 * de reposição tem de ser idêntica à que estragou, senão o pote passa a mentir
 * sobre a própria idade — que é exatamente o que a etiqueta existe para
 * impedir.
 */
export default function Impressas() {
  const { etiquetasImpressas, setEtiquetasImpressas, produtos, permissoes, rid } = useApp();
  const { sessao } = useAuth();
  const { abrirEtiquetas, confirm, toast } = useUI();
  const verRelatorio = pode(sessao, permissoes, 'verRelatorioEtiquetas');
  // ⚠️ APAGAR É SÓ DA CONTA DONA, a pedido dele — e não é capacidade da
  // matriz, é CARGO: o relatório é o número com que ele cobra a equipe, e
  // quem pudesse apagar etiqueta mexeria nele. O banco confere de novo
  // (M44). O super-admin fica de fora: no modo suporte o banco o recusaria.
  const podeApagar = sessao?.cargo === 'diretoria' && !sessao?.eSuperAdmin;
  const [apagando, setApagando] = useState('');
  const [busca, setBusca] = useState('');

  const hj = hoje();

  // Mais recentes primeiro, agrupadas por dia. `impressoEm` é só a data (sem
  // hora), então o dia é o agrupamento natural — e é como a cozinha procura:
  // "aquela que eu fiz hoje de manhã".
  const dias = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = (etiquetasImpressas || [])
      .filter(e => !termo || (e.nome || '').toLowerCase().includes(termo));
    const porDia = new Map();
    for (const e of lista) {
      const d = e.impressoEm || '';
      if (!porDia.has(d)) porDia.set(d, []);
      porDia.get(d).push(e);
    }
    // ⚠️ Dentro do dia, a MAIS RECENTE primeiro. Quem abre esta tela quase
    // sempre quer a última que saiu — foi ela que rasgou. Etiqueta antiga sem
    // `impressoEmHora` (gravada antes de 10/09) cai para o fim do dia em vez
    // de embaralhar as que têm hora.
    for (const [, lista_] of porDia) {
      lista_.sort((a, b) => (b.impressoEmHora || '').localeCompare(a.impressoEmHora || ''));
    }
    return [...porDia.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [etiquetasImpressas, busca]);

  const totalDoDia = (lista) => lista.reduce((s, e) => s + (e.copias || 1), 0);

  // A conta vive em utils/etiquetas.js, com teste — ver o porquê lá.
  const totais = useMemo(() => totaisImpressos(etiquetasImpressas, hj), [etiquetasImpressas, hj]);

  const reimprimir = (e) => {
    const p = e.produtoId ? produtos.find(x => x.id === e.produtoId) : null;
    abrirEtiquetas([{
      produtoId: e.produtoId || null,
      nome: e.nome,
      // ⚠️ AS DATAS VÊM DO REGISTRO, não do cadastro. `validade` pronta tem
      // prioridade dentro de `montarCamposEtiqueta`, então o prazo do produto
      // não é consultado e a etiqueta nova sai com a data da antiga.
      dataFabricacao: e.fabricacao || null,
      validade: e.validade || null,
      // ⚠️ TUDO QUE DECIDE O TEXTO VEM DO REGISTRO, não do cadastro. O item
      // pode ter sido apagado ou ter mudado de prazo desde a impressão; a
      // etiqueta de reposição tem de sair igual à que estragou. O produto só
      // é consultado para o que o registro NÃO guarda.
      tipoData: e.tipoData || p?.tipoData || 'fabricacao',
      armazenamento: e.armazenamento || null,
      // Hora do papel original, não a de agora — ver o porquê em EtiquetaPrint.
      horaOriginal: e.hora || '',
      prazos: p ? prazosDoProduto(p) : {},
      medida: e.medida || (p ? medidaDoProduto(p) : ''),
      responsavel: e.responsavel || '',
      quantidade: 1,
      // ⚠️ Marca para o relatório (M43) contar à parte. Reimpressão demais é
      // sinal de etiqueta estragando no pote, e o dono só enxerga isso se ela
      // não se misturar com a produção do dia.
      reimpressao: true,
    }]);
  };

  // ⚠️ APAGA DOS DOIS LUGARES, NESTA ORDEM: primeiro o relatório (banco),
  // depois esta lista. Ao contrário, uma falha de rede deixaria a etiqueta
  // fora da lista e ainda contada no relatório — sem mais nenhum botão para
  // tirar de lá.
  const apagar = async (e) => {
    const ok = await confirm({
      titulo: `Apagar a etiqueta de ${e.nome}?`,
      mensagem: 'Ela sai desta lista e do relatório de etiquetas. Use quando a etiqueta foi contada mas não chegou a sair no papel.',
      perigo: true, confirmar: 'Apagar',
    });
    if (!ok) return;
    setApagando(e.id);
    if (rid && rid !== 'demo') {
      let erro;
      try {
        const { error } = await supabase.rpc('apagar_impressao', {
          p_id: e.impressaoId || null,
          p_lote: e.id || null,
          p_dia: e.impressoEm || null,
          p_hora: e.impressoEmHora || null,
          p_item: e.nome || '',
          p_copias: parseInt(e.copias) || 1,
        });
        erro = error?.message || '';
      } catch (err) { erro = err?.message || 'erro'; }
      if (erro) {
        setApagando('');
        toast(/fetch|network|conex/i.test(erro)
          ? 'Precisa de internet para apagar: a etiqueta também sai do relatório.'
          : `Não apaguei: ${erro}`, 'erro');
        return;
      }
    }
    setEtiquetasImpressas((etiquetasImpressas || []).filter(x => x.id !== e.id));
    setApagando('');
    toast('Etiqueta apagada da lista e do relatório.', 'sucesso');
  };

  const vazio = !(etiquetasImpressas || []).length;

  return (
    <Layout title="Impressas">
      {/* ⚠️ FORA DO "vazio", de propósito: a lista abaixo é deste aparelho,
          o relatório é da casa inteira. Um tablet novo, sem nada impresso
          ainda, continua precisando chegar no relatório dos outros. */}
      {verRelatorio && (
        <Link to="/relatorio-etiquetas"
          className="mb-4 flex items-center justify-between gap-2 bg-polo-navy text-polo-gold rounded-xl px-4 min-h-11 text-sm font-bold">
          <span>Relatório por dia, semana e mês</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
      {vazio ? (
        <Aviso tom="neutro">
          Nada impresso ainda. O que sair no rolo aparece aqui, e dá para repetir
          uma etiqueta que rasgou sem precisar montar tudo de novo.
        </Aviso>
      ) : (
        <div className="space-y-4">
          {/* ⚠️ OS TOTAIS FICAM FORA DA BUSCA, de propósito: são o quanto a
              casa imprimiu, não o quanto o filtro achou. Um número de controle
              que muda quando se digita no campo de busca é um número em que
              ninguém confia. */}
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Hoje', totais.hoje],
              ['7 dias', totais.semana],
              ['Este mês', totais.mes],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-polo-navy leading-none">{valor}</p>
                <p className="text-[11px] text-gray-600 mt-1">{rotulo}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-600 -mt-2">
            Etiquetas de papel, contando as cópias. “Este mês” é o mês do calendário.
          </p>

          <input
            type="search" value={busca} onChange={ev => setBusca(ev.target.value)}
            placeholder="Procurar pelo nome do item" aria-label="Procurar etiqueta impressa"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />

          {!dias.length && (
            <Aviso tom="neutro">Nenhuma etiqueta com esse nome.</Aviso>
          )}

          {dias.map(([dia, lista]) => (
            <section key={dia} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-xs font-bold text-polo-navy uppercase">
                  {dia === hj ? 'Hoje' : fmtData(dia)}
                </h2>
                <span className="text-[11px] text-gray-600">
                  {totalDoDia(lista)} {totalDoDia(lista) === 1 ? 'etiqueta' : 'etiquetas'}
                </span>
              </div>

              <ul className="space-y-2">
                {lista.map(e => {
                  const st = statusEtiqueta(e, hj);
                  const info = STATUS_ETIQUETA[st] || STATUS_ETIQUETA.valida;
                  return (
                    <li key={e.id} className="bg-white border border-gray-200 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-gray-800 truncate">
                            {e.nome}{e.medida ? ` · ${e.medida}` : ''}
                          </p>
                          {/* ⚠️ A HORA AQUI É A DA IMPRESSÃO, não a que está
                              escrita na etiqueta. Numa reimpressão as duas são
                              diferentes de propósito: o papel repete a hora de
                              manipulação original, e esta lista mostra quando o
                              rolo andou. Etiqueta gravada antes de 10/09 não
                              tem a hora — aí a linha sai sem ela, em vez de
                              inventar um horário. */}
                          <p className="text-[11px] text-gray-600 mt-0.5">
                            {e.impressoEmHora ? `${e.impressoEmHora} · ` : ''}
                            {e.validade ? `Validade ${fmtData(e.validade)}` : 'sem validade'}
                            {e.responsavel ? ` · ${e.responsavel}` : ''}
                            {(e.copias || 1) > 1 ? ` · ${e.copias} cópias` : ''}
                          </p>
                          <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${info.cor}`}>
                            {info.label}
                          </span>
                        </div>
                        {/* ⚠️ Alvo de 44px: é tocado com o dedo numa bancada, e
                            os controles menores que isso já foram achado de
                            acessibilidade neste app. */}
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => reimprimir(e)}
                            aria-label={`Reimprimir etiqueta de ${e.nome}`}
                            className="min-h-11 px-3 rounded-xl bg-polo-navy text-polo-gold text-xs font-bold">
                            Reimprimir
                          </button>
                          {podeApagar && (
                            <button
                              onClick={() => apagar(e)} disabled={apagando === e.id}
                              aria-label={`Apagar etiqueta de ${e.nome}`}
                              className="min-h-11 px-3 rounded-xl border border-red-200 text-red-700 text-xs font-bold disabled:opacity-50">
                              {apagando === e.id ? 'Apagando…' : 'Apagar'}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Layout>
  );
}
