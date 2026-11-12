import { getSupabase } from "./supabaseClient";
import { normalizePhone } from "./phone";
import { defaultRecontactSettings, RECONTACT_NAME, todaysBatch, visitedSince, type ImportRow, type RecontactContext } from "./recontactRules";
import type { Patient, Recontact, RecontactRow, RecontactSettings, RecontactStatus } from "./types";

type Clinic = "S" | "N";
type ScopedPatient = Patient & { clinic: Clinic };

function fail(action: string, message: string): never {
  if (/recontact/.test(message) && /(does not exist|Could not find|schema cache)/i.test(message)) {
    throw new Error(`${RECONTACT_NAME} 표가 아직 없습니다. Supabase에서 schema-v12-recontact-s-only.sql을 먼저 실행해 주세요.`);
  }
  throw new Error(`${action} 실패: ${message}`);
}

/** Never cache a clinic or fall back to S on a missing mapping/session. */
async function requireClinic(): Promise<Clinic> {
  const { data, error } = await getSupabase().rpc("current_clinic");
  if (error) fail("병원 확인", error.message);
  if (data !== "S" && data !== "N") throw new Error("병원에 연결된 계정으로 다시 로그인해 주세요.");
  if (data !== "S") throw new Error(`${RECONTACT_NAME}은 현재 다담에스한의원에서만 사용할 수 있습니다.`);
  return data;
}

/** UI visibility uses the same fresh, fail-closed check as all data operations. */
export async function canUseRecontacts(): Promise<boolean> {
  try {
    await requireClinic();
    return true;
  } catch {
    return false;
  }
}

async function settingsFor(clinic: Clinic): Promise<RecontactSettings> {
  const { data, error } = await getSupabase().from("recontact_settings").select("*").eq("clinic", clinic).maybeSingle();
  if (error) fail("설정 불러오기", error.message);
  if (data && data.clinic !== clinic) throw new Error("설정의 병원을 확인해 주세요.");
  return { ...defaultRecontactSettings(clinic), ...Object.fromEntries(Object.entries(data ?? {}).filter(([, v]) => v !== null && v !== undefined)), clinic } as RecontactSettings;
}

export async function getRecontactSettings(): Promise<RecontactSettings> {
  return settingsFor(await requireClinic());
}

export async function saveRecontactSettings(patch: Partial<Omit<RecontactSettings, "clinic">>): Promise<RecontactSettings> {
  const clinic = await requireClinic();
  const cur = await settingsFor(clinic);
  // Whitelist editable fields; a runtime caller cannot inject a different clinic.
  const next = { clinic, daily_cap: patch.daily_cap ?? cur.daily_cap, body_a: patch.body_a ?? cur.body_a,
    body_b: patch.body_b ?? cur.body_b, body_vip: patch.body_vip ?? cur.body_vip,
    body_once: patch.body_once ?? cur.body_once, body_reply: patch.body_reply ?? cur.body_reply,
    body_missed: patch.body_missed ?? cur.body_missed };
  const { data, error } = await getSupabase().from("recontact_settings").upsert(next, { onConflict: "clinic" }).select("*").single();
  if (error) fail("설정 저장", error.message);
  if (!data || data.clinic !== clinic) throw new Error("설정 저장 결과를 확인하지 못했습니다.");
  return data as RecontactSettings;
}

export async function listRecontacts(): Promise<RecontactRow[]> {
  const clinic = await requireClinic();
  const { data, error } = await getSupabase().from("recontacts")
    .select("*, patient:patients(id,clinic,name,phone,excluded_at)").eq("clinic", clinic).order("id");
  if (error) fail("명단 불러오기", error.message);
  const rows = (data ?? []) as RecontactRow[];
  if (rows.some((r) => r.clinic !== clinic || (r.patient && (r.patient.clinic !== clinic || r.patient.id !== r.patient_id)))) {
    throw new Error("명단의 환자·병원 연결을 확인해 주세요.");
  }
  return rows;
}

