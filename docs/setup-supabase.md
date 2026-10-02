# Supabase 준비 순서 (원장님이 직접 하는 부분)

## 1. 새 프로젝트 만들기
1. https://supabase.com 로그인 → [New project]
2. 이름: `dadam-reception`, 지역: Northeast Asia (Seoul), 데이터베이스 비밀번호는 아무거나 정해 메모
3. 만들어질 때까지 1~2분 기다림

## 2. 표(테이블) 만들기
1. 왼쪽 메뉴 [SQL Editor] → [New query]
2. 이 저장소의 `supabase/schema.sql` 내용을 전부 붙여넣고 [Run]
3. 왼쪽 메뉴 [Table Editor]에 `tasks` 표가 보이면 성공

## 3. 접수실 공용 계정 만들기 (하나만)
1. 왼쪽 메뉴 [Authentication] → [Users] → [Add user] → [Create new user]
2. 이메일(예: reception@dadam.kr 처럼 실제로 안 써도 되는 주소)과 비밀번호 입력. "Auto Confirm User"를 켠다
3. 계정은 이것 하나입니다. 각 PC에서 처음 한 번만 로그인하면 브라우저가 기억합니다. 누가 처리했는지는 완료할 때 이름을 골라 남깁니다

## 4. 앱에 연결 정보 넣기
1. [Project Settings] → [API]
   - Project URL 복사 → `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`
   - "anon public" 키(또는 Publishable key) 복사 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret 키는 쓰지 않습니다.**
2. 저장소 루트에 `.env.local` 파일을 만들고 위 두 줄을 넣는다. (`.env.local.example` 참고)

## 5. 실제 첫 데이터 넣기 (선택)
- [SQL Editor]에서 `supabase/seed.sql`을 실행하면 업무 4건이 들어간다.
- 4번째(추석 한방파스)의 `completed_by`는 실제 접수실 계정 이메일로 바꿔도 된다.

## 6. 확인
- [Table Editor] → `tasks`에 행이 보이면 과제 3의 "Table Editor에서 행 확인"이 된 것. 이 화면을 캡처한다.

## 7. V2-1 해피콜 표 만들기 (2026-09-13 추가)
1. [SQL Editor] → [New query]
2. `supabase/schema-v2-1.sql` 내용을 붙여넣고 [Run]
3. [Table Editor]에 `patients`, `prescriptions`, `happy_calls`, `contact_logs` 네 표가 보이면 성공

## 8. V2-1b 처방 포 수 칸 추가 (2026-09-13 추가, 실행 완료)
- [SQL Editor]에서 `supabase/schema-v2-1b.sql` 실행. `prescriptions` 표에 `packs`, `per_day` 칸이 생긴다.

## 9. V2-2·V2-3 문구 틀·주간 관리 표 (2026-09-13 추가)
- [SQL Editor]에서 `supabase/schema-v2-2-3.sql` 실행. `templates`, `weekly_contacts` 표와 `patients`의 주간 관리 칸 6개가 생기고, 초기 문구 18개가 들어간다.

## 10. V2-4 주간 관리 문구 3개로 줄이기 (2026-09-16 추가)
- [SQL Editor]에서 `supabase/schema-v2-4-weekly-templates.sql` 실행. 주간 관리 문구 13개가 지워지고 공통 3개(복약 불편 확인 · 남은 탕약 확인·예약 안내 · 내원 안내)가 들어간다.
- 앱 코드는 실행 전에도 돌아간다. 다만 실행 전에는 옛 13개 문구가 그대로 보인다.

## 11. V3-4 문자 발송 장부 (2026-09-18 추가)
- [SQL Editor]에서 `supabase/schema-v3-4-sms-logs.sql` 실행. `sms_logs` 표가 생긴다. 문자 시도는 성공·실패 모두 여기 남고, 앱에서는 고치거나 지울 수 없다.
- 서버는 받는 번호가 그 환자의 연락처나 가족 연락처와 같을 때만 보낸다. 장부는 [현황] 화면 아래에서 본다.

## 12. V3-5 휴진일에 걸린 기존 예정일 옮기기 (2026-09-22 실행 완료)
- `supabase/schema-v3-5-shift-existing-dates.sql`: 휴진일 규칙(`lib/holidays.ts`)이 생기기 전에 잡힌 해피콜·주간 관리·업무 날짜 중 2026-09-22~12-31 사이 휴진일에 걸린 것을 그 전 진료일로 당겼다(24·25·26·27일 → 23일 등). 새로 잡히는 날짜는 앱이 알아서 옮기므로 다시 실행할 일은 없다.

## 13. V3-6 약장 (2026-09-28 추가)
- [SQL Editor]에서 `supabase/schema-v3-6-cabinet.sql` 실행. `cabinet_items`(품목 9개 seed)와 `cabinet_moves`(장부, 넣기만 가능) 표가 생긴다.

