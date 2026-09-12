# 다담 접수실

노원 다담한의원 접수실의 "오늘 할 일" 앱. 명절 안내, 달력 업로드, 휴진 공지, 한방파스 재고 확인처럼 날짜가 정해진 반복 업무를 카드로 보고, 안내문을 복사해 처리한 뒤 완료 메모를 남긴다.

## 화면

| 주소 | 화면 |
|---|---|
| `/login` | 로그인 (접수실 공용 계정 하나, PC당 한 번) |
| `/` | 오늘 할 일 — 기한 지난 일, 오늘 할 일, 다가오는 일 7일 |
| `/tasks/new` | 업무 등록 — 제목, 할 날짜, 안내문 |
| `/tasks/번호` | 업무 상세 — 안내문 복사, 완료 처리(처리한 사람 이름 + 메모), 완료 취소, 수정, 삭제 |
| `/history` | 지난 기록 — 누가 언제 무슨 메모로 완료했는지 |

안내문을 복사한 것만으로는 완료되지 않는다. 사람이 밖에서 일을 마친 뒤 [완료 처리]를 눌러야 한다.

## 기술

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL + Auth, RLS) · Vercel

## 처음 실행하기

1. Supabase 준비: [docs/setup-supabase.md](docs/setup-supabase.md)
2. `.env.local` 작성: `.env.local.example`을 복사해 두 값을 채운다
3. 설치와 실행

```bash
npm install
npm run dev
```

## 검사

```bash
npm test        # 단위 테스트 (날짜 분류, 입력 검증, 이름 목록)
npm run lint
npm run build
```

## 문서

- 설계: [docs/superpowers/specs/2026-09-11-접수실-반복업무카드-v1-design.md](docs/superpowers/specs/2026-09-11-접수실-반복업무카드-v1-design.md)
- 구현 계획: [docs/superpowers/plans/2026-09-11-접수실-반복업무카드-v1.md](docs/superpowers/plans/2026-09-11-접수실-반복업무카드-v1.md)
- 기획안 원문: [docs/01_다담_접수실앱_기획안_원문.md](docs/01_다담_접수실앱_기획안_원문.md)
- 젬마 추천 범위: [docs/02_젬마추천_버전1_버전2.md](docs/02_젬마추천_버전1_버전2.md)

## 다음 (V2)

주간 환자 관리 문자 (발송함 · 내원해 건너뜀 · 안 받음 → 다음 주 재시도 · 연락 제외), 그 뒤 재내원 문자 (탕약 나간 날 기준).
