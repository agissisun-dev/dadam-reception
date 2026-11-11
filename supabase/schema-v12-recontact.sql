-- V12 (2026-11-11): 다시 연락 — 한약 드신 분께 경과를 묻고, 답 온 분부터 예약·재주문으로 잇는 일을 앱에서.
-- 설계: docs/superpowers/specs/2026-11-11-다시연락-v12-design.md
-- 화면은 해피콜 메뉴 안의 [다시 연락] 탭. 사용자가 직접 Supabase SQL Editor에서 실행한다.
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
  draft_text text,                                                       -- 샘이 고친 문구(없으면 틀에서 채움)
  variant text not null default 'A' check (variant in ('A','B')),        -- 문구 A·B 비교용
  -- 진행
  status text not null default 'todo' check (status in ('todo','sent','replied','booked','declined','rest')),
  sent_at timestamptz, sent_by text, sent_text text,
  reply_text text, replied_at timestamptz,
  doctor_reply text,                                                     -- 답을 본 원장님 말씀(두 번째 문자에 들어감)
  called_at timestamptz, call_result text,
  attempts integer not null default 0,
  memo text,
  staff_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recontacts_status_idx on public.recontacts (clinic, status);
create index if not exists recontacts_patient_idx on public.recontacts (patient_id);

create table if not exists public.recontact_settings (
  clinic text primary key default public.current_clinic() check (clinic in ('S','N')),
  daily_cap integer not null default 25 check (daily_cap between 1 and 100),   -- 하루에 보내는 수
  body_a text not null default '{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드시고 어떠신지 원장님이 궁금해하셔서 연락드려요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.',
  body_b text not null default '{이름}님, 노원다담한의원입니다. {원장한줄} {월}에 드신 {약} 이후로 어떠신지 여쭤보려고요. 편하실 때 답 주세요.',
  body_reply text not null default '답 주셔서 고맙습니다, {이름}님. 원장님께 전해 드렸더니 {원장답} 내원해서 보시는 게 편하세요, 전화 상담 뒤 받으시는 게 편하세요? 편하신 쪽 말씀 주시면 바로 잡아 드릴게요.',
  body_missed text not null default '{이름}님, 노원다담한의원입니다. 조금 전 전화 드렸는데 통화가 안 되어 문자 남겨요. 지난번 약 드시고 어떠신지 여쭤보려던 거였어요. 편하실 때 전화나 답 주세요.'
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
