// Cartoes de Configuracao compartilhados.
//
// ⚠️ Estes tres viviam DENTRO de Configuracoes.jsx como funcoes internas. O
// plano Aurum Etiquetas tem tela de Ajustes propria e precisa dos mesmos
// cartoes; copiar ~250 linhas faria as duas versoes divergirem, que e o
// defeito ja registrado nas abas daquele arquivo (a lista de botoes era
// escrita de novo la embaixo, e as duas divergiram).
import { useState } from 'react';
import Botao from '../Botao';
import { configEtiqueta } from '../../utils/etiquetas';
import { listarArmazenamentos, MAX_FAIXA, ARMAZENAMENTOS_PADRAO } from '../../utils/armazenamento';

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
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <p className="text-sm font-bold text-polo-navy">Suporte remoto</p>
      {suporteAtivo ? (
        <>
          <p className="text-xs text-green-700 mt-0.5">
            ✅ Suporte autorizado — expira em ~{restante}h.{' '}
            <strong>{prefs.suportePermissao === 'mexer' ? 'Pode ver e EDITAR' : 'Somente visualização'}</strong> dos seus dados.
          </p>
          <button onClick={revogar}
            className="mt-3 w-full bg-red-100 text-red-700 font-bold px-3 py-2.5 rounded-lg text-xs">Revogar acesso</button>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500 mt-0.5">
            Libera o suporte (Aurum) a acessar sua conta por 24h para ajudar com problemas.
            Você escolhe se ele pode só olhar ou também corrigir dados por você.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => autorizar('ver')}
              className="bg-polo-navy text-polo-gold font-bold px-3 py-2.5 rounded-lg text-xs">
              👁️ Só visualizar (24h)
            </button>
            <button onClick={() => autorizar('mexer')}
              className="border-2 border-polo-navy text-polo-navy font-bold px-3 py-2.5 rounded-lg text-xs">
              ✏️ Ver e editar (24h)
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
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-polo-navy">Armazenamento</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Como os itens são guardados na sua casa. O nome e a faixa saem impressos na etiqueta,
          e cada produto tem um prazo de validade por armazenamento.
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
                <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-1 flex-shrink-0">fixo</span>
              ) : (
                <button onClick={() => remover(a)} aria-label={`Remover ${a.nome}`}
                  className="text-red-700 text-xs font-bold px-2 py-1.5 flex-shrink-0">Remover</button>
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
      <p className="text-[11px] text-gray-500">
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

export function CartaoEtiquetas({ prefs, setPref, toast, mostrarQR = true, nomeRestaurante = '' }) {
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
    ['responsavel', 'Responsável'],
  ];

  // Dados do estabelecimento (rodapé da etiqueta) — prefs.estabelecimento
  const est = prefs.estabelecimento || {};
  const [estLocal, setEstLocal] = useState(est);
  const salvarEst = () => {
    const limpo = Object.fromEntries(Object.entries(estLocal).map(([k, v]) => [k, (v || '').trim()]));
    setPref('estabelecimento', limpo);
    toast('Dados do estabelecimento salvos.', 'sucesso');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-polo-navy">Etiquetas</p>
        <p className="text-xs text-gray-500 mt-0.5">
          O que aparece na etiqueta impressa.
        </p>
      </div>
      <div className="flex items-center justify-between bg-polo-beige rounded-lg px-3 py-2">
        <div>
          <p className="text-xs font-semibold text-polo-navy">Rolo 60 × 50 mm</p>
          <p className="text-[11px] text-gray-600">Tamanho único do sistema.</p>
        </div>
        <span className="text-[11px] text-gray-600">Tomate MDK-022</span>
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
          <p className="text-[11px] text-gray-600">Para a contagem por câmera no Inventário.</p>
        </div>
        <button role="switch" aria-checked={!!cfg.incluirQR}
          onClick={() => { salvar({ incluirQR: !cfg.incluirQR }); toast(!cfg.incluirQR ? 'QR code LIGADO nas etiquetas.' : 'QR code desligado.', 'sucesso'); }}
          className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${cfg.incluirQR ? 'bg-green-500' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.incluirQR ? 'left-6' : 'left-0.5'}`} />
        </button>
      </div>
      </>}
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-600 mb-2">Campos que aparecem na etiqueta</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {CAMPOS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={cfg.campos[k] !== false} onChange={() => toggleCampo(k)}
                className="w-4 h-4 accent-[#1B2A41]" />
              {label}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-gray-600 mt-2">O nome do produto sempre aparece.</p>
      </div>
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600">Dados do estabelecimento (rodapé da etiqueta)</p>
        {/* ⚠️ O NOME É SÓ LEITURA AQUI, de propósito. Ele identifica a conta no
            contrato, na cobrança e no painel de suporte — conta que se renomeia
            sozinha vira outra conta para quem atende. A troca existe, passa
            pela Aurum, e o caminho está escrito em vez de a pessoa concluir
            que o campo "faltou". */}
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-[11px] text-gray-600">Nome do estabelecimento</p>
          <p className="text-sm font-semibold text-polo-navy">{nomeRestaurante || '—'}</p>
          <p className="text-[11px] text-gray-600 mt-1">
            Sai impresso na etiqueta. Para trocar, use <strong>Ajuda → Pedido</strong> no topo da
            tela — a equipe Aurum confere e muda.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="est-cnpj" className="block text-[11px] text-gray-500 mb-0.5">CNPJ</label>
            <input id="est-cnpj" type="text" value={estLocal.cnpj || ''} placeholder="00.000.000/0001-00"
              onChange={e => setEstLocal(p => ({ ...p, cnpj: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label htmlFor="est-cep" className="block text-[11px] text-gray-500 mb-0.5">CEP</label>
            <input id="est-cep" type="text" value={estLocal.cep || ''} placeholder="00000-000"
              onChange={e => setEstLocal(p => ({ ...p, cep: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          </div>
        </div>
        <div>
          <label htmlFor="est-end" className="block text-[11px] text-gray-500 mb-0.5">Endereço</label>
          <input id="est-end" type="text" value={estLocal.endereco || ''} placeholder="Rua, número"
            onChange={e => setEstLocal(p => ({ ...p, endereco: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label htmlFor="est-cid" className="block text-[11px] text-gray-500 mb-0.5">Cidade - UF</label>
          <input id="est-cid" type="text" value={estLocal.cidade || ''} placeholder="Recife - PE"
            onChange={e => setEstLocal(p => ({ ...p, cidade: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
        </div>
        <button onClick={salvarEst}
          className="w-full bg-polo-navy text-polo-gold font-bold py-2.5 rounded-lg text-xs">Salvar dados do estabelecimento</button>
      </div>
    </div>
  );
}

/**
 * Quem tem acesso ao app — convites e usuários.
 *
 * ⚠️ EXISTIA SÓ NO PLANO COMPLETO, e isso deixava o Aurum Etiquetas sem como
 * colocar a equipe para dentro: a conta dona era a única que conseguia entrar,
 * e quem etiqueta no dia a dia não é quem assina o contrato. O código de
 * convite é o único caminho de cadastro que não passa por criar restaurante
 * novo — sem esta tela, o plano menor era conta de uma pessoa só.
 *
 * ⚠️ NÃO CONFUNDIR COM "RESPONSÁVEIS". Aquele é o nome que sai IMPRESSO no
 * campo RESP. da etiqueta e não tem login nenhum. Este é quem entra no app com
 * e-mail e senha. São listas diferentes de propósito: a cozinheira do turno da
 * noite assina etiqueta sem precisar de acesso ao sistema.
 */
export function CartaoAcessos({ sessao, usuarios, convites, criarConvite, revogarConvite, cargos, toast, confirm }) {
  const [cargo, setCargo] = useState('cozinha');
  const [gerado, setGerado] = useState(null);
  const [gerando, setGerando] = useState(false);

  const ativos = (usuarios || []).filter(u => u.ativo !== false);
  const max = sessao?.maxUsuarios || 3;
  // Cada convite pendente RESERVA uma vaga: sem contá-lo, dois códigos gerados
  // no mesmo dia estourariam o limite e o segundo falharia só na hora do
  // cadastro — com a pessoa já com o código na mão.
  const vagas = Math.max(0, max - ativos.length - (convites || []).length);

  const gerar = async () => {
    if (vagas <= 0) {
      toast(`Sem vagas: ${ativos.length} pessoa(s) e ${(convites || []).length} convite(s) pendente(s), de ${max}.`, 'aviso');
      return;
    }
    setGerando(true);
    const token = await criarConvite(cargo);
    setGerando(false);
    if (!token) { toast('Não consegui gerar o convite agora.', 'erro'); return; }
    setGerado({ token, cargo });
    toast('Convite gerado. Passe o código para a pessoa.', 'sucesso');
  };

  const copiar = async (texto, oque) => {
    try { await navigator.clipboard.writeText(texto); toast(`${oque} copiado.`, 'sucesso'); }
    catch { toast('Copie manualmente.', 'aviso'); }
  };

  const tirar = async (token) => {
    const ok = await confirm({
      titulo: 'Cancelar este convite?',
      mensagem: 'O código para de funcionar. Quem ainda não usou vai precisar de outro.',
      perigo: true, confirmar: 'Cancelar convite',
    });
    if (!ok) return;
    const erro = await revogarConvite(token);
    toast(erro ? `Erro: ${erro}` : 'Convite cancelado.', erro ? 'erro' : 'sucesso');
  };

  const link = (t) => `${window.location.origin}${import.meta.env.BASE_URL}?convite=${t}`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-polo-navy">Quem tem acesso</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Quem entra no app com e-mail e senha. Diferente dos responsáveis, que só assinam a etiqueta.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ativos.length === 0
          ? <p className="text-xs text-gray-600 italic">Só você, por enquanto.</p>
          : ativos.map(u => (
            <span key={u.id} className="inline-flex items-center gap-1.5 bg-polo-beige text-polo-navy text-xs font-semibold rounded-full px-3 py-1.5">
              {u.nome || '(sem nome)'}
              <span className="font-normal text-gray-600">· {cargos.find(c => c.id === u.cargo)?.label || u.cargo}</span>
            </span>
          ))}
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600">
          Convidar alguém <span className="font-normal text-gray-500">· {vagas} vaga(s) de {max}</span>
        </p>
        <div className="flex gap-2">
          <select value={cargo} onChange={e => setCargo(e.target.value)} aria-label="Cargo do convidado"
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white">
            {cargos.filter(c => c.id !== 'diretoria').map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <Botao onClick={gerar} tamanho="sm" largura="auto" disabled={gerando || vagas <= 0}>
            {gerando ? 'Gerando…' : 'Gerar código'}
          </Botao>
        </div>

        {gerado && (
          <div className="bg-polo-beige rounded-lg p-3 space-y-2">
            <p className="text-[11px] text-gray-600">Código de convite</p>
            <p className="text-lg font-bold tracking-widest text-polo-navy break-all">{gerado.token}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copiar(gerado.token, 'Código')}
                className="text-[11px] font-bold text-polo-navy border border-polo-navy/30 rounded-lg px-2.5 py-1">Copiar código</button>
              {/* O link já abre o app com o código preenchido — um passo a menos
                  para quem vai receber pelo WhatsApp. */}
              <button onClick={() => copiar(link(gerado.token), 'Link')}
                className="text-[11px] font-bold text-polo-navy border border-polo-navy/30 rounded-lg px-2.5 py-1">Copiar link</button>
            </div>
            <p className="text-[11px] text-gray-600">
              A pessoa abre o app, toca em “Tenho um código de convite” e escolhe a própria senha.
            </p>
          </div>
        )}

        {(convites || []).length > 0 && (
          <div className="space-y-1 pt-1">
            <p className="text-[11px] font-semibold text-gray-600">Convites ainda não usados</p>
            {convites.map(c => (
              <div key={c.token} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-gray-700 truncate">{c.token}</span>
                <button onClick={() => tirar(c.token)}
                  className="text-[11px] font-semibold text-red-700 flex-shrink-0">cancelar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
