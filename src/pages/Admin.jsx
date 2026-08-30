import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { supabase } from '../lib/supabase';
import { statusRestaurante, TESTE_DIAS, PLANOS, produtoDe, precoPlano } from '../utils/assinatura';

const SUPER_ADMIN_EMAIL = 'atiliopinpolho@gmail.com';

const dataBR = (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—';
// com hora — usado no aviso de pagamento (o dono quer ver quando o cliente avisou)
const dataBRHora = (v) => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

// Valor cheio, sem centavos — os preços dos planos são todos redondos e a
// linha de botões fica apertada no celular.
const brlAdmin = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

// Badge de situação comercial do restaurante (mesma régua do app do cliente)
function BadgeStatus({ st }) {
  const cfg = st.tipo === 'assinatura' ? ['🟢 Ativo', 'bg-green-100 text-green-700']
    : st.tipo === 'teste' ? [`🟡 Teste (${st.diasRestantes}d)`, 'bg-amber-100 text-amber-700']
    : st.tipo === 'bloqueado' ? ['Suspenso', 'bg-red-100 text-red-700']
    : ['🔴 Vencido', 'bg-red-100 text-red-700'];
  return <span className={`text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${cfg[1]}`}>{cfg[0]}</span>;
}

// Qual PRODUTO esta conta contratou. Fica ao lado do status porque as duas
// perguntas são diferentes: o status diz se está pagando, este diz pelo quê.
function BadgeProduto({ produto }) {
  const eEtiquetas = produto === 'etiquetas';
  return (
    <span className={`text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0
      ${eEtiquetas ? 'bg-polo-beige text-polo-navy' : 'bg-gray-100 text-gray-700'}`}>
      {eEtiquetas ? 'Etiquetas' : 'Completo'}
    </span>
  );
}

// Sem acento, sem pontuação, minúsculo — dos DOIS lados da comparação. Sem
// isto "Jaboatao" não acha "Jaboatão" e o CNPJ digitado sem pontos não acha o
// que está gravado com pontos.
const normalizar = (t) => String(t || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toLowerCase();

// Nome do documento em português de gente. A chave vem como 'seco::produtos'
// e ninguém no suporte deveria precisar decorar isso para socorrer um cliente.
const NOMES_DOC = {
  produtos: 'catálogo de produtos', categorias: 'categorias', pessoas: 'equipe',
  fichas: 'fichas técnicas', producoes: 'receitas', locais: 'destinos de saída',
  destinos: 'destinos', listaManual: 'lista de compras',
  etiquetasAvulsas: 'etiquetas avulsas', permissoes: 'permissões',
  precos: 'preços', estoques: 'estoques', metas: 'mínimos e máximos',
  prefs: 'configurações',
};
const nomeDoc = (chave) => {
  const partes = String(chave || '').split('::');
  const base = partes[1] || partes[0];
  const onde = partes.length > 1 ? ` (${partes[0]})` : '';
  return `${NOMES_DOC[base] || base}${onde}`;
};
const dataHoraBR = (iso) => {
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return '—'; }
};

export default function Admin() {
  const { sessao, verComoRestaurante, entrarDemo } = useAuth();
  const { toast, confirm } = useUI();
  const [renomeando, setRenomeando] = useState(null); // { id, valor } | null
  const [busca, setBusca] = useState('');
  const [respondendo, setRespondendo] = useState(null); // { id, texto } | null
  const [editandoCadastro, setEditandoCadastro] = useState(null); // { id, cnpj, whatsapp, cidade, uf } | null
  // Histórico de UM restaurante por vez: carregar de todos de uma vez seria
  // centenas de linhas para uma tela que se olha uma vez por mês.
  const [historico, setHistorico] = useState(null); // { id, itens, carregando, erro } | null
  const navigate = useNavigate();
  const [restaurantes, setRestaurantes] = useState([]);
  const [carregando,   setCarregando]   = useState(true);
  const [erro,         setErro]         = useState(null);
  const [diasCustom,   setDiasCustom]   = useState({}); // rid -> string
  const [notasLocal,   setNotasLocal]   = useState({}); // rid -> string
  const [feedbacks,    setFeedbacks]    = useState([]);
  // Erro do feedback é SEPARADO do erro dos restaurantes: são duas consultas
  // independentes, e juntar os dois fazia a falha de uma sumir com a outra.
  const [erroFeedback, setErroFeedback] = useState(null);
  const [carregandoFeedback, setCarregandoFeedback] = useState(true);

  // Consulta PRÓPRIA. Antes ela morava no fim de carregar(), depois de um
  // `return` que dispara quando a lista de restaurantes falha — então qualquer
  // problema em restaurantes levava o feedback junto, sem relação nenhuma
  // entre as duas coisas. E o `error` da RPC era descartado: falha virava
  // lista vazia, sem toast, sem log, indistinguível de "não há feedback".
  const carregarFeedback = useCallback(async () => {
    setCarregandoFeedback(true);
    setErroFeedback(null);
    const { data, error } = await supabase.rpc('feedback_todos');
    if (error) {
      setErroFeedback(error.message || 'Falha ao carregar o feedback');
      setFeedbacks([]);
    } else {
      setFeedbacks(data || []);
    }
    setCarregandoFeedback(false);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    // select completo → fallback progressivo p/ bancos sem as colunas novas
    let { data: rests, error: errR } = await supabase
      .from('restaurantes')
      // ⚠️ cnpj/whatsapp/cidade/uf (M28) entram SÓ nesta primeira tentativa. A
      // cadeia de fallback abaixo existe para banco sem as colunas novas; pôr
      // as colunas lá também faria a queda em cascata falhar inteira.
      .select('id, nome, created_at, assinatura_ate, max_usuarios, bloqueado, aviso_pagamento_em, aviso_pagamento_plano, aviso_pagamento_nome, produto, cnpj, whatsapp, cidade, uf')
      .order('created_at', { ascending: false });
    if (errR) {
      // banco sem a migração 27: cai para o select de antes e todo mundo
      // aparece como 'completo' (produtoDe trata o undefined)
      ({ data: rests, error: errR } = await supabase
        .from('restaurantes')
        .select('id, nome, created_at, assinatura_ate, max_usuarios, bloqueado, aviso_pagamento_em, aviso_pagamento_plano, aviso_pagamento_nome')
        .order('created_at', { ascending: false }));
    }
    if (errR) {
      ({ data: rests, error: errR } = await supabase
        .from('restaurantes')
        .select('id, nome, created_at, assinatura_ate')
        .order('created_at', { ascending: false }));
    }
    if (errR) {
      ({ data: rests, error: errR } = await supabase
        .from('restaurantes')
        .select('id, nome, created_at')
        .order('created_at', { ascending: false }));
    }
    if (errR || !rests) {
      setErro(errR?.message || 'Sem acesso');
      setCarregando(false);
      return;
    }

    const ids = rests.map(r => r.id);
    // e-mails via RPC (migração 9); sem ela, cai no select básico (nome/cargo)
    let perfis = [];
    for (const rid of ids) {
      const { data: comEmail, error: eRpc } = await supabase.rpc('usuarios_do_restaurante', { p_restaurante: rid });
      if (!eRpc && comEmail) { perfis.push(...comEmail.map(u => ({ ...u, restaurante_id: rid }))); }
      else {
        const { data: basicos } = await supabase.from('perfis').select('id, nome, cargo').eq('restaurante_id', rid);
        perfis.push(...(basicos || []).map(u => ({ ...u, restaurante_id: rid })));
        break; // RPC ausente — não insiste nos demais
      }
    }

    // As prefs (incl. autorização de suporte) ficam em documentos.chave='prefs'
    const { data: docsPrefs } = ids.length
      ? await supabase.from('documentos').select('restaurante_id, dados').in('restaurante_id', ids).eq('chave', 'prefs')
      : { data: [] };
    const prefsPorRest = {};
    (docsPrefs || []).forEach(d => { prefsPorRest[d.restaurante_id] = d.dados || {}; });

    setRestaurantes(rests.map(r => {
      const conf = prefsPorRest[r.id] || {};
      const suporteAtivo = conf.suporteAtivo && conf.suporteAtivo > Date.now();
      return {
        ...r,
        usuarios: perfis.filter(p => p.restaurante_id === r.id),
        suporteAtivo,
        suporteAte: suporteAtivo ? conf.suporteAtivo : null,
        podeMexer: suporteAtivo && conf.suportePermissao === 'mexer',
      };
    }));
    // Notas internas: tabela admin_notas via RPC (migração 10) — o cliente não
    // tem mais como ler; fallback lê a coluna antiga em banco pré-m10.
    let notas = {};
    const { data: nTodas, error: eNotas } = await supabase.rpc('notas_admin_todas');
    if (!eNotas && nTodas) {
      notas = Object.fromEntries(nTodas.map(n => [n.restaurante_id, n.notas || '']));
    } else {
      const { data: antigas } = await supabase.from('restaurantes').select('id, notas_admin');
      (antigas || []).forEach(x => { notas[x.id] = x.notas_admin || ''; });
    }
    setNotasLocal(Object.fromEntries(rests.map(r => [r.id, notas[r.id] || ''])));

    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!sessao?.eSuperAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount com flag de loading (padrão legítimo)
    carregar();
    carregarFeedback(); // independente: uma falhar não pode apagar a outra
  }, [sessao, carregar, carregarFeedback]);

  // ── Ações comerciais ────────────────────────────────────────────
  const liberarDias = async (r, dias) => {
    const ok = await confirm({
      titulo: 'Liberar dias de acesso',
      mensagem: `Liberar ${dias} dia(s) para "${r.nome}"?\n\nA assinatura soma a partir do vencimento atual (renova sem perder dias).`,
      confirmar: `Liberar ${dias} dia(s)`,
    });
    if (!ok) return;
    const { data, error } = await supabase.rpc('ativar_assinatura', { p_restaurante: r.id, p_dias: dias });
    if (error) { toast('Erro ao liberar: ' + error.message, 'erro'); return; }
    // ativar_assinatura (migração 13) também limpa o aviso de pagamento
    setRestaurantes(prev => prev.map(x => x.id === r.id ? { ...x, assinatura_ate: data, aviso_pagamento_em: null, aviso_pagamento_plano: null } : x));
    toast(`✅ ${r.nome}: acesso liberado até ${dataBR(data)}.`, 'sucesso');
  };

  const marcarFeedback = async (fb, status) => {
    const { error } = await supabase.rpc('marcar_feedback', { p_id: fb.id, p_status: status });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setFeedbacks(prev => prev.map(x => x.id === fb.id ? { ...x, status } : x));
  };

  const dispensarAviso = async (r) => {
    const { error } = await supabase.rpc('limpar_aviso_pagamento', { p_restaurante: r.id });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setRestaurantes(prev => prev.map(x => x.id === r.id ? { ...x, aviso_pagamento_em: null, aviso_pagamento_plano: null } : x));
    toast('Aviso dispensado.', 'sucesso');
  };

  // Upgrade/downgrade comercial. É a troca de UMA coluna: nada é copiado,
  // movido ou apagado, porque o plano Etiquetas grava nas mesmas chaves que o
  // app completo lê. O texto do confirm diz isso ao dono na hora de decidir —
  // "downgrade apaga os dados?" é a primeira dúvida que aparece.
  const mudarProduto = async (r, novo) => {
    const atual = r.produto || 'completo';
    if (novo === atual) return;
    const paraEtiquetas = novo === 'etiquetas';
    const ok = await confirm({
      titulo: paraEtiquetas ? 'Mudar para Aurum Etiquetas' : 'Mudar para Aurum Cozinha Pro',
      mensagem: paraEtiquetas
        ? `"${r.nome}" passa a ver só as telas de etiqueta (R$ 270/mês).\n\nNENHUM dado é apagado: o estoque, as compras e o histórico continuam no banco e reaparecem inteiros se você voltar para o plano completo.`
        : `"${r.nome}" passa a ver o app inteiro (R$ 500/mês).\n\nOs itens e as etiquetas que ele já cadastrou continuam onde estão — aparecem na Cozinha de Produção.`,
      confirmar: paraEtiquetas ? 'Mudar para Etiquetas' : 'Mudar para Completo',
    });
    if (!ok) return;
    const { error } = await supabase.rpc('definir_produto', { p_restaurante: r.id, p_produto: novo });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setRestaurantes(prev => prev.map(x => x.id === r.id ? { ...x, produto: novo } : x));
    toast(`"${r.nome}" agora é ${paraEtiquetas ? 'Aurum Etiquetas' : 'Aurum Cozinha Pro'}.`, 'sucesso');
  };

  // ⚠️ RENOMEAR É COISA DA AURUM, não do cliente. O nome sai IMPRESSO no
  // rodapé de toda etiqueta e identifica o estabelecimento no contrato e na
  // cobrança — cliente trocando sozinho gera confusão, inclusive suporte
  // procurando alguém que "sumiu" porque virou outro nome. O cliente PEDE pela
  // aba de feedback (tipo 'pedido'); quem muda é aqui.
  //
  // ⚠️ Passa por RPC (M29) porque `restaurantes` não tem policy de escrita, de
  // propósito: a mesma linha guarda produto, assinatura e bloqueio. Liberar
  // UPDATE "só do nome" deixaria o cliente trocar o próprio plano.
  const salvarNome = async (r) => {
    const novo = (renomeando?.valor || '').trim();
    if (!novo || novo === r.nome) { setRenomeando(null); return; }
    const { data, error } = await supabase.rpc('definir_nome_restaurante', { p_restaurante: r.id, p_nome: novo });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setRestaurantes(prev => prev.map(x => x.id === r.id ? { ...x, nome: data || novo } : x));
    setRenomeando(null);
    toast(`Agora se chama "${data || novo}".`, 'sucesso');
  };

  // ⚠️ `useMemo` e não filtro solto no JSX: a lista roda a cada tecla digitada
  // e cada linha faz normalize/replace em quatro campos.
  const visiveis = useMemo(() => {
    const t = normalizar(busca);
    if (!t) return restaurantes;
    return restaurantes.filter(r =>
      normalizar(r.nome).includes(t)
      || normalizar(r.cidade).includes(t)
      || normalizar(r.uf).includes(t)
      || normalizar(r.cnpj).includes(t));
  }, [restaurantes, busca]);

  // ⚠️ O CANAL ERA DE MÃO ÚNICA: o cliente escrevia, a gente lia e marcava
  // "resolvido", e ele nunca ficava sabendo de nada. Do lado dele o botão
  // Ajuda parecia um buraco — escreveu, sumiu. A resposta volta pelo mesmo
  // lugar e ele vê um aviso quando chega.
  const responder = async (fb) => {
    const txt = (respondendo?.texto || '').trim();
    if (!txt) { toast('Escreva a resposta.', 'aviso'); return; }
    const { error } = await supabase.rpc('responder_feedback', { p_id: fb.id, p_resposta: txt });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setRespondendo(null);
    toast('Resposta enviada ao cliente.', 'sucesso');
    carregarFeedback();
  };

  // ⚠️ CAMPO EM BRANCO NÃO APAGA. A função no banco trata null como "não
  // mexer" — corrigir só a cidade não pode limpar o CNPJ de quem já tinha.
  const salvarCadastro = async (r) => {
    const c = editandoCadastro;
    if (!c) return;
    const { error } = await supabase.rpc('definir_cadastro_restaurante', {
      p_restaurante: r.id,
      p_cnpj: c.cnpj || null, p_whatsapp: c.whatsapp || null,
      p_cidade: c.cidade || null, p_uf: c.uf || null,
    });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setRestaurantes(prev => prev.map(x => x.id === r.id ? {
      ...x,
      cnpj: (c.cnpj || '').replace(/[^0-9]/g, '') || x.cnpj,
      whatsapp: (c.whatsapp || '').trim() || x.whatsapp,
      cidade: (c.cidade || '').trim() || x.cidade,
      uf: (c.uf || '').trim().toUpperCase() || x.uf,
    } : x));
    setEditandoCadastro(null);
    toast('Cadastro atualizado.', 'sucesso');
  };

  // ⚠️ MARCA DE ONDE VEIO. Sair da demonstração chama o mesmo logout de sempre,
  // que zera a sessão em memória — mas a sessão do Supabase continua viva. Sem
  // esta marca, quem entrou pelo painel caía na tela de login com a conta ainda
  // logada por baixo: um beco. Com ela, o Layout recarrega a página ao sair e o
  // app volta sozinho para o painel.
  const verDemo = (produto) => {
    try { sessionStorage.setItem('aurum_demo_do_painel', '1'); } catch { /* sem storage */ }
    entrarDemo(produto);
    navigate('/');
  };

  const carregarHistorico = async (r) => {
    setHistorico({ id: r.id, itens: [], carregando: true, erro: '' });
    const { data, error } = await supabase.rpc('historico_restaurante', { p_restaurante: r.id });
    setHistorico({ id: r.id, itens: data || [], carregando: false, erro: error?.message || '' });
  };
  const alternarHistorico = (r) =>
    historico?.id === r.id ? setHistorico(null) : carregarHistorico(r);

  // ⚠️ CONFIRMAÇÃO COM O NOME DO DOCUMENTO E A DATA. Restaurar é sobrescrever
  // o que o cliente tem AGORA; a versão atual vai para o histórico antes (a
  // função no banco garante isso), mas quem clica precisa saber o que está
  // trocando por quê. "Tem certeza?" sozinho não informa nada.
  const restaurar = async (r, h) => {
    const ok = await confirm({
      titulo: 'Devolver esta versão?',
      mensagem: `"${r.nome}" volta a ter o(a) ${nomeDoc(h.chave)} como estava em ${dataHoraBR(h.criado_em)}.

O que está lá agora é guardado antes, então dá para desfazer. Os tablets do cliente recarregam sozinhos.`,
      confirmar: 'Restaurar',
    });
    if (!ok) return;
    const { error } = await supabase.rpc('restaurar_documento', { p_hist: h.id });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    toast('Versão restaurada. O cliente já recebe ao abrir o app.', 'sucesso', { duracao: 6000 });
    carregarHistorico(r); // a versão que estava lá virou mais uma linha do histórico
  };

  const mudarMax = async (r, novoMax) => {
    const { error } = await supabase.rpc('definir_max_usuarios', { p_restaurante: r.id, p_max: novoMax });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setRestaurantes(prev => prev.map(x => x.id === r.id ? { ...x, max_usuarios: novoMax } : x));
    toast(`Limite de usuários de "${r.nome}" agora é ${novoMax}.`, 'sucesso');
  };

  const alternarBloqueio = async (r) => {
    const bloquear = !r.bloqueado;
    const ok = await confirm({
      titulo: bloquear ? 'Suspender conta' : 'Reativar conta',
      mensagem: bloquear
        ? `Suspender o acesso de "${r.nome}"? Ninguém do restaurante consegue entrar até você reativar. Nenhum dado é apagado.`
        : `Reativar o acesso de "${r.nome}"?`,
      perigo: bloquear,
      confirmar: bloquear ? 'Suspender' : 'Reativar',
    });
    if (!ok) return;
    const { error } = await supabase.rpc('definir_bloqueio', { p_restaurante: r.id, p_bloqueado: bloquear });
    if (error) { toast('Erro: ' + error.message, 'erro'); return; }
    setRestaurantes(prev => prev.map(x => x.id === r.id ? { ...x, bloqueado: bloquear } : x));
    toast(bloquear ? `🔒 "${r.nome}" suspenso.` : `✅ "${r.nome}" reativado.`, 'sucesso');
  };

  const salvarNotas = async (r) => {
    const { error } = await supabase.rpc('salvar_notas_admin', { p_restaurante: r.id, p_notas: notasLocal[r.id] || '' });
    if (error) { toast('Erro ao salvar notas: ' + error.message, 'erro'); return; }
    toast('Notas salvas (só você vê).', 'sucesso');
  };

  if (!sessao?.eSuperAdmin) {
    return (
      <Layout title="Admin" area="admin">
        <div className="bg-white rounded-xl p-8 text-center">
          <p className="text-2xl mb-2">🚫</p>
          <p className="text-sm font-semibold text-gray-700">Acesso restrito</p>
          <p className="text-xs text-gray-600 mt-1">Esta página é exclusiva para administradores.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Admin — Visão geral" area="admin">
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="bg-polo-navy rounded-xl p-4 text-polo-gold">
          <p className="font-bold text-sm">🔑 Painel super-admin</p>
          <p className="text-[11px] text-white/80 mt-0.5">Logado como {sessao.email}</p>
          <p className="text-[11px] text-polo-gold/90 mt-1.5">
            🔒 Conta crítica: ative a verificação em duas etapas (MFA) no Supabase Auth e use uma senha forte e exclusiva.
          </p>
        </div>

        {/* ⚠️ VER O APP COMO O CLIENTE VÊ, sem ter cozinha própria. Esta conta
            não escolhe mais estoque ao entrar — o painel é a tela dela — mas
            quem vende e quem dá suporte precisa abrir o app de vez em quando
            para conferir como está a entrada. A demonstração serve: dados de
            exemplo, nada é salvo, e o "Sair da demo" traz de volta para cá.
            Modo suporte é outra coisa: aquele abre a conta REAL de um cliente,
            e depende de ele autorizar. */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-sm font-bold text-polo-navy">Ver o app como o cliente vê</p>
          <p className="text-[11px] text-gray-600 mt-0.5 mb-2.5">
            Abre a demonstração com dados de exemplo. Nada é salvo e você volta para o painel ao sair.
          </p>
          <div className="flex flex-wrap gap-2">
            {[['etiquetas', 'Aurum Etiquetas'], ['completo', 'Aurum Cozinha Pro']].map(([id, l]) => (
              <button key={id} onClick={() => verDemo(id)}
                className="text-[11px] font-bold text-polo-navy border border-polo-navy/30 rounded-lg px-3 py-1.5">
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Erro de RLS */}
        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-red-700">Sem acesso aos dados ({erro})</p>
            <p className="text-xs text-red-600">
              Confira no README a ordem dos scripts SQL (migrations 1–11) e as policies do super-admin
              (e-mail {SUPER_ADMIN_EMAIL}) no Supabase.
            </p>
          </div>
        )}

        {/* Feedback dos clientes (bug/sugestão)
            SEMPRE renderizado. Antes era `feedbacks.length > 0 && ...`: lista
            vazia e RPC quebrada produziam a MESMA tela (o bloco sumia inteiro),
            então não havia como distinguir "ninguém mandou nada" de "a consulta
            falhou". Agora cada situação tem o seu texto. */}
        {(() => {
          const abertos = feedbacks.filter(f => f.status !== 'resolvido').length;
          // `open` também quando só há resolvidos: senão o bloco aparece fechado
          // e parece vazio para quem já respondeu tudo.
          return (
            <details className="bg-white border border-gray-100 rounded-xl overflow-hidden" open={abertos > 0 || !!erroFeedback}>
              <summary className="cursor-pointer px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-polo-navy">📨 Feedback dos clientes</span>
                {erroFeedback
                  ? <span className="text-[11px] font-bold text-white bg-red-500 rounded-full px-2 py-0.5">erro</span>
                  : abertos > 0
                    ? <span className="text-[11px] font-bold text-white bg-red-500 rounded-full px-2 py-0.5">{abertos} novo(s)</span>
                    : <span className="text-[11px] font-semibold text-gray-600">{feedbacks.length || 'nenhum'}</span>}
              </summary>

              {carregandoFeedback && (
                <p className="px-4 py-3 text-xs text-gray-600 animate-pulse">Carregando feedback…</p>
              )}

              {!carregandoFeedback && erroFeedback && (
                <div className="px-4 py-3 bg-red-50 border-t border-red-100">
                  <p className="text-xs font-bold text-red-700">Não consegui carregar o feedback</p>
                  <p className="text-[11px] text-red-600 mt-0.5">{erroFeedback}</p>
                  <p className="text-[11px] text-red-600 mt-1">
                    Se a mensagem falar em função inexistente, falta rodar a migração 15 no Supabase.
                  </p>
                  <button onClick={carregarFeedback}
                    className="mt-2 text-[11px] font-bold text-red-700 border border-red-200 rounded-lg px-2.5 py-1">
                    Tentar de novo
                  </button>
                </div>
              )}

              {!carregandoFeedback && !erroFeedback && feedbacks.length === 0 && (
                <p className="px-4 py-3 text-xs text-gray-500 border-t border-gray-50">
                  Nenhum cliente enviou feedback ainda. O botão fica no rodapé do app deles.
                </p>
              )}

              <div className="divide-y divide-gray-50">
                {feedbacks.map(fb => {
                  const d = fb.dados || {};
                  const linhas = fb.tipo === 'bug'
                    ? [['Onde', d.onde], ['Esperava', d.esperava], ['Aconteceu', d.aconteceu], ['Repetir', d.repetir]]
                    : fb.tipo === 'pedido'
                      ? [['Pedido', d.pedido], ['Hoje é', d.de], ['Deve ficar', d.para], ['Motivo', d.motivo]]
                      : [['Quer', d.ideia], ['Por quê', d.porque]];
                  return (
                    <div key={fb.id} className={`px-4 py-3 ${fb.status === 'resolvido' ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold">
                          {fb.tipo === 'bug' ? 'Problema' : fb.tipo === 'pedido' ? 'Pedido' : 'Sugestão'}
                        </span>
                        <span className="text-[11px] text-gray-600">{dataBR(fb.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-gray-600 mb-1.5">
                        {fb.restaurante_nome || '—'} · {fb.usuario_nome || '?'}{fb.contexto ? ` · ${fb.contexto}` : ''}
                      </p>
                      <div className="text-xs text-gray-700 space-y-0.5">
                        {linhas.filter(([, v]) => v && v.trim()).map(([k, v]) => (
                          <p key={k}><span className="font-semibold text-gray-500">{k}:</span> {v}</p>
                        ))}
                      </div>
                      {/* ⚠️ A CONVERSA INTEIRA, não só a última resposta. O
                          cliente agora responde de volta; mostrar apenas o que
                          a Aurum escreveu esconderia justamente o que ele disse
                          depois — e a decisão de reabrir ou encerrar depende
                          disso. */}
                      {Array.isArray(fb.mensagens) && fb.mensagens.length > 0 && respondendo?.id !== fb.id && (
                        <div className="mt-2 space-y-1.5">
                          {fb.mensagens.map((m, i) => (
                            <div key={i} className={`rounded-lg px-2.5 py-2 ${m.de === 'aurum' ? 'bg-polo-beige' : 'bg-gray-100'}`}>
                              <p className="text-[11px] font-bold text-polo-navy">
                                {m.de === 'aurum' ? 'Aurum' : 'Cliente'}
                                {m.de === 'aurum' && i === fb.mensagens.length - 1 && (
                                  /* Saber se o cliente LEU muda o que fazer: sem
                                     leitura, cobrar pelo WhatsApp; com leitura,
                                     o silêncio é resposta. */
                                  <span className="ml-1 font-semibold text-gray-600">
                                    {fb.resposta_lida ? '· lida' : '· não lida'}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-700 whitespace-pre-wrap mt-0.5">{m.texto}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {respondendo?.id === fb.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea rows={3} autoFocus value={respondendo.texto} maxLength={4000}
                            aria-label="Resposta ao cliente"
                            onChange={e => setRespondendo({ id: fb.id, texto: e.target.value })}
                            placeholder="O cliente lê isto dentro do app, na aba Ajuda."
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900" />
                          <div className="flex gap-2">
                            <button onClick={() => responder(fb)}
                              className="text-[11px] font-bold bg-polo-navy text-polo-gold rounded-lg px-3 py-1.5">Enviar resposta</button>
                            <button onClick={() => setRespondendo(null)}
                              className="text-[11px] text-gray-600 px-2">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 mt-2">
                          <button onClick={() => setRespondendo({ id: fb.id, texto: '' })}
                            className="text-[11px] font-bold text-polo-navy border border-polo-navy/30 rounded-lg px-2.5 py-1">
                            {Array.isArray(fb.mensagens) && fb.mensagens.length ? 'Responder de novo' : 'Responder'}
                          </button>
                          {fb.status !== 'resolvido' && (
                            <button onClick={() => marcarFeedback(fb, 'resolvido')}
                              className="text-[11px] font-bold text-green-700 border border-green-200 rounded-lg px-2.5 py-1">Marcar resolvido</button>
                          )}
                          {fb.status === 'resolvido' && (
                            <button onClick={() => marcarFeedback(fb, 'novo')}
                              className="text-[11px] font-semibold text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1">Reabrir</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })()}

        {carregando && (
          <div className="bg-white rounded-xl p-8 text-center">
            <p className="text-xs text-gray-600 animate-pulse">Carregando restaurantes…</p>
          </div>
        )}

        {!carregando && !erro && (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">
                Restaurantes ({visiveis.length === restaurantes.length
                  ? restaurantes.length
                  : `${visiveis.length} de ${restaurantes.length}`})
              </p>
              <span className="text-[11px] text-gray-600">
                {restaurantes.filter(r => r.suporteAtivo).length} com suporte ativo
              </span>
            </div>

            {/* ⚠️ Busca por NOME, CIDADE e CNPJ, não só por nome: o nome é
                justamente o que o cliente escreve errado e pede para corrigir —
                procurar por "Jaboatão" ou pelo CNPJ do boleto acha de qualquer
                jeito. Sem acento e sem pontuação nos dois lados, senão
                "Jaboatao" não encontra "Jaboatão". */}
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, cidade ou CNPJ…" aria-label="Buscar restaurante"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />

            {visiveis.length === 0 && (
              <div className="bg-white rounded-xl p-8 text-center">
                <p className="text-sm text-gray-600">
                  {busca.trim()
                    ? `Nada encontrado para “${busca.trim()}”.`
                    : 'Nenhum restaurante encontrado.'}
                </p>
              </div>
            )}

            {visiveis.map(r => {
              // eslint-disable-next-line react-hooks/purity -- situação depende da hora atual; recalcular por render é o desejado
              const agora = Date.now();
              const st = statusRestaurante(r, agora);
              const fimTeste = r.created_at ? new Date(r.created_at).getTime() + TESTE_DIAS * 86400000 : null;
              const restanteH = r.suporteAte ? Math.ceil((r.suporteAte - agora) / 3600000) : 0;
              const maxU = r.max_usuarios || 3;
              return (
                <div key={r.id} className={`bg-white border rounded-xl overflow-hidden
                  ${r.bloqueado ? 'border-red-300' : r.suporteAtivo ? 'border-green-300' : 'border-gray-100'}`}>
                  {/* Header: nome + status comercial */}
                  <div className={`px-4 py-3 flex items-center justify-between gap-2
                    ${r.bloqueado ? 'bg-red-50' : r.suporteAtivo ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <div className="min-w-0">
                      {renomeando?.id === r.id ? (
                        <div className="flex items-center gap-1.5">
                          <input value={renomeando.valor} maxLength={60} autoFocus
                            aria-label="Nome do estabelecimento"
                            onChange={e => setRenomeando({ id: r.id, valor: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') salvarNome(r); if (e.key === 'Escape') setRenomeando(null); }}
                            className="min-w-0 flex-1 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900" />
                          <button onClick={() => salvarNome(r)}
                            className="text-[11px] font-bold bg-polo-navy text-polo-gold rounded px-2 py-1 flex-shrink-0">Salvar</button>
                          <button onClick={() => setRenomeando(null)}
                            className="text-[11px] text-gray-600 px-1 flex-shrink-0">Cancelar</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">{r.nome}</p>
                          <button onClick={() => setRenomeando({ id: r.id, valor: r.nome })}
                            aria-label={`Renomear ${r.nome}`} title="Renomear"
                            className="text-[11px] text-gray-600 border border-gray-300 rounded px-1.5 py-0.5 flex-shrink-0">
                            editar
                          </button>
                        </div>
                      )}
                      <p className="text-[11px] text-gray-600 mt-0.5">Criado em {dataBR(r.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <BadgeProduto produto={r.produto} />
                      <BadgeStatus st={st} />
                    </div>
                  </div>

                  {/* Aviso de pagamento (o cliente tocou "Já paguei") */}
                  {r.aviso_pagamento_em && (
                    <div className="px-4 py-2 bg-polo-gold/15 border-b border-polo-gold/30 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-polo-navy font-semibold">
                        💰 Avisou pagamento — plano <strong>{r.aviso_pagamento_plano || 'mensal'}</strong>
                        {r.aviso_pagamento_nome ? <> por <strong>{r.aviso_pagamento_nome}</strong></> : null}
                        {' '}em {dataBRHora(r.aviso_pagamento_em)}
                      </p>
                      <button onClick={() => dispensarAviso(r)}
                        className="text-[11px] font-semibold text-gray-500 underline underline-offset-2 flex-shrink-0">dispensar</button>
                    </div>
                  )}

                  {/* Visão comercial */}
                  <div className="px-4 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-600 border-b border-gray-50">
                    <span>Teste até: <strong>{dataBR(fimTeste)}</strong></span>
                    <span>Assinatura até: <strong>{dataBR(r.assinatura_ate)}</strong></span>
                    <span>Usuários: <strong>{r.usuarios.length}/{maxU}</strong></span>
                    <span>Suporte: <strong>{r.suporteAtivo ? `ativo ~${restanteH}h${r.podeMexer ? ' (editar)' : ' (ver)'}` : '—'}</strong></span>
                  </div>

                  {/* Usuários (com e-mail quando a migração 9 está no banco) */}
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    {r.usuarios.length === 0 ? (
                      <p className="text-xs text-gray-600 italic">Sem usuários</p>
                    ) : (
                      <div className="space-y-1">
                        {r.usuarios.map(u => (
                          <div key={u.id} className="flex items-center justify-between text-xs gap-2">
                            <span className="text-gray-700 truncate">{u.nome || '(sem nome)'}{u.email ? <span className="text-gray-600"> · {u.email}</span> : null}</span>
                            <span className="text-[11px] text-gray-600 bg-gray-50 px-2 py-0.5 rounded-full flex-shrink-0">{u.cargo}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dados e restauração — a rede de segurança contra perda
                      de cadastro. O banco guarda as versões sozinho (M31); aqui
                      é só onde se devolve. */}
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    <button onClick={() => alternarHistorico(r)}
                      className="text-[11px] font-bold text-polo-navy border border-polo-navy/30 rounded-lg px-2.5 py-1">
                      {historico?.id === r.id ? 'Fechar histórico' : '↺ Histórico e restaurar'}
                    </button>
                    {historico?.id === r.id && (
                      <div className="mt-2">
                        {historico.carregando && <p className="text-xs text-gray-600 animate-pulse">Carregando…</p>}
                        {historico.erro && (
                          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
                            {historico.erro}
                          </p>
                        )}
                        {!historico.carregando && !historico.erro && historico.itens.length === 0 && (
                          <p className="text-xs text-gray-600">
                            Ainda não há versões guardadas. A primeira aparece quando o cliente
                            alterar algo do cadastro ou das configurações.
                          </p>
                        )}
                        <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                          {historico.itens.map(h => (
                            <div key={h.id} className="flex items-center justify-between gap-2 py-1.5">
                              <div className="min-w-0">
                                <p className="text-xs text-gray-800 truncate">{nomeDoc(h.chave)}</p>
                                <p className="text-[11px] text-gray-600">
                                  {dataHoraBR(h.criado_em)}
                                  {h.itens != null ? ` · ${h.itens} item(ns)` : ''}
                                </p>
                              </div>
                              <button onClick={() => restaurar(r, h)}
                                className="text-[11px] font-bold text-polo-navy border border-gray-300 rounded-lg px-2 py-1 flex-shrink-0">
                                Restaurar
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cadastro — CNPJ, WhatsApp, cidade. O WhatsApp é por onde
                      a Aurum fala com o cliente e o CNPJ identifica a conta na
                      cobrança: errar a digitação deixava a conta incontactável
                      sem conserto nenhum. */}
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Cadastro</p>
                      {editandoCadastro?.id !== r.id && (
                        <button onClick={() => setEditandoCadastro({
                          id: r.id, cnpj: r.cnpj || '', whatsapp: r.whatsapp || '',
                          cidade: r.cidade || '', uf: r.uf || '',
                        })} className="text-[11px] text-gray-600 border border-gray-300 rounded px-1.5 py-0.5">
                          editar
                        </button>
                      )}
                    </div>
                    {editandoCadastro?.id === r.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {[['cnpj', 'CNPJ', '00.000.000/0001-00'], ['whatsapp', 'WhatsApp', '(81) 99999-9999']].map(([k, l, ph]) => (
                            <label key={k} className="block">
                              <span className="text-[11px] text-gray-600">{l}</span>
                              <input value={editandoCadastro[k]} placeholder={ph}
                                onChange={e => setEditandoCadastro(c => ({ ...c, [k]: e.target.value }))}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900" />
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <label className="block flex-1 min-w-0">
                            <span className="text-[11px] text-gray-600">Cidade</span>
                            <input value={editandoCadastro.cidade}
                              onChange={e => setEditandoCadastro(c => ({ ...c, cidade: e.target.value }))}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900" />
                          </label>
                          <label className="block" style={{ flex: '0 0 4rem' }}>
                            <span className="text-[11px] text-gray-600">UF</span>
                            <input value={editandoCadastro.uf} maxLength={2}
                              onChange={e => setEditandoCadastro(c => ({ ...c, uf: e.target.value.toUpperCase() }))}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900" />
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => salvarCadastro(r)}
                            className="text-[11px] font-bold bg-polo-navy text-polo-gold rounded px-3 py-1.5">Salvar</button>
                          <button onClick={() => setEditandoCadastro(null)}
                            className="text-[11px] text-gray-600 px-2">Cancelar</button>
                        </div>
                        <p className="text-[11px] text-gray-500">Campo em branco não apaga o que já está gravado.</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-700">
                        {[r.cnpj && `CNPJ ${r.cnpj}`, r.whatsapp, [r.cidade, r.uf].filter(Boolean).join(' - ')]
                          .filter(Boolean).join(' · ') || <span className="text-gray-500">sem dados de cadastro</span>}
                      </p>
                    )}
                  </div>

                  {/* Produto contratado (upgrade/downgrade comercial) */}
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Produto contratado</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {['etiquetas', 'completo'].map(id => {
                        const sel = (r.produto || 'completo') === id;
                        return (
                          <button key={id} onClick={() => mudarProduto(r, id)} disabled={sel}
                            className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 border
                              ${sel ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'text-polo-navy border-gray-300'}`}>
                            {produtoDe(id).label} · R$ {produtoDe(id).precoMes}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Ativar plano pago (após confirmar o Pix) */}
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Ativar plano pago</p>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {/* ⚠️ O preço mostrado é o DESTE restaurante. Com dois produtos,
                          "Semestral" sozinho não diz se o Pix esperado é R$1.458 ou
                          R$2.700 — e é aqui que o dono confere o que caiu na conta. */}
                      {PLANOS.map(p => (
                        <button key={p.id} onClick={() => liberarDias(r, p.dias)}
                          className="text-[11px] font-bold text-polo-gold bg-polo-navy rounded-lg px-2.5 py-1.5">
                          {p.label} (+{p.dias}d) · {brlAdmin(precoPlano(p, r.produto))}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Cortesia (dias avulsos)</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[7, 14, 30, 90].map(d => (
                        <button key={d} onClick={() => liberarDias(r, d)}
                          className="text-[11px] font-bold text-polo-navy border border-polo-navy rounded-lg px-2.5 py-1.5">
                          +{d}d
                        </button>
                      ))}
                      <input type="number" min="1" max="400" inputMode="numeric" placeholder="dias"
                        value={diasCustom[r.id] || ''}
                        onChange={e => setDiasCustom(p => ({ ...p, [r.id]: e.target.value }))}
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-[11px]" />
                      <button onClick={() => {
                          const d = parseInt(diasCustom[r.id]);
                          if (!d || d < 1 || d > 400) { toast('Digite entre 1 e 400 dias.', 'aviso'); return; }
                          liberarDias(r, d);
                        }}
                        className="text-[11px] font-bold bg-polo-navy text-polo-gold rounded-lg px-2.5 py-1.5">
                        Liberar
                      </button>
                    </div>
                  </div>

                  {/* VIP (limite de usuários) + bloqueio */}
                  <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between gap-2">
                    <label className="text-[11px] text-gray-600 flex items-center gap-1.5">
                      👥 Limite de usuários
                      <select value={maxU} onChange={e => mudarMax(r, parseInt(e.target.value))}
                        className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px] bg-white">
                        {[3, 4, 5].map(n => <option key={n} value={n}>{n}{n === 3 ? ' (padrão)' : ' (VIP)'}</option>)}
                      </select>
                    </label>
                    <button onClick={() => alternarBloqueio(r)}
                      className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 ${r.bloqueado ? 'bg-green-600 text-white' : 'bg-red-100 text-red-700'}`}>
                      {r.bloqueado ? '✅ Reativar conta' : 'Suspender conta'}
                    </button>
                  </div>

                  {/* Notas internas (invisíveis ao cliente) */}
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Notas internas (só você vê)</p>
                    <div className="flex gap-1.5">
                      <input type="text" value={notasLocal[r.id] ?? ''} placeholder="Ex: VIP · WhatsApp (81) 9…"
                        onChange={e => setNotasLocal(p => ({ ...p, [r.id]: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-[11px]" />
                      <button onClick={() => salvarNotas(r)}
                        className="text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-lg px-2.5">Salvar</button>
                    </div>
                  </div>

                  {/* Acesso de suporte */}
                  <div className="px-4 py-3">
                    {r.suporteAtivo ? (
                      <button
                        onClick={() => { verComoRestaurante(r.id, r.nome, r.podeMexer, r.produto); navigate('/'); }}
                        className={`w-full font-bold text-xs py-2.5 rounded-lg ${r.podeMexer ? 'bg-red-600 text-white' : 'bg-polo-navy text-polo-gold'}`}>
                        {r.podeMexer ? '✏️ Entrar como este restaurante (pode EDITAR)' : '👁️ Ver como este restaurante (somente leitura)'}
                      </button>
                    ) : (
                      <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        Para ver os dados deste restaurante, peça que ele autorize o suporte em Configurações → Sistema → Suporte remoto.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </Layout>
  );
}
