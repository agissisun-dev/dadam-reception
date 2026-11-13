-- V14 (2026-11-13): 물품 신청함 — 샘들이 한 줄씩 적어 신청하면 원장이 가격을 보고 사고, 받으면 샘들이 [받음].
-- supply_requests: 신청 한 줄. 두 병원 공통(원장이 한 목록으로 봄). clinic 칸은 누가 신청했는지 표시용.
-- supply_settings: 원장 잠금 번호(4자리, 단가·업체 칸을 여는 용도. 보안이 아니라 "샘들이 다 볼 필요 없는 칸"을 가리는 용도).
-- 새 표만 만든다. 기존 표는 건드리지 않는다.

create table if not exists public.supply_requests (
  id bigint generated always as identity primary key,
  clinic text not null default coalesce(public.current_clinic(), 'S') check (clinic in ('S','N')),
  text text not null,                      -- 샘이 적은 그대로 ("알콜솜 2통")
  category text not null check (category in ('yakchim','treatment','office')),  -- 약침 · 치료실 용품 · 병원 용품 (앱이 자동 분류, 고칠 수 있음)
  status text not null default 'requested' check (status in ('requested','approved','ordered','received','cancelled')),
  requested_by text not null,
  requested_at timestamptz not null default now(),
  -- 원장 칸 (잠금 번호로 열어야 보임). 아사이드가 API로 채운다.
  price integer,                           -- 원. 단가×수량 = 이 줄 총액
  vendor text,                             -- 업체 (예: 제일한방, 쿠팡)
  price_note text,                         -- 아사이드가 남긴 메모 (최저가 비교 등)
  product_url text,                        -- 상품 페이지
  priced_at timestamptz,
  approved_at timestamptz,                 -- 원장 [승인]
  ordered_at timestamptz,                  -- 원장 [구매 완료]
  received_at timestamptz,                 -- 샘 [받음]
  received_by text,
  cancelled_at timestamptz,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists supply_requests_status_idx on public.supply_requests (status, requested_at desc);

create table if not exists public.supply_settings (
  id integer primary key default 1 check (id = 1),
  owner_pin text,                          -- 4자리 숫자. 비어 있으면 잠금 없이 모두 보임
  updated_at timestamptz not null default now()
);
insert into public.supply_settings (id) values (1) on conflict (id) do nothing;

alter table public.supply_requests enable row level security;
alter table public.supply_settings enable row level security;
drop policy if exists "auth_all" on public.supply_requests;
create policy "auth_all" on public.supply_requests for all to authenticated using (true) with check (true);
drop policy if exists "auth_all" on public.supply_settings;
create policy "auth_all" on public.supply_settings for all to authenticated using (true) with check (true);
