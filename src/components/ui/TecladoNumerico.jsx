import { useState, useEffect, useRef, useId } from 'react';
import Dialogo from '../Dialogo';
import Icon from '../Icons';
import { UNIDADES_DA_MEDIDA, lerMedida, textoDaMedida, unidadeParaAbrir, teclar } from '../../utils/medida';

// =====================================================================
//  TECLADO NUMÉRICO GRANDE (23/11/2026, jeito do Magurō, pedido do dono)
//
//  Números com o dedo molhado, sem o teclado pequeno do celular por cima da
//  tela: teclas de 64 px, o número em letra grande e, na medida, a unidade
//  em botões. Abre numa janela própria por cima da que pediu (camada 130).
//
//  ⚠️ O PRIMEIRO TOQUE SUBSTITUI o valor que veio sugerido (como no Magurō):
//  a medida "1 kg" do cadastro vira "5" ao tocar no 5, sem apagar antes.
//  ⚠️ AS TECLAS DO COMPUTADOR VALEM (números, vírgula, apagar, Enter, Esc) —
//  ouvidas na janela, na fase de CAPTURA: a janela de imprimir que está
//  embaixo também ouve o Esc, e só esta deve fechar.
// =====================================================================

const teclaBase = 'h-16 rounded-2xl text-3xl font-black active:scale-95 transition-transform disabled:opacity-30';

/**
 * @param {object} props
 * @param {string} props.titulo
 * @param {string} [props.numeroInicial]   o número que já existe ("1,5")
 * @param {string[]} [props.unidades]      botões de unidade (sem: só o número)
 * @param {string} [props.unidadeInicial]
 * @param {boolean} [props.decimal]        aceita vírgula
 * @param {string} [props.livreInicial]    texto livre que já existe ("1 pote")
 * @param {boolean} [props.permitirLivre]  mostra "Outra medida" (texto livre)
 * @param {string} [props.rotuloVazio]     botão que deixa SEM valor (ex.: "Sem medida")
 * @param {Function} props.aoConfirmar     ({ numero, unidade, livre }) — numero '' = vazio
 * @param {Function} props.aoFechar
 */
