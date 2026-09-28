import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { montarPixBRCode } from '../utils/pix';
import { Link } from 'react-router-dom';
import Botao from './Botao';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { supabase } from '../lib/supabase';
import {
  statusAssinatura, produtoDe, PRODUTOS, fmtPreco, mensalCombinado, adicionalUnidade,
} from '../utils/assinatura';
import { unidadesAtivas, opcoesDeUnidade } from '../utils/unidades';
import { formatarCNPJ, validarCNPJ, soDigitos, UFS } from '../utils/documentos';
import { fmtData, isoLocal } from '../utils/formatters';
import { plural } from '../utils/formatters';

// =====================================================================
//  PLANOS E PAGAMENTO — o que a conta pode ter a mais (pedido do dono,
//  27/09/2026). Antes isto morava espalhado na Administração do cliente
//  (plano, anúncio do Pro, "Preciso de outra unidade"), e o dono achou
//  informação demais. Agora tudo que é conta e dinheiro fica numa tela só, e
//  a Administração guarda UMA linha que leva para cá.
//
//  ⚠️ OS PEDIDOS VÃO COMO "pedido" DA AJUDA (enviar_feedback), com campos
//  próprios: o painel da Aurum reconhece `tipoPedido` e oferece o atalho
//  ("Criar esta unidade", "Abrir o cliente") — ninguém precisa redigitar CNPJ.
// =====================================================================

const brl = (v) => `R$ ${fmtPreco(v)}`;

/** Pode pedir? Só a conta dona de verdade — não o suporte da Aurum nem a demonstração. */
function usePodePedir() {
  const { sessao, impersonando } = useAuth();
  return !impersonando && !sessao?.eSuperAdmin && sessao?.cargo === 'diretoria';
}

async function enviarPedido(sessao, dados) {
  if (sessao?.demo) return 'demo';
  const { error } = await supabase.rpc('enviar_feedback', {
    p_tipo: 'pedido',
    p_dados: { ...dados, casaHoje: sessao?.restauranteNome || '', plano: sessao?.produto || '' },
    p_contexto: `${sessao?.cargo || '?'} · planos e pagamento`,
  });
  return error ? (error.message || 'erro') : null;
}

/**
 * A linha da Administração: plano, situação e o caminho para "Planos e
 * pagamento". Em atraso ou vencido, fica em destaque.
 */
export function ResumoDoPlano() {
  const { sessao } = useAuth();
  const { unidades } = useApp();
  const st = statusAssinatura(sessao);
  const prod = produtoDe(sessao);
  const extras = unidadesAtivas(unidades).length;
  const parcela = Number(sessao?.parcelaContrato) || 0;
  const data = (ms) => fmtData(isoLocal(new Date(ms)));
  const alerta = st.tipo === 'atraso' || st.tipo === 'vencido';
  const situacao = st.tipo === 'assinatura' ? `em dia até ${data(st.ate)}`
    : st.tipo === 'atraso' ? `pagamento em atraso — suspende em ${data(st.suspendeEm)}`
    : st.tipo === 'teste' ? `teste grátis até ${data(st.ate)}`
    : st.tipo === 'isento' ? 'sem cobrança'
    : st.tipo === 'cortesia' ? 'cortesia'
    : st.tipo === 'aguardando' ? 'aguardando liberação'
    : 'assinatura vencida';
  const valor = parcela ? brl(parcela) : brl(mensalCombinado(prod.id, extras, sessao?.desconto));
  return (
    <Link to="/pagamento"
      className={`mb-4 rounded-xl px-4 py-3 flex items-center justify-between gap-3 min-h-11 border
        ${alerta ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'}`}>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-polo-navy">Planos e pagamento</span>
        <span className={`block text-xs ${alerta ? 'text-red-800 font-semibold' : 'text-gray-600'}`}>
          {prod.label} · {situacao}{st.tipo === 'isento' ? '' : ` · ${valor}/mês`}
        </span>
      </span>
      <span className="text-polo-navy text-lg flex-shrink-0" aria-hidden>›</span>
    </Link>
  );
}

/**
 * Mais unidades (outro CNPJ): como funciona, quanto fica, e o pedido.
 */
