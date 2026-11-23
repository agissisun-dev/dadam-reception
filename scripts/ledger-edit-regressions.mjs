import { readFile } from 'node:fs/promises';
import path from 'node:path';
export async function runLedgerEditRegressions({db,q,eq,reject,test,as,admin,root}) {
 await admin();
 await db.exec(`create schema if not exists auth;
 create or replace function auth.uid() returns uuid language sql stable as $$select case current_setting('test.clinic',true) when 'S' then '00000000-0000-0000-0000-000000000001'::uuid when 'N' then '00000000-0000-0000-0000-000000000002'::uuid else null end$$;
 grant usage on schema auth to authenticated;
 alter table ledger_entries add column day date not null default current_date,add column seq integer not null default 1,add column patient_id bigint,add column patient_name text not null default 'fixture',add column insurance_kind text,add column cash integer not null default 0,add column cash_receipt integer not null default 0,add column card integer not null default 0,add column note_raw text not null default '',add column memo text,add column staff_name text not null default 'fixture',add column kind text not null default 'normal',add column corrects_id bigint,add column packs_missing boolean not null default false,add column red_fields text[],add column off_total boolean not null default false,add column pay_note text,add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
 alter table ledger_items add column code text not null default 'fixture',add column name text not null default 'fixture',add column qty integer not null default 1,add column amount integer,add column days integer,add column split integer,add column raw text not null default 'fixture',add column prescription_id bigint,add column created_at timestamptz not null default now();
 alter table cabinet_moves add column expiry date,add column purpose text,add column patient_id bigint,add column patient_name text,add column memo text,add column diff integer,add column created_at timestamptz not null default now();
 create table ledger_days(day date,clinic text,closed_at timestamptz);
 create function ledger_day_locked(d date) returns boolean language sql stable as $$select exists(select 1 from public.ledger_days where day=d and clinic=public.current_clinic() and closed_at is not null) and d<(now() at time zone 'Asia/Seoul')::date$$;
 create table clinical_fixture(id integer, prescription text, happy_call text, brew text);
 insert into clinical_fixture values(999,'preserve prescription','preserve happy call','preserve brew job');
 grant select,insert,update,delete on all tables in schema public to authenticated;
 grant usage,select on all sequences in schema public to authenticated;`);
 const tables=['cabinet_items','cabinet_moves','ledger_codes','ledger_entries','ledger_items'];
 const snapshot=async()=>{const result={};for(const t of tables)result[t]=(await q('select * from '+t+' order by id')).rows;return result;};
 const migration=await readFile(path.join(root,'supabase/schema-v21-ledger-edit-inventory.sql'),'utf8');
 const before=await snapshot();await db.exec(migration);
 await test('V21 migration preserves every original inventory and ledger row',async()=>eq(await snapshot(),before));
 await as('S');
 const addItem=async(name,kind,clinic,unit)=> (await q('insert into cabinet_items(name,kind,clinic,unit) values($1,$2,$3,$4) returning id',[name,kind,clinic,unit])).rows[0].id;
 const med=await addItem('edit 소합원','medicine',null,'개');
 const insured=await addItem('edit 삼소음 S','insured','S','포');
 for(const id of [med,insured])await q("insert into cabinet_moves(item_id,kind,qty,staff_name) values($1,'in',100,'fixture')",[id]);
 await as('N');const foreign=await addItem('edit 삼소음 N','insured','N','포');await as('S');
 const create=async()=> (await q("insert into ledger_entries(patient_name,staff_name) values('synthetic only','fixture') returning id")).rows[0].id;
 const version=async id=>(await q('select updated_at::text rev from ledger_entries where id=$1',[id])).rows[0]?.rev;
 const stock=async id=>Number((await q("select coalesce(sum(case when kind='in' then qty when kind in ('out','discard') then -qty else 0 end),0) n from cabinet_moves where item_id=$1",[id])).rows[0].n);
 const patch={patient_name:'synthetic only',insurance_kind:'보험',cash:0,cash_receipt:0,card:0,memo:'memo preserved',red_fields:[],off_total:false,pay_note:null};
 const item=(raw,id,group='cabinet',qty=1,days=null)=>({raw,code:raw,name:raw,group,qty,amount:null,days,split:null,cabinet_item_id:id,per_day:group==='extract'?3:null,unknown:false,free:false});
 const edit=async(id,items,note,expected,extra={})=>q('select public.edit_ledger_entry_v21($1,$2,$3::jsonb,$4,$5::jsonb,false,$6)',[id,expected??await version(id),JSON.stringify({...patch,...extra}),note,items===null?null:JSON.stringify(items),'fixture editor']);
 let main;let baseline;
 await test('edit adds medicine and insured days, retaining the original ledger identity',async()=>{
  main=await create();baseline=[await stock(med),await stock(insured)];
  await edit(main,[item('소합원2T',med,'cabinet',2),item('삼소음2일',insured,'extract',1,2)],'소합원2T,삼소음2일');
  eq([await stock(med),await stock(insured)],[baseline[0]-2,baseline[1]-6]);
  eq((await q('select id from ledger_entries where id=$1',[main])).rows.length,1);
  eq((await q('select count(*)::int n from ledger_items where entry_id=$1 and cabinet_move_id is not null',[main])).rows[0].n,2);
 });
 await test('same note repeated or money-only edit never deducts twice and preserves item ids',async()=>{
  const rows=(await q('select * from ledger_items where entry_id=$1 order by id',[main])).rows;
  const moves=(await q('select * from cabinet_moves order by id')).rows;
  await edit(main,[item('소합원2T',med,'cabinet',2),item('삼소음2일',insured,'extract',1,2)],'소합원2T,삼소음2일');
  await edit(main,null,'소합원2T,삼소음2일',undefined,{card:1234});
  eq((await q('select * from ledger_items where entry_id=$1 order by id',[main])).rows,rows);
  eq((await q('select * from cabinet_moves order by id')).rows,moves);
 });
 await test('quantity edits reverse the original actual pack count and apply the new quantity',async()=>{
  const old=(await q('select * from cabinet_moves order by id')).rows;
  await edit(main,[item('소합원5T',med,'cabinet',5),item('삼소음1일',insured,'extract',1,1)],'소합원5T,삼소음1일');
  eq([await stock(med),await stock(insured)],[baseline[0]-5,baseline[1]-3]);
  for(const row of old)eq((await q('select * from cabinet_moves where id=$1',[row.id])).rows,[row]);
 });
 await test('removing stock tokens returns stock but never deletes the ledger row or move history',async()=>{
  await edit(main,[],'');eq([await stock(med),await stock(insured)],baseline);
  eq((await q('select count(*)::int n from ledger_items where entry_id=$1',[main])).rows[0].n,0);
  eq((await q('select count(*)::int n from ledger_entry_edits_v21 where original_entry_id=$1 and operation='entry_update'',[main])).rows[0].n,5);
 });
 await test('foreign clinic item in a later token rolls back all earlier stock and entry changes',async()=>{
  const id=await create();const before=await snapshot();const audit=(await q('select * from ledger_entry_edits_v21 order by id')).rows;
  await reject(()=>edit(id,[item('소합원7',med,'cabinet',7),item('foreign2일',foreign,'extract',1,2)],'invalid'),/사용할 수 없는/);
  eq(await snapshot(),before);eq((await q('select * from ledger_entry_edits_v21 order by id')).rows,audit);
 });
 await test('stale/double-submit revisions cannot create duplicate movements',async()=>{
  const id=await create(),rev=await version(id),start=await stock(med);
  await edit(id,[item('소합원1',med)],'소합원1',rev);
  await reject(()=>edit(id,[item('소합원1',med)],'소합원1',rev),/다른 변경/);eq(await stock(med),start-1);
 });
 await test('unchanged linked prescription tokens and clinical workflows are retained; deleting them is blocked',async()=>{
  const id=await create();await q('insert into ledger_items(entry_id,code,name,"group",qty,raw,prescription_id) values($1,\'보험\',\'보험\',\'decoction\',1,\'보험\',999)',[id]);
  const original=(await q('select * from ledger_items where entry_id=$1',[id])).rows[0];
  const clinical=(await q('select * from clinical_fixture')).rows;
  const herb=item('보험',null,'decoction');await edit(id,[herb,item('소합원1',med)],'보험,소합원1');
  eq((await q('select * from ledger_items where id=$1',[original.id])).rows,[original]);eq((await q('select * from clinical_fixture')).rows,clinical);
  const before=await snapshot();await reject(()=>edit(id,[item('소합원1',med)],'소합원1'),/처방·약대장/);eq(await snapshot(),before);
 });
 await test('unmatched new decoctions, missing insured days and refunded rows fail without stock changes',async()=>{
  for(const tokens of [[item('새탕약',null,'decoction')],[item('삼소음',insured,'extract')]]){const id=await create(),before=await snapshot();await reject(()=>edit(id,tokens,'bad'),/탕약 처방|일수를/);eq(await snapshot(),before);}
  for (const kind of ['refund','correction']) { const id=await create();await q("insert into ledger_entries(kind,corrects_id,patient_name,staff_name) values($1,$2,'fixture','fixture')",[kind,id]);const before=await snapshot();await reject(()=>edit(id,[item('소합원1',med)],'x'),/환불·정정이 연결/);eq(await snapshot(),before); }
 });
 await test('duplicate tokens are a multiset, and free items retain service purpose',async()=>{
  const id=await create(),start=await stock(med),one=item('소합원1(F)',med);one.free=true;
  await edit(id,[one,one],'소합원1(F),소합원1(F)');eq(await stock(med),start-2);
  await edit(id,[one],'소합원1(F)');eq(await stock(med),start-1);
  eq((await q('select m.purpose from ledger_items i join cabinet_moves m on m.id=i.cabinet_move_id where i.entry_id=$1',[id])).rows,[{purpose:'service'}]);
 });
 await test('closed past days, foreign ledger rows, unmapped and anonymous callers are denied',async()=>{
  const id=await create(),rev=await version(id);await admin();await q("update ledger_entries set day=(now() at time zone 'Asia/Seoul')::date-2 where id=$1",[id]);await q('insert into ledger_days select day,clinic,now() from ledger_entries where id=$1',[id]);await as('S');await reject(()=>edit(id,[],'',rev),/마감된 지난/);
  const own=await create(),ownRev=await version(own);await as('N');await reject(()=>edit(own,[],'',ownRev),/접근할 수 없는/);
  await as(null);await reject(()=>edit(own,[],'',ownRev),/병원·처리자/);
  await admin();await db.exec('set role anon');await reject(()=>edit(own,[],'',ownRev),'permission denied');await as('S');
 });
 await test('audit records preserve before/after and are append-only with clinic separation',async()=>{
  eq((await q('select * from ledger_entry_edits_v21 where original_entry_id=$1 and operation='entry_update'',[main])).rows.length,5);
  await reject(()=>q("insert into ledger_entry_edits_v21(original_entry_id,clinic,staff_name,before_entry,before_items,after_entry,after_items) values(999,'S','forged','{}','[]','{}','[]')"),'permission denied');
  await reject(()=>q('delete from ledger_entry_edits_v21'),'permission denied');await reject(()=>q("update ledger_entry_edits_v21 set staff_name='x'"),'permission denied');
  await as('N');eq((await q('select id from ledger_entry_edits_v21')).rows,[]);await as('S');
 });
 await test('V21 is re-runnable and preserves existing audit plus all ledger/inventory rows',async()=>{
  await admin();const before=await snapshot(),history=(await q('select * from ledger_entry_edits_v21 order by id')).rows;await db.exec(migration);eq(await snapshot(),before);eq((await q('select * from ledger_entry_edits_v21 order by id')).rows,history);
 });
 await test('unchanged archived or newly unknown tokens preserve exact old links/quantities',async()=>{await as('S');const id=await create();await edit(id,[item('소합원3T',med,'cabinet',3)],'소합원3T');const oldRows=(await q('select * from ledger_items where entry_id=$1 order by id',[id])).rows,oldMoves=(await q('select * from cabinet_moves order by id')).rows;const unknown=item('소합원3T',null,'other',1);unknown.unknown=true;await edit(id,[unknown],'소합원3T');eq((await q('select * from ledger_items where entry_id=$1 order by id',[id])).rows,oldRows);eq((await q('select * from cabinet_moves order by id')).rows,oldMoves);});
 await test('legacy production without red_fields supports atomic edits without schema/data conversion',async()=>{await admin();await db.exec('alter table ledger_entries drop column red_fields');await as('S');const id=await create(),start=await stock(med);await edit(id,[item('소합원1',med)],'소합원1');eq(await stock(med),start-1);});

}
