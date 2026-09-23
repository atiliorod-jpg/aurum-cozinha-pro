import { useState } from 'react';
import { textoDoBloqueio } from '../utils/semInternet';

/**
 * "Conecte à internet para continuar" — o limite do uso sem internet
 * (utils/semInternet.js). Aparece quando:
 *   • faz mais de 72 h que o aparelho não confere a assinatura;
 *   • o relógio do aparelho foi atrasado;
 *   • o aparelho nunca entrou com internet (não há sessão guardada).
 *
 * ⚠️ "TENTAR DE NOVO" É A SAÍDA, e ela tem de existir: com a internet de
 * volta, um toque confere a assinatura e libera — ninguém fica preso numa
 * tela que só some fechando o app. Os dados continuam guardados no aparelho.
 */
export default function ConecteInternet({ motivo, aoTentar, aoSair }) {
  const [tentando, setTentando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const tentar = async () => {
    setTentando(true); setFalhou(false);
    let ok;
    try { ok = !!(await aoTentar?.()); } catch { ok = false; }
    setTentando(false);
    if (!ok) setFalhou(true);
  };

  return (
    <div className="min-h-screen bg-polo-navy flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-polo-gold font-bold text-lg">Conecte à internet para continuar</p>
      <p className="text-white/85 text-sm max-w-xs">{textoDoBloqueio(motivo)}</p>
      <button onClick={tentar} disabled={tentando}
        className="bg-polo-gold text-polo-navy font-bold px-6 py-3 rounded-xl min-h-11 disabled:opacity-60">
        {tentando ? 'Conferindo…' : 'Tentar de novo'}
      </button>
      {falhou && (
        <p className="text-white/80 text-xs max-w-xs" role="status">
          Ainda sem conexão com o servidor. Confira o Wi-Fi ou os dados móveis e toque de novo.
        </p>
      )}
      <button onClick={aoSair} className="text-white/70 text-xs underline underline-offset-2 min-h-11 px-3">
        Sair da conta
      </button>
    </div>
  );
}
