-- V17: insurance inventory belongs to one clinic; all other categories stay shared.
-- Self-contained V15 prerequisites. No seeds, cloning, row UPDATEs or deduction triggers.
begin;
lock table public.cabinet_items, public.cabinet_moves, public.ledger_codes,
  public.ledger_items, public.ledger_entries in share row exclusive mode;
-- Snapshot after acquiring locks: live staff writes before the lock are included.
-- Exclude only the V15 metadata additions; preserve every original item field.
create temporary table inventory_preservation_v17 on commit drop as
select
  (select md5(coalesce(jsonb_agg(to_jsonb(i)-'clinic'-'unit' order by i.id)::text,'[]')) from public.cabinet_items i) as item_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,'[]')) from public.cabinet_moves m) as move_hash;
alter table public.cabinet_items add column if not exists clinic text;
alter table public.cabinet_items add column if not exists unit text not null default '개';
alter table public.ledger_codes add column if not exists per_day integer;

-- Fail, never repair existing relationships. Locks prevent concurrent invalid writes.
do $$ begin
  if exists (select 1 from public.cabinet_items where kind not in ('medicine','topical','supply','insured','yakchim')
    or (kind='insured' and (clinic is null or clinic not in ('S','N')))
    or (kind<>'insured' and clinic is not null)) then
    raise exception 'V17_INVALID_ITEM_SCOPE';
  end if;
  if exists (select 1 from public.ledger_codes c left join public.cabinet_items i on i.id=c.cabinet_item_id
    where c.cabinet_item_id is not null and not coalesce(
      (c."group"='extract' and i.kind='insured' and i.clinic=c.clinic and c.clinic in ('S','N'))
      or (c."group"='cabinet' and i.kind in ('medicine','topical','supply','yakchim') and i.clinic is null),false)) then
    raise exception 'V17_INVALID_CODE_TARGET';
  end if;
  if exists (select 1 from public.ledger_items l
    left join public.ledger_entries e on e.id=l.entry_id
    left join public.cabinet_moves m on m.id=l.cabinet_move_id
    left join public.cabinet_items i on i.id=m.item_id
    where l.cabinet_move_id is not null and not coalesce(
      (l."group"='extract' and i.kind='insured' and i.clinic=e.clinic and e.clinic in ('S','N'))
      or (l."group"='cabinet' and i.kind in ('medicine','topical','supply','yakchim') and i.clinic is null and e.clinic in ('S','N')),false)) then
    raise exception 'V17_INVALID_LEDGER_MOVE';
  end if;
end $$;
alter table public.cabinet_items drop constraint if exists cabinet_items_kind_check;
alter table public.cabinet_items add constraint cabinet_items_kind_check check (kind in ('medicine','topical','supply','insured','yakchim'));
alter table public.cabinet_items drop constraint if exists cabinet_items_insured_clinic_check;
alter table public.cabinet_items add constraint cabinet_items_insured_clinic_check check (
  (kind='insured' and clinic is not null and clinic in ('S','N')) or (kind<>'insured' and clinic is null));
alter table public.ledger_codes drop constraint if exists ledger_codes_per_day_check;
alter table public.ledger_codes add constraint ledger_codes_per_day_check check (per_day is null or per_day>0);

create or replace function public.inventory_scope_v17(item_kind text, item_clinic text) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce(public.current_clinic() in ('S','N') and
    ((item_kind='insured' and item_clinic=public.current_clinic()) or
     (item_kind in ('medicine','topical','supply','yakchim') and item_clinic is null)),false);
$$;
revoke all on function public.inventory_scope_v17(text,text) from public, anon;
grant execute on function public.inventory_scope_v17(text,text) to authenticated, service_role;

create or replace function public.inventory_classification_guard_v17() returns trigger
language plpgsql set search_path='' as $$ begin
  if new.kind is distinct from old.kind or new.clinic is distinct from old.clinic then
    raise exception 'INVENTORY_CLASSIFICATION_IMMUTABLE' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists inventory_classification_guard_v17 on public.cabinet_items;
create trigger inventory_classification_guard_v17 before update on public.cabinet_items
for each row execute function public.inventory_classification_guard_v17();

