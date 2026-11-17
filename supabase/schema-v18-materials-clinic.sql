-- V18: clinic-private supplies, immutable shared archive, editable inventory units.
-- Requires V17. Catalog-only clones are NOT ownership decisions or opening balances.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.cabinet_items, public.cabinet_moves, public.ledger_codes,
 public.ledger_items, public.ledger_entries in share row exclusive mode;
create temporary table materials_items_before on commit drop as select to_jsonb(i)-'legacy_shared'-'legacy_source_id' data,id from public.cabinet_items i;
create temporary table materials_moves_before on commit drop as select * from public.cabinet_moves;
create temporary table materials_links_before on commit drop as select * from public.ledger_items;
create temporary table materials_entries_before on commit drop as select * from public.ledger_entries;
create temporary table materials_codes_before on commit drop as select * from public.ledger_codes;
alter table public.cabinet_items add column if not exists legacy_shared boolean not null default false;
alter table public.cabinet_items add column if not exists legacy_source_id bigint references public.cabinet_items(id);
-- A failed preflight rolls back the complete migration, including metadata additions.
do $$ begin
 if exists(select 1 from public.cabinet_items where kind not in ('medicine','topical','supply','insured','yakchim')
  or unit is null or unit<>btrim(unit) or char_length(unit) not between 1 and 20
  or (kind='insured' and (clinic is null or clinic not in ('S','N')))
  or (kind in ('medicine','topical','yakchim') and clinic is not null)
  or (kind='supply' and clinic is not null and clinic not in ('S','N'))
  or (legacy_shared and (kind<>'supply' or clinic is not null or legacy_source_id is not null))
  or (legacy_source_id is not null and (kind<>'supply' or clinic is null))) then
  raise exception 'V18_INVALID_ITEM'; end if;
 if exists(select 1 from public.cabinet_items i left join public.cabinet_items s on s.id=i.legacy_source_id
  where i.legacy_source_id is not null and not coalesce(s.legacy_shared and s.kind='supply' and s.clinic is null,false)) then
  raise exception 'V18_INVALID_SOURCE'; end if;
 if exists(select 1 from public.cabinet_items i where i.kind='supply' and i.clinic in ('S','N')
  and exists(select 1 from public.cabinet_moves m where m.item_id=i.id and m.kind<>'count')
  and not exists(select 1 from public.cabinet_moves m where m.item_id=i.id and m.kind='count')) then
  raise exception 'V18_INVALID_PRIVATE_INITIALIZATION'; end if;
 if exists(select 1 from public.ledger_codes c left join public.cabinet_items i on i.id=c.cabinet_item_id
  where c.cabinet_item_id is not null and not coalesce(c.clinic in ('S','N') and
   ((c."group"='extract' and i.kind='insured' and i.clinic=c.clinic) or
    (c."group"='cabinet' and ((i.kind in ('medicine','topical','yakchim') and i.clinic is null)
     or (i.kind='supply' and (i.clinic is null or i.clinic=c.clinic))))),false)) then
  raise exception 'V18_INVALID_CODE_TARGET'; end if;
 if exists(select 1 from public.ledger_items l left join public.ledger_entries e on e.id=l.entry_id
  left join public.cabinet_moves m on m.id=l.cabinet_move_id left join public.cabinet_items i on i.id=m.item_id
  where l.cabinet_move_id is not null and not coalesce(e.clinic in ('S','N') and
   ((l."group"='extract' and i.kind='insured' and i.clinic=e.clinic) or
    (l."group"='cabinet' and ((i.kind in ('medicine','topical','yakchim') and i.clinic is null)
     or (i.kind='supply' and (i.clinic is null or i.clinic=e.clinic))))),false)) then
  raise exception 'V18_INVALID_LEDGER_LINK'; end if;
