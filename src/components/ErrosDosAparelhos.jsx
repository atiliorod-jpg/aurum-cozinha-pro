import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { agruparErros, TIPOS_DE_ERRO } from '../utils/errosApp';

const dataHora = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

// os últimos 7 dias, o mais recente primeiro (só o super-admin lê — M50)
const buscarErros = () => supabase.from('erros_app')
  .select('id, criado_em, visto_em, restaurante_id, tipo, mensagem, onde, tela, versao, vezes')
  .gte('visto_em', new Date(Date.now() - 7 * 86400000).toISOString())
  .order('visto_em', { ascending: false }).limit(500);

/**
 * Erros dos aparelhos (M50) — o cartão do painel super-admin.
 *
 * ⚠️ ERA CEGO: tela que travava no cliente só ficava no aparelho dele. Agora
 * cada erro chega aqui (o app manda sozinho; ver lib/relatarErro.js). Um
 * erro que se repete em várias contas é defeito do app; uma versão antiga na
 * lista é aparelho preso no endereço velho.
 */
export default function ErrosDosAparelhos({ restaurantes }) {
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [expandido, setExpandido] = useState('');

  const [rodada, setRodada] = useState(0); // "Atualizar" busca de novo
  useEffect(() => {
    let vivo = true;
    buscarErros().then(({ data, error }) => {
      if (!vivo) return;
      setErro(error?.message || '');
      setLinhas(data || []);
    });
    return () => { vivo = false; };
  }, [rodada]);

  const grupos = useMemo(() => agruparErros(linhas), [linhas]);
  const nomeDe = (id) => (restaurantes || []).find(r => r.id === id)?.nome || 'conta';
  const total = grupos.reduce((s, g) => s + g.vezes, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setAberto(v => !v)} aria-expanded={aberto}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 min-h-11">
        <span>
          <span className="block text-sm font-bold text-polo-navy">Erros dos aparelhos · 7 dias</span>
          <span className="block text-[11px] text-gray-600">
            {linhas === null ? 'Carregando…'
              : erro ? `Não carregou: ${erro}`
              : grupos.length === 0 ? 'Nenhum erro nos aparelhos dos clientes.'
              : `${grupos.length} erro(s) diferente(s), ${total} ocorrência(s)`}
          </span>
        </span>
        {grupos.length > 0 && (
          <span className="text-xs font-bold text-white bg-red-600 rounded-full px-2 py-0.5 flex-shrink-0">{grupos.length}</span>
        )}
      </button>
      {aberto && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-2">
          <div className="flex justify-end">
            <button onClick={() => setRodada(n => n + 1)} className="text-[11px] font-semibold text-polo-navy underline underline-offset-2 min-h-11 px-2">
              Atualizar
            </button>
          </div>
          {grupos.map(g => (
            <div key={g.chave} className="bg-gray-50 rounded-lg px-3 py-2">
              <button onClick={() => setExpandido(x => (x === g.chave ? '' : g.chave))}
                className="w-full text-left" aria-expanded={expandido === g.chave}>
                <span className="text-[11px] font-bold text-red-700 uppercase tracking-wide">{TIPOS_DE_ERRO[g.tipo] || g.tipo}</span>
                <span className="block text-xs font-semibold text-polo-navy break-words">{g.mensagem}</span>
                <span className="block text-[11px] text-gray-600 mt-0.5">
                  {g.vezes}× · {g.contas.length} conta(s) · última {dataHora(g.ultimo)}
                  {g.versoes[0] ? ` · versão ${g.versoes[0]}` : ''}
                </span>
              </button>
              {expandido === g.chave && (
                <div className="mt-2 space-y-1 text-[11px] text-gray-700">
                  {g.contas.length > 0 && <p><strong>Contas:</strong> {g.contas.map(nomeDe).join(', ')}</p>}
                  {g.telas.length > 0 && <p><strong>Telas:</strong> {g.telas.join(', ')}</p>}
                  {g.versoes.length > 1 && <p><strong>Versões:</strong> {g.versoes.join(', ')}</p>}
                  {g.onde && <p className="font-mono break-all text-gray-600">{g.onde}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
