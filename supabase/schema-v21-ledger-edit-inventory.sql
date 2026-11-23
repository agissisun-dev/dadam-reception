-- V21: atomic ledger-note editing. No historical backfill or quantity/unit migration.
begin;
set local lock_timeout='5s';
lock table public.cabinet_items,public.cabinet_moves,public.ledger_codes,public.ledger_entries,public.ledger_items in share row exclusive mode;
create temporary table ledger_edit_before_v21 on commit drop as select 'cabinet_items'::text as subject,count(*) as n,md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.cabinet_items r
union all
select 'cabinet_moves'::text as subject,count(*) as n,md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.cabinet_moves r
union all
select 'ledger_codes'::text as subject,count(*) as n,md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_codes r
union all
select 'ledger_entries'::text as subject,count(*) as n,md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_entries r
union all
select 'ledger_items'::text as subject,count(*) as n,md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_items r;
create table if not exists public.ledger_entry_edits_v21 (
 id bigint generated always as identity primary key,
 entry_id bigint references public.ledger_entries(id) on delete set null,
 original_entry_id bigint not null,
 clinic text not null check(clinic in ('S','N')),
 actor_id uuid not null default auth.uid(),
 staff_name text not null,
 before_entry jsonb not null,before_items jsonb not null,
 after_entry jsonb not null,after_items jsonb not null,
 operation text not null default 'entry_update',
 created_at timestamptz not null default now()
);
alter table public.ledger_entry_edits_v21 enable row level security;
revoke all on public.ledger_entry_edits_v21 from anon,authenticated;
grant select on public.ledger_entry_edits_v21 to authenticated;
drop policy if exists edit_read on public.ledger_entry_edits_v21;
create policy edit_read on public.ledger_entry_edits_v21 for select to authenticated using(true);
drop policy if exists edit_scope on public.ledger_entry_edits_v21;
create policy edit_scope on public.ledger_entry_edits_v21 as restrictive for all to authenticated using(clinic=public.current_clinic()) with check(clinic=public.current_clinic());
drop policy if exists edit_no_insert on public.ledger_entry_edits_v21;
create policy edit_no_insert on public.ledger_entry_edits_v21 as restrictive for insert to authenticated with check(false);
drop policy if exists edit_no_update on public.ledger_entry_edits_v21;
create policy edit_no_update on public.ledger_entry_edits_v21 as restrictive for update to authenticated using(false);
drop policy if exists edit_no_delete on public.ledger_entry_edits_v21;
create policy edit_no_delete on public.ledger_entry_edits_v21 as restrictive for delete to authenticated using(false);
-- Only owner-executed triggers may append history. Caller snapshots are never accepted.
create or replace function public.ledger_edit_audit_v21() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.ledger_entries%rowtype; previous_entry jsonb; next_entry jsonb; previous_items jsonb:='[]'; next_items jsonb:='[]'; row_data jsonb; op text;
begin
 if auth.uid() is null then return null; end if;
 if tg_table_name='ledger_entries' then
  e:=new;previous_entry:=to_jsonb(old);next_entry:=to_jsonb(new);op:='entry_update';
  select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) into next_items from public.ledger_items i where entry_id=e.id;
 else
  if tg_op='DELETE' then row_data:=to_jsonb(old);else row_data:=to_jsonb(new);end if;
  select * into e from public.ledger_entries where id=(row_data->>'entry_id')::bigint;
  if not found then return null; end if;
  previous_entry:=to_jsonb(e);next_entry:=to_jsonb(e);op:='item_'||lower(tg_op);
  if tg_op in ('DELETE','UPDATE') then previous_items:=jsonb_build_array(to_jsonb(old));end if;
  if tg_op in ('INSERT','UPDATE') then next_items:=jsonb_build_array(to_jsonb(new));end if;
 end if;
 if e.clinic is distinct from public.current_clinic() then raise exception '장부 변경 이력 병원 경계 오류'; end if;
 insert into public.ledger_entry_edits_v21(entry_id,original_entry_id,clinic,actor_id,staff_name,before_entry,before_items,after_entry,after_items,operation)
 values(e.id,e.id,e.clinic,auth.uid(),coalesce(nullif(current_setting('app.ledger_edit_staff',true),''),e.staff_name),previous_entry,previous_items,next_entry,next_items,op);
 return null;
end $$;
revoke all on function public.ledger_edit_audit_v21() from public,anon,authenticated;
drop trigger if exists ledger_entry_audit_v21 on public.ledger_entries;
create trigger ledger_entry_audit_v21 after update on public.ledger_entries for each row execute function public.ledger_edit_audit_v21();
drop trigger if exists ledger_item_audit_v21 on public.ledger_items;
create trigger ledger_item_audit_v21 after insert or update or delete on public.ledger_items for each row execute function public.ledger_edit_audit_v21();

