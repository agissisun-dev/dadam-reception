-- V20: 7칸 재고 추가 복구. 기존 수량/품목/이동/장부는 변경하지 않는다.
-- V18 legacy 보관/단위/이동기록 보호와 S/N 경계를 유지한다. V19 전체 되돌리기 SQL을 재실행하지 않는다.
begin;
set local lock_timeout = '5s';
lock table public.cabinet_items, public.cabinet_moves, public.ledger_codes, public.ledger_entries, public.ledger_items in share row exclusive mode;
create temporary table inventory_catalog_before_v20 on commit drop as
 select 'cabinet_items'::text as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.cabinet_items r
 union all
 select 'cabinet_moves'::text as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.cabinet_moves r
 union all
 select 'ledger_codes'::text as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_codes r
 union all
 select 'ledger_entries'::text as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_entries r
 union all
 select 'ledger_items'::text as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_items r;

alter table public.cabinet_items drop constraint if exists cabinet_items_kind_check;
alter table public.cabinet_items add constraint cabinet_items_kind_check
 check (kind in ('medicine','topical','supply','insured','yakchim','treatment','brewroom'));
alter table public.cabinet_items drop constraint if exists materials_scope_v18;
alter table public.cabinet_items add constraint materials_scope_v18 check (
 (kind='supply' and (
   (legacy_shared and clinic is null and legacy_source_id is null) or
   (not legacy_shared and (
     (clinic is null and legacy_source_id is null) or
     (clinic is not null and clinic in ('S','N'))
   ))
 )) or
 (kind in ('insured','treatment') and clinic is not null and clinic in ('S','N') and not legacy_shared and legacy_source_id is null) or
 (kind in ('medicine','topical','yakchim','brewroom') and clinic is null and not legacy_shared and legacy_source_id is null)
);

create or replace function public.inventory_scope_v17(item_kind text,item_clinic text) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(public.current_clinic() in ('S','N') and (
   (item_kind in ('insured','treatment','supply') and item_clinic=public.current_clinic()) or
   (item_kind in ('medicine','topical','yakchim','supply','brewroom') and item_clinic is null)
 ),false);
$$;

-- 장부 연결도 동일한 7분류 경계를 사용한다. 기존 legacy 연결 보호는 유지한다.
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
   (new."group"='cabinet' and ((i.kind in ('medicine','topical','yakchim','supply','brewroom') and i.clinic is null) or
    (i.kind in ('supply','treatment') and i.clinic=ec)))),false) then
  raise exception 'INVENTORY_LINK_SCOPE_MISMATCH' using errcode='23514'; end if;
 return new;
end $$;

-- 앱의 품목 삭제는 active=false. 향후 잘못된 물리 DELETE도 차단한다.
drop policy if exists cabinet_items_no_delete_v20 on public.cabinet_items;
create policy cabinet_items_no_delete_v20 on public.cabinet_items as restrictive for delete to authenticated using(false);

do $$ begin
 if exists (select * from inventory_catalog_before_v20 except (select 'cabinet_items'::text as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.cabinet_items r
 union all
 select 'cabinet_moves'::text as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.cabinet_moves r
 union all
 select 'ledger_codes'::text as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_codes r
 union all
 select 'ledger_entries'::text as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_entries r
 union all
 select 'ledger_items'::text as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_items r)) then raise exception 'V20_INVENTORY_DATA_CHANGED'; end if;
end $$;
commit;
notify pgrst, 'reload schema';
