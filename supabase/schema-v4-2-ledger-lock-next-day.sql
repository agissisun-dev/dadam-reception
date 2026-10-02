-- V4-2 (2026-10-02): 마감한 날도 그날 밤 12시(한국 시간)까지는 고칠 수 있고, 다음 날부터 잠긴다.
-- (사용자 결정 2026-10-02: "3번으로", 마감 직후 발견한 실수는 바로 고치고 지난 날은 정정 줄로)

create or replace function public.ledger_day_locked(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ledger_days where day = d and closed_at is not null)
     and d < (now() at time zone 'Asia/Seoul')::date;
$$;

drop policy if exists "auth_insert" on public.ledger_entries;
drop policy if exists "auth_update" on public.ledger_entries;
drop policy if exists "auth_delete" on public.ledger_entries;
create policy "auth_insert" on public.ledger_entries for insert to authenticated
  with check (kind = 'correction' or not public.ledger_day_locked(day));
create policy "auth_update" on public.ledger_entries for update to authenticated
  using (not public.ledger_day_locked(day)) with check (not public.ledger_day_locked(day));
create policy "auth_delete" on public.ledger_entries for delete to authenticated
  using (not public.ledger_day_locked(day));

drop policy if exists "auth_write" on public.ledger_items;
create policy "auth_write" on public.ledger_items for all to authenticated
  using (exists (select 1 from public.ledger_entries e where e.id = entry_id and not public.ledger_day_locked(e.day)))
  with check (exists (select 1 from public.ledger_entries e where e.id = entry_id and (e.kind = 'correction' or not public.ledger_day_locked(e.day))));

drop policy if exists "auth_write" on public.ledger_expenses;
create policy "auth_write" on public.ledger_expenses for all to authenticated
  using (not public.ledger_day_locked(day)) with check (not public.ledger_day_locked(day));
