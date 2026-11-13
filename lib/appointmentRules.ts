import { weekdayKo } from "./dates";
import { holidayLabel, isClinicClosed } from "./holidays";
import type { Appointment, AppointmentKind, AppointmentSettings, ClinicDayOverride } from "./types";

/** 진료 시간 (HH:MM). lunch가 없으면 점심 없이. */
/** bookUntil = 예약을 받는 마지막 칸 시각(진료는 end까지 해도 그 뒤 칸은 안 연다). 없으면 end까지. */
export type DayHours = { open: boolean; start: string; end: string; lunchStart: string | null; lunchEnd: string | null; bookUntil: string | null; note: string | null };

/**
 * 병원별 기본 진료 시간. 요일 0=일 … 6=토.
 * 다담에스(사용자 2026-10-02): 월·화·목 9:30~18:00 점심 13~14, 토 9:30~15:00 점심 없음, 수·금·일 휴진.
 * 노원다담: 화·목 21시, 수·금 19시까지 진료.
 * 시작·점심·월·토 시간은 기존 임시값을 보존한다. 노원 실운영 시간 확인 필요.
 */
const CLOSED: DayHours = { open: false, start: "09:30", end: "18:00", lunchStart: null, lunchEnd: null, bookUntil: null, note: null };
const WEEKDAY: DayHours = { open: true, start: "09:30", end: "18:00", lunchStart: "13:00", lunchEnd: "14:00", bookUntil: null, note: null };
const SATURDAY: DayHours = { open: true, start: "09:30", end: "15:00", lunchStart: null, lunchEnd: null, bookUntil: null, note: null };
/** 노원다담 (사용자 2026-11-13): 월·수·금 19시, 화·목 야간 21시(예약은 20시 칸까지, 저녁 식사는 돌아가며 해서 안 잡음), 토 15시, 일·공휴일 휴진 */
const N_DAY: DayHours = { ...WEEKDAY, end: "19:00" };
const N_NIGHT: DayHours = { ...WEEKDAY, end: "21:00", bookUntil: "20:00" };

export const CLINIC_HOURS: Record<"S" | "N", DayHours[]> = {
  S: [CLOSED, WEEKDAY, WEEKDAY, CLOSED, WEEKDAY, CLOSED, SATURDAY],
  N: [CLOSED, N_DAY, N_NIGHT, N_DAY, N_NIGHT, N_DAY, SATURDAY],
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
      bookUntil: override.end_time ? null : tmpl.bookUntil,
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
  const last = h.bookUntil ? toMin(h.bookUntil) : null;
  for (let t = toMin(h.start); t + slotMinutes <= toMin(h.end); t += slotMinutes) {
    if (ls !== null && le !== null && t >= ls && t < le) continue;
    if (last !== null && t > last) break;
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

/** 기존 사용자 문구와 호환되는 자리표 치환. 모르는 자리표는 그대로 둔다. */
export function fillTemplate(body: string, v: { 이름: string; 병원: string; 날짜: string; 시간: string; 월?: string; 일?: string; 요일?: string; 전화번호?: string }): string {
  return body.replace(/{(이름|병원|날짜|시간|월|일|요일|전화번호)}/g, (token, k: keyof typeof v) => v[k] ?? token);
}

export const LEGACY_NOTIFY_BODY = "{이름}님, {병원} 예약 안내드립니다. {날짜} {시간}에 뵙겠습니다. 변경이 필요하시면 전화 주세요.";
/** 기본 예약 확인 문구 (사용자 2026-11-13 "변경사항 있으면 연락주세요. 병원에서 뵙겠습니다^^ 이 정도"). */
export const DEFAULT_NOTIFY_BODY = "{이름}님, {병원}입니다. {날짜} {시간} 예약 확인되었습니다. 변경 사항 있으면 {전화번호}로 연락 주세요. 병원에서 뵙겠습니다^^";
/** 예전 기본 문구들. 설정에 이 글이 그대로 남아 있으면 새 기본 문구로 바꾼다. 사용자가 고친 글은 건드리지 않는다. */
export const LEGACY_NOTIFY_BODIES = [
  "안녕하세요. {병원}입니다. {이름}님 {날짜} {시간}에 뵙겠습니다. 변동사항 있으면 전화 부탁드립니다.",
  "안녕하세요. {병원}입니다. {이름}님 {날짜} {시간}에 뵙겠습니다. 변동사항 있으면 전화 부탁드립니다. {전화번호}.",
];

/** 환자에게 나가는 글의 병원 이름은 두 병원 모두 노원다담한의원으로 통일(사용자 2026-11-13 "대외적으로는 노원다담한의원으로만"). 전화번호는 병원별. */
export const PUBLIC_CLINIC_NAME = "노원다담한의원";
export const APPOINTMENT_CLINICS = {
  S: { name: PUBLIC_CLINIC_NAME, phone: "02-949-3980" },
  N: { name: PUBLIC_CLINIC_NAME, phone: "02-949-3900" },
} as const;

// 병원이 달라도 같은 기본 문구(병원 이름·전화번호는 자리표로 들어간다). 인자는 호출하는 쪽 호환용.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function defaultNotifyBody(_clinic: "S" | "N"): string {
  return DEFAULT_NOTIFY_BODY;
}

/** 날짜·시간 자리표가 둘 다 있어야 예약 문구로 쓸 수 있다. (다담에스 문구에 날짜·시간이 안 들어가던 문제, 2026-11-13) */
export function hasDateTimePlaceholders(body: string): boolean {
  return /\{날짜\}|\{월\}/.test(body) && /\{시간\}/.test(body);
}

/** 예약 HH:MM → 한국어 12시간제. 정각에는 0분을 붙이지 않는다. */
export function appointmentTimeKo(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return time;
  const hour = Number(match[1]) % 12 || 12;
  const minute = Number(match[2]);
  return String(hour) + "시" + (minute ? " " + minute + "분" : "");
}

/** 미리 보기·예약 완료·발송에서 같은 자리표를 쓴다. */
export function renderAppointmentTemplate(body: string, a: Pick<Appointment, "patient_name" | "day" | "time">, clinic: "S" | "N"): string {
  const [, month, day] = a.day.split("-").map(Number);
  const weekday = weekdayKo(a.day);
  return fillTemplate(body, {
    이름: a.patient_name, 병원: APPOINTMENT_CLINICS[clinic].name,
    전화번호: APPOINTMENT_CLINICS[clinic].phone,
    날짜: month + "월 " + day + "일 " + weekday + "요일",
    시간: appointmentTimeKo(a.time), 월: String(month), 일: String(day), 요일: weekday + "요일",
  });
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

/** 네이버 붙여넣기에서 날짜·시간·이름·연락처·예약번호를 읽는다. */
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
    if (date) day = date[1] + "-" + String(Number(date[2])).padStart(2, "0") + "-" + String(Number(date[3])).padStart(2, "0");
    if (time) {
      let h = Number(time[1]);
      if (/오후/.test(line) && h < 12) h += 12;
      hhmm = String(h).padStart(2, "0") + ":" + time[2];
    }
    out.push({ day, time: hhmm, name: name ?? "", phone: phone ? phone[0].replace(/-/g, "") : null, key: key ? key[1] : null, raw: line, ok: !!(day && hhmm && name) });
  }
  return out;
}
