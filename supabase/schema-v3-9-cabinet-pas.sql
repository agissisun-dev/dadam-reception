-- V3-9 (2026-09-29): 리뷰 증정에 한방파스(일반 환자 1장)를 쓰므로 약장 용품에 한방파스 추가.
insert into public.cabinet_items (name, kind, sort_order)
select '한방파스', 'supply', 22 where not exists (select 1 from public.cabinet_items where name = '한방파스');
select id, name, kind, sort_order from public.cabinet_items order by sort_order;
