-- V9 (2026-11-06): 환자가 어떻게 오셨는지(내원 경로) 기록.
--   접수실이 등록 때 한 번 고르고, 유튜브·블로그면 "어떤 영상/글이었는지" 대략 적는다 (정확하지 않아도 됨).
--   기존 환자는 비어 있고, 환자 상세 [고치기]에서 채울 수 있다. 현황에 달별 경로 수가 보인다.

alter table public.patients
  add column if not exists source text check (source in ('youtube','blog','naver','instagram','referral','signboard','other')),
  add column if not exists source_note text;
