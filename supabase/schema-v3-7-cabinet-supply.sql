-- V3-7 (2026-09-28): 약장 품목 구분에 '용품'(supply) 추가 — 핫팩·한방파스처럼 약도 외용제도 아닌 것.
-- 사용자: 핫팩을 다 쓴 줄 알았다가 오래된 것 몇십 개를 버린 적이 있어 유통기한을 미리 보려 함.
alter table public.cabinet_items drop constraint if exists cabinet_items_kind_check;
alter table public.cabinet_items add constraint cabinet_items_kind_check check (kind in ('medicine','topical','supply'));
insert into public.cabinet_items (name, kind, sort_order)
select '핫팩', 'supply', 21 where not exists (select 1 from public.cabinet_items where name = '핫팩');
select id, name, kind, sort_order from public.cabinet_items order by sort_order;
