-- V4 (2026-10-02): 수납 장부 — 엑셀 일일매출장부를 앱으로.
-- 설계: docs/superpowers/specs/2026-10-02-수납장부-v4-design.md
-- ledger_codes: 약어 사전 (접수실이 고침)
-- ledger_days: 하루 마감 (마감하면 그날 줄·지출이 잠김, 되돌리기 없음)
-- ledger_entries: 환자 줄 (정정 줄은 kind='correction')
-- ledger_items: 줄 안의 항목 (탕약·약장·치료·엑스제·기타)
-- ledger_expenses: 지출

create table if not exists public.ledger_codes (
  id bigint generated always as identity primary key,
  code text not null,
  name text not null,
  "group" text not null check ("group" in ('decoction','cabinet','treatment','extract','other')),
  cabinet_item_id bigint references public.cabinet_items(id) on delete set null,
  decoction_kind text check (decoction_kind in ('insurance','general','fermented')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists ledger_codes_code_idx on public.ledger_codes (lower(code));

create table if not exists public.ledger_days (
  day date primary key,
  closed_at timestamptz,
  closed_by text,
  memo text
);

create table if not exists public.ledger_entries (
  id bigint generated always as identity primary key,
  day date not null,
  seq integer not null,
  patient_id bigint references public.patients(id) on delete set null,
  patient_name text not null,
  insurance_kind text,
  cash integer not null default 0,
  cash_receipt integer not null default 0,
  card integer not null default 0,
  note_raw text not null default '',
  memo text,
  staff_name text not null,
  kind text not null default 'normal' check (kind in ('normal','correction')),
  corrects_id bigint references public.ledger_entries(id) on delete set null,
  correction_reason text,
  packs_missing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (day, seq)
);
create index if not exists ledger_entries_day_idx on public.ledger_entries (day);
create index if not exists ledger_entries_patient_idx on public.ledger_entries (patient_id);

create table if not exists public.ledger_items (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.ledger_entries(id) on delete cascade,
  code text not null,
  name text not null,
  "group" text not null,
  qty integer not null default 1,
  amount integer,
  days integer,
  split integer,
  raw text not null,
  prescription_id bigint references public.prescriptions(id) on delete set null,
  cabinet_move_id bigint references public.cabinet_moves(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_items_entry_idx on public.ledger_items (entry_id);

create table if not exists public.ledger_expenses (
  id bigint generated always as identity primary key,
  day date not null,
  title text not null,
  amount integer not null,
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_expenses_day_idx on public.ledger_expenses (day);

alter table public.prescriptions add column if not exists ledger_entry_id bigint references public.ledger_entries(id) on delete set null;

-- 마감된 날인지 (RLS에서 씀)
create or replace function public.ledger_day_closed(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ledger_days where day = d and closed_at is not null);
$$;

alter table public.ledger_codes enable row level security;
alter table public.ledger_days enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.ledger_items enable row level security;
alter table public.ledger_expenses enable row level security;

drop policy if exists "auth_all" on public.ledger_codes;
create policy "auth_all" on public.ledger_codes for all to authenticated using (true) with check (true);

drop policy if exists "auth_read" on public.ledger_days;
drop policy if exists "auth_insert" on public.ledger_days;
drop policy if exists "auth_close" on public.ledger_days;
create policy "auth_read" on public.ledger_days for select to authenticated using (true);
create policy "auth_insert" on public.ledger_days for insert to authenticated with check (true);
create policy "auth_close" on public.ledger_days for update to authenticated using (closed_at is null) with check (true);

drop policy if exists "auth_read" on public.ledger_entries;
drop policy if exists "auth_insert" on public.ledger_entries;
drop policy if exists "auth_update" on public.ledger_entries;
drop policy if exists "auth_delete" on public.ledger_entries;
create policy "auth_read" on public.ledger_entries for select to authenticated using (true);
create policy "auth_insert" on public.ledger_entries for insert to authenticated
  with check (kind = 'correction' or not public.ledger_day_closed(day));
create policy "auth_update" on public.ledger_entries for update to authenticated
  using (not public.ledger_day_closed(day)) with check (not public.ledger_day_closed(day));
create policy "auth_delete" on public.ledger_entries for delete to authenticated
  using (not public.ledger_day_closed(day));

drop policy if exists "auth_read" on public.ledger_items;
drop policy if exists "auth_write" on public.ledger_items;
create policy "auth_read" on public.ledger_items for select to authenticated using (true);
create policy "auth_write" on public.ledger_items for all to authenticated
  using (exists (select 1 from public.ledger_entries e where e.id = entry_id and not public.ledger_day_closed(e.day)))
  with check (exists (select 1 from public.ledger_entries e where e.id = entry_id and (e.kind = 'correction' or not public.ledger_day_closed(e.day))));

drop policy if exists "auth_read" on public.ledger_expenses;
drop policy if exists "auth_write" on public.ledger_expenses;
create policy "auth_read" on public.ledger_expenses for select to authenticated using (true);
create policy "auth_write" on public.ledger_expenses for all to authenticated
  using (not public.ledger_day_closed(day)) with check (not public.ledger_day_closed(day));

-- 약어 초안 (2025년 일일장부에서 뽑음, 접수실이 앱의 약어 사전에서 고침).
-- 2026-10-02 사용자 확인: 스킨=퓨어스킨, T침=스티커침, MTS=피부 재생 치료.
insert into public.ledger_codes (code, name, "group", decoction_kind, sort_order)
select * from (values
  ('습', '습부항', 'treatment', null, 1),
  ('습부', '습부항', 'treatment', null, 2),
  ('전', '전침', 'treatment', null, 3),
  ('전침', '전침', 'treatment', null, 4),
  ('V', '약침', 'treatment', null, 5),
  ('수승화강', '수승화강', 'treatment', null, 6),
  ('수승', '수승화강', 'treatment', null, 7),
  ('mo', 'mo', 'treatment', null, 8),
  ('T침', '스티커침', 'treatment', null, 9),
  ('MTS', 'MTS(피부 재생)', 'treatment', null, 10),
  ('CS', 'CS', 'treatment', null, 11),
  ('보험(처방)', '보험 탕약', 'decoction', 'insurance', 20),
  ('일반', '일반 탕약', 'decoction', 'general', 21),
  ('발효', '발효 탕약', 'decoction', 'fermented', 22),
  ('공진단', '공진단', 'cabinet', null, 30),
  ('소합원', '소합원', 'cabinet', null, 31),
  ('소합', '소합원', 'cabinet', null, 32),
  ('경옥환', '경옥환', 'cabinet', null, 33),
  ('S거즈', 'S거즈', 'cabinet', null, 34),
  ('스킨', '퓨어스킨', 'cabinet', null, 35),
  ('오적', '오적산', 'extract', null, 40),
  ('오적산', '오적산', 'extract', null, 41),
  ('향사평위', '향사평위산', 'extract', null, 42),
  ('오패환', '오패환', 'extract', null, 43),
  ('형개연교', '형개연교탕', 'extract', null, 44),
  ('인삼패독', '인삼패독산', 'extract', null, 45),
  ('삼소음', '삼소음', 'extract', null, 46),
  ('배농산', '배농산', 'extract', null, 47),
  ('기타', '기타', 'other', null, 90),
  ('보험서류발급', '보험 서류 발급', 'other', null, 91),
  ('제로페이결제', '제로페이 결제', 'other', null, 92)
) as v(code, name, "group", decoction_kind, sort_order)
where not exists (select 1 from public.ledger_codes);

-- 약장 품목과 이름이 같으면 연결 (공진단은 대보·사향 둘이라 사전 화면에서 고른다)
update public.ledger_codes c set cabinet_item_id = i.id
from public.cabinet_items i
where c."group" = 'cabinet' and c.cabinet_item_id is null and i.name = c.name;
