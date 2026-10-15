// =====================================================================
//  ADMINISTRAÇÃO → ESTOQUE (Lote 4 da auditoria, 14/10/2026)
//
//  Viviam dentro de Configuracoes.jsx, divididos entre as abas Receitas e
//  Sistema — o mínimo/máximo automático ficava ao lado do suporte remoto, e os
//  destinos de saída depois da senha. Agora cada cartão é um componente e o
//  grupo Estoque reúne os que falam de estoque.
//
//  ⚠️ TUDO AQUI É DO ESTOQUE ABERTO NO APARELHO (receitas, destinos, catálogo
//  são documentos de cada cozinha). A tela do grupo diz qual é — sem isso, quem
//  abria a Administração "de fora" mexia no Seco achando que era a Produção.
// =====================================================================
import { useState, useEffect, useMemo } from 'react';
import Chave from '../ui/Chave';
import Botao from '../Botao';
import Dialogo from '../Dialogo';
import Icon from '../Icons';
import { useApp } from '../../store/AppContext';
import { useUI } from '../../store/UIContext';
import { fmtNum, plural } from '../../utils/formatters';
import { fatorCorrecaoProduto } from '../../utils/analise';
import { ativoNoEstoque } from '../../utils/itens';

// Fecha a janela com Escape (WCAG 2.1.2)
function useEscClose(onFechar) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onFechar]);
}

/**
 * Cartão de catálogo simples: campo "novo item" + lista de chips com remover.
 * Destinos de saída e destinos de apara eram dois blocos praticamente iguais
 * (input+Add, chips, confirmação de remoção) — qualquer ajuste de UX precisava
 * ser feito duas vezes e as duas versões já tinham divergido (uma mostrava
 * estado vazio, a outra não).
 *
 * `itens`: [{ chave, rotulo (node), nomeParaConfirmar, fixo? }]
 */
