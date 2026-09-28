-- =====================================================================
--  M53 — O APARELHO BAIXA SÓ OS LANÇAMENTOS QUE MUDARAM (28/09/2026)
--
--  Pedido do dono: o Pro não pode ficar pesado com o uso. Até aqui, cada
--  abertura do app (e cada troca de cozinha) baixava TODOS os lançamentos da
--  conta, em páginas de 1.000. Uma cozinha com ~100 lançamentos por dia chega a
--  36 mil linhas em um ano: 36 idas ao banco a cada abertura, em cada aparelho.
--
--  Agora o aparelho guarda os lançamentos (IndexedDB, lib/registrosLocais.js) e
--  pede só o que mudou desde a última vez. Para isso cada linha ganha a hora da
--  última mudança, carimbada PELO BANCO (o relógio do aparelho não entra).
--
--  ⚠️ `clock_timestamp()` e não `now()`: `now()` é a hora do INÍCIO da
--  transação, e uma transação longa gravaria "no passado". O app ainda pede com
--  uma folga de 10 minutos para trás e junta pelo id — o que chega repetido
--  não duplica.
--
--  ⚠️ APAGAR É MARCAR (deleted = true), como sempre foi: a marcação muda a hora
--  e chega ao aparelho como mudança. Não há policy de DELETE (M23).
-- =====================================================================

begin;

alter table registros add column if not exists atualizado_em timestamptz not null default clock_timestamp();

create or replace function _registros_atualizado_em()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado_em := clock_timestamp();
  return new;
end $$;

drop trigger if exists trg_registros_atualizado_em on registros;
create trigger trg_registros_atualizado_em before insert or update on registros
  for each row execute function _registros_atualizado_em();

-- a consulta do app: restaurante_id = ? and atualizado_em >= ? order by atualizado_em, id
create index if not exists idx_registros_rest_atualizado on registros (restaurante_id, atualizado_em, id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_registros_atualizado_em' and not tgisinternal) then
    raise exception 'M53: o carimbo de mudança dos lançamentos não foi criado — abortando.';
  end if;
end $$;

commit;