end $$;
-- Replace V17 triggers, never disable guards in application code.
drop trigger if exists inventory_classification_guard_v17 on public.cabinet_items;
drop trigger if exists materials_item_guard_v18 on public.cabinet_items;
drop trigger if exists inventory_code_link_guard_v17 on public.ledger_codes;
drop trigger if exists inventory_ledger_link_guard_v17 on public.ledger_items;
drop trigger if exists inventory_entry_guard_v17 on public.ledger_entries;
drop trigger if exists materials_code_guard_v18 on public.ledger_codes;
drop trigger if exists materials_link_guard_v18 on public.ledger_items;
drop trigger if exists materials_entry_guard_v18 on public.ledger_entries;
alter table public.cabinet_items drop constraint if exists cabinet_items_insured_clinic_check;
alter table public.cabinet_items drop constraint if exists materials_scope_v18;
update public.cabinet_items set legacy_shared=true where kind='supply' and clinic is null and not legacy_shared;
alter table public.cabinet_items add constraint materials_scope_v18 check (
 (kind='supply' and ((legacy_shared and clinic is null and legacy_source_id is null) or
  (not legacy_shared and clinic is not null and clinic in ('S','N')))) or
 (kind='insured' and clinic is not null and clinic in ('S','N') and not legacy_shared and legacy_source_id is null) or
 (kind in ('medicine','topical','yakchim') and clinic is null and not legacy_shared and legacy_source_id is null));
create unique index if not exists materials_source_clinic_v18 on public.cabinet_items(legacy_source_id,clinic);
insert into public.cabinet_items(name,kind,clinic,unit,min_stock,active,sort_order,legacy_source_id)
 select s.name,'supply',c.clinic,s.unit,s.min_stock,s.active,s.sort_order,s.id
 from public.cabinet_items s cross join (values('S'),('N')) c(clinic)
 where s.legacy_shared on conflict(legacy_source_id,clinic) do nothing;
-- Exact source ID + code clinic. Names never select ownership or a target.
update public.ledger_codes c set cabinet_item_id=i.id from public.cabinet_items i
 where i.legacy_source_id=c.cabinet_item_id and i.clinic=c.clinic;

create or replace function public.inventory_scope_v17(item_kind text,item_clinic text) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(public.current_clinic() in ('S','N') and
 ((item_kind in ('insured','supply') and item_clinic=public.current_clinic()) or
 (item_kind in ('medicine','topical','yakchim','supply') and item_clinic is null)),false);
$$;
create or replace function public.materials_item_guard_v18() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_op='DELETE' then
  if old.legacy_shared then raise exception 'MATERIALS_LEGACY_READ_ONLY' using errcode='23514'; end if;
  return old;
 end if;
 if tg_op='UPDATE' then
  if old.legacy_shared then raise exception 'MATERIALS_LEGACY_READ_ONLY' using errcode='23514'; end if;
  if new.kind is distinct from old.kind or new.clinic is distinct from old.clinic
   or new.legacy_shared is distinct from old.legacy_shared or new.legacy_source_id is distinct from old.legacy_source_id then
   raise exception 'INVENTORY_CLASSIFICATION_IMMUTABLE' using errcode='23514'; end if;
 else
  if new.legacy_shared then raise exception 'MATERIALS_LEGACY_FLAG_FORBIDDEN' using errcode='23514'; end if;
 end if;
 new.unit:=btrim(new.unit);
 if new.unit is null or char_length(new.unit) not between 1 and 20 then
  raise exception 'MATERIALS_INVALID_UNIT' using errcode='23514'; end if;
 if tg_op='UPDATE' and new.unit is distinct from old.unit and exists(select 1 from public.cabinet_moves where item_id=old.id) then
  raise exception 'MATERIALS_UNIT_HAS_MOVEMENTS' using errcode='23514'; end if;
 if new.legacy_source_id is not null and not exists(select 1 from public.cabinet_items s
  where s.id=new.legacy_source_id and s.legacy_shared and s.kind='supply' and s.clinic is null) then
  raise exception 'MATERIALS_INVALID_SOURCE' using errcode='23514'; end if;
 return new;
end $$;
create trigger materials_item_guard_v18 before insert or update or delete on public.cabinet_items
 for each row execute function public.materials_item_guard_v18();
