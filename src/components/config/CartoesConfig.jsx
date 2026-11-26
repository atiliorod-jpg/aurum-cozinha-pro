// Cartoes de Configuracao compartilhados.
//
// ⚠️ Estes viviam DENTRO da antiga tela de Configurações como funções
// internas, e o plano Etiquetas tinha outra tela (Ajustes) com os mesmos
// cartões. Desde o Lote 4 (14/10/2026) as duas viraram a Administração em
// grupos (pages/AdministracaoGrupo.jsx), que usa estes cartões nos dois planos.
import Chave from '../ui/Chave';
import { useState } from 'react';
import Botao from '../Botao';
import { configEtiqueta } from '../../utils/etiquetas';
import { listarArmazenamentos, MAX_FAIXA, ARMAZENAMENTOS_PADRAO } from '../../utils/armazenamento';
import { listarEstados, ESTADOS_PADRAO, MAX_NOME_ESTADO, idDoEstado } from '../../utils/metodos';
import { formatarCNPJ } from '../../utils/documentos';
import { useApp } from '../../store/AppContext';
import Icon from '../Icons';
import { useUI } from '../../store/UIContext';
import { PILULA } from '../QuemImprime';
import PreviaEtiquetaItem from '../PreviaEtiquetaItem';

// a opção marcada fica desligada para o toque (já é a que vale), mas com a
// cor dela — não o bege de botão desligado
const OPCAO_SUPORTE = 'min-h-11 px-2 rounded-xl text-sm font-bold transition-colors disabled:cursor-default';

export function CartaoSuporteRemoto({ prefs, setPrefs, toast }) {
  // eslint-disable-next-line react-hooks/purity -- a hora atual é insumo legítimo do prazo de 24h; recalcular a cada render é o comportamento desejado
  const agora = Date.now();
  const suporteAtivo = prefs.suporteAtivo && prefs.suporteAtivo > agora;
  const restante = suporteAtivo
    ? Math.ceil((prefs.suporteAtivo - agora) / 3600000)
    : 0;

  // ⚠️ AS DUAS CHAVES NUMA GRAVAÇÃO SÓ. Eram dois setPref seguidos, e a segunda
  // chamada montava o objeto a partir do prefs ANTIGO — as duas subiam
  // disputando a mesma versão do documento, uma era recusada e o cliente via
  // "Outro tablet alterou as configurações" sem tablet nenhum por perto. Pior:
  // o valor perdido podia ser a PERMISSÃO, e aí a tela dizia "autorizado a
  // editar" enquanto o painel da Aurum enxergava só leitura.
  const autorizar = (permissao) => {
    setPrefs({ suporteAtivo: Date.now() + 24 * 3600 * 1000, suportePermissao: permissao });
    toast(permissao === 'mexer'
      ? 'Suporte autorizado a VER E EDITAR seus dados por 24h.'
      : 'Suporte autorizado a visualizar seus dados por 24h.', 'sucesso');
  };

  const revogar = () => {
    setPrefs({ suporteAtivo: null, suportePermissao: null });
    toast('Acesso de suporte revogado.', 'sucesso');
  };

  const permissao = prefs.suportePermissao === 'mexer' ? 'mexer' : 'ver';
  const marcadaVer = !!suporteAtivo && permissao === 'ver';
  const marcadaMexer = !!suporteAtivo && permissao === 'mexer';
  return (
    <div className="cartao space-y-3">
      {/* ⚠️ <h2>, NÃO <p> em negrito. A Administração tem quatro telas de
          rolagem; para quem enxerga tanto faz, mas quem usa leitor de tela
          navega justamente pulando de título em título — e sem títulos de
          verdade não há como. A aparência é a mesma. */}
      <div>
        <h2 className="titulo-secao">Suporte remoto</h2>
        <p className="text-sm text-polo-tinta mt-0.5">
          Libera o suporte Aurum na sua conta: só olhar, ou também corrigir.
        </p>
      </div>
      {/* ⚠️ REDESIGN (26/11/2026): as duas opções num controle só. Um toque
          AUTORIZA (como antes); com o acesso aberto, a opção marcada mostra
          qual é, e tocar na outra troca a permissão (e conta 24 h de novo). */}
      <div role="group" aria-label="Acesso do suporte"
        className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-polo-beige border-2 border-polo-linha">
        {/* ⚠️ Dois botões escritos, sem .map: dentro do .map o compilador do
            React achava que o autorizar (que lê a hora) rodava no desenho */}
        <button type="button" aria-pressed={marcadaVer} onClick={() => autorizar('ver')} disabled={marcadaVer}
          className={`${OPCAO_SUPORTE} ${marcadaVer ? 'bg-polo-navy text-polo-gold' : 'text-polo-navy'}`}>
          Só visualizar
        </button>
        <button type="button" aria-pressed={marcadaMexer} onClick={() => autorizar('mexer')} disabled={marcadaMexer}
          className={`${OPCAO_SUPORTE} ${marcadaMexer ? 'bg-polo-navy text-polo-gold' : 'text-polo-navy'}`}>
          Ver e editar
        </button>
      </div>
      {suporteAtivo ? (
        <>
          <p className="text-sm text-ok-tinta">
            Autorizado — fecha sozinho em ~{restante} h.{' '}
            <strong>{permissao === 'mexer' ? 'Pode ver e EDITAR' : 'Somente visualização'}</strong> dos seus dados.
          </p>
          <button type="button" onClick={revogar}
            className="w-full min-h-12 rounded-xl border-2 border-perigo/40 bg-white text-perigo font-bold text-sm">Revogar acesso</button>
        </>
      ) : (
        <p className="text-xs text-polo-tinta">Vale por 24 h e depois fecha sozinho.</p>
      )}
    </div>
  );
}

