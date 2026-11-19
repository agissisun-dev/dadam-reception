-- V19 (2026-11-19): 재고·물품 규칙 최종 정리 (사용자 2026-11-19 "지금 말한 게 더 최종").
-- 집(클로드)과 병원(아사이드)에서 따로 고친 두 구조를 하나로 맞춘다. 아사이드의
-- schema-v17-insured-inventory-scope.sql / schema-v18-materials-clinic.sql 을 실행했든 안 했든 이 파일 하나로 정리된다.
--
-- 최종 규칙
--   · 재고 7칸: 외용제(topical) · 공용 탕약·환약(medicine) · 보험약(insured, 병원별) · 약침(yakchim) ·
--     치료실 용품(treatment, 병원별) · 탕전실 용품(brewroom, 공통) · 공동용품(supply, 공통)
--   · 품목의 구분·병원은 접수실이 고칠 수 있다(잠금 없음). 기록 없는 품목은 지울 수 있다.
--   · 물품 신청·잠금 번호는 두 병원 한 목록(원장이 한눈에).
--   · 장부 → 재고 차감은 앱이 한다(DB 트리거 없음).
-- 데이터는 지우지 않는다. 아사이드 v18이 만든 "보관" 표시와 S/N 복제 품목(기록 없는 것)만 되돌린다.

begin;

-- 1) 아사이드가 심은 트리거·함수 제거 (있을 때만)
drop trigger if exists inventory_classification_guard_v17 on public.cabinet_items;
drop trigger if exists materials_item_guard_v18 on public.cabinet_items;
drop trigger if exists materials_move_guard_v18 on public.cabinet_moves;
drop trigger if exists inventory_code_link_guard_v17 on public.ledger_codes;
drop trigger if exists materials_code_guard_v18 on public.ledger_codes;
drop trigger if exists inventory_ledger_link_guard_v17 on public.ledger_items;
drop trigger if exists materials_link_guard_v18 on public.ledger_items;
drop trigger if exists inventory_entry_guard_v17 on public.ledger_entries;
drop trigger if exists materials_entry_guard_v18 on public.ledger_entries;
drop function if exists public.inventory_classification_guard_v17();
drop function if exists public.inventory_link_guard_v17();
drop function if exists public.inventory_entry_guard_v17();
drop function if exists public.materials_item_guard_v18();
drop function if exists public.materials_move_guard_v18();
drop function if exists public.materials_link_guard_v18();
drop function if exists public.materials_entry_guard_v18();
do $$ begin
  if to_regclass('public.supply_requests') is not null then
    execute 'drop trigger if exists materials_supply_clinic_guard_v18 on public.supply_requests';
  end if;
  if to_regclass('public.supply_settings') is not null then
    execute 'drop trigger if exists materials_supply_clinic_guard_v18 on public.supply_settings';
  end if;
end $$;
drop function if exists public.materials_supply_clinic_guard_v18();

-- 2) 칸·병원·단위 (V15·V17 내용 포함. 이미 있으면 그대로)
alter table public.cabinet_items add column if not exists clinic text;
alter table public.cabinet_items add column if not exists unit text not null default '개';
alter table public.ledger_codes add column if not exists per_day integer;
alter table public.ledger_codes drop constraint if exists ledger_codes_per_day_check;
alter table public.ledger_codes add constraint ledger_codes_per_day_check check (per_day is null or per_day > 0);

-- 3) 아사이드 v18 되돌리기: 보관 표시 해제, 기록 없는 복제 품목 삭제, 약어 연결을 원래 품목으로
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='cabinet_items' and column_name='legacy_source_id') then
    -- 복제 품목에 이어진 약어를 원래(공용) 품목으로 되돌린다
    update public.ledger_codes c set cabinet_item_id = i.legacy_source_id
      from public.cabinet_items i
     where c.cabinet_item_id = i.id and i.legacy_source_id is not null;
    -- 기록이 없는 복제 품목은 지운다(기록이 생긴 복제는 남겨 둔다 — 접수실이 보고 정리)
    delete from public.cabinet_items i
     where i.legacy_source_id is not null
       and not exists (select 1 from public.cabinet_moves m where m.item_id = i.id)
       and not exists (select 1 from public.ledger_codes c where c.cabinet_item_id = i.id);
    alter table public.cabinet_items drop column legacy_source_id;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='cabinet_items' and column_name='legacy_shared') then
    alter table public.cabinet_items drop column legacy_shared;
  end if;
