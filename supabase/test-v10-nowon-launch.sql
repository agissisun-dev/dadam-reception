-- V10 (2026-11-09): 노원다담 접수실 개통 준비.
-- Existing clinic records stay separate; only brew/cabinet remain shared.
-- This file does not create login credentials or enable messaging.
begin;
set local lock_timeout = '5s';
select pg_advisory_xact_lock(hashtext('dadam-nowon-launch-v10'));
-- Build clinic-scoped uniqueness before dropping the legacy global rule.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.patients'::regclass and conname='patients_clinic_phone_key') then
    alter table public.patients add constraint patients_clinic_phone_key unique (clinic, phone);
  end if;
end $$;
alter table public.patients drop constraint if exists patients_phone_key;
-- V8 prerequisites. Both kinds of automatic SMS default to OFF.
alter table public.appointment_settings
  add column if not exists auto_notify boolean not null default false,
  add column if not exists remind_enabled boolean not null default false,
  add column if not exists remind_body text not null default '{이름}님, 내일 {날짜} {시간} {병원} 예약 안내드립니다. 변경이 필요하시면 전화 주세요.';
alter table public.appointments
  add column if not exists remind_sent_at timestamptz,
  add column if not exists remind_note text;
-- Copy only editable dictionaries, never patients, prescriptions, revenue or logs.
insert into public.ledger_codes (clinic, code, name, "group", cabinet_item_id, decoction_kind, active, sort_order)
select 'N', s.code, s.name, s."group", s.cabinet_item_id, s.decoction_kind, s.active, s.sort_order
from public.ledger_codes s
where s.clinic='S' and not exists (select 1 from public.ledger_codes n where n.clinic='N' and lower(n.code)=lower(s.code));
insert into public.templates (clinic, kind, name, title, body, date_rule, condition, round, sort_order)
select 'N', s.kind, s.name, s.title,
  replace(replace(replace(replace(replace(s.body,
    '노원 다담에스한의원','노원다담한의원'),'다담에스한의원','노원다담한의원'),'노원 다담한의원','노원다담한의원'),
    '[9월 24일(목)~9월 27일(일)]','[휴진 시작일~휴진 종료일]'),'[9월 28일(월)]','[진료 재개일]'),
  s.date_rule, s.condition, s.round, s.sort_order
from public.templates s
where s.clinic='S' and not exists (select 1 from public.templates n where n.clinic='N' and n.kind=s.kind and n.name=s.name);
insert into public.appointment_settings (clinic, slot_minutes, consult_per_slot, treatment_per_slot, notify_body, auto_notify, remind_enabled)
values ('N',30,1,3,'{이름}님, {병원} 예약 안내드립니다. {날짜} {시간}에 뵙겠습니다. 변경이 필요하시면 전화 주세요.',false,false)
on conflict (clinic) do nothing;

