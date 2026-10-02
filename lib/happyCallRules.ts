import { addDays } from "./dates";
import { shiftToClinicDay } from "./holidays";
import type { HappyCallRow } from "./types";

export const NOTE_ROUND1 = "복용 1주일. 약 드시고 불편한 점 없는지 확인";
export const NOTE_ROUND2 = "약 3일 뒤 소진. 재처방·예약 안내";
export const NOTE_SINGLE = "복용 1주일. 불편한 점 확인 + 곧 소진, 재처방·예약 안내";

/** 연락 예정일이 휴진일(일요일·공휴일)이면 그 전 진료일로 당긴다. 뒤로 미루면 약이 끊긴 뒤가 되므로. */
const onClinicDay = (iso: string) => shiftToClinicDay(iso);

/** 12일 이하는 한 건(+7). 그 외 1차 +7, 2차 +days-3. 휴진일에 걸리면 그 전 진료일로 당긴다. */
export function planHappyCalls(
  receiveDate: string,
  days: number,
): { round: 1 | 2; due_date: string; note: string }[] {
  if (days <= 12) {
    return [{ round: 1, due_date: onClinicDay(addDays(receiveDate, 7)), note: NOTE_SINGLE }];
  }
  return [
    { round: 1, due_date: onClinicDay(addDays(receiveDate, 7)), note: NOTE_ROUND1 },
    { round: 2, due_date: onClinicDay(addDays(receiveDate, days - 3)), note: NOTE_ROUND2 },
  ];
}

type PlannedCall = { round: 1 | 2; due_date: string; note: string };
type ExistingCall = { id: number; round: 1 | 2; status: "pending" | "contacted" | "closed" };

/**
 * 수령일·포 수를 바꿨을 때 해피콜을 새 계획에 맞춘다.
 * 대기(pending)인 것만 손댄다: 같은 회차가 있으면 날짜를 바꾸고, 없어진 회차는 종료하고, 새로 생긴 회차는 넣는다.
 * 이미 연락한 것(contacted·closed)은 그대로 둔다.
 */
export function reconcileHappyCalls(
  existing: ExistingCall[],
  plan: PlannedCall[],
): { update: { id: number; due_date: string; note: string }[]; insert: PlannedCall[]; close: number[] } {
  const update: { id: number; due_date: string; note: string }[] = [];
  const close: number[] = [];
  const seen = new Set<number>();
  for (const c of existing) {
    if (c.status !== "pending") {
      seen.add(c.round);
      continue;
    }
    const p = plan.find((x) => x.round === c.round);
    if (p) {
      update.push({ id: c.id, due_date: p.due_date, note: p.note });
      seen.add(c.round);
    } else {
      close.push(c.id);
    }
  }
  const insert = plan.filter((p) => !seen.has(p.round));
  return { update, insert, close };
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
