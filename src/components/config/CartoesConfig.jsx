// Cartoes de Configuracao compartilhados.
//
// ⚠️ Estes tres viviam DENTRO de Configuracoes.jsx como funcoes internas. O
// plano Aurum Etiquetas tem tela de Ajustes propria e precisa dos mesmos
// cartoes; copiar ~250 linhas faria as duas versoes divergirem, que e o
// defeito ja registrado nas abas daquele arquivo (a lista de botoes era
// escrita de novo la embaixo, e as duas divergiram).
import { useState, useEffect } from 'react';
import Botao from '../Botao';
import { configEtiqueta } from '../../utils/etiquetas';
import { listarArmazenamentos, MAX_FAIXA, ARMAZENAMENTOS_PADRAO } from '../../utils/armazenamento';
import { formatarCNPJ } from '../../utils/documentos';
import { CAPACIDADES, PERMISSOES_PADRAO, cargosDaCasa, capacidadesDoProduto } from '../../utils/permissoes';

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

export function CartaoEtiquetas({ prefs, setPref, toast, mostrarQR = true, nomeRestaurante = '', cnpjDaConta = '' }) {
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

  // Dados do estabelecimento (rodapé da etiqueta) — prefs.estabelecimento
  const est = prefs.estabelecimento || {};
  const [estLocal, setEstLocal] = useState(est);
  const salvarEst = () => {
    // ⚠️ O CNPJ SAI DAQUI NA GRAVAÇÃO. Contas que editaram esse campo quando
    // ele era livre têm um valor guardado; deixá-lo passar faria o número
    // antigo continuar indo para a etiqueta mesmo com o campo já travado.
    const { cnpj: _ignorado, ...semCnpj } = estLocal;
    const limpo = Object.fromEntries(Object.entries(semCnpj).map(([k, v]) => [k, (v || '').trim()]));
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

        {/* ⚠️ NÃO É UM CAMPO, É UMA REGRA — por isso fica fora da grade acima.
            Veio de um lote impresso com o RESP. em branco, percebido tarde
            demais: rolo gasto e trabalho refeito. Onde a etiqueta é documento
            sanitário isso não é opcional; onde é só identificação, exigir
            atrapalha. Quem decide é a casa. */}
        <label className="flex items-start gap-2 text-xs text-gray-700 mt-3 pt-3 border-t border-gray-100">
          <input type="checkbox" checked={cfg.exigirResponsavel === true}
            onChange={() => setPref('etiquetaConfig', { ...cfg, exigirResponsavel: cfg.exigirResponsavel !== true })}
            className="w-4 h-4 accent-[#1B2A41] mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-semibold">Exigir o responsável para imprimir</span>
            <span className="block text-[11px] text-gray-600">
              Sem alguém escolhido no campo RESP., o botão de imprimir não libera.
            </span>
          </span>
        </label>
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
          {/* ⚠️ CNPJ NÃO SE EDITA AQUI. Ele vem do cadastro da conta e é o que sai
              IMPRESSO no rodapé da etiqueta — o dado que identifica quem
              manipulou o alimento para a fiscalização. Enquanto era um campo
              livre, um erro de digitação (ou uma troca por engano) circulava
              colado no pote, e ninguém tinha como saber que estava errado.
              Mudar passa pela Aurum, como o nome do estabelecimento. */}
          <div>
            <p className="text-[11px] text-gray-500 mb-0.5">CNPJ</p>
            <p className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700">
              {cnpjDaConta ? formatarCNPJ(cnpjDaConta) : '—'}
            </p>
          </div>
          <div>
            <label htmlFor="est-cep" className="block text-[11px] text-gray-500 mb-0.5">CEP</label>
            <input id="est-cep" type="text" value={estLocal.cep || ''} placeholder="00000-000"
              onChange={e => setEstLocal(p => ({ ...p, cep: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          </div>
        </div>
        <p className="text-[11px] text-gray-600">
          O CNPJ vem do cadastro e não muda por aqui — ele identifica quem manipulou o alimento.
          Para corrigir, use <strong>Ajuda → Pedido</strong>.
        </p>
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
 * Contas da equipe — o dono cria, entrega e continua no comando.
 *
 * ⚠️ SUBSTITUIU O CÓDIGO DE CONVITE. O convite obrigava a pessoa a ter e-mail
 * próprio, se cadastrar sozinha e escolher a própria senha — e o dono ficava
 * sem controle depois disso: não podia trocar a senha de quem esqueceu.
 *
 * ⚠️ A CONTA NÃO É UMA PESSOA, é um acesso. O dono pode criar "chef",
 * "cozinha", "noite" — e é comum que crie. Por isso não há campo de nome: o
 * usuário É o nome da conta. Pedir os dois obrigava a inventar um nome de
 * gente para um acesso que é de posto de trabalho.
 *
 * ⚠️ NÃO CONFUNDIR COM "RESPONSÁVEIS": aquele é o nome que sai IMPRESSO no
 * campo RESP. da etiqueta e não tem login.
 */
export function CartaoContas({
  sessao, usuarios, cargos, criarConta, trocarSenhaDe, removerConta,
  desativarUsuario, reativarUsuario, definirApelido, toast, confirm,
  // ⚠️ O plano completo já tem a própria lista de usuários, com troca de
  // cargo. Repetir a lista aqui mostraria as mesmas pessoas duas vezes na
  // mesma tela, com botões diferentes em cada — o tipo de coisa que faz
  // duvidar de qual das duas é a de verdade.
  mostrarLista = true,
}) {
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({ usuario: '', senha: '', cargo: 'cozinha' });
  const [ocupado, setOcupado] = useState(false);
  const [novaSenha, setNovaSenha] = useState(null); // { id, valor }

  const ativos = (usuarios || []).filter(u => u.ativo !== false);
  const max = sessao?.maxUsuarios || 3;
  const vagas = Math.max(0, max - ativos.length);
  const casa = sessao?.apelido || '';
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';

  const limpar = (t) => String(t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  // ⚠️ O APELIDO NÃO É PERGUNTADO. Ele saía como um campo a mais que o dono
  // preenchia sem entender para quê — e escolhia mal. Vem do NOME DO
  // RESTAURANTE que ele já cadastrou, que é o que ele reconhece.
  //
  // ⚠️ Só se ajusta enquanto NÃO HÁ conta de equipe: o apelido é a segunda
  // metade do login de todo mundo, e mudá-lo depois invalidaria o acesso de
  // quem já entra — sem aviso, no meio do serviço.
  const semEquipe = (usuarios || []).every(u => u.cargo === 'diretoria');
  const derivado = limpar(sessao?.restauranteNome).slice(0, 20);
  useEffect(() => {
    // Na demonstração nada fala com o banco: tentar salvar aqui gastaria
    // quatro chamadas que falham em silêncio a cada abertura da tela.
    if (sessao?.demo) return;
    if (!derivado || derivado.length < 3) return;
    if (casa === derivado) return;
    if (!semEquipe) return;
    let vivo = true;
    (async () => {
      // Nome de casa repetido existe (duas "Sabor Caseiro"): tenta variações
      // antes de desistir, em vez de deixar o dono travado sem entender.
      for (const tentativa of [derivado, `${derivado}2`, `${derivado}3`, `${derivado}4`]) {
        const r = await definirApelido(tentativa);
        if (!vivo || !r.erro) return;
      }
    })();
    return () => { vivo = false; };
  }, [derivado, casa, semEquipe, definirApelido, sessao?.demo]);

  const criar = async () => {
    const usuario = limpar(form.usuario);
    setOcupado(true);
    const r = await criarConta({
      // O usuário serve de nome da conta: não há duas coisas para inventar.
      nome: usuario, usuario, senha: form.senha, cargo: form.cargo,
      cargoRotulo: cargos.find(c => c.id === form.cargo)?.nome || null,
    });
    setOcupado(false);
    if (r.erro) { toast(r.erro, 'erro'); return; }
    setCriando(false);
    setForm({ usuario: '', senha: '', cargo: 'cozinha' });
    toast(`Conta criada. Login: ${r.login}`, 'sucesso', { duracao: 9000 });
  };

  const trocar = async (u) => {
    const senha = (novaSenha?.valor || '').trim();
    if (senha.length < 6) { toast('A senha precisa de ao menos 6 caracteres.', 'aviso'); return; }
    setOcupado(true);
    const r = await trocarSenhaDe(u.id, senha);
    setOcupado(false);
    if (r.erro) { toast(r.erro, 'erro'); return; }
    setNovaSenha(null);
    toast(`Senha de ${u.usuario || u.nome} trocada. Avise quem usa.`, 'sucesso', { duracao: 8000 });
  };

  const remover = async (u) => {
    const ok = await confirm({
      titulo: `Apagar a conta ${u.usuario || u.nome}?`,
      // ⚠️ Diz o que NÃO some. Sem isto, "apagar a conta" lê como "apagar o que
      // ela fez" — e ninguém apaga, com medo de perder o histórico.
      mensagem: 'O acesso acaba na hora. O que foi registrado e as etiquetas impressas continuam como estão.\n\nSe for afastamento temporário, use Bloquear.',
      perigo: true, confirmar: 'Apagar conta',
    });
    if (!ok) return;
    const r = await removerConta(u.id);
    toast(r.erro || 'Conta apagada.', r.erro ? 'erro' : 'sucesso');
  };

  const alternarBloqueio = async (u) => {
    const quem = u.usuario || u.nome;
    if (u.ativo === false) { await reativarUsuario(u.id); toast(`${quem} liberado.`, 'sucesso'); return; }
    const ok = await confirm({
      titulo: `Bloquear ${quem}?`,
      mensagem: 'A conta para de entrar até você liberar. Nada é apagado, e a vaga continua ocupada.',
      confirmar: 'Bloquear',
    });
    if (!ok) return;
    await desativarUsuario(u.id);
    toast(`${quem} bloqueado.`, 'sucesso');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-polo-navy">Contas da equipe</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Quem entra no app. Pode ser uma pessoa ou um posto — “chef”, “cozinha”, “noite”.
        </p>
      </div>

      {casa && (
        <p className="text-[11px] text-gray-600">
          Os logins desta casa terminam em <strong className="text-polo-navy">.{casa}</strong>
          {semEquipe ? '' : ' — não muda mais, para não derrubar quem já entra.'}
        </p>
      )}

      <div className={`space-y-1.5 ${mostrarLista ? '' : 'hidden'}`}>
        {(usuarios || []).map(u => {
          const ehEu = u.id === sessao?.usuarioId;
          const dono = u.cargo === 'diretoria';
          const quem = u.usuario || u.nome;
          return (
            <div key={u.id} className={`border rounded-lg p-2.5 ${u.ativo === false ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {quem}{u.ativo === false && <span className="text-[11px] font-normal text-gray-500"> · bloqueado</span>}
                  </p>
                  <p className="text-[11px] text-gray-600">
                    {u.cargo_rotulo || cargos.find(c => c.id === u.cargo)?.nome || u.cargo}
                    {u.usuario && casa ? ` · entra como ${u.usuario}.${casa}` : ''}
                  </p>
                </div>
                {/* A conta dona não se mexe por aqui: é quem paga e quem
                    administra as outras. Uma casa sem ela fica sem comando. */}
                {!dono && !ehEu && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => setNovaSenha({ id: u.id, valor: '' })}
                      className="text-[11px] font-semibold text-polo-navy border border-gray-300 rounded px-2 py-1">senha</button>
                    <button onClick={() => alternarBloqueio(u)}
                      className="text-[11px] font-semibold text-gray-600 border border-gray-300 rounded px-2 py-1">
                      {u.ativo === false ? 'liberar' : 'bloquear'}
                    </button>
                    <button onClick={() => remover(u)}
                      className="text-[11px] font-semibold text-red-700 border border-red-200 rounded px-2 py-1">apagar</button>
                  </div>
                )}
              </div>
              {novaSenha?.id === u.id && (
                <div className="mt-2 flex gap-2">
                  <input type="text" value={novaSenha.valor} autoFocus minLength={6}
                    onChange={e => setNovaSenha({ id: u.id, valor: e.target.value })}
                    placeholder="Nova senha (mín. 6)" aria-label={`Nova senha de ${quem}`}
                    className={`${inputCls} flex-1 min-w-0`} />
                  <Botao onClick={() => trocar(u)} tamanho="sm" largura="auto" disabled={ocupado}>Trocar</Botao>
                  <button onClick={() => setNovaSenha(null)} className="text-[11px] text-gray-600 px-1">cancelar</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-100 pt-3">
        {!criando ? (
          <Botao onClick={() => setCriando(true)} disabled={!casa || vagas <= 0} tamanho="sm">
            + Criar conta {vagas > 0 ? `(${vagas} vaga${vagas > 1 ? 's' : ''})` : '— sem vagas'}
          </Botao>
        ) : (
          <div className="space-y-2">
            <div>
              <input value={form.usuario} onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))}
                placeholder="Usuário" aria-label="Usuário" className={inputCls} autoFocus />
              {form.usuario && (
                <p className="text-[11px] text-gray-600 mt-1">
                  Entra como <strong className="text-polo-navy">{limpar(form.usuario)}.{casa}</strong>
                </p>
              )}
            </div>
            <input type="text" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
              placeholder="Senha inicial (mín. 6)" aria-label="Senha inicial" className={inputCls} />
            <select value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
              aria-label="Cargo" className={`${inputCls} bg-white`}>
              {cargos.filter(c => c.base !== 'diretoria').map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {/* ⚠️ A senha aparece em texto: quem digita é o DONO, para outra
                pessoa, e ele precisa anotar. Esconder aqui só faria ele errar
                e não saber o que entregar. */}
            <p className="text-[11px] text-gray-600">
              Anote a senha antes de salvar — você entrega ela a quem vai usar, e depois só dá para trocar por outra.
            </p>
            <div className="flex gap-2">
              <Botao onClick={criar} disabled={ocupado || !form.usuario.trim()} className="flex-1">
                {ocupado ? 'Criando…' : 'Criar conta'}
              </Botao>
              <button onClick={() => setCriando(false)} className="text-xs text-gray-600 px-3">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Cargos e acessos — quem pode o quê.
 *
 * ⚠️ O DONO INVENTA O NOME, MAS NÃO O NÍVEL. `cozinha`, `gerencia` e
 * `diretoria` estão numa trava da tabela de perfis e em mais de cem
 * verificações das regras de acesso do banco — são níveis de segurança. Cada
 * cargo criado aqui se apoia num deles, e é o NÍVEL que vai para o banco. Um
 * "Confeiteiro" apoiado em Cozinha não alcança nada que Cozinha não alcance,
 * por mais que a tela diga o contrário; por isso a escolha da base aparece na
 * hora de criar, e não como erro depois.
 *
 * ⚠️ DUAS PERMISSÕES SÃO DECIDIDAS PELO SERVIDOR (custos e valor da perda). Para
 * elas, quem manda é a exceção por CONTA — o banco não conhece cargo
 * inventado. Por isso, ao salvar, a tela grava a exceção de cada conta sempre
 * que o valor efetivo difere do que a base entrega. Sem isso o dono ligaria
 * "ver custos" num cargo criado por ele e o servidor continuaria recusando,
 * sem erro visível em lugar nenhum.
 */
export function CartaoCargos({ permissoes, setPermissoes, usuarios, soEtiquetas = false, toast, confirm }) {
  // ⚠️ Só o que EXISTE neste produto. A tela oferecia relatório, inventário e
  // custos no plano Etiquetas — ligar não mudava nada, e o dono ficava
  // procurando onde apareceria o relatório que acabou de liberar.
  const caps = capacidadesDoProduto(soEtiquetas);
  const [abrindo, setAbrindo] = useState('');      // id do cargo aberto
  const [novoNome, setNovoNome] = useState('');
  const [novaBase, setNovaBase] = useState('cozinha');
  const [criando, setCriando] = useState(false);

  const m = permissoes || {};
  const cargos = cargosDaCasa(m);
  const equipe = (usuarios || []).filter(u => u.cargo !== 'diretoria');
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';

  // Valor que vale hoje para um cargo, seguindo a mesma ordem do app.
  const valorDoCargo = (cargo, cap) => {
    if (cargo.base === 'diretoria') return true;
    const doRotulo = m[cargo.id] || {};
    if (doRotulo[cap] !== undefined) return !!doRotulo[cap];
    const daBase = m[cargo.base] || {};
    if (daBase[cap] !== undefined) return !!daBase[cap];
    return !!(PERMISSOES_PADRAO[cargo.base] || {})[cap];
  };
  const valorDaConta = (u, cap) => {
    const excecao = (m.porConta || {})[u.id] || {};
    if (excecao[cap] !== undefined) return !!excecao[cap];
    const cargo = cargos.find(c => c.id === (u.cargo_rotulo || u.cargo)) || { id: u.cargo, base: u.cargo };
    return valorDoCargo(cargo, cap);
  };

  // ⚠️ Sincroniza as travas DURAS depois de qualquer mudança: para elas o
  // servidor só olha a exceção por conta.
  const comSincronia = (base) => {
    const porConta = { ...(base.porConta || {}) };
    const cargosAgora = cargosDaCasa(base);
    for (const u of (usuarios || [])) {
      if (u.cargo === 'diretoria') continue;
      const cargo = cargosAgora.find(c => c.id === (u.cargo_rotulo || u.cargo)) || { id: u.cargo, base: u.cargo };
      const atual = { ...(porConta[u.id] || {}) };
      for (const cap of CAPACIDADES.filter(c => c.duro)) {
        const doRotulo = base[cargo.id] || {};
        const daBase = base[cargo.base] || {};
        const efetivo = atual[cap.id] !== undefined ? !!atual[cap.id]
          : doRotulo[cap.id] !== undefined ? !!doRotulo[cap.id]
          : daBase[cap.id] !== undefined ? !!daBase[cap.id]
          : !!(PERMISSOES_PADRAO[cargo.base] || {})[cap.id];
        atual[cap.id] = efetivo;
      }
      porConta[u.id] = atual;
    }
    return { ...base, porConta };
  };

  const salvar = (patch) => setPermissoes(comSincronia({ ...m, ...patch }));

  const mudarCargo = (cargo, cap, valor) =>
    salvar({ [cargo.id]: { ...(m[cargo.id] || {}), [cap]: valor } });

  const mudarConta = (u, cap, valor) =>
    salvar({ porConta: { ...(m.porConta || {}), [u.id]: { ...((m.porConta || {})[u.id] || {}), [cap]: valor } } });

  const limparConta = (u) => {
    const porConta = { ...(m.porConta || {}) };
    delete porConta[u.id];
    salvar({ porConta });
    toast('Exceções removidas — a conta volta a seguir o cargo.', 'sucesso');
  };

  const renomear = (cargo, nome) => {
    const lista = Array.isArray(m.cargos) ? [...m.cargos] : [];
    const i = lista.findIndex(c => c.id === cargo.id);
    if (i >= 0) lista[i] = { ...lista[i], nome };
    else lista.push({ id: cargo.id, nome, base: cargo.base });
    salvar({ cargos: lista });
  };

  const criar = () => {
    const nome = novoNome.trim();
    if (nome.length < 2) { toast('Escreva o nome do cargo.', 'aviso'); return; }
    const id = `c_${nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')}`;
    if (cargos.some(c => c.id === id)) { toast('Já existe um cargo com esse nome.', 'aviso'); return; }
    salvar({ cargos: [...(m.cargos || []), { id, nome, base: novaBase }] });
    setNovoNome(''); setCriando(false);
    toast(`Cargo "${nome}" criado.`, 'sucesso');
  };

  const apagar = async (cargo) => {
    const usando = (usuarios || []).filter(u => u.cargo_rotulo === cargo.id).length;
    const ok = await confirm({
      titulo: `Apagar o cargo "${cargo.nome}"?`,
      mensagem: usando
        ? `${usando} conta(s) usam este cargo e voltam para ${cargo.base === 'gerencia' ? 'Gerência' : 'Cozinha'}.`
        : 'Nenhuma conta usa este cargo.',
      perigo: true, confirmar: 'Apagar cargo',
    });
    if (!ok) return;
    salvar({ cargos: (m.cargos || []).filter(c => c.id !== cargo.id) });
  };

  const Chave = ({ ligado, onClick, id }) => (
    <button role="switch" aria-checked={ligado} aria-labelledby={id} onClick={onClick}
      className={`w-10 h-5 rounded-full relative flex-shrink-0 transition-colors ${ligado ? 'bg-green-500' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${ligado ? 'left-5' : 'left-0.5'}`} />
    </button>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-polo-navy">Cargos e acessos</p>
        <p className="text-xs text-gray-500 mt-0.5">
          O que cada grupo alcança no app. Você pode renomear os cargos e criar outros.
        </p>
      </div>

      <div className="space-y-2">
        {cargos.filter(c => c.base !== 'diretoria').map(cargo => (
          <div key={cargo.id} className="border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2 px-3 py-2">
              <input value={cargo.nome} onChange={e => renomear(cargo, e.target.value)}
                aria-label={`Nome do cargo ${cargo.nome}`}
                className="flex-1 min-w-0 text-sm font-semibold text-polo-navy bg-transparent border-b border-transparent focus:border-gray-300 outline-none" />
              {!cargo.fixo && (
                <span className="text-[11px] text-gray-500 flex-shrink-0">
                  nível {cargo.base === 'gerencia' ? 'Gerência' : 'Cozinha'}
                </span>
              )}
              <button onClick={() => setAbrindo(abrindo === cargo.id ? '' : cargo.id)}
                className="text-[11px] font-bold text-polo-navy border border-gray-300 rounded px-2 py-1 flex-shrink-0">
                {abrindo === cargo.id ? 'fechar' : 'acessos'}
              </button>
              {!cargo.fixo && (
                <button onClick={() => apagar(cargo)}
                  className="text-[11px] font-semibold text-red-700 px-1 flex-shrink-0">apagar</button>
              )}
            </div>
            {abrindo === cargo.id && (
              <div className="px-3 pb-3 space-y-1.5 border-t border-gray-100 pt-2">
                {caps.map(cap => (
                  <div key={cap.id} className="flex items-start justify-between gap-3">
                    <span id={`${cargo.id}-${cap.id}`} className="min-w-0">
                      <span className="block text-xs text-gray-800">{cap.label}</span>
                      <span className="block text-[11px] text-gray-500 leading-tight">{cap.desc}</span>
                    </span>
                    <Chave id={`${cargo.id}-${cap.id}`} ligado={valorDoCargo(cargo, cap.id)}
                      onClick={() => mudarCargo(cargo, cap.id, !valorDoCargo(cargo, cap.id))} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {criando ? (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2">
          <input value={novoNome} onChange={e => setNovoNome(e.target.value)} autoFocus
            placeholder="Nome do cargo" aria-label="Nome do novo cargo" className={inputCls} />
          <div>
            <label htmlFor="cargo-base" className="block text-[11px] text-gray-600 mb-1">Nível de segurança</label>
            <select id="cargo-base" value={novaBase} onChange={e => setNovaBase(e.target.value)}
              className={`${inputCls} bg-white`}>
              <option value="cozinha">Cozinha — operação do dia a dia</option>
              <option value="gerencia">Gerência — também administra a equipe</option>
            </select>
            {/* ⚠️ Escrito ANTES de criar, não como erro depois: o nível é o
                teto do que aquele cargo vai poder alcançar, e trocá-lo depois
                obrigaria a recriar as contas que já usam o cargo. */}
            <p className="text-[11px] text-gray-600 mt-1">
              O nível é o teto: um cargo em Cozinha não alcança o que só Gerência alcança, mesmo
              com a chave ligada.
            </p>
          </div>
          <div className="flex gap-2">
            <Botao onClick={criar} tamanho="sm" className="flex-1">Criar cargo</Botao>
            <button onClick={() => setCriando(false)} className="text-xs text-gray-600 px-3">Cancelar</button>
          </div>
        </div>
      ) : (
        <Botao onClick={() => setCriando(true)} tamanho="sm" variante="secundario">+ Criar cargo</Botao>
      )}

      {equipe.length > 0 && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600">Exceções por conta</p>
          <p className="text-[11px] text-gray-600">
            Abre ou fecha algo só para uma conta, sem mexer no cargo dela.
          </p>
          {equipe.map(u => {
            const quem = u.usuario || u.nome;
            const excecoes = Object.keys((m.porConta || {})[u.id] || {}).length;
            return (
              <details key={u.id} className="border border-gray-200 rounded-lg">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-800">
                  {quem}
                  {excecoes > 0 && <span className="ml-1 font-normal text-gray-500">· com exceções</span>}
                </summary>
                <div className="px-3 pb-3 space-y-1.5 border-t border-gray-100 pt-2">
                  {caps.map(cap => (
                    <div key={cap.id} className="flex items-center justify-between gap-3">
                      <span id={`${u.id}-${cap.id}`} className="text-xs text-gray-800 min-w-0">{cap.label}</span>
                      <Chave id={`${u.id}-${cap.id}`} ligado={valorDaConta(u, cap.id)}
                        onClick={() => mudarConta(u, cap.id, !valorDaConta(u, cap.id))} />
                    </div>
                  ))}
                  <button onClick={() => limparConta(u)}
                    className="text-[11px] font-semibold text-gray-600 border border-gray-200 rounded px-2 py-1 mt-1">
                    Voltar a seguir o cargo
                  </button>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
