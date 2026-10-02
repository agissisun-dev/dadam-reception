import { getSupabase } from "./supabaseClient";
import { normalizePhone } from "./phone";
import type { Appointment, AppointmentKind, AppointmentSettings, ClinicDayOverride } from "./types";

function fail(action: string, message: string): never {
  throw new Error(`${action} 실패: ${message}`);
}

const DEFAULT_SETTINGS: Omit<AppointmentSettings, "clinic"> = {
  slot_minutes: 30,
  consult_per_slot: 1,
  treatment_per_slot: 3,
  notify_body: "{이름}님, {병원} 예약 안내드립니다. {날짜} {시간}에 뵙겠습니다. 변경이 필요하시면 전화 주세요.",
};

/** 병원 설정(칸 간격·정원·안내 문구). 없으면 기본값. */
export async function getSettings(): Promise<AppointmentSettings> {
  const { data, error } = await getSupabase().from("appointment_settings").select("*").maybeSingle();
  if (error) fail("예약 설정", error.message);
  return (data as AppointmentSettings | null) ?? { clinic: "S", ...DEFAULT_SETTINGS };
}

export async function saveSettings(patch: Partial<Omit<AppointmentSettings, "clinic">>): Promise<void> {
  const sb = getSupabase();
  const cur = await getSettings();
  const { error } = await sb.from("appointment_settings").upsert({ ...cur, ...patch });
  if (error) fail("예약 설정 저장", error.message);
}

export async function listDay(day: string): Promise<Appointment[]> {
  const { data, error } = await getSupabase().from("appointments").select("*").eq("day", day).order("time").order("kind").order("id");
  if (error) fail("예약 불러오기", error.message);
  return (data ?? []) as Appointment[];
}

/** from~to(포함) */
export async function listRange(from: string, to: string): Promise<Appointment[]> {
  const { data, error } = await getSupabase().from("appointments").select("*").gte("day", from).lte("day", to).order("day").order("time");
  if (error) fail("예약 불러오기", error.message);
  return (data ?? []) as Appointment[];
}

export async function listOverrides(from: string, to: string): Promise<ClinicDayOverride[]> {
  const { data, error } = await getSupabase().from("clinic_day_overrides").select("*").gte("day", from).lte("day", to);
  if (error) fail("진료일 바꾼 것", error.message);
  return (data ?? []) as ClinicDayOverride[];
}

export async function setOverride(o: Omit<ClinicDayOverride, "clinic"> & { clinic?: "S" | "N" }): Promise<void> {
  const row = { day: o.day, open: o.open, start_time: o.start_time, end_time: o.end_time, lunch_start: o.lunch_start, lunch_end: o.lunch_end, memo: o.memo };
  const { error } = await getSupabase().from("clinic_day_overrides").upsert(row, { onConflict: "clinic,day" });
  if (error) fail("진료일 바꾸기", error.message);
}

export async function clearOverride(day: string): Promise<void> {
  const { error } = await getSupabase().from("clinic_day_overrides").delete().eq("day", day);
  if (error) fail("진료일 되돌리기", error.message);
}

export type NewAppointment = {
  day: string;
  time: string;
  kind: AppointmentKind;
  patient_id: number | null;
  patient_name: string;
  phone?: string | null;
  source: Appointment["source"];
  memo?: string | null;
  naver_key?: string | null;
  happy_call_id?: number | null;
  ledger_entry_id?: number | null;
  staff_name: string;
};

export async function createAppointment(a: NewAppointment): Promise<Appointment> {
  const name = a.patient_name.trim();
  if (!name) throw new Error("이름을 적어 주세요.");
  const { data, error } = await getSupabase()
    .from("appointments")
    .insert({
      day: a.day,
      time: a.time,
      kind: a.kind,
      patient_id: a.patient_id,
      patient_name: name,
      phone: a.phone ? normalizePhone(a.phone) || null : null,
      source: a.source,
      memo: a.memo?.trim() || null,
      naver_key: a.naver_key ?? null,
      happy_call_id: a.happy_call_id ?? null,
      ledger_entry_id: a.ledger_entry_id ?? null,
      staff_name: a.staff_name,
    })
    .select("*")
    .single();
  if (error) fail("예약 저장", error.message.includes("naver_key") ? "이미 들어온 네이버 예약입니다." : error.message);
  return data as Appointment;
}

export async function updateAppointment(id: number, patch: Partial<Pick<Appointment, "day" | "time" | "kind" | "patient_name" | "patient_id" | "phone" | "memo">>): Promise<void> {
  const { error } = await getSupabase()
    .from("appointments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail("예약 고치기", error.message);
}

export async function setStatus(id: number, status: Appointment["status"], staff: string): Promise<void> {
  const { error } = await getSupabase()
    .from("appointments")
    .update({ status, staff_name: staff, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail("예약 상태", error.message);
}

export async function linkLedgerEntry(appointmentId: number, entryId: number): Promise<void> {
  const { error } = await getSupabase().from("appointments").update({ ledger_entry_id: entryId, status: "arrived" }).eq("id", appointmentId);
  if (error) fail("수납 연결", error.message);
}

export async function markNotified(id: number, note: string): Promise<void> {
  const { error } = await getSupabase().from("appointments").update({ notified_at: new Date().toISOString(), notify_note: note }).eq("id", id);
  if (error) fail("안내 기록", error.message);
}

export async function deleteAppointment(id: number): Promise<void> {
  const { error } = await getSupabase().from("appointments").delete().eq("id", id);
  if (error) fail("예약 지우기", error.message);
}

/** 오늘 예약 수(취소 제외)·내원 수. 첫 화면 요약용. 실패하면 0. */
export async function countToday(day: string): Promise<{ total: number; arrived: number }> {
  try {
    const list = await listDay(day);
    const live = list.filter((a) => a.status !== "cancelled");
    return { total: live.length, arrived: live.filter((a) => a.status === "arrived").length };
  } catch {
    return { total: 0, arrived: 0 };
  }
}
