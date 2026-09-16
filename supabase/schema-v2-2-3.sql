-- V2-2 안내문 틀 · V2-3 주간 환자 관리

create table if not exists public.templates (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('task','weekly')),
  name text not null,
  title text,
  body text not null default '',
  date_rule text,
  condition text check (condition in ('digestive','skin','general')),
  round int check (round between 1 and 4),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patients
  add column if not exists weekly_status text not null default 'off' check (weekly_status in ('off','active','dormant')),
  add column if not exists weekly_weekday int not null default 2 check (weekly_weekday between 0 and 6),
  add column if not exists weekly_interval int not null default 1 check (weekly_interval > 0),
  add column if not exists weekly_round int not null default 1 check (weekly_round > 0),
  add column if not exists weekly_next_date date,
  add column if not exists weekly_started_at date;

create table if not exists public.weekly_contacts (
  id bigint generated always as identity primary key,
  patient_id bigint not null references public.patients(id) on delete cascade,
  round int not null,
  planned_date date not null,
  action text not null check (action in ('sent','skipped_visited','no_reply','dormant','excluded')),
  message text,
  patient_reply text,
  reply_status text not null default 'none' check (reply_status in ('none','waiting_doctor','reviewed')),
  doctor_note text,
  staff_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists weekly_contacts_patient_idx on public.weekly_contacts (patient_id, created_at desc);
create index if not exists weekly_contacts_reply_idx on public.weekly_contacts (reply_status);
create index if not exists patients_weekly_idx on public.patients (weekly_status, weekly_next_date);

alter table public.templates enable row level security;
alter table public.weekly_contacts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['templates','weekly_contacts'] loop
    execute format('drop policy if exists "auth_all" on public.%I', t);
    execute format('create policy "auth_all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 초기 문구 (접수실이 앱에서 고쳐 씀). 이미 있으면 넣지 않는다.
insert into public.templates (kind, name, title, body, date_rule, sort_order)
select * from (values
  ('task', '추석 휴진 안내', '추석 연휴 휴진 공지 (홈페이지·네이버 플레이스·카카오 채널)',
   E'안녕하세요, 노원 다담한의원입니다.\n추석 연휴 기간 [9월 24일(목)~9월 27일(일)]은 휴진하며, [9월 28일(월)]부터 정상 진료합니다.\n연휴 전 탕약이 필요하신 분은 미리 말씀해 주세요. 풍성한 한가위 보내세요.\n\n처리 순서: 1) 홈페이지 공지 → 2) 네이버 플레이스 휴무일 설정 → 3) 카카오 채널 게시',
   '연휴 시작 2주 전', 1),
  ('task', '설 휴진 안내', '설 연휴 휴진 공지 (홈페이지·네이버 플레이스·카카오 채널)',
   E'안녕하세요, 노원 다담한의원입니다.\n설 연휴 기간 [날짜]은 휴진하며, [날짜]부터 정상 진료합니다.\n연휴 전 탕약이 필요하신 분은 미리 말씀해 주세요. 새해 복 많이 받으세요.\n\n처리 순서: 1) 홈페이지 공지 → 2) 네이버 플레이스 휴무일 설정 → 3) 카카오 채널 게시',
   '연휴 시작 2주 전', 2),
  ('task', '다음 달 달력 업로드', '[N]월 달력 카카오 채널 업로드',
   E'다음 달 진료 달력 이미지를 카카오 채널에 올립니다.\n1) 원장님께 다음 달 휴진일 확인 → 2) 달력 이미지 수정 → 3) 카카오 채널 게시 → 4) 홈페이지 진료시간 확인',
   '매월 25일 (휴진이면 그 전 진료일)', 3),
  ('task', '한방파스 재고 확인', '한방파스 재고 확인 ([명절] 선물용)',
   E'연휴 전후 3일간 내원 환자 1인 1개 배포.\n필요 수량 = 하루 내원 수 × 3일 + 여유분.\n현재 재고를 세고 부족분은 발주. 발주처와 수량을 완료 메모에 남깁니다.',
   '명절·어버이날 한 달 전', 4),
  ('task', '명절 선물 안내문', '[명절] 선물 안내문 발송',
   E'안녕하세요, 노원 다담한의원입니다.\n[명절]을 맞아 연휴 전후 내원하시는 분께 한방파스를 드립니다. 건강하고 편안한 명절 보내세요.',
   '명절 4주 전, 1주 전', 5)
) as v(kind, name, title, body, date_rule, sort_order)
where not exists (select 1 from public.templates where kind = 'task');

insert into public.templates (kind, name, body, condition, round, sort_order)
select * from (values
  ('weekly', '소화기 1주차', E'안녕하세요, 노원 다담한의원입니다. 지난 진료 후 한 주가 지났는데 식사 후 더부룩함이나 속쓰림은 어떠신가요? 이번 주 드신 식단 한두 끼만 알려 주시면 원장님이 확인해 드립니다.', 'digestive', 1, 11),
  ('weekly', '소화기 2주차', E'안녕하세요, 다담한의원입니다. 두 번째 주입니다. 지난주보다 소화가 편해지셨는지, 아직 불편한 시간대(아침·저녁)가 있는지 알려 주세요. 야식이나 밀가루 드신 날이 있으면 함께 적어 주시면 좋습니다.', 'digestive', 2, 12),
  ('weekly', '소화기 3주차', E'안녕하세요, 다담한의원입니다. 3주째입니다. 대변 상태와 식후 피로감은 어떠신가요? 식단은 잘 지켜지고 계신지, 어려운 점이 있으면 편하게 말씀해 주세요.', 'digestive', 3, 13),
  ('weekly', '소화기 4주차', E'안녕하세요, 다담한의원입니다. 한 달이 되었습니다. 처음과 비교해 어느 정도 나아지셨는지 알려 주시면, 원장님이 다음 단계를 잡아 드립니다. 한 번 내원해 확인받으시길 권합니다.', 'digestive', 4, 14),
  ('weekly', '피부 1주차', E'안녕하세요, 노원 다담한의원입니다. 지난 진료 후 한 주가 지났는데 가려움이나 붉은 정도가 어떠신가요? 가능하시면 같은 부위 사진 한 장 보내 주시면 원장님이 확인해 드립니다.', 'skin', 1, 21),
  ('weekly', '피부 2주차', E'안녕하세요, 다담한의원입니다. 두 번째 주입니다. 지난주 사진과 비교해 보려 하니 같은 자리, 같은 밝기에서 사진 한 장 부탁드립니다. 밤에 가려워 깨는 날이 있는지도 알려 주세요.', 'skin', 2, 22),
  ('weekly', '피부 3주차', E'안녕하세요, 다담한의원입니다. 3주째입니다. 새로 올라온 곳이 있는지, 가라앉은 곳이 있는지 사진과 함께 알려 주세요. 세안·보습은 안내드린 대로 하고 계신지요.', 'skin', 3, 23),
  ('weekly', '피부 4주차', E'안녕하세요, 다담한의원입니다. 한 달이 되었습니다. 처음 사진과 지금을 비교해 원장님이 다음 방향을 잡아 드리려 합니다. 한 번 내원해 직접 확인받으시길 권합니다.', 'skin', 4, 24),
  ('weekly', '일반 1주차', E'안녕하세요, 노원 다담한의원입니다. 지난 진료 후 한 주가 지났는데 몸 상태는 어떠신가요? 불편한 점이 있으면 편하게 말씀해 주세요.', 'general', 1, 31),
  ('weekly', '일반 2주차', E'안녕하세요, 다담한의원입니다. 두 번째 주입니다. 지난주보다 나아진 점과 아직 남은 불편을 한 줄씩만 알려 주세요.', 'general', 2, 32),
  ('weekly', '일반 3주차', E'안녕하세요, 다담한의원입니다. 3주째입니다. 수면과 컨디션은 어떠신지요. 생활에서 지키기 어려운 것이 있으면 말씀해 주세요.', 'general', 3, 33),
  ('weekly', '일반 4주차', E'안녕하세요, 다담한의원입니다. 한 달이 되었습니다. 원장님이 경과를 직접 확인하고 다음 단계를 잡아 드리려 합니다. 한 번 내원하시길 권합니다.', 'general', 4, 34),
  ('weekly', '공통 내원 안내', E'안녕하세요, 노원 다담한의원입니다. 원장님이 직접 보시고 방향을 잡아 드리는 게 좋겠습니다. 편하신 요일과 시간을 알려 주시면 예약 잡아 드리겠습니다.', null, null, 40)
) as v(kind, name, body, condition, round, sort_order)
where not exists (select 1 from public.templates where kind = 'weekly');
