-- V15 (2026-11-13): 재고현황 5칸 — 외용제 · 다담환약 · 보험약 · 약침 · 용품.
-- 보험약(엑스제)은 병원별(사업자가 달라서, 사용자 2026-11-13) · 단위 포 · 장부 "오적산2일"에서 자동 차감(일수 × 하루 포 수, 기본 3).
-- 기존 품목·장부는 그대로. 칸만 더한다.

alter table public.cabinet_items drop constraint if exists cabinet_items_kind_check;
alter table public.cabinet_items add constraint cabinet_items_kind_check
  check (kind in ('medicine','topical','supply','insured','yakchim'));

-- clinic: null = 두 병원 공통(지금까지 품목 전부). 보험약은 병원을 꼭 적는다.
alter table public.cabinet_items add column if not exists clinic text check (clinic in ('S','N'));
alter table public.cabinet_items add column if not exists unit text not null default '개';
alter table public.cabinet_items drop constraint if exists cabinet_items_insured_clinic_check;
alter table public.cabinet_items add constraint cabinet_items_insured_clinic_check
  check (kind <> 'insured' or clinic is not null);

-- 약어 표의 엑스제 항목: 어느 보험약 품목에서 빼는지(cabinet_item_id, 이미 있음) + 하루 포 수(없으면 3)
alter table public.ledger_codes add column if not exists per_day integer check (per_day is null or per_day > 0);

-- 품목을 다른 병원 것까지 보이지 않게: 공통(null) 또는 내 병원 것만 읽는다. 쓰기는 그대로(접수실이 고침).
drop policy if exists "auth_all" on public.cabinet_items;
drop policy if exists "cabinet_items_read" on public.cabinet_items;
drop policy if exists "cabinet_items_write" on public.cabinet_items;
create policy "cabinet_items_read" on public.cabinet_items for select to authenticated
  using (clinic is null or clinic = public.current_clinic());
create policy "cabinet_items_write" on public.cabinet_items for all to authenticated
  using (clinic is null or clinic = public.current_clinic())
  with check (clinic is null or clinic = public.current_clinic());
