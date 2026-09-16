# 다담한의원 브랜드 재료 (홈페이지에서 읽어 옴, 2026-09-16)

출처: https://dadamclinic.com/ 의 CSS 변수와 화면. 앱에 디자인을 입힐 때 이 값을 기준으로 맞춘다.

## 색

| 역할 | 값 | 홈페이지 변수 |
|---|---|---|
| 바탕 | `#fcfbfa` | --clr-bg |
| 테두리 | `#f5f2ed` / 진한 것 `#e8e2d9` | --clr-border / --clr-border-dark |
| 글자 (주) | `#2b3036` | --clr-txt-main |
| 글자 (보조) | `#5a6066` / 옅은 것 `#8c9399` | --clr-txt-sub / --clr-txt-light |
| 초록 (주색) | `#16863b` / 진한 것 `#0f3d23` / 옅은 바탕 `#f0f7f3` | --clr-green* |
| 남색 (보조) | `#06478f` / 진한 것 `#06366f` / 옅은 바탕 `#f5f8fc` | --clr-navy* |
| 금색 (강조) | `#bfa37a` / 진한 것 `#a68c65` / 옅은 바탕 `#fcfaf7` | --clr-gold* |

홈페이지에서 초록은 김선민 원장(소화기·피부), 남색은 김경태 원장(척추·관절) 영역에 쓰인다.

## 글자체·모양

- 글자체: Pretendard (앱은 지금 Noto Sans KR. Pretendard로 바꾸거나 그대로 둘지 설계 때 정한다)
- 둥근 정도: 작은 것 6px, 중간 12px, 큰 것 16px
- 그림자: 아주 옅음 (`0 2px 12px rgba(15,41,74,0.02)` 등)

## 로고

- 파일: https://dadamclinic.com/wp-content/themes/blanding-khub/images/logo.png (1024×232, 93KB)
- 홈페이지 왼쪽 위에 있음. 앱에 쓰려면 파일을 받아 `public/` 에 넣어야 한다 (사용자 허락 뒤).
- 바탕화면 아이콘(`launcher/dadam.ico`)은 로고 대신 초록 바탕에 "다담" 글자로 그렸다.