export function SecaoUnidades() {
  const { unidades } = useApp();
  const { sessao, impersonando } = useAuth();
  const { toast } = useUI();
  const podePedir = usePodePedir();
  const prod = produtoDe(sessao);
  const extras = unidadesAtivas(unidades).length;
  const parcela = Number(sessao?.parcelaContrato) || 0;
  const nomeConta = impersonando?.restauranteNome || sessao?.restauranteNome;
  const cnpjConta = impersonando ? null : sessao?.cnpj;
  const [form, setForm] = useState(null); // { nome, cnpj, cidade, uf }
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const nome = (form.nome || '').trim();
    if (!nome) { toast('Escreva o nome da casa, como deve sair na etiqueta.', 'aviso'); return; }
    if (!validarCNPJ(form.cnpj)) { toast('Confira o CNPJ: ele sai impresso na etiqueta da unidade.', 'aviso'); return; }
    setEnviando(true);
    const erro = await enviarPedido(sessao, {
      tipoPedido: 'unidade',
      pedido: `Nova unidade: ${nome} — CNPJ ${formatarCNPJ(form.cnpj)}${form.cidade ? ` — ${form.cidade.trim()}/${form.uf}` : ''}`,
      unidadeNome: nome, unidadeCnpj: soDigitos(form.cnpj),
      unidadeCidade: (form.cidade || '').trim(), unidadeUf: form.uf || '',
    });
    setEnviando(false);
    if (erro === 'demo') { toast('Demonstração: nada foi enviado de verdade.', 'aviso'); setForm(null); return; }
    if (erro) { toast(`Não enviou: ${erro}`, 'erro'); return; }
    setForm(null);
    toast('Pedido enviado. A Aurum confere o CNPJ, cria a unidade e responde na Ajuda.', 'sucesso', { duracao: 7000 });
  };

  return (
    <section id="unidades" className="scroll-mt-40 bg-white border border-gray-200 rounded-2xl p-5 mb-5 space-y-3">
      <div>
        <p className="font-bold text-polo-navy text-sm">Mais unidades (outro CNPJ)</p>
        <p className="text-xs text-gray-600 mt-1">
          Tem outra casa? Ela entra nesta mesma conta como uma unidade, com o nome e o CNPJ dela na
          etiqueta. Os itens cadastrados, a equipe e os relatórios ficam juntos, e cada aparelho escolhe
          em qual unidade está.
        </p>
      </div>

      <ul className="space-y-1.5">
        {opcoesDeUnidade(unidades, nomeConta).map(u => (
          <li key={u.id || 'principal'} className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-700">
            <strong className="text-polo-navy">{u.nome}</strong>
            {u.principal ? ' · principal' : ` · ${brl(adicionalUnidade(prod.id))}/mês`}
            {(u.principal ? cnpjConta : u.cnpj) ? ` · CNPJ ${formatarCNPJ(u.principal ? cnpjConta : u.cnpj)}` : ''}
          </li>
        ))}
      </ul>

      <div className="bg-polo-beige rounded-xl p-3 text-xs text-polo-navy space-y-1">
        <p><strong>Quanto custa:</strong> {brl(adicionalUnidade(prod.id))} por unidade, por mês (1/3 do plano {prod.label}).</p>
        {parcela ? (
          <p>Sua conta tem contrato: o adicional entra na parcela, e a Aurum combina o valor novo com você.</p>
        ) : (
          <p>Com mais uma unidade, o seu mês passa de {brl(mensalCombinado(prod.id, extras, sessao?.desconto))} para{' '}
            <strong>{brl(mensalCombinado(prod.id, extras + 1, sessao?.desconto))}</strong>. O desconto do semestral e do anual vale sobre o total.</p>
        )}
        <p><strong>Como funciona:</strong> você pede aqui, a Aurum confere o CNPJ e cria a unidade. O adicional
          começa na próxima cobrança depois disso, sem cobrar os dias quebrados, e é pago junto com o plano, nesta conta.</p>
      </div>

      {podePedir && !form && (
        <Botao tamanho="sm" variante="secundario" onClick={() => setForm({ nome: '', cnpj: '', cidade: '', uf: 'PE' })}>
          Quero mais uma unidade
        </Botao>
      )}
      {form && (
        <div className="border border-polo-gold/50 rounded-xl p-3 space-y-2">
          <input type="text" value={form.nome} maxLength={60} placeholder="Nome da casa (sai na etiqueta)" aria-label="Nome da unidade"
            onChange={e => setForm(v => ({ ...v, nome: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input type="text" inputMode="numeric" value={form.cnpj} placeholder="CNPJ da casa" aria-label="CNPJ da unidade"
            onChange={e => setForm(v => ({ ...v, cnpj: formatarCNPJ(e.target.value) }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input type="text" value={form.cidade} placeholder="Cidade" aria-label="Cidade da unidade"
              onChange={e => setForm(v => ({ ...v, cidade: e.target.value }))}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <select value={form.uf} aria-label="UF da unidade" onChange={e => setForm(v => ({ ...v, uf: e.target.value }))}
              className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
              {UFS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <Botao tamanho="sm" variante="secundario" onClick={() => setForm(null)} disabled={enviando}>Cancelar</Botao>
            <Botao tamanho="sm" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar pedido'}</Botao>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Mais contas da equipe: quantas o plano inclui, quantas estão em uso, e o
 * pedido. Sem cobrança (decisão do dono, 27/09/2026): a Aurum libera no painel.
 */
export function SecaoContas() {
  const { sessao, usuarios } = useAuth();
  const { toast } = useUI();
  const podePedir = usePodePedir();
  const max = sessao?.maxUsuarios || 3;
  const ativos = (usuarios || []).filter(u => u.ativo !== false).length;
  const [pedindo, setPedindo] = useState(false);
  const [quantas, setQuantas] = useState(1);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    const erro = await enviarPedido(sessao, {
      tipoPedido: 'contas', quantas,
      pedido: `Mais ${plural(quantas, 'conta', 'contas')} da equipe (hoje: ${ativos} de ${max})`,
      motivo: motivo.trim(),
    });
    setEnviando(false);
    if (erro === 'demo') { toast('Demonstração: nada foi enviado de verdade.', 'aviso'); setPedindo(false); return; }
    if (erro) { toast(`Não enviou: ${erro}`, 'erro'); return; }
    setPedindo(false); setMotivo('');
    toast('Pedido enviado. A resposta chega na Ajuda.', 'sucesso', { duracao: 6000 });
  };

  return (
    <section id="contas" className="scroll-mt-40 bg-white border border-gray-200 rounded-2xl p-5 mb-5 space-y-3">
      <div>
        <p className="font-bold text-polo-navy text-sm">Contas da equipe</p>
        <p className="text-xs text-gray-600 mt-1">
          Seu plano inclui <strong>{max} contas</strong> (a sua e as da equipe). Em uso: <strong>{ativos}</strong>.
          Precisa de mais? Peça aqui, sem custo: a Aurum avalia e libera.
        </p>
      </div>
      {podePedir && !pedindo && (
        <Botao tamanho="sm" variante="secundario" onClick={() => setPedindo(true)}>Pedir mais contas</Botao>
      )}
      {pedindo && (
        <div className="border border-polo-gold/50 rounded-xl p-3 space-y-2">
          <label className="flex items-center justify-between gap-2 text-sm text-polo-navy">
            Quantas a mais?
            <select value={quantas} onChange={e => setQuantas(Number(e.target.value))} aria-label="Quantas contas a mais"
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white min-h-11">
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300}
            placeholder="Para quem? (opcional)" aria-label="Para quem são as contas"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <Botao tamanho="sm" variante="secundario" onClick={() => setPedindo(false)} disabled={enviando}>Cancelar</Botao>
            <Botao tamanho="sm" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar pedido'}</Botao>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * O Aurum Cozinha Pro — veio da Administração do plano Etiquetas. Some para
 * quem já tem o completo.
 *
 * ⚠️ Enquanto `emBreve` estiver ligado, anuncia sem prometer: o toque vira
 * PEDIDO (fila de interessados), não pagamento.
 */
export function SecaoCozinhaPro() {
  const { sessao } = useAuth();
  const { abrirAjuda } = useUI();
  const prod = produtoDe(sessao);
  if (prod.id !== 'etiquetas') return null;
  return (
    <section className="bg-polo-navy rounded-2xl p-5 mb-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-polo-gold">O Aurum Cozinha Pro</p>
        {PRODUTOS.completo.emBreve
          ? <span className="text-[10px] font-bold text-polo-navy bg-polo-gold rounded-full px-2 py-0.5 flex-shrink-0">em breve</span>
          : <span className="text-xs text-white/80 flex-shrink-0">{brl(PRODUTOS.completo.precoMes)}/mês</span>}
      </div>
      <ul className="text-xs text-white/90 space-y-1">
        <li>Estoque com entradas, saídas e contagem</li>
        <li>Compras, produção por ficha e receitas</li>
        <li>Relatórios de consumo, perdas e custo</li>
      </ul>
      <p className="text-[11px] text-white/70">Seus itens e etiquetas continuam onde estão.</p>
      {PRODUTOS.completo.emBreve ? (
        <Botao variante="sobreNavy" tamanho="sm" onClick={() => abrirAjuda('pedido')}>Quero saber quando abrir</Botao>
      ) : (
        <Botao variante="sobreNavy" tamanho="sm" onClick={() => abrirAjuda('pedido')}>Quero o Cozinha Pro</Botao>
      )}
    </section>
  );
}

/**
 * COBRANÇA À PARTE (M54): o que a Aurum lançou fora do plano — por exemplo a
 * unidade criada no meio de um semestral ou anual já pago. Cada uma com o seu
 * Pix (valor já no código) e o "Já paguei", que avisa a equipe e abre o
 * WhatsApp para o comprovante. Some quando não há nada pendente.
 */
export function SecaoCobrancasAvulsas({ pix, whatsapp }) {
  const { sessao, impersonando, avisarPagamento } = useAuth();
  const { toast } = useUI();
  const [lista, setLista] = useState([]);
  const [aberta, setAberta] = useState(''); // id com o Pix à mostra
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!sessao?.restauranteId || sessao.demo || sessao.eSuperAdmin || impersonando) return undefined;
    let vivo = true;
    supabase.rpc('minhas_cobrancas_avulsas')
      .then(({ data }) => { if (vivo) setLista(Array.isArray(data) ? data : []); })
      .catch(() => { /* sem rede: a seção só não aparece */ });
    return () => { vivo = false; };
  }, [sessao?.restauranteId, sessao?.demo, sessao?.eSuperAdmin, impersonando]);

  const c = lista.find(x => x.id === aberta);
  const brcode = c && pix?.chave
    ? montarPixBRCode({ chave: pix.chave, nome: pix.nome, cidade: pix.cidade, valor: Number(c.valor), txid: 'AVULSA' })
    : '';
  useEffect(() => {
    let vivo = true;
    (brcode ? QRCode.toDataURL(brcode, { margin: 1, width: 220 }) : Promise.resolve(''))
      .then(u => { if (vivo) setQr(u); }).catch(() => { if (vivo) setQr(''); });
    return () => { vivo = false; };
  }, [brcode]);

  if (!lista.length) return null;

  const jaPaguei = (item) => {
    const msg = encodeURIComponent(`Olá! Paguei a cobrança à parte "${item.descricao}" (${brl(Number(item.valor))}) — restaurante ${sessao?.restauranteNome || ''}. Segue o comprovante:`);
    // abre ANTES de qualquer espera: o celular bloqueia janela aberta depois de um await
    window.open(`https://wa.me/${whatsapp}?text=${msg}`, '_blank', 'noopener,noreferrer');
    avisarPagamento?.('cobrança à parte', sessao?.nome || null).then(erro => {
      if (erro) toast(`O aviso não foi registrado: ${erro}`, 'aviso');
      else toast('Aviso enviado. Mande o comprovante no WhatsApp.', 'sucesso');
    });
  };

  return (
    <section id="cobrancas" className="scroll-mt-40 bg-white border-2 border-polo-gold rounded-2xl p-5 mb-5 space-y-3">
      <div>
        <p className="font-bold text-polo-navy text-sm">Cobrança à parte</p>
        <p className="text-xs text-gray-600 mt-1">Combinada com a Aurum, fora do plano. Pague cada uma pelo Pix abaixo.</p>
      </div>
      {lista.map(item => (
        <div key={item.id} className="bg-polo-beige rounded-xl p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-polo-navy min-w-0">{item.descricao}</p>
            <strong className="text-polo-navy flex-shrink-0">{brl(Number(item.valor))}</strong>
          </div>
          {aberta === item.id ? (
            <div className="space-y-2">
              {qr && <img src={qr} alt="QR Code do Pix da cobrança à parte" className="w-48 h-48 mx-auto rounded-lg border border-gray-200" />}
              {brcode && (
                <Botao tamanho="sm" onClick={async () => {
                  try { await navigator.clipboard.writeText(brcode); toast('Código Pix copiado.', 'sucesso'); }
                  catch { toast('Não consegui copiar — segure o dedo no código.', 'erro'); }
                }}>Copiar código Pix</Botao>
              )}
              <Botao tamanho="sm" variante="secundario" onClick={() => jaPaguei(item)}>Já paguei</Botao>
            </div>
          ) : (
            <Botao tamanho="sm" variante="secundario" onClick={() => setAberta(item.id)}>Pagar esta cobrança</Botao>
          )}
        </div>
      ))}
    </section>
  );
}
