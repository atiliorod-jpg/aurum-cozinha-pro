import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import Layout from '../components/Layout';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { statusAssinatura, PLANOS, precoPlano, precoMensalEquivalente, economiaPlano, produtoDe, adicionalUnidade, descontoAtivo, rotuloDesconto, parcelaDasImpressoras } from '../utils/assinatura';
import { useApp } from '../store/AppContext';
import { unidadesAtivas } from '../utils/unidades';
import { montarPixBRCode } from '../utils/pix';
import { supabase } from '../lib/supabase';
import { fmtData, isoLocal } from '../utils/formatters';
import { useLocation } from 'react-router-dom';
import { SecaoUnidades, SecaoContas, SecaoCozinhaPro, SecaoCobrancasAvulsas, SecaoImpressora } from '../components/PlanoExtras';
import { useMinhasImpressoras } from '../components/useMinhasImpressoras';
import Icon from '../components/Icons';
import { plural } from '../utils/formatters';

const WPP_NUMERO = '5581998184489';
const PIX_CHAVE  = import.meta.env.VITE_PIX_CHAVE  || '';
const PIX_NOME   = import.meta.env.VITE_PIX_NOME   || 'Aurum Servicos Gastronomicos';
const PIX_CIDADE = import.meta.env.VITE_PIX_CIDADE || 'Recife';

const brl = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;

// ⚠️ O nome do produto entra na mensagem porque é por ela que a conciliação
// acontece: com dois produtos e três durações, "paguei R$1458" sozinho não diz
// se é etiquetas semestral ou outra combinação.
const linkWpp = (plano, valor, pagador, restaurante, produtoLabel, comImpressora = false) => {
  const msg = encodeURIComponent(
    `Olá! Paguei o plano ${plano.label} (${brl(valor)}${comImpressora ? ', com a parcela da impressora' : ''}) do ${produtoLabel} — restaurante ${restaurante || ''}. ` +
    `Pagamento feito por ${pagador}. Segue o comprovante:`);
  return `https://wa.me/${WPP_NUMERO}?text=${msg}`;
};
// Data LOCAL (não toISOString, que joga para UTC): um teste que acaba às 23h de
// 28/07 em Brasília aparecia como "válido até 29/07" e o cliente perdia o acesso
// um dia antes do que a tela prometia.
const dataISO = (ts) => isoLocal(new Date(ts));

// ⚠️ Uma lista POR PRODUTO. A do Aurum Etiquetas não pode herdar as linhas de
// estoque/produção do completo: seria promessa de tela que aquela conta não
// tem, feita na hora exata em que o cliente decide pagar. Vale aqui, em dobro,
// o aviso da lista de baixo — só liste o que o app REALMENTE faz naquele plano.
const RECURSOS_POR_PRODUTO = {
  etiquetas: [
    'Etiquetas de validade com impressão',
    'Biblioteca de itens prontos (é só buscar e usar)',
    'Cadastro de itens com prazo por tipo de armazenamento',
    // ⚠️ Não entra "controle do que vence": a tela de Validades não existe
    // neste produto. A lista só pode prometer o que a conta realmente tem.
    'Prazo por tipo de armazenamento (congelado, resfriado, refrigerado, ambiente)',
    // ⚠️ Aqui dizia "Etiquetas avulsas". Aquela aba foi removida em 31/08 —
    // virou o campo de data de abertura dentro do próprio item. Prometer na
    // TELA DE PAGAMENTO um recurso que não existe é o pior lugar possível
    // para essa dívida ficar.
    'Itens abertos com data de abertura (ex.: leite, molho do dia)',
    'Funciona offline e sincroniza na nuvem',
  ],
  completo: [
    'Estoque completo (FEFO, mín/máx automático)',
    'Entradas, saídas, produção e receitas',
    'Etiquetas de validade com impressão',
    // ⚠️ Isto é promessa comercial: só liste o que o app REALMENTE faz hoje.
    // "exportação Excel" saiu daqui porque o Excel dos relatórios foi removido —
    // o que existe é imprimir/salvar em PDF e a planilha-modelo de produtos.
    'Relatórios por período (imprimir ou salvar em PDF)',
    'Cadastro de produtos por planilha (Excel)',
    'Usuários com permissões por função',
    'Funciona offline e sincroniza na nuvem',
  ],
};

