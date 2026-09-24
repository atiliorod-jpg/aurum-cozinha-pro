import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * VERIFICAÇÃO EM DUAS ETAPAS DO SUPER-ADMIN (M51, pedido do dono, 24/09/2026)
 *
 * A conta da Aurum abre o painel de TODOS os clientes: pagamentos, contratos,
 * contas, modo suporte. Só com a senha, quem a descobrisse teria tudo. Agora
 * o painel pede também o código de 6 dígitos de um aplicativo autenticador
 * (Google Authenticator, Microsoft Authenticator, Authy…).
 *
 * ⚠️ A TRAVA DE VERDADE É O BANCO (M51): `sou_super_admin()` só vale com o
 * login em "duas etapas" (aal2). Esta tela é o caminho para chegar lá — sem
 * ela, o painel simplesmente viria vazio.
 *
 * Primeira vez: mostra o QR para cadastrar no aplicativo e pede o código.
 * Das outras: só o código.
 */
export default function DuasEtapas({ aoConcluir, aoSair }) {
  const [etapa, setEtapa] = useState('carregando'); // 'cadastrar' | 'codigo' | 'erro'
  const [fator, setFator] = useState(null);          // { id, qr, secret }
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!vivo) return;
      if (error) { setErro(error.message || 'Não deu para ler a verificação. Confira a internet.'); setEtapa('erro'); return; }
      const pronto = (data?.totp || []).find(f => f.status === 'verified');
      if (pronto) { setFator({ id: pronto.id }); setEtapa('codigo'); return; }
      // cadastro começado e não terminado atrapalha o novo: sai antes
      for (const f of (data?.all || []).filter(x => x.factor_type === 'totp' && x.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: novo, error: e2 } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Painel Aurum' });
      if (!vivo) return;
      if (e2 || !novo) { setErro(e2?.message || 'Não deu para começar o cadastro.'); setEtapa('erro'); return; }
      setFator({ id: novo.id, qr: novo.totp?.qr_code, secret: novo.totp?.secret });
      setEtapa('cadastrar');
    })();
    return () => { vivo = false; };
  }, []);

  const confirmar = async (ev) => {
    ev?.preventDefault?.();
    const c = codigo.replace(/\D/g, '');
    if (c.length !== 6) { setErro('Digite os 6 números que aparecem no aplicativo.'); return; }
    setOcupado(true); setErro('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: c });
    setOcupado(false);
    if (error) {
      setErro(/invalid|expired|code/i.test(error.message || '')
        ? 'Código não confere. Confira se o relógio do celular está certo e digite o código que está na tela agora.'
        : `Não deu certo: ${error.message}`);
      return;
    }
    await aoConcluir?.();
  };

  return (
    <div className="min-h-screen bg-polo-navy flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-polo-gold font-bold text-lg">Verificação em duas etapas</p>
      {etapa === 'carregando' && <p className="text-white/80 text-sm">Carregando…</p>}
      {etapa === 'erro' && <p className="text-white/85 text-sm max-w-xs">{erro}</p>}
      {etapa === 'cadastrar' && (
        <div className="bg-white rounded-2xl p-4 max-w-xs w-full space-y-3 text-left">
          <p className="text-sm text-polo-navy font-bold">1. Cadastre no aplicativo autenticador</p>
          <p className="text-xs text-gray-700">
            Abra o Google Authenticator (ou Microsoft Authenticator, Authy), toque em "+" e leia este QR.
          </p>
          {fator?.qr && <img src={fator.qr} alt="QR para o aplicativo autenticador" className="w-48 h-48 mx-auto" />}
          {fator?.secret && (
            <p className="text-[11px] text-gray-600 break-all">
              Sem câmera? Digite a chave: <strong className="font-mono">{fator.secret}</strong>
            </p>
          )}
          <p className="text-sm text-polo-navy font-bold">2. Digite o código que aparece</p>
        </div>
      )}
      {(etapa === 'cadastrar' || etapa === 'codigo') && (
        <form onSubmit={confirmar} className="max-w-xs w-full space-y-3">
          {etapa === 'codigo' && (
            <p className="text-white/85 text-sm">Digite o código de 6 números do seu aplicativo autenticador.</p>
          )}
          <input value={codigo} onChange={e => setCodigo(e.target.value)} inputMode="numeric" autoComplete="one-time-code"
            maxLength={7} placeholder="000000" aria-label="Código de 6 números"
            className="w-full text-center text-2xl tracking-[0.4em] font-bold rounded-xl py-3 px-3" />
          {erro && <p className="text-amber-200 text-xs" role="alert">{erro}</p>}
          <button type="submit" disabled={ocupado}
            className="w-full bg-polo-gold text-polo-navy font-bold py-3 rounded-xl min-h-11 disabled:opacity-60">
            {ocupado ? 'Conferindo…' : 'Entrar no painel'}
          </button>
        </form>
      )}
      <button onClick={aoSair} className="text-white/70 text-xs underline underline-offset-2 min-h-11 px-3">Sair da conta</button>
    </div>
  );
}