export function CartaoArmazenamentos({ prefs, setPref, toast, confirm }) {
  const lista = listarArmazenamentos(prefs);
  const salvar = (nova) => setPref('armazenamentos', nova);

  const editar = (id, campo, valor) =>
    salvar(lista.map(a => a.id === id ? { ...a, [campo]: valor } : a));

  const [novo, setNovo] = useState('');
  const adicionar = () => {
    const nome = novo.trim();
    if (!nome) return;
    // id derivado do nome, sem acento nem espaço — é o que fica gravado nos
    // registros e nas etiquetas, então precisa ser estável e simples.
    const id = nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!id) { toast('Dê um nome com letras.', 'aviso'); return; }
    if (lista.some(a => a.id === id)) { toast('Já existe um armazenamento com esse nome.', 'aviso'); return; }
    salvar([...lista, { id, nome, faixa: '' }]);
    setNovo('');
    toast(`"${nome}" adicionado. Preencha a faixa de temperatura.`, 'sucesso');
  };

  const remover = async (a) => {
    const ok = await confirm({
      titulo: `Remover "${a.nome}"?`,
      mensagem: 'As etiquetas já impressas com esse armazenamento continuam como estão. Os prazos que os produtos têm nele deixam de ser usados.',
      perigo: true, confirmar: 'Remover',
    });
    if (!ok) return;
    salvar(lista.filter(x => x.id !== a.id));
    toast(`"${a.nome}" removido.`, 'sucesso');
  };

  return (
    <div className="cartao space-y-3">
      <div>
        <h2 className="titulo-secao">Armazenamento</h2>
        <p className="text-sm text-polo-tinta mt-0.5">
          O nome e a faixa saem na etiqueta; cada item tem um prazo em cada um.
        </p>
      </div>

      {/* ⚠️ Aviso deliberado: a temperatura correta é responsabilidade sanitária
          do estabelecimento, varia por produto e por exigência da vigilância
          local. Estes valores são ponto de partida, e quem confere é o
          responsável técnico — não o app. */}
      <p className="flex gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
        <Icon name="alerta" size={16} /><span>As faixas abaixo já vêm preenchidas como sugestão. <strong>Confira com o seu
        responsável técnico</strong> e ajuste ao que a vigilância local exige — é essa
        temperatura que vai impressa na etiqueta.</span>
      </p>

      {/* ⚠️ REDESIGN (26/11/2026): nome e temperatura lado a lado, com quantas
          letras ainda cabem na temperatura (o limite é o do papel) */}
      <div className="space-y-3">
        {lista.map(a => (
          <div key={a.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="min-w-0">
              <p className="rotulo flex items-center justify-between gap-2" aria-hidden="true">
                Nome{a.fixo && <span className="normal-case tracking-normal font-semibold text-polo-tinta bg-polo-beige rounded-full px-2">fixo</span>}
              </p>
              <input type="text" value={a.nome} onChange={e => editar(a.id, 'nome', e.target.value)}
                aria-label={`Nome do armazenamento ${a.nome}`} className="campo font-semibold" />
            </div>
            <div className="min-w-0">
              <label htmlFor={`arm-faixa-${a.id}`} className="rotulo">
                Temperatura <span className="normal-case tracking-normal font-semibold">· {(a.faixa || '').length}/{MAX_FAIXA}</span>
              </label>
              <input id={`arm-faixa-${a.id}`} type="text" value={a.faixa || ''} maxLength={MAX_FAIXA}
                onChange={e => editar(a.id, 'faixa', e.target.value)}
                placeholder="ex.: -18°C a -12°C" className="campo" />
            </div>
            {/* congelado e resfriado não podem ser removidos: os ids deles estão
                gravados no histórico de toda conta que já usou o app */}
            {!a.fixo ? (
              <button onClick={() => remover(a)} aria-label={`Remover ${a.nome}`}
                className="min-h-14 px-4 sm:w-[6.5rem] rounded-xl border-2 border-perigo/40 text-perigo text-sm font-bold">Remover</button>
            ) : <span className="hidden sm:block w-[6.5rem]" aria-hidden="true" />}
          </div>
        ))}
      </div>

      {/* O limite existe por causa do papel, não por capricho — ver MAX_FAIXA */}
      <p className="text-xs text-polo-tinta">
        A temperatura cabe em {MAX_FAIXA} caracteres: acima disso ela empurraria o rodapé da
        etiqueta (nome e endereço) para fora do papel.
      </p>

      {/* ⚠️ flex-wrap: no celular o botão desce para a linha de baixo — lado a
          lado, ele espremia o campo até cortar o que se digita */}
      <div className="flex flex-wrap items-center gap-2 border-t border-polo-linha pt-3">
        <input type="text" value={novo} onChange={e => setNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') adicionar(); }}
          placeholder="Novo armazenamento (ex.: Estufa)"
          aria-label="Nome do novo armazenamento" className="campo flex-1 min-w-[12rem] !w-auto" />
        <Botao onClick={adicionar} largura="auto" className="px-4 flex-1 sm:flex-none"><Icon name="mais" size={18} />Adicionar</Botao>
      </div>

      {JSON.stringify(lista) !== JSON.stringify(ARMAZENAMENTOS_PADRAO) && (
        <button onClick={() => { salvar(ARMAZENAMENTOS_PADRAO.map(a => ({ ...a }))); toast('Armazenamentos voltaram ao padrão.', 'sucesso'); }}
          className="text-xs text-gray-600 underline underline-offset-2">
          Voltar ao padrão
        </button>
      )}
    </div>
  );
}

// =====================================================================
//  ESTADOS DE CONSERVAÇÃO (Lote 11, 02/11/2026 — visto no Suflex): o que
//  acontece com o item DENTRO de um armazenamento — pista fria, pista quente,
//  descongelando. Cada item escolhe, na ficha, em quais métodos usa cada um,
//  com o prazo dele. Sai impresso junto do armazenamento.
//
//  ⚠️ O id nasce do nome e NÃO muda ao renomear: é o que os métodos dos
//  itens guardam. Renomear "Pista fria" para "Bancada fria" muda o texto em
//  todas as etiquetas novas, sem precisar abrir item por item.
// =====================================================================
export function CartaoEstados({ prefs, setPref, toast, confirm }) {
  // ⚠️ A lista CRUA, com nome vazio e tudo: `listarEstados` esconde o estado
  // sem nome, e apagar o nome para reescrever faria o campo sumir da tela no
  // meio da digitação. Quem imprime lê pelo listarEstados, que filtra.
  const lista = Array.isArray(prefs?.estadosConservacao) ? prefs.estadosConservacao : listarEstados(prefs);
  const salvar = (nova) => setPref('estadosConservacao', nova);
  const editar = (id, nome) => salvar(lista.map(e => (e.id === id ? { ...e, nome } : e)));

  const [novo, setNovo] = useState('');
  const adicionar = () => {
    const nome = novo.trim();
    if (!nome) return;
    const id = idDoEstado(nome);
    if (!id) { toast('Dê um nome com letras.', 'aviso'); return; }
    if (lista.some(e => e.id === id)) { toast('Já existe um estado com esse nome.', 'aviso'); return; }
    salvar([...lista, { id, nome }]);
    setNovo('');
    toast(`"${nome}" adicionado. Use na ficha do item, em cada método.`, 'sucesso');
  };

  const remover = async (e) => {
    const ok = await confirm({
      titulo: `Remover "${e.nome}"?`,
      mensagem: 'As etiquetas já impressas continuam como estão. Nos itens que usam esse estado, o método passa a sair sem ele.',
      perigo: true, confirmar: 'Remover',
    });
    if (!ok) return;
    salvar(lista.filter(x => x.id !== e.id));
    toast(`"${e.nome}" removido.`, 'sucesso');
  };

  return (
    <div className="cartao space-y-3">
      <div>
        <h2 className="titulo-secao">Estados de conservação</h2>
        <p className="text-sm text-polo-tinta mt-0.5">
          Como “pista fria”: sai junto do armazenamento (RESFRIADO · PISTA FRIA).
        </p>
      </div>
      {lista.length === 0 && (
        <p className="text-sm text-polo-tinta">Nenhum estado. Os itens usam só o armazenamento.</p>
      )}
      {/* ⚠️ REDESIGN (26/11/2026): cada estado é uma pílula — e o nome continua
          EDITÁVEL dentro dela (o campo cresce com o texto), porque renomear sem
          perder o id é o que mantém os itens que já usam o estado. */}
      {lista.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Estados cadastrados">
          {lista.map(e => (
            <li key={e.id} className="inline-flex items-center rounded-full border-2 border-polo-linha bg-polo-beige pl-3 max-w-full">
              <input type="text" value={e.nome} maxLength={MAX_NOME_ESTADO}
                onChange={ev => editar(e.id, ev.target.value)}
                aria-label={`Nome do estado ${e.nome}`} size={Math.max(4, e.nome.length)}
                className="min-h-11 min-w-0 bg-transparent text-sm font-bold text-polo-navy focus:outline-none" />
              <button onClick={() => remover(e)} aria-label={`Remover ${e.nome}`}
                className="w-11 h-11 rounded-full flex items-center justify-center text-polo-tinta flex-shrink-0">
                <Icon name="fechar" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-polo-tinta">
        O nome cabe em {MAX_NOME_ESTADO} letras: ele divide a linha com o armazenamento e a temperatura.
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t border-polo-linha pt-3">
        <input type="text" value={novo} maxLength={MAX_NOME_ESTADO} onChange={e => setNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') adicionar(); }}
          placeholder="Novo estado (ex.: Buffet)"
          aria-label="Nome do novo estado" className="campo flex-1 min-w-[12rem] !w-auto" />
        <Botao onClick={adicionar} largura="auto" className="px-4 flex-1 sm:flex-none"><Icon name="mais" size={18} />Adicionar</Botao>
      </div>
      {JSON.stringify(lista) !== JSON.stringify(ESTADOS_PADRAO) && (
        <button onClick={() => { salvar(ESTADOS_PADRAO.map(e => ({ ...e }))); toast('Estados voltaram ao padrão.', 'sucesso'); }}
          className="text-sm text-gray-600 underline underline-offset-2 min-h-12">
          Voltar ao padrão
        </button>
      )}
    </div>
  );
}

export function CartaoEtiquetas({ prefs, setPref, toast, mostrarQR = true }) {
  const cfg = configEtiqueta(prefs);
  // ⚠️ O TAMANHO SAIU DA TELA. Aqui havia dois campos de mm, e eles causavam um
  // defeito que só aparece no papel: o app dizia um tamanho, o driver da
  // impressora dizia outro, e a etiqueta saía deslocada sem erro nenhum na
  // tela. Quem está na cozinha não tem como descobrir isso. O sistema é
  // vendido com a impressora e o rolo 60x50; um número só, dos dois lados.
  const salvar = (patch) => setPref('etiquetaConfig', { ...cfg, ...patch });
  const toggleCampo = (k) => salvar({ campos: { ...cfg.campos, [k]: cfg.campos[k] === false } });

  const CAMPOS = [
    ['restaurante', 'Nome do estabelecimento'],
    ['estabelecimento', 'CNPJ / endereço (rodapé)'],
    ['fabricacao', 'Data de manipulação/abertura'],
    ['validade', 'Vencimento'],
    ['valOriginal', 'Validade original (fornecedor)'],
    ['armazenamento', 'Armazenamento'],
    ['marca', 'Marca / fornecedor'],
    ['sif', 'SIF'],
    ['lote', 'Lote do fabricante'],
    ['responsavel', 'Responsável'],
  ];

  // ⚠️ Os dados do estabelecimento (rodapé) SAÍRAM deste cartão no Lote 4:
  // são da CASA, não do jeito de imprimir — moram em Administração → A casa
  // (CartaoEstabelecimento, logo abaixo).
  const { pessoas } = useApp();

  return (
    <div className="cartao space-y-3">
      <div>
        <h2 className="titulo-secao">Campos da etiqueta</h2>
        <p className="text-sm text-polo-tinta mt-0.5">
          O que aparece na etiqueta impressa.
        </p>
      </div>
      {/* redesign (26/11/2026): o rolo numa faixa só, marcada como só leitura */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-polo-beige border-2 border-polo-linha rounded-xl px-3 py-2 text-sm text-polo-navy">
        <Icon name="etiqueta" size={16} />
        <strong>Rolo 60 × 50 mm</strong>
        <span className="text-polo-tinta">· Tamanho único do sistema · Tomate MDK-022</span>
        <span className="ml-auto text-xs font-bold text-polo-tinta">somente leitura</span>
      </p>
      {/* ⚠️ QR só no plano COMPLETO. No plano Etiquetas ele não tem consumidor:
          quem lê o código é a contagem por câmera do Inventário, tela que só
          existe no completo. O conteúdo é texto simples, então a câmera do
          celular apenas MOSTRA o texto — não abre nada. Ali ele ocupava espaço
          na etiqueta e travava o botão Imprimir em "Gerando QR…" de graça. */}
      {mostrarQR && <>
      <div className="flex items-center justify-between gap-3 border-t border-polo-linha pt-3">
        <div>
          <p className="text-sm font-bold text-polo-navy">QR code na etiqueta</p>
          <p className="text-xs text-polo-tinta">Para dar baixa lendo a etiqueta (saída, perda, usado) e contar no Inventário.</p>
        </div>
        <Chave rotulo="QR code na etiqueta" ligada={!!cfg.incluirQR}
          aoTrocar={() => { salvar({ incluirQR: !cfg.incluirQR }); toast(!cfg.incluirQR ? 'QR code LIGADO nas etiquetas.' : 'QR code desligado.', 'sucesso'); }} />
      </div>
      </>}
      <div className="border-t border-polo-linha pt-1">
        {/* ⚠️ REDESIGN (26/11/2026): as caixinhas viraram CHAVES liga/desliga,
            uma por linha (o desenho novo). Cada chave tem alvo de 44 px e nome
            próprio; a linha inteira continua tocável (o texto liga a chave).
            Antes (14/10): caixinhas de 16 px passaram para 24, linha de 44. */}
        <ul aria-label="Campos que aparecem na etiqueta" className="divide-y divide-polo-linha/70">
          {CAMPOS.map(([k, label]) => (
            <li key={k} className="flex items-center justify-between gap-3 min-h-12">
              {/* o <label for> aponta para a chave: tocar no texto liga/desliga */}
              <label htmlFor={`campo-etq-${k}`} className="flex-1 min-w-0 text-sm font-semibold text-polo-navy py-3 cursor-pointer">{label}</label>
              <Chave id={`campo-etq-${k}`} rotulo={label} ligada={cfg.campos[k] !== false} aoTrocar={() => toggleCampo(k)} />
            </li>
          ))}
        </ul>
        <p className="text-xs text-polo-tinta mt-2">O nome do produto sempre aparece.</p>

        {/* ⚠️ NÃO É UM CAMPO, É UMA REGRA — por isso fica fora da grade acima.
            Veio de um lote impresso com o RESP. em branco, percebido tarde
            demais: rolo gasto e trabalho refeito. Onde a etiqueta é documento
            sanitário isso não é opcional; onde é só identificação, exigir
            atrapalha. Quem decide é a casa. */}
        {/* ⚠️ COM A EQUIPE CADASTRADA, A REGRA JÁ VALE SEMPRE (14/10/2026):
            "Quem vai imprimir?" exige o nome antes de liberar o botão. A caixa
            só faz sentido com a lista vazia, quando o RESP. é digitado na hora;
            com equipe, ela confundia — parecia dar para desligar. */}
        {(pessoas || []).length > 0 ? (
          <p className="text-xs text-gray-700 mt-3 pt-3 border-t border-gray-100">
            <span className="font-semibold">Toda etiqueta sai assinada.</span>{' '}
            Antes de imprimir, a pessoa toca no próprio nome em “Quem vai imprimir?”.
          </p>
        ) : (
        <label className="flex items-start gap-2 text-xs text-gray-700 mt-3 pt-3 border-t border-gray-100">
          <input type="checkbox" checked={cfg.exigirResponsavel === true}
            onChange={() => setPref('etiquetaConfig', { ...cfg, exigirResponsavel: cfg.exigirResponsavel !== true })}
            className="w-6 h-6 accent-[#1B2A41] mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-semibold">Exigir o responsável para imprimir</span>
            <span className="block text-xs text-gray-600">
              Sem alguém escolhido no campo RESP., o botão de imprimir não libera.
            </span>
          </span>
        </label>
        )}
      </div>
    </div>
  );
}

/**
 * Dados do estabelecimento — o rodapé da etiqueta (Administração → A casa).
 */
export function CartaoEstabelecimento({ prefs, setPref, toast, nomeRestaurante = '', cnpjDaConta = '' }) {
  return (
    <DadosDoEstabelecimento prefs={prefs} setPref={setPref}
      toast={toast} nomeRestaurante={nomeRestaurante} cnpjDaConta={cnpjDaConta} />
  );
}

// o item de exemplo das prévias da Administração (A casa e Etiqueta)
const ITEM_DE_EXEMPLO = { nome: 'Filé mignon', medidaPadrao: '1 kg', marca: 'Fornecedor', sif: '1234', tipoData: 'fabricacao' };

/**
 * A coluna "Assim sai na etiqueta" da Administração (redesign, 26/11/2026):
 * ao lado dos campos no computador, embaixo deles no celular. Lê as
 * preferências AO VIVO — ligar uma chave ou renomear um armazenamento já
 * aparece aqui. Em A casa recebe o que está sendo digitado, antes de salvar.
 */
export function CartaoPreviaDaEtiqueta({ metodo, estabelecimentoConta, destacarRodape = false }) {
  const { pessoas } = useApp();
  return (
    // presa logo abaixo do cabeçalho (que desce junto com a faixa da demonstração)
    <div className="cartao space-y-2 lg:sticky" style={{ top: 'calc(var(--faixa-topo, 0px) + 5rem)' }}>
      <h2 className="titulo-secao">Assim sai na etiqueta</h2>
      <PreviaEtiquetaItem item={ITEM_DE_EXEMPLO} metodo={metodo || { armazenamento: 'congelado', dias: 30 }}
        estabelecimentoConta={estabelecimentoConta} destacarRodape={destacarRodape}
        responsavel={pessoas?.[0]?.nome || 'Maria'} />
    </div>
  );
}

/**
 * Dados do estabelecimento — o rodapé da etiqueta. Moram em
 * `prefs.estabelecimento`; nome e CNPJ vêm do cadastro e só a Aurum muda.
 * (As unidades extras da M46, com dados no banco, saíram em 24/11/2026.)
 */
function DadosDoEstabelecimento({ prefs, setPref, toast, nomeRestaurante, cnpjDaConta }) {
  const { abrirAjuda } = useUI();
  // ⚠️ O QUE ESTÁ GRAVADO, ATÉ ALGUÉM MEXER (23/11/2026). O formulário
  // copiava os dados UMA vez, ao abrir: aberto antes de a nuvem responder (ou
  // sem internet, num aparelho sem cache), mostrava tudo em branco — e quem
  // via em branco digitava de novo. Agora mostra o gravado, que chega
  // depois, e só vira rascunho quando a pessoa digita.
  const gravado = prefs.estabelecimento || {};
  const [rascunho, setRascunho] = useState(null);
  const local = rascunho ?? gravado;
  const setLocal = (mudar) => setRascunho(atual => mudar(atual ?? gravado));

  const salvar = () => {
    // ⚠️ O CNPJ SAI DAQUI NA GRAVAÇÃO. Contas que editaram esse campo quando
    // ele era livre têm um valor guardado; deixá-lo passar faria o número
    // antigo continuar indo para a etiqueta mesmo com o campo já travado.
    const { cnpj: _ignorado, ...semCnpj } = local;
    const limpo = Object.fromEntries(Object.entries(semCnpj).map(([k, v]) => [k, (v || '').trim()]));
    setPref('estabelecimento', limpo);
    setRascunho(null);
    toast('Dados do estabelecimento salvos.', 'sucesso');
  };

  const nome = nomeRestaurante;
  // o MESMO que sai no papel (dadosDaEtiqueta): o da conta e, sem ele, o
  // antigo que ficou gravado — a caixa não pode dizer "—" e a etiqueta, um número
  const cnpj = cnpjDaConta || gravado.cnpj || '';
  // ⚠️ REDESIGN (26/11/2026): o botão diz quando não há o que salvar
  const igual = ['cep', 'endereco', 'cidade'].every(k => (local[k] || '').trim() === (gravado[k] || '').trim());

  // ⚠️ REDESIGN (26/11/2026): o formulário à esquerda e, ao lado (embaixo no
  // celular), a etiqueta COMO SAI com o que está sendo digitado — o rodapé
  // pintado é o que estes campos mudam.
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-4 lg:items-start">
    <div className="cartao space-y-3">
      <div>
        <h2 className="titulo-secao">Dados do estabelecimento</h2>
        <p className="text-sm text-polo-tinta mt-0.5">
          Saem no rodapé da etiqueta: quem manipulou o alimento, para a fiscalização.
        </p>
      </div>
      {/* ⚠️ O NOME E O CNPJ SÃO SÓ LEITURA AQUI, de propósito. O nome
          identifica a conta no contrato, na cobrança e no painel de suporte —
          conta que se renomeia sozinha vira outra conta para quem atende. O
          CNPJ é o que sai IMPRESSO no rodapé e identifica quem manipulou o
          alimento: enquanto era livre, um erro de digitação circulava colado
          no pote. Mudar os dois passa pela Aurum — e o pedido sai daqui mesmo
          (redesign, 26/11/2026: o botão abre a Ajuda já em "Pedido"). */}
      <div className="bg-polo-beige border-2 border-polo-linha rounded-2xl p-3 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-polo-tinta">
          <Icon name="cadeado" size={14} />Protegido: só muda por pedido
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="rotulo">Nome do estabelecimento</p>
            <p className="min-h-12 flex items-center rounded-xl bg-white border-2 border-polo-linha px-3 font-bold text-polo-navy break-words">{nome || '—'}</p>
          </div>
          <div>
            <p className="rotulo">CNPJ</p>
            <p className="min-h-12 flex items-center rounded-xl bg-white border-2 border-polo-linha px-3 font-bold text-polo-navy whitespace-nowrap">
              {cnpj ? formatarCNPJ(cnpj) : '—'}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => abrirAjuda('pedido')} className={PILULA}>
          <Icon name="suporte" size={16} />Pedir alteração (Ajuda → Pedido)
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
        <div>
          <label htmlFor="est-cep" className="rotulo">CEP</label>
          <input id="est-cep" type="text" value={local.cep || ''} placeholder="00000-000"
            onChange={e => setLocal(p => ({ ...p, cep: e.target.value }))} className="campo" />
        </div>
        <div>
          <label htmlFor="est-end" className="rotulo">Endereço</label>
          <input id="est-end" type="text" value={local.endereco || ''} placeholder="Rua, número"
            onChange={e => setLocal(p => ({ ...p, endereco: e.target.value }))} className="campo" />
        </div>
      </div>
      <div>
        <label htmlFor="est-cid" className="rotulo">Cidade - UF</label>
        <input id="est-cid" type="text" value={local.cidade || ''} placeholder="Recife - PE"
          onChange={e => setLocal(p => ({ ...p, cidade: e.target.value }))} className="campo" />
      </div>
      <Botao tamanho="lg" onClick={salvar} disabled={igual}>
        <Icon name="check" size={20} />{igual ? 'Nenhuma alteração para salvar' : 'Salvar dados do estabelecimento'}
      </Botao>
    </div>
    <CartaoPreviaDaEtiqueta estabelecimentoConta={local} destacarRodape />
    </div>
  );
}

// =====================================================================
//  Meus dados — baixar e restaurar a cópia de segurança
//
//  ⚠️ POR QUE ISTO EXISTE. Os Termos prometem, em duas cláusulas, que a conta
//  exporta a íntegra dos dados a qualquer momento e que, encerrada a relação, o
//  cliente leva o que é dele. A exportação existia só no plano completo, em
//  Configurações → Sistema. Quem comprou o Aurum Etiquetas não tinha botão
//  nenhum — o contrato prometia uma coisa que o app não fazia.
//
//  ⚠️ A FUNÇÃO É A MESMA do plano completo (`exportarBackup` do AppContext),
//  não uma segunda versão. Duas exportações seriam dois formatos, e no dia de
//  restaurar um deles não abriria.
// =====================================================================
export function CartaoMeusDados({ exportarBackup, importarBackup, toast, confirm }) {
  const aoEscolherArquivo = (e) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = async (ev) => {
      try {
        const dados = JSON.parse(ev.target.result);
        const ok = await confirm({
          titulo: 'Restaurar cópia',
          mensagem: 'Os itens e as configurações do arquivo entram por cima dos atuais. '
            + 'O que existe hoje e não está no arquivo continua onde está.\n\nContinuar?',
          perigo: true,
          confirmar: 'Restaurar',
        });
        if (ok) { importarBackup(dados); toast('Cópia restaurada.', 'sucesso'); }
      } catch (err) {
        toast(err?.message || 'Arquivo inválido. Escolha uma cópia baixada do Aurum.', 'erro');
      }
    };
    leitor.readAsText(arquivo);
    e.target.value = '';   // deixa escolher o MESMO arquivo de novo se der erro
  };

  return (
    <div className="cartao space-y-3">
      <div>
        <h2 className="titulo-secao">Meus dados</h2>
        <p className="text-sm text-polo-tinta mt-0.5">
          Itens, prazos, equipe e configurações num arquivo só, que fica com você.
        </p>
      </div>

      {/* redesign (26/11/2026): baixar em azul-marinho, restaurar em contorno,
          lado a lado */}
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => { exportarBackup(); toast('Cópia baixada.', 'sucesso'); }}
          className="w-full min-h-12 rounded-xl bg-polo-navy text-polo-gold font-bold text-sm inline-flex items-center justify-center gap-2">
          <Icon name="entradas" size={18} />Baixar uma cópia
        </button>

        {/* ⚠️ O input fica escondido atrás do label porque input de arquivo não
            aceita estilo: sem isto, o botão sai com a cara do navegador, em
            inglês, no meio de uma tela em português. `sr-only` e não `hidden`:
            escondido de vez, o teclado não chegava nele. */}
        <label className="block has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-polo-navy rounded-xl">
          <span className="sr-only">Restaurar uma cópia</span>
          <input type="file" accept="application/json,.json" onChange={aoEscolherArquivo} className="sr-only" />
          <span aria-hidden="true" className="w-full min-h-12 rounded-xl border-2 border-polo-navy bg-white text-polo-navy font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer">
            <Icon name="saidas" size={18} />Restaurar uma cópia
          </span>
        </label>
      </div>

    </div>
  );
}