-- Definer sees real referenced rows, even when RLS would hide an invalid foreign target.
create or replace function public.inventory_link_guard_v17() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text; c text; ec text;
begin
  if tg_table_name='ledger_codes' then
    if new.cabinet_item_id is null then return new; end if;
    select kind,clinic into k,c from public.cabinet_items where id=new.cabinet_item_id;
    ec:=new.clinic;
  else
    if new.cabinet_move_id is null then return new; end if;
    select i.kind,i.clinic into k,c from public.cabinet_moves m
      join public.cabinet_items i on i.id=m.item_id where m.id=new.cabinet_move_id;
    -- Serialize against concurrent entry-clinic edits, not merely FK key changes.
    select clinic into ec from public.ledger_entries where id=new.entry_id for share;
  end if;
  if not coalesce(ec in ('S','N') and
    ((new."group"='extract' and k='insured' and c=ec)
     or (new."group"='cabinet' and k in ('medicine','topical','supply','yakchim') and c is null)),false) then
    raise exception 'INVENTORY_LINK_SCOPE_MISMATCH' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists inventory_code_link_guard_v17 on public.ledger_codes;
create trigger inventory_code_link_guard_v17 before insert or update on public.ledger_codes
for each row execute function public.inventory_link_guard_v17();
drop trigger if exists inventory_ledger_link_guard_v17 on public.ledger_items;
create trigger inventory_ledger_link_guard_v17 before insert or update on public.ledger_items
for each row execute function public.inventory_link_guard_v17();

-- An entry clinic edit must not invalidate previously accepted insurance links.
create or replace function public.inventory_entry_guard_v17() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if new.clinic is distinct from old.clinic and exists (
    select 1 from public.ledger_items l join public.cabinet_moves m on m.id=l.cabinet_move_id
      join public.cabinet_items i on i.id=m.item_id
    where l.entry_id=old.id and (new.clinic is null or new.clinic not in ('S','N')
      or (i.kind='insured' and i.clinic is distinct from new.clinic))) then
    raise exception 'INVENTORY_ENTRY_SCOPE_MISMATCH' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists inventory_entry_guard_v17 on public.ledger_entries;
create trigger inventory_entry_guard_v17 before update of clinic on public.ledger_entries
for each row execute function public.inventory_entry_guard_v17();
revoke all on function public.inventory_classification_guard_v17(), public.inventory_link_guard_v17(), public.inventory_entry_guard_v17() from public,anon,authenticated;

-- TRUNCATE bypasses RLS; client-created triggers must not alter this boundary.
-- Leave ordinary DML and owner/service privileges unchanged.
revoke truncate, trigger on public.cabinet_items, public.cabinet_moves from public, anon, authenticated;
alter table public.cabinet_items enable row level security;
alter table public.cabinet_moves enable row level security;
-- Replace every legacy inventory policy. Restrictive guards survive later permissive policies.
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('cabinet_items','cabinet_moves') loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
create policy inventory_items_allow_v17 on public.cabinet_items for all to authenticated using(true) with check(true);
create policy inventory_items_scope_v17 on public.cabinet_items as restrictive for all to authenticated
  using(public.inventory_scope_v17(kind,clinic)) with check(public.inventory_scope_v17(kind,clinic));
create policy inventory_moves_read_v17 on public.cabinet_moves for select to authenticated using(true);
create policy inventory_moves_insert_v17 on public.cabinet_moves for insert to authenticated with check(true);
create policy inventory_moves_scope_v17 on public.cabinet_moves as restrictive for all to authenticated
  using(exists(select 1 from public.cabinet_items i where i.id=item_id and public.inventory_scope_v17(i.kind,i.clinic)))
  with check(exists(select 1 from public.cabinet_items i where i.id=item_id and public.inventory_scope_v17(i.kind,i.clinic)));
create policy inventory_moves_no_update_v17 on public.cabinet_moves as restrictive for update to authenticated using(false) with check(false);
create policy inventory_moves_no_delete_v17 on public.cabinet_moves as restrictive for delete to authenticated using(false);
-- Fail the same transaction if any original inventory/movement field changed.
do $$ begin
  if (select item_hash from pg_temp.inventory_preservation_v17) is distinct from
      (select md5(coalesce(jsonb_agg(to_jsonb(i)-'clinic'-'unit' order by i.id)::text,'[]')) from public.cabinet_items i)
    or (select move_hash from pg_temp.inventory_preservation_v17) is distinct from
      (select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,'[]')) from public.cabinet_moves m) then
    raise exception 'V17_INVENTORY_PRESERVATION_FAILED';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
