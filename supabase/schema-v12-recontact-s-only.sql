-- V12 S-ONLY OPERATIONAL VARIANT: 재진콜 is enabled ONLY for 다담에스한의원 (S).
-- Run manually after V11. schema-v12-recontact.sql is future dual-clinic/reference only.
-- Do not apply the generic variant after this file unless a dual-clinic rollout is authorized.
-- Existing N rows are preserved, but N access to these two tables and all five RPCs is denied.
-- No provider calls, SMS keys/settings, patient rewrites, merges or deletions.
-- All changes are transactional. Existing duplicates/cross-clinic links abort rather than being repaired.
begin;
set local lock_timeout = '5s';
select pg_advisory_xact_lock(hashtext('dadam-recontact-v12'));

-- Fail closed on missing V2/V6/V7/V10/V11 dependencies. Do NOT replace current_clinic().
do $preflight$
declare
  dep record;
  old_sub text := current_setting('request.jwt.claim.sub', true);
  old_claims text := current_setting('request.jwt.claims', true);
begin
  if to_regprocedure('public.current_clinic()') is null then
    raise exception 'V11_REQUIRED: public.current_clinic() is missing';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  if auth.uid() is not null or public.current_clinic() is not null then
    raise exception 'V11_REQUIRED: auth.uid() NULL must not map to S or any clinic';
  end if;
  perform set_config('request.jwt.claim.sub', coalesce(old_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);

  for dep in select * from (values
    ('clinic_accounts', array['user_id','clinic']),
    ('patients', array['id','clinic','name','phone','condition','memo','excluded_at','excluded_reason']),
    ('appointments', array['clinic','patient_id','day','status']),
    ('prescriptions', array['id','clinic','patient_id','receive_date']),
    ('happy_calls', array['clinic','prescription_id','status'])
  ) as deps(table_name, columns) loop
    if to_regclass('public.' || dep.table_name) is null then
      raise exception 'RECONTACT_DEPENDENCY_MISSING: public.%', dep.table_name;
    end if;
    if exists (
      select 1 from unnest(dep.columns) as expected(column_name)
      where not exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = to_regclass('public.' || dep.table_name)
          and a.attname = expected.column_name and a.attnum > 0 and not a.attisdropped
      )
    ) then
      raise exception 'RECONTACT_DEPENDENCY_COLUMNS_MISSING: public.%', dep.table_name;
    end if;
  end loop;
  -- ON CONFLICT (clinic, phone) requires the non-deferrable V10 unique rule.
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.patients'::regclass and c.contype = 'u'
      and not c.condeferrable and c.convalidated and cardinality(c.conkey) = 2
      and c.conkey @> array[
        (select attnum from pg_catalog.pg_attribute where attrelid = 'public.patients'::regclass and attname = 'clinic'),
        (select attnum from pg_catalog.pg_attribute where attrelid = 'public.patients'::regclass and attname = 'phone')
      ]::smallint[]
  ) then
    raise exception 'V10_REQUIRED: patients UNIQUE (clinic, phone) is missing';
  end if;
  if exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.patients'::regclass and c.contype = 'u'
      and c.conkey = array[(select attnum from pg_catalog.pg_attribute
        where attrelid = 'public.patients'::regclass and attname = 'phone')]::smallint[]
  ) then
    raise exception 'V10_REQUIRED: legacy global patients.phone uniqueness still exists';
  end if;
end
$preflight$;

