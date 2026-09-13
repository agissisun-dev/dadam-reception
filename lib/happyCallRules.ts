import { addDays } from "./dates";
import type { HappyCallRow } from "./types";

export const NOTE_ROUND1 = "복용 1주일. 약 드시고 불편한 점 없는지 확인";
export const NOTE_ROUND2 = "약 3일 뒤 소진. 재처방·예약 안내";
export const NOTE_SINGLE = "복용 1주일. 불편한 점 확인 + 곧 소진, 재처방·예약 안내";

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
