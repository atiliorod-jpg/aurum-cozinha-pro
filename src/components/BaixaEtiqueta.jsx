import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { hoje, fmtData, fmtNum } from '../utils/formatters';
import { temRecurso, tipoBase } from '../utils/modulos';
import {
  acoesDaCozinha, ROTULO_ACAO, embalagensRestantes, proximaEmbalagem, quantidadeDaEmbalagem,
  validadeDaEmbalagem, deOutraCozinha, codigoLegivel,
} from '../utils/baixaEtiqueta';
import { decidirRecebimento, MOTIVO_RECEBER } from '../utils/posse';
import { MOTIVOS_DESPERDICIO } from '../data/produtos';
import ResponsavelSelect from './ResponsavelSelect';
import Botao from './Botao';
import Aviso from './Aviso';

// =====================================================================
//  A folha "Dar baixa" de UMA etiqueta (M59, 30/09/2026)
//
//  A mesma para as três portas: o QR lido pela câmera do app, o QR aberto
//  pela câmera comum do celular (/q/código) e a lista de Validades. Uma
//  regra só de botões, quantidade e travas — as três não podem divergir.
//
//  ⚠️ NA FINALIZAÇÃO (M61, 01/10/2026) há mais dois casos:
//   • a embalagem que VEIO da Produção (`naFinalizacao`): Perda e Usado
//     descontam do estoque DAQUI — antes a folha mandava abrir a Produção, e
//     a perda caía no estoque errado;
//   • a embalagem que ainda consta NA PRODUÇÃO: "Receber aqui" (o banco decide
//     se confere, se liga à saída lançada à mão ou se dá entrada). Com a
//     conferência desligada e nada lançado, dá para registrar a perda no
//     estoque da Produção sem trocar de cozinha.
// =====================================================================

const MOTIVOS_RAPIDOS = ['V', 'A', 'S', 'O'];

export default function BaixaEtiqueta({ etq, onFeito, acaoInicial = null }) {
  const { modulo } = useApp();
  if (tipoBase(modulo) === 'finalizacao' && !etq.naFinalizacao && tipoBase(etq.cozinha) === 'producao') {
    return <AindaNaProducao etq={etq} onFeito={onFeito} />;
  }
  return <FolhaDeBaixa etq={etq} onFeito={onFeito} acaoInicial={acaoInicial} />;
}

