-- V4-1 (2026-10-02): 장부 줄에 "합계에서 빼기" 표시.
-- 제로페이·서울페이·계좌입금처럼 접수실에 돈은 없지만 현금영수증은 끊는 줄은 붉게 표시하고 그날 합계에서 뺀다.
-- (사용자 요청: 엑셀에서 붉은 글씨로 적던 것)

alter table public.ledger_entries add column if not exists off_total boolean not null default false;
alter table public.ledger_entries add column if not exists pay_note text;  -- 제로페이 · 서울페이 · 계좌입금 · 기타