-- Shared brew can be read and marked done by either clinic. Schedule/detail edits
-- and deletion belong to the owning clinic, preventing unsynchronized private Rx.
create or replace function public.guard_shared_brew_job() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor text;
begin
  select clinic into actor from public.clinic_accounts where user_id=auth.uid();
  if actor is null then raise exception '병원에 연결된 계정으로 로그인해 주세요.' using errcode='42501'; end if;
  if TG_OP='DELETE' then
    if OLD.clinic<>actor then raise exception '다른 병원 약은 해당 병원 계정에서 삭제해 주세요.' using errcode='42501'; end if;
    return OLD;
  end if;
  if TG_OP='UPDATE' then
    if NEW.clinic<>OLD.clinic then raise exception '약대장의 소속 병원은 변경할 수 없습니다.' using errcode='42501'; end if;
    if OLD.clinic<>actor then
      if (to_jsonb(NEW)-array['status','done_at','done_by','updated_at']) is distinct from (to_jsonb(OLD)-array['status','done_at','done_by','updated_at']) then
        raise exception '다른 병원 약의 일정·수령일·상세 수정은 해당 병원 계정에서 해 주세요. 조회와 완료 표시는 함께 사용할 수 있습니다.' using errcode='42501';
      end if;
      return NEW;
    end if;
  end if;
  if NEW.clinic<>actor then raise exception '자기 병원 약만 등록할 수 있습니다.' using errcode='42501'; end if;
  if NEW.patient_id is not null and not exists(select 1 from public.patients where id=NEW.patient_id and clinic=NEW.clinic) then raise exception '약대장 환자 연결을 확인해 주세요.' using errcode='23514'; end if;
  if NEW.prescription_id is not null and not exists(select 1 from public.prescriptions where id=NEW.prescription_id and clinic=NEW.clinic and (NEW.patient_id is null or patient_id=NEW.patient_id)) then raise exception '약대장 처방 연결을 확인해 주세요.' using errcode='23514'; end if;
  if NEW.ledger_entry_id is not null and not exists(select 1 from public.ledger_entries where id=NEW.ledger_entry_id and clinic=NEW.clinic) then raise exception '약대장 장부 연결을 확인해 주세요.' using errcode='23514'; end if;
  if NEW.pair_id is not null and not exists(select 1 from public.brew_jobs where id=NEW.pair_id and id<>NEW.id and clinic=NEW.clinic) then raise exception '발효 짝의 병원을 확인해 주세요.' using errcode='23514'; end if;
  return NEW;
end $$;
revoke all on function public.guard_shared_brew_job() from public, anon, authenticated;
drop trigger if exists guard_shared_brew_job on public.brew_jobs;
create trigger guard_shared_brew_job before insert or update or delete on public.brew_jobs for each row execute function public.guard_shared_brew_job();

notify pgrst, 'reload schema';

-- Transaction-only integration tests. The existing account mapping is changed only
-- inside this transaction, invisible to other sessions, then rolled back.
do $$ begin assert not exists(select 1 from patients where id in (-910001,-910002) or phone='01000000000'), 'test fixture collision'; end $$;
select set_config('request.jwt.claim.sub',(select user_id::text from clinic_accounts where clinic='S' limit 1),true);
set local role authenticated;
do $$ begin
 assert public.current_clinic()='S','S identity';
 insert into public.patients(id,name,phone,condition,source) overriding system value values(-910001,'__ASIDE_TEST_S__','01000000000','general','other');
 begin
   insert into public.patients(id,name,phone,condition) overriding system value values(-910003,'__DUPLICATE__','01000000000','general');
   raise exception 'same-clinic duplicate unexpectedly accepted';
 exception when unique_violation then null;
 end;
 insert into public.prescriptions(id,patient_id,receive_date,days,packs,per_day) overriding system value values(-920001,-910001,'2099-01-05',20,40,2);
 insert into public.happy_calls(id,prescription_id,round,due_date,auto_due_date) overriding system value values(-930001,-920001,1,'2099-01-12','2099-01-12'),(-930002,-920001,2,'2099-01-22','2099-01-22');
 insert into public.appointments(id,day,time,kind,patient_id,patient_name,phone) overriding system value values(-980001,'2099-01-06','09:30','consult',-910001,'__ASIDE_TEST_S__','01000000000');
 insert into public.brew_jobs(id,title,day,slot,kind,patient_id,patient_name,prescription_id,receive_day) overriding system value values(-940001,'__ASIDE_TEST__','2099-01-04','am','decoction',-910001,'__ASIDE_TEST_S__',-920001,'2099-01-05');
 insert into public.cabinet_items(id,name,kind,min_stock,active,sort_order) overriding system value values(-960001,'__ASIDE_SHARED_TEST__','medicine',0,false,0);
 insert into public.cabinet_moves(id,item_id,kind,qty,staff_name) overriding system value values(-970001,-960001,'in',5,'launch-test');
