// =====================================================================
//  − [ quantidade ] +   (Lote 5 da auditoria, 14/10/2026)
//
//  O mesmo controle de quantidade em Entrada, Saída, Contagem e Fechar turno.
//  Eram quatro cópias: duas com − / +, duas só com o campo (na Contagem a
//  pessoa digitava cada pote, mesmo quando contar de um em um é o gesto).
//  Botões de 48 px — dedo de luva, celular apoiado na bancada.
//  ⚠️ JEITO DO MAGURŌ (23/11/2026): com o dedo, tocar no número abre o
//  teclado grande (CampoNumerico); no computador, digita direto.
//
//  `rotulo` é o nome do campo ("Quantidade de Picanha"); os botões dizem
//  "Diminuir/Aumentar quantidade de Picanha".
// =====================================================================

import Icon from '../Icons';
import { CampoNumerico } from '../ui/TecladoNumerico';

const minuscula = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

export default function Passador({ valor, aoMudar, rotulo, placeholder = '0', passo = 1, largura = 'w-16', unidade = '' }) {
  const atual = parseFloat(valor) || 0;
  // arredonda em 3 casas: 0,1 + 0,2 não pode virar 0,30000000000000004 no campo
  const mudar = (d) => aoMudar(String(Math.max(0, Math.round((atual + d) * 1000) / 1000)));
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <button type="button" aria-label={`Diminuir ${minuscula(rotulo)}`} onClick={() => mudar(-passo)}
        className="w-12 h-12 rounded-xl bg-gray-100 text-polo-navy flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform">
        <Icon name="menos" size={22} strokeWidth={2.5} />
      </button>
      <CampoNumerico valor={valor ?? ''} aoMudar={aoMudar} rotulo={rotulo} placeholder={placeholder} unidade={unidade}
        className={`${largura} h-12 text-center border-2 border-polo-navy/15 focus:border-polo-navy rounded-xl text-lg font-black text-polo-navy bg-white`} />
      <button type="button" aria-label={`Aumentar ${minuscula(rotulo)}`} onClick={() => mudar(passo)}
        className="w-12 h-12 rounded-xl bg-polo-navy text-polo-gold flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform">
        <Icon name="mais" size={22} strokeWidth={2.5} />
      </button>
    </div>
  );
}
