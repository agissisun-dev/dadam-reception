-- V16 (2026-11-16): 장부 줄의 붉은 금액을 칸(현금·현영·카드)마다 따로 표시.
-- 사용자: "붉은색을 선택하면 다 붉어져서 그 칸만 붉게, 검게 선택할 수 있으면" — 서울페이·계좌입금(현금 칸만 붉게)과 카드결제를 구분.
-- red_fields = 붉게 표시한 칸 이름 배열. 비어 있으면 붉은 칸 없음. off_total은 "붉은 칸이 하나라도 있음"으로 같이 유지(현황·옛 줄 호환).
alter table public.ledger_entries add column if not exists red_fields text[] not null default '{}';
-- 옛 줄: 줄 전체가 붉었던 것은 세 칸 모두 붉게 옮긴다(금액이 있는 칸만).
update public.ledger_entries set red_fields = array_remove(array[
  case when cash <> 0 then 'cash' end,
  case when cash_receipt <> 0 then 'cash_receipt' end,
  case when card <> 0 then 'card' end
], null)
where off_total and red_fields = '{}';