function FolhaDeBaixa({ etq, onFeito, acaoInicial = null, soPerdaNaDona = false }) {
  const { produtos, modulo, destinosDeSaida: locais, prefs, setPref, baixarEtiqueta, baixarNoDestino, estoques, setModulo,
    conferenciaAqui, pendentesConferir, receberEtiqueta } = useApp();
  const { confirm, toast } = useUI();
  const hj = hoje();
  const produto = etq.produtoId ? produtos.find(p => p.id === etq.produtoId) : null;
  const restantes = embalagensRestantes(etq);
  const prox = proximaEmbalagem(etq);
  const val = validadeDaEmbalagem(etq, hj);
  // a perda na Produção pedida da Finalização não é "outra cozinha": é de propósito
  const outra = !soPerdaNaDona && !etq.naFinalizacao && deOutraCozinha(etq, modulo);
  const nomeCozinha = (estoques || []).find(e => e.id === etq.cozinha)?.nome || 'outra cozinha';
  // etiqueta avulsa (sem item do estoque) só pode ser marcada como usada
  const acoes = soPerdaNaDona ? ['perda'] : acoesDaCozinha(modulo).filter(a => a === 'usada' || etq.produtoId);
  const inicial = acaoInicial && acoes.includes(acaoInicial) ? acaoInicial
    : val.vencida && acoes.includes('perda') ? 'perda' : acoes[0];
  const [acao, setAcao] = useState(inicial);
  const [destino, setDestino] = useState(prefs.destino && locais.some(l => l.id === prefs.destino) ? prefs.destino : (locais[0]?.id || ''));
  const [motivo, setMotivo] = useState(val.vencida ? 'V' : 'O');
  const [potes, setPotes] = useState(1);
  const [qtdDigitada, setQtdDigitada] = useState('');
  const [responsavel, setResponsavel] = useState(prefs.responsavel || '');
  const [enviando, setEnviando] = useState(false);

  const porEmbalagem = quantidadeDaEmbalagem(etq, produto);
  const unidade = produto?.unidade || '';
  const quantidade = porEmbalagem ? Math.round(porEmbalagem * potes * 1000) / 1000 : (parseFloat(String(qtdDigitada).replace(',', '.')) || 0);
  // a embalagem que veio da Produção e ainda não foi conferida (conferência ligada)
  const aConferir = etq.naFinalizacao && conferenciaAqui
    ? (pendentesConferir || []).filter(l => (l.etiquetaIds || []).includes(etq.id)) : [];

  if (restantes <= 0) {
    return (
      <Aviso tom="atencao">
        {copiasTexto(etq)} deste código já {prox.de > 1 ? 'saíram' : 'saiu'}. Para corrigir uma baixa feita por engano,
        use o Desfazer da hora ou apague o lançamento no Histórico.
      </Aviso>
    );
  }

  if (outra) {
    return (
      <div className="space-y-3">
        <Resumo etq={etq} val={val} prox={prox} />
        <Aviso tom="atencao">
          Esta etiqueta é da <strong>{nomeCozinha}</strong>. A baixa entra no estoque de lá: abra essa cozinha
          para continuar.
        </Aviso>
        <Botao onClick={() => setModulo(etq.cozinha)}>Abrir {nomeCozinha}</Botao>
      </div>
    );
  }

  const confirmar = async () => {
    if (enviando) return;
    if (acao === 'saida' && !destino) { toast('Escolha para onde vai a saída.', 'aviso'); return; }
    if (acao !== 'usada' && !(quantidade > 0)) { toast(`Digite quanto tem ${potes > 1 ? 'nas embalagens' : 'na embalagem'}${unidade ? ` (em ${unidade})` : ''}.`, 'aviso'); return; }
    setEnviando(true);
    // ⚠️ EMBALAGEM VENCIDA NA SAÍDA (decisão do dono): pede confirmação e
    // sugere a perda — a pessoa ainda pode confirmar.
    if (acao === 'saida' && val.vencida) {
      const ok = await confirm({
        titulo: 'Embalagem vencida',
        mensagem: `${etq.nome} ${val.texto} (${fmtData(etq.validade)}). Dar saída mesmo assim? O certo costuma ser registrar como perda.`,
        confirmar: 'Dar saída mesmo assim', perigo: true,
      });
      if (!ok) { setAcao('perda'); setMotivo('V'); setEnviando(false); return; }
    }
    if (acao === 'saida') setPref('destino', destino);
    if (responsavel.trim()) setPref('responsavel', responsavel.trim());
    const pedido = {
      etq, acao, potes, quantidade, destino, responsavel: responsavel.trim(),
      turno: prefs.turno || '', motivo, produto,
    };
    // a embalagem que veio da Produção: desconta do estoque DAQUI
    const b = etq.naFinalizacao ? baixarNoDestino(pedido) : baixarEtiqueta(pedido);
    setEnviando(false);
    if (b) onFeito?.(b);
  };

  const confirmarChegada = () => {
    const n = aConferir.reduce((s, l) => s + (l.potes || 1), 0) || 1;
    const b = receberEtiqueta({ etq, potes: n, responsavel: responsavel.trim() });
    if (b?.erro) { toast(MOTIVO_RECEBER[b.erro] || 'Não deu para conferir.', 'aviso'); return; }
    if (b) toast('Chegada conferida.', 'sucesso', { duracao: 1500 });
  };

  const rotuloBotao = acao === 'saida' ? `Dar saída${potes > 1 ? ` de ${potes} embalagens` : ''}`
    : acao === 'perda' ? `Registrar perda${potes > 1 ? ` de ${potes} embalagens` : ''}${soPerdaNaDona ? ' na Produção' : ''}`
    : `Marcar ${potes > 1 ? `${potes} embalagens como usadas` : 'como usada'}`;

  return (
    <div className="space-y-4">
      <Resumo etq={etq} val={val} prox={prox} />

      {aConferir.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
          <p className="text-sm text-amber-900">
            A Produção mandou esta embalagem{aConferir[0].hora ? ` às ${aConferir[0].hora}` : ''} e ninguém conferiu ainda.
          </p>
          <Botao variante="secundario" onClick={confirmarChegada}>Confirmar que chegou</Botao>
        </div>
      )}

      {acoes.length > 1 && (
        <div role="radiogroup" aria-label="O que aconteceu com a embalagem" className="flex gap-2">
          {acoes.map(a => (
            <button key={a} type="button" role="radio" aria-checked={acao === a} onClick={() => setAcao(a)}
              className={`flex-1 min-h-11 rounded-xl text-sm font-bold border-2
                ${acao === a ? 'border-polo-gold bg-polo-beige text-polo-navy' : 'border-gray-200 bg-white text-gray-600'}`}>
              {ROTULO_ACAO[a]}
            </button>
          ))}
        </div>
      )}

      {acao === 'saida' && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Para onde vai</p>
          <div className="flex flex-wrap gap-2">
            {locais.map(l => (
              <button key={l.id} type="button" onClick={() => setDestino(l.id)} aria-pressed={destino === l.id}
                className={`min-h-11 px-3 rounded-lg text-sm font-semibold border
                  ${destino === l.id ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'bg-white text-gray-700 border-gray-200'}`}>
                {l.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {acao === 'perda' && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Motivo</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_DESPERDICIO.filter(m => MOTIVOS_RAPIDOS.includes(m.cod)).map(m => (
              <button key={m.cod} type="button" onClick={() => setMotivo(m.cod)} aria-pressed={motivo === m.cod}
                className={`min-h-11 px-3 rounded-lg text-sm font-semibold border
                  ${motivo === m.cod ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'bg-white text-gray-700 border-gray-200'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {acao === 'usada' && (
        <p className="text-xs text-gray-600">
          Só marca a embalagem, sem mexer no estoque:{' '}
          {temRecurso(modulo, 'fecharTurno') ? 'o consumo daqui sai do Fechar Turno.' : 'a produção já desconta os ingredientes pela receita.'}
        </p>
      )}

      {restantes > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-700">Quantas embalagens <span className="text-gray-500">({etq.naFinalizacao ? 'aqui' : 'restam'} {restantes})</span></p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPotes(n => Math.max(1, n - 1))} aria-label="Uma embalagem a menos"
              className="w-11 h-11 rounded-full bg-gray-100 text-lg font-bold text-polo-navy">−</button>
            <span className="w-8 text-center font-bold text-polo-navy" aria-live="polite">{potes}</span>
            <button type="button" onClick={() => setPotes(n => Math.min(restantes, n + 1))} aria-label="Uma embalagem a mais"
              className="w-11 h-11 rounded-full bg-polo-navy text-lg font-bold text-polo-gold">+</button>
          </div>
        </div>
      )}

      {acao !== 'usada' && (porEmbalagem ? (
        <p className="text-sm text-gray-700">
          {acao === 'saida' ? 'Sai' : 'Perde'} do estoque{soPerdaNaDona ? ' da Produção' : ''}: <strong className="text-polo-navy">{fmtNum(quantidade)} {unidade}</strong>
          {potes > 1 && <span className="text-gray-500"> ({potes} × {fmtNum(porEmbalagem)} {unidade})</span>}
        </p>
      ) : (
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1">
            Quanto tem {potes > 1 ? `nas ${potes} embalagens` : 'na embalagem'}{unidade ? ` (em ${unidade})` : ''}?
          </span>
          <input type="text" inputMode="decimal" value={qtdDigitada} onChange={e => setQtdDigitada(e.target.value)}
            aria-label={`Quantidade${unidade ? ` em ${unidade}` : ''}`} placeholder="Ex.: 1,5"
            className="w-full min-h-11 border border-gray-200 rounded-lg px-3 py-2 text-base" />
          <span className="block text-[11px] text-gray-500 mt-1">
            A etiqueta não diz a medida. Dica: preencha a “Medida padrão” do item para não precisar digitar.
          </span>
        </label>
      ))}

      <ResponsavelSelect value={responsavel} onChange={setResponsavel} label="Quem está dando baixa" />

      <Botao onClick={confirmar} disabled={enviando}>{rotuloBotao}</Botao>
    </div>
  );
}

// ── A embalagem da Produção lida NA Finalização ────────────────────────
function AindaNaProducao({ etq, onFeito }) {
  const { produtos, recebimentos, conferenciaAqui, receberEtiqueta, prefs, setPref } = useApp();
  const { toast } = useUI();
  const [responsavel, setResponsavel] = useState(prefs.responsavel || '');
  const [potes, setPotes] = useState(1);
  const [qtdDigitada, setQtdDigitada] = useState('');
  const [perdaNaDona, setPerdaNaDona] = useState(false);
  const hj = hoje();
  const produto = etq.produtoId ? produtos.find(p => p.id === etq.produtoId) : null;
  const restantes = embalagensRestantes(etq);
  const prox = proximaEmbalagem(etq);
  const val = validadeDaEmbalagem(etq, hj);
  const porEmbalagem = quantidadeDaEmbalagem(etq, produto);
  const unidade = produto?.unidade || '';
  const quantidade = porEmbalagem ? Math.round(porEmbalagem * potes * 1000) / 1000 : (parseFloat(String(qtdDigitada).replace(',', '.')) || 0);
  const palpite = decidirRecebimento({ etq, recebimentos, ligada: !!conferenciaAqui, potes, quantidade: quantidade || null });

  if (perdaNaDona) return <FolhaDeBaixa etq={etq} onFeito={onFeito} soPerdaNaDona />;

  const receber = () => {
    if (palpite.caso === 'entrada' && !(quantidade > 0)) {
      toast(`Digite quanto chegou${unidade ? ` (em ${unidade})` : ''}.`, 'aviso');
      return;
    }
    if (responsavel.trim()) setPref('responsavel', responsavel.trim());
    const b = receberEtiqueta({ etq, potes, quantidade: quantidade || null, responsavel: responsavel.trim() });
    if (b?.erro) { toast(MOTIVO_RECEBER[b.erro] || 'Não deu para receber.', 'aviso'); return; }
    if (b) onFeito?.(b);
  };

  if (!palpite.caso) {
    return (
      <div className="space-y-3">
        <Resumo etq={etq} val={val} prox={prox} />
        <Aviso tom="atencao">{MOTIVO_RECEBER[palpite.motivo] || 'Esta embalagem não está nesta Finalização.'}</Aviso>
        {palpite.motivo === 'nao_saiu' && (
          <>
            <p className="text-xs text-gray-600">
              Para receber por aqui, a diretoria liga a conferência desta Finalização em Administração → Unidades e
              cozinhas. Se a embalagem estragou, a perda sai do estoque da Produção, onde ela ainda está.
            </p>
            {etq.produtoId && (
              <Botao variante="secundario" onClick={() => setPerdaNaDona(true)}>Registrar a perda na Produção</Botao>
            )}
          </>
        )}
      </div>
    );
  }

  const textoCaso = palpite.caso === 'vinculo'
    ? 'A Produção lançou a saída deste item à mão. A embalagem fica ligada a essa saída — o estoque não muda.'
    : palpite.caso === 'conferida'
      ? 'A Produção mandou esta embalagem pelo QR. Receber confere a chegada.'
      : 'A Produção ainda não deu saída desta embalagem. Receber lança a transferência da Produção para cá, com a validade da etiqueta.';

  return (
    <div className="space-y-4">
      <Resumo etq={etq} val={val} prox={prox} />
      <p className="text-sm text-gray-700">{textoCaso}</p>

      {palpite.caso !== 'conferida' && restantes > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-700">Quantas embalagens chegaram <span className="text-gray-500">(até {restantes})</span></p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPotes(n => Math.max(1, n - 1))} aria-label="Uma embalagem a menos"
              className="w-11 h-11 rounded-full bg-gray-100 text-lg font-bold text-polo-navy">−</button>
            <span className="w-8 text-center font-bold text-polo-navy" aria-live="polite">{potes}</span>
            <button type="button" onClick={() => setPotes(n => Math.min(restantes, n + 1))} aria-label="Uma embalagem a mais"
              className="w-11 h-11 rounded-full bg-polo-navy text-lg font-bold text-polo-gold">+</button>
          </div>
        </div>
      )}

      {palpite.caso === 'entrada' && (porEmbalagem ? (
        <p className="text-sm text-gray-700">
          Entra no estoque daqui: <strong className="text-polo-navy">{fmtNum(quantidade)} {unidade}</strong>
          {potes > 1 && <span className="text-gray-500"> ({potes} × {fmtNum(porEmbalagem)} {unidade})</span>}
        </p>
      ) : (
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1">
            Quanto chegou{unidade ? ` (em ${unidade})` : ''}?
          </span>
          <input type="text" inputMode="decimal" value={qtdDigitada} onChange={e => setQtdDigitada(e.target.value)}
            aria-label={`Quanto chegou${unidade ? ` em ${unidade}` : ''}`} placeholder="Ex.: 1,5"
            className="w-full min-h-11 border border-gray-200 rounded-lg px-3 py-2 text-base" />
        </label>
      ))}

      <ResponsavelSelect value={responsavel} onChange={setResponsavel} label="Quem está recebendo" />
      <Botao onClick={receber}>
        {palpite.caso === 'conferida' ? 'Confirmar que chegou' : `Receber aqui${potes > 1 ? ` ${potes} embalagens` : ''}`}
      </Botao>
      <p className="text-[11px] text-gray-500">Dá para desfazer em até 24 horas.</p>
    </div>
  );
}

const copiasTexto = (etq) => {
  const n = Math.max(1, parseInt(etq?.copias, 10) || 1);
  return n > 1 ? `As ${n} embalagens` : 'A embalagem';
};

function Resumo({ etq, val, prox }) {
  return (
    <div className="bg-polo-beige rounded-xl p-3">
      <p className="font-bold text-polo-navy text-lg leading-tight">{etq.nome}</p>
      <p className="text-[11px] text-gray-600 mt-0.5">
        código <span className="font-mono font-semibold">{codigoLegivel(etq.id)}</span>
        {etq.naFinalizacao
          ? ` · veio da Produção · ${prox.de} ${prox.de === 1 ? 'embalagem aqui' : 'embalagens aqui'}`
          : prox.de > 1 ? ` · embalagem ${prox.numero} de ${prox.de}` : ''}
        {etq.medida && ` · ${etq.medida}`}
      </p>
      <p className={`text-sm font-semibold mt-1 ${val.vencida ? 'text-red-700' : val.dias != null && val.dias <= 1 ? 'text-orange-800' : 'text-gray-700'}`}>
        {etq.validade ? <>Validade {fmtData(etq.validade)} · {val.texto}</> : 'Sem validade'}
      </p>
      {(etq.fabricacao || etq.responsavel) && (
        <p className="text-[11px] text-gray-600">
          {etq.fabricacao && `${etq.tipoData === 'abertura' ? 'Aberta' : 'Manipulada'} em ${fmtData(etq.fabricacao)}`}
          {etq.responsavel && ` · por ${etq.responsavel}`}
        </p>
      )}
    </div>
  );
}
