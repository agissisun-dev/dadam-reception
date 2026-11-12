import { addDays, daysBetween } from "./dates";
import { isClinicClosed } from "./holidays";
import { isValidPhone, normalizePhone } from "./phone";
import type { Recontact, RecontactSegment, RecontactSettings } from "./types";

/**
 * 재진콜 (V12, 2026-11-11, 처음 이름 "다시 연락") — 한약 드신 분께 경과를 묻고, 답 온 분부터 예약·재주문으로 잇는다.
 * 화면은 해피콜 메뉴 안의 [재진콜] 탭. 설계: docs/superpowers/specs/2026-11-11-다시연락-v12-design.md
 *
 * 사용자 결정
 * - 첫 문자는 경과만 묻는다. 재주문 이야기는 답 온 분께 드리는 두 번째 문자·전화에서만.
 * - 하루 15~20통으로 제한(기본 20). 한꺼번에 보내지 않는다.
 * - 답이 필요한 문자라 병원 휴대폰 번호로 보낸다(솔라피 대표번호는 답장을 못 받음).
 */
/** 화면에 보이는 이름. 바꾸려면 여기 한 군데만 (사용자 2026-11-11: 안부가 아니라 재진으로 다시 모실 분이라는 뜻이 드러나게) */
export const RECONTACT_NAME = "재진콜";

export const SEGMENT_LABEL: Record<RecontactSegment, string> = {
  due_now: "지금",
  due_soon: "곧",
  vip: "VIP",
  once_p1: "1회 1순위",
  once_p2: "1회 2순위",
  lapsed: "오래됨",
  tonic: "공진단",
};
/** 먼저 연락하는 순서 */
export const SEGMENT_ORDER: RecontactSegment[] = ["due_now", "due_soon", "vip", "once_p1", "once_p2", "tonic", "lapsed"];
/** 답이 없으면 전화까지 하는 묶음 */
export const CALL_SEGMENTS: RecontactSegment[] = ["due_now", "due_soon", "vip", "once_p1"];

export const DEFAULT_DAILY_CAP = 20;
export const DEFAULT_BODY_A = "{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드시고 어떠신지 원장님이 궁금해하셔서 연락드려요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.";
/** B는 번호로 답하는 글 — 답하는 수고를 줄여 답장률을 비교한다(2026-11-11). 1·2·3이 그대로 다음 할 일(감사 / 원장 상담 권유 / 당일 전화)을 가른다. */
export const DEFAULT_BODY_B = "{이름}님, 노원다담한의원입니다. {월}에 지어 가신 {약} 드신 뒤 어떠신지 원장님이 궁금해하세요. {원장한줄} 번호만 답 주셔도 됩니다. 1 많이 좋아졌어요 / 2 비슷해요 / 3 다시 불편해요";
/**
 * 묶음마다 목표가 달라 첫 문자도 다르다 (2026-11-11, docs/recontact-playbook.md).
 * - 지금·곧: 약이 떨어질 때 → 이어 드실지. 위의 A·B를 반씩 보내 비교한다.
 * - 오래 못 뵌 단골(VIP·오래됨·공진단): "약 다 드셨을 때"가 맞지 않다. 오래 찾아 주신 것을 먼저 말하고 안부를 묻는다.
 * - 한 번 드신 분: 왜 한 번으로 끝났는지를 알아야 한다. 번호 답이 그 이유(좋아짐 / 하다 말았음 / 차이 없음)를 가른다.
 */
export const DEFAULT_BODY_VIP = "{이름}님, 노원다담한의원입니다. 오래 믿고 찾아 주셨는데 {월} 이후로 뵙지 못해 원장님이 안부를 궁금해하세요. {원장한줄} 한 줄만 답 주시면 원장님께 전해 드릴게요.";
export const DEFAULT_BODY_ONCE = "{이름}님, 노원다담한의원입니다. {월}에 {약} 드신 뒤 경과를 여쭙지 못해 연락드려요. {원장한줄} 번호만 답 주셔도 됩니다. 1 좋아져서 괜찮아요 / 2 나아지다 말았어요 / 3 별 차이를 못 느꼈어요";

