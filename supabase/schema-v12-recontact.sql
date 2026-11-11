-- V12 (2026-11-11): 다시 연락 — 한약 드신 분께 경과를 묻고, 답 온 분부터 예약·재주문으로 잇는 일을 앱에서.
-- 설계: docs/superpowers/specs/2026-11-11-다시연락-v12-design.md
-- 아직 실행 전 초안이다. 흐름을 사용자가 확인한 뒤, 사용자가 직접 Supabase SQL Editor에서 실행한다.
-- 새 표 두 개만 만든다(기존 표는 건드리지 않음). 모두 병원별(clinic = current_clinic()).

create table if not exists public.recontacts (
  id bigint generated always as identity primary key,
  clinic text not null default public.current_clinic() check (clinic in ('S','N')),
  -- 누구
  patient_id bigint references public.patients(id) on delete set null,   -- 연락처를 연결하기 전에는 null
  patient_name text not null,
  birth_hint text,                                                       -- 동명이인 확인용 메모(생년 등)
  -- 왜 이 사람인지
  segment text not null check (segment in ('due_now','due_soon','vip','once_p1','once_p2','lapsed','tonic')),
  call_target boolean not null default false,                            -- 답이 없으면 전화까지 할 묶음인지
  herb_count integer,
  last_herb_date date,
  avg_interval_days integer,
  herb_kind text,
  -- 준비
  doctor_note text,                                                      -- 원장님 칸: 무엇을 물을지 한 줄
  draft_text text,
  variant text check (variant in ('A','B')),
  planned_date date,                                                     -- 오늘 할 일에 뜨는 날
  -- 진행
  status text not null default 'todo' check (status in ('todo','ready','sent','replied','booked','declined','rest')),
  sent_at timestamptz, sent_by text, sent_how text check (sent_how in ('sms','phone')),
  reply_text text, replied_at timestamptz,
  doctor_reply text,                                                     -- 답을 본 원장님 말씀(두 번째 문자에 들어감)
  called_at timestamptz, call_result text,
  attempts integer not null default 0,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recontacts_status_idx on public.recontacts (clinic, status, planned_date);
create index if not exists recontacts_patient_idx on public.recontacts (patient_id);

create table if not exists public.recontact_settings (
  clinic text primary key default public.current_clinic() check (clinic in ('S','N')),
  daily_cap integer not null default 25 check (daily_cap between 1 and 100),   -- 하루에 보내는 수
  enabled boolean not null default true
);

alter table public.recontacts enable row level security;
alter table public.recontact_settings enable row level security;
drop policy if exists "clinic_all" on public.recontacts;
create policy "clinic_all" on public.recontacts for all to authenticated
  using (clinic = public.current_clinic()) with check (clinic = public.current_clinic());
drop policy if exists "clinic_all" on public.recontact_settings;
create policy "clinic_all" on public.recontact_settings for all to authenticated
  using (clinic = public.current_clinic()) with check (clinic = public.current_clinic());

insert into public.recontact_settings (clinic) values ('S') on conflict (clinic) do nothing;
insert into public.recontact_settings (clinic) values ('N') on conflict (clinic) do nothing;
