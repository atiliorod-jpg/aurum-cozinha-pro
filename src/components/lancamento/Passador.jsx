// =====================================================================
//  − [ quantidade ] +   (Lote 5 da auditoria, 14/10/2026)
//
//  O mesmo controle de quantidade em Entrada, Saída, Contagem e Fechar turno.
//  Eram quatro cópias: duas com − / +, duas só com o campo (na Contagem a
//  pessoa digitava cada pote, mesmo quando contar de um em um é o gesto).
//  Botões de 44 px — dedo de luva, celular apoiado na bancada.
//
//  `rotulo` é o nome do campo ("Quantidade de Picanha"); os botões dizem
//  "Diminuir/Aumentar quantidade de Picanha".
// =====================================================================

const minuscula = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

export default function Passador({ valor, aoMudar, rotulo, placeholder = '0', passo = 1, largura = 'w-16' }) {
  const atual = parseFloat(valor) || 0;
  // arredonda em 3 casas: 0,1 + 0,2 não pode virar 0,30000000000000004 no campo
  const mudar = (d) => aoMudar(String(Math.max(0, Math.round((atual + d) * 1000) / 1000)));
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <button type="button" aria-label={`Diminuir ${minuscula(rotulo)}`} onClick={() => mudar(-passo)}
        className="w-11 h-11 rounded-full bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center flex-shrink-0">−</button>
      <input type="number" inputMode="decimal" min="0" step="any"
        value={valor ?? ''} onChange={e => aoMudar(e.target.value)}
        placeholder={placeholder} aria-label={rotulo}
        className={`${largura} text-center border border-gray-200 rounded-lg py-2.5 text-sm font-semibold`} />
      <button type="button" aria-label={`Aumentar ${minuscula(rotulo)}`} onClick={() => mudar(passo)}
        className="w-11 h-11 rounded-full bg-polo-navy text-polo-gold font-bold text-lg flex items-center justify-center flex-shrink-0">+</button>
    </div>
  );
}