## 14. V3-7 약장 용품 구분 (2026-09-28 추가)
- [SQL Editor]에서 `supabase/schema-v3-7-cabinet-supply.sql` 실행. 품목 구분에 `supply`(용품)가 허용되고 핫팩이 들어간다.

## 15. V3-8 약장 품목 정리 (2026-09-29, 접수실 요청)
- `supabase/schema-v3-8-cabinet-items-0929.sql`: 카밍젤 → 카밍젤 150ml, 카밍젤 500ml·아젤라산·커버밤 추가. 품목 추가·이름 바꾸기는 앱 [약장 → 품목 관리]에서도 된다.

## 16. V3-9 약장에 한방파스 (2026-09-29)
- `supabase/schema-v3-9-cabinet-pas.sql`: 리뷰 증정(일반 환자 파스 1장)을 약장에서 기록하려고 용품에 한방파스 추가.

## 17. V4 수납 장부 (2026-10-02)
- `supabase/schema-v4-ledger.sql`: 엑셀 일일매출장부를 앱으로 옮기는 표 5개 — `ledger_codes`(약어 사전) · `ledger_days`(하루 마감) · `ledger_entries`(환자 줄, 정정 줄 포함) · `ledger_items`(줄 안의 항목) · `ledger_expenses`(지출). `prescriptions.ledger_entry_id` 열 추가.
- 마감된 날은 RLS가 잠근다(`ledger_day_closed(day)` 함수). 마감 뒤엔 정정 줄(`kind='correction'`)만 넣을 수 있고, 마감 되돌리기는 없다.
- 약어 초안 31개가 들어간다. 뜻·묶음·약장 품목 연결은 앱 [오늘 장부 → 약어 표 고치기]에서 바꾼다. 공진단은 대보·사향 둘이라 어느 품목으로 뺄지 거기서 고른다.
- 설계: `docs/superpowers/specs/2026-10-02-수납장부-v4-design.md`.

## 18. V4-1 장부 줄 "합계에서 빼기" (2026-10-02, 실행 완료)
- `supabase/schema-v4-1-ledger-offtotal.sql`: `ledger_entries.off_total`(붉은 금액, 그날 합계에서 뺌)·`pay_note`(제로페이·서울페이·계좌입금·기타). 접수실에 돈은 없지만 현금영수증은 끊는 줄.

## 21. V6 병원 칸 — 다담에스·노원다담 한 앱 (2026-10-02, 실행 완료 — 사용자가 직접 실행, accounts 1 · clinic_policies 21)
- `supabase/schema-v6-clinic.sql`: `clinic_accounts`(로그인 계정 → 병원 S/N, 지금 계정은 S) · `current_clinic()` 함수 · 병원별 표(환자·처방·해피콜·연락 기록·주간 관리·업무·문구 틀·약어 표·장부·문자 장부·약대장)에 `clinic` 칸(기본값 = 로그인한 병원, 기존 줄은 S) · 병원별 표의 RLS를 "자기 병원 것만"으로 교체 · 장부 마감 기본키를 (clinic, day)로, 장부 번호·약어 표 유일 조건에 clinic 추가.
- 약대장(`brew_jobs`)·요일 기준·약장은 두 병원 공통(정책 그대로). 약대장은 `clinic` 칸을 색 구분에만 쓴다.
- 실행 전에는 앱이 모두 다담에스로 동작한다(함수가 없으면 S로 봄). 실행 뒤 노원 계정을 만들면 `insert into clinic_accounts (user_id, clinic) select id, 'N' from auth.users where email = '<노원 계정>'`.
- 설계 배경: 약대장·약장·(앞으로) 약재 재고는 두 병원 합산, 오늘 장부·해피콜·예약은 병원마다 따로.

## 20. V5 약대장 (2026-10-02, 실행 완료)
- `supabase/schema-v5-brew.sql`: `brew_jobs`(약대장 한 칸: 달이는 날·오전/오후·종류·이름·받는 방법·지역·파우치·분할·끝남·받는 날·처방/장부 줄 연결·발효 짝) · `brew_weekday_rules`(요일별 메모·한도, 초기값 월 지방택배 마감/4 … 토 노원구만 2개 이상/2). `prescriptions.brew_day`·`delivery` 열 추가. 잠그지 않는다(일정은 자주 옮기므로).
- 설계: `docs/superpowers/specs/2026-10-02-약대장-v5-design.md`.

## 19. V4-2 마감 잠금은 다음 날부터 (2026-10-02, 실행 완료)
- `supabase/schema-v4-2-ledger-lock-next-day.sql`: `ledger_day_locked(day)` = 마감했고 그 날짜가 한국 시간 오늘보다 앞일 때. 정책을 이 함수로 바꿈. 마감 당일은 고칠 수 있고 다음 날부터 정정 줄만.