create or replace function public.materials_move_guard_v18() returns trigger
language plpgsql security definer set search_path='' as $$
declare i public.cabinet_items%rowtype;
begin
 if tg_op<>'INSERT' then raise exception 'MATERIALS_MOVES_APPEND_ONLY' using errcode='23514'; end if;
 -- Row lock serializes first-count decisions AND unit changes for this item.
 select * into i from public.cabinet_items where id=new.item_id for update;
 if not found then raise exception 'MATERIALS_ITEM_NOT_FOUND' using errcode='23503'; end if;
 if i.legacy_shared then raise exception 'MATERIALS_LEGACY_READ_ONLY' using errcode='23514'; end if;
 if i.kind='supply' and i.clinic in ('S','N') and new.kind<>'count'
  and not exists(select 1 from public.cabinet_moves where item_id=i.id and kind='count') then
  raise exception 'MATERIALS_FIRST_COUNT_REQUIRED' using errcode='23514'; end if;
 return new;
end $$;
drop trigger if exists materials_move_guard_v18 on public.cabinet_moves;
create trigger materials_move_guard_v18 before insert or update or delete on public.cabinet_moves
 for each row execute function public.materials_move_guard_v18();
create or replace function public.materials_link_guard_v18() returns trigger
language plpgsql security definer set search_path='' as $$
declare i public.cabinet_items%rowtype; ec text;
begin
 if tg_table_name='ledger_codes' then
  if new.cabinet_item_id is null then return new; end if;
  select * into i from public.cabinet_items where id=new.cabinet_item_id;
  ec:=new.clinic;
 else
  if new.cabinet_move_id is null then return new; end if;
  -- Existing archive links remain exactly where they were; only unchanged historical links are accepted.
  select x.* into i from public.cabinet_moves m join public.cabinet_items x on x.id=m.item_id where m.id=new.cabinet_move_id;
  select clinic into ec from public.ledger_entries where id=new.entry_id for share;
  if i.legacy_shared then
   if tg_op='UPDATE' and new.cabinet_move_id is not distinct from old.cabinet_move_id
    and new.entry_id is not distinct from old.entry_id and new."group" is not distinct from old."group" then return new; end if;
   raise exception 'MATERIALS_LEGACY_LINK_REVIEW' using errcode='23514';
  end if;
 end if;
 if not coalesce(ec in ('S','N') and not i.legacy_shared and
  ((new."group"='extract' and i.kind='insured' and i.clinic=ec) or
   (new."group"='cabinet' and ((i.kind in ('medicine','topical','yakchim') and i.clinic is null) or
    (i.kind='supply' and i.clinic=ec)))),false) then
  raise exception 'INVENTORY_LINK_SCOPE_MISMATCH' using errcode='23514'; end if;
 return new;
end $$;
create trigger materials_code_guard_v18 before insert or update on public.ledger_codes
 for each row execute function public.materials_link_guard_v18();
create trigger materials_link_guard_v18 before insert or update on public.ledger_items
 for each row execute function public.materials_link_guard_v18();
create or replace function public.materials_entry_guard_v18() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.clinic is distinct from old.clinic and exists(select 1 from public.ledger_items l
  join public.cabinet_moves m on m.id=l.cabinet_move_id join public.cabinet_items i on i.id=m.item_id
  where l.entry_id=old.id and (i.legacy_shared or new.clinic is null or new.clinic not in ('S','N')
   or (i.kind in ('insured','supply') and i.clinic is distinct from new.clinic))) then
  raise exception 'INVENTORY_ENTRY_SCOPE_MISMATCH' using errcode='23514'; end if;
 return new;
end $$;
create trigger materials_entry_guard_v18 before update of clinic on public.ledger_entries
 for each row execute function public.materials_entry_guard_v18();

-- V14 tables may not exist. This is their complete base shape, without a fallback clinic.
create table if not exists public.supply_requests (
 id bigint generated always as identity primary key,
 clinic text not null default public.current_clinic() check(clinic in ('S','N')),
 text text not null, category text not null check(category in ('yakchim','treatment','office')),
 status text not null default 'requested' check(status in ('requested','approved','ordered','received','cancelled')),
 requested_by text not null, requested_at timestamptz not null default now(),
 price integer,vendor text,price_note text,product_url text,priced_at timestamptz,approved_at timestamptz,
 ordered_at timestamptz,received_at timestamptz,received_by text,cancelled_at timestamptz,memo text,
 created_at timestamptz not null default now());
