import { addDays, weekdayKo } from "./dates";
import type { BrewJob, BrewKind, BrewWeekdayRule } from "./types";

/** 파우치 종류 (가족이 같이 먹을 때 구분용) */
export const POUCHES = ["다담", "애장금", "자연과사람", "공룡"] as const;

export const KIND_LABEL: Record<BrewKind, string> = {
  decoction: "탕약",
  ferment_start: "발효시작",
  ferment_end: "발효끝",
  batch: "지정처방",
  note: "메모",
};

function dow(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** iso가 속한 주의 월요일. 일요일이면 다음 주 월요일. */
export function weekMonday(iso: string): string {
  const w = dow(iso);
  if (w === 0) return addDays(iso, 1);
  return addDays(iso, 1 - w);
}

/** 월~토 여섯 날 */
export function weekDays(monday: string): string[] {
  return [0, 1, 2, 3, 4, 5].map((i) => addDays(monday, i));
}

/** 발효는 사흘: 시작일 +2에 포장·발송. 일요일이면 월요일. */
export function fermentEndDay(start: string): string {
  const d = addDays(start, 2);
  return dow(d) === 0 ? addDays(d, 1) : d;
}

/** 받는 날 기본값: 달이는 날(발효는 발효끝 날) */
export function defaultReceiveDay(brewDay: string, fermented: boolean): string {
  return fermented ? fermentEndDay(brewDay) : brewDay;
}

/** 칸 글: 엑셀과 같은 모양 "이름-종류-직/택(지역)" (끝나면 뒤에 o) */
export function jobLabel(j: Pick<BrewJob, "patient_name" | "title" | "kind" | "delivery" | "region" | "split_no" | "split_of" | "status">): string {
  const parts: string[] = [];
  if (j.patient_name) parts.push(j.patient_name);
  if (j.kind === "ferment_start") parts.push("발효시작");
  else if (j.kind === "ferment_end") parts.push("발효끝");
  else if (j.title) parts.push(j.title);
  if (j.split_no && j.split_of) parts.push(`#${j.split_no}/${j.split_of}`);
  // 직/택은 나가는 날에만 (발효시작 날은 안 붙임 — 접수실 2026-10-05)
  if (j.kind !== "ferment_start") {
    if (j.delivery === "pickup") parts.push(j.region ? `직(${j.region})` : "직");
    else if (j.delivery === "courier") parts.push(j.region ? `택(${j.region})` : "택");
    else if (j.region) parts.push(j.region);
  }
  let s = parts.join("-");
  if (j.status === "done") s += " o";
  return s;
}

/** 그날 셈: 달이기(탕약·발효시작·묶음 제외) · 짜기(발효끝) · 묶음 · 그날 한도(메모의 max_jobs가 있으면 그것) */
export function dayCounts(jobs: BrewJob[], rule: BrewWeekdayRule | undefined): { brew: number; press: number; batch: number; max: number } {
  let brew = 0, press = 0, batch = 0;
  let max = rule?.max_jobs ?? 4;
  for (const j of jobs) {
    if (j.kind === "decoction" || j.kind === "ferment_start") brew += 1;
    else if (j.kind === "ferment_end") press += 1;
    else if (j.kind === "batch") batch += 1;
    else if (j.kind === "note" && j.max_jobs !== null && j.max_jobs !== undefined) max = j.max_jobs;
  }
  return { brew, press, batch, max };
}

export type NewJob = Omit<BrewJob, "id" | "created_at" | "updated_at" | "done_at" | "done_by" | "pair_id" | "status"> & { pairWithPrev?: boolean };

/**
 * 장부 탕약 줄 → 약대장 칸들. 발효면 시작·끝 짝, 분할이면 2회분은 날짜 미정.
 */
export function planJobsFromLedger(p: {
  patient_id: number | null;
  patient_name: string;
  title: string; // 보험(처방) · 일반 42만원 · 발효 48만원
  fermented: boolean;
  day: string;
  slot: "am" | "pm";
  delivery: "pickup" | "courier" | null;
  region: string | null;
  pouch: string | null;
  split: number | null;
  staff_name: string;
  prescription_id: number | null;
  ledger_entry_id: number | null;
}): NewJob[] {
  const base = {
    patient_id: p.patient_id,
    patient_name: p.patient_name,
    title: p.title,
    delivery: p.delivery,
    region: p.region,
    pouch: p.pouch,
    memo: null,
    max_jobs: null,
    staff_name: p.staff_name,
    prescription_id: p.prescription_id,
    ledger_entry_id: p.ledger_entry_id,
    sort_order: 0,
    split_no: null as number | null,
    split_of: null as number | null,
  };
  const splitOf = p.split && p.split > 1 ? p.split : null;
  const out: NewJob[] = [];
  if (p.fermented) {
    out.push({ ...base, kind: "ferment_start", day: p.day, slot: p.slot, receive_day: null, split_no: splitOf ? 1 : null, split_of: splitOf });
    out.push({ ...base, kind: "ferment_end", day: fermentEndDay(p.day), slot: "am", receive_day: fermentEndDay(p.day), split_no: splitOf ? 1 : null, split_of: splitOf, pairWithPrev: true });
  } else {
    out.push({ ...base, kind: "decoction", day: p.day, slot: p.slot, receive_day: p.day, split_no: splitOf ? 1 : null, split_of: splitOf });
  }
  if (splitOf) {
    for (let n = 2; n <= splitOf; n++) {
      out.push({ ...base, kind: p.fermented ? "ferment_start" : "decoction", day: null, slot: "am", receive_day: null, split_no: n, split_of: splitOf });
    }
  }
  return out;
}

/** 발효 중인 날: 발효시작과 짝 발효끝 사이의 날들. 화면 표시용(저장 안 함). 짝이 없으면 시작 +1일 하나. */
export function fermentMidDays(jobs: BrewJob[]): { day: string; jobId: number; label: string; clinic: "S" | "N" }[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const out: { day: string; jobId: number; label: string; clinic: "S" | "N" }[] = [];
  for (const j of jobs) {
    if (j.kind !== "ferment_start" || !j.day) continue;
    const end = j.pair_id ? byId.get(j.pair_id) : undefined;
    const endDay = end?.day ?? fermentEndDay(j.day);
    for (let d = addDays(j.day, 1); d < endDay; d = addDays(d, 1)) {
      out.push({ day: d, jobId: j.id, label: j.patient_name || j.title, clinic: j.clinic ?? "S" });
    }
  }
  return out;
}

export function dayHeader(iso: string): string {
  return `${weekdayKo(iso)} ${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}`;
}
