import { getSupabase } from "./supabaseClient";
import { fetchCurrentClinic } from "./clinic";
import { createPatient, findPatientByPhone } from "./patients";
import { isValidPhone, normalizePhone } from "./phone";
import { DEFAULT_RECONTACT_SETTINGS, RECONTACT_NAME, todaysBatch, visitedSince, type ImportRow, type RecontactContext } from "./recontactRules";
import type { Patient, Recontact, RecontactRow, RecontactSettings, RecontactStatus } from "./types";

/** 표가 아직 없을 때(SQL 실행 전) 알아듣기 쉬운 말로 바꾼다. */
function fail(action: string, message: string): never {
  if (/recontact/.test(message) && /(does not exist|Could not find|schema cache)/i.test(message)) {
    throw new Error(`${RECONTACT_NAME} 표가 아직 없습니다. Supabase에서 schema-v12-recontact.sql을 먼저 실행해 주세요.`);
  }
  throw new Error(`${action} 실패: ${message}`);
}

export async function getRecontactSettings(): Promise<RecontactSettings> {
  const { data, error } = await getSupabase().from("recontact_settings").select("*").maybeSingle();
  if (error) fail("설정 불러오기", error.message);
  // 표에 아직 없는 칸(나중에 더한 문구)은 기본값으로 채운다
  if (data) return { ...DEFAULT_RECONTACT_SETTINGS, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined)) } as RecontactSettings;
  return { clinic: await fetchCurrentClinic(), ...DEFAULT_RECONTACT_SETTINGS };
}

export async function saveRecontactSettings(patch: Partial<Omit<RecontactSettings, "clinic">>): Promise<RecontactSettings> {
  const cur = await getRecontactSettings();
  const next = { ...cur, ...patch };
  const { error } = await getSupabase().from("recontact_settings").upsert(next);
  if (error) fail("설정 저장", error.message);
  return next;
}

export async function listRecontacts(): Promise<RecontactRow[]> {
  const { data, error } = await getSupabase()
    .from("recontacts")
    .select("*, patient:patients(id, name, phone, excluded_at)")
    .order("id");
  if (error) fail("명단 불러오기", error.message);
  return (data ?? []) as RecontactRow[];
}

/** 오늘 보낼 사람에서 빼야 하는 환자들: 연락 제외 · 예약 있음 · 최근 2주 내원 · 해피콜 예정 */
export async function recontactContext(rows: RecontactRow[], today: string): Promise<RecontactContext> {
  const ids = [...new Set(rows.map((r) => r.patient_id).filter((x): x is number => !!x))];
  const excluded = new Set(rows.filter((r) => r.patient?.excluded_at).map((r) => r.patient!.id));
  if (ids.length === 0) return { excluded, booked: new Set(), visited: new Set(), happyCall: new Set() };
  const sb = getSupabase();
  const [appts, visits, calls] = await Promise.all([
    sb.from("appointments").select("patient_id").gte("day", today).eq("status", "booked").in("patient_id", ids),
    sb.from("ledger_entries").select("patient_id").gte("day", visitedSince(today)).in("patient_id", ids),
    sb.from("happy_calls").select("prescription:prescriptions!inner(patient_id)").eq("status", "pending"),
  ]);
  const set = (list: { patient_id: number | null }[] | null) => new Set((list ?? []).map((x) => x.patient_id).filter((x): x is number => !!x));
  const hc = new Set<number>();
  for (const c of (calls.data ?? []) as unknown as { prescription: { patient_id: number } | { patient_id: number }[] | null }[]) {
    const p = Array.isArray(c.prescription) ? c.prescription[0] : c.prescription;
    if (p && ids.includes(p.patient_id)) hc.add(p.patient_id);
  }
  return { excluded, booked: set(appts.data), visited: set(visits.data), happyCall: hc };
}

/** 이 번호는 이미 다른 이름으로 등록되어 있다 — 화면에서 한 번 더 묻는다. */
export class NameMismatch extends Error {
  constructor(public existing: Patient, public wanted: string) {
    super(`이 번호는 ${existing.name}님으로 등록되어 있습니다. ${wanted}님과 같은 분이 맞는지 확인해 주세요.`);
  }
}

/**
 * 연락처를 넣으면 **환자등록에 올라간다**(사용자 2026-11-11: 재진콜에만 뜨면 안 되고 언제든 쓸 수 있게).
 * 같은 번호의 환자가 이미 있으면 그 환자와 잇고, 없으면 새 환자로 등록한 뒤 잇는다.
 * 이름이 다르면 NameMismatch — 가족 번호이거나 잘못 넣은 번호일 수 있어 사람이 확인한다.
 */
export async function linkPhone(r: Pick<Recontact, "id" | "patient_name" | "birth_hint">, phone: string, acceptDifferentName = false): Promise<Patient> {
  const digits = normalizePhone(phone);
  if (!isValidPhone(digits) || !digits.startsWith("01")) throw new Error("휴대폰 번호 10~11자리를 넣어 주세요.");
  const existing = await findPatientByPhone(digits);
  if (existing && existing.name.trim() !== r.patient_name.trim() && !acceptDifferentName) throw new NameMismatch(existing, r.patient_name);
  const patient =
    existing ??
    (await createPatient({
      name: r.patient_name,
      phone: digits,
      family_phone: "",
      family_note: "",
      condition: "general",
      memo: `${RECONTACT_NAME} 명단에서 등록${r.birth_hint ? ` (${r.birth_hint})` : ""}`,
      source: "",
      source_note: "",
    }));
  const { error } = await getSupabase().from("recontacts").update({ patient_id: patient.id, updated_at: new Date().toISOString() }).eq("id", r.id);
  if (error) fail("연락처 연결", error.message);
  return patient;
}

