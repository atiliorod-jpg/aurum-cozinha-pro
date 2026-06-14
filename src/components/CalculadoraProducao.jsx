import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { planejarProducao } from '../utils/producao';
import { fmtNum } from '../utils/formatters';

// Calculadora de apoio no Início.
// Modo Receita: escolhe receita + quantidade → mostra ingredientes e o que falta.
// Modo Gramatura: escolhe produto + kg disponível → calcula quantas porções dá para produzir.
// Nenhum dos modos registra — é só para a equipe se organizar antes de começar.
export default function CalculadoraProducao() {
  const { producoes, produtos, estoque } = useApp();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState('receita'); // 'receita' | 'gramatura'

  // Produtos com gramatura configurada (fonte única de verdade, unificado)
  const produtosComGramatura = produtos.filter(p => p.ativo && p.gramatura > 0);

  // Modo receita
  const [receitaId, setReceitaId] = useState(producoes[0]?.id || '');
  const [alvo, setAlvo] = useState('');

  // Modo gramatura
  const [prodGramId, setProdGramId] = useState(produtosComGramatura[0]?.id || '');
  const [kgDisponivel, setKgDisponivel] = useState('');
  const [correcaoPct, setCorrecaoPct] = useState('');

  const temReceitas = producoes.length > 0;
  const temProdGram = produtosComGramatura.length > 0;
  if (!temReceitas && !temProdGram) return null;

  const prodNome = (id) => produtos.find(p => p.id === id)?.nome || id;
  const prodUnid = (id) => produtos.find(p => p.id === id)?.unidade || '';

  // ── Cálculos Receita ──────────────────────────────────────
  const receita = producoes.find(r => r.id === receitaId) || producoes[0];
  const finalNome = receita ? prodNome(receita.produtoFinalId) : '';
  const finalUnid = receita ? prodUnid(receita.produtoFinalId) : '';
  const alvoNum = parseFloat(alvo) || 0;
  const usado = alvoNum || receita?.rendimentoBase || 0;
  const plano = receita ? planejarProducao(receita, usado, estoque) : { itens: [], faltaAlgum: false };

  // ── Cálculos Gramatura ────────────────────────────────────
  // Fórmula inversa: dado X kg bruto → quantas porções saem?
  // porções = kg_bruto × (1 - correção%) × (1 - cocção%) × 1000 / gramatura
  const prodGram = produtosComGramatura.find(p => p.id === prodGramId) || null;
  const kgNum = parseFloat(kgDisponivel) || 0;
  const correcao = parseFloat(correcaoPct) || 0;
  const coccao = prodGram?.coccao || 0;
  const kgLiquido = kgNum * (1 - correcao / 100);
  const kgServido = kgLiquido * (1 - coccao / 100);
  const porcoesResultado = prodGram && kgNum > 0
    ? Math.floor(kgServido * 1000 / prodGram.gramatura)
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-polo-gold/30 mb-3 overflow-hidden">
      <button onClick={() => setAberto(!aberto)}
        className="w-full px-4 py-3 flex items-center justify-between text-left active:bg-polo-beige/50"
        aria-expanded={aberto}>
        <div className="min-w-0">
          <p className="text-sm font-bold text-polo-navy">🧮 Calculadora de produção</p>
          <p className="text-xs text-gray-500">Veja o que precisa ou quantas porções dá para fazer</p>
        </div>
        <span className="text-polo-navy text-xl flex-shrink-0 ml-2">{aberto ? '−' : '+'}</span>
      </button>

      {aberto && (
        <div className="border-t border-gray-100">
          {/* Toggle de modo */}
          <div className="flex p-3 pb-0 gap-1">
            {(temReceitas ? [['receita', '🍲 Receita → ingredientes']] : []).concat(
              temProdGram ? [['gramatura', '🍽️ Gramatura → porções']] : []
            ).map(([v, l]) => (
              <button key={v} onClick={() => setModo(v)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors
                  ${modo === v ? 'bg-polo-navy text-polo-gold' : 'text-gray-500 bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Modo Receita */}
          {modo === 'receita' && temReceitas && (
            <div className="px-4 pb-4 pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <select value={receitaId} onChange={e => setReceitaId(e.target.value)}
                  aria-label="Receita"
                  className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white min-w-0">
                  {producoes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
                <div className="flex gap-1.5 items-center">
                  <input type="number" min="0" step="0.5" value={alvo} onChange={e => setAlvo(e.target.value)}
                    placeholder={fmtNum(receita?.rendimentoBase || 0)}
                    aria-label={`Quantidade a produzir em ${finalUnid}`}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                  <span className="text-xs text-gray-500 whitespace-nowrap">{finalUnid}</span>
                </div>
              </div>

              <div className="bg-polo-beige/40 rounded-xl p-3">
                <p className="text-xs text-polo-navy mb-2">
                  Para produzir <strong>{fmtNum(usado)} {finalUnid}</strong> de {finalNome}, precisa de:
                </p>
                <div className="space-y-1">
                  {plano.itens.length === 0 && (
                    <p className="text-xs text-gray-500">Receita sem ingredientes cadastrados.</p>
                  )}
                  {plano.itens.map((i, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-gray-700 truncate">
                        {i.abate ? prodNome(i.produtoId) : i.nome}
                        {!i.abate && <span className="ml-1 text-amber-700">(seco)</span>}
                      </span>
                      <span className={`font-bold whitespace-nowrap ${i.abate && !i.suficiente ? 'text-red-600' : 'text-polo-navy'}`}>
                        {fmtNum(i.quantidade)} {i.abate ? prodUnid(i.produtoId) : (i.unidade || '')}
                        {i.abate && !i.suficiente && <span className="ml-1 font-semibold">• falta {fmtNum(i.falta)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                {plano.faltaAlgum && (
                  <p className="text-[11px] text-red-600 mt-2">⚠ Faltam ingredientes controlados em estoque.</p>
                )}
              </div>
            </div>
          )}

          {/* Modo Gramatura */}
          {modo === 'gramatura' && temProdGram && (
            <div className="px-4 pb-4 pt-3 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Produto</label>
                <select value={prodGramId} onChange={e => { setProdGramId(e.target.value); setKgDisponivel(''); }}
                  aria-label="Produto para calcular porções"
                  className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
                  {produtosComGramatura.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({p.gramatura} g/porção)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tenho disponível (kg bruto)</label>
                  <input type="number" min="0" step="0.5" value={kgDisponivel}
                    onChange={e => setKgDisponivel(e.target.value)}
                    placeholder="Ex: 10"
                    aria-label="kg disponível"
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Fator de correção (%)
                    <span className="ml-1 text-[10px] text-gray-400">osso, aparas…</span>
                  </label>
                  <input type="number" min="0" max="90" step="0.5" value={correcaoPct}
                    onChange={e => setCorrecaoPct(e.target.value)}
                    placeholder="0"
                    aria-label="Fator de correção em %"
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                </div>
              </div>

              {prodGram && kgNum > 0 && (
                <div className="bg-polo-navy rounded-xl p-4 text-white space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-polo-gold font-bold">Resultado</p>
                  <div className={`grid ${(correcao > 0 || coccao > 0) ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 text-center`}>
                    <div className="bg-white/10 rounded-lg p-2.5">
                      <div className="text-base font-bold">{fmtNum(kgNum)} kg</div>
                      <div className="text-[9px] opacity-70">bruto</div>
                    </div>
                    {(correcao > 0 || coccao > 0) && (
                      <div className="bg-white/10 rounded-lg p-2.5">
                        <div className="text-base font-bold">{fmtNum(kgServido)} kg</div>
                        <div className="text-[9px] opacity-70">
                          líquido{correcao > 0 ? ` −${correcao}%` : ''}{coccao > 0 ? ` 🔥−${coccao}%` : ''}
                        </div>
                      </div>
                    )}
                    <div className="bg-polo-gold text-polo-navy rounded-lg p-2.5">
                      <div className="text-base font-bold">{porcoesResultado}</div>
                      <div className="text-[9px] font-semibold">porções de {prodGram.gramatura} g</div>
                    </div>
                  </div>
                  {coccao > 0 && (
                    <p className="text-[10px] opacity-60 text-center">
                      Já considerando cocção de {coccao}% ({prodGram.nome})
                    </p>
                  )}
                </div>
              )}

              {prodGram && kgNum === 0 && (
                <p className="text-xs text-gray-400 text-center pt-1">
                  Digite a quantidade disponível para ver as porções.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