end $$;

-- 4) 7칸 조건. 공용 칸의 병원 표시는 지운다(아사이드가 용품에 병원을 붙였을 수 있음).
alter table public.cabinet_items drop constraint if exists cabinet_items_kind_check;
alter table public.cabinet_items drop constraint if exists cabinet_items_insured_clinic_check;
alter table public.cabinet_items drop constraint if exists materials_scope_v18;
update public.cabinet_items set clinic = null where kind in ('medicine','topical','supply','yakchim','brewroom') and clinic is not null;
update public.cabinet_items set clinic = 'S' where kind in ('insured','treatment') and clinic is null; -- 지금까지 보험약은 다담에스만 만들었음
alter table public.cabinet_items add constraint cabinet_items_kind_check
  check (kind in ('medicine','topical','supply','insured','yakchim','treatment','brewroom'));
alter table public.cabinet_items add constraint cabinet_items_insured_clinic_check
  check ((kind in ('insured','treatment') and clinic in ('S','N')) or (kind not in ('insured','treatment') and clinic is null));

-- 5) 재고 표 정책: 품목은 "공통 또는 내 병원" 읽기·쓰기, 장부(cabinet_moves)는 읽기·넣기만
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('cabinet_items','cabinet_moves') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
alter table public.cabinet_items enable row level security;
alter table public.cabinet_moves enable row level security;
create policy "cabinet_items_read" on public.cabinet_items for select to authenticated
  using (clinic is null or clinic = public.current_clinic());
create policy "cabinet_items_write" on public.cabinet_items for all to authenticated
  using (clinic is null or clinic = public.current_clinic())
  with check (clinic is null or clinic = public.current_clinic());
create policy "auth_read" on public.cabinet_moves for select to authenticated using (true);
create policy "auth_insert" on public.cabinet_moves for insert to authenticated with check (true);
grant select, insert, update, delete on public.cabinet_items to authenticated;
grant select, insert on public.cabinet_moves to authenticated;

-- 6) 물품 신청·잠금 번호: 두 병원 한 목록으로 (아사이드 v18이 병원별로 나눴으면 되돌림)
do $$ declare p record; begin
  if to_regclass('public.supply_requests') is null then return; end if;
  for p in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('supply_requests','supply_settings') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
  -- supply_settings: (clinic,id) 기본키였으면 id 하나로. 잠금 번호는 있는 것 하나를 남긴다.
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='supply_settings' and column_name='clinic') then
    for p in select conname from pg_constraint where conrelid='public.supply_settings'::regclass loop
      execute format('alter table public.supply_settings drop constraint %I', p.conname);
    end loop;
    -- 비어 있지 않은 잠금 번호를 S 줄에 모으고 나머지 줄은 지운다
    update public.supply_settings s set owner_pin = coalesce(s.owner_pin, (select owner_pin from public.supply_settings o where o.owner_pin is not null limit 1))
      where s.clinic = 'S' or s.clinic is null;
    delete from public.supply_settings where clinic is distinct from 'S';
    alter table public.supply_settings drop column clinic;
    alter table public.supply_settings add primary key (id);
    alter table public.supply_settings add constraint supply_settings_id_check check (id = 1);
  end if;
  insert into public.supply_settings (id) values (1) on conflict (id) do nothing;
  alter table public.supply_requests alter column clinic drop not null;
  alter table public.supply_requests alter column clinic set default coalesce(public.current_clinic(), 'S');
  alter table public.supply_requests enable row level security;
  alter table public.supply_settings enable row level security;
  create policy "auth_all" on public.supply_requests for all to authenticated using (true) with check (true);
  create policy "auth_all" on public.supply_settings for all to authenticated using (true) with check (true);
  grant select, insert, update, delete on public.supply_requests to authenticated;
  grant select, insert, update, delete on public.supply_settings to authenticated;
end $$;

commit;
notify pgrst, 'reload schema';
