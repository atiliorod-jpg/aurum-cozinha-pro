-- =====================================================================
--  MIGRAÇÃO 66 — DESPERDÍCIO: GRAMAS E O "ALTERAR" DE QUEM REGISTROU
--  (24/11/2026, pedido do dono)
--
--  • GRAMAS: a cozinha registra "10 g" de bolinho sem fazer conta. O banco
--    guarda como foi digitado (kg, g ou unid); o relatório soma g e kg juntos.
--  • ALTERAR: logo depois de registrar, quem anotou errado corrige ali mesmo,
--    sem a senha da Administração — mas SÓ o registro feito NESTE aparelho
--    (a mesma sessão de login), nos primeiros 15 minutos, e enquanto a
--    Administração não tiver corrigido. Fica marcado "alterado" e guarda como
--    estava (`original`), para o dono ver no relatório.
--
--  Aplicar:  node scripts/rodar-migracao.mjs 66
--  Conferir: node scripts/pentest-desperdicio.mjs
-- =====================================================================

alter table descartes drop constraint if exists descartes_unidade_check;
alter table descartes add constraint descartes_unidade_check check (unidade in ('kg', 'g', 'unid'));
alter table descartes add column if not exists sessao uuid;        -- a sessão de login que registrou
alter table descartes add column if not exists alterado_em timestamptz; -- alterado por quem registrou

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
                           quantidade, unidade, motivo, responsavel, usuario, sessao)
    select l.id, rid, l.quando,
           (l.quando at time zone 'America/Recife')::date,
           to_char(l.quando at time zone 'America/Recife', 'HH24:MI'),
           l.turno, l.item_id, l.item_nome, round(l.quantidade, 3), l.unidade, l.motivo, l.responsavel,
           auth.uid(), sessao_atual()
      from linhas l
     where l.item_nome <> '' and l.motivo <> ''
       and l.quantidade > 0 and l.quantidade <= 100000
       and l.unidade in ('kg', 'g', 'unid')
       and l.quando >= now() - interval '30 days'
       and _pode_gravar_etiqueta(rid, (l.quando at time zone 'America/Recife')::date)
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_n from novas;
  return v_n;
end $$;

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
  if p_unidade not in ('kg', 'g', 'unid') then raise exception 'Unidade inválida.'; end if;
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

-- ⚠️ "VOLTAR AO ORIGINAL" também tira a marca de "alterado"
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
         motivo = v.original->>'motivo', original = null, editado_em = null, alterado_em = null
   where id = p_id;
  return true;
end $$;

-- O "Alterar" de quem acabou de registrar (sem a senha da Administração).
create or replace function alterar_meu_descarte(p_id uuid, p_item_id text, p_item_nome text,
                                                p_quantidade numeric, p_unidade text, p_motivo text)
returns boolean language plpgsql security definer set search_path = public as $$
declare rid uuid := meu_restaurante_id(); v descartes%rowtype;
begin
  if auth.uid() is null or rid is null then raise exception 'Sem restaurante.'; end if;
  select * into v from descartes where id = p_id and restaurante_id = rid for update;
  if not found then raise exception 'Registro não encontrado.'; end if;
  if v.sessao is distinct from sessao_atual() then
    raise exception 'Só dá para alterar o registro feito neste aparelho.';
  end if;
  if v.criado_em < now() - interval '15 minutes' then
    raise exception 'Passou o tempo de alterar. Peça à Administração para corrigir.';
  end if;
  if v.editado_em is not null then
    raise exception 'A Administração já corrigiu este registro.';
  end if;
  if trim(coalesce(p_item_nome, '')) = '' or trim(coalesce(p_motivo, '')) = '' then
    raise exception 'Falta o item ou o motivo.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 or p_quantidade > 100000 then raise exception 'Quantidade inválida.'; end if;
  if p_unidade not in ('kg', 'g', 'unid') then raise exception 'Unidade inválida.'; end if;
  update descartes
     set original = coalesce(original, jsonb_build_object('item_id', v.item_id, 'item_nome', v.item_nome,
                     'quantidade', v.quantidade, 'unidade', v.unidade, 'motivo', v.motivo)),
         item_id = nullif(left(coalesce(p_item_id, ''), 80), ''),
         item_nome = left(trim(p_item_nome), 120),
         quantidade = round(p_quantidade, 3), unidade = p_unidade,
         motivo = left(trim(p_motivo), 300),
         alterado_em = now()
   where id = p_id;
  return true;
end $$;

-- o relatório devolve a marca nova
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
             'editado_em', d.editado_em, 'alterado_em', d.alterado_em, 'original', d.original)
      from descartes d
     where d.restaurante_id = rid and d.dia between p_de and p_ate
     order by d.quando desc
     limit 20000;
end $$;

revoke all on function alterar_meu_descarte(uuid, text, text, numeric, text, text) from public, anon;
grant execute on function alterar_meu_descarte(uuid, text, text, numeric, text, text) to authenticated;
