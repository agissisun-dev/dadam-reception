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
