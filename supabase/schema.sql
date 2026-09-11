-- 다담 접수실 앱 V1: 접수실 업무 표
create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  title text not null,
  due_date date not null,
  guide_text text not null default '',
  status text not null default 'todo' check (status in ('todo', 'done')),
  completed_at timestamptz,
  completed_by text,
  completion_memo text,
  created_at timestamptz not null default now()
);

-- 로그인한 사용자만 읽고 쓴다. 로그인 안 한 사람(anon)은 아무것도 못 한다.
alter table public.tasks enable row level security;

drop policy if exists "authenticated_select" on public.tasks;
create policy "authenticated_select" on public.tasks
  for select to authenticated using (true);

drop policy if exists "authenticated_insert" on public.tasks;
create policy "authenticated_insert" on public.tasks
  for insert to authenticated with check (true);

drop policy if exists "authenticated_update" on public.tasks;
create policy "authenticated_update" on public.tasks
  for update to authenticated using (true) with check (true);

drop policy if exists "authenticated_delete" on public.tasks;
create policy "authenticated_delete" on public.tasks
  for delete to authenticated using (true);
