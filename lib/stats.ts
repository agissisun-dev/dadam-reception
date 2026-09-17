import { getSupabase } from "./supabaseClient";
import type { ContactLogLite, HappyCallLite, PrescriptionLite, WeeklyContactLite } from "./statsRules";

function fail(action: string, message: string): never {
  throw new Error(`${action} 실패: ${message}`);
}

/** 한 번에 1,000줄까지만 오므로 다 받을 때까지 이어서 받는다. */
async function fetchAll<T>(table: string, columns: string, label: string): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getSupabase()
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) fail(label, error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export type StatsData = {
  patients: { created_at: string }[];
  prescriptions: PrescriptionLite[];
  calls: HappyCallLite[];
  logs: ContactLogLite[];
  weekly: WeeklyContactLite[];
};

export async function loadStats(): Promise<StatsData> {
  const [patients, prescriptions, calls, logs, weekly] = await Promise.all([
    fetchAll<{ created_at: string }>("patients", "id, created_at", "환자 수"),
    fetchAll<PrescriptionLite>("prescriptions", "id, patient_id, receive_date, packs, days, per_day", "처방"),
    fetchAll<HappyCallLite>("happy_calls", "id, round, due_date, status, created_at", "해피콜"),
    fetchAll<ContactLogLite>("contact_logs", "id, happy_call_id, action, created_at", "해피콜 기록"),
    fetchAll<WeeklyContactLite>("weekly_contacts", "id, action, planned_date, patient_reply", "주간 관리 기록"),
  ]);
  return { patients, prescriptions, calls, logs, weekly };
}
