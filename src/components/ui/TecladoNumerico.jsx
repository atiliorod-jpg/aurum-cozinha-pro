import { useState, useEffect, useRef, useId } from 'react';
import Dialogo from '../Dialogo';
import Icon from '../Icons';
import {
  UNIDADES_DA_MEDIDA, lerMedida, textoDaMedida, unidadeParaAbrir, teclar,
  digitosDaBalanca, teclarBalanca, textoDaBalanca, MAX_DIGITOS_BALANCA,
} from '../../utils/medida';

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
//  ⚠️ MODO BALANÇA (`casasFixas`, 24/11/2026, escolha do dono para o kg do
//  desperdício): os números entram pela direita com as casas fixas, como no
//  visor da balança — 1-5-0-0 é 1,500 kg. No lugar da vírgula, a tecla 000
//  (o quilo inteiro). Ver utils/medida.js.
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
 * @param {boolean} [props.aceitaZero]     o zero vale (contagem: "contei zero")
 * @param {number} [props.casasFixas]      o modo balança: 3 = "1-5-0-0" vira 1,500
 * @param {Function} props.aoConfirmar     ({ numero, unidade, livre }) — numero '' = vazio
 * @param {Function} props.aoFechar
 */
export function TecladoNumerico({
  titulo, numeroInicial = '', unidades = null, unidadeInicial = '', decimal = true,
  livreInicial = '', permitirLivre = false, rotuloVazio = '', aceitaZero = false, casasFixas = 0, aoConfirmar, aoFechar,
}) {
  const balanca = casasFixas > 0;
  const [numero, setNumero] = useState(() => (balanca ? digitosDaBalanca(numeroInicial, casasFixas) : numeroInicial));
  // o 1º toque substitui o sugerido
  const [novo, setNovo] = useState(true);
  const [unidade, setUnidade] = useState(unidadeInicial || unidades?.[0] || '');
  const [livre, setLivre] = useState(livreInicial);
  const [modoLivre, setModoLivre] = useState(permitirLivre && !!livreInicial);
  const idUnidades = useId();

  // no modo balança, `numero` guarda só os dígitos tocados ("1500")
  const valido = modoLivre ? livre.trim().length > 0
    : balanca ? numero !== ''
      : aceitaZero ? /^\d/.test(numero) : textoDaMedida(numero, '') !== '';
  const tocar = (t) => {
    setNumero(n => (balanca ? teclarBalanca(novo ? '' : n, t) : teclar(novo ? '' : n, t, { decimal })));
    setNovo(false);
  };
  const apagar = () => { setNumero(n => (novo ? '' : n.slice(0, -1))); setNovo(false); };
  const confirmar = () => {
    if (!valido) return;
    aoConfirmar(modoLivre ? { numero: '', unidade: '', livre: livre.trim() }
      : { numero: balanca ? textoDaBalanca(numero, casasFixas) : numero, unidade, livre: '' });
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

  const mostrado = balanca ? textoDaBalanca(numero || '0', casasFixas) : (numero || '0');
  // ⚠️ O PESO NO TAMANHO CERTO: o visor mostra como a balança ("0,250"); abaixo
  // de 1 kg, embaixo, quanto é em gramas — os dígitos tocados são os gramas
  const gramas = balanca && casasFixas === 3 && unidade === 'kg' && numero && Number(numero) < 1000 ? Number(numero) : null;
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
        <output aria-live="polite"
          aria-label={`Valor: ${balanca ? (numero ? `${mostrado} ${unidade}`.trim() : 'vazio') : (textoDaMedida(numero, unidade) || 'vazio')}`}
          className={`block rounded-2xl border-4 px-4 py-2 text-right tabular-nums
            ${novo ? 'border-polo-gold' : 'border-polo-navy'}`}>
          <span className={`text-5xl font-black ${novo ? 'text-gray-500' : 'text-polo-navy'}`}>{mostrado}</span>
          {unidade && <span className="text-2xl font-bold text-gray-600 ml-2">{unidade}</span>}
          {gramas !== null && <span className="block text-base font-bold text-gray-600">= {gramas} g</span>}
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
          {balanca ? (
            <button type="button" onClick={() => tocar('000')} aria-label="Três zeros"
              disabled={numero.length + 3 > MAX_DIGITOS_BALANCA}
              className={`${teclaBase} bg-gray-100 text-polo-navy`}>000</button>
          ) : (
            <button type="button" onClick={() => tocar(',')} disabled={!decimal} aria-label="Vírgula"
              className={`${teclaBase} bg-gray-100 text-polo-navy`}>,</button>
          )}
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

// ── O CAMPO DE NÚMERO dos lançamentos (23/11/2026) ─────────────────────
// ⚠️ NO COMPUTADOR É UM CAMPO COMUM: digita direto, Tab, colar — e o robô de
// teste usa assim. COM O DEDO (tela de toque), tocar abre o teclado grande,
// sem o teclado pequeno do sistema por cima da tela. Grava o número com
// PONTO ("1.5"), como o campo sempre gravou.
const tocaComDedo = () => {
  try { return !!window.matchMedia?.('(pointer: coarse)').matches; } catch { return false; }
};
const SEM_SETAS = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

// ⚠️ `casasFixas` (o modo balança): o campo mostra "1,500" e, no computador,
// também enche pela direita (digitar 1500 dá 1,500; apagar tira o último
// número). Grava o número com PONTO ("1.5"), como sempre.
export function CampoNumerico({
  valor, aoMudar, rotulo, titulo = '', unidade = '', decimal = true, placeholder = '0', className = 'campo',
  casasFixas = 0, ...resto
}) {
  const [comDedo] = useState(tocaComDedo);
  const [aberto, setAberto] = useState(false);
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (casasFixas > 0) {
    const dosDigitos = (d) => (d ? String(Number(d) / 10 ** casasFixas) : '');
    return (
      <>
        <input type="text" {...resto}
          inputMode={comDedo ? 'none' : 'numeric'} readOnly={comDedo}
          value={textoDaBalanca(digitosDaBalanca(texto, casasFixas), casasFixas)}
          placeholder={textoDaBalanca('0', casasFixas)} aria-label={rotulo}
          onChange={e => aoMudar(dosDigitos(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITOS_BALANCA)))}
          onClick={comDedo ? () => setAberto(true) : undefined}
          onKeyDown={comDedo ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAberto(true); } } : undefined}
          className={className} />
        {aberto && (
          <TecladoNumerico titulo={titulo || rotulo} numeroInicial={texto}
            unidadeInicial={unidade} casasFixas={casasFixas} rotuloVazio="Limpar"
            aoFechar={() => setAberto(false)}
            aoConfirmar={({ numero }) => {
              aoMudar(numero ? String(Number(numero.replace(',', '.'))) : '');
              setAberto(false);
            }} />
        )}
      </>
    );
  }
  return (
    <>
      <input type="number" min="0" step="any" {...resto}
        inputMode={comDedo ? 'none' : (decimal ? 'decimal' : 'numeric')}
        readOnly={comDedo} value={texto} placeholder={placeholder} aria-label={rotulo}
        onChange={e => aoMudar(e.target.value)}
        onClick={comDedo ? () => setAberto(true) : undefined}
        onKeyDown={comDedo ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAberto(true); } } : undefined}
        className={`${className} ${SEM_SETAS}`} />
      {aberto && (
        <TecladoNumerico titulo={titulo || rotulo} numeroInicial={texto.replace('.', ',')}
          unidadeInicial={unidade} decimal={decimal} aceitaZero rotuloVazio="Limpar"
          aoFechar={() => setAberto(false)}
          aoConfirmar={({ numero }) => { aoMudar(numero.replace(',', '.').replace(/\.$/, '')); setAberto(false); }} />
      )}
    </>
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
