-- V3-8 (2026-09-29): 접수실 요청으로 약장 품목 정리.
--   카밍젤 → 카밍젤 150ml (기록 유지), 카밍젤 500ml·아젤라산·커버밤 추가 (모두 외용제).
update public.cabinet_items set name = '카밍젤 150ml' where name = '카밍젤';
insert into public.cabinet_items (name, kind, sort_order)
select v.name, 'topical', v.o from (values ('카밍젤 500ml', 16), ('아젤라산', 17), ('커버밤', 18)) as v(name, o)
where not exists (select 1 from public.cabinet_items c where c.name = v.name);
select id, name, kind, sort_order, active from public.cabinet_items order by sort_order;
