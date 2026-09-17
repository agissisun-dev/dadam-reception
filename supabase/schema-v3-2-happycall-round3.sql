-- V3-2 (2026-09-17): 3차 해피콜.
--   2차(또는 12일 이하 처방의 단일 건)를 "연락함"으로 마쳤는데 재처방·예약이 없으면
--   앱이 연락일 +7일에 3차 해피콜을 하나 만든다. 표에는 회차 3을 허용하기만 하면 된다.
--   앱 코드는 실행 전에도 돌아가지만, 실행 전에는 "연락함" 저장이 "3차 해피콜 만들기 실패"로 막힌다.

alter table public.happy_calls drop constraint if exists happy_calls_round_check;
alter table public.happy_calls add constraint happy_calls_round_check check (round in (1, 2, 3));
