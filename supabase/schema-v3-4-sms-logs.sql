-- V3-4 (2026-09-18): 문자 발송 장부.
-- 앱 서버(app/api/sms)가 문자 시도를 성공·실패 가리지 않고 모두 남긴다.
-- 로그인한 사람은 읽고 넣을 수만 있고, 고치거나 지울 수 없다 (장부 보호).

create table if not exists public.sms_logs (
  id bigint generated always as identity primary key,
  patient_id bigint references public.patients(id) on delete set null,
  patient_name text not null,
  recipient_label text not null,          -- '환자' 또는 '가족(관계)'
  to_phone text not null,                 -- 숫자만
  text text not null,
  sms_type text not null check (sms_type in ('SMS','LMS')),
  staff_name text not null,
  ok boolean not null,
  error text,
  message_id text,
  created_at timestamptz not null default now()
);

create index if not exists sms_logs_created_at_idx on public.sms_logs (created_at desc);

alter table public.sms_logs enable row level security;
drop policy if exists "auth_read" on public.sms_logs;
drop policy if exists "auth_insert" on public.sms_logs;
create policy "auth_read" on public.sms_logs for select to authenticated using (true);
create policy "auth_insert" on public.sms_logs for insert to authenticated with check (true);