/** Every suppression source is mandatory. Missing/hidden patients fail closed. */
export async function recontactContext(rows: RecontactRow[], today: string): Promise<RecontactContext> {
  const clinic = await requireClinic();
  if (rows.some((r) => r.clinic !== clinic)) throw new Error("명단의 병원이 현재 계정과 다릅니다.");
  const ids = [...new Set(rows.map((r) => r.patient_id).filter((id): id is number => id !== null))];
  const excluded = new Set<number>();
  if (!ids.length) return { excluded, booked: new Set(), visited: new Set(), happyCall: new Set() };
  const sb = getSupabase();
  // Only actual recent herb prescriptions suppress recontact, never acupuncture/ledger visits.
  const [patients, appts, recentHerbs, calls] = await Promise.all([
    sb.from("patients").select("id,clinic,phone,excluded_at").eq("clinic", clinic).in("id", ids),
    sb.from("appointments").select("patient_id").eq("clinic", clinic).gte("day", today).eq("status", "booked").in("patient_id", ids),
    sb.from("prescriptions").select("patient_id").eq("clinic", clinic).gte("receive_date", visitedSince(today)).in("patient_id", ids),
    sb.from("happy_calls").select("prescription:prescriptions!inner(patient_id,clinic)").eq("clinic", clinic)
      .eq("prescription.clinic", clinic).in("prescription.patient_id", ids).eq("status", "pending"),
  ]);
  for (const result of [patients, appts, recentHerbs, calls]) if (result.error) fail("연락 대기 사유 확인", result.error.message);
  const fresh = new Map((patients.data ?? []).map((p) => [p.id as number, p]));
  for (const id of ids) {
    const p = fresh.get(id);
    if (!p || p.clinic !== clinic || p.excluded_at || !/^01[016789]\d{7,8}$/.test(normalizePhone(p.phone ?? ""))) excluded.add(id);
  }
  const set = (list: { patient_id: number | null }[] | null) => new Set((list ?? []).map((x) => x.patient_id).filter((id): id is number => id !== null));
  const happyCall = new Set<number>();
  type CallJoin = { prescription: { patient_id: number; clinic: Clinic } | { patient_id: number; clinic: Clinic }[] | null };
  for (const c of (calls.data ?? []) as unknown as CallJoin[]) {
    const prescriptions = Array.isArray(c.prescription) ? c.prescription : c.prescription ? [c.prescription] : [];
    for (const p of prescriptions) {
      if (p.clinic !== clinic) throw new Error("해피콜의 병원 연결을 확인해 주세요.");
      if (ids.includes(p.patient_id)) happyCall.add(p.patient_id);
    }
  }
  // Keep the legacy visited key for compatibility: it means recent actual herb prescriptions only.
  return { excluded, booked: set(appts.data), visited: set(recentHerbs.data), happyCall };
}

export class NameMismatch extends Error {
  constructor(public existing: Patient, public wanted: string) {
    super(`이 번호는 ${existing.name}님으로 등록되어 있습니다. ${wanted}님과 같은 분이 맞는지 확인해 주세요.`);
    this.name = "NameMismatch";
  }
}

export class MissingPatient extends Error {
  constructor(public wanted: string) {
    super(`${wanted}님의 등록된 환자를 찾지 못했습니다. 새 환자 등록은 별도 확인이 필요합니다.`);
    this.name = "MissingPatient";
  }
}

async function patientByPhone(clinic: Clinic, phone: string): Promise<ScopedPatient | null> {
  const { data, error } = await getSupabase().from("patients").select("*").eq("clinic", clinic).eq("phone", phone).maybeSingle();
  if (error) fail("환자 조회", error.message);
  if (data && data.clinic !== clinic) throw new Error("환자의 병원을 확인해 주세요.");
  return data as ScopedPatient | null;
}

