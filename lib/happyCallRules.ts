import { addDays } from "./dates";
import type { HappyCallRow } from "./types";

export const NOTE_ROUND1 = "복용 1주일. 약 드시고 불편한 점 없는지 확인";
export const NOTE_ROUND2 = "약 3일 뒤 소진. 재처방·예약 안내";
export const NOTE_SINGLE = "복용 1주일. 불편한 점 확인 + 곧 소진, 재처방·예약 안내";
export const NOTE_ROUND3 = "연락은 됐지만 재처방·예약 없음. 예약 의사 다시 확인";

/** 마지막 해피콜을 "연락함"으로 마쳤는데 재처방이 없으면 며칠 뒤 3차를 한 번 더 건다. */
export const FOLLOW_UP_DAYS = 7;

/** 이 건이 처방의 마지막 예정 해피콜인가 (2차, 또는 12일 이하 처방의 단일 건). */
export function isLastPlannedCall(call: { round: number; note: string }): boolean {
  return call.round === 2 || (call.round === 1 && call.note === NOTE_SINGLE);
}

/**
 * "연락함" 처리 뒤 만들 3차 해피콜. 마지막 예정 건을 연락했을 때만 하나 만들고,
 * 3차 자체를 연락하면 더 만들지 않는다. 재처방·예약됨으로 닫히면 markRepresc가 3차도 같이 닫는다.
 */
export function followUpAfterContact(
  call: { round: number; note: string },
  today: string,
): { round: 3; due_date: string; note: string } | null {
  if (!isLastPlannedCall(call)) return null;
  return { round: 3, due_date: addDays(today, FOLLOW_UP_DAYS), note: NOTE_ROUND3 };
}

/** 12일 이하는 한 건(+7). 그 외 1차 +7, 2차 +days-3. */
export function planHappyCalls(
  receiveDate: string,
  days: number,
): { round: 1 | 2; due_date: string; note: string }[] {
  if (days <= 12) {
    return [{ round: 1, due_date: addDays(receiveDate, 7), note: NOTE_SINGLE }];
  }
  return [
    { round: 1, due_date: addDays(receiveDate, 7), note: NOTE_ROUND1 },
    { round: 2, due_date: addDays(receiveDate, days - 3), note: NOTE_ROUND2 },
  ];
}

const byDue = (a: HappyCallRow, b: HappyCallRow) => a.due_date.localeCompare(b.due_date);

export function bucketHappyCalls(
  rows: HappyCallRow[],
  today: string,
): { today: HappyCallRow[]; upcoming: HappyCallRow[] } {
  const open = rows.filter((r) => r.status === "pending");
  const limit = addDays(today, 7);
  return {
    today: open.filter((r) => r.due_date <= today).sort(byDue),
    upcoming: open.filter((r) => r.due_date > today && r.due_date <= limit).sort(byDue),
  };
}
