@AGENTS.md

# 다담 접수실 앱 — 프로젝트 규칙

## 이 앱이 무엇인가
- 노원 다담한의원 **접수실용** 웹앱. 쓰는 사람은 접수실 2명 + 원장 부부(김경태·김선민). 사용자(구디)가 병원 운영자다.
- 로그인은 **공용 계정 하나**(dadamn1@naver.com, Supabase Auth). 앱 안에 가입 화면 없음. 완료·처리 때 이름을 고른다: 박정희샘 · 실장님 · 이혜경샘 (`lib/staff.ts`).
- 화면: 첫 화면(한 달 달력 + 기한 지난 일 + 고른 날의 업무·해피콜·주간 관리, `components/MonthCalendar.tsx` · `lib/calendarRules.ts`) / 해피콜 / 주간 관리 / 환자 / 문구 틀 / 업무 등록 / 지난 기록 / 현황(`app/stats`, 월별 신규·처방·재처방·포 수와 해피콜 제때 처리. 금액 칸은 안 넣기로 함 → 포 수가 매출 대용).
- 프로덕션 https://dadam-reception.vercel.app (Vercel 팀 dadamn1), Supabase 프로젝트 `dadam-reception` (ref vrwxpmhrpqqdivegktgg), GitHub https://github.com/agissisun-dev/dadam-reception (공개, 환자 정보 없음).
- 데이터는 Supabase 하나에 있어서 접수실·원장실 어느 PC에서 열어도 같은 내용이다. 화면은 열 때 불러오므로 새로고침하면 최신.

## 확정된 업무 규칙 (바꾸려면 사용자에게 먼저 확인)
- **처방 단위는 포 수.** 하루 2포 기본, 20·35·40·70포가 보통(의보첩약). 일수 = 올림(포 수 ÷ 하루 포수). `lib/packs.ts`
- **해피콜은 처방마다 두 번.** 기준은 약 수령 예정일. 1차 = 수령 +7일(복약 불편 확인), 2차 = 수령 + 일수 − 3일(남은 탕약·예약). 처방 12일 이하면 +7일 한 번만. `lib/happyCallRules.ts`
- **주간 관리**는 원장이 지정한 환자만, 접수실이 환자 상세에서 켠다. 기본 화요일, 회차는 4까지(이후 4주차 반복), 자동 휴면 없음(무응답 4주 배지만). `lib/weeklyRules.ts`
- **문구 틀은 공통 3개**: 첫 발송(round 1, 복약 불편 확인) · 그다음(round 2, 남은 탕약 확인·예약 안내) · 내원 안내(round null, 4회째부터). 해피콜 1차 → 첫 발송, 2차·단일 → 그다음. 질환×주차로 늘리지 말 것 — 사용자가 "너무 많으면 복잡"하다고 했다.
- **휴진 안내는 연휴 시작 2주 전**, 달력 업로드는 매월 25일, 한방파스 재고는 명절·어버이날 한 달 전. 명절 선물 안내문은 안 보낸다(틀 삭제됨).
- **문자는 화면에서 보낸다**: 해피콜·주간 관리 줄의 [문자 보내기] → `app/api/sms`(서버) → 솔라피. 자동 예약 발송은 하지 않는다(사용자 결정). **서버가 받는 번호를 그 환자의 연락처·가족 연락처와 대조해 아니면 거절하고, 모든 시도를 `sms_logs` 장부에 남긴다**(현황 화면 아래, 앱에서 수정·삭제 불가). 사적 발송 방지 — 사용자가 전자차트에서 겪은 문제. 3차 해피콜은 도입하지 않기로 함. 키는 Vercel 서버 환경 변수 `SOLAPI_API_KEY`·`SOLAPI_API_SECRET`·`SMS_SENDER_NUMBER`, 설정은 `docs/setup-sms.md`.
- 환자 구분 기준은 **연락처**. 등록 화면은 이름·연락처를 나란히 보여 주고, 11자리가 차면 자동으로 중복 확인.

## 화면 글 쓰는 법
- 접수실이 읽는 **한국어 존댓말**. 개발 용어 금지 (오류 → "저장되지 않았습니다. …", 로딩 → "불러오는 중…").
- 버튼은 행동 그대로: 연락함 · 안 받음 · 재처방·예약됨 · 연락 제외 · 발송함 · 내원해 건너뜀 · 답 없음 → 다음 주 · 휴면.
- 환자 연락처는 목록에서 가리고(`maskPhone`), 줄을 펼치면 바로 보인다(`PhoneText revealed`).
- 지난 것은 붉게 + "N일 지남". 이번 주는 날짜·요일별로 펼쳐 보인다(사용자: "하루씩만 보이면 답답").

## 반드시 확인하고 할 것
- Supabase 표 구조 변경, 로그인 방식 변경, 문구 틀 데이터 삭제·교체.
- 프로덕션에서 확인용 가짜 환자를 만들었으면 **끝나면 지운다**.
- `.env.local`, service_role·secret 키는 절대 커밋·복사하지 않는다. 앱은 anon 키만 쓴다.

## 작업 순서
1. 새 기능·동작 변경은 브레인스토밍(전역 규칙) 뒤에 시작. 설계는 `docs/superpowers/specs/`, 계획은 `plans/`, 확인 기록은 `qa/`.
2. `npx vitest run` · `npx eslint .` · `npx tsc --noEmit` 통과 → 기능 단위로 커밋(Conventional Commits, 한국어 가능).
3. 배포: `npx vercel deploy --prod --yes` → `npx vercel ls --prod`로 Ready 확인. push는 사용자가 시킬 때만.
4. 표·데이터 변경은 `supabase/schema-*.sql` 파일로 남기고 `docs/setup-supabase.md`에 절을 추가. 실행은 개발용 크롬(Claude in Chrome)의 Supabase SQL Editor에서: monaco `getModels()`로 본문 넣기 → Run → "Potential issue detected"면 Run query. 그 탭은 저장 안 된 쿼리 때문에 navigate가 막히니 새 탭으로 이동.
5. 배포 뒤 개발용 크롬에서 실제 화면 확인. React 버튼은 ref 클릭이 안 먹힐 때가 있어 좌표 클릭이나 JS `click()`을 쓴다. 로컬 미리보기는 로그인이 필요해 제 브라우저로는 못 본다.

## 코드 관습
- Next.js 16 App Router, React 19, Tailwind 4, supabase-js 2(브라우저 anon 키 + RLS authenticated), Vitest.
- 페이지는 `AuthGate` 렌더 프롭 `{() => ...}` 안에 `AppHeader` + 본문. 데이터 접근은 `lib/*.ts`, 순수 규칙은 `lib/*Rules.ts`에 두고 테스트를 붙인다.
- `react-hooks/set-state-in-effect` 피하려고 `useState(() => typeof window === "undefined" ? 기본값 : loadLastStaff())` 식 지연 초기화. `useCallback` 안에서 `todayISO()`를 직접 계산.
- 삭제는 `window.confirm`. 틀에서 시작할 때는 `key`로 폼을 다시 마운트.
- 개발 서버는 `.claude/launch.json`(포트 3000은 다른 앱이 써서 autoPort).

## 관련 파일
- 브랜드 색·글자체(홈페이지에서 읽음): `docs/design/brand.md` — 디자인 입히기는 실사용 뒤 재개하기로 함.
- 바탕화면 아이콘: `launcher/create-shortcut.ps1` (크롬 --app 모드).
- 워크숍 과제 저장소: `C:\Users\User\claude-projects\customer-view-os-workshop\05_3회차준비과제\구디\`.