create or replace function public.edit_ledger_entry_v21(p_id bigint,p_expected_updated_at timestamptz,p_patch jsonb,p_note text,p_items jsonb,p_review boolean,p_staff text)
returns void language plpgsql security invoker set search_path='' as $$
declare e public.ledger_entries%rowtype; old_i public.ledger_items%rowtype;
 m public.cabinet_moves%rowtype; ci public.cabinet_items%rowtype;
 before_items jsonb; after_items jsonb; after_entry jsonb;
 x jsonb; step jsonb; plan jsonb:='[]'::jsonb; used bigint[]:='{}'::bigint[];
 matched bigint; move_id bigint; target_id bigint; qty integer; per_day integer; item_days integer;
 staff text:=btrim(coalesce(p_staff,'')); patient text:=btrim(coalesce(p_patch->>'patient_name',''));
begin
 if public.current_clinic() is null or staff='' or patient='' then raise exception '병원·처리자·성함을 확인해 주세요.'; end if;
 select * into e from public.ledger_entries where id=p_id and clinic=public.current_clinic() for update;
 if not found then raise exception '접근할 수 없는 장부입니다.'; end if;
 if public.ledger_day_locked(e.day) then raise exception '마감된 지난 장부는 고칠 수 없습니다. 정정 줄로 남겨 주세요.'; end if;
 if e.updated_at is distinct from p_expected_updated_at then raise exception '다른 변경이 저장되었습니다. 새로고침 후 다시 확인해 주세요.' using errcode='40001'; end if;
 perform id from public.ledger_items where entry_id=e.id for update;
 select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) into before_items from public.ledger_items i where entry_id=e.id;
 perform set_config('app.ledger_edit_staff',staff,true);
 if p_items is null then
  if p_note is distinct from e.note_raw then raise exception '기타 항목 해석 결과가 없습니다. 다시 확인해 주세요.'; end if;
 else
  if e.kind<>'normal' then raise exception '환불·정정 줄의 항목은 여기서 바꿀 수 없습니다.'; end if;
  if exists(select 1 from public.ledger_entries where corrects_id=e.id and kind in ('refund','correction')) then raise exception '환불·정정이 연결된 줄은 항목을 별도로 확인해 주세요.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 or length(coalesce(p_note,''))>10000 then raise exception '기타 항목 입력을 확인해 주세요.'; end if;
  for x in select value from jsonb_array_elements(p_items) loop
   if coalesce(x->>'raw','')='' or coalesce(x->>'name','')='' or coalesce(x->>'code','')='' or coalesce(x->>'group','') not in ('decoction','cabinet','extract','treatment','other') or coalesce((x->>'qty')::integer,0)<1 then raise exception '항목 이름과 수량을 확인해 주세요.'; end if;
   -- Unchanged raw tokens retain their exact historical row/link even if the dictionary changed.
   select i.id into matched from public.ledger_items i where i.entry_id=e.id and not(i.id=any(used))
    and i.raw=x->>'raw'
    order by i.id limit 1;
   if matched is not null then used:=array_append(used,matched);plan:=plan||jsonb_build_array(jsonb_build_object('matched',matched));
   else
    if x->>'group'='decoction' then raise exception '탕약 처방·약대장 연결 항목 변경은 별도로 처리해 주세요. 기존 항목은 그대로 두고 재고 품목을 추가할 수 있습니다.'; end if;
    plan:=plan||jsonb_build_array(jsonb_build_object('new',x));
   end if;
  end loop;
  for old_i in select * from public.ledger_items where entry_id=e.id and not(id=any(used)) loop
   if old_i.prescription_id is not null or old_i."group"='decoction' then raise exception '처방·약대장 연결 항목을 지우거나 바꿀 수 없습니다. 기존 항목은 그대로 두세요.'; end if;
   if old_i.cabinet_move_id is not null then
    select * into m from public.cabinet_moves where id=old_i.cabinet_move_id;
    if not found or m.kind<>'out' then raise exception '기존 재고 연결을 확인해 주세요.'; end if;
    select * into ci from public.cabinet_items where id=m.item_id;
    if not found or ci.legacy_shared or not public.inventory_scope_v17(ci.kind,ci.clinic) then raise exception '과거 공용·다른 병원 재고 연결은 별도 확인이 필요합니다.'; end if;
    if m.qty>0 then insert into public.cabinet_moves(item_id,kind,qty,patient_id,patient_name,staff_name,memo) values(m.item_id,'in',m.qty,e.patient_id,e.patient_name,staff,'장부 고치기 되돌림 '||e.day||' #'||e.seq||' · '||old_i.raw||' · 나감 #'||m.id); end if;
   end if;
   delete from public.ledger_items where id=old_i.id;
  end loop;
  for step in select value from jsonb_array_elements(plan) loop
   if step ? 'matched' then continue; end if;
   x:=step->'new';move_id:=null;target_id:=(x->>'cabinet_item_id')::bigint;
   if target_id is not null and x->>'group' in ('cabinet','extract') and not coalesce((x->>'unknown')::boolean,false) then
    select * into ci from public.cabinet_items where id=target_id;
    if not found or not ci.active or ci.legacy_shared or not public.inventory_scope_v17(ci.kind,ci.clinic) then raise exception '사용할 수 없는 재고 품목입니다. 병원·보관 상태를 확인해 주세요.'; end if;
    if x->>'group'='extract' then
     if ci.kind<>'insured' or ci.clinic<>e.clinic then raise exception '보험약 병원 연결을 확인해 주세요.'; end if;
     item_days:=(x->>'days')::integer;per_day:=coalesce((x->>'per_day')::integer,3);
     if item_days is null or item_days<1 or item_days>365 or per_day<1 or per_day>30 then raise exception '보험약은 삼소음2일처럼 일수를 적어 주세요.'; end if;
     qty:=item_days*per_day;
    else
     if ci.kind='insured' then raise exception '보험약은 일수로 입력해 주세요.'; end if;
     qty:=(x->>'qty')::integer;
    end if;
    if qty<1 or qty>100000 then raise exception '재고 수량을 확인해 주세요.'; end if;
    insert into public.cabinet_moves(item_id,kind,qty,purpose,patient_id,patient_name,staff_name,memo)
    values(ci.id,'out',qty,case when coalesce((x->>'free')::boolean,false) then 'service' when x->>'group'='cabinet' and p_review then 'review' else 'sale' end,e.patient_id,patient,staff,'장부 고치기 '||e.day||' #'||e.seq||' · '||(x->>'raw')) returning id into move_id;
   end if;
   insert into public.ledger_items(entry_id,code,name,"group",qty,amount,days,split,raw,cabinet_move_id)
   values(e.id,x->>'code',x->>'name',x->>'group',(x->>'qty')::integer,(x->>'amount')::integer,(x->>'days')::integer,(x->>'split')::integer,x->>'raw',move_id);
  end loop;
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='ledger_entries' and column_name='red_fields') then
 update public.ledger_entries set patient_name=patient,insurance_kind=nullif(btrim(p_patch->>'insurance_kind'),''),cash=(p_patch->>'cash')::integer,cash_receipt=(p_patch->>'cash_receipt')::integer,card=(p_patch->>'card')::integer,memo=nullif(btrim(p_patch->>'memo'),''),red_fields=array(select jsonb_array_elements_text(p_patch->'red_fields')),off_total=coalesce((p_patch->>'off_total')::boolean,false),pay_note=p_patch->>'pay_note',note_raw=coalesce(p_note,''),updated_at=clock_timestamp() where id=e.id;
 else
 update public.ledger_entries set patient_name=patient,insurance_kind=nullif(btrim(p_patch->>'insurance_kind'),''),cash=(p_patch->>'cash')::integer,cash_receipt=(p_patch->>'cash_receipt')::integer,card=(p_patch->>'card')::integer,memo=nullif(btrim(p_patch->>'memo'),''),off_total=coalesce((p_patch->>'off_total')::boolean,false),pay_note=p_patch->>'pay_note',note_raw=coalesce(p_note,''),updated_at=clock_timestamp() where id=e.id;
 end if;

end $$;
revoke all on function public.edit_ledger_entry_v21(bigint,timestamptz,jsonb,text,jsonb,boolean,text) from public,anon;
grant execute on function public.edit_ledger_entry_v21(bigint,timestamptz,jsonb,text,jsonb,boolean,text) to authenticated;
do $$ begin if exists(select * from ledger_edit_before_v21 except (select 'cabinet_items'::text as subject,count(*) as n,md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.cabinet_items r
union all
select 'cabinet_moves'::text as subject,count(*) as n,md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.cabinet_moves r
union all
select 'ledger_codes'::text as subject,count(*) as n,md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_codes r
union all
select 'ledger_entries'::text as subject,count(*) as n,md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_entries r
union all
select 'ledger_items'::text as subject,count(*) as n,md5(coalesce(string_agg(row_to_json(r)::text,'' order by id),'')) as digest from public.ledger_items r)) then raise exception 'V21_ORIGINAL_DATA_CHANGED'; end if; end $$;
commit;
notify pgrst,'reload schema';