end $$;
reset role;
update public.clinic_accounts set clinic='N' where user_id=auth.uid();
set local role authenticated;
do $$ declare affected int; begin
 assert public.current_clinic()='N','N identity';
 assert not exists(select 1 from patients where id=-910001),'S patient visible to N';
 assert not exists(select 1 from prescriptions where id=-920001),'S prescription visible to N';
 assert not exists(select 1 from happy_calls where id in(-930001,-930002)),'S calls visible to N';
 assert not exists(select 1 from appointments where id=-980001),'S reservation visible to N';
 update patients set memo='forbidden' where id=-910001; get diagnostics affected=row_count;
 assert affected=0,'N can edit S patient';
 insert into patients(id,name,phone,condition) overriding system value values(-910002,'__ASIDE_TEST_N__','01000000000','general');
 assert (select clinic from patients where id=-910002)='N','N default scope';
 begin
   insert into patients(id,name,phone,condition) overriding system value values(-910004,'__DUPLICATE__','01000000000','general');
   raise exception 'same-clinic N duplicate unexpectedly accepted';
 exception when unique_violation then null;
 end;
 insert into prescriptions(id,patient_id,receive_date,days,packs,per_day) overriding system value values(-920002,-910002,'2099-01-05',20,40,2);
 insert into happy_calls(id,prescription_id,round,due_date,auto_due_date) overriding system value values(-930003,-920002,1,'2099-01-12','2099-01-12'),(-930004,-920002,2,'2099-01-22','2099-01-22');
 assert (select count(*) from happy_calls where prescription_id=-920002)=2,'N two calls';
 assert exists(select 1 from brew_jobs where id=-940001),'shared brew hidden';
 begin update brew_jobs set receive_day='2099-01-06' where id=-940001; raise exception 'foreign schedule edit accepted'; exception when insufficient_privilege then null; end;
 assert (select receive_day from brew_jobs where id=-940001)='2099-01-05','foreign schedule changed';
 update brew_jobs set status='done',done_at=now(),done_by='launch-test' where id=-940001;
 assert (select status from brew_jobs where id=-940001)='done','shared done failed';
 begin delete from brew_jobs where id=-940001; raise exception 'foreign delete accepted'; exception when insufficient_privilege then null; end;
 assert exists(select 1 from cabinet_items where id=-960001),'shared inventory hidden';
 assert exists(select 1 from cabinet_moves where id=-970001),'shared stock ledger hidden';
 insert into cabinet_moves(id,item_id,kind,qty,staff_name) overriding system value values(-970002,-960001,'out',1,'launch-test');
 assert (select sum(case when kind='in' then qty else -qty end) from cabinet_moves where item_id=-960001)=4,'shared stock result';
 assert (select count(*) from ledger_codes)>0,'N ledger dictionary missing';
 assert (select count(*) from templates)=7,'N templates missing';
 assert exists(select 1 from appointment_settings where clinic='N' and not auto_notify and not remind_enabled),'N SMS not off';
end $$;
reset role;
update public.clinic_accounts set clinic='S' where user_id=auth.uid();
set local role authenticated;
do $$ begin
 assert not exists(select 1 from patients where id=-910002),'N patient visible to S';
 assert not exists(select 1 from prescriptions where id=-920002),'N prescription visible to S';
 assert not exists(select 1 from happy_calls where prescription_id=-920002),'N calls visible to S';
 assert (select count(*) from happy_calls where prescription_id=-920001)=2,'S calls changed';
 assert exists(select 1 from cabinet_moves where id=-970002),'N stock move hidden from S';
end $$;
reset role;
rollback;
select test,'PASS' as result from (values ('Same phone across S/N'),('Duplicate rejected within each clinic'),('Patients, prescriptions, calls, reservations isolated'),('Cross-clinic patient edit blocked'),('Two happy calls per 20-day prescription'),('Shared brew and inventory'),('Shared stock balance'),('N dictionaries and SMS-off settings'),('Foreign brew schedule/delete blocked; shared completion allowed'),('Transaction rolled back')) t(test);