/** 그 묶음에 쓰는 첫 문자 틀 종류 */
export function bodyKindFor(segment: RecontactSegment): "ab" | "vip" | "once" {
  if (segment === "once_p1" || segment === "once_p2") return "once";
  if (segment === "due_now" || segment === "due_soon") return "ab";
  return "vip";
}

/** 번호로 답하셨을 때 화면에서 한 번에 적는 단추 (보낸 글의 번호와 같게) */
export function quickRepliesFor(segment: RecontactSegment): string[] {
  return bodyKindFor(segment) === "once" ? ["1 좋아져서 괜찮아요", "2 나아지다 말았어요", "3 별 차이를 못 느꼈어요"] : ["1 많이 좋아졌어요", "2 비슷해요", "3 다시 불편해요"];
}
export const DEFAULT_BODY_REPLY = "답 주셔서 고맙습니다, {이름}님. 원장님께 전해 드렸더니 {원장답} 내원해서 보시는 게 편하세요, 전화 상담 뒤 받으시는 게 편하세요? 편하신 쪽 말씀 주시면 바로 잡아 드릴게요.";
export const DEFAULT_BODY_MISSED = "{이름}님, 노원다담한의원입니다. 조금 전 전화 드렸는데 통화가 안 되어 문자 남겨요. 지난번 약 드시고 어떠신지 여쭤보려던 거였어요. 편하실 때 전화나 답 주세요.";

export const DEFAULT_RECONTACT_SETTINGS: Omit<RecontactSettings, "clinic"> = {
  daily_cap: DEFAULT_DAILY_CAP,
  body_a: DEFAULT_BODY_A,
  body_b: DEFAULT_BODY_B,
  body_vip: DEFAULT_BODY_VIP,
  body_once: DEFAULT_BODY_ONCE,
  body_reply: DEFAULT_BODY_REPLY,
  body_missed: DEFAULT_BODY_MISSED,
};

/** 기존 N 기본 문구만 지점에 맞춰 바꾼다. 저장된 사용자 문구는 건드리지 않는다. */
export function defaultRecontactSettings(clinic: "S" | "N"): Omit<RecontactSettings, "clinic"> {
  const defaults = { ...DEFAULT_RECONTACT_SETTINGS };
  if (clinic === "S") {
    for (const key of ["body_a", "body_b", "body_vip", "body_once", "body_reply", "body_missed"] as const) {
      defaults[key] = defaults[key].replaceAll("노원다담한의원", "다담에스한의원");
    }
  }
  return defaults;
}

/** 장부의 종류 글자 → 문자에 쓰는 말 */
export function herbWord(kind: string | null | undefined): string {
  const k = kind ?? "";
  if (k.includes("공진단") || k.includes("경옥")) return "공진단";
  if (k.includes("보험")) return "보험 한약";
  if (k.includes("발효")) return "발효 한약";
  return "한약";
}

/** 원장님 칸이 비었을 때 들어가는 기본 질문 */
export function defaultQuestion(): string {
  return "요즘 몸은 좀 어떠세요?";
}

/** 마지막 한약 받은 달: 올해면 "10월", 작년이면 "작년 10월", 더 전이면 "2024년 10월" */
export function monthWord(lastHerbDate: string | null | undefined, today: string): string {
  if (!lastHerbDate) return "지난번";
  const [y, m] = lastHerbDate.split("-").map(Number);
  const ty = Number(today.slice(0, 4));
  if (y === ty) return `${m}월`;
  if (y === ty - 1) return `작년 ${m}월`;
  return `${y}년 ${m}월`;
}

type FillRow = Pick<Recontact, "patient_name" | "last_herb_date" | "herb_kind" | "doctor_note" | "doctor_reply">;

/** 자리표 채우기: {이름} {월} {약} {원장한줄} {원장답} */
export function fillRecontact(body: string, r: FillRow, today: string): string {
  const v: Record<string, string> = {
    이름: r.patient_name,
    월: monthWord(r.last_herb_date, today),
    약: herbWord(r.herb_kind),
    원장한줄: (r.doctor_note ?? "").trim() || defaultQuestion(),
    원장답: (r.doctor_reply ?? "").trim() || "한 번 더 봐 드리면 좋겠다고 하세요.",
  };
  return body.replace(/\{(이름|월|약|원장한줄|원장답)\}/g, (_, k: string) => v[k]).replace(/ {2,}/g, " ").trim();
}

