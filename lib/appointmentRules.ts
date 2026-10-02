import { weekdayKo } from "./dates";
import { holidayLabel, isClinicClosed } from "./holidays";
import type { Appointment, AppointmentKind, AppointmentSettings, ClinicDayOverride } from "./types";

/** 진료 시간 (HH:MM). lunch가 없으면 점심 없이. */
export type DayHours = { open: boolean; start: string; end: string; lunchStart: string | null; lunchEnd: string | null; note: string | null };

/**
 * 병원별 기본 진료 시간. 요일 0=일 … 6=토.
 * 다담에스(사용자 2026-10-02): 월·화·목 9:30~18:00 점심 13~14, 토 9:30~15:00 점심 없음, 수·금·일 휴진.
 * 노원다담은 시작할 때 적는다(지금은 S와 같게).
 */
const CLOSED: DayHours = { open: false, start: "09:30", end: "18:00", lunchStart: null, lunchEnd: null, note: null };
const WEEKDAY: DayHours = { open: true, start: "09:30", end: "18:00", lunchStart: "13:00", lunchEnd: "14:00", note: null };
const SATURDAY: DayHours = { open: true, start: "09:30", end: "15:00", lunchStart: null, lunchEnd: null, note: null };

export const CLINIC_HOURS: Record<"S" | "N", DayHours[]> = {
  S: [CLOSED, WEEKDAY, WEEKDAY, CLOSED, WEEKDAY, CLOSED, SATURDAY],
  N: [CLOSED, WEEKDAY, WEEKDAY, CLOSED, WEEKDAY, CLOSED, SATURDAY],
};

function dow(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** 그날 진료 시간: 기본 요일 시간 → 공휴일이면 휴진 → 그날만 바꾼 것이 있으면 그것. */
export function dayHours(iso: string, clinic: "S" | "N", override?: ClinicDayOverride | null): DayHours {
  const base = CLINIC_HOURS[clinic][dow(iso)];
  let h: DayHours = { ...base };
  if (isClinicClosed(iso)) h = { ...CLOSED, note: holidayLabel(iso) };
  if (override) {
    // 쉬는 날을 여는 경우 시간 틀은 평일 것을 쓴다
    const tmpl = base.open ? base : WEEKDAY;
    h = {
      open: override.open,
      start: override.start_time ?? tmpl.start,
      end: override.end_time ?? tmpl.end,
      lunchStart: override.lunch_start ?? (override.open && !override.start_time ? tmpl.lunchStart : null),
      lunchEnd: override.lunch_end ?? (override.open && !override.start_time ? tmpl.lunchEnd : null),
      note: override.memo ?? (override.open ? "그날만 진료" : "그날만 휴진"),
    };
  }
  return h;
}

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** 시간표 칸 목록 (HH:MM). 점심 칸은 뺀다. 휴진이면 []. */
export function slotsOf(h: DayHours, slotMinutes: number): string[] {
  if (!h.open) return [];
  const out: string[] = [];
  const ls = h.lunchStart ? toMin(h.lunchStart) : null;
  const le = h.lunchEnd ? toMin(h.lunchEnd) : null;
  for (let t = toMin(h.start); t + slotMinutes <= toMin(h.end); t += slotMinutes) {
    if (ls !== null && le !== null && t >= ls && t < le) continue;
    out.push(toHHMM(t));
  }
  return out;
}

export type SlotLoad = { consult: number; treatment: number; consultMax: number; treatmentMax: number; consultFull: boolean; treatmentFull: boolean };

/** 그 칸에 몇 명 잡혔는지(취소·노쇼 제외). */
export function slotLoad(appts: Pick<Appointment, "time" | "kind" | "status">[], time: string, s: Pick<AppointmentSettings, "consult_per_slot" | "treatment_per_slot">): SlotLoad {
  let consult = 0, treatment = 0;
  for (const a of appts) {
    if (a.time !== time || a.status === "cancelled" || a.status === "noshow") continue;
    if (a.kind === "consult") consult += 1;
    else treatment += 1;
  }
  return {
    consult, treatment,
    consultMax: s.consult_per_slot, treatmentMax: s.treatment_per_slot,
    consultFull: consult >= s.consult_per_slot, treatmentFull: treatment >= s.treatment_per_slot,
  };
}

export const KIND_LABEL: Record<AppointmentKind, string> = { consult: "약상담", treatment: "침치료" };
export const SOURCE_LABEL: Record<Appointment["source"], string> = { desk: "접수실", naver: "N", happycall: "해", ledger: "수" };
export const STATUS_LABEL: Record<Appointment["status"], string> = { booked: "예약", arrived: "내원", noshow: "노쇼", cancelled: "취소" };

/** "2026-10-19" → "10월 19일(월)" */
export function dateKo(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일(${weekdayKo(iso)})`;
}

/** 안내 문구 채우기: {이름} {병원} {날짜} {시간} */
export function fillTemplate(body: string, v: { 이름: string; 병원: string; 날짜: string; 시간: string }): string {
  return body.replace(/\{(이름|병원|날짜|시간)\}/g, (_, k: keyof typeof v) => v[k]);
}

/** 날짜별 예약 수(취소 제외) */
export function countByDay(appts: Pick<Appointment, "day" | "status">[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of appts) {
    if (a.status === "cancelled") continue;
    m.set(a.day, (m.get(a.day) ?? 0) + 1);
  }
  return m;
}

export type NaverPasteRow = { day: string; time: string; name: string; phone: string | null; key: string | null; raw: string; ok: boolean };

/**
 * 스마트플레이스 예약 목록을 붙여 넣은 글에서 날짜·시간·이름·연락처·예약번호를 읽는다.
 * 줄마다 "2026-10-19 10:30 홍길동 010-1234-5678 예약번호 123456" 같은 모양을 기대하고,
 * 날짜·시간·이름 셋을 못 찾으면 ok=false로 돌려준다(화면에서 손으로 고침).
 */
export function parseNaverPaste(text: string): NaverPasteRow[] {
  const out: NaverPasteRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const date = line.match(/(\d{4})[.\-/년]\s?(\d{1,2})[.\-/월]\s?(\d{1,2})/);
    const time = line.match(/(?:오전|오후)?\s?(\d{1,2}):(\d{2})/);
    const phone = line.match(/01[016789]-?\d{3,4}-?\d{4}/);
    const key = line.match(/(?:예약번호|번호)\s*[:#]?\s*([A-Za-z0-9-]{4,})/);
    let name: string | null = null;
    const nm = line.match(/([가-힣]{2,4})\s*(?:님)?(?=\s|$|·|,)/g);
    if (nm) {
      const cand = nm.map((s) => s.replace(/님|\s/g, "")).filter((s) => !/^(오전|오후|예약|확정|취소|방문|예약번호|번호)$/.test(s));
      name = cand[0] ?? null;
    }
    let day = "", hhmm = "";
    if (date) day = `${date[1]}-${String(Number(date[2])).padStart(2, "0")}-${String(Number(date[3])).padStart(2, "0")}`;
    if (time) {
      let h = Number(time[1]);
      if (/오후/.test(line) && h < 12) h += 12;
      hhmm = `${String(h).padStart(2, "0")}:${time[2]}`;
    }
    out.push({ day, time: hhmm, name: name ?? "", phone: phone ? phone[0].replace(/-/g, "") : null, key: key ? key[1] : null, raw: line, ok: !!(day && hhmm && name) });
  }
  return out;
}
