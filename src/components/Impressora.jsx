import { useEffect, useState, useSyncExternalStore } from 'react';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import {
  caminhosDeImpressao, impressoraConectada, nomeImpressora, aoMudarConexao, versaoDaConexao,
  reconectarSePuder, escolherImpressora, desconectar, bleDisponivel, bluetoothLigado,
  estadoDaConexao, aparelhosAutorizados,
} from '../lib/impressoraBLE';
import { erroEmPortugues, ultimoErroGuardado } from '../utils/erros';
import { textoDoDiagnostico } from '../utils/diagnostico';
import { produtoAtivo, soEtiquetas } from '../utils/produto';
import { temUnidadesExtras, nomeDaUnidade } from '../utils/unidades';
import { hoje } from '../utils/formatters';

// =====================================================================
//  IMPRESSORA À VISTA (pedido do dono, 23/09/2026)
//
//  Impressora é o que mais gera chamado num app de etiqueta, e a pessoa só
//  descobria que ela tinha caído DEPOIS de escolher o item e tocar em
//  imprimir. Aqui:
//   • a faixa da tela Etiquetar diz se a impressora está conectada;
//   • o cartão da aba Impressora troca de impressora, imprime uma etiqueta de
//     teste (que NÃO entra no relatório) e copia um diagnóstico para o
//     suporte colar no WhatsApp.
//
//  ⚠️ O BLUETOOTH SÓ EXISTE NO CELULAR/TABLET ANDROID (caminhosDeImpressao).
//  No computador a etiqueta sai pela janela do navegador e não há conexão
//  para mostrar — a faixa nem aparece, e o cartão diz isso.
// =====================================================================

/** Redesenha quando a impressora conecta, cai ou é trocada. */
function useConexaoImpressora() {
  useSyncExternalStore(aoMudarConexao, versaoDaConexao);
  return { conectada: impressoraConectada(), nome: nomeImpressora() };
}

// "Nenhuma impressora escolhida" é o mesmo erro para "fechei a lista" e para
// "a lista veio vazia" — a frase serve aos dois (ver imprimirDireto).
const mensagemDeErro = (e) => (e?.name === 'NotFoundError'
  ? 'Nenhuma impressora foi escolhida. Se a lista apareceu vazia: ligue a impressora, deixe-a por perto e confira se ela não está conectada em outro aparelho.'
  : erroEmPortugues(e));

/**
 * A faixa do topo da tela Etiquetar.
 *
 * ⚠️ Ao abrir a tela, tenta a reconexão SILENCIOSA — a mesma que a janela de
 * impressão já fazia ao abrir. Sem ela a faixa só saberia dizer "não
 * conectada" até a primeira etiqueta. O botão Conectar abre o seletor
 * direto, sem nenhuma espera antes (a regra do `requestDevice`).
 */