type Bodies = Pick<RecontactSettings, "body_a" | "body_b" | "body_vip" | "body_once" | "body_reply" | "body_missed">;

/** 첫 문자(경과 확인). 샘이 고쳐 둔 글이 있으면 그것, 없으면 묶음에 맞는 틀(지금·곧은 A·B, 단골은 VIP, 한 번 드신 분은 따로)에서 채운다. */
export function firstText(r: FillRow & Pick<Recontact, "draft_text" | "variant" | "segment">, s: Bodies, today: string): string {
  if (r.draft_text && r.draft_text.trim()) return r.draft_text;
  const kind = bodyKindFor(r.segment);
  const body = kind === "once" ? s.body_once || DEFAULT_BODY_ONCE : kind === "vip" ? s.body_vip || DEFAULT_BODY_VIP : r.variant === "B" ? s.body_b || DEFAULT_BODY_B : s.body_a || DEFAULT_BODY_A;
  return fillRecontact(body, r, today);
}
/** 답 온 분께 드리는 두 번째 문자 (재주문 안내는 여기서만) */
export function replyText(r: FillRow, s: Bodies, today: string): string {
  return fillRecontact(s.body_reply || DEFAULT_BODY_REPLY, r, today);
}
/** 전화했는데 안 받으셨을 때 */
export function missedText(r: FillRow, s: Bodies, today: string): string {
  return fillRecontact(s.body_missed || DEFAULT_BODY_MISSED, r, today);
}

/** 그 환자가 지금 연락 대상에서 빠지는 이유들 (화면에서 미리 모아서 넘긴다) */
export type RecontactContext = {
  /** 연락 제외 환자 */
  excluded: Set<number>;
  /** 앞으로 예약이 잡혀 있는 환자 */
  booked: Set<number>;
  /** 최근 14일 안에 내원(장부 줄)한 환자 */
  visited: Set<number>;
  /** 대기 중인 해피콜이 있는 환자 */
  happyCall: Set<number>;
};
export const EMPTY_CONTEXT: RecontactContext = { excluded: new Set(), booked: new Set(), visited: new Set(), happyCall: new Set() };

/** RLS로 실제 조회된 같은 지점의 환자만 연락할 수 있다. ID만으로는 부족하다. */
export type ContactRow = Pick<Recontact, "patient_id" | "status" | "clinic"> & {
  patient: { id: number; clinic: "S" | "N"; phone: string; excluded_at: string | null } | null;
};

/** 답장 후·전화 때도 수신거부/연락처/지점 확인은 생략하지 않는다. */
export function contactBlockReason(r: ContactRow, ctx: RecontactContext | null): string | null {
  if (!ctx) return "연락 가능 여부를 불러오지 못했습니다. 새로 불러온 뒤 연락해 주세요.";
  if (!r.patient_id) return "연락처가 아직 없습니다.";
  if (!r.patient || r.patient.id !== r.patient_id || r.patient.clinic !== r.clinic) return "같은 지점의 환자 연결을 확인해 주세요.";
  if (r.patient.excluded_at || ctx.excluded.has(r.patient_id)) return "연락 제외 환자입니다.";
  if (!isValidPhone(r.patient.phone) || !/^01[016789]/.test(normalizePhone(r.patient.phone))) return "유효한 휴대폰 번호를 확인해 주세요.";
  return null;
}

/** 오늘 보낼 수 없는 이유. 보낼 수 있으면 null. */
export function blockReason(r: ContactRow, ctx: RecontactContext | null): string | null {
  const contact = contactBlockReason(r, ctx);
  if (contact) return contact;
  if (r.status !== "todo") return "이미 보냈거나 끝난 분입니다.";
  // contactBlockReason이 연결 및 context를 확인한 뒤에만 아래 조건을 검사한다.
  const id = r.patient_id!;
  if (ctx!.booked.has(id)) return "예약이 잡혀 있습니다.";
  if (ctx!.visited.has(id)) return "최근 2주 안에 내원하셨습니다.";
  if (ctx!.happyCall.has(id)) return "해피콜이 예정되어 있습니다.";
  return null;
}

