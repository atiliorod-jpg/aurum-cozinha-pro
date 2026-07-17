import { useState } from 'react';
import Layout from '../components/Layout';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import ResponsavelSelect from '../components/ResponsavelSelect';
import { hoje, fmtData, fmtHora, fmtNum } from '../utils/formatters';
import { validarDataRegistro, addDias } from '../utils/datas';
import { planejarProducao } from '../utils/producao';

export default function Producao() {
  const { producoes, produtos, addEntrada, addSaida, estoque, listaManual, setListaManual, prefs, setPref } = useApp();
  const { temPermissao } = useAuth();
  const { toast, confirm, abrirEtiquetas } = useUI();

  const [searchParams] = useSearchParams();
  const rParam = searchParams.get('r');

  const [data, setData] = useState(hoje());
  const [responsavel, setResponsavel] = useState(prefs.responsavel || '');
  const [produtoId, setProdutoId] = useState(() => {
    if (rParam) {
      const receitaAlvo = producoes.find(r => r.id === rParam);
      if (receitaAlvo) return receitaAlvo.produtoFinalId;
    }
    const prodComReceita = produtos.find(p => p.ativo && producoes.some(r => r.produtoFinalId === p.id));
    return prodComReceita?.id || '';
  });
  const [quantidade, setQuantidade] = useState('');
  const [armazenamento, setArmazenamento] = useState(() => {
    if (rParam) {
      const receitaAlvo = producoes.find(r => r.id === rParam);
      if (receitaAlvo?.armazenamento && receitaAlvo.armazenamento !== 'ambos') return receitaAlvo.armazenamento;
    }
    return 'congelado';
  });
  const [obs, setObs] = useState('');
  const [mostraIngredientes, setMostraIngredientes] = useState(false);
  // Trava anti-duplo-toque: sem ela, o 2º toque cai no fallback do rendimento
  // base (o 1º toque limpa o campo quantidade) e registra a produção DUAS vezes.
  const [salvando, setSalvando] = useState(false);
  const prodNome = (id) => produtos.find(p => p.id === id)?.nome || id;
  const prodUnid = (id) => produtos.find(p => p.id === id)?.unidade || '';

  // Encontra a receita automaticamente para o produto selecionado
  const receita = produtoId ? producoes.find(r => r.produtoFinalId === produtoId) : null;
  const produto = produtos.find(p => p.id === produtoId);
  const quantidadeNum = parseFloat(quantidade) || 0;
  const plano = receita ? planejarProducao(receita, quantidadeNum || receita.rendimentoBase, estoque) : { itens: [], faltaAlgum: false };
  const diasValPrevisao = armazenamento === 'congelado' ? (produto?.valCongelado || 0) : (produto?.valResfriado || 0);
  const validadePrevisao = produtoId && diasValPrevisao > 0 ? addDias(data, diasValPrevisao) : null;

  const registrar = () => {
    const pid = `prc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    // quantidade é sempre a digitada — handleProduzir barra vazio/zero antes de chegar aqui
    const qtdFinal = quantidadeNum;
    const receitaNome = receita?.nome || prodNome(produtoId);
    const obsTxt = `Produção: ${receitaNome}${obs ? ` — ${obs}` : ''}`;
    // calcula validade do produto final com base no armazenamento escolhido
    const diasVal = armazenamento === 'congelado' ? (produto?.valCongelado || 0) : (produto?.valResfriado || 0);
    const validade = diasVal > 0 ? addDias(data, diasVal) : undefined;
    // ingredientes que ABATEM do estoque (frios/proteínas controlados)
    const abateItens = plano.itens.filter(i => i.abate && i.produtoId && i.quantidade > 0)
      .map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade }));
    // ingredientes SÓ monitorados (estoque seco): registrados, sem baixa
    const monitorados = plano.itens.filter(i => !i.abate && i.quantidade > 0)
      .map(i => ({ nome: i.nome, unidade: i.unidade || '', quantidade: i.quantidade }));
    // 1) saída interna de produção SÓ dos itens controlados
    if (abateItens.length) {
      addSaida({ data, hora: fmtHora(), responsavel, destino: 'producao', producaoId: pid, obs: obsTxt, itens: abateItens });
    }
    // 2) dá entrada no produto final produzido (guarda os monitorados junto)
    addEntrada({
      data, hora: fmtHora(), responsavel, armazenamento, producaoId: pid, obs: obsTxt,
      monitorados,
      itens: [{ produtoId, quantidade: qtdFinal, ...(validade ? { validade } : {}) }],
    });
    if (responsavel) setPref('responsavel', responsavel);
    setQuantidade(''); setObs('');
    toast(`Produção registrada: ${fmtNum(qtdFinal)} ${prodUnid(produtoId)} de ${prodNome(produtoId)}!`, 'sucesso');
    // Oferece imprimir as etiquetas dos potes/embalagens desta produção
    // (quantidade de etiquetas é escolhida no modal — não há relação fixa com a qtd produzida)
    abrirEtiquetas([{
      produtoId,
      nome: prodNome(produtoId),
      tipoData: 'fabricacao',
      dataFabricacao: data,
      armazenamento,
      diasCongelado: produto?.valCongelado || 0,
      diasResfriado: produto?.valResfriado || 0,
      validade: validade || null,
      responsavel,
      quantidade: 1,
    }]);
  };

  const handleProduzir = async () => {
    if (salvando) return; // já registrando — ignora toques repetidos
    if (!produtoId) { toast('Escolha o produto produzido.', 'aviso'); return; }
    // quantidade EXPLÍCITA obrigatória: sem fallback silencioso pro rendimento
    // da ficha (gravava lote que o usuário não digitou — auditoria 11/07)
    const qtdFinal = quantidadeNum;
    if (qtdFinal <= 0) { toast('Digite a quantidade produzida (o rendimento da ficha é só sugestão).', 'aviso'); return; }
    if (produto?.unidade === 'unid' && !Number.isInteger(qtdFinal)) {
      toast('Quantidade deve ser número inteiro para produtos em unidades.', 'erro'); return;
    }
    const v = validarDataRegistro(data);
    if (!v.ok) { toast('Não é possível registrar em data futura.', 'erro'); return; }
    if (v.confirmar) {
      const ok = await confirm({ titulo: 'Registro antigo', mensagem: `Esta produção é de ${v.dias} dias atrás (${fmtData(data)}). Confirma a data?`, confirmar: 'Sim' });
      if (!ok) return;
    }
    if (plano.faltaAlgum) {
      const lista = plano.itens.filter(i => !i.suficiente)
        .map(i => `• ${prodNome(i.produtoId)}: tem ${fmtNum(i.emEstoque)}, precisa ${fmtNum(i.quantidade)} ${prodUnid(i.produtoId)}`).join('\n');
      const ok = await confirm({
        titulo: 'Ingredientes insuficientes',
        mensagem: `Faltam ingredientes em estoque:\n\n${lista}\n\nProduzir mesmo assim? (o estoque desses itens ficará negativo)`,
        perigo: true, confirmar: 'Produzir assim mesmo',
      });
      if (!ok) return;
    }
    setSalvando(true);
    try { registrar(); } finally { setTimeout(() => setSalvando(false), 800); }
  };

  const produtosComReceita = produtos.filter(p => p.ativo && producoes.some(r => r.produtoFinalId === p.id));
  const semProdutos = produtosComReceita.length === 0;

  return (
    <Layout title="Produção">
      {semProdutos ? (
          <div className="bg-white rounded-xl p-6 text-center space-y-2">
            <p className="text-3xl">🍲</p>
            <p className="font-semibold text-polo-navy">Nenhuma ficha de porcionamento ainda</p>
            <p className="text-sm text-gray-500">
              Aqui você executa as fichas de porcionamento e semiacabados da casa
              (ex.: empanado porcionado, molho base) — baixa os ingredientes e dá entrada no item produzido.
            </p>
            {temPermissao('gerencia')
              ? <Link to="/configuracoes" className="inline-block mt-2 bg-polo-navy text-polo-gold font-bold px-5 py-2.5 rounded-xl text-sm">Criar ficha de produção</Link>
              : <p className="text-xs text-gray-400 mt-2">Peça à gerência para cadastrar as receitas em Configurações.</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">O que você produziu?</label>
                <select value={produtoId} onChange={e => { setProdutoId(e.target.value); const r = producoes.find(x => x.produtoFinalId === e.target.value); if (r?.armazenamento && r.armazenamento !== 'ambos') setArmazenamento(r.armazenamento); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Escolha um produto…</option>
                  {produtosComReceita.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
                  <input type="date" value={data} max={hoje()} onChange={e => setData(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Quantidade ({prodUnid(produtoId)})
                  </label>
                  <input type="number" min="0" step={produto?.unidade === 'unid' ? '1' : '0.5'} value={quantidade} onChange={e => setQuantidade(e.target.value)}
                    placeholder={receita ? `ex: ${fmtNum(receita.rendimentoBase)}` : '0'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  {receita && !quantidade && (
                    <button type="button" onClick={() => setQuantidade(String(receita.rendimentoBase))}
                      className="text-[10px] text-polo-navy font-semibold underline underline-offset-2 mt-0.5">
                      Usar rendimento da ficha ({fmtNum(receita.rendimentoBase)})
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Armazenamento do item produzido</label>
                <div className="flex gap-2">
                  {[['congelado', '❄️ Congelado'], ['resfriado', '🧊 Resfriado']].map(([v, l]) => (
                    <button key={v} onClick={() => setArmazenamento(v)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors
                        ${armazenamento === v ? 'border-polo-gold bg-polo-navy text-polo-gold' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsavelSelect value={responsavel} onChange={setResponsavel} />
            </div>

            {/* Estoque atual + resultado da produção */}
            {produtoId && (() => {
              const atualFinal = estoque[produtoId] ?? 0;
              const minFinal = produto?.min ?? 0;
              const abaixo = minFinal > 0 && atualFinal < minFinal;
              const qtdAposProduzir = quantidadeNum; // só o que foi digitado — sem fallback
              return (
                <div className={`rounded-xl p-3 border ${abaixo ? 'bg-orange-50 border-orange-300' : 'bg-polo-beige border-polo-gold/30'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-500">Em estoque agora</p>
                      <p className={`text-lg font-bold ${abaixo ? 'text-orange-700' : 'text-polo-navy'}`}>
                        {fmtNum(atualFinal)} {produto?.unidade}
                      </p>
                      {minFinal > 0 && (
                        <p className="text-[11px] text-gray-500">mín {minFinal} {produto?.unidade}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-gray-500">Após produzir</p>
                      <p className="text-lg font-bold text-green-700">
                        {fmtNum(atualFinal + qtdAposProduzir)} {produto?.unidade}
                      </p>
                      <p className="text-[11px] text-gray-500">{prodNome(produtoId)}</p>
                      {validadePrevisao && (
                        <p className="text-[11px] font-semibold text-polo-navy">val: {fmtData(validadePrevisao)}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Ingredientes — painel colapsável */}
            {receita && plano.itens.length > 0 && (
              <div className="bg-white rounded-xl overflow-hidden">
                <button
                  onClick={() => setMostraIngredientes(!mostraIngredientes)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    📋 Ingredientes {mostraIngredientes ? '▼' : '▶'}
                  </p>
                  <span className="text-[11px] text-gray-400">{plano.itens.length} item(ns)</span>
                </button>
                {mostraIngredientes && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {plano.itens.map((i, idx) => (
                      <div key={idx} className="flex items-center justify-between px-4 py-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-gray-800 truncate">
                            {i.abate ? prodNome(i.produtoId) : i.nome}
                            {!i.abate && <span className="ml-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">só monitora</span>}
                          </div>
                          {i.abate ? (
                            <div className="text-xs text-gray-500">
                              Em estoque: <span className={i.suficiente ? 'text-gray-600 font-semibold' : 'text-red-500 font-semibold'}>{fmtNum(i.emEstoque)} {prodUnid(i.produtoId)}</span>
                              {!i.suficiente && <span className="text-red-500 font-semibold"> • falta {fmtNum(i.falta)}</span>}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">Estoque seco — não dá baixa</div>
                          )}
                        </div>
                        <div className="text-sm font-bold text-polo-navy whitespace-nowrap">{fmtNum(i.quantidade)} {i.abate ? prodUnid(i.produtoId) : (i.unidade || '')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-xl p-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Observação (opcional)</label>
              <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
                placeholder="Alguma observação..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
            </div>

            {receita && plano.itens.length > 0 && (
              <button onClick={() => {
                const novos = [];
                plano.itens.filter(i => i.abate && !i.suficiente && i.falta > 0).forEach(i => {
                  const p = produtos.find(x => x.id === i.produtoId);
                  novos.push({
                    id: `lm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    produtoId: i.produtoId,
                    nome: p?.nome || i.produtoId,
                    unidade: p?.unidade || '',
                    quantidade: i.falta,
                    origem: `Produção: ${receita.nome}`,
                  });
                });
                plano.itens.filter(i => !i.abate && i.quantidade > 0).forEach(i => {
                  novos.push({
                    id: `lm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    nome: i.nome,
                    unidade: i.unidade || '',
                    quantidade: i.quantidade,
                    origem: `Produção: ${receita.nome}`,
                  });
                });
                if (!novos.length) { toast('Nenhum ingrediente para adicionar.', 'aviso'); return; }
                // Deduplica: soma quantidade se mesma origem+nome já está na lista
                const origemLabel = `Produção: ${receita.nome}`;
                const jaExiste = listaManual.some(i => i.origem === origemLabel);
                if (jaExiste) {
                  toast('Ingredientes desta receita já estão na lista de compras.', 'aviso'); return;
                }
                setListaManual([...listaManual, ...novos]);
                toast(`${novos.length} ingrediente(s) adicionado(s) à lista de compras.`, 'sucesso');
              }}
                className="w-full border-2 border-polo-gold text-polo-navy font-bold py-3 rounded-xl text-sm active:scale-95 transition-transform">
                🧾 Adicionar ingredientes à lista de compras
              </button>
            )}
            <button onClick={handleProduzir} disabled={salvando}
              className="w-full bg-polo-navy text-polo-gold font-bold py-4 rounded-xl text-base active:scale-95 transition-transform disabled:opacity-60">
              {salvando ? 'Registrando…' : '✓ Registrar Produção'}
            </button>
            <p className="text-[11px] text-gray-400 text-center -mt-1">
              {receita && plano.itens.some(i => i.abate)
                ? 'Isso dá entrada no produto e abate os ingredientes automaticamente.'
                : 'Isso registra a produção e atualiza o estoque.'}
            </p>
          </div>
        )
      }
    </Layout>
  );
}
