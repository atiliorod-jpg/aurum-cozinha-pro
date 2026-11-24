-- =====================================================================
--  MIGRAÇÃO 65 — REGISTRO DE DESPERDÍCIO (24/11/2026, pedido do dono)
--
--  O checklist de desperdício do Magurō, dentro do Aurum Etiquetas: a equipe
--  toca no nome, escolhe o item (os mesmos de Meus itens, ou "fora da lista"),
--  diz quanto (kg ou unid) e o motivo. Data, hora e turno saem sozinhos. NÃO
--  mexe em estoque nenhum: é o registro do que foi jogado fora.
--
--  ⚠️ NINGUÉM LÊ NEM GRAVA A TABELA DIRETO (sem grant, sem policy). Registrar
--  é de quem está na conta; ler, corrigir e apagar, só com a Administração
--  aberta NESTA sessão (meu_cargo() = 'diretoria', M62).
--  ⚠️ O id vem do aparelho: o registro feito sem internet sobe depois, com a
--  hora em que foi feito, e reenviar não duplica (on conflict do nothing).
--
--  Aplicar:  node scripts/rodar-migracao.mjs 65
--  Conferir: node scripts/pentest-desperdicio.mjs
-- =====================================================================

create table if not exists descartes (
  id             uuid primary key,                 -- gerado no aparelho
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  quando         timestamptz not null,             -- a hora em que foi feito
  dia            date not null,                    -- no fuso de Recife
  hora           text not null default '',         -- "14:32"
  turno          text not null default '',         -- "Manhã" / "Noite" (o aparelho calcula pelos turnos da casa)
  item_id        text,                             -- id de Meus itens; nulo = fora da lista
  item_nome      text not null,
  quantidade     numeric not null check (quantidade > 0 and quantidade <= 100000),
  unidade        text not null check (unidade in ('kg', 'unid')),
  motivo         text not null,
  responsavel    text not null default '',         -- o nome que entrou com a senha
  usuario        uuid,                             -- o login que gravou
  criado_em      timestamptz not null default now(),
  editado_em     timestamptz,                      -- corrigido pela Administração
  original       jsonb                             -- como a pessoa registrou (antes da 1ª correção)
);
create index if not exists descartes_restaurante_dia_idx on descartes (restaurante_id, dia desc);
alter table descartes enable row level security;
revoke all on descartes from public, anon, authenticated;

