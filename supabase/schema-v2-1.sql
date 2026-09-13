-- V2-1 해피콜 환자 관리
create table if not exists public.patients (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null unique,
  family_phone text,
  family_note text,
  condition text not null check (condition in ('digestive','skin','general')),
  memo text,
  excluded_at timestamptz,
  excluded_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.prescriptions (
  id bigint generated always as identity primary key,
  patient_id bigint not null references public.patients(id) on delete cascade,
  receive_date date not null,
  days int not null check (days > 0),
  memo text,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.happy_calls (
  id bigint generated always as identity primary key,
  prescription_id bigint not null references public.prescriptions(id) on delete cascade,
  round int not null check (round in (1,2)),
  due_date date not null,
  auto_due_date date not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','contacted','closed')),
  missed_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_logs (
  id bigint generated always as identity primary key,
  happy_call_id bigint not null references public.happy_calls(id) on delete cascade,
  action text not null check (action in ('contacted','missed','represcribed','excluded','rescheduled')),
  channel text check (channel in ('phone','kakao','sms')),
  memo text,
  staff_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists happy_calls_due_idx on public.happy_calls (status, due_date);
create index if not exists prescriptions_patient_idx on public.prescriptions (patient_id);

alter table public.patients enable row level security;
alter table public.prescriptions enable row level security;
alter table public.happy_calls enable row level security;
alter table public.contact_logs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['patients','prescriptions','happy_calls','contact_logs'] loop
    execute format('drop policy if exists "auth_all" on public.%I', t);
    execute format('create policy "auth_all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