function CartaoCatalogoChips({ titulo, descricao, placeholder, valor, onValor, onAdd, itens, textoVazio, tituloRemover, mensagemRemover, onRemover }) {
  const { confirm } = useUI();
  const remover = async (item) => {
    const ok = await confirm({
      titulo: tituloRemover,
      mensagem: mensagemRemover(item.nomeParaConfirmar),
      perigo: true,
      confirmar: 'Remover',
    });
    if (ok) onRemover(item);
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
      <div>
        {/* ⚠️ <h2>, NÃO <p> em negrito: quem usa leitor de tela pula de
            título em título para achar a seção. */}
        <h2 className="text-sm font-bold text-polo-navy">{titulo}</h2>
        <p className="text-xs text-gray-600 mt-1">{descricao}</p>
      </div>
      <div className="flex gap-2">
        <input type="text" value={valor} onChange={e => onValor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onAdd(); }}
          placeholder={placeholder} aria-label={placeholder}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        <button onClick={onAdd}
          className="bg-polo-navy text-polo-gold font-bold px-4 min-h-11 rounded-lg text-sm">Adicionar</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {itens.length === 0 && <span className="text-xs text-gray-600">{textoVazio}</span>}
        {itens.map(item => (
          <span key={item.chave}
            className="inline-flex items-center gap-1.5 bg-polo-beige rounded-full pl-3 pr-2 py-1 text-sm font-medium text-polo-navy">
            {item.rotulo}
            {item.fixo
              ? <span className="text-gray-600 text-xs">(fixo)</span>
              : <button onClick={() => remover(item)} aria-label={`Remover ${item.nomeParaConfirmar}`}
                  className="text-red-700 font-bold text-base leading-none min-w-11 min-h-11 -my-2.5 -mr-2 flex items-center justify-center">×</button>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Destinos de saída — para onde o estoque vai (outras unidades, salão…). */
export function CartaoDestinosSaida() {
  const { locais, setLocais, logAudit } = useApp();
  const { toast } = useUI();
  const [novo, setNovo] = useState('');
  const adicionar = () => {
    const nome = novo.trim();
    if (!nome) return;
    if (locais.some(l => l.nome.toLowerCase() === nome.toLowerCase())) { toast('Esse destino já existe.', 'aviso'); return; }
    const id = nome.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 16) || `loc${Date.now()}`;
    setLocais([...locais, { id: locais.some(l => l.id === id) ? id + Date.now() : id, nome }]);
    setNovo('');
    logAudit('adicionou destino de saída', nome);
    toast('Destino adicionado.', 'sucesso');
  };
  return (
    <CartaoCatalogoChips
      titulo="Destinos de saída"
      descricao="Para onde o estoque é enviado (ex.: unidades, salão, delivery). Aparecem na tela de Saídas."
      placeholder="Novo destino (ex.: Unidade Centro)"
      valor={novo} onValor={setNovo} onAdd={adicionar}
      itens={locais.map(l => ({ chave: l.id, rotulo: l.nome, nomeParaConfirmar: l.nome, fixo: l.fixo, ref: l }))}
      textoVazio="Nenhum destino — adicione ao menos um para registrar saídas."
      tituloRemover="Remover destino"
      mensagemRemover={nome => `Remover "${nome}"? Saídas antigas não mudam.`}
      onRemover={item => {
        setLocais(locais.filter(x => x.id !== item.ref.id));
        logAudit('removeu destino de saída', item.ref.nome);
        toast('Destino removido.', 'sucesso');
      }}
    />
  );
}

/** Destinos de apara — o que se faz com a sobra da limpeza. */
export function CartaoDestinosApara() {
  const { destinos, setDestinos, logAudit } = useApp();
  const { toast } = useUI();
  const [novo, setNovo] = useState('');
  const adicionar = () => {
    const label = novo.trim();
    if (!label) return;
    let cod = label.normalize('NFD').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'DST';
    while (destinos.some(d => d.cod === cod)) cod = cod.slice(0, 2) + Math.floor(Math.random() * 10);
    // mantém OUT sempre por último
    const semOut = destinos.filter(d => d.cod !== 'OUT');
    const out = destinos.find(d => d.cod === 'OUT');
    setDestinos([...semOut, { cod, label }, ...(out ? [out] : [])]);
    setNovo('');
    logAudit('adicionou destino de apara', label);
    toast('Destino adicionado.', 'sucesso');
  };
  return (
    <CartaoCatalogoChips
      titulo="Destinos de apara"
      descricao={'Opções que aparecem ao registrar uma apara. "Outro" é fixo e abre campo livre.'}
      placeholder="Novo destino (ex.: Escondidinho)"
      valor={novo} onValor={setNovo} onAdd={adicionar}
      itens={destinos.map(d => ({
        chave: d.cod,
        rotulo: <><strong>{d.cod}</strong> {d.label}</>,
        nomeParaConfirmar: d.label,
        fixo: d.cod === 'OUT',
        ref: d,
      }))}
      textoVazio="Nenhum destino de apara cadastrado."
      tituloRemover="Remover destino"
      mensagemRemover={nome => `Remover "${nome}"? Registros antigos não mudam.`}
      onRemover={item => {
        setDestinos(destinos.filter(x => x.cod !== item.ref.cod));
        logAudit('removeu destino de apara', item.ref.label);
        toast('Destino removido.', 'sucesso');
      }}
    />
  );
}

/** Mínimo e máximo automáticos, e os dias de cobertura. */
export function CartaoMinMaxAuto() {
  const { prefs, setPref } = useApp();
  const { toast } = useUI();
  // Inputs de dias: string enquanto edita, converte só no onBlur
  const [diasMinStr, setDiasMinStr] = useState(String(prefs.diasMin || 3));
  const [diasMaxStr, setDiasMaxStr] = useState(String(prefs.diasMax || 6));
  // Sincroniza quando prefs muda por realtime (outro aparelho alterou).
  // O setState síncrono aqui é intencional: é espelho 1:1 de uma prop externa.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- espelho de valor vindo do realtime
  useEffect(() => { setDiasMinStr(String(prefs.diasMin || 3)); }, [prefs.diasMin]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- espelho de valor vindo do realtime
  useEffect(() => { setDiasMaxStr(String(prefs.diasMax || 6)); }, [prefs.diasMax]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 id="mm-auto" className="text-sm font-bold text-polo-navy">Mínimo e máximo automáticos</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Recalcula o mínimo e o máximo de cada item pela média de saídas dos últimos 15 dias.
            Desligado, o Início só sugere e você aprova.
          </p>
          <details className="mt-1.5">
            <summary className="text-sm font-semibold text-polo-navy cursor-pointer select-none py-2">Como funciona</summary>
            <div className="text-xs text-gray-600 mt-1 space-y-1 leading-snug">
              <p>• Olha as <strong>saídas dos últimos ~15 dias</strong> — tanto o envio para a cozinha e outras unidades
              quanto o uso interno em produção (ingrediente consumido por ficha conta).</p>
              <p>• Com isso calcula quanto a casa gasta por dia e define: mínimo = cobertura de
              {' '}{plural(prefs.diasMin || 3, 'dia', 'dias')} de operação; máximo = meta de reposição para {plural(prefs.diasMax || 6, 'dia', 'dias')}.</p>
              <p>• <strong>Só começa a funcionar após ~15 dias com saídas registradas.</strong> Numa conta
              nova, defina o mínimo e o máximo na ficha de cada item (Meus itens) até lá.</p>
              <p>• Desligado: o Início mostra <em>sugestões</em> e você aprova. Ligado: atualiza sozinho
              (com pausa de segurança entre recálculos) — revise se a operação estiver atípica.</p>
            </div>
          </details>
        </div>
        <Chave rotuladoPor="mm-auto" ligada={!!prefs.autoMinMax}
          aoTrocar={(novo) => {
            setPref('autoMinMax', novo);
            toast(novo ? 'Ajuste automático LIGADO — mínimo e máximo acompanham o consumo.' : 'Ajuste automático desligado — voltam as sugestões.', 'sucesso');
          }} />
      </div>
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">Dias de cobertura do estoque</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mm-dias-min" className="block text-xs text-gray-600 mb-1">Mínimo (alerta abaixo de)</label>
            <div className="flex items-center gap-1.5">
              <input id="mm-dias-min" type="number" inputMode="numeric" min="1" max="30"
                value={diasMinStr}
                onChange={e => setDiasMinStr(e.target.value)}
                onBlur={e => {
                  const v = Math.max(1, parseInt(e.target.value) || 3);
                  setDiasMinStr(String(v));
                  setPref('diasMin', v);
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <span className="text-xs text-gray-600 whitespace-nowrap">dias</span>
            </div>
          </div>
          <div>
            <label htmlFor="mm-dias-max" className="block text-xs text-gray-600 mb-1">Máximo (meta de reposição)</label>
            <div className="flex items-center gap-1.5">
              <input id="mm-dias-max" type="number" inputMode="numeric" min="1" max="90"
                value={diasMaxStr}
                onChange={e => setDiasMaxStr(e.target.value)}
                onBlur={e => {
                  const v = Math.max(1, parseInt(e.target.value) || 6);
                  setDiasMaxStr(String(v));
                  setPref('diasMax', v);
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <span className="text-xs text-gray-600 whitespace-nowrap">dias</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Ex.: mínimo 3 dias → alerta quando o estoque não cobre ~3 dias de saída no ritmo atual.
          Máximo 6 dias → repor ou produzir até cobrir ~6 dias de operação.
        </p>
      </div>
      {!!prefs.autoMinMax && (
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p id="mm-semana" className="text-sm font-bold text-polo-navy">Considerar o dia da semana</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Em vez da média lisa, dimensiona o mínimo e o máximo pelo consumo previsto dos próximos dias —
                sobe na véspera do fim de semana e cai no início da semana. Ligue se sexta a domingo
                vendem bem mais que o resto da semana.
              </p>
            </div>
            <Chave rotuladoPor="mm-semana" ligada={!!prefs.minMaxPorDiaSemana}
              aoTrocar={(novo) => {
                setPref('minMaxPorDiaSemana', novo);
                toast(novo ? 'Mínimo e máximo agora consideram o dia da semana.' : 'Mínimo e máximo voltaram à média simples.', 'sucesso');
              }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Guia de fluxo do turno — o painel de progresso no Início. */
export function CartaoGuiaTurno() {
  const { prefs, setPref } = useApp();
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 id="guia-turno" className="text-sm font-bold text-polo-navy">Guia de fluxo do turno</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Painel no Início com os essenciais do turno (Produção/entrada → Saídas)
            e lembretes opcionais de etiquetas e aparas — aparas só contam se houver.
          </p>
        </div>
        <Chave rotuladoPor="guia-turno" ligada={!!prefs.guia} aoTrocar={(v) => setPref('guia', v)} />
      </div>
    </div>
  );
}

// ─── Receitas de produção ─────────────────────────────────────────────

function ModalProducao({ receita, produtos, onSalvar, onFechar }) {
  // ⚠️ Só item que CONTROLA estoque (Lote 4): a receita dá entrada no produto
  // final e baixa nos ingredientes — num item só de etiqueta isso viraria
  // saldo que nenhuma tela mostra.
  const ativos = produtos.filter(ativoNoEstoque);
  const [form, setForm] = useState(receita || {
    nome: '', produtoFinalId: ativos[0]?.id || '', rendimentoBase: '', armazenamento: 'congelado',
    ingredientes: [{ abate: false, produtoId: '', quantidade: '', nome: '', unidade: 'kg' }],
  });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  useEscClose(onFechar);
  const setIng = (i, k, v) => setForm(prev => {
    const ing = [...prev.ingredientes];
    ing[i] = { ...ing[i], [k]: v };
    return { ...prev, ingredientes: ing };
  });
  const addIng = () => setForm(prev => ({ ...prev, ingredientes: [...prev.ingredientes, { abate: false, produtoId: '', quantidade: '', nome: '', unidade: 'kg' }] }));
  const removeIng = (i) => setForm(prev => ({ ...prev, ingredientes: prev.ingredientes.filter((_, x) => x !== i) }));
  const unid = (id) => produtos.find(p => p.id === id)?.unidade || '';

  const ingValido = (i) => parseFloat(i.quantidade) > 0 && (i.abate ? !!i.produtoId : !!(i.nome || '').trim());
  const valido = form.nome.trim() && form.produtoFinalId && parseFloat(form.rendimentoBase) > 0
    && form.ingredientes.some(ingValido);

  const salvar = () => onSalvar({
    ...form,
    rendimentoBase: parseFloat(form.rendimentoBase) || 0,
    ingredientes: form.ingredientes.filter(ingValido).map(i => i.abate
      ? { abate: true, produtoId: i.produtoId, quantidade: parseFloat(i.quantidade) }
      : { abate: false, nome: (i.nome || '').trim(), unidade: (i.unidade || 'kg').trim(), quantidade: parseFloat(i.quantidade) }),
  });

  return (
    <Dialogo aoFechar={onFechar} titulo={receita ? 'Editar receita' : 'Nova receita de produção'}
      forma="ficha" largura="lg" camada={70} fecharNoFundo={false} classeCaixa="space-y-4">
      <>
        <div>
          <label htmlFor="rec-nome" className="block text-xs font-semibold text-gray-600 mb-1">Nome da receita</label>
          <input id="rec-nome" type="text" value={form.nome} onChange={e => set('nome', e.target.value)}
            placeholder="Ex.: Molho da casa" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="rec-final" className="block text-xs font-semibold text-gray-600 mb-1">Produto que será produzido</label>
          <select id="rec-final" value={form.produtoFinalId} onChange={e => set('produtoFinalId', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Selecione…</option>
            {ativos.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
          </select>
          <p className="text-xs text-gray-600 mt-1">É o item que entra no estoque. Cadastre em Meus itens se ainda não existe.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rec-rende" className="block text-xs font-semibold text-gray-600 mb-1">Rende quanto? ({unid(form.produtoFinalId)})</label>
            <input id="rec-rende" type="number" inputMode="decimal" min="0" step="0.5" value={form.rendimentoBase} onChange={e => set('rendimentoBase', e.target.value)}
              placeholder="Ex.: 10" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="rec-armaz" className="block text-xs font-semibold text-gray-600 mb-1">Armazenamento</label>
            <select id="rec-armaz" value={form.armazenamento} onChange={e => set('armazenamento', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="ambos">Ambos (decide na hora)</option>
              <option value="congelado">Congelado</option>
              <option value="resfriado">Resfriado</option>
            </select>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600">Ingredientes (para o rendimento acima)</p>
            <button onClick={addIng} className="min-h-11 text-sm font-bold text-polo-navy bg-gray-100 px-3 rounded-lg">+ Ingrediente</button>
          </div>
          <p className="text-xs text-gray-600 mb-2">
            Por padrão, ingredientes são <strong>monitorados</strong> (só registra uso, sem baixa no estoque). Marque se o item é controlado no estoque.
          </p>
          <div className="space-y-2">
            {form.ingredientes.map((ing, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    {ing.abate ? (
                      <select aria-label={`Produto do ingrediente ${i + 1}`} value={ing.produtoId || ''} onChange={e => setIng(i, 'produtoId', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
                        <option value="">Escolha o produto controlado…</option>
                        {ativos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    ) : (
                      <input aria-label={`Nome do ingrediente ${i + 1}`} type="text" value={ing.nome || ''} onChange={e => setIng(i, 'nome', e.target.value)}
                        placeholder="Nome do ingrediente (ex.: Tempero, Cebola)" className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                    )}
                  </div>
                  <input aria-label={`Quantidade do ingrediente ${i + 1}`} type="number" inputMode="decimal" min="0" step="0.1" value={ing.quantidade} onChange={e => setIng(i, 'quantidade', e.target.value)}
                    placeholder="Qtd" className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                  {ing.abate ? (
                    // Item controlado dá baixa na unidade do PRÓPRIO produto — fixa
                    // a unidade (um seletor livre aqui era ignorado no save e podia
                    // baixar 500 g como 500 kg).
                    <span title="Usa a unidade do produto controlado"
                      className="border border-gray-200 rounded-lg px-2 min-h-11 text-xs bg-gray-100 text-gray-600 flex items-center min-w-9 justify-center">
                      {unid(ing.produtoId) || '—'}
                    </span>
                  ) : (
                    <select aria-label={`Unidade do ingrediente ${i + 1}`} value={ing.unidade || 'kg'} onChange={e => setIng(i, 'unidade', e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white">
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="un">un</option>
                      <option value="L">L</option>
                    </select>
                  )}
                  <button onClick={() => removeIng(i)} aria-label={`Remover o ingrediente ${i + 1}`}
                    className="text-red-700 font-bold text-lg min-w-11 min-h-11 flex-shrink-0 flex items-center justify-center">×</button>
                </div>
                <label className="flex items-center gap-2 min-h-11 cursor-pointer">
                  <input type="checkbox" checked={ing.abate || false} onChange={e => setIng(i, 'abate', e.target.checked)}
                    className="w-6 h-6 cursor-pointer flex-shrink-0" />
                  <span className="text-xs text-gray-700">Controlado no estoque (dá baixa ao produzir)</span>
                </label>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onFechar} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl">Cancelar</button>
          <button onClick={salvar} disabled={!valido}
            className="flex-1 bg-polo-navy text-polo-gold font-bold py-3 rounded-xl disabled:opacity-40">Salvar</button>
        </div>
      </>
    </Dialogo>
  );
}

/** Receitas de produção — molhos, caldos, porcionamento. */
export function CartaoReceitas() {
  const { produtos, producoes, setProducoes, logAudit } = useApp();
  const { toast, confirm } = useUI();
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);

  const excluir = async (r) => {
    const ok = await confirm({ titulo: 'Excluir receita', mensagem: `Excluir "${r.nome}"?`, perigo: true, confirmar: 'Excluir' });
    if (!ok) return;
    setProducoes(producoes.filter(x => x.id !== r.id));
    logAudit('excluiu receita de produção', r.nome);
    toast('Receita excluída.', 'sucesso');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-polo-navy">Receitas de produção</h2>
        <p className="text-xs text-gray-600 mt-0.5">
          Itens <strong>produzidos</strong> (molhos, caldos, porcionados): vários ingredientes viram um
          item com rendimento. A equipe executa em <strong>Registrar → Produção</strong>.
        </p>
      </div>
      {producoes.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-2">Nenhuma receita cadastrada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {producoes.map(r => {
            const final = produtos.find(p => p.id === r.produtoFinalId);
            return (
              <li key={r.id} className="flex items-center gap-2 bg-gray-50 rounded-lg pl-3 pr-1 py-1">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-polo-navy truncate">{r.nome}</p>
                  <p className="text-xs text-gray-600">
                    Rende {fmtNum(r.rendimentoBase)} {final?.unidade || ''} de {final?.nome || '—'} · {plural((r.ingredientes || []).length, 'ingrediente', 'ingredientes')}
                  </p>
                </div>
                <button onClick={() => setEditando(r)} aria-label={`Editar receita ${r.nome}`}
                  className="text-sm text-polo-navy font-semibold px-3 min-h-11 rounded-lg">Editar</button>
                <button onClick={() => excluir(r)} aria-label={`Excluir receita ${r.nome}`}
                  className="text-base text-red-700 font-bold min-w-11 min-h-11 flex items-center justify-center rounded-lg">×</button>
              </li>
            );
          })}
        </ul>
      )}
      <Botao variante="secundario" tamanho="sm" onClick={() => setCriando(true)}>+ Nova receita</Botao>

      {(editando || criando) && (
        <ModalProducao
          receita={editando}
          produtos={produtos}
          onSalvar={(form) => {
            if (editando) {
              setProducoes(producoes.map(r => r.id === editando.id ? { ...r, ...form } : r));
              logAudit('editou receita de produção', form.nome);
              toast('Receita atualizada.', 'sucesso');
            } else {
              setProducoes([...producoes, { ...form, id: `prod_${Date.now()}` }]);
              logAudit('criou receita de produção', form.nome);
              toast('Receita criada.', 'sucesso');
            }
            setEditando(null);
            setCriando(false);
          }}
          onFechar={() => { setEditando(null); setCriando(false); }}
        />
      )}
    </div>
  );
}

// ─── Rendimento por ingrediente ───────────────────────────────────────

// Resolve o produto (matéria-prima) de uma ficha: vínculo explícito (produtoId)
// e, na falta dele, casamento por nome — tolerante a substrings.
function resolverProduto(ficha, produtos) {
  if (ficha.produtoId) return produtos.find(p => p.id === ficha.produtoId) || null;
  const mp = (ficha.materiaPrima || '').toLowerCase().trim();
  if (!mp) return null;
  return produtos.find(p => {
    const n = (p.nome || '').toLowerCase().trim();
    if (!n) return false;
    if (n === mp) return true;
    const menor = n.length <= mp.length ? n : mp;
    if (menor.length < 4) return false;
    return n.includes(mp) || mp.includes(n);
  }) || null;
}

/**
 * Rendimento por ingrediente: agrupa as preparações por item, mostra o fator
 * de correção (automático por aparas+perdas ou fixado à mão) e deixa mover uma
 * preparação para o ingrediente certo quando o vínculo automático erra.
 * O fator de um item também se fixa na ficha dele (Meus itens → Produção).
 */
export function CartaoRendimento() {
  const { produtos, setProdutos, fichas, setFichas, compras, aparas, desperdicio } = useApp();
  const { toast } = useUI();
  const [fcEdit,   setFcEdit]   = useState(null); // { id, pct }
  const [nomeEdit, setNomeEdit] = useState(null); // { id, nome }
  const [aberto,   setAberto]   = useState(false); // colapsável

  const { grupos, naoVinc } = useMemo(() => {
    const m = new Map();
    // Semeia com os itens de estoque ativos — assim dá para configurar FC e
    // matéria-prima de compra mesmo nos que ainda não têm preparação.
    produtos.filter(ativoNoEstoque).forEach(p => m.set(p.id, { produto: p, fichas: [] }));
    const semVinculo = [];
    (fichas || []).forEach(f => {
      const prod = resolverProduto(f, produtos);
      if (!prod) { semVinculo.push(f); return; }
      if (!m.has(prod.id)) m.set(prod.id, { produto: prod, fichas: [] });
      m.get(prod.id).fichas.push(f);
    });
    const arr = [...m.values()].sort((a, b) => a.produto.nome.localeCompare(b.produto.nome));
    return { grupos: arr, naoVinc: semVinculo };
  }, [fichas, produtos]);

  const moverFicha = (ficha, novoId) => {
    setFichas(fichas.map(x => x.id === ficha.id ? { ...x, produtoId: novoId || undefined } : x));
    const destino = produtos.find(p => p.id === novoId);
    toast(destino ? `Preparação movida para ${destino.nome}.` : 'Vínculo removido.', 'sucesso');
  };

  const renomearProduto = (produto, novoNome) => {
    novoNome = novoNome.trim();
    if (!novoNome) return;
    setProdutos(produtos.map(p => p.id === produto.id ? { ...p, nome: novoNome } : p));
    setNomeEdit(null);
    toast(`Ingrediente renomeado para "${novoNome}".`, 'sucesso');
  };

  const salvarFcManual = (produto, pct) => {
    const fcMedio = Math.min(parseFloat(pct) || 0, 90) / 100;
    setProdutos(produtos.map(p => p.id === produto.id ? { ...p, fcManual: true, fcMedio } : p));
    setFcEdit(null);
    toast(`Fator de correção de ${produto.nome} fixado em ${Math.round(fcMedio * 100)}%.`, 'sucesso');
  };

  const voltarAutomatico = (produto) => {
    setProdutos(produtos.map(p => p.id === produto.id ? { ...p, fcManual: false } : p));
    setFcEdit(null);
    toast(`Fator de correção de ${produto.nome} voltou ao automático.`, 'sucesso');
  };

  const salvarMateriaPrima = (produto, valor) => {
    const mp = (valor || '').trim();
    setProdutos(produtos.map(p => p.id === produto.id ? { ...p, materiaPrima: mp || undefined } : p));
  };

  const opcoesProduto = [...produtos].sort((a, b) => a.nome.localeCompare(b.nome));
  // Matérias-primas já usadas (para sugerir ao agrupar — ex.: "Camarão")
  const materiasPrimas = [...new Set(produtos.map(p => (p.materiaPrima || '').trim()).filter(Boolean))].sort();

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-4">
      <button
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-polo-navy">Rendimento por ingrediente</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            {plural(grupos.length, 'ingrediente', 'ingredientes')}
            {naoVinc.length > 0 && ` · ${naoVinc.length} sem vínculo`} — toque para {aberto ? 'recolher' : 'abrir'}
          </p>
        </div>
        <span aria-hidden="true" className={`text-gray-600 text-lg transition-transform flex-shrink-0 ${aberto ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {aberto && (
      <div className="px-4 pb-4">
      <p className="text-xs text-gray-600 mb-3">
        O rendimento é calculado pelas aparas e perdas ligadas às compras.
      </p>

      {grupos.length === 0 && naoVinc.length === 0 && (
        <p className="text-xs text-gray-600 py-4 text-center">Nenhuma preparação cadastrada ainda.</p>
      )}

      <div className="space-y-3">
        {grupos.map(({ produto, fichas: fs }) => {
          const fcAuto = fatorCorrecaoProduto(produto, compras, aparas, desperdicio);
          const editando = fcEdit?.id === produto.id;
          return (
            <div key={produto.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {nomeEdit?.id === produto.id ? (
                    <div className="flex items-center gap-2 mb-1">
                      <input aria-label={`Novo nome de ${produto.nome}`}
                        autoFocus
                        value={nomeEdit.nome}
                        onChange={e => setNomeEdit({ ...nomeEdit, nome: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renomearProduto(produto, nomeEdit.nome);
                          if (e.key === 'Escape') setNomeEdit(null);
                        }}
                        className="border border-polo-gold/60 rounded-lg px-2 py-1 text-sm font-semibold text-polo-navy flex-1 min-w-0"
                      />
                      <button onClick={() => renomearProduto(produto, nomeEdit.nome)}
                        aria-label="Confirmar" className="min-w-11 min-h-11 flex items-center justify-center text-polo-gold bg-polo-navy rounded-lg flex-shrink-0"><Icon name="check" size={16} /></button>
                      <button onClick={() => setNomeEdit(null)}
                        aria-label="Cancelar" className="min-w-11 min-h-11 flex items-center justify-center text-gray-600 flex-shrink-0"><Icon name="fechar" size={16} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mb-0.5">
                      <p className="font-semibold text-sm text-polo-navy">{produto.nome}</p>
                      <button
                        onClick={() => { setFcEdit(null); setNomeEdit({ id: produto.id, nome: produto.nome }); }}
                        className="min-w-11 min-h-11 flex items-center justify-center text-gray-600 hover:text-polo-navy transition-colors flex-shrink-0"
                        aria-label={`Renomear ${produto.nome}`}
                        title="Renomear ingrediente"
                      ><Icon name="editar" size={16} /></button>
                    </div>
                  )}
                  {nomeEdit?.id !== produto.id && (
                    <p className="text-xs">
                      {produto.fcManual ? (
                        <span className="text-polo-navy">Fixado à mão: <strong>{Math.round((produto.fcMedio || 0) * 100)}%</strong></span>
                      ) : fcAuto != null ? (
                        <span className="text-gray-600">Automático: <strong className="text-polo-navy">{Math.round(fcAuto * 100)}%</strong> (aparas + perdas)</span>
                      ) : (
                        <span className="text-gray-600">Sem fator ainda — registre aparas e perdas ligadas às compras deste item</span>
                      )}
                    </p>
                  )}
                </div>
                {!editando && nomeEdit?.id !== produto.id && (
                  <button onClick={() => { setNomeEdit(null); setFcEdit({ id: produto.id, pct: produto.fcManual ? String(Math.round((produto.fcMedio || 0) * 100)) : '' }); }}
                    aria-label={`Fator de correção de ${produto.nome}`}
                    className="min-h-11 px-3 text-sm font-semibold text-polo-navy bg-gray-100 rounded-lg flex-shrink-0">FC</button>
                )}
              </div>

              {editando && (
                <div className="mt-2 bg-polo-beige/60 rounded-lg p-2.5 space-y-2">
                  <label htmlFor={`fc-${produto.id}`} className="block text-xs font-semibold text-gray-700">Apara/perda na limpeza (%) — valor fixo</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input id={`fc-${produto.id}`} type="number" inputMode="numeric" min="0" max="90" step="1" value={fcEdit.pct} autoFocus
                      onChange={e => setFcEdit({ id: produto.id, pct: e.target.value })}
                      placeholder="Ex.: 12"
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    <button onClick={() => salvarFcManual(produto, fcEdit.pct)}
                      className="min-h-11 text-sm font-bold text-polo-gold bg-polo-navy px-3 rounded-lg">Fixar</button>
                    {produto.fcManual && (
                      <button onClick={() => voltarAutomatico(produto)}
                        className="min-h-11 px-2 text-sm font-semibold text-gray-700 underline">voltar ao automático</button>
                    )}
                    <button onClick={() => setFcEdit(null)} className="min-h-11 px-2 text-sm text-gray-600 ml-auto">cancelar</button>
                  </div>
                </div>
              )}

              {/* Matéria-prima de compra — unifica itens na lista de compras */}
              {nomeEdit?.id !== produto.id && (
                <div className="mt-2 bg-polo-beige/40 rounded-lg px-2.5 py-2">
                  <label htmlFor={`mp-in-${produto.id}`} className="block text-xs font-semibold text-gray-600 mb-1">
                    Comprado como
                  </label>
                  <input id={`mp-in-${produto.id}`}
                    type="text"
                    list={`mp-${produto.id}`}
                    defaultValue={produto.materiaPrima || ''}
                    onBlur={e => salvarMateriaPrima(produto, e.target.value)}
                    placeholder={`Ex.: ${produto.nome.split(' ')[0]} (deixe vazio = não agrupa)`}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
                  />
                  <datalist id={`mp-${produto.id}`}>
                    {materiasPrimas.map(mp => <option key={mp} value={mp} />)}
                  </datalist>
                </div>
              )}

              <div className="mt-2 space-y-1">
                {fs.map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-xs text-gray-700 min-w-0 truncate">{f.preparacao}</span>
                    <select value={produto.id} onChange={e => moverFicha(f, e.target.value)}
                      aria-label={`Mover preparação ${f.preparacao} para outro ingrediente`}
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white max-w-[45%]">
                      {opcoesProduto.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {naoVinc.length > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
            <p className="text-xs font-bold text-amber-900 mb-2">Preparações sem ingrediente vinculado</p>
            <div className="space-y-1">
              {naoVinc.map(f => (
                <div key={f.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-2.5 py-1.5">
                  <span className="text-xs text-gray-700 min-w-0 truncate">{f.preparacao} <span className="text-gray-600">({f.materiaPrima})</span></span>
                  <select value="" onChange={e => moverFicha(f, e.target.value)}
                    aria-label={`Vincular preparação ${f.preparacao} a um ingrediente`}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white max-w-[45%]">
                    <option value="">— escolher —</option>
                    {opcoesProduto.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
}