-- ── Quem pode ler e mexer: a Administração aberta (ou o suporte da Aurum) ──
create or replace function _conta_do_desperdicio(p_restaurante uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(sou_super_admin(), false) and p_restaurante is not null then return p_restaurante; end if;
  if meu_restaurante_id() is null or coalesce(meu_cargo(), '') <> 'diretoria' then
    raise exception 'Abra a Administração para ver o desperdício.';
  end if;
  return meu_restaurante_id();
end $$;
revoke all on function _conta_do_desperdicio(uuid) from public, anon, authenticated;

-- ── Registrar (a equipe, com ou sem internet) ─────────────────────
-- Lote de até 200: o que ficou guardado sem internet sobe de uma vez.
create or replace function registrar_descartes(p_itens jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare rid uuid := meu_restaurante_id(); v_n integer;
begin
  if auth.uid() is null or rid is null then raise exception 'Sem restaurante.'; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then return 0; end if;
  if jsonb_array_length(p_itens) > 200 then
    raise exception 'Lote grande demais: no máximo 200 registros por chamada.';
  end if;
  if (select count(*) from descartes where restaurante_id = rid and criado_em > now() - interval '1 day') >= 2000 then
    raise exception 'Limite diário de registros de desperdício atingido. Fale com a Aurum.';
  end if;
  with linhas as (
    select (e->>'id')::uuid as id,
           -- ⚠️ a hora do aparelho vale (sem internet, sobe depois), mas sem
           -- futuro e sem passado de mais de 30 dias
           least(coalesce((e->>'quando')::timestamptz, now()), now()) as quando,
           left(coalesce(e->>'turno', ''), 20) as turno,
           nullif(left(coalesce(e->>'item_id', ''), 80), '') as item_id,
           left(trim(coalesce(e->>'item_nome', '')), 120) as item_nome,
           (e->>'quantidade')::numeric as quantidade,
           e->>'unidade' as unidade,
           left(trim(coalesce(e->>'motivo', '')), 300) as motivo,
           left(trim(coalesce(e->>'responsavel', '')), 80) as responsavel
      from jsonb_array_elements(p_itens) e
  ), novas as (
    insert into descartes (id, restaurante_id, quando, dia, hora, turno, item_id, item_nome,
                           quantidade, unidade, motivo, responsavel, usuario)
    select l.id, rid, l.quando,
           (l.quando at time zone 'America/Recife')::date,
           to_char(l.quando at time zone 'America/Recife', 'HH24:MI'),
           l.turno, l.item_id, l.item_nome, round(l.quantidade, 3), l.unidade, l.motivo, l.responsavel, auth.uid()
      from linhas l
     where l.item_nome <> '' and l.motivo <> ''
       and l.quantidade > 0 and l.quantidade <= 100000
       and l.unidade in ('kg', 'unid')
       and l.quando >= now() - interval '30 days'
       -- ⚠️ conta liberada, ou feito até o último vencimento (o mesmo das etiquetas, M55)
       and _pode_gravar_etiqueta(rid, (l.quando at time zone 'America/Recife')::date)
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_n from novas;
  return v_n;
end $$;

-- ── O relatório (Administração) ──────────────────────────────────
create or replace function descartes_do_periodo(p_de date, p_ate date, p_restaurante uuid default null)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare rid uuid := _conta_do_desperdicio(p_restaurante);
begin
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Período inválido (até 400 dias).';
  end if;
  return query
    select jsonb_build_object(
             'id', d.id, 'quando', d.quando, 'dia', d.dia, 'hora', d.hora, 'turno', d.turno,
             'item_id', d.item_id, 'item_nome', d.item_nome, 'quantidade', d.quantidade,
             'unidade', d.unidade, 'motivo', d.motivo, 'responsavel', d.responsavel,
             'editado_em', d.editado_em, 'original', d.original)
      from descartes d
     where d.restaurante_id = rid and d.dia between p_de and p_ate
     order by d.quando desc
     limit 20000;
end $$;

-- Corrigir um registro feito errado: guarda como a pessoa registrou (só da
-- primeira vez) e marca "corrigido". Data, hora, turno e responsável ficam.
create or replace function corrigir_descarte(p_id uuid, p_item_id text, p_item_nome text,
                                             p_quantidade numeric, p_unidade text, p_motivo text)
returns boolean language plpgsql security definer set search_path = public as $$
declare rid uuid := _conta_do_desperdicio(null); v descartes%rowtype;
begin
  select * into v from descartes where id = p_id and restaurante_id = rid for update;
  if not found then raise exception 'Registro não encontrado.'; end if;
  if trim(coalesce(p_item_nome, '')) = '' or trim(coalesce(p_motivo, '')) = '' then
    raise exception 'Falta o item ou o motivo.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 or p_quantidade > 100000 then raise exception 'Quantidade inválida.'; end if;
  if p_unidade not in ('kg', 'unid') then raise exception 'Unidade inválida.'; end if;
  update descartes
     set original = coalesce(original, jsonb_build_object('item_id', v.item_id, 'item_nome', v.item_nome,
                     'quantidade', v.quantidade, 'unidade', v.unidade, 'motivo', v.motivo)),
         item_id = nullif(left(coalesce(p_item_id, ''), 80), ''),
         item_nome = left(trim(p_item_nome), 120),
         quantidade = round(p_quantidade, 3), unidade = p_unidade,
         motivo = left(trim(p_motivo), 300),
         editado_em = now()
   where id = p_id;
  return true;
end $$;

-- Desfaz a correção: volta ao que a pessoa registrou e tira a marca.
create or replace function voltar_descarte_original(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare rid uuid := _conta_do_desperdicio(null); v descartes%rowtype;
begin
  select * into v from descartes where id = p_id and restaurante_id = rid for update;
  if not found then raise exception 'Registro não encontrado.'; end if;
  if v.original is null then return false; end if;
  update descartes
     set item_id = v.original->>'item_id', item_nome = v.original->>'item_nome',
         quantidade = (v.original->>'quantidade')::numeric, unidade = v.original->>'unidade',
         motivo = v.original->>'motivo', original = null, editado_em = null
   where id = p_id;
  return true;
end $$;

create or replace function apagar_descarte(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare rid uuid := _conta_do_desperdicio(null);
begin
  delete from descartes where id = p_id and restaurante_id = rid;
  return found;
end $$;

-- Apagar de vez os registros de um período (testes, por exemplo).
create or replace function apagar_descartes_periodo(p_de date, p_ate date)
returns integer language plpgsql security definer set search_path = public as $$
declare rid uuid := _conta_do_desperdicio(null); v_n integer;
begin
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Período inválido (até 400 dias).';
  end if;
  delete from descartes where restaurante_id = rid and dia between p_de and p_ate;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── Permissões: nada para anon ────────────────────────────────────
revoke all on function registrar_descartes(jsonb) from public, anon;
revoke all on function descartes_do_periodo(date, date, uuid) from public, anon;
revoke all on function corrigir_descarte(uuid, text, text, numeric, text, text) from public, anon;
revoke all on function voltar_descarte_original(uuid) from public, anon;
revoke all on function apagar_descarte(uuid) from public, anon;
revoke all on function apagar_descartes_periodo(date, date) from public, anon;
grant execute on function registrar_descartes(jsonb) to authenticated;
grant execute on function descartes_do_periodo(date, date, uuid) to authenticated;
grant execute on function corrigir_descarte(uuid, text, text, numeric, text, text) to authenticated;
grant execute on function voltar_descarte_original(uuid) to authenticated;
grant execute on function apagar_descarte(uuid) to authenticated;
grant execute on function apagar_descartes_periodo(date, date) to authenticated;