create table if not exists public.supply_settings (
 id integer not null default 1 check(id=1),owner_pin text,updated_at timestamptz not null default now());
lock table public.supply_requests,public.supply_settings in share row exclusive mode;
create temporary table materials_requests_before on commit drop as select * from public.supply_requests;
-- No SELECT of PIN values is returned to a client or written to a log.
do $$ declare p record; begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='supply_settings' and column_name='clinic') then
  alter table public.supply_settings add column clinic text;
  if exists(select 1 from public.supply_settings where id<>1) or (select count(*) from public.supply_settings)>1 then
   raise exception 'V18_INVALID_SETTINGS'; end if;
  for p in select conname from pg_constraint where conrelid='public.supply_settings'::regclass and contype='p' loop
   execute format('alter table public.supply_settings drop constraint %I',p.conname); end loop;
  update public.supply_settings set clinic='S';
  insert into public.supply_settings(id,clinic,owner_pin,updated_at)
   select id,'N',owner_pin,updated_at from public.supply_settings where clinic='S';
 end if;
 if exists(select 1 from public.supply_settings where id is distinct from 1 or clinic is null or clinic not in ('S','N'))
  or exists(select 1 from public.supply_requests where clinic is null or clinic not in ('S','N')) then
  raise exception 'V18_INVALID_SUPPLY_CLINIC'; end if;
end $$;
alter table public.supply_requests alter column clinic set default public.current_clinic();
alter table public.supply_requests alter column clinic set not null;
alter table public.supply_settings alter column clinic set default public.current_clinic();
alter table public.supply_settings alter column clinic set not null;
do $$ declare p record; begin
 for p in select conname from pg_constraint where conrelid='public.supply_settings'::regclass and contype='p' loop
  execute format('alter table public.supply_settings drop constraint %I',p.conname); end loop;
 alter table public.supply_settings add primary key(clinic,id);
end $$;
alter table public.supply_settings drop constraint if exists materials_settings_clinic_v18;
alter table public.supply_settings add constraint materials_settings_clinic_v18 check(clinic in ('S','N') and id=1);
insert into public.supply_settings(id,clinic) values(1,'S'),(1,'N') on conflict(clinic,id) do nothing;
create index if not exists supply_requests_status_idx on public.supply_requests(status,requested_at desc);
create or replace function public.materials_supply_clinic_guard_v18() returns trigger
language plpgsql set search_path='' as $$ begin
 if new.clinic is null or new.clinic not in ('S','N') then raise exception 'MATERIALS_CLINIC_REQUIRED' using errcode='23514'; end if;
 if tg_op='UPDATE' and new.clinic is distinct from old.clinic then raise exception 'MATERIALS_CLINIC_IMMUTABLE' using errcode='23514'; end if;
 return new;
end $$;
drop trigger if exists materials_supply_clinic_guard_v18 on public.supply_requests;
create trigger materials_supply_clinic_guard_v18 before insert or update on public.supply_requests
 for each row execute function public.materials_supply_clinic_guard_v18();
drop trigger if exists materials_supply_clinic_guard_v18 on public.supply_settings;
create trigger materials_supply_clinic_guard_v18 before insert or update on public.supply_settings
 for each row execute function public.materials_supply_clinic_guard_v18();
