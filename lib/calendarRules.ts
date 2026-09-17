import { addDays } from "./dates";

/** 달력 한 달. month는 1~12. */
export type YearMonth = { year: number; month: number };

const pad = (n: number) => String(n).padStart(2, "0");

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function yearMonthOf(iso: string): YearMonth {
  const [y, m] = iso.split("-").map(Number);
  return { year: y, month: m };
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function sameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

export function isInMonth(iso: string, ym: YearMonth): boolean {
  return iso.startsWith(`${ym.year}-${pad(ym.month)}-`);
}

/** "2026년 9월" */
export function monthLabel(ym: YearMonth): string {
  return `${ym.year}년 ${ym.month}월`;
}

export function firstDayISO(ym: YearMonth): string {
  return `${ym.year}-${pad(ym.month)}-01`;
}

export function lastDayISO(ym: YearMonth): string {
  return addDays(firstDayISO(shiftMonth(ym, 1)), -1);
}

/**
 * 일요일 시작 주 단위 달력. 앞뒤로 이웃 달 날짜를 채워 빈칸이 없다.
 * 주 수는 4~6. 각 주는 ISO 날짜 7개.
 */
export function monthGrid(ym: YearMonth): string[][] {
  const first = firstDayISO(ym);
  const last = lastDayISO(ym);
  let cursor = addDays(first, -weekdayOf(first));
  const weeks: string[][] = [];
  while (cursor <= last) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** 날짜별 건수. */
export function tallyDates(dates: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of dates) m.set(d, (m.get(d) ?? 0) + 1);
  return m;
}

/** "9월 17일" */
export function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일`;
}
