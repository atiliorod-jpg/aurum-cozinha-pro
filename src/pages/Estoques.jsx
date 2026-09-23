import { useState } from 'react';
import Layout from '../components/Layout';
import Icon from '../components/Icons';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { MODULOS, gerarIdInstancia } from '../utils/modulos';
import { salvarEstoque } from '../utils/instancias';
import { nomeDaUnidade, cidadeUf } from '../utils/unidades';
import { formatarCNPJ } from '../utils/documentos';
import { CartaoEquipeDasUnidades } from '../components/config/CartoesConfig';

/**
 * UNIDADES E COZINHAS — onde a conta trabalha (era "Estoques da conta").
 *
 * ⚠️ DOIS NÍVEIS DESDE A M46 (22/09/2026):
 *   • UNIDADE → o estabelecimento, com o seu CNPJ. É o que sai na etiqueta.
 *     A principal é a própria conta; as extras só a Aurum cria (painel).
 *   • COZINHA → Produção, Seco, Finalização. Cada uma pertence a uma unidade,
 *     e é criada DENTRO dela.
 * Antes havia um nível só, e a "unidade" era improvisada num campo de texto
 * livre por estoque ("Nome do estabelecimento na etiqueta"): sem CNPJ, sem
 * endereço — e a lista ainda mostrava "[object Object]" quando o dono já
 * tinha preenchido o endereço da conta. O campo saiu; o texto que alguém já
 * tinha escrito continua valendo e aparece como aviso.
 *
 * Criar, renomear e ARQUIVAR cozinhas — só a diretoria (a migração 22 recusa
 * a escrita de `estoques` para os demais, então não é trava de tela).
 *
 * ⚠️ NÃO EXISTE APAGAR, e isso é desenho, não falta de tempo. Apagar deixaria
 * os lançamentos daquela cozinha órfãos: continuariam no banco, sumiriam de
 * toda tela e ainda assim entrariam no balanço. Arquivar tira do seletor e
 * mantém tudo legível no histórico.
 */