export default function Pagamento() {
  const { sessao, avisarPagamento } = useAuth();
  const { toast } = useUI();
  const st = statusAssinatura(sessao);

  // ⚠️ O preço vem do PRODUTO que esta conta contratou (PRODUTOS em
  // utils/assinatura.js), não de uma constante única. Sem isto o cliente do
  // plano menor veria — e pagaria — o valor do maior.
  const prod = produtoDe(sessao);
  // ⚠️ UNIDADES ADICIONAIS (M46): cada unidade extra ativa soma 1/3 do plano
  // por mês, e o QR já sai com a soma. Arquivada não cobra.
  // ⚠️ E CONFERE NA REDE AO ABRIR: a lista do aparelho só se atualiza na
  // troca de conta ou quando a tela volta a ficar visível. No computador do
  // escritório, aberto o dia todo, uma unidade criada pela Aurum de manhã
  // ficaria fora do QR à tarde — e o valor não bateria com o do painel.
  const { unidades, recarregarUnidades } = useApp();
  useEffect(() => { recarregarUnidades(); }, [recarregarUnidades]);
  const extras = unidadesAtivas(unidades).length;
  // desconto combinado com a Aurum (M54) — vale até a data, se houver
  const desconto = descontoAtivo(sessao?.desconto);

  // '/pagamento#unidades' (do cartão Unidades e do Contas da equipe): rola até a seção
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [hash]);

  // ⚠️ ENCARGO DE ATRASO (M45): só existe para quem tem contrato parcelado e
  // só depois de a Aurum lançar pelo painel. Vem de uma RPC que lê SÓ o
  // restaurante de quem está logado — sem parâmetro — então o QR de um cliente
  // nunca carrega o encargo de outro.
  const [encargo, setEncargo] = useState(null);
  useEffect(() => {
    if (!sessao?.restauranteId || sessao.demo || sessao.eSuperAdmin) return undefined;
    let vivo = true;
    supabase.rpc('meu_encargo_pendente')
      .then(({ data }) => { if (vivo) setEncargo((Array.isArray(data) && data[0]) || null); })
      .catch(() => { /* sem rede: a tela segue sem encargo, e o painel continua cobrando */ });
    return () => { vivo = false; };
  }, [sessao?.restauranteId, sessao?.demo, sessao?.eSuperAdmin]);

  // ⚠️ IMPRESSORA PARCELADA (M60): a parcela entra no MESMO Pix, e enquanto
  // a impressora está sendo paga a forma de pagamento fica TRAVADA na dela —
  // senão o cliente pagaria o semestral com a parcela de um mês, ou o mensal
  // com a de um semestre, e as contas não fechariam.
  const impressoras = useMinhasImpressoras();
  const imp = parcelaDasImpressoras(impressoras);

  // ⚠️ CONTRATO PARCELADO NÃO ESCOLHE PLANO: a parcela é a do contrato,
  // congelada por 12 meses (cl. 5ª § 3º). Mostrar mensal/semestral/anual a
  // quem assinou contrato convidaria a pagar um valor que não é o dele.
  const parcela = Number(sessao?.parcelaContrato) || 0;
  const [planoEscolhido, setPlanoId] = useState('mensal');
  const planoId = imp.forma || planoEscolhido;
  const planosVisiveis = imp.forma ? PLANOS.filter(p => p.id === imp.forma) : PLANOS;
  const plano = parcela
    ? { id: 'mensal', label: 'Parcela do contrato', meses: 1, dias: 30, desconto: 0 }
    : (PLANOS.find(p => p.id === planoId) || PLANOS[0]);
  const valorEncargo = Number(encargo?.valor) || 0;
  const valorSistema = parcela || precoPlano(plano, prod.id, extras, desconto);
  const valor = Math.round((valorSistema + imp.total + valorEncargo) * 100) / 100;
  const brcode = PIX_CHAVE
    ? montarPixBRCode({ chave: PIX_CHAVE, nome: PIX_NOME, cidade: PIX_CIDADE, valor, txid: plano.id.toUpperCase() })
    : '';

  const [qr, setQr] = useState('');
  const [avisando, setAvisando] = useState(false);
  const [confirmando, setConfirmando] = useState(false); // revela o campo do nome
  const [nomePagador, setNomePagador] = useState('');
  const [wppPronto, setWppPronto] = useState(''); // link do comprovante, se o pop-up for bloqueado

  // ⚠️ INDIQUE E GANHE (pedido do dono, 10/09/2026). A indicação viaja DENTRO
  // da mensagem: o restaurante indicado toca no link e já chega no WhatsApp da
  // Aurum dizendo quem indicou — sem código, sem cadastro, sem tabela nova. O
  // mês grátis é lançado à mão pelo painel quando o indicado paga (regras na
  // cláusula 2 dos Termos). Sem nome de restaurante (super-admin, demonstração)
  // a indicação chegaria sem dono, então o bloco nem aparece.
  const nomeCasa = sessao?.restauranteNome || '';
  const linkIndicacao = nomeCasa
    ? `https://wa.me/?text=${encodeURIComponent(
      'Uso o Aurum para as etiquetas de validade da cozinha e recomendo! Fale com a equipe por aqui: '
      + `https://wa.me/${WPP_NUMERO}?text=${encodeURIComponent(`Olá! Quero conhecer o Aurum. Fui indicado por ${nomeCasa}.`)}`,
    )}`
    : '';

  useEffect(() => {
    let vivo = true;
    // setState só nos callbacks assíncronos (nunca síncrono no corpo do efeito)
    const p = brcode ? QRCode.toDataURL(brcode, { margin: 1, width: 220 }) : Promise.resolve('');
    p.then(u => { if (vivo) setQr(u); }).catch(() => { if (vivo) setQr(''); });
    return () => { vivo = false; };
  }, [brcode]);

  const copiar = async (texto, msg) => {
    try { await navigator.clipboard.writeText(texto); toast(msg, 'sucesso'); }
    catch { toast('Não consegui copiar automaticamente — segure o dedo no texto.', 'erro'); }
  };

  const confirmarPagamento = async () => {
    if (avisando) return; // toque repetido
    if (!nomePagador.trim()) { toast('Diga o nome de quem fez o Pix.', 'erro'); return; }
    setAvisando(true);
    const url = linkWpp(plano, valor, nomePagador.trim(), sessao?.restauranteNome, prod.label, imp.total > 0);
    const erro = await avisarPagamento(plano.id, nomePagador.trim());
    setAvisando(false);
    if (erro) { toast('Não registrou o aviso: ' + erro, 'erro'); return; }
    toast('Recebemos seu aviso! Agora mande o comprovante no WhatsApp.', 'sucesso', { duracao: 6000 });
    // Guarda o link e mostra um botão: o navegador do celular BLOQUEIA
    // window.open chamado depois de um await (perdeu o gesto do usuário), e o
    // cliente ficava achando que tinha mandado o comprovante sem ter mandado.
    setWppPronto(url);
    window.open(url, '_blank', 'noopener,noreferrer'); // se passar, ótimo; se bloquear, o botão resolve
  };

  return (
    // ⚠️ `area="admin"` esconde a barra inferior e rotula o cabeçalho como
    // "Administração" — certo no app completo, onde a Assinatura mora lá
    // dentro. No plano Etiquetas não existe Administração: rotular assim
    // mandaria o cliente procurar uma área que a conta dele não tem, e ainda
    // tiraria a barra, deixando a tela sem saída.
    <Layout title="Planos e pagamento" area={prod.id === 'etiquetas' ? 'estoque' : 'admin'}>
      {/* Situação atual */}
      <div className={`rounded-2xl p-5 mb-6 flex items-center gap-4 ${st.tipo === 'vencido' || st.tipo === 'atraso' ? 'bg-red-700' : 'bg-polo-navy'}`}>
        <div className="w-14 h-14 bg-polo-gold/20 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
          <Icon name={st.tipo === 'assinatura' ? 'check' : st.tipo === 'teste' ? 'relogio' : st.tipo === 'vencido' || st.tipo === 'atraso' ? 'alerta' : 'loja'} size={28} className={st.tipo === 'vencido' || st.tipo === 'atraso' ? 'text-white' : 'text-polo-gold'} />
        </div>
        <div>
          <p className="text-xs text-white/80 uppercase tracking-wide">Situação</p>
          {/* ⚠️ "Conta administrativa" era o SENÃO de tudo, e caía em cliente:
              a conta que acabou de nascer esperando liberação e a de cortesia
              liam "Conta administrativa — sem cobrança" na tela onde vieram
              pagar. Cada situação diz a sua. "Vencido" também deixou de dizer
              "Teste encerrado": vale para assinatura que venceu. */}
          <p className={`font-bold text-xl ${st.tipo === 'vencido' || st.tipo === 'atraso' ? 'text-white' : 'text-polo-gold'}`}>
            {st.tipo === 'assinatura' ? 'Assinatura ativa'
              : st.tipo === 'teste' ? `Período de teste: ${plural(st.diasRestantes, 'dia', 'dias')}`
              : st.tipo === 'atraso' ? `Pagamento em atraso: ${plural(st.diasAtraso, 'dia', 'dias')}`
              : st.tipo === 'vencido' ? 'Acesso vencido'
              : st.tipo === 'aguardando' ? 'Aguardando liberação'
              : st.tipo === 'cortesia' ? 'Conta cortesia'
              : st.tipo === 'indeterminado' ? 'Situação indisponível'
              : 'Conta administrativa'}
          </p>
          <p className="text-white/80 text-xs mt-0.5">
            {st.tipo === 'assinatura' ? `Válida até ${fmtData(dataISO(st.ate))}`
              : st.tipo === 'teste' ? `Teste grátis até ${fmtData(dataISO(st.ate))} — depois, assine para continuar`
              : st.tipo === 'atraso' ? `Pague até ${fmtData(dataISO(st.suspendeEm))} para não ter o acesso suspenso`
              : st.tipo === 'vencido' ? 'Assine para voltar a usar o sistema'
              : st.tipo === 'aguardando' ? 'A equipe Aurum libera o seu acesso. Se já quiser assinar, pague aqui.'
              : st.tipo === 'cortesia' ? 'Sem cobrança por enquanto, por acordo com a Aurum'
              : st.tipo === 'indeterminado' ? 'Não consegui conferir agora — veja a conexão'
              : 'Sem cobrança para esta conta'}
          </p>
        </div>
      </div>

      {/* cobrança à parte lançada pela Aurum (M54) — logo no começo: é conta a pagar */}
      <SecaoCobrancasAvulsas pix={{ chave: PIX_CHAVE, nome: PIX_NOME, cidade: PIX_CIDADE }} whatsapp={WPP_NUMERO} />

      {/* Aviso de antecedência — a reativação é manual */}
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-5 flex items-start gap-2">
        <span className="flex-shrink-0 text-amber-800" aria-hidden="true"><Icon name="relogio" size={18} /></span>
        <p className="text-xs text-amber-800">
          <strong>Pague com 24h de antecedência.</strong> A confirmação do Pix e a reativação são feitas
          pela equipe (em até 24h úteis) — não deixe para o último dia para não ficar sem o sistema.
        </p>
      </div>

      {/* Escolha do plano — ou a parcela do contrato, que não se escolhe */}
      {parcela ? (<>
        <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2">Sua parcela</p>
        <div className="rounded-2xl p-4 border-2 border-polo-gold bg-polo-beige mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="font-bold text-polo-navy">Parcela do contrato</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Valor fixo durante os 12 meses do contrato</p>
          </div>
          <span className="text-lg font-bold text-polo-navy flex-shrink-0">{brl(parcela)}</span>
        </div>
      </>) : (<>
      <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-2">Escolha o plano</p>
      {/* desconto combinado com a Aurum (M54): o cliente vê o que ganhou e até quando */}
      {desconto && (
        <p className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-2">
          Desconto combinado: <strong>{rotuloDesconto(desconto)}</strong> a menos no mês
          {desconto.ate ? ` até ${fmtData(desconto.ate)}` : ''}. Os valores abaixo já estão com ele.
        </p>
      )}
      {imp.forma && (
        <p className="text-xs text-polo-navy bg-polo-beige border border-polo-gold/40 rounded-xl px-3 py-2 mb-2">
          Enquanto a impressora está sendo paga, o plano fica no <strong>{plano.label.toLowerCase()}</strong>: a
          parcela dela vem junto, no mesmo Pix.
        </p>
      )}
      <div className="space-y-2 mb-5" role="radiogroup" aria-label="Duração do plano">
        {planosVisiveis.map(p => {
          const sel = p.id === planoId;
          const total = precoPlano(p, prod.id, extras, desconto);
          const cheio = precoPlano(p, prod.id, extras);
          return (
            <button key={p.id} onClick={() => setPlanoId(p.id)} role="radio" aria-checked={sel}
              className={`w-full text-left rounded-2xl p-4 border-2 transition-colors
                ${sel ? 'border-polo-gold bg-polo-beige' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-polo-navy">{p.label}</span>
                    {p.desconto > 0 && (
                      <span className="text-[11px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                        −{Math.round(p.desconto * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {p.meses === 1 ? 'Cobrado todo mês'
                      : `${brl(precoMensalEquivalente(p, prod.id, extras, desconto))}/mês · economize ${brl(economiaPlano(p, prod.id, extras, desconto))}`}
                  </p>
                </div>
                <div className="text-right flex items-center gap-2">
                  <div>
                    {cheio > total && (
                      <span className="block text-[11px] text-gray-500 line-through">{brl(cheio)}</span>
                    )}
                    <span className="text-lg font-bold text-polo-navy">{brl(total)}</span>
                    <span className="block text-[11px] text-gray-500">
                      {p.meses === 1 ? 'por mês' : `a cada ${p.meses} meses`}
                    </span>
                  </div>
                  <span className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                    ${sel ? 'border-polo-gold bg-polo-gold' : 'border-gray-300'}`}>
                    {sel && <span className="w-2 h-2 rounded-full bg-polo-navy" />}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {extras > 0 && (
        <p className="text-[11px] text-gray-600 -mt-3 mb-5 px-1">
          Inclui {extras} unidade(s) adicional(is) nesta conta: {brl(adicionalUnidade(prod.id))} por unidade, por mês.
        </p>
      )}
      </>)}

      {/* ⚠️ O QUE COMPÕE O PIX quando há impressora: o valor do QR deixa de
          ser o do plano, e sem as linhas o cliente acharia a cobrança errada. */}
      {imp.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 mb-5 text-xs text-gray-700 space-y-1">
          <p className="flex justify-between gap-2"><span>Sistema ({plano.label.toLowerCase()})</span><span>{brl(valorSistema)}</span></p>
          {imp.linhas.map(l => (
            <p key={l.id} className="flex justify-between gap-2">
              <span>Impressora: parcela {l.numero} de {l.de}</span><span>{brl(l.valor)}</span>
            </p>
          ))}
          {valorEncargo > 0 && <p className="flex justify-between gap-2"><span>Encargos de atraso</span><span>{brl(valorEncargo)}</span></p>}
          <p className="flex justify-between gap-2 font-bold text-polo-navy border-t border-gray-100 pt-1"><span>Total do Pix</span><span>{brl(valor)}</span></p>
        </div>
      )}

      {/* ⚠️ OS ENCARGOS APARECEM SEPARADOS antes do Pix: o cliente precisa ver
          de onde saiu cada centavo a mais — senão o QR parece cobrança errada
          e a conversa vira reclamação em vez de pagamento. */}
      {encargo && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-5 text-xs text-amber-900 space-y-1">
          <p className="font-bold">Encargos de atraso (contrato, cláusula 6ª)</p>
          <p>
            Multa de 2%: {brl(Number(encargo.multa) || 0)} · Juros de {plural(encargo.dias_atraso, 'dia', 'dias')}: {brl(Number(encargo.juros) || 0)}
          </p>
          <p>Total de encargos: <strong>{brl(valorEncargo)}</strong> — já somado no valor do Pix abaixo.</p>
        </div>
      )}

      {/* Pagamento por Pix */}
      {PIX_CHAVE ? (
        <div className="border-2 border-polo-gold bg-white rounded-2xl p-5 mb-5">
          <p className="font-bold text-polo-navy">Pague por Pix — {brl(valor)}</p>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Plano {plano.label}{imp.total > 0 ? ', com a parcela da impressora' : ''}. O valor já vem preenchido no QR e no código.
          </p>

          {qr && (
            <div className="flex justify-center mb-3">
              <img src={qr} alt="QR Code do Pix" className="w-52 h-52 rounded-lg border border-gray-200" />
            </div>
          )}

          <button onClick={() => copiar(brcode, 'Código Pix copiado! Cole no app do seu banco.')}
            className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm mb-2">
            Copiar código Pix (copia e cola)
          </button>

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
            <p><strong>Recebedor:</strong> {PIX_NOME}</p>
            <p className="flex items-center gap-2">
              <strong>Chave:</strong>
              <span className="font-mono break-all">{PIX_CHAVE}</span>
              <button onClick={() => copiar(PIX_CHAVE, 'Chave Pix copiada!')}
                className="text-polo-navy font-semibold underline underline-offset-2 flex-shrink-0">copiar</button>
            </p>
            <p><strong>Valor:</strong> {brl(valor)}</p>
          </div>

          {wppPronto ? (
            <div className="mt-3 bg-green-50 border border-green-300 rounded-xl p-3">
              <p className="text-xs text-green-800 mb-2">
                Aviso registrado. Agora <strong>envie o comprovante</strong> para a equipe confirmar:
              </p>
              <a href={wppPronto} target="_blank" rel="noopener noreferrer"
                className="block w-full bg-green-600 text-white font-bold py-3 rounded-xl text-sm text-center">
                Abrir WhatsApp e enviar comprovante
              </a>
            </div>
          ) : !confirmando ? (
            <button onClick={() => setConfirmando(true)}
              className="w-full mt-3 border-2 border-polo-navy text-polo-navy font-bold py-3 rounded-xl text-sm">
              Já paguei
            </button>
          ) : (
            <div className="mt-3 bg-polo-beige rounded-xl p-3">
              <label className="block text-xs font-semibold text-polo-navy mb-1">Nome de quem fez o Pix</label>
              <input aria-label="Nome de quem fez o Pix" value={nomePagador} onChange={e => setNomePagador(e.target.value)}
                placeholder="Ex.: João da Silva" autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 mb-2" />
              <button onClick={confirmarPagamento} disabled={avisando}
                className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm disabled:opacity-60">
                {avisando ? 'Enviando…' : 'Confirmar e enviar comprovante'}
              </button>
            </div>
          )}
          <p className="text-[11px] text-gray-600 text-center mt-1.5">
            Ao confirmar, a equipe Aurum é avisada (com o nome e o horário) e o WhatsApp abre para você
            anexar o comprovante. A ativação sai em até 24h úteis.
          </p>
        </div>
      ) : (
        /* Sem chave Pix configurada ainda → só WhatsApp */
        <div className="border-2 border-polo-gold bg-polo-beige rounded-2xl p-5 mb-5">
          <p className="font-bold text-polo-navy mb-1">Assinar o plano {plano.label} — {brl(valor)}</p>
          <p className="text-xs text-gray-600 mb-3">Fale com a equipe Aurum pelo WhatsApp para receber os dados do Pix e ativar.</p>
          {wppPronto ? (
            <a href={wppPronto} target="_blank" rel="noopener noreferrer"
              className="block w-full bg-green-600 text-white font-bold py-3 rounded-xl text-sm text-center">
              Abrir WhatsApp e enviar comprovante
            </a>
          ) : !confirmando ? (
            <button onClick={() => setConfirmando(true)}
              className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm">
              Falar no WhatsApp
            </button>
          ) : (
            <div className="bg-white rounded-xl p-3">
              <label className="block text-xs font-semibold text-polo-navy mb-1">Seu nome (de quem vai pagar)</label>
              <input aria-label="Seu nome (de quem vai pagar)" value={nomePagador} onChange={e => setNomePagador(e.target.value)}
                placeholder="Ex.: João da Silva" autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 mb-2" />
              <button onClick={confirmarPagamento} disabled={avisando}
                className="w-full bg-polo-navy text-polo-gold font-bold py-3 rounded-xl text-sm disabled:opacity-60">
                {avisando ? 'Abrindo…' : 'Continuar no WhatsApp'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* O que está incluído */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
        <p className="font-bold text-polo-navy text-sm mb-2">
          Incluído no {prod.label}, em qualquer duração
        </p>
        <ul className="space-y-1.5">
          {(RECURSOS_POR_PRODUTO[prod.id] || RECURSOS_POR_PRODUTO.completo)
            .map((r, i) => <li key={i} className="text-sm text-gray-700">{r}</li>)}
        </ul>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-bold mb-1 flex items-center gap-1.5"><Icon name="info" size={14} />Como funciona</p>
        {/* ⚠️ Dizia "todo restaurante novo tem 14 dias de teste grátis" — regra
            que acabou em 03/09/2026 (M41): o teste deixou de ser automático e
            passou a ser liberado pela Aurum, conta a conta. O dono achou a
            frase velha na tela em 10/09. Esta caixa descreve só o que acontece
            HOJE, sem prometer prazo de teste nenhum. */}
        <p>Escolha o plano e pague por Pix. Depois toque em <strong>“Já paguei”</strong> e
        mande o comprovante pelo WhatsApp. A equipe Aurum confirma o pagamento e ativa a sua
        assinatura em até 24h úteis — você recebe a confirmação pelo WhatsApp.</p>
      </div>

      {/* ⚠️ O QUE A CONTA PODE TER A MAIS (27/09/2026): unidades, contas e o
          Pro saíram da Administração e moram aqui, junto do dinheiro. */}
      <div className="mt-5">
        <SecaoImpressora impressoras={impressoras} />
        <SecaoUnidades />
        <SecaoContas />
        <SecaoCozinhaPro />
      </div>

      {linkIndicacao && (
        <div className="bg-polo-navy rounded-2xl p-5 mt-5 space-y-2">
          <p className="text-polo-gold font-bold">Indique e ganhe 1 mês grátis</p>
          <p className="text-sm text-white/90">
            Indique o Aurum para outro restaurante. Se ele contratar e o primeiro pagamento for
            confirmado, você ganha <strong>1 mês grátis</strong> no seu plano.
          </p>
          <a href={linkIndicacao} target="_blank" rel="noopener noreferrer"
            className="block w-full bg-polo-gold text-polo-navy font-bold py-3 rounded-xl text-sm text-center min-h-11">
            Indicar pelo WhatsApp
          </a>
          <p className="text-[11px] text-white/70">
            A mensagem já leva o nome do seu restaurante, para sabermos que a indicação foi sua.
            Regras na cláusula 2 dos Termos de uso.
          </p>
        </div>
      )}
    </Layout>
  );
}
