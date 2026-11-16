import { addDays, daysBetween } from "./dates";
import { normalizePhone, isValidPhone } from "./phone";
import type { Prescription } from "./types";

/** 환자 찾기 결과 줄에 보여 줄 "남은 탕약" 추정. 수령일부터 하루 포수대로 드셨다고 본다. */
export type RemainingMedicine = {
  /** 다 드시는 날(마지막 복용일) */
  endDate: string;
  /** 오늘 포함 남은 일수. 다 드셨으면 0 */
  daysLeft: number;
  /** 남은 포 수 추정. 포 수를 모르면 null */
  packsLeft: number | null;
};

export function remainingMedicine(p: Pick<Prescription, "receive_date" | "days" | "packs" | "per_day">, today: string): RemainingMedicine {
  const days = Math.max(0, p.days);
  const endDate = addDays(p.receive_date, Math.max(0, days - 1));
  const used = Math.max(0, daysBetween(p.receive_date, today)); // 아직 수령 전이면 0일 복용
  const daysLeft = Math.max(0, days - used);
  let packsLeft: number | null = null;
  if (p.packs) {
    const perDay = p.per_day && p.per_day > 0 ? p.per_day : days > 0 ? p.packs / days : 0;
    packsLeft = Math.max(0, Math.min(p.packs, Math.ceil(daysLeft * perDay)));
  }
  return { endDate, daysLeft, packsLeft };
}

/** "약 12포(6일분) 남음 · 11월 20일까지" / "다 드셨음(11월 1일)" */
export function describeRemaining(r: RemainingMedicine, today: string): string {
  const end = monthDay(r.endDate);
  if (r.daysLeft <= 0) return `다 드셨음 (${end}까지였음)`;
  const packs = r.packsLeft != null ? `약 ${r.packsLeft}포(${r.daysLeft}일분)` : `${r.daysLeft}일분`;
  const soon = r.daysLeft <= 3 ? " · 곧 소진" : "";
  void today;
  return `${packs} 남음 · ${end}까지${soon}`;
}

export function monthDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** 찾기 칸에 친 글이 연락처 전체(10~11자리)인지. 그러면 없을 때 바로 등록을 권한다. */
export function isFullPhoneQuery(q: string): boolean {
  const digits = normalizePhone(q);
  return digits.length >= 10 && isValidPhone(digits) && /^[\d\s-]+$/.test(q.trim());
}

/** "N일 전" / "오늘" / "어제" */
export function describeAgo(iso: string, today: string): string {
  const n = daysBetween(iso, today);
  if (n <= 0) return "오늘";
  if (n === 1) return "어제";
  if (n < 60) return `${n}일 전`;
  const months = Math.floor(n / 30);
  return months < 24 ? `${months}달 전` : `${Math.floor(n / 365)}년 전`;
}
