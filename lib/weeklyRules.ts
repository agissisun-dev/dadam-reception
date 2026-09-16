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

/**
 * 주간 관리 문구는 공통 3개다. round 칸을 "슬롯"으로 쓴다.
 *   1    = 첫 발송 (복약 불편 확인)
 *   2    = 그다음 (남은 탕약 확인·예약 안내)
 *   null = 내원 안내 (4회째부터)
 */
export const SLOT_FIRST = 1;
export const SLOT_NEXT = 2;

export function weeklySlotLabel(round: number | null): string {
  if (round === SLOT_FIRST) return "첫 발송";
  if (round === SLOT_NEXT) return "그다음";
  if (round === null) return "내원 안내";
  return `${round}주차`;
}

function weeklyOf(templates: Template[]): Template[] {
  return templates.filter((t) => t.kind === "weekly");
}

function visitTemplate(weekly: Template[]): Template | null {
  return weekly.find((t) => t.condition === null && t.round === null) ?? null;
}

/**
 * 회차 → 문구.
 *  - 4회째부터: 내원 안내 (질환별 4주차 문구가 남아 있으면 그것)
 *  - 그 전: 질환별 회차 문구(옛 데이터) → 공통 슬롯(1회차=첫 발송, 나머지=그다음) → 내원 안내 → null
 */
export function pickWeeklyTemplate(
  templates: Template[],
  condition: Condition,
  round: number,
): Template | null {
  const weekly = weeklyOf(templates);
  const r = effectiveRound(round);
  if (r >= MAX_ROUND) {
    return visitTemplate(weekly) ?? weekly.find((t) => t.condition === condition && t.round === MAX_ROUND) ?? null;
  }
  const slot = r === 1 ? SLOT_FIRST : SLOT_NEXT;
  return (
    weekly.find((t) => t.condition === condition && t.round === r) ??
    weekly.find((t) => t.condition === null && t.round === slot) ??
    visitTemplate(weekly)
  );
}

/**
 * 해피콜 문구. 1차 = 첫 발송(복약 불편 확인), 2차·한 번만 거는 처방 = 그다음(남은 탕약·예약).
 * 내원 안내로 대신하지 않는다 (해피콜은 복약 중인 환자라서).
 */
export function pickHappyCallTemplate(
  templates: Template[],
  round: number,
  single: boolean,
): Template | null {
  const slot = round === 1 && !single ? SLOT_FIRST : SLOT_NEXT;
  return weeklyOf(templates).find((t) => t.condition === null && t.round === slot) ?? null;
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