/** UI checks are advisory; the RPC locks, verifies and links/creates in one transaction. */
export async function linkPhone(r: Pick<Recontact, "id" | "patient_name" | "birth_hint">, phone: string, acceptDifferentName = false, allowCreate = false): Promise<Patient> {
  const clinic = await requireClinic();
  const digits = normalizePhone(phone);
  if (!/^01[016789]\d{7,8}$/.test(digits)) throw new Error("올바른 휴대폰 번호 10~11자리를 넣어 주세요.");
  const existing = await patientByPhone(clinic, digits);
  if (existing && existing.name.trim() !== r.patient_name.trim() && !acceptDifferentName) throw new NameMismatch(existing, r.patient_name);
  // The RPC also matches legacy formatted numbers. Do not turn an advisory miss
  // into an early MissingPatient, which would incorrectly offer registration.
  const { data, error } = await getSupabase().rpc("recontact_link_phone", {
    p_id: r.id, p_phone: digits, p_accept_different_name: acceptDifferentName, p_allow_create: allowCreate,
  });
  if (error) {
    if (/PATIENT_MISSING/.test(error.message)) throw new MissingPatient(r.patient_name);
    if (/NAME_MISMATCH/.test(error.message)) {
      let current: ScopedPatient | null = null;
      try {
        const detail: unknown = JSON.parse(error.details ?? "null");
        if (detail && typeof detail === "object" && "clinic" in detail && detail.clinic === clinic
          && "id" in detail && typeof detail.id === "number" && "name" in detail && typeof detail.name === "string"
          && "phone" in detail && typeof detail.phone === "string" && normalizePhone(detail.phone) === digits) current = detail as ScopedPatient;
      } catch { /* Fall back to a fresh, scoped lookup below. */ }
      current ??= await patientByPhone(clinic, digits);
      if (current) throw new NameMismatch(current, r.patient_name);
    }
    fail("연락처 연결", error.message);
  }
  const linked = data as { patient: ScopedPatient; recontact: Recontact } | null;
  if (!linked?.patient || !linked.recontact || linked.patient.clinic !== clinic || linked.recontact.clinic !== clinic
    || linked.recontact.id !== r.id || linked.recontact.patient_id !== linked.patient.id) throw new Error("연락처 연결 결과를 확인하지 못했습니다.");
  return linked.patient;
}

export type ContactPurpose = "initial" | "followup" | "call";
export async function assertRecontactContact(id: number, purpose: ContactPurpose): Promise<void> {
  await requireClinic();
  const { error } = await getSupabase().rpc("recontact_assert_contact", { p_id: id, p_purpose: purpose });
  if (error) fail("연락 가능 여부 확인", error.message);
}

export async function optOutRecontact(id: number, reason: string): Promise<void> {
  await requireClinic();
  const { error } = await getSupabase().rpc("recontact_opt_out", { p_id: id, p_reason: reason.trim() || "재진콜 연락 제외" });
  if (error) fail("연락 제외", error.message);
}

export type ImportResult = { added: number; duplicated: number; linked: number; problems: string[] };

/** A source row is an import identity, never a patient identity. */
async function importKey(sourceIdentity: string, rowIndex: number): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("명단 식별을 위한 보안 연결(HTTPS)이 필요합니다.");
  const bytes = new TextEncoder().encode(JSON.stringify(["recontact-import-v1", sourceIdentity, rowIndex]));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type ImportCandidate = Pick<Recontact, "id" | "patient_name" | "birth_hint" | "patient_id" | "clinic">;

