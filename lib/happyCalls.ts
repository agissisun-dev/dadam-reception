import { getSupabase } from "./supabaseClient";
import { addDays, todayISO } from "./dates";
import type { ContactChannel, HappyCallRow } from "./types";

function fail(action: string, message: string): never {
  throw new Error(`${action} 실패: ${message}`);
}

export async function listOpenHappyCalls(): Promise<HappyCallRow[]> {
  const { data, error } = await getSupabase()
    .from("happy_calls")
    .select("*, prescription:prescriptions!inner(*, patient:patients!inner(*))")
    .eq("status", "pending")
    .is("prescription.patient.excluded_at", null)
    .order("due_date");
  if (error) fail("해피콜 명단", error.message);
  const rows = (data ?? []) as Omit<HappyCallRow, "prescription_seq">[];

  // 이 환자의 몇 번째 처방인지
  const patientIds = [...new Set(rows.map((r) => r.prescription.patient_id))];
  const seq = new Map<number, number>();
  if (patientIds.length > 0) {
    const { data: presc } = await getSupabase()
      .from("prescriptions")
      .select("id, patient_id, receive_date, created_at")
      .in("patient_id", patientIds)
      .order("receive_date")
      .order("created_at");
    const counter = new Map<number, number>();
    for (const p of presc ?? []) {
      const n = (counter.get(p.patient_id) ?? 0) + 1;
      counter.set(p.patient_id, n);
      seq.set(p.id, n);
    }
  }
  return rows.map((r) => ({ ...r, prescription_seq: seq.get(r.prescription_id) ?? 1 }));
}

export async function countOpenHappyCalls(today: string): Promise<{ today: number; overdue: number }> {
  const rows = await listOpenHappyCalls();
  return {
    today: rows.filter((r) => r.due_date === today).length,
    overdue: rows.filter((r) => r.due_date < today).length,
  };
}

async function log(
  happyCallId: number,
  action: string,
  staff: string,
  extra: { channel?: ContactChannel; memo?: string } = {},
) {
  const { error } = await getSupabase().from("contact_logs").insert({
    happy_call_id: happyCallId,
    action,
    channel: extra.channel ?? null,
    memo: extra.memo ?? null,
    staff_name: staff,
  });
  if (error) fail("기록 저장", error.message);
}

export async function markContacted(
  id: number,
  channel: ContactChannel,
  memo: string,
  staff: string,
): Promise<void> {
  const { error } = await getSupabase().from("happy_calls").update({ status: "contacted" }).eq("id", id);
  if (error) fail("연락함 처리", error.message);
  await log(id, "contacted", staff, { channel, memo });
}

export async function markMissed(id: number, staff: string): Promise<void> {
  const sb = getSupabase();
  const { data: cur, error: e0 } = await sb.from("happy_calls").select("missed_count").eq("id", id).single();
  if (e0) fail("안 받음 처리", e0.message);
  const { error } = await sb
    .from("happy_calls")
    .update({ due_date: addDays(todayISO(), 1), missed_count: (cur?.missed_count ?? 0) + 1 })
    .eq("id", id);
  if (error) fail("안 받음 처리", error.message);
  await log(id, "missed", staff);
}

export async function markRepresc(id: number, memo: string, staff: string): Promise<void> {
  const sb = getSupabase();
  const { data: hc, error: e0 } = await sb.from("happy_calls").select("prescription_id").eq("id", id).single();
  if (e0) fail("재처방 처리", e0.message);
  const pid = hc.prescription_id as number;
  await log(id, "represcribed", staff, { memo });
  const { error: e1 } = await sb
    .from("happy_calls")
    .update({ status: "closed" })
    .eq("prescription_id", pid)
    .eq("status", "pending");
  if (e1) fail("재처방 처리", e1.message);
  const { error: e2 } = await sb.from("prescriptions").update({ status: "closed" }).eq("id", pid);
  if (e2) fail("재처방 처리", e2.message);
}

export async function rescheduleHappyCall(id: number, newDate: string, staff: string): Promise<void> {
  const { error } = await getSupabase().from("happy_calls").update({ due_date: newDate }).eq("id", id);
  if (error) fail("날짜 변경", error.message);
  await log(id, "rescheduled", staff, { memo: `예정일 → ${newDate}` });
}

export async function resetHappyCallDate(id: number, staff: string): Promise<void> {
  const sb = getSupabase();
  const { data, error: e0 } = await sb.from("happy_calls").select("auto_due_date").eq("id", id).single();
  if (e0) fail("자동값 복원", e0.message);
  await rescheduleHappyCall(id, data.auto_due_date as string, staff);
}
