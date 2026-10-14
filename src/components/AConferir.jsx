import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { hoje, fmtHora, fmtNum, fmtData } from '../utils/formatters';
import { codigoLegivel } from '../utils/baixaEtiqueta';

// =====================================================================
//  "A CONFERIR" — o que a Produção mandou e ninguém da Finalização conferiu
//  (M61, 01/10/2026; só onde o dono ligou a conferência)
//
//  Decisões do dono: o estoque daqui conta desde a SAÍDA da Produção; a
//  conferência só aponta o que não chegou. "Não chegou" vira PERDA aqui —
//  menos na remessa de um turno JÁ FECHADO: a contagem daquele turno já
//  descontou, e lançar perda agora contaria duas vezes (aí só sai da lista).
//
//  Mesma lista na tela Ler etiquetas e no topo do Fechar Turno.
// =====================================================================

export default function AConferir({ titulo = 'A conferir', explicacao = null }) {
  const { pendentesConferir, conferirRemessa, baixarNoDestino, addDesperdicio, produtos, prefs, recebimentos } = useApp();
  const { toast, confirm } = useUI();
  if (!pendentesConferir?.length) return null;

  const produtoDe = (id) => produtos.find(p => p.id === id);
  const quem = prefs.responsavel || '';

  const chegou = (l) => {
    conferirRemessa(l.registroId, l.produtoId, 'chegou', quem);
    toast('Conferido: chegou.', 'sucesso', { duracao: 1500 });
  };

  const naoChegou = async (l) => {
    const p = produtoDe(l.produtoId);
    const ok = await confirm({
      titulo: 'Não chegou',
      mensagem: l.antiga
        ? `${p?.nome || 'Item'}: esta remessa é de um turno já fechado — a contagem daquele turno já descontou. Só sai da lista, sem lançar perda.`
        : `Registrar perda de ${fmtNum(l.quantidade)} ${p?.unidade || ''} de ${p?.nome || 'item'} (não chegou da Produção)? Sai do estoque desta Finalização.`,
      confirmar: l.antiga ? 'Tirar da lista' : 'Registrar perda',
      perigo: !l.antiga,
    });
    if (!ok) return;
    if (!l.antiga) {
      const motivoOutro = 'Não chegou da Produção';
      if (l.etiquetaIds?.length) {
        // pela etiqueta: a perda fica ligada à embalagem (não se perde duas vezes)
        const r = (recebimentos || []).find(x => x.id === l.registroId);
        (r?.itens || []).filter(it => it.etiquetaId && it.produtoId === l.produtoId).forEach(it => {
          baixarNoDestino({
            etq: { id: it.etiquetaId, produtoId: it.produtoId, nome: r.etiqueta?.nome || p?.nome || '', validade: it.validade || null, medida: r.etiqueta?.medida || '' },
            acao: 'perda', potes: Math.max(1, parseInt(it.potes ?? r.potes, 10) || 1), quantidade: Number(it.quantidade) || 0,
            responsavel: quem, turno: prefs.turno || '', motivo: 'O', motivoOutro, produto: p,
          });
        });
      } else {
        addDesperdicio({
          data: hoje(), hora: fmtHora(), turno: prefs.turno || '', responsavel: quem,
          origem: 'estoque', produtoId: l.produtoId, item: p?.nome || '', quantidade: l.quantidade,
          unidade: p?.unidade || '', motivo: 'O', motivoOutro,
        });
      }
    }
    conferirRemessa(l.registroId, l.produtoId, 'nao_chegou', quem);
    toast(l.antiga ? 'Tirado da lista.' : 'Perda registrada: não chegou.', 'sucesso', { duracao: 2000 });
  };

  return (
    <section aria-label={titulo} className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
      <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">{titulo} ({pendentesConferir.length})</p>
      {explicacao && <p className="text-xs text-amber-900">{explicacao}</p>}
      <ul className="bg-white rounded-lg divide-y divide-gray-100">
        {pendentesConferir.map(l => {
          const p = produtoDe(l.produtoId);
          return (
            <li key={`${l.registroId}_${l.produtoId}`} className="px-3 py-2 space-y-1.5">
              <p className="text-sm text-gray-800">
                <strong className="text-polo-navy">{p?.nome || l.produtoId}</strong>
                <span className="text-gray-600"> · {fmtNum(l.quantidade)} {p?.unidade || ''}{l.potes > 1 ? ` (${l.potes} embalagens)` : ''}</span>
              </p>
              <p className="text-xs text-gray-600">
                mandado {l.data ? fmtData(l.data) : ''}{l.hora ? ` às ${l.hora}` : ''}{l.responsavel ? ` por ${l.responsavel}` : ''}
                {l.etiquetaIds?.length ? ` · código ${l.etiquetaIds.map(codigoLegivel).join(', ')}` : ' · lançado à mão'}
                {l.antiga && ' · turno já fechado'}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => chegou(l)}
                  className="flex-1 min-h-11 rounded-lg bg-polo-navy text-polo-gold text-sm font-bold">Chegou</button>
                <button type="button" onClick={() => naoChegou(l)}
                  className="flex-1 min-h-11 rounded-lg bg-white border border-red-200 text-red-700 text-sm font-semibold">Não chegou</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
