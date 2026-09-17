import { todayISO } from "./dates";

/** "2026-09-17" → "2026-09" */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** timestamptz 문자열 → PC 기준 날짜의 월 키 */
export function monthKeyOfTimestamp(ts: string): string {
  return monthKey(todayISO(new Date(ts)));
}

/** 오늘 달로 끝나는 최근 n개월 키, 오름차순 */
export function recentMonthKeys(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    keys.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  }
  return keys;
}

export function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const idx = y * 12 + (m - 1) - 1;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** "2026-09" → "9월", 1월이면 "26년 1월" */
export function monthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${String(y).slice(2)}년 1월` : `${m}월`;
}

/** 백분율(정수). 분모 0이면 null */
export function pct(n: number, d: number): number | null {
  return d === 0 ? null : Math.round((n / d) * 100);
}

export type PrescriptionLite = {
  id: number;
  patient_id: number;
  receive_date: string;
  packs: number | null;
  days: number;
  per_day: number | null;
};

/** 포 수. 옛 처방(포 수 없음)은 일수 × 하루 포수(기본 2)로 본다. */
export function packsOf(p: PrescriptionLite): number {
  return p.packs ?? p.days * (p.per_day ?? 2);
}

/** 처방 id → 그 환자의 몇 번째 처방인지 (수령일, id 순) */
export function prescriptionSeq(prescriptions: PrescriptionLite[]): Map<number, number> {
  const sorted = [...prescriptions].sort(
    (a, b) => a.receive_date.localeCompare(b.receive_date) || a.id - b.id,
  );
  const counter = new Map<number, number>();
  const seq = new Map<number, number>();
  for (const p of sorted) {
    const n = (counter.get(p.patient_id) ?? 0) + 1;
    counter.set(p.patient_id, n);
    seq.set(p.id, n);
  }
  return seq;
}

export type MonthlyRow = {
  key: string;
  newPatients: number;
  prescriptions: number;
  represcriptions: number; // 그 환자의 2번째 이상 처방
  packs: number;
};

export function monthlyRows(
  input: { patients: { created_at: string }[]; prescriptions: PrescriptionLite[] },
  keys: string[],
): MonthlyRow[] {
  const rows = new Map<string, MonthlyRow>(
    keys.map((key) => [key, { key, newPatients: 0, prescriptions: 0, represcriptions: 0, packs: 0 }]),
  );
  for (const p of input.patients) {
    const r = rows.get(monthKeyOfTimestamp(p.created_at));
    if (r) r.newPatients += 1;
  }
  const seq = prescriptionSeq(input.prescriptions);
  for (const p of input.prescriptions) {
    const r = rows.get(monthKey(p.receive_date));
    if (!r) continue;
    r.prescriptions += 1;
    r.packs += packsOf(p);
    if ((seq.get(p.id) ?? 1) >= 2) r.represcriptions += 1;
  }
  return keys.map((k) => rows.get(k)!);
}

export type HappyCallLite = { id: number; round: number; due_date: string; status: string; created_at: string };
export type ContactLogLite = { happy_call_id: number; action: string; created_at: string };

export type HappyCallMonth = {
  due: number; // 그 달 예정
  handled: number; // 처리됨(대기 아님)
  onTime: number; // 예정일 당일 또는 그 전에 처리
  represcribed: number; // 재처방·예약됨으로 닫힘
};

const HANDLED = new Set(["contacted", "represcribed", "excluded"]);

export function happyCallMonth(calls: HappyCallLite[], logs: ContactLogLite[], key: string): HappyCallMonth {
  const byCall = new Map<number, ContactLogLite[]>();
  for (const l of logs) byCall.set(l.happy_call_id, [...(byCall.get(l.happy_call_id) ?? []), l]);
  const out: HappyCallMonth = { due: 0, handled: 0, onTime: 0, represcribed: 0 };
  for (const c of calls) {
    if (monthKey(c.due_date) !== key) continue;
    out.due += 1;
    if (c.status === "pending") continue;
    out.handled += 1;
    const mine = byCall.get(c.id) ?? [];
    if (mine.some((l) => l.action === "represcribed")) out.represcribed += 1;
    const first = mine
      .filter((l) => HANDLED.has(l.action))
      .map((l) => todayISO(new Date(l.created_at)))
      .sort()[0];
    if (first && first <= c.due_date) out.onTime += 1;
  }
  return out;
}

export type WeeklyContactLite = { action: string; planned_date: string; patient_reply: string | null };

export type WeeklyMonth = { sent: number; visited: number; noReply: number; replies: number; dormant: number };

export function weeklyMonth(contacts: WeeklyContactLite[], key: string): WeeklyMonth {
  const out: WeeklyMonth = { sent: 0, visited: 0, noReply: 0, replies: 0, dormant: 0 };
  for (const c of contacts) {
    if (monthKey(c.planned_date) !== key) continue;
    if (c.action === "sent") out.sent += 1;
    if (c.action === "skipped_visited") out.visited += 1;
    if (c.action === "no_reply") out.noReply += 1;
    if (c.action === "dormant") out.dormant += 1;
    if (c.patient_reply) out.replies += 1;
  }
  return out;
}

/** 눈금 위 끝값: 1·2·2.5·3·4·5·6·8·10 × 자릿수로 올림 (23 → 25, 7 → 8) */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const f of [1, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (max <= f * p) return f * p;
  return 10 * p;
}
