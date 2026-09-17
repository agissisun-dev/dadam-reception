/**
 * 오늘 할 일(기한 지난 것 포함)을 다 마쳤을 때 축하 화면을 띄울지 정한다.
 * - 오늘 남은 일이 0이어야 한다.
 * - 직전에 본 남은 일 수가 0보다 컸어야 한다. 아무 일도 없던 날은 안 띄운다.
 * - 횟수 제한 없음: 완료 취소나 새 업무로 일이 다시 생겼다가 또 0이 되면 또 띄운다 (사용자 결정 2026-09-18).
 *   그래서 띄운 뒤에는 "마지막으로 본 수"를 0으로 되돌려 둬야 새로고침마다 뜨지 않는다.
 */
export function shouldCelebrate(input: {
  openNow: number;
  lastSeenOpen: number | null; // 직전에 본 남은 일 수. 오늘 처음이면 null
}): boolean {
  if (input.openNow !== 0) return false;
  return (input.lastSeenOpen ?? 0) > 0;
}

export const CELEBRATION_MESSAGES = [
  "오늘 할 일을 모두 마쳤습니다. 수고하셨습니다!",
  "오늘도 빠짐없이 챙기셨네요. 멋집니다!",
  "다 끝났습니다. 따뜻한 차 한 잔 하세요!",
  "오늘 덕분에 환자분들과 병원 일을 잘 챙겼습니다. 고맙습니다!",
] as const;

export function pickMessage(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return CELEBRATION_MESSAGES[h % CELEBRATION_MESSAGES.length];
}
