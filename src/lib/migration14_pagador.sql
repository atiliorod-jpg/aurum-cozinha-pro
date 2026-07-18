-- =====================================================================
--  AURUM COZINHA PRO — Migração 14: nome de quem fez o Pix
--  Rode DEPOIS da 13. Seguro rodar mais de uma vez.
--
--  O aviso de pagamento passa a guardar o NOME de quem pagou (o cliente digita
--  ao tocar "Já paguei"), além do horário — para o super-admin conciliar no /admin.
-- =====================================================================
alter table restaurantes add column if not exists aviso_pagamento_nome text;

create or replace function avisar_pagamento(p_plano text, p_nome text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rid uuid := meu_restaurante_id();
begin
  if v_rid is null then raise exception 'Sem restaurante.'; end if;
  update restaurantes
     set aviso_pagamento_em = now(),
         aviso_pagamento_plano = coalesce(nullif(trim(p_plano), ''), 'mensal'),
         aviso_pagamento_nome = nullif(trim(p_nome), '')
   where id = v_rid;
  return true;
end $$;

-- ativar_assinatura e limpar_aviso_pagamento também zeram o nome
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
  if v_ate is null then raise exception 'Restaurante não encontrado.'; end if;
  update restaurantes
     set assinatura_ate = v_ate,
         aviso_pagamento_em = null, aviso_pagamento_plano = null, aviso_pagamento_nome = null
   where id = p_restaurante;
  return v_ate;
end $$;

create or replace function limpar_aviso_pagamento(p_restaurante uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema dispensa avisos.';
  end if;
  update restaurantes
     set aviso_pagamento_em = null, aviso_pagamento_plano = null, aviso_pagamento_nome = null
   where id = p_restaurante;
  return true;
end $$;
