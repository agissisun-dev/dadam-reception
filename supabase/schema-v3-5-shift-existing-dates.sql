-- 이미 잡혀 있던 예정일 중 휴진일에 걸린 것을 가까운 진료일로 (2026-09-22 실행)
-- 2026-09-24 추석 연휴 → 연락 2026-09-23 / 업무 2026-09-23
update public.happy_calls set due_date = '2026-09-23', auto_due_date = '2026-09-23' where status = 'pending' and due_date = '2026-09-24';
update public.patients set weekly_next_date = '2026-09-23' where weekly_status = 'active' and weekly_next_date = '2026-09-24';
update public.tasks set due_date = '2026-09-23' where status = 'todo' and due_date = '2026-09-24';
-- 2026-09-25 추석 → 연락 2026-09-23 / 업무 2026-09-23
update public.happy_calls set due_date = '2026-09-23', auto_due_date = '2026-09-23' where status = 'pending' and due_date = '2026-09-25';
update public.patients set weekly_next_date = '2026-09-23' where weekly_status = 'active' and weekly_next_date = '2026-09-25';
update public.tasks set due_date = '2026-09-23' where status = 'todo' and due_date = '2026-09-25';
-- 2026-09-26 추석 연휴 → 연락 2026-09-23 / 업무 2026-09-23
update public.happy_calls set due_date = '2026-09-23', auto_due_date = '2026-09-23' where status = 'pending' and due_date = '2026-09-26';
update public.patients set weekly_next_date = '2026-09-23' where weekly_status = 'active' and weekly_next_date = '2026-09-26';
update public.tasks set due_date = '2026-09-23' where status = 'todo' and due_date = '2026-09-26';
-- 2026-09-27 일요일 → 연락 2026-09-23 / 업무 2026-09-23
update public.happy_calls set due_date = '2026-09-23', auto_due_date = '2026-09-23' where status = 'pending' and due_date = '2026-09-27';
update public.patients set weekly_next_date = '2026-09-23' where weekly_status = 'active' and weekly_next_date = '2026-09-27';
update public.tasks set due_date = '2026-09-23' where status = 'todo' and due_date = '2026-09-27';
-- 2026-10-03 개천절 → 연락 2026-10-02 / 업무 2026-10-02
update public.happy_calls set due_date = '2026-10-02', auto_due_date = '2026-10-02' where status = 'pending' and due_date = '2026-10-03';
update public.patients set weekly_next_date = '2026-10-02' where weekly_status = 'active' and weekly_next_date = '2026-10-03';
update public.tasks set due_date = '2026-10-02' where status = 'todo' and due_date = '2026-10-03';
-- 2026-10-04 일요일 → 연락 2026-10-02 / 업무 2026-10-02
update public.happy_calls set due_date = '2026-10-02', auto_due_date = '2026-10-02' where status = 'pending' and due_date = '2026-10-04';
update public.patients set weekly_next_date = '2026-10-02' where weekly_status = 'active' and weekly_next_date = '2026-10-04';
update public.tasks set due_date = '2026-10-02' where status = 'todo' and due_date = '2026-10-04';
-- 2026-10-09 한글날 → 연락 2026-10-08 / 업무 2026-10-08
update public.happy_calls set due_date = '2026-10-08', auto_due_date = '2026-10-08' where status = 'pending' and due_date = '2026-10-09';
update public.patients set weekly_next_date = '2026-10-08' where weekly_status = 'active' and weekly_next_date = '2026-10-09';
update public.tasks set due_date = '2026-10-08' where status = 'todo' and due_date = '2026-10-09';
-- 2026-10-11 일요일 → 연락 2026-10-10 / 업무 2026-10-10
update public.happy_calls set due_date = '2026-10-10', auto_due_date = '2026-10-10' where status = 'pending' and due_date = '2026-10-11';
update public.patients set weekly_next_date = '2026-10-10' where weekly_status = 'active' and weekly_next_date = '2026-10-11';
update public.tasks set due_date = '2026-10-10' where status = 'todo' and due_date = '2026-10-11';
-- 2026-10-18 일요일 → 연락 2026-10-17 / 업무 2026-10-17
update public.happy_calls set due_date = '2026-10-17', auto_due_date = '2026-10-17' where status = 'pending' and due_date = '2026-10-18';
update public.patients set weekly_next_date = '2026-10-17' where weekly_status = 'active' and weekly_next_date = '2026-10-18';
update public.tasks set due_date = '2026-10-17' where status = 'todo' and due_date = '2026-10-18';
-- 2026-10-25 일요일 → 연락 2026-10-24 / 업무 2026-10-24
update public.happy_calls set due_date = '2026-10-24', auto_due_date = '2026-10-24' where status = 'pending' and due_date = '2026-10-25';
update public.patients set weekly_next_date = '2026-10-24' where weekly_status = 'active' and weekly_next_date = '2026-10-25';
update public.tasks set due_date = '2026-10-24' where status = 'todo' and due_date = '2026-10-25';
-- 2026-11-01 일요일 → 연락 2026-10-31 / 업무 2026-10-31
update public.happy_calls set due_date = '2026-10-31', auto_due_date = '2026-10-31' where status = 'pending' and due_date = '2026-11-01';
update public.patients set weekly_next_date = '2026-10-31' where weekly_status = 'active' and weekly_next_date = '2026-11-01';
update public.tasks set due_date = '2026-10-31' where status = 'todo' and due_date = '2026-11-01';
-- 2026-11-08 일요일 → 연락 2026-11-07 / 업무 2026-11-07
update public.happy_calls set due_date = '2026-11-07', auto_due_date = '2026-11-07' where status = 'pending' and due_date = '2026-11-08';
update public.patients set weekly_next_date = '2026-11-07' where weekly_status = 'active' and weekly_next_date = '2026-11-08';
update public.tasks set due_date = '2026-11-07' where status = 'todo' and due_date = '2026-11-08';
-- 2026-11-15 일요일 → 연락 2026-11-14 / 업무 2026-11-14
update public.happy_calls set due_date = '2026-11-14', auto_due_date = '2026-11-14' where status = 'pending' and due_date = '2026-11-15';
update public.patients set weekly_next_date = '2026-11-14' where weekly_status = 'active' and weekly_next_date = '2026-11-15';
update public.tasks set due_date = '2026-11-14' where status = 'todo' and due_date = '2026-11-15';
-- 2026-11-22 일요일 → 연락 2026-11-21 / 업무 2026-11-21
update public.happy_calls set due_date = '2026-11-21', auto_due_date = '2026-11-21' where status = 'pending' and due_date = '2026-11-22';
update public.patients set weekly_next_date = '2026-11-21' where weekly_status = 'active' and weekly_next_date = '2026-11-22';
update public.tasks set due_date = '2026-11-21' where status = 'todo' and due_date = '2026-11-22';
-- 2026-11-29 일요일 → 연락 2026-11-28 / 업무 2026-11-28
update public.happy_calls set due_date = '2026-11-28', auto_due_date = '2026-11-28' where status = 'pending' and due_date = '2026-11-29';
update public.patients set weekly_next_date = '2026-11-28' where weekly_status = 'active' and weekly_next_date = '2026-11-29';
update public.tasks set due_date = '2026-11-28' where status = 'todo' and due_date = '2026-11-29';
-- 2026-12-06 일요일 → 연락 2026-12-05 / 업무 2026-12-05
update public.happy_calls set due_date = '2026-12-05', auto_due_date = '2026-12-05' where status = 'pending' and due_date = '2026-12-06';
update public.patients set weekly_next_date = '2026-12-05' where weekly_status = 'active' and weekly_next_date = '2026-12-06';
update public.tasks set due_date = '2026-12-05' where status = 'todo' and due_date = '2026-12-06';
-- 2026-12-13 일요일 → 연락 2026-12-12 / 업무 2026-12-12
update public.happy_calls set due_date = '2026-12-12', auto_due_date = '2026-12-12' where status = 'pending' and due_date = '2026-12-13';
update public.patients set weekly_next_date = '2026-12-12' where weekly_status = 'active' and weekly_next_date = '2026-12-13';
update public.tasks set due_date = '2026-12-12' where status = 'todo' and due_date = '2026-12-13';
-- 2026-12-20 일요일 → 연락 2026-12-19 / 업무 2026-12-19
update public.happy_calls set due_date = '2026-12-19', auto_due_date = '2026-12-19' where status = 'pending' and due_date = '2026-12-20';
update public.patients set weekly_next_date = '2026-12-19' where weekly_status = 'active' and weekly_next_date = '2026-12-20';
update public.tasks set due_date = '2026-12-19' where status = 'todo' and due_date = '2026-12-20';
-- 2026-12-25 성탄절 → 연락 2026-12-24 / 업무 2026-12-24
update public.happy_calls set due_date = '2026-12-24', auto_due_date = '2026-12-24' where status = 'pending' and due_date = '2026-12-25';
update public.patients set weekly_next_date = '2026-12-24' where weekly_status = 'active' and weekly_next_date = '2026-12-25';
update public.tasks set due_date = '2026-12-24' where status = 'todo' and due_date = '2026-12-25';
-- 2026-12-27 일요일 → 연락 2026-12-26 / 업무 2026-12-26
update public.happy_calls set due_date = '2026-12-26', auto_due_date = '2026-12-26' where status = 'pending' and due_date = '2026-12-27';
update public.patients set weekly_next_date = '2026-12-26' where weekly_status = 'active' and weekly_next_date = '2026-12-27';
update public.tasks set due_date = '2026-12-26' where status = 'todo' and due_date = '2026-12-27';
select 'happy_calls' as t, count(*) from public.happy_calls where status='pending' and due_date between '2026-09-22' and '2026-12-31' union all select 'patients', count(*) from public.patients where weekly_status='active' union all select 'tasks', count(*) from public.tasks where status='todo';
