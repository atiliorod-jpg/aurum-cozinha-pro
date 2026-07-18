-- =====================================================================
--  AURUM COZINHA PRO — Migração 13: aviso de pagamento (Pix manual)
--  Cole INTEIRO no Supabase → SQL Editor → New query → Run.
--  Rode DEPOIS das migrações 4–11. Seguro rodar mais de uma vez.
--
--  Quando o cliente paga por Pix, ele toca "Já paguei" no app. Isso registra
--  um AVISO para o super-admin ativar a assinatura. Precisa funcionar MESMO
--  com a conta vencida/bloqueada (é justo quando ele vai pagar) — por isso é
--  uma RPC SECURITY DEFINER, que não passa pelo corte de plano do RLS.
-- =====================================================================

alter table restaurantes add column if not exists aviso_pagamento_em    timestamptz;
alter table restaurantes add column if not exists aviso_pagamento_plano text;

-- Cliente avisa que pagou (qualquer cargo do próprio restaurante; vale vencido).
create or replace function avisar_pagamento(p_plano text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rid uuid := meu_restaurante_id();
begin
  if v_rid is null then raise exception 'Sem restaurante.'; end if;
  update restaurantes
     set aviso_pagamento_em = now(),
         aviso_pagamento_plano = coalesce(nullif(trim(p_plano), ''), 'mensal')
   where id = v_rid;
  return true;
end $$;

-- ativar_assinatura agora também LIMPA o aviso (o super-admin resolveu o pagamento).
create or replace function ativar_assinatura(p_restaurante uuid, p_dias int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_ate timestamptz;
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema ativa assinaturas.';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 400 then
    raise exception 'Dias inválidos (1 a 400).';
  end if;
  select greatest(coalesce(assinatura_ate, now()), now()) + make_interval(days => p_dias)
    into v_ate from restaurantes where id = p_restaurante;
  if v_ate is null then
    raise exception 'Restaurante não encontrado.';
  end if;
  update restaurantes
     set assinatura_ate = v_ate,
         aviso_pagamento_em = null,      -- pagamento resolvido → limpa o aviso
         aviso_pagamento_plano = null
   where id = p_restaurante;
  return v_ate;
end $$;

-- Super-admin pode dispensar um aviso sem ativar (ex.: pagamento não caiu).
create or replace function limpar_aviso_pagamento(p_restaurante uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema dispensa avisos.';
  end if;
  update restaurantes set aviso_pagamento_em = null, aviso_pagamento_plano = null
   where id = p_restaurante;
  return true;
end $$;

-- =====================================================================
--  PRONTO. Checagem:
--    select proname from pg_proc where proname in
--      ('avisar_pagamento','limpar_aviso_pagamento','ativar_assinatura');
-- =====================================================================
