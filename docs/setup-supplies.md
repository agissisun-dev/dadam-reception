# 물품 신청함 설정 (V14, 2026-11-13)

## 1. 표 만들기 (한 번)
Supabase SQL Editor에서 `supabase/schema-v14-supplies.sql` 실행. `supply_requests`(신청 한 줄)·`supply_settings`(원장 잠금 번호)가 생긴다. 기존 표는 안 건드린다.

## 2. 화면 (`/supplies`, 왼쪽 메뉴 "물품 신청")
- 샘: 한 줄에 하나씩 적고 [신청]. 분류(약침·치료실 용품·병원 용품)는 앱이 나누고 줄에서 고칠 수 있다. 물건이 오면 **주문함**에서 [받음].
- 원장: 화면 위 [원장] → 잠금 번호(4자리, 처음엔 없음 → [잠금 번호 만들기]) → 가격·업체·메모·상품 주소가 보이고 [승인]·[구매 완료]를 누른다. 잠금은 브라우저 탭을 닫으면 다시 잠긴다.
- "얼마나 자주 시키는지": 품목별 횟수·평균 간격·(원장) 마지막 가격.
- 잠금 번호는 보안이 아니라 "샘들이 다 볼 필요 없는 칸"을 가리는 용도다(같은 계정으로 들어오면 표 자체는 읽을 수 있다).

## 3. 아사이드(병원 PC 에이전트)가 가격을 적어 넣는 길 — API
Vercel → Settings → Environment Variables(NEXT_PUBLIC_ 없이):

| 변수 | 값 |
|---|---|
| `SUPPLIES_API_TOKEN` | 아무 긴 임의 글자(예: 32자). 아사이드에게 같은 값을 준다. |
| `SUPPLIES_LOGIN_EMAIL` / `SUPPLIES_LOGIN_PASSWORD` | 접수실 계정(없으면 `REMINDER_LOGIN_EMAIL_S`/`_PASSWORD_S`를 그대로 쓴다) |

- `GET https://dadam-reception.vercel.app/api/supplies?status=requested,approved` → `{ rows: [{ id, text, category, status, requested_by, requested_at, price, vendor, ... }] }`
- `PATCH https://dadam-reception.vercel.app/api/supplies/<id>` 본문 `{ "price": 12000, "vendor": "쿠팡", "price_note": "3곳 중 최저. 제일한방 12,500 · 메디몰 13,000", "product_url": "https://..." }` → `{ ok: true }`
- 둘 다 헤더 `Authorization: Bearer <SUPPLIES_API_TOKEN>`.
- 아사이드는 **가격·업체·메모·주소만** 적는다. 승인·구매 완료는 원장이 화면에서 누르고, 결제도 원장이 직접 한다(앱이 카드를 쓰지 않는다).

## 4. 아사이드에게 시킬 명령문 (병원 PC에서)
아래를 그대로 붙여 넣는다. `<토큰>`만 바꾼다.

```
다담 접수실 앱의 물품 신청 목록에서 최저가를 찾아 적어 줘.

1. GET https://dadam-reception.vercel.app/api/supplies?status=requested,approved
   헤더 Authorization: Bearer <토큰>
   응답의 rows가 신청 목록이야. text가 샘이 적은 품목(예 "알콜솜 2통"), category는 yakchim(약침)·treatment(치료실 용품)·office(병원 용품).
2. price가 비어 있는(null) 줄마다, 품목을 다음 곳에서 찾아 같은 규격 기준 최저가를 고른다.
   - 약침(yakchim): 제일한방 등 평소 거래하는 약침 업체 사이트(로그인은 내가 해 둔 브라우저 프로필 사용). 다른 곳에서 사지 않는다.
   - 치료실 용품·병원 용품: 쿠팡 · 네이버 쇼핑 · 메디몰(의료 소모품) 세 곳. 배송비 포함 금액으로 비교한다.
3. 줄마다 PATCH https://dadam-reception.vercel.app/api/supplies/<id>
   헤더 Authorization: Bearer <토큰>, Content-Type: application/json
   본문 {"price": 배송비 포함 총액(원, 정수), "vendor": "업체 이름", "price_note": "비교한 곳과 금액 한 줄", "product_url": "상품 페이지 주소"}
4. 결제는 하지 않는다. 장바구니에 담아 두고, 결제 화면까지만 열어 둔 뒤 "N줄 가격 적었음, 장바구니 준비됨"이라고 알려 줘. 승인·결제는 내가 앱의 [구매 완료]와 결제 화면에서 직접 한다.
5. 못 찾은 품목은 price를 비워 두고 price_note에 "못 찾음: 이유"라고만 적어 줘.
```

## 5. 아직 안 만든 것
- 약침 [받음] → 재고현황 약침 칸 자동 입고(재고 5칸 작업과 함께).
- 아사이드가 결제까지 하는 흐름(사용자 결정: 결제 단추는 원장이 직접 누른다).
