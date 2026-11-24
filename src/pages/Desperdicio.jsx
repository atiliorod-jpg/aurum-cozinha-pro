import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import Filtros from '../components/ui/Filtros';
import Icon from '../components/Icons';
import Esqueleto from '../components/Esqueleto';
import BuscaPorVoz from '../components/BuscaPorVoz';
import JanelaDescarte from '../components/JanelaDescarte';
import TrocaEtiquetaDesperdicio from '../components/TrocaEtiquetaDesperdicio';
import QuemImprime, { FaixaOperador, ContinuarImprimindo } from '../components/QuemImprime';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { useOperador, useTelaDeImprimir } from '../store/OperadorContext';
import { agruparPorCategoria } from '../data/bibliotecaEtiquetas';
import { gruposDoProduto, estaNoGrupo, ordemDosGrupos } from '../utils/grupos';
import { casaBusca } from '../utils/busca';
import { unidadeDoItem } from '../utils/desperdicio';

// =====================================================================
//  DESPERDÍCIO (24/11/2026, pedido do dono: o checklist do Magurō no Aurum)
//  A mesma base do Etiquetas: os itens de Meus itens, a equipe com a senha
//  de 2 números e o mesmo jeito de usar — toca no nome, acha o item (busca,
//  grupo ou voz), diz quanto e por quê. "Registrar outro?" em 5 s e 1 minuto
//  parado voltam para os nomes, como na tela Imprimir.
//  ⚠️ NÃO MEXE EM ESTOQUE (como no Magurō): é o registro do que foi jogado
//  fora. O relatório mora na Administração, com a senha.
// =====================================================================
export default function Desperdicio() {
  const { produtos, categorias, prefs, nuvemCarregada, soLeitura } = useApp();
  const { toast } = useUI();
  const { operador, comEquipe, trocar, expiracoes } = useOperador();
  const precisaEscolher = comEquipe && !operador;
  const responsavel = (comEquipe ? operador : prefs.responsavel) || '';

  const [busca, setBusca] = useState('');
  const [catAtiva, setCatAtiva] = useState('');
  const [aberto, setAberto] = useState(null);       // o item do descarte, ou { livre: true, nome }
  const [perguntar, setPerguntar] = useState(false); // "Registrar outro desperdício?"
  const [avisoDaVoz, setAvisoDaVoz] = useState(null);

  const recomecar = useCallback(() => {
    setBusca(''); setCatAtiva(''); setAberto(null); setPerguntar(false); setAvisoDaVoz(null);
  }, []);
  // ⚠️ O MINUTO SEM USO VALE AQUI TAMBÉM: ninguém registra no nome de quem saiu
  useTelaDeImprimir();
  const expiracoesVistas = useRef(expiracoes);
  useEffect(() => {
    if (expiracoes === expiracoesVistas.current) return;
    expiracoesVistas.current = expiracoes;
    recomecar();
  }, [expiracoes, recomecar]);
  const trocarPessoa = useCallback(() => { trocar(); recomecar(); }, [trocar, recomecar]);
  // ⚠️ ENTROU PELO NOME: de volta ao topo (24/11/2026). Quem tocou num nome
  // lá embaixo da lista ficava com a tela rolada, e os botões Etiquetas |
  // Desperdício sumiam debaixo do cabeçalho.
  useEffect(() => { if (operador) { try { window.scrollTo(0, 0); } catch { /* sem window */ } } }, [operador]);

  const ativos = useMemo(() => produtos.filter(p => p.ativo), [produtos]);
  const buscando = busca.trim().length > 0;
  const visiveis = buscando
    ? ativos.filter(p => casaBusca(busca, p.nome, ...gruposDoProduto(p)))
    : catAtiva === '' ? ativos : ativos.filter(p => estaNoGrupo(p, catAtiva));
  const ordemCategorias = useMemo(() => ordemDosGrupos(categorias), [categorias]);
  const gruposEmUso = useMemo(() => {
    const usados = new Set(ativos.flatMap(gruposDoProduto));
    return [...ordemCategorias.filter(g => usados.has(g)), ...[...usados].filter(g => !ordemCategorias.includes(g)).sort()];
  }, [ativos, ordemCategorias]);
  const grupos = useMemo(() => {
    const ordenados = [...visiveis].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));
    if (catAtiva !== '' && !buscando) return [[catAtiva, ordenados]];
    return agruparPorCategoria(ordenados, ordemCategorias);
  }, [visiveis, ordemCategorias, catAtiva, buscando]);

  const abrir = (p, pedido = null) => {
    if (soLeitura) { toast('Modo suporte é somente leitura.', 'aviso'); return; }
    setAberto(p.livre ? p : { id: p.id, nome: p.nome, unidade: unidadeDoItem(p), quantidade: pedido?.quantidade || null });
  };
  const registrou = () => { setAberto(null); setBusca(''); setAvisoDaVoz(null); if (comEquipe && operador) setPerguntar(true); };

  return (
    <Layout title="Desperdício">
      <div className="space-y-4">
        <TrocaEtiquetaDesperdicio atual="desperdicio" />
        {precisaEscolher ? <QuemImprime titulo="Quem vai registrar?" /> : (<>
          {comEquipe && <FaixaOperador acao="Registrando" aoTrocar={trocarPessoa} />}
          <button type="button" onClick={() => abrir({ livre: true, nome: busca.trim() })}
            className="w-full min-h-12 rounded-2xl bg-polo-gold text-polo-navy font-bold text-base inline-flex items-center justify-center gap-2">
            <Icon name="mais" size={20} />Item fora da lista
          </button>
          <BuscaPorVoz produtos={ativos} vocabulario={[]} aviso={avisoDaVoz} aoAvisar={setAvisoDaVoz}
            aoBuscar={(termo) => setBusca(termo)} aoImprimir={(p, pedido) => abrir(p, pedido)}
            rotuloQuantidade={(q) => `quantidade ${q}`} dicaOuvindo="Ouvindo… fale o item que vai descartar.">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden="true">
                <Icon name="busca" size={22} />
              </span>
              <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="O que vai ser descartado?" aria-label="Buscar item para descartar"
                className="w-full h-14 bg-white border-[3px] border-polo-navy/15 focus:border-polo-navy rounded-2xl pl-12 pr-4 text-lg text-polo-navy" />
            </div>
          </BuscaPorVoz>
          {!buscando && <Filtros rotulo="Grupo" valor={catAtiva} aoTrocar={setCatAtiva} opcoes={gruposEmUso} />}
          <div className="bg-white rounded-2xl overflow-hidden border-2 border-polo-navy/10">
            {visiveis.length === 0 && !buscando && !nuvemCarregada && <Esqueleto rotulo="Carregando os itens" />}
            {visiveis.length === 0 && (buscando || nuvemCarregada) && (
              <div className="text-center py-8 px-4 space-y-3">
                <p className="text-sm text-gray-600">{buscando ? `Não achei “${busca.trim()}”.` : 'Você ainda não tem itens cadastrados.'}</p>
                {buscando && (
                  <button type="button" onClick={() => abrir({ livre: true, nome: busca.trim() })}
                    className="min-h-12 px-5 rounded-2xl bg-polo-navy text-polo-gold font-bold text-base">
                    Registrar “{busca.trim()}” assim mesmo
                  </button>
                )}
              </div>
            )}
            {grupos.map(([categoria, itens]) => (
              <div key={categoria}>
                <h2 className="sticky top-0 z-10 bg-polo-beige/95 backdrop-blur px-4 py-2 font-titulo font-extrabold text-sm text-polo-navy uppercase tracking-wide border-b border-gray-200">
                  {categoria}
                </h2>
                {itens.map((p, i, arr) => (
                  <div key={p.id} className={`flex items-center px-4 py-3 gap-3 min-h-[72px] ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <div className="flex-1 min-w-0 font-bold text-base text-polo-navy leading-tight break-words">{p.nome}</div>
                    <button type="button" onClick={() => abrir(p)} aria-label={`Descartar ${p.nome}`}
                      className="bg-red-700 text-white font-bold text-base pl-3 pr-4 min-h-12 rounded-xl flex-shrink-0 inline-flex items-center gap-2 active:scale-95 transition-transform">
                      <Icon name="perda" size={20} />Descartar
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>)}
      </div>
      {aberto && (
        <JanelaDescarte inicial={aberto} responsavel={responsavel} aoFechar={() => setAberto(null)} aoRegistrar={registrou} />
      )}
      {perguntar && comEquipe && operador && (
        <ContinuarImprimindo nome={operador} pergunta={`Registrar outro desperdício, ${operador}?`}
          aoContinuar={() => setPerguntar(false)} aoTrocar={trocarPessoa} />
      )}
    </Layout>
  );
}
