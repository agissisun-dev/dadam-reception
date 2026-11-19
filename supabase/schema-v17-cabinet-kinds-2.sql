-- V17 (2026-11-19): 재고현황 칸 손질 (사용자 2026-11-19)
--   · 칸 추가: 치료실 용품(treatment, 병원별) · 탕전실 용품(brewroom, 공통)
--   · 이름 변경(코드는 그대로): medicine = 다담공용 탕약·환약, supply = 공동용품(물티슈·핸드타올·습자지)
--   · 약침(yakchim)의 날짜 칸은 유통기한이 아니라 조제일자로 쓴다 (칸은 그대로 expiry, 화면 글만 바뀜)
--   · 품목 삭제: 기록(cabinet_moves)이 없는 품목만 지울 수 있다 (FK가 막음). 기록 있으면 [사용 안 함].
alter table public.cabinet_items drop constraint if exists cabinet_items_kind_check;
alter table public.cabinet_items add constraint cabinet_items_kind_check
  check (kind in ('medicine','topical','supply','insured','yakchim','treatment','brewroom'));
-- 병원별 칸: 보험약 · 치료실 용품
alter table public.cabinet_items drop constraint if exists cabinet_items_insured_clinic_check;
alter table public.cabinet_items add constraint cabinet_items_insured_clinic_check
  check (kind not in ('insured','treatment') or clinic is not null);
