-- V11 (2026-11-09): A new/unmapped login must not fall back to clinic S.
begin;
create or replace function public.current_clinic() returns text
language sql stable security definer set search_path='' as $$
  select clinic from public.clinic_accounts where user_id=auth.uid();
$$;
revoke all on function public.current_clinic() from public, anon;
grant execute on function public.current_clinic() to authenticated, service_role;

-- Shared resources are shared between the TWO mapped clinics, not every auth user.
do $$ declare t text; begin
  foreach t in array array['brew_jobs','brew_weekday_rules','cabinet_items'] loop
    execute format('drop policy if exists auth_all on public.%I',t);
    execute format('create policy auth_all on public.%I for all to authenticated using (public.current_clinic() is not null) with check (public.current_clinic() is not null)',t);
  end loop;
end $$;
drop policy if exists auth_read on public.cabinet_moves;
drop policy if exists auth_insert on public.cabinet_moves;
create policy auth_read on public.cabinet_moves for select to authenticated using (public.current_clinic() is not null);
create policy auth_insert on public.cabinet_moves for insert to authenticated with check (public.current_clinic() is not null);

notify pgrst, 'reload schema';
commit;
