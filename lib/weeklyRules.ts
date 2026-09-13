import { addDays, daysBetween, todayISO } from "./dates";
import type { Condition, Template, WeeklyContact } from "./types";

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const DEFAULT_WEEKDAY = 2; // 화요일
export const MAX_ROUND = 4;

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * 다음 발송일.
 * - includeToday=true(시작): from 이후 첫 지정 요일. from이 그 요일이면 from.
 * - includeToday=false(처리 후): from + interval*7. 그래도 today보다 앞이면 today 이후 첫 지정 요일.
 */
export function nextWeeklyDate(
  fromISO: string,
  weekday: number,
  intervalWeeks: number,
  includeToday: boolean,
  today: string = todayISO(),
): string {
  if (includeToday) {
    const diff = (weekday - weekdayOf(fromISO) + 7) % 7;
    return addDays(fromISO, diff);
  }
  let next = addDays(fromISO, Math.max(1, intervalWeeks) * 7);
  if (daysBetween(today, next) < 0) {
    const diff = (weekday - weekdayOf(today) + 7) % 7;
    next = addDays(today, diff);
  }
  return next;
}

export function effectiveRound(round: number): number {
  return Math.min(Math.max(1, round), MAX_ROUND);
}

/** 질환·회차 일치 → 공통(condition null) → null */
export function pickWeeklyTemplate(
  templates: Template[],
  condition: Condition,
  round: number,
): Template | null {
  const r = effectiveRound(round);
  const weekly = templates.filter((t) => t.kind === "weekly");
  return (
    weekly.find((t) => t.condition === condition && t.round === r) ??
    weekly.find((t) => t.condition === null) ??
    null
  );
}

/** 최근(내림차순) 기록에서 연속 '답 없음' 수 */
export function consecutiveNoReply(contactsDesc: WeeklyContact[]): number {
  let n = 0;
  for (const c of contactsDesc) {
    if (c.action === "no_reply") n += 1;
    else break;
  }
  return n;
}

/** 이번 주 일요일 (월~일 기준) */
export function weekEndISO(today: string): string {
  const w = weekdayOf(today); // 0=일
  return addDays(today, w === 0 ? 0 : 7 - w);
}