export function FaixaImpressora() {
  const direto = caminhosDeImpressao().direto;
  const { conectada, nome } = useConexaoImpressora();
  const [procurando, setProcurando] = useState(() => direto && !impressoraConectada());
  const [jaConhecida, setJaConhecida] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!caminhosDeImpressao().direto || impressoraConectada()) return undefined;
    let vivo = true;
    (async () => {
      const conhecidos = await aparelhosAutorizados();
      if (vivo) setJaConhecida(!!conhecidos?.length);
      await reconectarSePuder();
      if (vivo) setProcurando(false);
    })();
    return () => { vivo = false; };
  }, []);

  if (!direto) return null;

  const conectar = async () => {
    setErro(''); setConectando(true);
    try { await escolherImpressora(); } catch (e) { setErro(mensagemDeErro(e)); } finally { setConectando(false); }
  };

  return (
    <div className="space-y-1.5">
      <div role="status"
        className={`rounded-xl px-3 py-1.5 flex items-center gap-2.5 border
          ${conectada ? 'bg-green-50 border-green-200' : procurando ? 'bg-white border-gray-200' : 'bg-amber-50 border-amber-200'}`}>
        <span aria-hidden="true"
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0
            ${conectada ? 'bg-green-600' : procurando ? 'bg-gray-400 animate-pulse' : 'bg-amber-500'}`} />
        <p className="flex-1 min-w-0 text-xs text-gray-800 py-1.5">
          {conectada
            ? <><strong className="text-green-800">Impressora conectada</strong>{nome ? ` · ${nome}` : ''}</>
            : procurando
              ? 'Procurando a impressora…'
              : jaConhecida
                ? <><strong className="text-amber-900">Impressora não respondeu.</strong> Desligada, longe ou em uso por outro aparelho.</>
                : <><strong className="text-amber-900">Nenhuma impressora conectada</strong> neste aparelho ainda.</>}
        </p>
        {!conectada && !procurando && (
          <button onClick={conectar} disabled={conectando}
            className="min-h-11 px-3 rounded-lg bg-polo-navy text-polo-gold text-xs font-bold flex-shrink-0 disabled:opacity-60">
            {conectando ? 'Conectando…' : 'Conectar'}
          </button>
        )}
      </div>
      {erro && <p className="text-[11px] text-amber-900 px-1">{erro}</p>}
    </div>
  );
}

/**
 * "Sua impressora" — o cartão do topo da aba Impressora.
 */
export function CartaoImpressora() {
  const direto = caminhosDeImpressao().direto;
  const { conectada, nome } = useConexaoImpressora();
  const { abrirEtiquetas, toast } = useUI();
  const { prefs, pendencias, online, mortos, unidades, unidadeAtual } = useApp();
  const { sessao, impersonando } = useAuth();
  const [trocando, setTrocando] = useState(false);
  const [erro, setErro] = useState('');
  const [diagnostico, setDiagnostico] = useState('');

  // ⚠️ TROCAR = soltar a atual e abrir o seletor, no MESMO toque. Com duas
  // MDK-022 na cozinha, a reconexão silenciosa pega a que já conhece — e a
  // pessoa não tinha como escolher a outra.
  const trocar = async () => {
    setErro(''); setTrocando(true);
    desconectar();
    try {
      await escolherImpressora();
      toast('Impressora conectada.', 'sucesso');
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setTrocando(false); }
  };

  // ⚠️ A ETIQUETA DE TESTE passa pela MESMA janela e pelo MESMO caminho de
  // impressão das outras — é isso que faz o teste valer. A marca `teste` faz
  // a janela não registrar nada: nem relatório, nem aba Impressas, nem o
  // responsável lembrado. Antes, o primeiro teste de alinhamento do rolo era
  // com etiqueta real, contada no relatório do dono.
  const testar = () => abrirEtiquetas([{
    nome: 'TESTE DE IMPRESSÃO',
    teste: true,
    tipoData: 'fabricacao',
    dataFabricacao: hoje(),
    diasValidade: 3,
    responsavel: prefs.responsavel || '',
    quantidade: 1,
  }]);

  const copiarDiagnostico = async () => {
    const conta = impersonando?.restauranteNome || sessao?.restauranteNome || '';
    const temBle = bleDisponivel();
    const texto = textoDoDiagnostico({
      quando: new Date().toLocaleString('pt-BR'),
      conta,
      plano: soEtiquetas(produtoAtivo(sessao, impersonando)) ? 'Aurum Etiquetas' : 'Aurum Cozinha Pro',
      unidade: temUnidadesExtras(unidades) ? nomeDaUnidade(unidades, unidadeAtual?.id, conta) : '',
      versao: import.meta.env.VITE_VERSAO_APP || 'desenvolvimento',
      navegador: navigator.userAgent,
      tela: `${window.innerWidth}x${window.innerHeight}`,
      online,
      pendencias,
      mortos: (mortos || []).length,
      caminho: direto ? 'Bluetooth direto' : 'janela de impressão do navegador',
      bleNoNavegador: temBle,
      bleLigado: temBle ? await bluetoothLigado() : null,
      impressora: estadoDaConexao(),
      autorizados: temBle ? await aparelhosAutorizados() : null,
      ultimoErro: ultimoErroGuardado(),
    });
    setDiagnostico(texto);
    try {
      await navigator.clipboard.writeText(texto);
      toast('Diagnóstico copiado. Cole na conversa com o suporte.', 'sucesso');
    } catch {
      toast('Não deu para copiar sozinho: segure o dedo no texto abaixo e copie.', 'aviso');
    }
  };

  const botao = 'w-full min-h-11 rounded-xl text-sm font-bold px-3 py-2.5';

  return (
    <div className="bg-white rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-polo-navy">Sua impressora</p>
        {direto ? (
          <p className="text-xs text-gray-700 mt-0.5">
            {conectada
              ? <>Conectada: <strong>{nome || 'impressora sem nome'}</strong></>
              : 'Não conectada agora — ela conecta sozinha ao imprimir, ou toque abaixo.'}
          </p>
        ) : (
          <p className="text-xs text-gray-700 mt-0.5">
            Neste aparelho a etiqueta sai pela janela de impressão do navegador — a impressora é a
            que estiver instalada nele.
          </p>
        )}
      </div>

      {direto && (
        <button onClick={trocar} disabled={trocando}
          className={`${botao} bg-polo-navy text-polo-gold disabled:opacity-60`}>
          {trocando ? 'Abrindo a lista…' : conectada ? 'Trocar impressora' : 'Conectar impressora'}
        </button>
      )}
      {erro && <p className="text-[11px] text-amber-900">{erro}</p>}

      <div>
        <button onClick={testar} className={`${botao} border-2 border-polo-navy text-polo-navy`}>
          Imprimir etiqueta de teste
        </button>
        <p className="text-[11px] text-gray-600 mt-1 px-1">
          Para conferir o rolo e o alinhamento. Não entra no relatório nem na lista de impressas.
        </p>
      </div>

      <div>
        <button onClick={copiarDiagnostico} className={`${botao} bg-gray-100 text-gray-700`}>
          Copiar diagnóstico para o suporte
        </button>
        <p className="text-[11px] text-gray-600 mt-1 px-1">
          Junta o que o suporte precisa saber (aparelho, versão do app, Bluetooth). Cole na conversa pelo WhatsApp.
        </p>
      </div>
      {diagnostico && (
        <textarea readOnly value={diagnostico} rows={8} aria-label="Diagnóstico para o suporte"
          onFocus={e => e.target.select()}
          className="w-full text-[11px] font-mono bg-gray-50 border border-gray-200 rounded-lg p-2" />
      )}
    </div>
  );
}
