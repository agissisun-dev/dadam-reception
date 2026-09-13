import { getSupabase } from "./supabaseClient";
import { todayISO } from "./dates";
import { consecutiveNoReply, nextWeeklyDate } from "./weeklyRules";
import type { Patient, WeeklyAction, WeeklyContact, WeeklyRow } from "./types";

function fail(action: string, message: string): never {
  throw new Error(`${action} 실패: ${message}`);
}

/** 이번 주 대상: active 이고 다음 발송일이 weekEnd 이하. 제외 환자 제외. */
export async function listWeeklyTargets(weekEnd: string): Promise<WeeklyRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("patients")
    .select("*")
    .eq("weekly_status", "active")
    .is("excluded_at", null)
    .lte("weekly_next_date", weekEnd)
    .order("weekly_next_date");
  if (error) fail("주간 관리 명단", error.message);
  const patients = (data ?? []) as Patient[];
  if (patients.length === 0) return [];

  const ids = patients.map((p) => p.id);
  const { data: logs, error: e2 } = await sb
    .from("weekly_contacts")
    .select("*")
    .in("patient_id", ids)
    .order("created_at", { ascending: false });
  if (e2) fail("주간 관리 기록", e2.message);
  const byPatient = new Map<number, WeeklyContact[]>();
  for (const c of (logs ?? []) as WeeklyContact[]) {
    byPatient.set(c.patient_id, [...(byPatient.get(c.patient_id) ?? []), c]);
  }
  return patients.map((p) => {
    const list = byPatient.get(p.id) ?? [];
    return {
      ...p,
      last: list[0] ?? null,
      lastReviewed: list.find((c) => c.reply_status === "reviewed" && c.doctor_note) ?? null,
      noReplyStreak: consecutiveNoReply(list),
    };
  });
}

export type WaitingItem = WeeklyContact & { patient: Patient };

export async function listWaitingDoctor(): Promise<WaitingItem[]> {
  const { data, error } = await getSupabase()
    .from("weekly_contacts")
    .select("*, patient:patients!inner(*)")
    .eq("reply_status", "waiting_doctor")
    .order("created_at");
  if (error) fail("확인 대기 목록", error.message);
  return (data ?? []) as WaitingItem[];
}

export async function countWeekly(weekEnd: string): Promise<{ thisWeek: number; waiting: number }> {
  const [targets, waiting] = await Promise.all([listWeeklyTargets(weekEnd), listWaitingDoctor()]);
  return { thisWeek: targets.length, waiting: waiting.length };
}

export async function startWeekly(patientId: number, weekday: number, interval: number): Promise<void> {
  const today = todayISO();
  const { error } = await getSupabase()
    .from("patients")
    .update({
      weekly_status: "active",
      weekly_weekday: weekday,
      weekly_interval: interval,
      weekly_next_date: nextWeeklyDate(today, weekday, interval, true),
      weekly_started_at: today,
    })
    .eq("id", patientId);
  if (error) fail("주간 관리 시작", error.message);
}

/** 휴면에서 다시 시작: 회차는 이어감, 다음 발송일만 다시 계산 */
export async function resumeWeekly(patientId: number): Promise<void> {
  const sb = getSupabase();
  const { data: p, error: e0 } = await sb.from("patients").select("weekly_weekday, weekly_interval").eq("id", patientId).single();
  if (e0) fail("다시 시작", e0.message);
  const { error } = await sb
    .from("patients")
    .update({
      weekly_status: "active",
      weekly_next_date: nextWeeklyDate(todayISO(), p.weekly_weekday, p.weekly_interval, true),
    })
    .eq("id", patientId);
  if (error) fail("다시 시작", error.message);
}

export async function stopWeekly(patientId: number): Promise<void> {
  const { error } = await getSupabase()
    .from("patients")
    .update({ weekly_status: "off", weekly_next_date: null })
    .eq("id", patientId);
  if (error) fail("주간 관리 중지", error.message);
}

/**
 * 이번 주 처리. sent → 회차 +1. 모두 다음 발송일 재계산.
 * dormant → 상태 휴면, 명단에서 빠짐. excluded는 patients.excludePatient에서 처리.
 */
export async function recordWeekly(
  patient: Patient,
  action: Exclude<WeeklyAction, "excluded">,
  staff: string,
  opts: { message?: string } = {},
): Promise<void> {
  const sb = getSupabase();
  const planned = patient.weekly_next_date ?? todayISO();
  const { error: e1 } = await sb.from("weekly_contacts").insert({
    patient_id: patient.id,
    round: patient.weekly_round,
    planned_date: planned,
    action,
    message: action === "sent" ? (opts.message ?? null) : null,
    staff_name: staff,
  });
  if (e1) fail("주간 관리 기록", e1.message);

  const update: Record<string, unknown> =
    action === "dormant"
      ? { weekly_status: "dormant" }
      : {
          weekly_round: action === "sent" ? patient.weekly_round + 1 : patient.weekly_round,
          weekly_next_date: nextWeeklyDate(planned, patient.weekly_weekday, patient.weekly_interval, false),
        };
  const { error: e2 } = await sb.from("patients").update(update).eq("id", patient.id);
  if (e2) fail("주간 관리 갱신", e2.message);
}

export async function recordReply(contactId: number, reply: string, askDoctor: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from("weekly_contacts")
    .update({ patient_reply: reply, reply_status: askDoctor ? "waiting_doctor" : "none" })
    .eq("id", contactId);
  if (error) fail("답변 기록", error.message);
}

export async function reviewReply(contactId: number, doctorNote: string): Promise<void> {
  const { error } = await getSupabase()
    .from("weekly_contacts")
    .update({ doctor_note: doctorNote, reply_status: "reviewed" })
    .eq("id", contactId);
  if (error) fail("원장 확인", error.message);
}

export async function listWeeklyContacts(patientId: number): Promise<WeeklyContact[]> {
  const { data, error } = await getSupabase()
    .from("weekly_contacts")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) fail("주간 관리 기록", error.message);
  return (data ?? []) as WeeklyContact[];
}
