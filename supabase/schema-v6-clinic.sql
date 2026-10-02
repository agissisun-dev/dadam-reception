-- V6 (2026-10-02): 병원 칸 — 한 앱·한 데이터에 다담에스(S)·노원다담한의원(N) 두 병원.
-- 로그인 계정마다 병원을 붙이고(clinic_accounts), 병원별 표는 RLS가 자기 병원 것만 보여 준다.
-- 공통(두 병원이 같이 보는) 표: brew_jobs(약대장, 병원은 색으로만), brew_weekday_rules, cabinet_items, cabinet_moves.
-- 설계 배경: 약대장·약장·(앞으로) 약재 재고는 합쳐서 집계, 오늘 장부·해피콜·예약은 병원마다 따로.

-- 1) 계정 → 병원
create table if not exists public.clinic_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  clinic text not null check (clinic in ('S','N')),
  created_at timestamptz not null default now()
);
alter table public.clinic_accounts enable row level security;
drop policy if exists "auth_read_own" on public.clinic_accounts;
create policy "auth_read_own" on public.clinic_accounts for select to authenticated using (user_id = auth.uid());

-- 지금 쓰는 공용 계정은 다담에스
insert into public.clinic_accounts (user_id, clinic)
select id, 'S' from auth.users where email = 'dadamn1@naver.com'
on conflict (user_id) do nothing;

-- 로그인한 계정의 병원. 매핑이 없으면 'S'(다담에스).
create or replace function public.current_clinic() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select clinic from public.clinic_accounts where user_id = auth.uid()), 'S');
$$;
grant execute on function public.current_clinic() to authenticated;

-- 2) 병원별 표에 clinic 칸 (기본값 = 로그인한 병원, 기존 줄은 모두 S)
do $$
declare t text;
begin
  foreach t in array array['patients','prescriptions','happy_calls','contact_logs','weekly_contacts','tasks','templates',
                           'ledger_codes','ledger_days','ledger_entries','ledger_expenses','sms_logs','brew_jobs']
  loop
    execute format('alter table public.%I add column if not exists clinic text not null default ''S'' check (clinic in (''S'',''N''))', t);
    execute format('alter table public.%I alter column clinic set default public.current_clinic()', t);
    execute format('create index if not exists %I on public.%I (clinic)', t || '_clinic_idx', t);
  end loop;
end $$;

-- 하루 마감은 병원마다: 기본키를 (clinic, day)로
alter table public.ledger_days drop constraint if exists ledger_days_pkey;
alter table public.ledger_days add primary key (clinic, day);
-- 장부 번호도 병원마다
alter table public.ledger_entries drop constraint if exists ledger_entries_day_seq_key;
alter table public.ledger_entries add constraint ledger_entries_clinic_day_seq_key unique (clinic, day, seq);
-- 약어 표도 병원마다 (노원은 시작할 때 S 것을 복사)
drop index if exists public.ledger_codes_code_idx;
create unique index if not exists ledger_codes_clinic_code_idx on public.ledger_codes (clinic, lower(code));

-- 마감 잠금도 병원 기준
create or replace function public.ledger_day_locked(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ledger_days where day = d and clinic = public.current_clinic() and closed_at is not null)
     and d < (now() at time zone 'Asia/Seoul')::date;
$$;

-- 3) 정책 다시: 병원별 표는 자기 병원 것만
do $$
declare t text; p record;
begin
  foreach t in array array['patients','prescriptions','happy_calls','contact_logs','weekly_contacts','tasks','templates','ledger_codes']
  loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy "clinic_all" on public.%I for all to authenticated using (clinic = public.current_clinic()) with check (clinic = public.current_clinic())', t);
  end loop;
end $$;

-- 문자 장부: 읽기·넣기만, 자기 병원
drop policy if exists "auth_read" on public.sms_logs;
drop policy if exists "auth_insert" on public.sms_logs;
create policy "clinic_read" on public.sms_logs for select to authenticated using (clinic = public.current_clinic());
create policy "clinic_insert" on public.sms_logs for insert to authenticated with check (clinic = public.current_clinic());

-- 장부: 자기 병원 + 마감 잠금
drop policy if exists "auth_read" on public.ledger_days;
drop policy if exists "auth_insert" on public.ledger_days;
drop policy if exists "auth_close" on public.ledger_days;
create policy "clinic_read" on public.ledger_days for select to authenticated using (clinic = public.current_clinic());
create policy "clinic_insert" on public.ledger_days for insert to authenticated with check (clinic = public.current_clinic());
create policy "clinic_close" on public.ledger_days for update to authenticated using (clinic = public.current_clinic() and closed_at is null) with check (clinic = public.current_clinic());

drop policy if exists "auth_read" on public.ledger_entries;
drop policy if exists "auth_insert" on public.ledger_entries;
drop policy if exists "auth_update" on public.ledger_entries;
drop policy if exists "auth_delete" on public.ledger_entries;
create policy "clinic_read" on public.ledger_entries for select to authenticated using (clinic = public.current_clinic());
create policy "clinic_insert" on public.ledger_entries for insert to authenticated
  with check (clinic = public.current_clinic() and (kind = 'correction' or not public.ledger_day_locked(day)));
create policy "clinic_update" on public.ledger_entries for update to authenticated
  using (clinic = public.current_clinic() and not public.ledger_day_locked(day)) with check (clinic = public.current_clinic() and not public.ledger_day_locked(day));
create policy "clinic_delete" on public.ledger_entries for delete to authenticated
  using (clinic = public.current_clinic() and not public.ledger_day_locked(day));

drop policy if exists "auth_read" on public.ledger_items;
drop policy if exists "auth_write" on public.ledger_items;
create policy "clinic_read" on public.ledger_items for select to authenticated
  using (exists (select 1 from public.ledger_entries e where e.id = entry_id and e.clinic = public.current_clinic()));
create policy "clinic_write" on public.ledger_items for all to authenticated
  using (exists (select 1 from public.ledger_entries e where e.id = entry_id and e.clinic = public.current_clinic() and not public.ledger_day_locked(e.day)))
  with check (exists (select 1 from public.ledger_entries e where e.id = entry_id and e.clinic = public.current_clinic() and (e.kind = 'correction' or not public.ledger_day_locked(e.day))));

drop policy if exists "auth_read" on public.ledger_expenses;
drop policy if exists "auth_write" on public.ledger_expenses;
create policy "clinic_read" on public.ledger_expenses for select to authenticated using (clinic = public.current_clinic());
create policy "clinic_write" on public.ledger_expenses for all to authenticated
  using (clinic = public.current_clinic() and not public.ledger_day_locked(day)) with check (clinic = public.current_clinic() and not public.ledger_day_locked(day));

-- 4) 약대장은 두 병원이 같이 본다 (정책 그대로 auth_all). clinic 칸은 색 구분용.
-- cabinet_items·cabinet_moves·brew_weekday_rules도 공통 — 그대로.
