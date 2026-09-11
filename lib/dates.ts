import type { Task } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** 현지 날짜를 YYYY-MM-DD로. 시간대 변환 없이 PC의 달력 날짜를 쓴다. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d); // 현지 자정
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

/** toISO − fromISO (일). 같은 날이면 0. */
export function daysBetween(fromISO: string, toISO: string): number {
  const ms = parseISO(toISO).getTime() - parseISO(fromISO).getTime();
  return Math.round(ms / 86_400_000);
}

const byDueAsc = (a: Task, b: Task) => a.due_date.localeCompare(b.due_date);

export function bucketOpenTasks(
  tasks: Task[],
  today: string,
): { overdue: Task[]; today: Task[]; upcoming: Task[] } {
  const open = tasks.filter((t) => t.status === "todo");
  const limit = addDays(today, 7);
  return {
    overdue: open.filter((t) => t.due_date < today).sort(byDueAsc),
    today: open.filter((t) => t.due_date === today).sort(byDueAsc),
    upcoming: open
      .filter((t) => t.due_date > today && t.due_date <= limit)
      .sort(byDueAsc),
  };
}
