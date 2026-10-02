-- V5 (2026-10-02): 약대장 — 탕전 일정. 접수실이 달이는 날을 잡고 탕전실이 그대로 달인다.
-- 설계: docs/superpowers/specs/2026-10-02-약대장-v5-design.md
-- brew_jobs: 약대장 한 칸. brew_weekday_rules: 요일별 기준 메모·한도.

create table if not exists public.brew_jobs (
  id bigint generated always as identity primary key,
  day date,                                   -- 달이는 날. null = 날짜 미정
  slot text not null default 'am' check (slot in ('am','pm')),
  kind text not null check (kind in ('decoction','ferment_start','ferment_end','batch','note')),
  patient_id bigint references public.patients(id) on delete set null,
  patient_name text not null default '',
  title text not null,                        -- 보험(처방) · 일반 42만원 · 발효 · 디스크 100팩 · 택배 마감 …
  delivery text check (delivery in ('pickup','courier')),
  region text,                                -- 택배 지역 / 직접이면 "화 오전" 같은 메모
  pouch text,                                 -- 파우치 종류 (다담·애장금·자연과사람·공룡)
  split_no integer, split_of integer,         -- 분할 회차 (#1 of 2)
  memo text,
  max_jobs integer,                           -- note 전용: 그날 한도 바꾸기 (월차 → 0)
  status text not null default 'planned' check (status in ('planned','done')),
  done_at timestamptz, done_by text,
  receive_day date,                           -- 받는 날 (해피콜 기준). 기본 = day
  prescription_id bigint references public.prescriptions(id) on delete set null,
  ledger_entry_id bigint references public.ledger_entries(id) on delete set null,
  pair_id bigint references public.brew_jobs(id) on delete set null,   -- 발효 짝
  sort_order integer not null default 0,
  staff_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brew_jobs_day_idx on public.brew_jobs (day);
create index if not exists brew_jobs_entry_idx on public.brew_jobs (ledger_entry_id);

create table if not exists public.brew_weekday_rules (
  weekday integer primary key check (weekday between 1 and 6),   -- 1 월 … 6 토
  note text not null default '',
  max_jobs integer not null default 4
);

alter table public.prescriptions add column if not exists brew_day date;
alter table public.prescriptions add column if not exists delivery text;

alter table public.brew_jobs enable row level security;
alter table public.brew_weekday_rules enable row level security;
drop policy if exists "auth_all" on public.brew_jobs;
create policy "auth_all" on public.brew_jobs for all to authenticated using (true) with check (true);
drop policy if exists "auth_all" on public.brew_weekday_rules;
create policy "auth_all" on public.brew_weekday_rules for all to authenticated using (true) with check (true);

-- 요일별 기준 초기값 (26년약대장 엑셀의 되풀이 메모)
insert into public.brew_weekday_rules (weekday, note, max_jobs)
select * from (values
  (1, '지방택배 마감', 4),
  (2, '서울택배 마감', 4),
  (3, '', 4),
  (4, '지방택배 마감', 4),
  (5, '서울택배 마감', 4),
  (6, '노원구만 2개 이상 · 직접만', 2)
) as v(weekday, note, max_jobs)
where not exists (select 1 from public.brew_weekday_rules);
