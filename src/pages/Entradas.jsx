import { useState, useMemo } from 'react';
import { useRascunho } from '../lib/useRascunho';
import SemItens from '../components/SemItens';
import Abas from '../components/ui/Abas';
import Filtros from '../components/ui/Filtros';
import Vazio from '../components/ui/Vazio';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { pode } from '../utils/permissoes';
import QuemRegistra from '../components/QuemRegistra';
import { useQuemRegistra, AVISO_FALTA_QUEM } from '../store/OperadorContext';
import { hoje, fmtData, fmtHora } from '../utils/formatters';
import { nomeProduto } from '../utils/calculos';
import { validarDataRegistro, addDias } from '../utils/datas';
import { temRecurso } from '../utils/modulos';
import { armazenamentosAtivos, prazoDe, prazosDoProduto } from '../utils/armazenamento';
import { casaBusca } from '../utils/busca';
import { plural } from '../utils/formatters';
import { ativoNoEstoque } from '../utils/itens';
import RodapeLancamento from '../components/lancamento/RodapeLancamento';
import Passador from '../components/lancamento/Passador';
import { resumoDoLancamento } from '../utils/lancamento';

export default function Entradas() {
  const { produtos, producoes, addEntrada, entradas, removeEntrada, restaurarRegistro, categorias, prefs, setPref, modulo, permissoes, rid } = useApp();
  const { toast, confirm, abrirEtiquetas } = useUI();
  const { sessao } = useAuth();
  // Mesma trava do Histórico: sem isto o cozinheiro não via 'Remover' lá, mas
  // via aqui — a permissão existia numa porta e faltava nas outras quatro.
  const podeRemover = pode(sessao, permissoes, 'removerRegistros');
  const [data, setData] = useState(hoje());
  const [responsavel, setResponsavel] = useState(prefs.responsavel || '');
  // quem assina: com equipe, quem entrou pelo nome (Lote 2); sem, o seletor
  const quem = useQuemRegistra(responsavel);
  const [obs, setObs] = useState('');
  // Abre no PRIMEIRO estado configurado, não num 'congelado' cravado: o
  // restaurante pode ter desligado o congelado ou renomeado a lista.
  const armazenamentos = armazenamentosAtivos(prefs);
  const [armazenamento, setArmazenamento] = useState(() => armazenamentosAtivos(prefs)[0]?.id || 'congelado');
  // no estoque seco não há câmara fria: prazo único, sem rótulo de armazenamento
  const temArmazenamento = temRecurso(modulo, 'armazenamento');
  const armazenamentoReal = temArmazenamento ? armazenamento : null;
  // Rascunho: a entrada avulsa é multi-produto e leva tempo; sair da tela no
  // meio apagava tudo sem aviso. Ver useRascunho.
  const [qtds, setQtds, limparRascunho] = useRascunho(rid, `rascunho::entradas::${modulo}`, {});
  const [catAtiva, setCatAtiva] = useState('');
  const [busca, setBusca] = useState('');
  const [tab, setTab] = useState('novo'); // 'novo' | 'historico'
  const [salvando, setSalvando] = useState(false); // trava anti-duplo-toque

  const produtosAtivos = produtos.filter(p => ativoNoEstoque(p) && !producoes.some(r => r.produtoFinalId === p.id));
  const buscando = busca.trim().length > 0;
  const produtosVisiveis = buscando
    ? produtosAtivos.filter(p => casaBusca(busca, p.nome))
    : catAtiva === ''
      ? produtosAtivos
      : produtosAtivos.filter(p => p.categoria === catAtiva);

  const setQtd = (id, val) => {
    const num = parseFloat(val);
    setQtds(prev => ({ ...prev, [id]: isNaN(num) || num < 0 ? '' : val }));
  };

  const itensPreenchidos = Object.entries(qtds).filter(([, v]) => parseFloat(v) > 0);
  // o pé da tela: "2 itens · 5 unid → Congelado" (Lote 5)
  const resumo = resumoDoLancamento(
    itensPreenchidos.map(([id, q]) => ({ quantidade: q, unidade: produtos.find(p => p.id === id)?.unidade })),
    temArmazenamento ? (armazenamentos.find(a => a.id === armazenamento)?.nome || '') : '');

  const handleSalvar = async () => {
    if (salvando) return; // toque repetido — já registrando
    if (quem.falta) { toast(AVISO_FALTA_QUEM, 'aviso'); return; }
    if (!itensPreenchidos.length) {
      toast('Adicione pelo menos um produto com quantidade.', 'aviso');
      return;
    }
    const v = validarDataRegistro(data);
    if (!v.ok) {
      toast('Não é possível registrar entrada em data futura.', 'erro');
      return;
    }
    // A trava sobe ANTES do await: a confirmação de data antiga deixava uma
    // janela em que `salvando` ainda era false e um segundo toque passava
    // pela guarda, abrindo dois diálogos / registrando duas vezes.
    setSalvando(true);
    if (v.confirmar) {
      const ok = await confirm({
        titulo: 'Registro antigo',
        mensagem: `Esta entrada é de ${v.dias} dias atrás (${fmtData(data)}). Confirma a data?`,
        confirmar: 'Sim, registrar',
      });
      if (!ok) { setSalvando(false); return; }
    }
    setTimeout(() => setSalvando(false), 800);
    addEntrada({
      data,
      hora: fmtHora(),
      responsavel: quem.nome,
      obs,
      armazenamento: armazenamentoReal,
      itens: itensPreenchidos.map(([produtoId, quantidade]) => {
        const p = produtos.find(x => x.id === produtoId);
        // prazo do estado escolhido; prazoDe lê o formato novo e o antigo
        const dias = prazoDe(p, temArmazenamento ? armazenamento : 'congelado');
        return {
          produtoId,
          quantidade: parseFloat(quantidade),
          ...(dias > 0 ? { validade: addDias(data, dias) } : {}),
        };
      }),
    });
    if (quem.nome) setPref('responsavel', quem.nome);
    limparRascunho({});   // só depois de gravar
    setObs('');
    toast(`Entrada de ${plural(itensPreenchidos.length, 'item', 'itens')} registrada.`, 'sucesso');
    // Oferece imprimir as etiquetas dos itens recém-registrados (opcional — dá pra pular)
    abrirEtiquetas(itensPreenchidos.map(([produtoId]) => {
      const p = produtos.find(x => x.id === produtoId);
      const dias = prazoDe(p, temArmazenamento ? armazenamento : 'congelado');
      return {
        produtoId,
        nome: p?.nome || produtoId,
        tipoData: 'fabricacao',
        dataFabricacao: data,
        armazenamento: armazenamentoReal,
        prazos: prazosDoProduto(p),
        validade: dias > 0 ? addDias(data, dias) : null,
        // a data veio do estoque: a janela avisa se a etiqueta sair diferente
        origemRegistro: true,
        responsavel: quem.nome,
        quantidade: 1,
      };
    }));
  };

  const [buscaHist, setBuscaHist] = useState('');
  const entradasOrdenadas = useMemo(() => [...entradas]
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.hora || '').localeCompare(a.hora || ''))
    .filter(e => !buscaHist ||
      casaBusca(buscaHist, e.responsavel, ...(e.itens || []).map(i => nomeProduto(produtos, i.produtoId)))),
    [entradas, buscaHist, produtos]);

  return (
    <Layout title="Entrada avulsa">
      <Abas opcoes={[['novo', '+ Nova entrada'], ['historico', 'Histórico']]} valor={tab} aoTrocar={setTab} className="mb-4" />
      {tab === 'novo' ? (
        <div className="space-y-4">
          {/* Cabeçalho */}
          <div className="bg-white rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
              <input aria-label="Data" type="date" value={data} max={hoje()} onChange={e => setData(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <QuemRegistra manual={responsavel} aoManual={setResponsavel} />
            {/* Câmara fria só existe onde há congelado/resfriado. Na despensa
                (estoque seco) o item é de prateleira e tem um prazo só. */}
            {temArmazenamento ? (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Armazenamento</label>
                {/* Os dois botões fixos viraram a lista configurável
                    (Config → Sistema → Armazenamento). grid-cols-2 continua:
                    com 3+ estados eles quebram em linhas, que é o certo num
                    tablet segurado com uma mão só. */}
                <div className="grid grid-cols-2 gap-2">
                  {armazenamentos.map(a => (
                    <button key={a.id} type="button" onClick={() => setArmazenamento(a.id)}
                      className={`min-h-11 py-2.5 rounded-lg text-xs font-semibold border-2 transition-colors
                        ${armazenamento === a.id ? 'border-polo-gold bg-polo-navy text-polo-gold' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                      {a.nome}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">A validade de cada item é calculada sozinha pelos prazos do produto (Meus itens).</p>
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Item de prateleira. A validade é calculada pelo prazo cadastrado no produto (Meus itens).
              </p>
            )}
          </div>

          {/* Busca */}
          <input aria-label="Buscar produto" type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />

          {/* Categorias */}
          {!buscando && (
            <Filtros rotulo="Categoria" valor={catAtiva} aoTrocar={setCatAtiva}
              opcoes={categorias.filter(c => produtosAtivos.some(p => p.categoria === c))} />
          )}

          {/* Produtos */}
          <div className="bg-white rounded-xl overflow-hidden">
            {produtosAtivos.length === 0 && !buscando ? <SemItens /> : produtosVisiveis.length === 0 && (
              <div className="text-center text-gray-600 py-6 text-sm">Nenhum produto encontrado.</div>
            )}
            {produtosVisiveis.map((p, i, arr) => {
              const diasVal = prazoDe(p, armazenamento);
              const temQtd = parseFloat(qtds[p.id]) > 0;
              return (
              <div key={p.id} className={`flex items-center px-4 py-3 gap-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex-1 min-w-0">
                  {/* o nome quebra em duas linhas em vez de cortar (U6): é ele
                      que a pessoa procura na lista */}
                  <div className="font-medium text-sm text-gray-800 line-clamp-2 break-words">{p.nome}</div>
                  <div className="text-xs text-gray-600">{p.unidade}</div>
                  {temQtd && diasVal > 0 && (
                    <div className="text-xs font-semibold text-polo-navy bg-polo-beige rounded px-1.5 py-0.5 mt-1 inline-block">
                      Etiqueta: fab. {fmtData(data)} • venc. {fmtData(addDias(data, diasVal))}
                    </div>
                  )}
                  {temQtd && diasVal === 0 && (
                    <div className="text-xs text-gray-500 mt-0.5">sem prazo de validade cadastrado (Meus itens)</div>
                  )}
                </div>
                <Passador valor={qtds[p.id]} aoMudar={v => setQtd(p.id, v)} rotulo={`Quantidade de ${p.nome}`} />
              </div>
            );})}
          </div>

          {/* Obs + Salvar */}
          <div className="bg-white rounded-xl p-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Observação (opcional)</label>
            <textarea aria-label="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Alguma observação sobre esta entrada..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          <RodapeLancamento resumo={resumo} rotulo="Registrar Entrada" aoTocar={handleSalvar}
            desativado={!itensPreenchidos.length || quem.falta} ocupado={salvando}
            falta={quem.falta ? AVISO_FALTA_QUEM : !itensPreenchidos.length ? 'Para registrar, digite a quantidade de pelo menos um item.' : ''} />
        </div>
      ) : (
        <div className="space-y-3">
          <input aria-label="Buscar por produto ou responsável" type="text" value={buscaHist} onChange={e => setBuscaHist(e.target.value)}
            placeholder="Buscar por produto ou responsável..."
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
          {entradasOrdenadas.length === 0 && (
            <Vazio texto="Nenhuma entrada registrada ainda." />
          )}
          {entradasOrdenadas.map(e => (
            <div key={e.id} className="bg-white rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold text-sm">{fmtData(e.data)} {e.hora && `• ${e.hora}`}</div>
                  {e.responsavel && <div className="text-xs text-gray-500">Por: {e.responsavel}</div>}
                </div>
                {podeRemover && (
                <button onClick={async () => {
                    const ok = await confirm({ titulo: 'Remover entrada', mensagem: 'Remover esta entrada? O estoque será recalculado.', perigo: true, confirmar: 'Remover' });
                    if (ok) {
                      removeEntrada(e.id);
                      toast('Entrada removida.', 'sucesso', { acao: { label: 'Desfazer', onClick: () => restaurarRegistro('entrada', e) } });
                    }
                  }}
                  className="text-red-700 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50">
                  Remover
                </button>
                )}
              </div>
              {e.itens.map(item => {
                const p = produtos.find(x => x.id === item.produtoId);
                return (
                  <div key={item.produtoId} className="flex justify-between text-sm border-t border-gray-50 pt-1 mt-1">
                    <span className="text-gray-700">{p?.nome || nomeProduto(produtos, item.produtoId)}</span>
                    <span className="font-semibold text-green-700">+{item.quantidade} {p?.unidade}</span>
                  </div>
                );
              })}
              {e.obs && <p className="text-xs text-gray-500 mt-2 italic">{e.obs}</p>}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