export default function Estoques() {
  const { estoques, estoquesDoc, setEstoquesDoc, unidades } = useApp();
  const { sessao, impersonando } = useAuth();
  const { toast, confirm, abrirAjuda } = useUI();
  const [criando, setCriando] = useState(null);   // { unidade, tipo }
  const [nomeNovo, setNomeNovo] = useState('');
  const [editando, setEditando] = useState(null); // id em edição
  const [rascunho, setRascunho] = useState('');

  const eDiretoria = sessao?.eSuperAdmin || sessao?.cargo === 'diretoria';

  if (!eDiretoria) {
    return (
      <Layout title="Unidades e cozinhas" area="admin">
        <div className="bg-white rounded-xl p-6 text-center border border-gray-100">
          <p className="text-4xl mb-2" aria-hidden="true">🔒</p>
          <p className="text-sm font-bold text-polo-navy">Só a diretoria mexe nas cozinhas</p>
          <p className="text-xs text-gray-500 mt-1">
            Criar, renomear ou arquivar uma cozinha muda o que toda a equipe enxerga.
          </p>
        </div>
      </Layout>
    );
  }

  const nomeConta = impersonando?.restauranteNome || sessao?.restauranteNome;

  // A principal primeiro, depois as extras — inclusive as arquivadas, que
  // aparecem apagadas: o histórico delas continua existindo.
  const grupos = [
    { id: null, principal: true, nome: nomeDaUnidade(unidades, null, nomeConta), cnpj: sessao?.cnpj || '' },
    ...(unidades || []).map(u => ({
      id: u.id, principal: false, nome: u.nome, cnpj: u.cnpj,
      local: cidadeUf(u.cidade, u.uf), arquivada: !!u.arquivada_em,
      // lista de itens própria (M48): quem liga é a Aurum, no painel
      listaPropria: !!u.catalogo_proprio,
    })),
  ];

  const criar = () => {
    const existentes = estoques.filter(e => !e.raiz);
    let id;
    try { id = gerarIdInstancia(criando.tipo, existentes); }
    catch (e) { toast(e.message, 'erro'); return; }
    setEstoquesDoc(salvarEstoque(estoquesDoc, {
      id, tipo: criando.tipo, nome: nomeNovo, criadoEm: Date.now(),
      unidade: criando.unidade || undefined,
    }));
    setCriando(null); setNomeNovo('');
    toast('Cozinha criada. Ela já aparece no seletor.', 'sucesso');
  };

  const salvarNome = (e) => {
    setEstoquesDoc(salvarEstoque(estoquesDoc, { id: e.id, nome: rascunho }));
    setEditando(null);
    toast('Nome atualizado.', 'sucesso');
  };

  const arquivar = async (e) => {
    const ok = await confirm({
      titulo: 'Arquivar cozinha',
      mensagem: `Arquivar "${e.nome}"?\n\nEla sai do seletor e ninguém consegue lançar nela. Os lançamentos NÃO são apagados: continuam no histórico e no balanço, e dá para desarquivar quando quiser.`,
      confirmar: 'Arquivar',
    });
    if (!ok) return;
    setEstoquesDoc(salvarEstoque(estoquesDoc, { id: e.id, arquivado: true }));
    toast('Cozinha arquivada.', 'sucesso');
  };

  const desarquivar = (e) => {
    setEstoquesDoc(salvarEstoque(estoquesDoc, { id: e.id, arquivado: false }));
    toast('Cozinha de volta ao seletor.', 'sucesso');
  };

  // ⚠️ O NOME ANTIGO DA ETIQUETA (campo de texto livre de antes da M46)
  // continua saindo impresso — tirar sem avisar mudaria o pote de um dia para
  // o outro. Aqui o dono decide parar de usar; para virar unidade de verdade,
  // com CNPJ, o caminho é pedir à Aurum.
  const pararNomeAntigo = async (e) => {
    const ok = await confirm({
      titulo: 'Parar de usar o nome antigo',
      mensagem: `A etiqueta de "${e.nome}" deixa de sair como "${e.estabelecimento}" e passa a sair com o nome da conta.\n\nSe essa cozinha é de outra casa, com outro CNPJ, peça à Aurum para criar a unidade — assim o CNPJ também sai certo.`,
      confirmar: 'Parar de usar',
    });
    if (!ok) return;
    setEstoquesDoc(salvarEstoque(estoquesDoc, { id: e.id, estabelecimento: '' }));
    toast('Pronto. A etiqueta sai com o nome da conta.', 'sucesso');
  };

  const campo = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';

  return (
    <Layout title="Unidades e cozinhas" area="admin">
      <div className="space-y-5">
        <p className="text-[11px] text-gray-500 px-1 leading-relaxed">
          Cada <strong>unidade</strong> é um estabelecimento, com o seu CNPJ — é o que sai na etiqueta.
          Dentro de cada uma ficam as <strong>cozinhas</strong>, com saldo e mín/máx próprios. Os itens
          são cadastrados uma vez e aparecem em todas as cozinhas do mesmo tipo — menos na unidade com
          lista de itens própria, que tem a sua.
        </p>

        {grupos.map(g => {
          const cozinhas = estoques.filter(e => (e.unidade || null) === g.id);
          return (
            <section key={g.id || 'principal'} className={`space-y-2 ${g.arquivada ? 'opacity-60' : ''}`}>
              <div className="bg-polo-navy rounded-xl px-3 py-2.5 flex items-start gap-2.5">
                <span className="w-9 h-9 rounded-lg bg-white/10 text-polo-gold flex items-center justify-center flex-shrink-0">
                  <Icon name="estabelecimento" size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-polo-gold truncate">
                    {g.nome}
                    {g.principal && <span className="ml-1.5 text-[11px] font-semibold text-white/70">principal</span>}
                    {g.arquivada && <span className="ml-1.5 text-[11px] font-bold text-white/70">arquivada</span>}
                  </p>
                  <p className="text-[11px] text-white/80">
                    {g.cnpj ? `CNPJ ${formatarCNPJ(g.cnpj)}` : 'Sem CNPJ cadastrado'}
                    {g.local ? ` · ${g.local}` : ''}
                    {g.listaPropria ? ' · lista de itens própria' : ''}
                  </p>
                </div>
              </div>

              {cozinhas.map(e => {
                const m = MODULOS.find(x => x.id === e.tipo) || MODULOS[0];
                // Não arquivam: a raiz (destino de queda e casa dos dados antigos)
                // e a Produção principal de uma unidade (sem ela a unidade não
                // teria onde imprimir — ela arquiva junto com a unidade).
                const fixa = e.raiz || e.principalDaUnidade;
                return (
                  <div key={e.id} className={`bg-white rounded-xl border p-3 ${e.arquivado ? 'border-gray-200 opacity-60' : 'border-gray-100'}`}>
                    {editando === e.id ? (
                      <div className="space-y-2">
                        <label className="block">
                          <span className="text-[11px] font-semibold text-gray-600">Nome da cozinha</span>
                          <input className={campo} value={rascunho} autoFocus
                            placeholder={m.label}
                            onChange={ev => setRascunho(ev.target.value)} />
                        </label>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => salvarNome(e)}
                            className="flex-1 bg-polo-navy text-polo-gold font-bold rounded-lg py-2 text-sm">Salvar</button>
                          <button onClick={() => setEditando(null)}
                            className="px-3 text-sm text-gray-500">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-polo-beige text-polo-navy flex items-center justify-center flex-shrink-0">
                            <Icon name={e.icone} size={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-polo-navy truncate">
                              {e.nome}
                              {e.arquivado && <span className="ml-1.5 text-[11px] font-bold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">arquivada</span>}
                            </p>
                            <p className="text-[11px] text-gray-600 truncate">{m.label}</p>
                          </div>
                          {!g.arquivada && (
                            <button onClick={() => { setEditando(e.id); setRascunho(e.raiz ? '' : e.nome); }}
                              className="text-[11px] font-semibold text-polo-navy px-2 py-1 rounded hover:bg-polo-beige flex-shrink-0">Renomear</button>
                          )}
                          {!fixa && !g.arquivada && (e.arquivado
                            ? <button onClick={() => desarquivar(e)}
                                className="text-[11px] font-semibold text-green-700 px-2 py-1 rounded hover:bg-green-50 flex-shrink-0">Reativar</button>
                            : <button onClick={() => arquivar(e)}
                                className="text-[11px] font-semibold text-gray-500 px-2 py-1 rounded hover:bg-gray-50 flex-shrink-0">Arquivar</button>)}
                        </div>
                        {e.estabelecimento && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                            <p className="text-[11px] text-amber-900 min-w-0">
                              Etiqueta sai como <strong>{e.estabelecimento}</strong> (nome antigo), com o CNPJ da conta.
                            </p>
                            <button onClick={() => pararNomeAntigo(e)}
                              className="text-[11px] font-semibold text-amber-900 underline underline-offset-2 flex-shrink-0">parar de usar</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {!g.arquivada && (criando && criando.unidade === g.id ? (
                <div className="bg-polo-beige rounded-xl border border-polo-gold/40 p-3 space-y-2">
                  <p className="text-xs font-bold text-polo-navy">Nova cozinha em {g.nome}</p>
                  <div className="flex gap-1.5">
                    {MODULOS.map(m => (
                      <button key={m.id} onClick={() => setCriando(c => ({ ...c, tipo: m.id }))}
                        aria-pressed={criando.tipo === m.id}
                        className={`flex-1 text-[11px] font-bold py-2 rounded-lg border
                          ${criando.tipo === m.id ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'bg-white text-gray-600 border-gray-200'}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <input className={campo} value={nomeNovo} autoFocus
                    placeholder="Nome da cozinha (ex.: Cozinha do salão)"
                    onChange={e => setNomeNovo(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={criar} disabled={!nomeNovo.trim()}
                      className="flex-1 bg-polo-navy text-polo-gold font-bold rounded-lg py-2 text-sm disabled:opacity-40">
                      Criar cozinha
                    </button>
                    <button onClick={() => setCriando(null)} className="px-3 text-sm text-gray-500">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setCriando({ unidade: g.id, tipo: MODULOS[0].id }); setNomeNovo(''); }}
                  className="w-full text-[11px] font-bold text-polo-navy border border-dashed border-polo-navy/30 rounded-xl py-2.5">
                  + Nova cozinha em {g.nome}
                </button>
              ))}
            </section>
          );
        })}

        {/* quem trabalha em cada unidade (M48) — só aparece com mais de uma */}
        <CartaoEquipeDasUnidades />

        {/* ⚠️ A UNIDADE NOVA NÃO SE CRIA AQUI: o CNPJ é o que identifica quem
            manipulou o alimento, e passa pela Aurum — que também combina o
            adicional antes. O pedido chega no painel, na fila do dia. */}
        {!sessao?.eSuperAdmin && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-bold text-polo-navy">Tem outro restaurante, com outro CNPJ?</p>
            <p className="text-xs text-gray-600">
              A equipe Aurum cria a unidade nesta mesma conta: os itens continuam os mesmos, e cada casa
              imprime a etiqueta com o seu CNPJ.
            </p>
            <button onClick={() => abrirAjuda('pedido')}
              className="w-full border-2 border-polo-navy text-polo-navy font-bold rounded-xl py-2.5 text-sm">
              Preciso de outra unidade
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