function bySegmentThenRecent(a: Pick<Recontact, "segment" | "last_herb_date" | "id">, b: Pick<Recontact, "segment" | "last_herb_date" | "id">): number {
  const d = SEGMENT_ORDER.indexOf(a.segment) - SEGMENT_ORDER.indexOf(b.segment);
  if (d !== 0) return d;
  const r = (b.last_herb_date ?? "").localeCompare(a.last_herb_date ?? "");
  return r !== 0 ? r : a.id - b.id;
}

/** 한국 시간 날짜 (YYYY-MM-DD) */
export function kstDay(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(t.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 오늘 이미 보낸 수 */
export function sentToday(rows: Pick<Recontact, "sent_at">[], today: string): number {
  return rows.filter((r) => r.sent_at && kstDay(r.sent_at) === today).length;
}

/**
 * 오늘 보낼 사람: 보낼 수 있는 분을 묶음 순(지금 → 곧 → VIP …)·최근 구매 순으로 세워 하루 상한에서 오늘 보낸 수를 뺀 만큼.
 * waiting = 상한 때문에 내일로 넘어가는 수.
 */
export function todaysBatch<T extends ContactRow & Pick<Recontact, "id" | "segment" | "last_herb_date" | "sent_at">>(
  rows: T[],
  ctx: RecontactContext | null,
  cap: number,
  today: string,
): { batch: T[]; waiting: number; left: number } {
  const ready = rows.filter((r) => blockReason(r, ctx) === null && (!r.sent_at || kstDay(r.sent_at) !== today)).sort(bySegmentThenRecent);
  const left = Math.max(0, (Number.isFinite(cap) ? Math.floor(cap) : 0) - sentToday(rows, today));
  return { batch: ready.slice(0, left), waiting: Math.max(0, ready.length - left), left };
}

/** 보낸 지 사흘이 지났는데 답이 없고, 전화 대상 묶음이며, 아직 전화를 안 한 분 */
export function needsCall(r: Pick<Recontact, "status" | "sent_at" | "call_target" | "called_at">, today: string): boolean {
  if (r.status !== "sent" || !r.sent_at || !r.call_target || r.called_at) return false;
  return daysBetween(kstDay(r.sent_at), today) >= 3;
}

/** 두 번 연락(문자 + 전화 또는 문자 두 번)해도 답이 없어 쉬게 할 분 */
export function shouldRest(r: Pick<Recontact, "status" | "sent_at" | "attempts" | "called_at" | "call_target">, today: string): boolean {
  if (r.status !== "sent" || !r.sent_at) return false;
  const days = daysBetween(kstDay(r.sent_at), today);
  if (r.call_target) return !!r.called_at && days >= 7;
  return days >= 14;
}

/** 지금 문자를 보내도 되는 시간인지: 아침 9시~밤 9시, 일요일·공휴일 아님. 안 되면 이유. */
export function sendWindow(now: Date): { ok: true } | { ok: false; reason: string } {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  const day = k.toISOString().slice(0, 10);
  const hour = k.getUTCHours();
  if (isClinicClosed(day)) return { ok: false, reason: "일요일·공휴일에는 보내지 않습니다." };
  if (hour < 9 || hour >= 21) return { ok: false, reason: "아침 9시 전·밤 9시 뒤에는 보내지 않습니다." };
  return { ok: true };
}

/** 엑셀에서 읽은 한 사람 */
export type ImportRow = {
  patient_name: string;
  phone: string | null;
  birth_hint: string | null;
  segment: RecontactSegment;
  call_target: boolean;
  herb_count: number | null;
  last_herb_date: string | null;
  avg_interval_days: number | null;
  herb_kind: string | null;
  doctor_note: string | null;
  memo: string | null;
  variant: "A" | "B";
};

function num(s: string | undefined): number | null {
  if (!s || !/\d/.test(s) || /미확인|추정|확인 필요|불명/.test(s)) return null;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return s && s.trim() && Number.isFinite(n) ? Math.round(n) : null;
}
function isoDate(s: string | undefined): string | null {
  const m = (s ?? "").match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

/**
 * 엑셀 표(첫 줄이 머리글)를 명단으로. 머리글 글자로 칸을 찾으니 칸 순서가 달라도 된다.
 * 「1차 연락 51명」 파일과 원래 명단 파일의 시트 모두 읽는다.
 * - "묶음" 칸이 "지금"·"곧"이면 그 묶음, 없으면 화면에서 고른 묶음(fallback)
 * - 최근 내원·빼기 메모도 후보 명단에는 보존한다. 실제 연락 가능 여부는 별도로 판정한다.
 */
export function parseImportTable(table: string[][], fallback: RecontactSegment): { rows: ImportRow[]; skipped: number; problem: string | null } {
  const head = (table[0] ?? []).map((h) => (h ?? "").replace(/\s+/g, " ").trim());
  const col = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)));
  const c = {
    name: col("이름", "성함"),
    phone: col("휴대전화", "연락처", "휴대폰"),
    birth: col("생년"),
    count: head.findIndex((h) => h === "실제 탕약 구매횟수") >= 0 ? head.findIndex((h) => h === "실제 탕약 구매횟수") : col("횟수"),
    last: head.findIndex((h) => !/추정|수납|내원|유력/.test(h) && ["마지막 한약", "마지막 구매", "한약 구매일", "확인된 마지막 탕약"].some((k) => h.includes(k))),
    gap: col("간격"),
    kind: col("종류"),
    seg: head.findIndex((h) => h === "묶음" || h === "순위"),
    note: col("원장님"),
    symptoms: col("당시 불편했던 증상"),
    treatment: col("받은 탕약/치료"),
    question: col("원장님이 궁금한 점"),
    memo: head.findIndex((h) => h === "메모"),
  };
  if (c.name < 0) return { rows: [], skipped: 0, problem: "첫 줄에서 '이름' 칸을 찾지 못했습니다. 머리글이 첫 줄에 있는 시트인지 확인해 주세요." };
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const rows: ImportRow[] = [];
  const skipped = 0;
  for (const r of table.slice(1)) {
    const name = at(r, c.name);
    if (!name) continue;
    const memo = at(r, c.memo);
    const segText = at(r, c.seg);
    const segment: RecontactSegment = segText.includes("지금") ? "due_now" : segText.includes("곧") ? "due_soon" : segText.includes("1순위") ? "once_p1" : segText.includes("2순위") ? "once_p2" : fallback;
    // 엑셀이 숫자로 읽어 앞의 0이 떨어진 번호(1012345678)는 0을 다시 붙인다
    const raw = normalizePhone(at(r, c.phone));
    const digits = /^1[016789]\d{7,8}$/.test(raw) ? `0${raw}` : raw;
    rows.push({
      patient_name: name,
      phone: digits.length === 10 || digits.length === 11 ? digits : null,
      birth_hint: at(r, c.birth) || null,
      segment,
      call_target: CALL_SEGMENTS.includes(segment),
      herb_count: num(at(r, c.count)),
      last_herb_date: isoDate(at(r, c.last)),
      avg_interval_days: num(at(r, c.gap)),
      herb_kind: at(r, c.kind) || null,
      doctor_note: [
        c.symptoms >= 0 && at(r, c.symptoms) ? `당시 증상: ${at(r, c.symptoms)}` : "",
        c.treatment >= 0 && at(r, c.treatment) ? `받은 탕약/치료: ${at(r, c.treatment)}` : "",
        at(r, c.question >= 0 ? c.question : c.note),
      ].filter(Boolean).join("\n") || null,
      memo: memo || null,
      variant: rows.length % 2 === 0 ? "A" : "B",
    });
  }
  return { rows, skipped, problem: rows.length === 0 ? "읽을 수 있는 줄이 없습니다." : null };
}

/** 최근 내원 판정 기준일: 오늘에서 14일 전 */
export function visitedSince(today: string): string {
  return addDays(today, -14);
}

/** 그 사람 요약 한 줄: "한약 5회 · 마지막 2026-09-18(54일 전) · 평균 간격 33일 · 보험 탕약" */
export function factLine(r: Pick<Recontact, "herb_count" | "last_herb_date" | "avg_interval_days" | "herb_kind">, today: string): string {
  const parts: string[] = [];
  if (r.herb_count) parts.push(`한약 ${r.herb_count}회`);
  if (r.last_herb_date) parts.push(`마지막 ${r.last_herb_date}(${daysBetween(r.last_herb_date, today)}일 전)`);
  if (r.avg_interval_days) parts.push(`평균 간격 ${r.avg_interval_days}일`);
  if (r.herb_kind) parts.push(r.herb_kind);
  return parts.join(" · ");
}