export type ImportResult = { added: number; duplicated: number; linked: number; problems: string[] };

/** 엑셀에서 읽은 명단을 넣는다. 같은 이름·같은 마지막 한약 날짜가 이미 있으면 건너뛴다. 연락처가 있는 줄은 바로 환자와 잇는다. */
export async function importRecontacts(rows: ImportRow[], staff: string): Promise<ImportResult> {
  const sb = getSupabase();
  const { data: cur, error: e0 } = await sb.from("recontacts").select("patient_name, last_herb_date");
  if (e0) fail("명단 확인", e0.message);
  const seen = new Set((cur ?? []).map((x) => `${x.patient_name}|${x.last_herb_date ?? ""}`));
  const result: ImportResult = { added: 0, duplicated: 0, linked: 0, problems: [] };
  for (const row of rows) {
    const key = `${row.patient_name}|${row.last_herb_date ?? ""}`;
    if (seen.has(key)) {
      result.duplicated += 1;
      continue;
    }
    seen.add(key);
    const { phone, ...rest } = row;
    const { data, error } = await sb.from("recontacts").insert({ ...rest, staff_name: staff }).select("id, patient_name, birth_hint").single();
    if (error) fail("명단 넣기", error.message);
    result.added += 1;
    if (phone) {
      try {
        await linkPhone(data as Pick<Recontact, "id" | "patient_name" | "birth_hint">, phone);
        result.linked += 1;
      } catch (e) {
        result.problems.push(`${row.patient_name}: ${(e as Error).message}`);
      }
    }
  }
  return result;
}

export async function updateRecontact(
  id: number,
  patch: Partial<Pick<Recontact, "doctor_note" | "draft_text" | "doctor_reply" | "memo" | "birth_hint" | "call_target" | "segment">>,
): Promise<void> {
  const { error } = await getSupabase().from("recontacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail("저장", error.message);
}

async function patch(id: number, values: Record<string, unknown>, action: string): Promise<void> {
  const { error } = await getSupabase().from("recontacts").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail(action, error.message);
}

/** 보냈음: 병원 휴대폰으로 보낸 뒤 누른다. 보낸 글을 그대로 남긴다. */
export function markSent(r: Pick<Recontact, "id" | "attempts">, staff: string, text: string): Promise<void> {
  return patch(r.id, { status: "sent", sent_at: new Date().toISOString(), sent_by: staff, sent_text: text, attempts: r.attempts + 1 }, "보냄 기록");
}
/** 답 옴: 환자가 보낸 답을 옮겨 적는다. */
export function markReplied(id: number, reply: string): Promise<void> {
  return patch(id, { status: "replied", reply_text: reply.trim(), replied_at: new Date().toISOString() }, "답 기록");
}
/** 전화함: 통화 결과를 한 줄로. 상태는 그대로(답이 오면 답 옴으로). */
export function markCalled(r: Pick<Recontact, "id" | "attempts">, result: string): Promise<void> {
  return patch(r.id, { called_at: new Date().toISOString(), call_result: result.trim() || "통화함", attempts: r.attempts + 1 }, "전화 기록");
}
/** 예약됨 · 거절 · 쉼 · 다시 올리기(todo) */
export function setRecontactStatus(id: number, status: RecontactStatus): Promise<void> {
  const reset = status === "todo" ? { sent_at: null, sent_by: null, called_at: null, call_result: null, reply_text: null, replied_at: null } : {};
  return patch(id, { status, ...reset }, "상태 바꾸기");
}
export async function deleteRecontact(id: number): Promise<void> {
  const { error } = await getSupabase().from("recontacts").delete().eq("id", id);
  if (error) fail("지우기", error.message);
}

/** 첫 화면 요약: 오늘 보낼 사람 수. 표가 없거나 실패하면 0. */
export async function countRecontactToday(today: string): Promise<number> {
  try {
    const [rows, settings] = await Promise.all([listRecontacts(), getRecontactSettings()]);
    if (rows.length === 0) return 0;
    const ctx = await recontactContext(rows, today);
    return todaysBatch(rows, ctx, settings.daily_cap, today).batch.length;
  } catch {
    return 0;
  }
}

/** 엑셀 파일의 시트들을 글자 표로 읽는다(브라우저). exceljs는 쓸 때만 불러온다. 파일은 서버로 올라가지 않는다. */
export async function readWorkbook(file: File): Promise<{ name: string; table: string[][] }[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const text = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown };
      if (o.richText) return o.richText.map((t) => t.text).join("");
      if (o.result !== undefined) return text(o.result);
      if (o.text !== undefined) return text(o.text);
      return "";
    }
    return String(v);
  };
  return wb.worksheets.map((ws) => {
    const table: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let i = 1; i <= ws.columnCount; i++) cells.push(text(row.getCell(i).value).trim());
      table.push(cells);
    });
    return { name: ws.name, table };
  });
}
