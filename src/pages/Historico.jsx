import { useState } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { fmtData, fmtNum } from '../utils/formatters';
import { nomeProduto } from '../utils/calculos';
import { pode } from '../utils/permissoes';

export default function Historico() {
  const {
    produtos, compras, entradas, saidas, aparas, desperdicio, ajustes, recebimentos, locais,
    removeCompra, removeEntrada, removeSaida, removeApara, removeDesperdicio, removeAjuste,
    restaurarRegistro, permissoes } = useApp();
  const { sessao } = useAuth();
  const podeRemover = pode(sessao, permissoes, 'removerRegistros');
  const { toast, confirm, abrirEtiquetas } = useUI();
  const destNome = (v) => v === 'producao' ? '🍲 Uso Interno' : (locais.find(l => l.id === v)?.nome || v);
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');

  const nome = (id) => nomeProduto(produtos, id);
  const itensTxt = (r) => (r.itens || []).map(i => `${fmtNum(i.quantidade)} ${nome(i.produtoId)}`).join(', ');

  // Remover uma produção: devolve ingredientes primeiro (saída), depois remove o produto final (entrada)
  // Ordem importa: se houver falha parcial, é melhor ter ingredientes em estoque do que produto fantasma
  const removerProducao = (entrada) => {
    const saidaPar = saidas.find(s => s.producaoId === entrada.producaoId);
    if (saidaPar) removeSaida(saidaPar.id);
    removeEntrada(entrada.id);
    return { producao: true, entrada, saida: saidaPar || null };
  };

  // Monta a lista unificada
  const eventos = [
    ...compras.map(r => ({ id: r.id, grupo: 'compras', icon: '🛒', cor: 'text-blue-600', r,
      resumo: `${fmtNum(r.quantidade)} ${r.unidade} de ${r.item}${r.fornecedor ? ` · ${r.fornecedor}` : ''}`,
      remover: () => { removeCompra(r.id); return { tipo: 'compra', reg: r }; } })),
    ...entradas.filter(e => !e.producaoId).map(r => ({ id: r.id, grupo: 'entradas', icon: '📥', cor: 'text-green-600', r,
      resumo: itensTxt(r), remover: () => { removeEntrada(r.id); return { tipo: 'entrada', reg: r }; } })),
    ...entradas.filter(e => e.producaoId).map(r => ({ id: r.id, grupo: 'producao', icon: '🍲', cor: 'text-amber-600', r,
      resumo: itensTxt(r) + ((r.monitorados || []).length ? ` · monitorado: ${r.monitorados.map(m => `${fmtNum(m.quantidade)} ${m.nome}`).join(', ')}` : ''),
      remover: () => removerProducao(r) })),
    ...saidas.filter(s => s.destino !== 'producao').map(r => ({ id: r.id, grupo: 'saidas', icon: '📤', cor: 'text-red-600', r,
      resumo: `${itensTxt(r)} → ${destNome(r.destino)}`, remover: () => { removeSaida(r.id); return { tipo: 'saida', reg: r }; } })),
    // Saída interna ÓRFÃ (produção incompleta): a entrada do produto final não
    // existe — precisa aparecer aqui para o operador remover/desfazer o consumo
    ...saidas.filter(s => s.destino === 'producao' && s.producaoId &&
        !entradas.some(e => e.producaoId === s.producaoId))
      .map(r => ({ id: r.id, grupo: 'producao', icon: '⚠️', cor: 'text-red-600', r,
        resumo: `Produção incompleta — o item produzido não entrou. Remova e registre de novo: ${itensTxt(r)}`,
        remover: () => { removeSaida(r.id); return { tipo: 'saida', reg: r }; } })),
    ...aparas.map(r => ({ id: r.id, grupo: 'correcoes', icon: '✂️', cor: 'text-teal-600', r,
      resumo: `${fmtNum(r.quantidade)} ${r.unidade} de ${r.item} → ${r.destinoOutro || r.destino}`,
      remover: () => { removeApara(r.id); return { tipo: 'apara', reg: r }; } })),
    ...desperdicio.map(r => ({ id: r.id, grupo: 'correcoes', icon: '🗑️', cor: 'text-gray-600', r,
      resumo: `${fmtNum(r.quantidade)} ${r.unidade} de ${r.item} (${r.motivoOutro || r.motivo}${r.origem === 'estoque' ? ' · baixa' : ''})`,
      remover: () => { removeDesperdicio(r.id); return { tipo: 'perda', reg: r }; } })),
    // Contagem física faltava aqui — e é o lançamento que MAIS muda o saldo
    // (sobrepõe o calculado). Quem procurava "por que o estoque mudou" não
    // encontrava a resposta na tela que promete mostrar tudo.
    ...ajustes.map(r => ({ id: r.id, grupo: 'correcoes', icon: '📐', cor: 'text-indigo-600', r,
      resumo: `contagem física: ${nome(r.produtoId)} → ${fmtNum(r.quantidade)}`,
      remover: () => { removeAjuste(r.id); return { tipo: 'ajuste', reg: r }; } })),
    // Recebimento da Produção. Sem isto o Histórico da Finalização ficava
    // quase vazio, justamente onde receber é quase tudo o que acontece.
    // NÃO tem `remover`: a linha pertence à saída da Produção — apagar aqui
    // apagaria o lançamento do outro estoque pelas costas de quem o fez.
    ...recebimentos.map(r => ({ id: r.id, grupo: 'recebimentos', icon: '📦', cor: 'text-emerald-600', r,
      resumo: `recebido da produção: ${itensTxt(r)}` })),
  ];

  // Trocar de estoque pode fazer o grupo filtrado deixar de existir (ex.: sair
  // da Finalização com "Recebidos" ativo). Sem isto a tela ficava vazia e o
  // chip correspondente já não estava lá para desmarcar.
  const filtroAtivo = (filtro === 'todas' || eventos.some(e => e.grupo === filtro)) ? filtro : 'todas';
  const filtrados = eventos
    .filter(e => filtroAtivo === 'todas' || e.grupo === filtroAtivo)
    .filter(e => !busca || `${e.resumo} ${e.r.responsavel || ''}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => (b.r.ts || 0) - (a.r.ts || 0));

  // Chip só aparece quando existe evento daquele grupo — senão a Finalização
  // mostraria "Compras" e "Produção" vazios, e a Produção mostraria
  // "Recebidos", que nunca tem nada.
  const TODOS_CHIPS = [
    ['todas', 'Tudo'], ['entradas', '📥 Entradas'], ['saidas', '📤 Saídas'],
    ['recebimentos', '📦 Recebidos'],
    ['producao', '🍲 Produção'], ['compras', '🛒 Compras'], ['correcoes', '✂️ Correções'],
  ];
  const CHIPS = TODOS_CHIPS.filter(([v]) => v === 'todas' || eventos.some(e => e.grupo === v));

  // Reimprimir etiquetas de uma entrada/produção antiga (dados reais do registro)
  const reimprimirEtiquetas = (ev) => {
    const r = ev.r;
    abrirEtiquetas((r.itens || []).map(item => {
      const p = produtos.find(x => x.id === item.produtoId);
      return {
        produtoId: item.produtoId,
        nome: p?.nome || item.produtoId,
        tipoData: 'fabricacao',
        dataFabricacao: r.data,
        armazenamento: r.armazenamento || null,
        diasCongelado: p?.valCongelado || 0,
        diasResfriado: p?.valResfriado || 0,
        validade: item.validade || null,
        responsavel: r.responsavel || '',
        quantidade: 1,
      };
    }));
  };

  const handleRemover = async (ev) => {
    const ok = await confirm({ titulo: 'Remover registro', mensagem: 'Remover este lançamento? O estoque será recalculado.', perigo: true, confirmar: 'Remover' });
    if (!ok) return;
    const undo = ev.remover();
    if (undo?.producao) {
      toast(
        undo.saida ? 'Produção removida (item produzido e ingredientes).' : 'Produção removida (ingredientes não encontrados — só o item produzido foi retirado).',
        'sucesso',
        { acao: { label: 'Desfazer', onClick: () => {
          restaurarRegistro('entrada', undo.entrada);
          if (undo.saida) restaurarRegistro('saida', undo.saida);
        } } },
      );
    } else if (undo) {
      toast('Registro removido.', 'sucesso', { acao: { label: 'Desfazer', onClick: () => restaurarRegistro(undo.tipo, undo.reg) } });
    }
  };

  return (
    <Layout title="Histórico">
      <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
        placeholder="🔍 Buscar por item ou responsável..."
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-3" />

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mb-3">
        {CHIPS.map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0
              ${filtroAtivo === v ? 'bg-polo-navy text-polo-gold' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {l}
          </button>
        ))}
      </div>

      {filtrados.length === 0 && <div className="text-center text-gray-500 py-12">Nenhum lançamento por aqui ainda.</div>}

      <div className="space-y-2">
        {filtrados.map(ev => (
          <div key={ev.grupo + ev.id} className="bg-white rounded-xl p-3 flex items-start gap-3">
            <span className="text-xl flex-shrink-0 mt-0.5">{ev.icon}</span>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${ev.cor} break-words`}>{ev.resumo}</div>
              <div className="text-[11px] text-gray-600">
                {fmtData(ev.r.data)}{ev.r.hora ? ` • ${ev.r.hora}` : ''}{ev.r.responsavel ? ` • ${ev.r.responsavel}` : ''}
              </div>
              {ev.r.obs && <div className="text-[11px] text-gray-600 italic mt-0.5">{ev.r.obs}</div>}
            </div>
            {/* ⚠️ Alvos de 44 px e separados. Eram dois botões de ~24 px colados:
                errar aqui remove um lançamento no lugar de reimprimir a etiqueta
                dele — o toque errado mais caro do app. */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {(ev.grupo === 'entradas' || ev.grupo === 'producao') && (ev.r.itens || []).length > 0 && (
                <button onClick={() => reimprimirEtiquetas(ev)} aria-label="Reimprimir etiquetas deste registro"
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-polo-beige text-polo-navy text-lg flex-shrink-0">🏷️</button>
              )}
              {podeRemover && ev.remover && (
                <button onClick={() => handleRemover(ev)}
                  className="min-h-11 px-3 rounded-xl text-sm font-semibold text-red-700 bg-red-50 border border-red-200 flex-shrink-0">Remover</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