-- Remove old permissive policies. Restrictive guards also survive future OR policies.
do $$ declare p record; t text; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in
  ('cabinet_items','cabinet_moves','supply_requests','supply_settings') loop
  execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop;
 foreach t in array array['cabinet_items','cabinet_moves','supply_requests','supply_settings'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke truncate,trigger on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
grant usage,select on sequence public.supply_requests_id_seq to authenticated;
create policy materials_items_allow_v18 on public.cabinet_items for all to authenticated using(true) with check(true);
create policy materials_items_scope_v18 on public.cabinet_items as restrictive for all to authenticated
 using(public.inventory_scope_v17(kind,clinic)) with check(public.inventory_scope_v17(kind,clinic));
create policy materials_items_insert_v18 on public.cabinet_items as restrictive for insert to authenticated with check(not legacy_shared);
create policy materials_items_update_v18 on public.cabinet_items as restrictive for update to authenticated using(not legacy_shared) with check(not legacy_shared);
create policy materials_items_delete_v18 on public.cabinet_items as restrictive for delete to authenticated using(not legacy_shared);
create policy materials_moves_read_v18 on public.cabinet_moves for select to authenticated using(true);
create policy materials_moves_insert_v18 on public.cabinet_moves for insert to authenticated with check(true);
create policy materials_moves_scope_v18 on public.cabinet_moves as restrictive for all to authenticated
 using(exists(select 1 from public.cabinet_items i where i.id=item_id and public.inventory_scope_v17(i.kind,i.clinic)))
 with check(exists(select 1 from public.cabinet_items i where i.id=item_id and not i.legacy_shared and public.inventory_scope_v17(i.kind,i.clinic)));
create policy materials_moves_no_update_v18 on public.cabinet_moves as restrictive for update to authenticated using(false) with check(false);
create policy materials_moves_no_delete_v18 on public.cabinet_moves as restrictive for delete to authenticated using(false);
create policy materials_requests_allow_v18 on public.supply_requests for all to authenticated using(true) with check(true);
create policy materials_requests_scope_v18 on public.supply_requests as restrictive for all to authenticated
 using(clinic=public.current_clinic() and public.current_clinic() in ('S','N'))
 with check(clinic=public.current_clinic() and public.current_clinic() in ('S','N'));
create policy materials_settings_allow_v18 on public.supply_settings for all to authenticated using(true) with check(true);
create policy materials_settings_scope_v18 on public.supply_settings as restrictive for all to authenticated
 using(clinic=public.current_clinic() and public.current_clinic() in ('S','N'))
 with check(clinic=public.current_clinic() and public.current_clinic() in ('S','N'));
revoke all on function public.materials_item_guard_v18(),public.materials_move_guard_v18(),public.materials_link_guard_v18(),
 public.materials_entry_guard_v18(),public.materials_supply_clinic_guard_v18() from public,anon,authenticated;
-- Verify original IDs/fields and ALL history. Only flags, new catalog rows and exact code remaps may differ.
do $$ begin
 if (select md5(coalesce(jsonb_agg(data order by id)::text,'[]')) from pg_temp.materials_items_before)
  is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(i)-'legacy_shared'-'legacy_source_id' order by i.id)::text,'[]'))
   from public.cabinet_items i join pg_temp.materials_items_before b using(id))
 or exists(select 1 from pg_temp.materials_items_before b left join public.cabinet_items i using(id)
  where b.data is distinct from to_jsonb(i)-'legacy_shared'-'legacy_source_id')
 or (select md5(coalesce(jsonb_agg(to_jsonb(m) order by id)::text,'[]')) from pg_temp.materials_moves_before m)
  is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(m) order by id)::text,'[]')) from public.cabinet_moves m)
 or (select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'[]')) from pg_temp.materials_links_before l)
  is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'[]')) from public.ledger_items l)
 or (select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'[]')) from pg_temp.materials_entries_before e)
  is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'[]')) from public.ledger_entries e)
 or (select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'[]')) from pg_temp.materials_requests_before r)
  is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'[]')) from public.supply_requests r)
 or exists(select 1 from pg_temp.materials_codes_before b left join public.ledger_codes c using(id)
  left join public.cabinet_items i on i.legacy_source_id=b.cabinet_item_id and i.clinic=b.clinic
  where to_jsonb(b)-'cabinet_item_id' is distinct from to_jsonb(c)-'cabinet_item_id'
   or c.cabinet_item_id is distinct from coalesce(i.id,b.cabinet_item_id)) then
  raise exception 'V18_PRESERVATION_FAILED'; end if;
end $$;
notify pgrst,'reload schema';
commit;
