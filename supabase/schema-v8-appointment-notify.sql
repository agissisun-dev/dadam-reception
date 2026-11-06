-- V8 (2026-11-06): 예약 자동 안내 문자.
--   설정에서 켜면 ① 접수실이 잡은 예약은 잡히는 순간 확인 문자, ② 전날 오후 5시에 내일 예약자에게 리마인더.
--   설계: docs/superpowers/specs/2026-11-06-예약-자동안내-v8-design.md
--   기존 표에 칸만 더한다. 기본값은 모두 "꺼짐"이라 실행해도 동작은 그대로다.

alter table public.appointment_settings
  add column if not exists auto_notify boolean not null default false,
  add column if not exists remind_enabled boolean not null default false,
  add column if not exists remind_body text not null default '{이름}님, 내일 {날짜} {시간} {병원} 예약 안내드립니다. 변경이 필요하시면 전화 주세요.';

alter table public.appointments
  add column if not exists remind_sent_at timestamptz,
  add column if not exists remind_note text;