export function TecladoNumerico({
  titulo, numeroInicial = '', unidades = null, unidadeInicial = '', decimal = true,
  livreInicial = '', permitirLivre = false, rotuloVazio = '', aoConfirmar, aoFechar,
}) {
  const [numero, setNumero] = useState(numeroInicial);
  // o 1º toque substitui o sugerido
  const [novo, setNovo] = useState(true);
  const [unidade, setUnidade] = useState(unidadeInicial || unidades?.[0] || '');
  const [livre, setLivre] = useState(livreInicial);
  const [modoLivre, setModoLivre] = useState(permitirLivre && !!livreInicial);
  const idUnidades = useId();

  const valido = modoLivre ? livre.trim().length > 0 : textoDaMedida(numero, '') !== '';
  const tocar = (t) => { setNumero(n => teclar(novo ? '' : n, t, { decimal })); setNovo(false); };
  const apagar = () => { setNumero(n => (novo ? '' : n.slice(0, -1))); setNovo(false); };
  const confirmar = () => {
    if (!valido) return;
    aoConfirmar(modoLivre ? { numero: '', unidade: '', livre: livre.trim() } : { numero, unidade, livre: '' });
  };

  // as teclas do computador — ver o ⚠️ do topo. O que a pessoa digita NUM
  // CAMPO (a "Outra medida") passa direto para o campo.
  const ref = useRef({});
  ref.current = { tocar, apagar, confirmar, aoFechar, modoLivre }; // eslint-disable-line react-hooks/refs
  useEffect(() => {
    const naTecla = (e) => {
      const r = ref.current;
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); r.aoFechar(); return; }
      const noCampo = e.target instanceof HTMLElement && e.target.matches('input, textarea, select');
      if (noCampo || r.modoLivre || e.ctrlKey || e.metaKey || e.altKey) return;
      let usou = true;
      if (/^\d$/.test(e.key)) r.tocar(e.key);
      else if (e.key === ',' || e.key === '.') r.tocar(',');
      else if (e.key === 'Backspace') r.apagar();
      else if (e.key === 'Enter') r.confirmar();
      else usou = false;
      if (usou) { e.stopPropagation(); e.preventDefault(); }
    };
    window.addEventListener('keydown', naTecla, true);
    return () => window.removeEventListener('keydown', naTecla, true);
  }, []);

  const mostrado = numero || '0';
  return (
    <Dialogo aoFechar={aoFechar} titulo={titulo} forma="caixa" largura="sm" camada={130} respiro="p5" classeCaixa="space-y-3">
      {modoLivre ? (
        <label className="block">
          <span className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">Escreva a medida</span>
          <input type="text" value={livre} maxLength={20} autoFocus placeholder="ex.: 1 pote"
            onChange={e => setLivre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmar(); }}
            className="w-full min-h-14 rounded-2xl border-[3px] border-polo-navy px-4 text-2xl font-bold text-polo-navy bg-white" />
        </label>
      ) : (
        // ⚠️ o número fica "apagado" (cinza) enquanto ainda é o sugerido:
        // a pessoa vê que o próximo toque troca tudo
        <output aria-live="polite" aria-label={`Valor: ${textoDaMedida(numero, unidade) || 'vazio'}`}
          className={`block rounded-2xl border-4 px-4 py-2 text-right tabular-nums
            ${novo ? 'border-polo-gold' : 'border-polo-navy'}`}>
          <span className={`text-5xl font-black ${novo ? 'text-gray-500' : 'text-polo-navy'}`}>{mostrado}</span>
          {unidade && <span className="text-2xl font-bold text-gray-600 ml-2">{unidade}</span>}
        </output>
      )}

      {(unidades?.length > 0 || permitirLivre) && (
        <div role="group" aria-labelledby={idUnidades}>
          <p id={idUnidades} className="sr-only">Unidade</p>
          <div className="flex flex-wrap gap-2">
            {(unidades || []).map(u => {
              const marcada = !modoLivre && unidade === u;
              return (
                <button key={u} type="button" aria-pressed={marcada}
                  onClick={() => { setUnidade(u); setModoLivre(false); }}
                  className={`min-h-12 min-w-14 px-3 rounded-xl text-lg font-black border-[3px]
                    ${marcada ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'bg-white text-polo-navy border-polo-navy/15'}`}>
                  {u}
                </button>
              );
            })}
            {permitirLivre && (
              <button type="button" aria-pressed={modoLivre} onClick={() => setModoLivre(m => !m)}
                className={`min-h-12 px-3 rounded-xl text-base font-bold border-[3px]
                  ${modoLivre ? 'bg-polo-navy text-polo-gold border-polo-navy' : 'bg-white text-polo-navy border-polo-navy/15'}`}>
                Outra medida
              </button>
            )}
          </div>
        </div>
      )}

      {!modoLivre && (
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(t => (
            <button key={t} type="button" onClick={() => tocar(t)} className={`${teclaBase} bg-gray-100 text-polo-navy`}>{t}</button>
          ))}
          <button type="button" onClick={() => tocar(',')} disabled={!decimal} aria-label="Vírgula"
            className={`${teclaBase} bg-gray-100 text-polo-navy`}>,</button>
          <button type="button" onClick={() => tocar('0')} className={`${teclaBase} bg-gray-100 text-polo-navy`}>0</button>
          <button type="button" onClick={apagar} aria-label="Apagar"
            className={`${teclaBase} bg-gray-200 text-polo-navy flex items-center justify-center`}>
            <Icon name="apagar" size={28} />
          </button>
        </div>
      )}

      <div className={`grid gap-2 ${rotuloVazio ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {rotuloVazio && (
          <button type="button" onClick={() => aoConfirmar({ numero: '', unidade: '', livre: '' })}
            className="min-h-16 rounded-2xl bg-white border-2 border-polo-navy/20 text-polo-navy text-lg font-bold">
            {rotuloVazio}
          </button>
        )}
        <button type="button" onClick={confirmar} disabled={!valido}
          className="min-h-16 rounded-2xl bg-polo-navy text-polo-gold text-xl font-black disabled:opacity-40">
          OK
        </button>
      </div>
    </Dialogo>
  );
}

/**
 * A MEDIDA da etiqueta: um campo grande que mostra "1,5 kg" e, ao toque,
 * abre o teclado com a unidade em botões. Grava TEXTO, igual ao de sempre.
 */
export function CampoMedida({ nome, valor, unidadeDoItem, aoMudar, compacto = false }) {
  const [aberto, setAberto] = useState(false);
  const atual = String(valor ?? '').trim();
  const lida = lerMedida(atual);
  const unidades = UNIDADES_DA_MEDIDA.includes(lida.unidade) || !lida.unidade
    ? UNIDADES_DA_MEDIDA : [...UNIDADES_DA_MEDIDA, lida.unidade];
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        aria-label={`Medida de ${nome}: ${atual || 'sem medida'}. Toque para mudar`}
        className={`w-full ${compacto ? 'min-h-12' : 'min-h-14'} text-left rounded-2xl border-[3px] border-polo-navy/15 bg-white px-3
                    flex items-center justify-between gap-2 hover:border-polo-navy/40 transition-colors`}>
        {/* ⚠️ no celular a medida divide a linha com o lote: ~75 px de texto */}
        <span className={`truncate ${atual ? 'text-lg font-black text-polo-navy' : 'text-sm font-semibold text-gray-500'}`}>
          {atual || 'Pôr medida'}
        </span>
        <span className="text-polo-navy/60 flex-shrink-0" aria-hidden="true"><Icon name="editar" size={16} /></span>
      </button>
      {aberto && (
        <TecladoNumerico titulo={`Medida — ${nome}`}
          numeroInicial={lida.numero} unidades={unidades} unidadeInicial={unidadeParaAbrir(atual, unidadeDoItem)}
          livreInicial={lida.livre} permitirLivre rotuloVazio="Sem medida"
          aoFechar={() => setAberto(false)}
          aoConfirmar={({ numero, unidade, livre }) => {
            aoMudar(livre || textoDaMedida(numero, unidade));
            setAberto(false);
          }} />
      )}
    </>
  );
}