create table if not exists public.recontacts (
  id bigint generated always as identity primary key,
  clinic text not null default public.current_clinic() check (clinic in ('S','N')),
  -- 누구
  patient_id bigint references public.patients(id) on delete set null,   -- 연락처를 연결하기 전에는 null
  patient_name text not null,
  birth_hint text,                                                       -- 동명이인 확인용 메모(생년 등)
  -- 왜 이 사람인지
  segment text not null check (segment in ('due_now','due_soon','vip','once_p1','once_p2','lapsed','tonic')),
  call_target boolean not null default false,                            -- 답이 없으면 전화까지 할 묶음인지
  herb_count integer,
  last_herb_date date,
  avg_interval_days integer,
  herb_kind text,
  -- 준비
  doctor_note text,                                                      -- 원장님 칸: 무엇을 물을지 한 줄
  draft_text text,                                                       -- 샘이 고친 문구(없으면 틀에서 채움)
  variant text not null default 'A' check (variant in ('A','B')),        -- 문구 A·B 비교용
  -- 진행
  status text not null default 'todo' check (status in ('todo','sent','replied','booked','declined','rest')),
  sent_at timestamptz, sent_by text, sent_text text,
  reply_text text, replied_at timestamptz,
  doctor_reply text,                                                     -- 답을 본 원장님 말씀(두 번째 문자에 들어감)
  called_at timestamptz, call_result text,
  attempts integer not null default 0,
  memo text,
  staff_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recontacts_status_idx on public.recontacts (clinic, status);
create index if not exists recontacts_patient_idx on public.recontacts (patient_id);

create table if not exists public.recontact_settings (
  clinic text primary key default public.current_clinic() check (clinic in ('S','N')),
  daily_cap integer not null default 20 check (daily_cap between 1 and 100),   -- 하루에 보내는 수
  body_a text not null default '{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드시고 어떠신지 원장님이 궁금해하셔서 연락드려요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.',
  body_b text not null default '{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드신 뒤 어떠신지 원장님이 궁금해하세요. {원장한줄} 번호만 답 주셔도 됩니다. 1 많이 좋아졌어요 / 2 비슷해요 / 3 다시 불편해요',
  body_vip text not null default '{이름}님, 노원다담한의원입니다. 오래 믿고 찾아 주셨는데 {월} 이후로 뵙지 못해 원장님이 안부를 궁금해하세요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.',
  body_once text not null default '{이름}님, 노원다담한의원입니다. {월}에 {약} 드신 뒤 경과를 여쭙지 못해 연락드려요. {원장한줄} 번호만 답 주셔도 됩니다. 1 좋아져서 괜찮아요 / 2 나아지다 말았어요 / 3 별 차이를 못 느꼈어요',
  body_reply text not null default '답 주셔서 고맙습니다, {이름}님. 원장님께 전해 드렸더니 {원장답} 내원해서 보시는 게 편하세요, 전화 상담 뒤 받으시는 게 편하세요? 편하신 쪽 말씀 주시면 바로 잡아 드릴게요.',
  body_missed text not null default '{이름}님, 노원다담한의원입니다. 조금 전 전화 드렸는데 통화가 안 되어 문자 남겨요. 지난번 약 드시고 어떠신지 여쭤보려던 거였어요. 편하실 때 전화나 답 주세요.'
);

-- 이 파일을 예전 판으로 이미 실행했더라도 다시 실행하면 빠진 문구 칸이 더해진다
alter table public.recontact_settings
  add column if not exists body_vip text not null default '{이름}님, 노원다담한의원입니다. 오래 믿고 찾아 주셨는데 {월} 이후로 뵙지 못해 원장님이 안부를 궁금해하세요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.',
  add column if not exists body_once text not null default '{이름}님, 노원다담한의원입니다. {월}에 {약} 드신 뒤 경과를 여쭙지 못해 연락드려요. {원장한줄} 번호만 답 주셔도 됩니다. 1 좋아져서 괜찮아요 / 2 나아지다 말았어요 / 3 별 차이를 못 느꼈어요';


alter table public.recontacts add column if not exists source_key text;
create unique index if not exists recontacts_clinic_source_key_idx
  on public.recontacts (clinic, source_key) where source_key is not null;
alter table public.recontact_settings alter column daily_cap set default 20;
-- Existing daily_cap values (including deliberately customized limits) are retained.

alter table public.recontacts enable row level security;
alter table public.recontact_settings enable row level security;
-- Remove any older permissive policy: PostgreSQL ORs permissive policies together.
do $s_only_policies$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename in ('recontacts','recontact_settings')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end
$s_only_policies$;
drop policy if exists clinic_all on public.recontacts;
create policy clinic_all on public.recontacts for all to authenticated
  using (clinic = 'S' and public.current_clinic() = 'S')
  with check (clinic = 'S' and public.current_clinic() = 'S');
drop policy if exists clinic_all on public.recontact_settings;
create policy clinic_all on public.recontact_settings for all to authenticated
  using (clinic = 'S' and public.current_clinic() = 'S')
  with check (clinic = 'S' and public.current_clinic() = 'S');
revoke all on table public.recontacts, public.recontact_settings from public, anon;
revoke delete on table public.recontacts, public.recontact_settings from authenticated;
grant select, insert, update on table public.recontacts, public.recontact_settings to authenticated;
do $$ declare seq_name text; begin
  seq_name := pg_get_serial_sequence('public.recontacts', 'id');
  if seq_name is not null then
    execute format('revoke all on sequence %s from public, anon', seq_name);
    execute format('grant usage, select on sequence %s to authenticated', seq_name);
  end if;
end $$;

alter table public.recontact_settings alter column body_a set default
  replace('{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드시고 어떠신지 원장님이 궁금해하셔서 연락드려요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.', '노원다담한의원', case when public.current_clinic() = 'S' then '다담에스한의원' else '노원다담한의원' end);
-- Only the exact old N default is corrected for S. Customized text is retained.
update public.recontact_settings set body_a = replace('{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드시고 어떠신지 원장님이 궁금해하셔서 연락드려요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.', '노원다담한의원', '다담에스한의원')
where clinic = 'S' and body_a = '{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드시고 어떠신지 원장님이 궁금해하셔서 연락드려요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.';
alter table public.recontact_settings alter column body_b set default
  replace('{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드신 뒤 어떠신지 원장님이 궁금해하세요. {원장한줄} 번호만 답 주셔도 됩니다. 1 많이 좋아졌어요 / 2 비슷해요 / 3 다시 불편해요', '노원다담한의원', case when public.current_clinic() = 'S' then '다담에스한의원' else '노원다담한의원' end);
-- Only the exact old N default is corrected for S. Customized text is retained.
update public.recontact_settings set body_b = replace('{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드신 뒤 어떠신지 원장님이 궁금해하세요. {원장한줄} 번호만 답 주셔도 됩니다. 1 많이 좋아졌어요 / 2 비슷해요 / 3 다시 불편해요', '노원다담한의원', '다담에스한의원')
where clinic = 'S' and body_b = '{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드신 뒤 어떠신지 원장님이 궁금해하세요. {원장한줄} 번호만 답 주셔도 됩니다. 1 많이 좋아졌어요 / 2 비슷해요 / 3 다시 불편해요';
alter table public.recontact_settings alter column body_vip set default
  replace('{이름}님, 노원다담한의원입니다. 오래 믿고 찾아 주셨는데 {월} 이후로 뵙지 못해 원장님이 안부를 궁금해하세요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.', '노원다담한의원', case when public.current_clinic() = 'S' then '다담에스한의원' else '노원다담한의원' end);
-- Only the exact old N default is corrected for S. Customized text is retained.
update public.recontact_settings set body_vip = replace('{이름}님, 노원다담한의원입니다. 오래 믿고 찾아 주셨는데 {월} 이후로 뵙지 못해 원장님이 안부를 궁금해하세요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.', '노원다담한의원', '다담에스한의원')
where clinic = 'S' and body_vip = '{이름}님, 노원다담한의원입니다. 오래 믿고 찾아 주셨는데 {월} 이후로 뵙지 못해 원장님이 안부를 궁금해하세요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.';
alter table public.recontact_settings alter column body_once set default
  replace('{이름}님, 노원다담한의원입니다. {월}에 {약} 드신 뒤 경과를 여쭙지 못해 연락드려요. {원장한줄} 번호만 답 주셔도 됩니다. 1 좋아져서 괜찮아요 / 2 나아지다 말았어요 / 3 별 차이를 못 느꼈어요', '노원다담한의원', case when public.current_clinic() = 'S' then '다담에스한의원' else '노원다담한의원' end);
-- Only the exact old N default is corrected for S. Customized text is retained.
update public.recontact_settings set body_once = replace('{이름}님, 노원다담한의원입니다. {월}에 {약} 드신 뒤 경과를 여쭙지 못해 연락드려요. {원장한줄} 번호만 답 주셔도 됩니다. 1 좋아져서 괜찮아요 / 2 나아지다 말았어요 / 3 별 차이를 못 느꼈어요', '노원다담한의원', '다담에스한의원')
where clinic = 'S' and body_once = '{이름}님, 노원다담한의원입니다. {월}에 {약} 드신 뒤 경과를 여쭙지 못해 연락드려요. {원장한줄} 번호만 답 주셔도 됩니다. 1 좋아져서 괜찮아요 / 2 나아지다 말았어요 / 3 별 차이를 못 느꼈어요';
alter table public.recontact_settings alter column body_reply set default
  replace('답 주셔서 고맙습니다, {이름}님. 원장님께 전해 드렸더니 {원장답} 내원해서 보시는 게 편하세요, 전화 상담 뒤 받으시는 게 편하세요? 편하신 쪽 말씀 주시면 바로 잡아 드릴게요.', '노원다담한의원', case when public.current_clinic() = 'S' then '다담에스한의원' else '노원다담한의원' end);
-- Only the exact old N default is corrected for S. Customized text is retained.
update public.recontact_settings set body_reply = replace('답 주셔서 고맙습니다, {이름}님. 원장님께 전해 드렸더니 {원장답} 내원해서 보시는 게 편하세요, 전화 상담 뒤 받으시는 게 편하세요? 편하신 쪽 말씀 주시면 바로 잡아 드릴게요.', '노원다담한의원', '다담에스한의원')
where clinic = 'S' and body_reply = '답 주셔서 고맙습니다, {이름}님. 원장님께 전해 드렸더니 {원장답} 내원해서 보시는 게 편하세요, 전화 상담 뒤 받으시는 게 편하세요? 편하신 쪽 말씀 주시면 바로 잡아 드릴게요.';
alter table public.recontact_settings alter column body_missed set default
  replace('{이름}님, 노원다담한의원입니다. 조금 전 전화 드렸는데 통화가 안 되어 문자 남겨요. 지난번 약 드시고 어떠신지 여쭤보려던 거였어요. 편하실 때 전화나 답 주세요.', '노원다담한의원', case when public.current_clinic() = 'S' then '다담에스한의원' else '노원다담한의원' end);
-- Only the exact old N default is corrected for S. Customized text is retained.
update public.recontact_settings set body_missed = replace('{이름}님, 노원다담한의원입니다. 조금 전 전화 드렸는데 통화가 안 되어 문자 남겨요. 지난번 약 드시고 어떠신지 여쭤보려던 거였어요. 편하실 때 전화나 답 주세요.', '노원다담한의원', '다담에스한의원')
where clinic = 'S' and body_missed = '{이름}님, 노원다담한의원입니다. 조금 전 전화 드렸는데 통화가 안 되어 문자 남겨요. 지난번 약 드시고 어떠신지 여쭤보려던 거였어요. 편하실 때 전화나 답 주세요.';
insert into public.recontact_settings (clinic, daily_cap, body_a, body_b, body_vip, body_once, body_reply, body_missed)
select c.clinic, 20, replace('{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드시고 어떠신지 원장님이 궁금해하셔서 연락드려요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.', '노원다담한의원', case when c.clinic = 'S' then '다담에스한의원' else '노원다담한의원' end),
  replace('{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드신 뒤 어떠신지 원장님이 궁금해하세요. {원장한줄} 번호만 답 주셔도 됩니다. 1 많이 좋아졌어요 / 2 비슷해요 / 3 다시 불편해요', '노원다담한의원', case when c.clinic = 'S' then '다담에스한의원' else '노원다담한의원' end),
  replace('{이름}님, 노원다담한의원입니다. 오래 믿고 찾아 주셨는데 {월} 이후로 뵙지 못해 원장님이 안부를 궁금해하세요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.', '노원다담한의원', case when c.clinic = 'S' then '다담에스한의원' else '노원다담한의원' end),
  replace('{이름}님, 노원다담한의원입니다. {월}에 {약} 드신 뒤 경과를 여쭙지 못해 연락드려요. {원장한줄} 번호만 답 주셔도 됩니다. 1 좋아져서 괜찮아요 / 2 나아지다 말았어요 / 3 별 차이를 못 느꼈어요', '노원다담한의원', case when c.clinic = 'S' then '다담에스한의원' else '노원다담한의원' end),
  replace('답 주셔서 고맙습니다, {이름}님. 원장님께 전해 드렸더니 {원장답} 내원해서 보시는 게 편하세요, 전화 상담 뒤 받으시는 게 편하세요? 편하신 쪽 말씀 주시면 바로 잡아 드릴게요.', '노원다담한의원', case when c.clinic = 'S' then '다담에스한의원' else '노원다담한의원' end),
  replace('{이름}님, 노원다담한의원입니다. 조금 전 전화 드렸는데 통화가 안 되어 문자 남겨요. 지난번 약 드시고 어떠신지 여쭤보려던 거였어요. 편하실 때 전화나 답 주세요.', '노원다담한의원', case when c.clinic = 'S' then '다담에스한의원' else '노원다담한의원' end)
from (values ('S')) as c(clinic)
on conflict (clinic) do nothing;

-- Every candidate write, including direct REST inserts/updates, checks the linked patient's clinic.
-- No legacy cross-clinic data is silently rewritten.
do $$ begin
  if exists (
    select 1 from public.recontacts r left join public.patients p on p.id = r.patient_id
    where r.patient_id is not null and (p.id is null or p.clinic is distinct from r.clinic)
  ) then raise exception 'RECONTACT_CROSS_CLINIC_LINK: review existing candidates before migrating'; end if;
  if exists (
    select 1 from public.recontacts r
    where r.patient_id is not null and r.status in ('todo','sent','replied')
    group by r.clinic, r.patient_id having count(*) > 1
  ) then raise exception 'ACTIVE_RECONTACT_EXISTS: review duplicate active candidates before migrating'; end if;
end $$;
-- A unique index is the final concurrency backstop, including repeatable-read snapshots.
create unique index if not exists recontacts_clinic_active_patient_idx
  on public.recontacts (clinic, patient_id)
  where patient_id is not null and status in ('todo','sent','replied');

create or replace function public.guard_recontact_patient() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_clinic text := public.current_clinic();
begin
  if v_clinic is null or v_clinic <> 'S' then
    raise exception 'CLINIC_REQUIRED' using errcode = '42501';
  end if;
  if new.clinic is distinct from v_clinic then
    raise exception 'CLINIC_MISMATCH' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.clinic is distinct from old.clinic then
    raise exception 'CLINIC_IMMUTABLE' using errcode = '23514';
  end if;
  if new.patient_id is not null then
    perform 1 from public.patients p where p.id = new.patient_id and p.clinic = new.clinic for key share;
    if not found then raise exception 'PATIENT_CLINIC_MISMATCH' using errcode = '23514'; end if;
    if new.status in ('todo','sent','replied') then
      if tg_op = 'INSERT' or new.patient_id is distinct from old.patient_id
          or new.status is distinct from old.status then
        -- Serialize same-patient REST inserts/relinks/reactivations, not only link RPC calls.
        perform pg_advisory_xact_lock(
          hashtext('dadam-recontact-active:' || new.clinic), hashtext(new.patient_id::text)
        );
        if exists (
          select 1 from public.recontacts r
          where r.clinic = new.clinic and r.patient_id = new.patient_id
            and r.id is distinct from new.id and r.status in ('todo','sent','replied')
        ) then raise exception 'ACTIVE_RECONTACT_EXISTS' using errcode = '23505'; end if;
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    -- A UI status reset to todo must not erase or backdate a recorded send/call.
    if old.sent_at is not null and new.sent_at < old.sent_at then
      raise exception 'SENT_AT_CANNOT_GO_BACKWARDS' using errcode = '23514';
    end if;
    if old.called_at is not null and new.called_at < old.called_at then
      raise exception 'CALLED_AT_CANNOT_GO_BACKWARDS' using errcode = '23514';
    end if;
    if old.sent_at is not null and new.sent_at is null then
      new.sent_at := old.sent_at; new.sent_by := old.sent_by; new.sent_text := old.sent_text;
    end if;
    if old.called_at is not null and new.called_at is null then
      new.called_at := old.called_at; new.call_result := old.call_result;
    end if;
    new.attempts := greatest(old.attempts, new.attempts);
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.guard_recontact_patient() from public, anon, authenticated;
drop trigger if exists guard_recontact_patient on public.recontacts;
create trigger guard_recontact_patient before insert or update on public.recontacts
for each row execute function public.guard_recontact_patient();

create or replace function public.recontact_link_phone(
  p_id bigint, p_phone text, p_accept_different_name boolean default false,
  p_allow_create boolean default false, p_staff text default ''
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_clinic text := public.current_clinic();
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_candidate public.recontacts%rowtype;
  v_patient public.patients%rowtype;
begin
  if v_clinic is null or v_clinic <> 'S' then
    raise exception 'CLINIC_REQUIRED' using errcode = '42501';
  end if;
  -- Lock/verify BEFORE any possible patient creation.
  select r.* into v_candidate from public.recontacts r
  where r.id = p_id and r.clinic = v_clinic for update;
  if not found then raise exception 'RECONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_phone !~ '^01[016789][0-9]{7,8}$' then
    raise exception 'INVALID_MOBILE' using errcode = '22023';
  end if;
  -- Normalize for matching too, without rewriting any existing phone/name.
  -- A legacy formatted-phone collision is ambiguous, so abort instead of picking one.
  begin
    select p.* into strict v_patient from public.patients p
    where p.clinic = v_clinic and regexp_replace(p.phone, '[^0-9]', '', 'g') = v_phone
    for update;
  exception
    when no_data_found then v_patient := null;
    when too_many_rows then raise exception 'AMBIGUOUS_PHONE' using errcode = '23505';
  end;
  if v_patient.id is null then
    if v_candidate.patient_id is not null then
      raise exception 'ALREADY_LINKED' using errcode = '23514';
    end if;
    if p_allow_create is not true then raise exception 'PATIENT_MISSING' using errcode = 'P0002'; end if;
    -- Only V2 + V6 fields. No V9 source/source_note dependency.
    insert into public.patients (name, phone, condition, memo, clinic)
    values (v_candidate.patient_name, v_phone, 'general', v_candidate.memo, v_clinic)
    on conflict (clinic, phone) do nothing returning * into v_patient;
    if not found then
      select p.* into v_patient from public.patients p
      where p.clinic = v_clinic and p.phone = v_phone for update;
      if not found then raise exception 'PATIENT_MISSING' using errcode = 'P0002'; end if;
    end if;
  end if;
  if v_candidate.patient_id is not null and v_candidate.patient_id <> v_patient.id then
    raise exception 'ALREADY_LINKED' using errcode = '23514';
  end if;
  if btrim(v_patient.name) is distinct from btrim(v_candidate.patient_name)
     and p_accept_different_name is not true then
    raise exception 'NAME_MISMATCH' using errcode = '23514', detail = to_jsonb(v_patient)::text;
  end if;
  -- The patient row lock serializes simultaneous links from different candidates.
  if exists (select 1 from public.recontacts r
      where r.clinic = v_clinic and r.patient_id = v_patient.id and r.id <> v_candidate.id
        and r.status in ('todo','sent','replied')) then
    raise exception 'ACTIVE_RECONTACT_EXISTS' using errcode = '23505';
  end if;
  update public.recontacts r set patient_id = v_patient.id, staff_name = coalesce(p_staff, '')
  where r.id = v_candidate.id and r.clinic = v_clinic returning r.* into v_candidate;
  if not found then raise exception 'RECONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
  return jsonb_build_object('patient', to_jsonb(v_patient), 'recontact', to_jsonb(v_candidate));
end $$;

create or replace function public.recontact_opt_out(
  p_id bigint, p_reason text default '재진콜 연락 제외'
) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_clinic text := public.current_clinic();
  v_candidate public.recontacts%rowtype;
begin
  if v_clinic is null or v_clinic <> 'S' then
    raise exception 'CLINIC_REQUIRED' using errcode = '42501';
  end if;
  select r.* into v_candidate from public.recontacts r
  where r.id = p_id and r.clinic = v_clinic for update;
  if not found then raise exception 'RECONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_candidate.patient_id is not null then
    update public.patients p set excluded_at = clock_timestamp(),
      excluded_reason = coalesce(nullif(btrim(p_reason), ''), '재진콜 연락 제외')
    where p.id = v_candidate.patient_id and p.clinic = v_clinic;
    if not found then raise exception 'PATIENT_CLINIC_MISMATCH' using errcode = '23514'; end if;
    update public.recontacts r set status = 'declined'
    where r.clinic = v_clinic and r.patient_id = v_candidate.patient_id
      and r.status in ('todo','sent','replied');
  end if;
  -- The selected candidate is declined even if it was unlinked or already inactive.
  update public.recontacts r set status = 'declined' where r.id = p_id and r.clinic = v_clinic;
  if not found then raise exception 'RECONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
end $$;

create or replace function public.recontact_assert_contact(
  p_id bigint, p_purpose text default 'initial'
) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_clinic text := public.current_clinic();
  v_candidate public.recontacts%rowtype;
  v_patient public.patients%rowtype;
  v_now timestamp := clock_timestamp() at time zone 'Asia/Seoul';
  v_today date := v_now::date;
  v_cap integer;
  v_sent bigint;
begin
  if v_clinic is null or v_clinic <> 'S' then
    raise exception 'CLINIC_REQUIRED' using errcode = '42501';
  end if;
  if p_purpose is null or p_purpose not in ('initial','followup','call') then
    raise exception 'INVALID_PURPOSE' using errcode = '22023';
  end if;
  select r.* into v_candidate from public.recontacts r
  where r.id = p_id and r.clinic = v_clinic for update;
  if not found then raise exception 'RECONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
  select p.* into v_patient from public.patients p
  where p.id = v_candidate.patient_id and p.clinic = v_clinic for share;
  if not found then raise exception 'PATIENT_CLINIC_MISMATCH' using errcode = '23514'; end if;
  if v_patient.excluded_at is not null then raise exception 'PATIENT_EXCLUDED' using errcode = '23514'; end if;
  if regexp_replace(coalesce(v_patient.phone, ''), '[^0-9]', '', 'g') !~ '^01[016789][0-9]{7,8}$' then
    raise exception 'INVALID_MOBILE' using errcode = '22023';
  end if;
  if v_candidate.status not in ('todo','sent','replied') then
    raise exception 'RECONTACT_INACTIVE' using errcode = '23514';
  end if;
  -- SQL's baseline guard; the UI applies stricter clinic/holiday contact windows.
  if extract(isodow from v_now) = 7 or v_now::time < time '09:00' or v_now::time >= time '21:00' then
    raise exception 'OUTSIDE_CONTACT_WINDOW' using errcode = '23514';
  end if;
  if p_purpose = 'initial' then
    if v_candidate.status <> 'todo' then raise exception 'INITIAL_REQUIRES_TODO' using errcode = '23514'; end if;
    if exists (select 1 from public.recontacts r
        where r.clinic = v_clinic and r.patient_id = v_patient.id
          and ((r.sent_at at time zone 'Asia/Seoul')::date = v_today
            or (r.called_at at time zone 'Asia/Seoul')::date = v_today)) then
      raise exception 'ALREADY_CONTACTED_TODAY' using errcode = '23514';
    end if;
    select s.daily_cap into v_cap from public.recontact_settings s where s.clinic = v_clinic;
    if not found or v_cap is null or v_cap < 1 then raise exception 'RECONTACT_SETTINGS_MISSING' using errcode = '23514'; end if;
    -- Count all sent_at facts, even when a candidate was later reset to todo/rest/declined.
    select count(*) into v_sent from public.recontacts r
    where r.clinic = v_clinic and (r.sent_at at time zone 'Asia/Seoul')::date = v_today;
    if v_sent >= v_cap then raise exception 'DAILY_CAP_REACHED' using errcode = '23514'; end if;
    if exists (select 1 from public.appointments a where a.clinic = v_clinic
        and a.patient_id = v_patient.id and a.status = 'booked' and a.day >= v_today) then
      raise exception 'APPOINTMENT_BOOKED' using errcode = '23514';
    end if;
    -- Ordinary/acupuncture ledger visits are not evidence of another herbal prescription.
    -- Only the actual prescription receive_date suppresses an initial recontact.
    if exists (select 1 from public.prescriptions p where p.clinic = v_clinic
        and p.patient_id = v_patient.id and p.receive_date >= v_today - 14) then
      raise exception 'RECENT_HERB_PRESCRIPTION' using errcode = '23514';
    end if;
    if exists (select 1 from public.happy_calls h
        join public.prescriptions p on p.id = h.prescription_id and p.clinic = h.clinic
        where h.clinic = v_clinic and p.clinic = v_clinic
          and p.patient_id = v_patient.id and h.status = 'pending') then
      raise exception 'HAPPY_CALL_PENDING' using errcode = '23514';
    end if;
  end if;
  -- Deliberately no empty/error fallbacks: missing tables, columns and RLS errors propagate.
  -- This check is not a reservation and cannot atomically cover a later manual phone send.
end $$;

-- These two RPCs record facts AFTER manual contact; neither calls eligibility or a provider.
create or replace function public.recontact_record_sent(
  p_id bigint, p_expected_attempts integer, p_staff text, p_text text
) returns public.recontacts
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_clinic text := public.current_clinic();
  v_candidate public.recontacts%rowtype;
begin
  if v_clinic is null or v_clinic <> 'S' then
    raise exception 'CLINIC_REQUIRED' using errcode = '42501';
  end if;
  select r.* into v_candidate from public.recontacts r
  where r.id = p_id and r.clinic = v_clinic for update;
  if not found then raise exception 'RECONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_expected_attempts is null or p_expected_attempts < 0
      or v_candidate.attempts is distinct from p_expected_attempts then
    raise exception 'STALE_ATTEMPTS' using errcode = '40001';
  end if;
  update public.recontacts r set sent_at = clock_timestamp(), sent_by = coalesce(p_staff, ''),
    sent_text = p_text, attempts = r.attempts + 1,
    status = case when r.status in ('declined','rest','booked') then r.status else 'sent' end
  where r.id = p_id and r.clinic = v_clinic returning r.* into v_candidate;
  if not found then raise exception 'RECONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
  return v_candidate;
end $$;

create or replace function public.recontact_record_call(
  p_id bigint, p_expected_attempts integer, p_result text
) returns public.recontacts
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_clinic text := public.current_clinic();
  v_candidate public.recontacts%rowtype;
begin
  if v_clinic is null or v_clinic <> 'S' then
    raise exception 'CLINIC_REQUIRED' using errcode = '42501';
  end if;
  select r.* into v_candidate from public.recontacts r
  where r.id = p_id and r.clinic = v_clinic for update;
  if not found then raise exception 'RECONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_expected_attempts is null or p_expected_attempts < 0
      or v_candidate.attempts is distinct from p_expected_attempts then
    raise exception 'STALE_ATTEMPTS' using errcode = '40001';
  end if;
  update public.recontacts r set called_at = clock_timestamp(), call_result = p_result,
    attempts = r.attempts + 1
  where r.id = p_id and r.clinic = v_clinic returning r.* into v_candidate;
  if not found then raise exception 'RECONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
  return v_candidate;
end $$;

-- Functions must exist before privileges are applied. No anonymous/public RPC execution.
revoke all on function public.recontact_link_phone(bigint,text,boolean,boolean,text) from public, anon;
revoke all on function public.recontact_opt_out(bigint,text) from public, anon;
revoke all on function public.recontact_assert_contact(bigint,text) from public, anon;
revoke all on function public.recontact_record_sent(bigint,integer,text,text) from public, anon;
revoke all on function public.recontact_record_call(bigint,integer,text) from public, anon;
grant execute on function public.recontact_link_phone(bigint,text,boolean,boolean,text) to authenticated;
grant execute on function public.recontact_opt_out(bigint,text) to authenticated;
grant execute on function public.recontact_assert_contact(bigint,text) to authenticated;
grant execute on function public.recontact_record_sent(bigint,integer,text,text) to authenticated;
grant execute on function public.recontact_record_call(bigint,integer,text) to authenticated;

notify pgrst, 'reload schema';
commit;
