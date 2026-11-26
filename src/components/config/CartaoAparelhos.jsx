import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Aviso from '../Aviso';
import { useAuth } from '../../store/AuthContext';
import { useUI } from '../../store/UIContext';
import { ADICIONAL_APARELHO, fmtPreco, aparelhosInclusos } from '../../utils/assinatura';
import { quandoFoiVisto } from '../../lib/aparelhos';
import { plural } from '../../utils/formatters';

// =====================================================================
//  APARELHOS CONECTADOS (M64, 24/11/2026 — pedido do dono)
//  Na Administração → Equipe: quais aparelhos estão com a conta aberta, e o
//  "Tirar" de quem não se usa mais (a vaga volta na hora). A Administração já
//  está aberta aqui, então o banco aceita (remover_aparelho confere).
// =====================================================================
export default function CartaoAparelhos() {
  const { sessao, impersonando, listarAparelhos, removerAparelho, conferirAparelho } = useAuth();
  const { confirm, toast } = useUI();
  const [dados, setDados] = useState(null); // { limite, extras, lista } | 'erro'
  const [tirando, setTirando] = useState('');
  const semServidor = !!sessao?.demo || !!sessao?.eSuperAdmin || !!impersonando;

  const carregar = useCallback(async () => {
    if (semServidor) return;
    const r = await listarAparelhos();
    setDados(r || 'erro');
  }, [semServidor, listarAparelhos]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca ao abrir o cartão
    carregar();
  }, [carregar]);

  const inclusos = aparelhosInclusos(sessao);
  const valor = fmtPreco(ADICIONAL_APARELHO);

  const tirar = async (a) => {
    const ok = await confirm({
      titulo: `Tirar ${a.nome} da conta?`,
      mensagem: 'Ele volta para a tela de entrada, e a vaga fica livre.',
      perigo: true, confirmar: 'Tirar',
    });
    if (!ok) return;
    setTirando(a.id);
    const erro = await removerAparelho(a.id);
    setTirando('');
    if (erro) { toast(erro, 'erro'); return; }
    toast(`${a.nome} saiu da conta.`, 'sucesso');
    carregar();
    conferirAparelho();
  };

  const lista = Array.isArray(dados?.lista) ? dados.lista : [];
  const ativos = lista.filter(a => a.situacao === 'ativo');
  const esperando = lista.filter(a => a.situacao === 'aguardando');
  const extras = Number(dados?.extras) || 0;
  const temLimite = !!dados && dados !== 'erro' && dados.limite != null;

  return (
    // redesign (26/11/2026): "2 de 3" com a barra das vagas, e "este aparelho"
    <div className="cartao space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="titulo-secao">Aparelhos conectados</h2>
        {temLimite && (
          <span className="text-sm font-bold text-polo-navy">{ativos.length} de {dados.limite}</span>
        )}
      </div>
      {temLimite && (
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: Math.max(Number(dados.limite) || 0, ativos.length) }, (_, i) => (
            <span key={i} className={`flex-1 h-2.5 rounded-full ${i < ativos.length ? 'bg-polo-navy' : 'bg-polo-linha'}`} />
          ))}
        </div>
      )}

      {semServidor ? (
        <p className="text-sm text-polo-tinta">Na demonstração, a lista fica vazia.</p>
      ) : dados === null ? (
        <p className="text-sm text-polo-tinta">Carregando…</p>
      ) : dados === 'erro' ? (
        <Aviso tom="erro">Sem internet para ver os aparelhos.</Aviso>
      ) : (
        <ul className="divide-y divide-polo-linha/70">
          {[...ativos, ...esperando].map(a => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-bold text-polo-navy truncate">
                  {a.nome}
                  {a.este && <span className="ml-2 text-xs font-bold text-ok-tinta bg-ok-suave rounded-full px-2 py-0.5">este aparelho</span>}
                </span>
                <span className="block text-xs text-polo-tinta">
                  {a.situacao === 'aguardando' ? 'esperando o pagamento' : `visto ${quandoFoiVisto(a.visto_em)}`}
                </span>
              </span>
              {!a.este && (
                <button onClick={() => tirar(a)} disabled={tirando === a.id} aria-label={`Tirar ${a.nome} da conta`}
                  className="min-h-11 px-4 rounded-xl border-2 border-perigo/40 bg-white text-perigo text-sm font-bold disabled:opacity-50 flex-shrink-0">
                  {tirando === a.id ? 'Tirando…' : 'Tirar'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {inclusos != null && (
        <div>
          <p className="text-xs text-polo-tinta border-t border-polo-linha pt-2">
            O plano inclui {inclusos}. Aparelho a mais: R$ {valor} por mês
            {extras > 0 ? ` — esta conta paga ${plural(extras, 'a mais', 'a mais')}` : ''}.
          </p>
          {/* ⚠️ 44 px de toque: o link fica na linha dele, não no meio do texto */}
          {!sessao?.eSuperAdmin && (
            <Link to="/pagamento" className="inline-flex items-center min-h-11 text-sm font-semibold text-polo-navy underline underline-offset-2">
              Planos e pagamento
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
