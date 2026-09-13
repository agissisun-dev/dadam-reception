import { getSupabase } from "./supabaseClient";
import { normalizePhone } from "./phone";
import { planHappyCalls } from "./happyCallRules";
import type {
  Condition,
  ContactLog,
  HappyCall,
  Patient,
  PatientInput,
  Prescription,
  PrescriptionInput,
} from "./types";

function fail(action: string, message: string): never {
  throw new Error(`${action} 실패: ${message}`);
}

function toRow(input: PatientInput) {
  return {
    name: input.name.trim(),
    phone: normalizePhone(input.phone),
    family_phone: input.family_phone ? normalizePhone(input.family_phone) : null,
    family_note: input.family_note.trim() || null,
    condition: input.condition,
    memo: input.memo.trim() || null,
  };
}

export async function findPatientByPhone(phone: string): Promise<Patient | null> {
  const { data, error } = await getSupabase()
    .from("patients")
    .select("*")
    .eq("phone", normalizePhone(phone))
    .maybeSingle();
  if (error) fail("환자 조회", error.message);
  return (data as Patient | null) ?? null;
}

export async function listPatients(
  opts: { q?: string; condition?: Condition | ""; includeExcluded?: boolean } = {},
): Promise<Patient[]> {
  let q = getSupabase().from("patients").select("*").order("name");
  if (opts.condition) q = q.eq("condition", opts.condition);
  if (!opts.includeExcluded) q = q.is("excluded_at", null);
  if (opts.q?.trim()) {
    const s = opts.q.trim();
    const digits = normalizePhone(s);
    q = digits ? q.or(`name.ilike.%${s}%,phone.like.%${digits}%`) : q.ilike("name", `%${s}%`);
  }
  const { data, error } = await q;
  if (error) fail("환자 목록", error.message);
  return (data ?? []) as Patient[];
}

export async function getPatient(id: number): Promise<Patient | null> {
  const { data, error } = await getSupabase().from("patients").select("*").eq("id", id).maybeSingle();
  if (error) fail("환자 불러오기", error.message);
  return (data as Patient | null) ?? null;
}

export async function createPatient(input: PatientInput): Promise<Patient> {
  const { data, error } = await getSupabase().from("patients").insert(toRow(input)).select("*").single();
  if (error) fail("환자 등록", error.message);
  return data as Patient;
}

export async function updatePatient(id: number, input: PatientInput): Promise<Patient> {
  const { data, error } = await getSupabase()
    .from("patients")
    .update(toRow(input))
    .eq("id", id)
    .select("*")
    .single();
  if (error) fail("환자 수정", error.message);
  return data as Patient;
}

export async function deletePatient(id: number): Promise<void> {
  const { error } = await getSupabase().from("patients").delete().eq("id", id);
  if (error) fail("환자 삭제", error.message);
}

export async function excludePatient(id: number, reason: string, staff: string): Promise<void> {
  const sb = getSupabase();
  const { error: e1 } = await sb
    .from("patients")
    .update({ excluded_at: new Date().toISOString(), excluded_reason: reason })
    .eq("id", id);
  if (e1) fail("연락 제외", e1.message);
  const { data: presc } = await sb.from("prescriptions").select("id").eq("patient_id", id);
  const ids = (presc ?? []).map((p) => p.id as number);
  if (ids.length === 0) return;
  const { data: calls } = await sb
    .from("happy_calls")
    .select("id")
    .in("prescription_id", ids)
    .eq("status", "pending");
  const callIds = (calls ?? []).map((c) => c.id as number);
  if (callIds.length === 0) return;
  await sb.from("happy_calls").update({ status: "closed" }).in("id", callIds);
  await sb
    .from("contact_logs")
    .insert(callIds.map((hid) => ({ happy_call_id: hid, action: "excluded", memo: reason, staff_name: staff })));
}

export async function unexcludePatient(id: number): Promise<void> {
  const { error } = await getSupabase()
    .from("patients")
    .update({ excluded_at: null, excluded_reason: null })
    .eq("id", id);
  if (error) fail("제외 해제", error.message);
}

export async function addPrescription(
  patientId: number,
  input: PrescriptionInput,
): Promise<{ prescription: Prescription; calls: HappyCall[] }> {
  const sb = getSupabase();
  const { data: p, error } = await sb
    .from("prescriptions")
    .insert({
      patient_id: patientId,
      receive_date: input.receive_date,
      days: input.days,
      packs: input.packs,
      per_day: input.per_day,
      memo: input.memo.trim() || null,
    })
    .select("*")
    .single();
  if (error) fail("처방 등록", error.message);
  const prescription = p as Prescription;
  const plan = planHappyCalls(prescription.receive_date, prescription.days);
  const { data: calls, error: e2 } = await sb
    .from("happy_calls")
    .insert(
      plan.map((c) => ({
        prescription_id: prescription.id,
        round: c.round,
        due_date: c.due_date,
        auto_due_date: c.due_date,
        note: c.note,
      })),
    )
    .select("*");
  if (e2) fail("해피콜 생성", e2.message);
  return { prescription, calls: (calls ?? []) as HappyCall[] };
}

export type PrescriptionWithCalls = Prescription & {
  happy_calls: (HappyCall & { contact_logs: ContactLog[] })[];
};

export async function listPrescriptionsWithCalls(patientId: number): Promise<PrescriptionWithCalls[]> {
  const { data, error } = await getSupabase()
    .from("prescriptions")
    .select("*, happy_calls(*, contact_logs(*))")
    .eq("patient_id", patientId)
    .order("receive_date", { ascending: false });
  if (error) fail("처방 이력", error.message);
  return (data ?? []) as PrescriptionWithCalls[];
}
