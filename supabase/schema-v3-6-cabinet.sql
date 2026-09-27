-- V3-6 (2026-09-28): 약장 — 공진단·경옥환·외용제 같은 원내 약품의 입출고·실사·유통기한.
-- cabinet_items: 품목 (접수실이 고칠 수 있음)
-- cabinet_moves: 장부. 넣기만 가능, 앱에서 수정·삭제 불가.

create table if not exists public.cabinet_items (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null check (kind in ('medicine','topical')),
  min_stock integer not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cabinet_moves (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.cabinet_items(id),
  kind text not null check (kind in ('in','out','count','discard')),
  qty integer not null check (qty >= 0),
  expiry date,                      -- in 전용: 이 묶음의 유통기한
  purpose text check (purpose in ('sale','review','service','other')),  -- out 전용: 판매·리뷰 증정·서비스·기타
  patient_id bigint references public.patients(id) on delete set null,
  patient_name text,                -- out 전용: 환자 이름(등록 안 된 사람도 적을 수 있게)
  staff_name text not null,
  memo text,
  diff integer,                     -- count 전용: 센 수 − 있어야 할 수
  created_at timestamptz not null default now()
);

create index if not exists cabinet_moves_item_idx on public.cabinet_moves (item_id, created_at);
create index if not exists cabinet_moves_created_idx on public.cabinet_moves (created_at desc);

alter table public.cabinet_items enable row level security;
alter table public.cabinet_moves enable row level security;
drop policy if exists "auth_all" on public.cabinet_items;
create policy "auth_all" on public.cabinet_items for all to authenticated using (true) with check (true);
drop policy if exists "auth_read" on public.cabinet_moves;
drop policy if exists "auth_insert" on public.cabinet_moves;
create policy "auth_read" on public.cabinet_moves for select to authenticated using (true);
create policy "auth_insert" on public.cabinet_moves for insert to authenticated with check (true);

insert into public.cabinet_items (name, kind, sort_order)
select * from (values
  ('대보공진단', 'medicine', 1),
  ('사향공진단', 'medicine', 2),
  ('경옥환', 'medicine', 3),
  ('소합원', 'medicine', 4),
  ('아토베리어로션', 'topical', 11),
  ('선크림', 'topical', 12),
  ('퓨어스킨', 'topical', 13),
  ('세안제', 'topical', 14),
  ('카밍젤', 'topical', 15)
) as v(name, kind, sort_order)
where not exists (select 1 from public.cabinet_items);