/** Inserts only candidates. Reimports never overwrite a candidate or patient. */
export async function importRecontacts(rows: ImportRow[], staff: string, sourceIdentity = ""): Promise<ImportResult> {
  const clinic = await requireClinic();
  const sb = getSupabase();
  const result: ImportResult = { added: 0, duplicated: 0, linked: 0, problems: [] };
  const columns = "id,clinic,patient_name,birth_hint,patient_id";
  const find = async (key: string): Promise<ImportCandidate | null> => {
    const { data, error } = await sb.from("recontacts").select(columns).eq("clinic", clinic).eq("source_key", key).maybeSingle();
    if (error) fail("명단 확인", error.message);
    return data as ImportCandidate | null;
  };
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const key = await importKey(sourceIdentity, index);
    let candidate = await find(key);
    let duplicate = candidate !== null;
    if (!candidate) {
      const { data, error } = await sb.from("recontacts").insert({
        clinic, source_key: key, staff_name: staff, patient_name: row.patient_name,
        birth_hint: row.birth_hint, segment: row.segment, call_target: row.call_target,
        herb_count: row.herb_count, last_herb_date: row.last_herb_date,
        avg_interval_days: row.avg_interval_days, herb_kind: row.herb_kind,
        doctor_note: row.doctor_note, memo: row.memo, variant: row.variant,
      }).select(columns).single();
      if (error) {
        if (error.code !== "23505") fail("명단 넣기", error.message);
        candidate = await find(key);
        if (!candidate) fail("명단 넣기", error.message);
        duplicate = true;
      } else {
        candidate = data as ImportCandidate | null;
        if (!candidate) throw new Error("명단 등록 결과를 확인하지 못했습니다.");
        result.added += 1;
      }
    }
    if (candidate.clinic !== clinic) throw new Error("명단의 병원을 확인해 주세요.");
    if (duplicate) {
      result.duplicated += 1;
      if (candidate.patient_name.trim() !== row.patient_name.trim()) result.problems.push(`${row.patient_name}: 같은 파일·줄에 다른 이름이 있어 기존 명단을 보존했습니다.`);
      // Even linking could alter a previously reviewed candidate: leave it intact.
      continue;
    }
    if (row.phone) {
      try {
        await linkPhone(candidate, row.phone, false, false);
        result.linked += 1;
      } catch (e) {
        result.problems.push(`${row.patient_name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return result;
}

type EditableRecontact = Partial<Pick<Recontact, "doctor_note" | "draft_text" | "doctor_reply" | "memo" | "birth_hint" | "call_target" | "segment">>;
export async function updateRecontact(id: number, values: EditableRecontact): Promise<void> {
  const safe: EditableRecontact = {};
  for (const key of ["doctor_note", "draft_text", "doctor_reply", "memo", "birth_hint", "call_target", "segment"] as const) {
    if (Object.prototype.hasOwnProperty.call(values, key)) Object.assign(safe, { [key]: values[key] });
  }
  return patch(id, safe, "저장");
}

async function patch(id: number, values: Record<string, unknown>, action: string): Promise<void> {
  const clinic = await requireClinic();
  const { data, error } = await getSupabase().from("recontacts").update({ ...values, updated_at: new Date().toISOString() })
    .eq("clinic", clinic).eq("id", id).select("id,clinic").single();
  if (error) fail(action, error.message);
  if (!data || data.id !== id || data.clinic !== clinic) fail(action, "명단이 없거나 권한이 없습니다.");
}

/** Record a manually completed action only. These RPCs never send messages. */
export async function markSent(r: Pick<Recontact, "id" | "attempts">, staff: string, text: string): Promise<void> {
  const clinic = await requireClinic();
  const { data, error } = await getSupabase().rpc("recontact_record_sent", { p_id: r.id, p_expected_attempts: r.attempts, p_staff: staff, p_text: text });
  if (error) fail("보냄 기록", error.message);
  if (!data || data.id !== r.id || data.clinic !== clinic) fail("보냄 기록", "기록 결과를 확인하지 못했습니다.");
}

export function markReplied(id: number, reply: string): Promise<void> {
  return patch(id, { status: "replied", reply_text: reply.trim(), replied_at: new Date().toISOString() }, "답 기록");
}

export async function markCalled(r: Pick<Recontact, "id" | "attempts">, result: string): Promise<void> {
  const clinic = await requireClinic();
  const { data, error } = await getSupabase().rpc("recontact_record_call", { p_id: r.id, p_expected_attempts: r.attempts, p_result: result.trim() || "통화함" });
  if (error) fail("전화 기록", error.message);
  if (!data || data.id !== r.id || data.clinic !== clinic) fail("전화 기록", "기록 결과를 확인하지 못했습니다.");
}

/** Status changes never erase send/call timestamps, texts or attempt history. */
export function setRecontactStatus(id: number, status: RecontactStatus): Promise<void> {
  return patch(id, { status }, "상태 바꾸기");
}

/** Archive, never DELETE: retain source identity and all contact audit history. */
export function deleteRecontact(id: number): Promise<void> {
  return patch(id, { status: "rest" }, "보관");
}

/** Dashboard only: lookup failures suppress the count, never enable contact. */
export async function countRecontactToday(today: string): Promise<number> {
  try {
    const [rows, settings] = await Promise.all([listRecontacts(), getRecontactSettings()]);
    if (!rows.length) return 0;
    const ctx = await recontactContext(rows, today);
    return todaysBatch(rows, ctx, settings.daily_cap, today).batch.length;
  } catch { return 0; }
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
