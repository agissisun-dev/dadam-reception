-- V2-1b: 처방을 포 수로 입력 (일수는 계산값)
alter table public.prescriptions
  add column if not exists packs int check (packs > 0),
  add column if not exists per_day int check (per_day > 0);
