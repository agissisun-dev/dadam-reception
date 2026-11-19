-- V18 (2026-11-19, 사용자 결정)
-- 1) 가족이 연락처 하나를 나눠 쓴다: 환자 구분을 (병원, 연락처)에서 (병원, 연락처, 이름)으로.
--    아이를 엄마 번호로 등록할 수 있다. 같은 번호·같은 이름은 여전히 한 명.
alter table public.patients drop constraint if exists patients_clinic_phone_key;
alter table public.patients drop constraint if exists patients_phone_key;
alter table public.patients drop constraint if exists patients_clinic_phone_name_key;
alter table public.patients add constraint patients_clinic_phone_name_key unique (clinic, phone, name);

-- 2) 환불 줄: 돌려준 날 장부에 kind='refund'로 마이너스 금액. corrects_id = 원래 줄. 반품 재고는 입고로 되돌린다.
alter table public.ledger_entries drop constraint if exists ledger_entries_kind_check;
alter table public.ledger_entries add constraint ledger_entries_kind_check check (kind in ('normal','correction','refund'));
