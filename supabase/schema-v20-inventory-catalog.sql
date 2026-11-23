-- V20: 7칸 재고 추가 복구. 기존 수량/품목/이동/장부는 변경하지 않는다.
-- V18 legacy 보관/단위/이동기록 보호와 S/N 경계를 유지한다. V19 전체 되돌리기 SQL을 재실행하지 않는다.
begin;
set local lock_timeout = '5s';
lock table public.cabinet_items, public.cabinet_moves in share row exclusive mode;
create temporary table inventory_catalog_before_v20 on commit drop as
 select 'items' as subject, count(*) as n, md5(coalesce(string_agg(row_to_json(i)::text, '' order by id),'')) as digest from public.cabinet_items i
 union all
 select 'moves', count(*), md5(coalesce(string_agg(row_to_json(m)::text, '' order by id),'')) from public.cabinet_moves m;

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

-- 앱의 품목 삭제는 active=false. 향후 잘못된 물리 DELETE도 차단한다.
drop policy if exists cabinet_items_no_delete_v20 on public.cabinet_items;
create policy cabinet_items_no_delete_v20 on public.cabinet_items as restrictive for delete to authenticated using(false);

do $$ begin
 if exists (
  (select * from inventory_catalog_before_v20 except
    (select 'items',count(*),md5(coalesce(string_agg(row_to_json(i)::text,'' order by id),'')) from public.cabinet_items i
     union all select 'moves',count(*),md5(coalesce(string_agg(row_to_json(m)::text,'' order by id),'')) from public.cabinet_moves m))
 ) then raise exception 'V20_INVENTORY_DATA_CHANGED'; end if;
end $$;
commit;
notify pgrst, 'reload schema';
