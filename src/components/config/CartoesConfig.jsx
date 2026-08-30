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
 * Contas da equipe — o dono cria, entrega e continua no comando.
 *
 * ⚠️ SUBSTITUIU O CÓDIGO DE CONVITE entre dono e colaborador. O convite obrigava
 * a pessoa a ter e-mail próprio, se cadastrar sozinha e escolher a própria
 * senha — e o dono ficava sem controle nenhum depois disso: não podia trocar a
 * senha de quem esqueceu, nem saber quem era quem. Numa cozinha, metade da
 * equipe não tem (ou não lembra) um e-mail.
 *
 * ⚠️ NÃO CONFUNDIR COM "RESPONSÁVEIS": aquele é o nome que sai IMPRESSO no
 * campo RESP. da etiqueta e não tem login. Este é quem entra no app. A
 * cozinheira do turno da noite assina etiqueta sem precisar de conta.
 */
export function CartaoContas({
  sessao, usuarios, cargos, criarConta, trocarSenhaDe, removerConta,
  desativarUsuario, reativarUsuario, definirApelido, toast, confirm,
}) {
  const [apelido, setApelido] = useState(sessao?.apelido || '');
  const [salvandoApelido, setSalvandoApelido] = useState(false);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({ nome: '', usuario: '', senha: '', cargo: 'cozinha' });
  const [ocupado, setOcupado] = useState(false);
  const [novaSenha, setNovaSenha] = useState(null); // { id, valor }

  const ativos = (usuarios || []).filter(u => u.ativo !== false);
  const max = sessao?.maxUsuarios || 3;
  const vagas = Math.max(0, max - ativos.length);
  const casa = sessao?.apelido || '';
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';

  // ⚠️ Espelha o que o usuário digita JÁ NO FORMATO FINAL. O apelido e o
  // usuário perdem acento, espaço e pontuação na criação; mostrar "maria
  // silva" e criar "mariasilva" faria o dono anotar um login que não existe.
  const limpar = (t) => String(t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  const salvarApelido = async () => {
    setSalvandoApelido(true);
    const r = await definirApelido(apelido);
    setSalvandoApelido(false);
    if (r.erro) { toast(r.erro, 'erro'); return; }
    setApelido(r.apelido);
    toast(`Apelido da casa: ${r.apelido}.`, 'sucesso');
  };

  const criar = async () => {
    setOcupado(true);
    const r = await criarConta({
      nome: form.nome.trim(), usuario: limpar(form.usuario),
      senha: form.senha, cargo: form.cargo,
      cargoRotulo: cargos.find(c => c.id === form.cargo)?.nome || null,
    });
    setOcupado(false);
    if (r.erro) { toast(r.erro, 'erro'); return; }
    setCriando(false);
    setForm({ nome: '', usuario: '', senha: '', cargo: 'cozinha' });
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
    toast(`Senha de ${u.nome} trocada. Avise a pessoa.`, 'sucesso', { duracao: 8000 });
  };

  const remover = async (u) => {
    const ok = await confirm({
      titulo: `Apagar a conta de ${u.nome}?`,
      // ⚠️ Diz o que NÃO some. Sem isto, "apagar a conta" lê como "apagar o que
      // ela fez" — e ninguém apaga, com medo de perder o histórico.
      mensagem: 'A pessoa perde o acesso na hora. O que ela já registrou e as etiquetas que imprimiu continuam como estão.\n\nSe for afastamento temporário, use Bloquear.',
      perigo: true, confirmar: 'Apagar conta',
    });
    if (!ok) return;
    const r = await removerConta(u.id);
    toast(r.erro || `Conta de ${u.nome} apagada.`, r.erro ? 'erro' : 'sucesso');
  };

  const alternarBloqueio = async (u) => {
    if (u.ativo === false) { await reativarUsuario(u.id); toast(`${u.nome} desbloqueado.`, 'sucesso'); return; }
    const ok = await confirm({
      titulo: `Bloquear ${u.nome}?`,
      mensagem: 'A conta para de entrar até você desbloquear. Nada é apagado, e a vaga continua ocupada.',
      confirmar: 'Bloquear',
    });
    if (!ok) return;
    await desativarUsuario(u.id);
    toast(`${u.nome} bloqueado.`, 'sucesso');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-polo-navy">Contas da equipe</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Quem entra no app. Você cria a conta e entrega o acesso — a pessoa não precisa de e-mail.
        </p>
      </div>

      {/* ⚠️ O APELIDO VEM PRIMEIRO E BLOQUEIA O RESTO. Ele é a segunda metade
          do login de todo mundo; criar contas antes dele obrigaria a refazer
          todas quando ele mudasse. */}
      {!casa ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-bold text-amber-900">Escolha o apelido da casa</p>
          <p className="text-[11px] text-amber-800">
            Ele entra no login de todo mundo: <strong>maria.{apelido ? limpar(apelido) : 'suacasa'}</strong>.
            Só letras e números, e não pode repetir o de outro restaurante.
          </p>
          <div className="flex gap-2">
            <input value={apelido} onChange={e => setApelido(e.target.value)} maxLength={20}
              placeholder="ex.: polobeer" aria-label="Apelido da casa"
              className={`${inputCls} flex-1 min-w-0`} />
            <Botao onClick={salvarApelido} tamanho="sm" largura="auto" disabled={salvandoApelido}>
              {salvandoApelido ? 'Salvando…' : 'Salvar'}
            </Botao>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-gray-600">
          Apelido da casa: <strong className="text-polo-navy">{casa}</strong> — os logins terminam nele.
        </p>
      )}

      <div className="space-y-1.5">
        {ativos.length === 0 && <p className="text-xs text-gray-600 italic">Só você, por enquanto.</p>}
        {(usuarios || []).map(u => {
          const ehEu = u.id === sessao?.usuarioId;
          const dono = u.cargo === 'diretoria';
          return (
            <div key={u.id} className={`border rounded-lg p-2.5 ${u.ativo === false ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {u.nome}{u.ativo === false && <span className="text-[11px] font-normal text-gray-500"> · bloqueado</span>}
                  </p>
                  <p className="text-[11px] text-gray-600">
                    {u.cargo_rotulo || cargos.find(c => c.id === u.cargo)?.nome || u.cargo}
                    {u.usuario && casa ? ` · ${u.usuario}.${casa}` : ''}
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
                    placeholder="Nova senha (mín. 6)" aria-label={`Nova senha de ${u.nome}`}
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
            <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Nome da pessoa" aria-label="Nome da pessoa" className={inputCls} autoFocus />
            <div>
              <input value={form.usuario} onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))}
                placeholder="Usuário (ex.: maria)" aria-label="Usuário" className={inputCls} />
              {form.usuario && (
                <p className="text-[11px] text-gray-600 mt-1">
                  Login: <strong className="text-polo-navy">{limpar(form.usuario)}.{casa}</strong>
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
              Anote a senha antes de salvar — você entrega ela à pessoa, e depois só dá para trocar por outra.
            </p>
            <div className="flex gap-2">
              <Botao onClick={criar} disabled={ocupado} className="flex-1">
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
