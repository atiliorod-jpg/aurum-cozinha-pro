import { useState } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { MODULOS, gerarIdInstancia } from '../utils/modulos';
import { salvarEstoque } from '../utils/instancias';

/**
 * Criar, renomear e ARQUIVAR estoques — só a diretoria (migração 22 recusa a
 * escrita de `estoques` para os demais, então não é trava de tela).
 *
 * ⚠️ NÃO EXISTE APAGAR, e isso é desenho, não falta de tempo. Apagar deixaria
 * os lançamentos daquele estoque órfãos: eles continuariam no banco, sumiriam
 * de toda tela e ainda assim entrariam no balanço da conta. Arquivar tira do
 * seletor e mantém tudo legível no histórico.
 */
export default function Estoques() {
  const { estoques, estoquesDoc, setEstoquesDoc, prefs } = useApp();
  const { sessao } = useAuth();
  const { toast, confirm } = useUI();
  const [criando, setCriando] = useState(null);   // tipo do estoque a criar
  const [nomeNovo, setNomeNovo] = useState('');
  const [estNovo, setEstNovo] = useState('');
  const [editando, setEditando] = useState(null); // id em edição
  const [rascunho, setRascunho] = useState({ nome: '', estabelecimento: '' });

  const eDiretoria = sessao?.eSuperAdmin || sessao?.cargo === 'diretoria';

  if (!eDiretoria) {
    return (
      <Layout title="Estoques">
        <div className="bg-white rounded-xl p-6 text-center border border-gray-100">
          <p className="text-4xl mb-2" aria-hidden="true">🔒</p>
          <p className="text-sm font-bold text-polo-navy">Só a diretoria mexe nos estoques</p>
          <p className="text-xs text-gray-500 mt-1">
            Criar, renomear ou arquivar um estoque muda o que toda a equipe enxerga.
          </p>
        </div>
      </Layout>
    );
  }

  const criar = () => {
    const existentes = estoques.filter(e => !e.raiz);
    let id;
    try { id = gerarIdInstancia(criando, existentes); }
    catch (e) { toast(e.message, 'erro'); return; }
    setEstoquesDoc(salvarEstoque(estoquesDoc, {
      id, tipo: criando, nome: nomeNovo, estabelecimento: estNovo, criadoEm: Date.now(),
    }));
    setCriando(null); setNomeNovo(''); setEstNovo('');
    toast('Estoque criado. Ele já aparece no seletor.', 'sucesso');
  };

  const salvarEdicao = (e) => {
    setEstoquesDoc(salvarEstoque(estoquesDoc, {
      id: e.id, nome: rascunho.nome, estabelecimento: rascunho.estabelecimento,
    }));
    setEditando(null);
    toast('Estoque atualizado.', 'sucesso');
  };

  const arquivar = async (e) => {
    const ok = await confirm({
      titulo: 'Arquivar estoque',
      mensagem: `Arquivar "${e.nome}"?\n\nEle sai do seletor e ninguém consegue lançar nele. Os lançamentos NÃO são apagados: continuam no histórico e no balanço, e dá para desarquivar quando quiser.`,
      confirmar: 'Arquivar',
    });
    if (!ok) return;
    setEstoquesDoc(salvarEstoque(estoquesDoc, { id: e.id, arquivado: true }));
    toast('Estoque arquivado.', 'sucesso');
  };

  const desarquivar = (e) => {
    setEstoquesDoc(salvarEstoque(estoquesDoc, { id: e.id, arquivado: false }));
    toast('Estoque de volta ao seletor.', 'sucesso');
  };

  const abrirEdicao = (e) => {
    setEditando(e.id);
    // A raiz mostra o rótulo padrão quando não tem nome próprio; o campo vem
    // VAZIO de propósito, senão salvar gravaria o padrão como se fosse escolha.
    setRascunho({ nome: e.raiz ? '' : e.nome, estabelecimento: e.estabelecimento || '' });
  };

  const campo = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';

  return (
    <Layout title="Estoques">
      <div className="space-y-5">
        <p className="text-[11px] text-gray-500 px-1 leading-relaxed">
          Cada estoque tem <strong>saldo e mín/máx próprios</strong>. O cadastro de produtos é
          compartilhado entre estoques do mesmo tipo — "Arroz tipo 1" é cadastrado uma vez e
          aparece em todos, cada um com a sua quantidade.
        </p>

        {MODULOS.map(m => {
          const doTipo = estoques.filter(e => e.tipo === m.id);
          return (
            <div key={m.id}>
              <div className="mb-2 px-1 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">
                  {m.icone} {m.label}
                </p>
                <button onClick={() => { setCriando(m.id); setNomeNovo(''); setEstNovo(''); }}
                  className="text-[11px] font-bold text-polo-navy border border-polo-navy/30 rounded-lg px-2.5 py-1">
                  + Novo
                </button>
              </div>

              <div className="space-y-2">
                {doTipo.map(e => (
                  <div key={e.id} className={`bg-white rounded-xl border p-3 ${e.arquivado ? 'border-gray-200 opacity-60' : 'border-gray-100'}`}>
                    {editando === e.id ? (
                      <div className="space-y-2">
                        <label className="block">
                          <span className="text-[11px] font-semibold text-gray-600">Nome do estoque</span>
                          <input className={campo} value={rascunho.nome} autoFocus
                            placeholder={e.raiz ? m.label : 'Ex.: Estoque Seco — Restaurante Y'}
                            onChange={ev => setRascunho(r => ({ ...r, nome: ev.target.value }))} />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-semibold text-gray-600">
                            Nome do estabelecimento na etiqueta (opcional)
                          </span>
                          <input className={campo} value={rascunho.estabelecimento}
                            placeholder={prefs?.estabelecimento || 'usa o nome da conta'}
                            onChange={ev => setRascunho(r => ({ ...r, estabelecimento: ev.target.value }))} />
                          <span className="block text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                            Deixe vazio para usar o nome da conta. Preencha só se este estoque for de
                            outra casa — é o nome que sai impresso no pote.
                          </span>
                        </label>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => salvarEdicao(e)}
                            className="flex-1 bg-polo-navy text-polo-gold font-bold rounded-lg py-2 text-sm">Salvar</button>
                          <button onClick={() => setEditando(null)}
                            className="px-3 text-sm text-gray-500">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-polo-navy truncate">
                            {e.nome}
                            {e.raiz && <span className="ml-1.5 text-[10px] font-semibold text-gray-400">principal</span>}
                            {e.arquivado && <span className="ml-1.5 text-[10px] font-bold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">arquivado</span>}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">
                            {e.estabelecimento
                              ? `etiqueta: ${e.estabelecimento}`
                              : `etiqueta: ${prefs?.estabelecimento || 'nome da conta'}`}
                            {!e.raiz && ` · ${e.id}`}
                          </p>
                        </div>
                        <button onClick={() => abrirEdicao(e)}
                          className="text-[11px] font-semibold text-polo-navy px-2 py-1 rounded hover:bg-polo-beige flex-shrink-0">Editar</button>
                        {/* A raiz não arquiva: é o destino de queda quando uma
                            instância some, e onde moram os dados de quem usa o
                            app desde antes dos estoques múltiplos. */}
                        {!e.raiz && (e.arquivado
                          ? <button onClick={() => desarquivar(e)}
                              className="text-[11px] font-semibold text-green-700 px-2 py-1 rounded hover:bg-green-50 flex-shrink-0">Reativar</button>
                          : <button onClick={() => arquivar(e)}
                              className="text-[11px] font-semibold text-gray-500 px-2 py-1 rounded hover:bg-gray-50 flex-shrink-0">Arquivar</button>)}
                      </div>
                    )}
                  </div>
                ))}

                {criando === m.id && (
                  <div className="bg-polo-beige rounded-xl border border-polo-gold/40 p-3 space-y-2">
                    <p className="text-xs font-bold text-polo-navy">Novo {m.label}</p>
                    <input className={campo} value={nomeNovo} autoFocus
                      placeholder={`Ex.: ${m.label} — Restaurante Y`}
                      onChange={e => setNomeNovo(e.target.value)} />
                    <input className={campo} value={estNovo}
                      placeholder="Nome na etiqueta (opcional)"
                      onChange={e => setEstNovo(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={criar} disabled={!nomeNovo.trim()}
                        className="flex-1 bg-polo-navy text-polo-gold font-bold rounded-lg py-2 text-sm disabled:opacity-40">
                        Criar estoque
                      </button>
                      <button onClick={() => setCriando(null)} className="px-3 text-sm text-gray-500">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <p className="text-[11px] text-gray-400 px-1 leading-relaxed">
          Não existe apagar estoque, só arquivar. Apagar deixaria os lançamentos órfãos —
          eles sumiriam de toda tela e ainda assim entrariam no balanço da conta.
        </p>
      </div>
    </Layout>
  );
}
