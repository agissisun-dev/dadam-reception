-- V7 (2026-10-02): 예약차트 — 시간표(30분 칸: 초진·상담 1 + 침 3), 오늘 올 사람, 다음 예약, 네이버 N.
-- 설계: docs/superpowers/specs/2026-10-02-예약차트-v7-design.md
-- 새 표만 만든다(기존 표는 건드리지 않음). 모두 병원별(clinic = current_clinic()).

create table if not exists public.appointments (
  id bigint generated always as identity primary key,
  clinic text not null default public.current_clinic() check (clinic in ('S','N')),
  day date not null,
  time text not null,                                   -- 'HH:MM'
  kind text not null check (kind in ('consult','treatment')),
  patient_id bigint references public.patients(id) on delete set null,
  patient_name text not null,
  phone text,
  source text not null default 'desk' check (source in ('desk','naver','happycall','ledger')),
  status text not null default 'booked' check (status in ('booked','arrived','noshow','cancelled')),
  memo text,
  naver_key text,
  happy_call_id bigint references public.happy_calls(id) on delete set null,
  ledger_entry_id bigint references public.ledger_entries(id) on delete set null,
  notified_at timestamptz, notify_note text,
  staff_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointments_day_idx on public.appointments (clinic, day);
create unique index if not exists appointments_naver_key_idx on public.appointments (clinic, naver_key) where naver_key is not null;

-- 그날만 진료를 열거나 닫기 (토요일이 공휴일이면 금요일 진료 같은 경우)
create table if not exists public.clinic_day_overrides (
  clinic text not null default public.current_clinic() check (clinic in ('S','N')),
  day date not null,
  open boolean not null,
  start_time text, end_time text, lunch_start text, lunch_end text,
  memo text,
  primary key (clinic, day)
);

-- 병원별 예약 설정: 칸 간격, 예약 안내 문구
create table if not exists public.appointment_settings (
  clinic text primary key default public.current_clinic() check (clinic in ('S','N')),
  slot_minutes integer not null default 30,
  consult_per_slot integer not null default 1,
  treatment_per_slot integer not null default 3,
  notify_body text not null default '{이름}님, {병원} 예약 안내드립니다. {날짜} {시간}에 뵙겠습니다. 변경이 필요하시면 전화 주세요.'
);

alter table public.appointments enable row level security;
alter table public.clinic_day_overrides enable row level security;
alter table public.appointment_settings enable row level security;
drop policy if exists "clinic_all" on public.appointments;
create policy "clinic_all" on public.appointments for all to authenticated using (clinic = public.current_clinic()) with check (clinic = public.current_clinic());
drop policy if exists "clinic_all" on public.clinic_day_overrides;
create policy "clinic_all" on public.clinic_day_overrides for all to authenticated using (clinic = public.current_clinic()) with check (clinic = public.current_clinic());
drop policy if exists "clinic_all" on public.appointment_settings;
create policy "clinic_all" on public.appointment_settings for all to authenticated using (clinic = public.current_clinic()) with check (clinic = public.current_clinic());

insert into public.appointment_settings (clinic) values ('S') on conflict (clinic) do nothing;
