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

  return (
    <div className="cartao">
      {/* ⚠️ <h2>, NÃO <p> em negrito. A Administração tem quatro telas de
          rolagem; para quem enxerga tanto faz, mas quem usa leitor de tela
          navega justamente pulando de título em título — e sem títulos de
          verdade não há como. A aparência é a mesma. */}
      <h2 className="text-sm font-bold text-polo-navy">Suporte remoto</h2>
      {suporteAtivo ? (
        <>
          <p className="text-xs text-green-700 mt-0.5">
            Suporte autorizado — expira em ~{restante}h.{' '}
            <strong>{prefs.suportePermissao === 'mexer' ? 'Pode ver e EDITAR' : 'Somente visualização'}</strong> dos seus dados.
          </p>
          <button onClick={revogar}
            className="mt-3 w-full bg-red-100 text-red-700 font-bold px-3 py-2.5 rounded-lg text-xs">Revogar acesso</button>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500 mt-0.5">
            Libera o suporte Aurum na sua conta por 24 h: só olhar, ou também corrigir.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => autorizar('ver')}
              className="bg-polo-navy text-polo-gold font-bold px-3 min-h-12 rounded-xl text-sm">
              Só visualizar (24h)
            </button>
            <button onClick={() => autorizar('mexer')}
              className="border-2 border-polo-navy text-polo-navy font-bold px-3 min-h-12 rounded-xl text-sm">
              Ver e editar (24h)
            </button>
          </div>
        </>
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
        <h2 className="text-sm font-bold text-polo-navy">Armazenamento</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          O nome e a faixa saem na etiqueta; cada item tem um prazo em cada um.
        </p>
      </div>

      {/* ⚠️ Aviso deliberado: a temperatura correta é responsabilidade sanitária
          do estabelecimento, varia por produto e por exigência da vigilância
          local. Estes valores são ponto de partida, e quem confere é o
          responsável técnico — não o app. */}
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
        As faixas abaixo já vêm preenchidas como sugestão. <strong>Confira com o seu
        responsável técnico</strong> e ajuste ao que a vigilância local exige — é essa
        temperatura que vai impressa na etiqueta.
      </p>

      <div className="space-y-2">
        {lista.map(a => (
          <div key={a.id} className="border border-gray-200 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input type="text" value={a.nome} onChange={e => editar(a.id, 'nome', e.target.value)}
                aria-label={`Nome do armazenamento ${a.nome}`}
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold" />
              {a.fixo ? (
                // congelado e resfriado não podem ser removidos: os ids deles
                // estão gravados no histórico de toda conta que já usou o app
                <span className="text-xs text-gray-700 bg-gray-100 rounded-full px-2 py-1 flex-shrink-0">fixo</span>
              ) : (
                <button onClick={() => remover(a)} aria-label={`Remover ${a.nome}`}
                  className="text-red-700 text-sm font-bold px-3 min-h-12 flex-shrink-0">Remover</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={`arm-faixa-${a.id}`} className="text-xs text-gray-600 flex-shrink-0">Temperatura</label>
              <input id={`arm-faixa-${a.id}`} type="text" value={a.faixa || ''} maxLength={MAX_FAIXA}
                onChange={e => editar(a.id, 'faixa', e.target.value)}
                placeholder="ex.: -18°C a -12°C"
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
          </div>
        ))}
      </div>

      {/* O limite existe por causa do papel, não por capricho — ver MAX_FAIXA */}
      <p className="text-xs text-gray-500">
        A temperatura cabe em {MAX_FAIXA} caracteres: acima disso ela empurraria o rodapé da
        etiqueta (nome e endereço) para fora do papel.
      </p>

      <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
        <input type="text" value={novo} onChange={e => setNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') adicionar(); }}
          placeholder="Novo armazenamento (ex.: Estufa)"
          aria-label="Nome do novo armazenamento"
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
        <Botao onClick={adicionar} tamanho="sm" largura="auto">Adicionar</Botao>
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
        <h2 className="text-sm font-bold text-polo-navy">Estados de conservação</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Como “pista fria”: sai junto do armazenamento (RESFRIADO · PISTA FRIA).
        </p>
      </div>
      {lista.length === 0 && (
        <p className="text-xs text-gray-600">Nenhum estado. Os itens usam só o armazenamento.</p>
      )}
      <div className="space-y-2">
        {lista.map(e => (
          <div key={e.id} className="flex items-center gap-2">
            <input type="text" value={e.nome} maxLength={MAX_NOME_ESTADO}
              onChange={ev => editar(e.id, ev.target.value)}
              aria-label={`Nome do estado ${e.nome}`}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-semibold" />
            <button onClick={() => remover(e)} aria-label={`Remover ${e.nome}`}
              className="text-red-700 text-sm font-bold px-3 min-h-12 flex-shrink-0">Remover</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        O nome cabe em {MAX_NOME_ESTADO} letras: ele divide a linha com o armazenamento e a temperatura.
      </p>
      <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
        <input type="text" value={novo} maxLength={MAX_NOME_ESTADO} onChange={e => setNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') adicionar(); }}
          placeholder="Novo estado (ex.: Buffet)"
          aria-label="Nome do novo estado"
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
        <Botao onClick={adicionar} tamanho="sm" largura="auto">Adicionar</Botao>
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
        <h2 className="text-sm font-bold text-polo-navy">Etiquetas</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          O que aparece na etiqueta impressa.
        </p>
      </div>
      <div className="flex items-center justify-between bg-polo-beige rounded-lg px-3 py-2">
        <div>
          <p className="text-xs font-semibold text-polo-navy">Rolo 60 × 50 mm</p>
          <p className="text-xs text-gray-600">Tamanho único do sistema.</p>
        </div>
        <span className="text-xs text-gray-600">Tomate MDK-022</span>
      </div>
      {/* ⚠️ QR só no plano COMPLETO. No plano Etiquetas ele não tem consumidor:
          quem lê o código é a contagem por câmera do Inventário, tela que só
          existe no completo. O conteúdo é texto simples, então a câmera do
          celular apenas MOSTRA o texto — não abre nada. Ali ele ocupava espaço
          na etiqueta e travava o botão Imprimir em "Gerando QR…" de graça. */}
      {mostrarQR && <>
      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <div>
          <p className="text-xs font-semibold text-gray-600">QR code na etiqueta</p>
          <p className="text-xs text-gray-600">Para dar baixa lendo a etiqueta (saída, perda, usado) e contar no Inventário.</p>
        </div>
        <Chave rotulo="QR code na etiqueta" ligada={!!cfg.incluirQR}
          aoTrocar={() => { salvar({ incluirQR: !cfg.incluirQR }); toast(!cfg.incluirQR ? 'QR code LIGADO nas etiquetas.' : 'QR code desligado.', 'sucesso'); }} />
      </div>
      </>}
      <div className="border-t border-gray-100 pt-3">
        {/* ⚠️ AS CAIXINHAS TINHAM 16px, abaixo do mínimo de 24 da WCAG 2.5.8 —
            e são justamente os controles que decidem o que sai IMPRESSO no
            pote, tocados com o dedo numa bancada de cozinha. Passaram para 24,
            e a linha inteira virou alvo de 44px (`min-h-12`): o <label> já
            envolve o input, então tocar no texto marca a caixa. */}
        <p className="text-xs font-semibold text-gray-600 mb-2">Campos que aparecem na etiqueta</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {CAMPOS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-gray-700 min-h-12 cursor-pointer">
              <input type="checkbox" checked={cfg.campos[k] !== false} onChange={() => toggleCampo(k)}
                className="w-6 h-6 accent-[#1B2A41] flex-shrink-0" />
              {label}
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-2">O nome do produto sempre aparece.</p>

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
    <div className="cartao space-y-3">
      <div>
        <h2 className="text-sm font-bold text-polo-navy">Dados do estabelecimento</h2>
        <p className="text-xs text-gray-600 mt-0.5">
          Saem no rodapé da etiqueta: quem manipulou o alimento, para a fiscalização.
        </p>
      </div>
      <DadosDoEstabelecimento prefs={prefs} setPref={setPref}
        toast={toast} nomeRestaurante={nomeRestaurante} cnpjDaConta={cnpjDaConta} />
    </div>
  );
}

/**
 * Dados do estabelecimento — o rodapé da etiqueta. Moram em
 * `prefs.estabelecimento`; nome e CNPJ vêm do cadastro e só a Aurum muda.
 * (As unidades extras da M46, com dados no banco, saíram em 24/11/2026.)
 */
function DadosDoEstabelecimento({ prefs, setPref, toast, nomeRestaurante, cnpjDaConta }) {
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
  const cnpj = cnpjDaConta;
  const campo = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs disabled:bg-gray-50';

  return (
    <div className="space-y-2">
      {/* ⚠️ O NOME É SÓ LEITURA AQUI, de propósito. Ele identifica a conta no
          contrato, na cobrança e no painel de suporte — conta que se renomeia
          sozinha vira outra conta para quem atende. A troca existe, passa
          pela Aurum, e o caminho está escrito em vez de a pessoa concluir
          que o campo "faltou". */}
      <div className="bg-gray-50 rounded-lg px-3 py-2">
        <p className="text-xs text-gray-600">Nome do estabelecimento</p>
        <p className="text-sm font-semibold text-polo-navy">{nome || '—'}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {/* ⚠️ CNPJ NÃO SE EDITA AQUI. Ele vem do cadastro da conta e é o que
            sai IMPRESSO no rodapé da etiqueta — o dado que
            identifica quem manipulou o alimento para a fiscalização. Enquanto
            era um campo livre, um erro de digitação (ou uma troca por engano)
            circulava colado no pote, e ninguém tinha como saber que estava
            errado. Mudar passa pela Aurum, como o nome do estabelecimento. */}
        <div>
          <p className="text-xs text-gray-500 mb-0.5">CNPJ</p>
          <p className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700">
            {cnpj ? formatarCNPJ(cnpj) : '—'}
          </p>
        </div>
        <div>
          <label htmlFor="est-cep" className="block text-xs text-gray-500 mb-0.5">CEP</label>
          <input id="est-cep" type="text" value={local.cep || ''} placeholder="00000-000"
            onChange={e => setLocal(p => ({ ...p, cep: e.target.value }))} className={campo} />
        </div>
      </div>
      <p className="text-xs text-gray-600">Para trocar o nome ou o CNPJ: <strong>Ajuda → Pedido</strong>.</p>
      <div>
        <label htmlFor="est-end" className="block text-xs text-gray-500 mb-0.5">Endereço</label>
        <input id="est-end" type="text" value={local.endereco || ''} placeholder="Rua, número"
          onChange={e => setLocal(p => ({ ...p, endereco: e.target.value }))} className={campo} />
      </div>
      <div>
        <label htmlFor="est-cid" className="block text-xs text-gray-500 mb-0.5">Cidade - UF</label>
        <input id="est-cid" type="text" value={local.cidade || ''} placeholder="Recife - PE"
          onChange={e => setLocal(p => ({ ...p, cidade: e.target.value }))} className={campo} />
      </div>
      <button onClick={salvar}
        className="w-full min-h-12 bg-polo-navy text-polo-gold font-bold py-2.5 rounded-xl text-sm">
        Salvar dados do estabelecimento
      </button>
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
        <h2 className="text-sm font-bold text-polo-navy">Meus dados</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Itens, prazos, equipe e configurações num arquivo só, que fica com você.
        </p>
      </div>

      <button onClick={() => { exportarBackup(); toast('Cópia baixada.', 'sucesso'); }}
        className="w-full border-2 border-polo-navy/20 text-polo-navy font-bold text-sm py-2.5 rounded-xl min-h-12">
        ↓ Baixar uma cópia
      </button>

      {/* ⚠️ O input fica escondido atrás do label porque input de arquivo não
          aceita estilo: sem isto, o botão sai com a cara do navegador, em
          inglês, no meio de uma tela em português. */}
      <label className="block">
        <span className="sr-only">Restaurar uma cópia</span>
        <input type="file" accept="application/json,.json" onChange={aoEscolherArquivo} className="hidden" />
        <span className="block w-full text-center border-2 border-polo-navy/15 text-gray-600 font-semibold text-sm py-2.5 rounded-xl min-h-12 cursor-pointer leading-6">
          ↑ Restaurar uma cópia
        </span>
      </label>

    </div>
  );
}
