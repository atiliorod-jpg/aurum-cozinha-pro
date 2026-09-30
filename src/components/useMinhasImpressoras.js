import { useState, useEffect } from 'react';
import { useAuth } from '../store/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * As impressoras que a conta está pagando ou já pagou (M60). No modo suporte
 * o super-admin lê pela função do painel: a do cliente olha o restaurante de
 * QUEM ESTÁ LOGADO, que ali é a Aurum.
 *
 * ⚠️ FALHA CALADA: sem a migração ou sem rede, a lista vem vazia e a tela
 * mostra só o sistema — o painel continua sabendo da impressora e cobra.
 */
export function useMinhasImpressoras() {
  const { sessao, impersonando } = useAuth();
  const rid = impersonando?.restauranteId || sessao?.restauranteId || null;
  const [lista, setLista] = useState({ rid: null, itens: [] });
  useEffect(() => {
    if (!rid || sessao?.demo) return undefined;
    let vivo = true;
    const pedido = impersonando ? supabase.rpc('impressoras_admin') : supabase.rpc('minhas_impressoras');
    Promise.resolve(pedido).then(({ data, error }) => {
      if (!vivo) return;
      const itens = error ? [] : (data || []).filter(i => !impersonando || i.restaurante_id === rid);
      setLista({ rid, itens });
    }, () => { if (vivo) setLista({ rid, itens: [] }); });
    return () => { vivo = false; };
  }, [rid, sessao?.demo, impersonando]);
  // a lista de OUTRA conta (troca de conta, modo suporte) nunca aparece aqui
  return lista.rid === rid ? lista.itens : [];
}
